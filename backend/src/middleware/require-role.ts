/**
 * Role-based access control wrapper functions for Lambda handlers.
 * Provides higher-order functions to protect endpoints with role requirements.
 * 
 * Requirements: 6.7, 6.8
 * - Create higher-order function for role-based access
 * - Check user roles against required roles
 * - Return 403 for insufficient permissions
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { validateRequest, isValidationSuccess } from './jwt-validator';
import { createMissingTokenResponse, createInvalidTokenResponse, createForbiddenResponse } from './auth-errors';
import { UserContext, AUTH_ERROR_CODES } from '../types/auth';
import { Role, ROLES, ROLE_PERMISSIONS, Permission, PERMISSIONS } from '../types/rbac';
import { AuthenticatedEvent, AuthenticatedHandler, LambdaHandler } from './require-auth';
import {
  hasPermission as rbacHasPermission,
  hasAnyPermission as rbacHasAnyPermission,
  hasAllPermissions as rbacHasAllPermissions,
} from '../services/rbac';

/**
 * Options for the requireRole wrapper.
 */
export interface RequireRoleOptions {
  /**
   * If true, user must have ALL specified roles.
   * If false (default), user must have ANY of the specified roles.
   */
  requireAll?: boolean;
  
  /**
   * Custom error handler for authorization failures.
   */
  onForbidden?: (user: UserContext, requiredRoles: string[], event: APIGatewayProxyEvent) => APIGatewayProxyResult;
}

/**
 * Checks if a user has any of the specified roles.
 * SUPER_ADMIN role has access to everything.
 * 
 * @param userRoles - The user's roles
 * @param requiredRoles - The roles to check against
 * @returns True if user has any of the required roles
 */
export function hasAnyRole(userRoles: string[], requiredRoles: string[]): boolean {
  // SUPER_ADMIN has access to everything
  if (userRoles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }
  
  return requiredRoles.some(role => userRoles.includes(role));
}

/**
 * Checks if a user has all of the specified roles.
 * SUPER_ADMIN role has access to everything.
 * 
 * @param userRoles - The user's roles
 * @param requiredRoles - The roles to check against
 * @returns True if user has all of the required roles
 */
export function hasAllRoles(userRoles: string[], requiredRoles: string[]): boolean {
  // SUPER_ADMIN has access to everything
  if (userRoles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }
  
  return requiredRoles.every(role => userRoles.includes(role));
}

/**
 * Checks if a user has a specific permission.
 * Uses the ROLE_PERMISSIONS mapping to determine access.
 * 
 * @param userRoles - The user's roles
 * @param permission - The permission to check
 * @returns True if user has the permission
 */
export function hasPermission(userRoles: string[], permission: string): boolean {
  // Create a minimal user context for the RBAC service
  const userContext: UserContext = {
    userId: '',
    email: '',
    tenantId: '',
    roles: userRoles,
    emailVerified: true,
  };
  return rbacHasPermission(userContext, permission);
}

/**
 * Checks if a user has any of the specified permissions.
 * 
 * @param userRoles - The user's roles
 * @param permissions - The permissions to check
 * @returns True if user has any of the permissions
 */
export function hasAnyPermission(userRoles: string[], permissions: string[]): boolean {
  const userContext: UserContext = {
    userId: '',
    email: '',
    tenantId: '',
    roles: userRoles,
    emailVerified: true,
  };
  return rbacHasAnyPermission(userContext, permissions);
}

/**
 * Checks if a user has all of the specified permissions.
 * 
 * @param userRoles - The user's roles
 * @param permissions - The permissions to check
 * @returns True if user has all of the permissions
 */
export function hasAllPermissions(userRoles: string[], permissions: string[]): boolean {
  const userContext: UserContext = {
    userId: '',
    email: '',
    tenantId: '',
    roles: userRoles,
    emailVerified: true,
  };
  return rbacHasAllPermissions(userContext, permissions);
}

/**
 * Higher-order function that wraps a handler to require specific roles.
 * 
 * First validates authentication, then checks if the user has the required roles.
 * Returns 401 for authentication failures and 403 for authorization failures.
 * 
 * @param roles - The required roles (user must have at least one by default)
 * @param handler - The handler function to wrap
 * @param options - Optional configuration
 * @returns A wrapped handler that validates authentication and authorization
 * 
 * @example
 * ```typescript
 * // Require any of the specified roles
 * export const handler = requireRole(
 *   ['ADMIN', 'SUPER_ADMIN'],
 *   async (event, context) => {
 *     // Handler logic here
 *   }
 * );
 * 
 * // Require all specified roles
 * export const handler = requireRole(
 *   ['TRADER', 'ANALYST'],
 *   async (event, context) => { ... },
 *   { requireAll: true }
 * );
 * ```
 */
export function requireRole(
  roles: string[],
  handler: AuthenticatedHandler,
  options?: RequireRoleOptions
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

    // Check role requirements
    const hasRequiredRoles = options?.requireAll
      ? hasAllRoles(user.roles, roles)
      : hasAnyRole(user.roles, roles);

    if (!hasRequiredRoles) {
      // Use custom forbidden handler if provided
      if (options?.onForbidden) {
        return options.onForbidden(user, roles, event);
      }

      return createForbiddenResponse(AUTH_ERROR_CODES.INSUFFICIENT_PERMISSIONS, roles);
    }

    // Attach user context to event
    const authenticatedEvent: AuthenticatedEvent = {
      ...event,
      user,
    };

    // Invoke the wrapped handler
    return handler(authenticatedEvent, context);
  };
}

/**
 * Higher-order function that wraps a handler to require specific permissions.
 * 
 * Similar to requireRole but checks permissions instead of roles.
 * 
 * @param permissions - The required permissions
 * @param handler - The handler function to wrap
 * @param options - Optional configuration (requireAll defaults to false)
 * @returns A wrapped handler that validates authentication and permissions
 * 
 * @example
 * ```typescript
 * // Require any of the specified permissions
 * export const handler = requirePermission(
 *   ['read:strategies', 'write:strategies'],
 *   async (event, context) => { ... }
 * );
 * ```
 */
export function requirePermission(
  permissions: string[],
  handler: AuthenticatedHandler,
  options?: { requireAll?: boolean }
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

    // Check permission requirements
    const hasRequiredPermissions = options?.requireAll
      ? hasAllPermissions(user.roles, permissions)
      : hasAnyPermission(user.roles, permissions);

    if (!hasRequiredPermissions) {
      return createForbiddenResponse(AUTH_ERROR_CODES.INSUFFICIENT_PERMISSIONS);
    }

    // Attach user context to event
    const authenticatedEvent: AuthenticatedEvent = {
      ...event,
      user,
    };

    // Invoke the wrapped handler
    return handler(authenticatedEvent, context);
  };
}
