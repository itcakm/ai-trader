/**
 * Tenant Isolation Middleware
 * 
 * Provides middleware for enforcing tenant isolation at the API layer.
 * Extracts tenant ID from JWT (not headers) and validates resource access.
 * 
 * Requirements: 5.1, 5.4, 5.5
 * - Extract tenantId from JWT (not headers)
 * - Validate resource tenantId matches user tenantId
 * - Log isolation violations
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { UserContext, AUTH_ERROR_CODES, ROLES } from '../types/auth';
import { TenantContext, TenantAccessDeniedError } from '../db/access';
import { AuthenticatedEvent, AuthenticatedHandler, LambdaHandler } from './require-auth';
import { validateRequest, isValidationSuccess } from './jwt-validator';
import { createMissingTokenResponse, createInvalidTokenResponse, createForbiddenResponse } from './auth-errors';

/**
 * Security event types for tenant isolation logging
 */
export const TENANT_SECURITY_EVENTS = {
  ISOLATION_VIOLATION: 'TENANT_ISOLATION_VIOLATION',
  CROSS_TENANT_ACCESS: 'CROSS_TENANT_ACCESS',
  SUPER_ADMIN_ACCESS: 'SUPER_ADMIN_ACCESS',
  MISSING_TENANT_ID: 'MISSING_TENANT_ID',
} as const;

export type TenantSecurityEventType = typeof TENANT_SECURITY_EVENTS[keyof typeof TENANT_SECURITY_EVENTS];

/**
 * Tenant security event for logging
 */
export interface TenantSecurityEvent {
  type: TenantSecurityEventType;
  timestamp: string;
  userId: string;
  userTenantId: string;
  targetTenantId?: string;
  resourceType?: string;
  resourceId?: string;
  ip: string;
  userAgent: string;
  allowed: boolean;
  reason?: string;
}

/**
 * Extended authenticated event with tenant context
 */
export interface TenantIsolatedEvent extends AuthenticatedEvent {
  tenantContext: TenantContext;
}

/**
 * Handler function type for tenant-isolated endpoints
 */
export type TenantIsolatedHandler = (
  event: TenantIsolatedEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

/**
 * Options for tenant isolation middleware
 */
export interface TenantIsolationOptions {
  /**
   * Allow SUPER_ADMIN to access any tenant's resources
   * Default: true
   */
  allowSuperAdminBypass?: boolean;
  
  /**
   * Custom handler for isolation violations
   */
  onViolation?: (event: TenantSecurityEvent) => void;
}

/**
 * Logs a tenant security event to CloudWatch
 * Requirements: 5.5
 */
export function logTenantSecurityEvent(event: TenantSecurityEvent): void {
  console.log(JSON.stringify({
    logType: 'TENANT_SECURITY',
    ...event,
  }));
}

/**
 * Creates a TenantContext from UserContext
 * Requirements: 5.1
 * 
 * @param user - The user context from JWT validation
 * @returns TenantContext for database operations
 */
export function createTenantContext(user: UserContext): TenantContext {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    isSuperAdmin: user.roles.includes(ROLES.SUPER_ADMIN),
  };
}

/**
 * Extracts client IP from API Gateway event
 */
function getClientIp(event: APIGatewayProxyEvent): string {
  return event.requestContext?.identity?.sourceIp || 'unknown';
}

/**
 * Extracts user agent from API Gateway event
 */
function getUserAgent(event: APIGatewayProxyEvent): string {
  return event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown';
}

/**
 * Validates that a user has access to a specific tenant's resources
 * Requirements: 5.4, 5.5, 5.7
 * 
 * @param user - The user context from JWT
 * @param targetTenantId - The tenant ID of the resource being accessed
 * @param event - The API Gateway event for logging
 * @param options - Tenant isolation options
 * @returns true if access is allowed, false otherwise
 */
export function validateTenantAccess(
  user: UserContext,
  targetTenantId: string,
  event: APIGatewayProxyEvent,
  options?: TenantIsolationOptions
): boolean {
  const allowSuperAdminBypass = options?.allowSuperAdminBypass ?? true;
  const isSuperAdmin = user.roles.includes(ROLES.SUPER_ADMIN);
  
  // Check if user's tenant matches target tenant
  if (user.tenantId === targetTenantId) {
    return true;
  }
  
  // Check for SUPER_ADMIN bypass
  if (allowSuperAdminBypass && isSuperAdmin) {
    // Log super admin cross-tenant access
    const securityEvent: TenantSecurityEvent = {
      type: TENANT_SECURITY_EVENTS.SUPER_ADMIN_ACCESS,
      timestamp: new Date().toISOString(),
      userId: user.userId,
      userTenantId: user.tenantId,
      targetTenantId,
      ip: getClientIp(event),
      userAgent: getUserAgent(event),
      allowed: true,
      reason: 'SUPER_ADMIN cross-tenant access',
    };
    
    logTenantSecurityEvent(securityEvent);
    options?.onViolation?.(securityEvent);
    
    return true;
  }
  
  // Log isolation violation
  const securityEvent: TenantSecurityEvent = {
    type: TENANT_SECURITY_EVENTS.ISOLATION_VIOLATION,
    timestamp: new Date().toISOString(),
    userId: user.userId,
    userTenantId: user.tenantId,
    targetTenantId,
    ip: getClientIp(event),
    userAgent: getUserAgent(event),
    allowed: false,
    reason: 'Tenant ID mismatch',
  };
  
  logTenantSecurityEvent(securityEvent);
  options?.onViolation?.(securityEvent);
  
  return false;
}

/**
 * Validates resource ownership against user's tenant
 * Requirements: 5.3, 5.4, 5.5
 * 
 * @param user - The user context from JWT
 * @param resource - The resource being accessed (must have tenantId property)
 * @param resourceType - Type of resource for logging
 * @param resourceId - ID of resource for logging
 * @param event - The API Gateway event for logging
 * @param options - Tenant isolation options
 * @throws TenantAccessDeniedError if access is denied
 */
export function validateResourceOwnership<T extends { tenantId: string }>(
  user: UserContext,
  resource: T,
  resourceType: string,
  resourceId: string,
  event: APIGatewayProxyEvent,
  options?: TenantIsolationOptions
): void {
  if (!validateTenantAccess(user, resource.tenantId, event, options)) {
    // Log detailed violation
    const securityEvent: TenantSecurityEvent = {
      type: TENANT_SECURITY_EVENTS.ISOLATION_VIOLATION,
      timestamp: new Date().toISOString(),
      userId: user.userId,
      userTenantId: user.tenantId,
      targetTenantId: resource.tenantId,
      resourceType,
      resourceId,
      ip: getClientIp(event),
      userAgent: getUserAgent(event),
      allowed: false,
      reason: `Attempted access to ${resourceType} belonging to different tenant`,
    };
    
    logTenantSecurityEvent(securityEvent);
    options?.onViolation?.(securityEvent);
    
    throw new TenantAccessDeniedError(user.tenantId, resourceType, resource.tenantId);
  }
}

/**
 * Higher-order function that wraps a handler to enforce tenant isolation
 * Requirements: 5.1, 5.4, 5.5
 * 
 * Validates authentication and ensures the user has a valid tenant ID.
 * Attaches TenantContext to the event for use in handlers.
 * 
 * @param handler - The handler function to wrap
 * @param options - Tenant isolation options
 * @returns A wrapped handler that enforces tenant isolation
 * 
 * @example
 * ```typescript
 * export const handler = requireTenantIsolation(async (event, context) => {
 *   const { tenantContext } = event;
 *   // Use tenantContext.tenantId for database queries
 *   const strategies = await TenantAccess.strategies.list(tenantContext);
 *   return { statusCode: 200, body: JSON.stringify(strategies) };
 * });
 * ```
 */
export function requireTenantIsolation(
  handler: TenantIsolatedHandler,
  options?: TenantIsolationOptions
): LambdaHandler {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    // Check for Authorization header first
    const authHeader = event.headers['Authorization'] || event.headers['authorization'];
    if (!authHeader) {
      return createMissingTokenResponse();
    }

    // Validate the token
    const validationResult = await validateRequest(event);

    if (!isValidationSuccess(validationResult)) {
      const errorCode = validationResult.error?.code || AUTH_ERROR_CODES.INVALID_TOKEN;
      return createInvalidTokenResponse(errorCode, validationResult.error?.message);
    }

    const user = validationResult.user;

    // Validate tenant ID is present in JWT
    // Requirements: 5.1 - Extract tenantId from JWT (not headers)
    if (!user.tenantId) {
      // Log missing tenant ID
      const securityEvent: TenantSecurityEvent = {
        type: TENANT_SECURITY_EVENTS.MISSING_TENANT_ID,
        timestamp: new Date().toISOString(),
        userId: user.userId,
        userTenantId: '',
        ip: getClientIp(event),
        userAgent: getUserAgent(event),
        allowed: false,
        reason: 'JWT missing tenant_id claim',
      };
      
      logTenantSecurityEvent(securityEvent);
      options?.onViolation?.(securityEvent);
      
      return createForbiddenResponse(AUTH_ERROR_CODES.TENANT_MISMATCH);
    }

    // Create tenant context from user
    const tenantContext = createTenantContext(user);

    // Attach user and tenant context to event
    const isolatedEvent: TenantIsolatedEvent = {
      ...event,
      user,
      tenantContext,
    };

    // Invoke the wrapped handler
    return handler(isolatedEvent, context);
  };
}

/**
 * Extracts tenant context from an event
 * Throws an error if the event doesn't have tenant context
 * 
 * @param event - The API Gateway event (should be tenant-isolated)
 * @returns The tenant context
 * @throws Error if tenant context is not present
 */
export function getTenantContext(event: APIGatewayProxyEvent): TenantContext {
  const tenantContext = (event as TenantIsolatedEvent).tenantContext;
  if (!tenantContext) {
    throw new Error('Tenant context not found. Ensure the handler is wrapped with requireTenantIsolation.');
  }
  return tenantContext;
}

/**
 * Type guard to check if an event has tenant context attached
 */
export function isTenantIsolatedEvent(event: APIGatewayProxyEvent): event is TenantIsolatedEvent {
  return 'tenantContext' in event && (event as TenantIsolatedEvent).tenantContext !== undefined;
}

/**
 * Creates a tenant-scoped response that includes tenant ID in metadata
 * Useful for debugging and audit trails
 */
export function createTenantScopedResponse<T>(
  data: T,
  tenantId: string,
  statusCode: number = 200
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      // Include tenant ID in response headers for debugging (non-sensitive)
      'X-Tenant-Id': tenantId,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Checks if a user is a SUPER_ADMIN
 * Requirements: 5.7
 * 
 * @param user - The user context from JWT
 * @returns true if user has SUPER_ADMIN role
 */
export function isSuperAdmin(user: UserContext): boolean {
  return user.roles.includes(ROLES.SUPER_ADMIN);
}

/**
 * Logs a super-admin operation for audit purposes
 * Requirements: 5.7
 * 
 * All super-admin operations should be logged for security auditing.
 * 
 * @param user - The user context from JWT
 * @param operation - Description of the operation being performed
 * @param targetTenantId - The tenant being accessed (if cross-tenant)
 * @param resourceType - Type of resource being accessed
 * @param resourceId - ID of resource being accessed
 * @param event - The API Gateway event for IP/user-agent extraction
 */
export function logSuperAdminOperation(
  user: UserContext,
  operation: string,
  targetTenantId: string | undefined,
  resourceType: string,
  resourceId: string,
  event: APIGatewayProxyEvent
): void {
  const isCrossTenant = targetTenantId && targetTenantId !== user.tenantId;
  
  const logEntry = {
    logType: 'SUPER_ADMIN_OPERATION',
    timestamp: new Date().toISOString(),
    userId: user.userId,
    userEmail: user.email,
    userTenantId: user.tenantId,
    targetTenantId: targetTenantId || user.tenantId,
    isCrossTenant,
    operation,
    resourceType,
    resourceId,
    ip: event.requestContext?.identity?.sourceIp || 'unknown',
    userAgent: event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown',
    path: event.path,
    method: event.httpMethod,
  };
  
  console.log(JSON.stringify(logEntry));
}

/**
 * Higher-order function that wraps a handler to allow SUPER_ADMIN cross-tenant access
 * Requirements: 5.7
 * 
 * This middleware allows SUPER_ADMIN users to specify a target tenant via
 * the X-Target-Tenant-Id header for support operations.
 * 
 * @param handler - The handler function to wrap
 * @param options - Tenant isolation options
 * @returns A wrapped handler that supports super-admin cross-tenant access
 * 
 * @example
 * ```typescript
 * // Handler that allows SUPER_ADMIN to access any tenant
 * export const handler = requireTenantIsolationWithSuperAdmin(async (event, context) => {
 *   const { tenantContext } = event;
 *   // tenantContext.tenantId will be the target tenant for SUPER_ADMIN
 *   const strategies = await TenantAccess.strategies.list(tenantContext);
 *   return { statusCode: 200, body: JSON.stringify(strategies) };
 * });
 * ```
 */
export function requireTenantIsolationWithSuperAdmin(
  handler: TenantIsolatedHandler,
  options?: TenantIsolationOptions
): LambdaHandler {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    // Check for Authorization header first
    const authHeader = event.headers['Authorization'] || event.headers['authorization'];
    if (!authHeader) {
      return createMissingTokenResponse();
    }

    // Validate the token
    const validationResult = await validateRequest(event);

    if (!isValidationSuccess(validationResult)) {
      const errorCode = validationResult.error?.code || AUTH_ERROR_CODES.INVALID_TOKEN;
      return createInvalidTokenResponse(errorCode, validationResult.error?.message);
    }

    const user = validationResult.user;

    // Validate tenant ID is present in JWT
    if (!user.tenantId) {
      const securityEvent: TenantSecurityEvent = {
        type: TENANT_SECURITY_EVENTS.MISSING_TENANT_ID,
        timestamp: new Date().toISOString(),
        userId: user.userId,
        userTenantId: '',
        ip: event.requestContext?.identity?.sourceIp || 'unknown',
        userAgent: event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown',
        allowed: false,
        reason: 'JWT missing tenant_id claim',
      };
      
      logTenantSecurityEvent(securityEvent);
      return createForbiddenResponse(AUTH_ERROR_CODES.TENANT_MISMATCH);
    }

    // Check for SUPER_ADMIN cross-tenant access
    // Requirements: 5.7 - Allow cross-tenant access for support
    const targetTenantHeader = event.headers['X-Target-Tenant-Id'] || event.headers['x-target-tenant-id'];
    let effectiveTenantId = user.tenantId;
    
    if (targetTenantHeader && targetTenantHeader !== user.tenantId) {
      // Only SUPER_ADMIN can access other tenants
      if (!isSuperAdmin(user)) {
        const securityEvent: TenantSecurityEvent = {
          type: TENANT_SECURITY_EVENTS.ISOLATION_VIOLATION,
          timestamp: new Date().toISOString(),
          userId: user.userId,
          userTenantId: user.tenantId,
          targetTenantId: targetTenantHeader,
          ip: event.requestContext?.identity?.sourceIp || 'unknown',
          userAgent: event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown',
          allowed: false,
          reason: 'Non-SUPER_ADMIN attempted cross-tenant access via header',
        };
        
        logTenantSecurityEvent(securityEvent);
        return createForbiddenResponse(AUTH_ERROR_CODES.INSUFFICIENT_PERMISSIONS);
      }
      
      // Log SUPER_ADMIN cross-tenant access
      const securityEvent: TenantSecurityEvent = {
        type: TENANT_SECURITY_EVENTS.SUPER_ADMIN_ACCESS,
        timestamp: new Date().toISOString(),
        userId: user.userId,
        userTenantId: user.tenantId,
        targetTenantId: targetTenantHeader,
        ip: event.requestContext?.identity?.sourceIp || 'unknown',
        userAgent: event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown',
        allowed: true,
        reason: 'SUPER_ADMIN cross-tenant access via X-Target-Tenant-Id header',
      };
      
      logTenantSecurityEvent(securityEvent);
      effectiveTenantId = targetTenantHeader;
    }

    // Create tenant context with effective tenant ID
    const tenantContext: TenantContext = {
      tenantId: effectiveTenantId,
      userId: user.userId,
      isSuperAdmin: isSuperAdmin(user),
    };

    // Attach user and tenant context to event
    const isolatedEvent: TenantIsolatedEvent = {
      ...event,
      user,
      tenantContext,
    };

    // Invoke the wrapped handler
    return handler(isolatedEvent, context);
  };
}
