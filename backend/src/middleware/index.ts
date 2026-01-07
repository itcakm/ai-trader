/**
 * Authentication and Authorization Middleware
 * 
 * This module provides JWT validation and role-based access control
 * for Lambda handlers behind API Gateway.
 */

// JWKS Client
export {
  getJwksUri,
  createJwksClient,
  getJwksClient,
  resetJwksClient,
  getSigningKey,
  getPublicKey,
  getKeyCallback,
} from './jwks-client';

// JWT Validation
export {
  ValidationResult,
  getExpectedIssuer,
  extractBearerToken,
  parseUserContext,
  validateToken,
  validateRequest,
  isValidationSuccess,
} from './jwt-validator';

// Auth Error Responses
export {
  getSanitizedMessage,
  createMissingTokenResponse,
  createInvalidTokenResponse,
  createForbiddenResponse,
  createRateLimitResponse,
  createSuccessResponse,
  createErrorResponse,
} from './auth-errors';

// Auth Wrappers
export {
  AuthenticatedEvent,
  AuthenticatedHandler,
  LambdaHandler,
  RequireAuthOptions,
  requireAuth,
  getUserContext,
  getOptionalUserContext,
  isAuthenticatedEvent,
} from './require-auth';

// Role-Based Access Control
export {
  RequireRoleOptions,
  hasAnyRole,
  hasAllRoles,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requireRole,
  requirePermission,
} from './require-role';

// Tenant Isolation
export {
  TENANT_SECURITY_EVENTS,
  TenantSecurityEventType,
  TenantSecurityEvent,
  TenantIsolatedEvent,
  TenantIsolatedHandler,
  TenantIsolationOptions,
  logTenantSecurityEvent,
  createTenantContext,
  validateTenantAccess,
  validateResourceOwnership,
  requireTenantIsolation,
  requireTenantIsolationWithSuperAdmin,
  getTenantContext,
  isTenantIsolatedEvent,
  createTenantScopedResponse,
  isSuperAdmin,
  logSuperAdminOperation,
} from './tenant-isolation';
