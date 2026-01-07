/**
 * Role-Based Access Control (RBAC) service.
 * Provides permission checking functions for authorization.
 * 
 * Requirements: 6.7
 * - Implement hasPermission(user, permission) function
 * - Implement hasAnyPermission(user, permissions) function
 * - Implement hasAllPermissions(user, permissions) function
 */

import {
  Role,
  Permission,
  ROLES,
  ROLE_PERMISSIONS,
  PERMISSIONS,
  getAllPermissionsForRole,
  isValidRole,
  isValidPermission,
  ROLE_INFO,
  RoleInfo,
} from '../types/rbac';
import { UserContext } from '../types/auth';

// ============================================================================
// Permission Checking Functions
// ============================================================================

/**
 * Check if a user has a specific permission.
 * 
 * @param user - The user context containing roles
 * @param permission - The permission to check
 * @returns True if the user has the permission
 * 
 * @example
 * ```typescript
 * if (hasPermission(user, PERMISSIONS.STRATEGIES_WRITE)) {
 *   // User can write strategies
 * }
 * ```
 */
export function hasPermission(user: UserContext, permission: Permission | string): boolean {
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  for (const roleName of user.roles) {
    if (!isValidRole(roleName)) {
      continue;
    }

    const role = roleName as Role;
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions) {
      continue;
    }

    // Check for wildcard permission (SUPER_ADMIN)
    if (permissions.includes(PERMISSIONS.ALL)) {
      return true;
    }

    // Check for specific permission
    if (permissions.includes(permission as Permission)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a user has any of the specified permissions.
 * 
 * @param user - The user context containing roles
 * @param permissions - Array of permissions to check
 * @returns True if the user has at least one of the permissions
 * 
 * @example
 * ```typescript
 * if (hasAnyPermission(user, [PERMISSIONS.STRATEGIES_READ, PERMISSIONS.STRATEGIES_WRITE])) {
 *   // User can read or write strategies
 * }
 * ```
 */
export function hasAnyPermission(user: UserContext, permissions: (Permission | string)[]): boolean {
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  if (!permissions || permissions.length === 0) {
    return true; // No permissions required
  }

  return permissions.some(permission => hasPermission(user, permission));
}

/**
 * Check if a user has all of the specified permissions.
 * 
 * @param user - The user context containing roles
 * @param permissions - Array of permissions to check
 * @returns True if the user has all of the permissions
 * 
 * @example
 * ```typescript
 * if (hasAllPermissions(user, [PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_EXECUTE])) {
 *   // User can read and execute orders
 * }
 * ```
 */
export function hasAllPermissions(user: UserContext, permissions: (Permission | string)[]): boolean {
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  if (!permissions || permissions.length === 0) {
    return true; // No permissions required
  }

  return permissions.every(permission => hasPermission(user, permission));
}

// ============================================================================
// Role Checking Functions
// ============================================================================

/**
 * Check if a user has a specific role.
 * 
 * @param user - The user context containing roles
 * @param role - The role to check
 * @returns True if the user has the role
 */
export function hasRole(user: UserContext, role: Role | string): boolean {
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  // SUPER_ADMIN has all roles implicitly
  if (user.roles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }

  return user.roles.includes(role);
}

/**
 * Check if a user has any of the specified roles.
 * 
 * @param user - The user context containing roles
 * @param roles - Array of roles to check
 * @returns True if the user has at least one of the roles
 */
export function hasAnyRole(user: UserContext, roles: (Role | string)[]): boolean {
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  if (!roles || roles.length === 0) {
    return true; // No roles required
  }

  // SUPER_ADMIN has all roles implicitly
  if (user.roles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }

  return roles.some(role => user.roles.includes(role));
}

/**
 * Check if a user has all of the specified roles.
 * 
 * @param user - The user context containing roles
 * @param roles - Array of roles to check
 * @returns True if the user has all of the roles
 */
export function hasAllRoles(user: UserContext, roles: (Role | string)[]): boolean {
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  if (!roles || roles.length === 0) {
    return true; // No roles required
  }

  // SUPER_ADMIN has all roles implicitly
  if (user.roles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }

  return roles.every(role => user.roles.includes(role));
}

// ============================================================================
// Super Admin Checking
// ============================================================================

/**
 * Check if a user is a super admin.
 * Super admins have unrestricted access across all tenants.
 * 
 * @param user - The user context containing roles
 * @returns True if the user is a super admin
 */
export function isSuperAdmin(user: UserContext): boolean {
  if (!user || !user.roles) {
    return false;
  }

  return user.roles.includes(ROLES.SUPER_ADMIN);
}

/**
 * Check if a user is an admin (tenant admin or super admin).
 * 
 * @param user - The user context containing roles
 * @returns True if the user is an admin
 */
export function isAdmin(user: UserContext): boolean {
  if (!user || !user.roles) {
    return false;
  }

  return user.roles.includes(ROLES.ADMIN) || user.roles.includes(ROLES.SUPER_ADMIN);
}

// ============================================================================
// Permission Utilities
// ============================================================================

/**
 * Get all permissions for a user based on their roles.
 * 
 * @param user - The user context containing roles
 * @returns Array of all permissions the user has
 */
export function getUserPermissions(user: UserContext): Permission[] {
  if (!user || !user.roles || user.roles.length === 0) {
    return [];
  }

  const allPermissions = new Set<Permission>();

  for (const roleName of user.roles) {
    if (!isValidRole(roleName)) {
      continue;
    }

    const role = roleName as Role;
    const permissions = getAllPermissionsForRole(role);

    for (const permission of permissions) {
      allPermissions.add(permission);
    }
  }

  return Array.from(allPermissions);
}

/**
 * Get all roles for a user with their display information.
 * 
 * @param user - The user context containing roles
 * @returns Array of role info objects
 */
export function getUserRoleInfo(user: UserContext): RoleInfo[] {
  if (!user || !user.roles || user.roles.length === 0) {
    return [];
  }

  const roleInfoList: RoleInfo[] = [];

  for (const roleName of user.roles) {
    if (isValidRole(roleName)) {
      const info = ROLE_INFO[roleName as Role];
      if (info) {
        roleInfoList.push(info);
      }
    }
  }

  return roleInfoList.sort((a, b) => b.level - a.level);
}

/**
 * Get the highest role level for a user.
 * 
 * @param user - The user context containing roles
 * @returns The highest role level (0 if no valid roles)
 */
export function getHighestRoleLevel(user: UserContext): number {
  if (!user || !user.roles || user.roles.length === 0) {
    return 0;
  }

  let highestLevel = 0;

  for (const roleName of user.roles) {
    if (isValidRole(roleName)) {
      const info = ROLE_INFO[roleName as Role];
      if (info && info.level > highestLevel) {
        highestLevel = info.level;
      }
    }
  }

  return highestLevel;
}

// ============================================================================
// Authorization Result Types
// ============================================================================

/**
 * Result of an authorization check.
 */
export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  missingPermissions?: string[];
  missingRoles?: string[];
}

/**
 * Check authorization and return detailed result.
 * 
 * @param user - The user context containing roles
 * @param requiredPermissions - Permissions required (any)
 * @param requiredRoles - Roles required (any)
 * @returns Authorization result with details
 */
export function checkAuthorization(
  user: UserContext,
  requiredPermissions?: (Permission | string)[],
  requiredRoles?: (Role | string)[]
): AuthorizationResult {
  // Check if user exists
  if (!user || !user.roles) {
    return {
      authorized: false,
      reason: 'User context is missing or invalid',
    };
  }

  // Super admin bypasses all checks
  if (isSuperAdmin(user)) {
    return { authorized: true };
  }

  // Check role requirements
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = hasAnyRole(user, requiredRoles);
    if (!hasRequiredRole) {
      return {
        authorized: false,
        reason: 'User does not have required role',
        missingRoles: requiredRoles.filter(role => !user.roles.includes(role)),
      };
    }
  }

  // Check permission requirements
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasRequiredPermission = hasAnyPermission(user, requiredPermissions);
    if (!hasRequiredPermission) {
      return {
        authorized: false,
        reason: 'User does not have required permission',
        missingPermissions: requiredPermissions.filter(
          permission => !hasPermission(user, permission)
        ),
      };
    }
  }

  return { authorized: true };
}

/**
 * Check strict authorization (requires ALL permissions and roles).
 * 
 * @param user - The user context containing roles
 * @param requiredPermissions - All permissions required
 * @param requiredRoles - All roles required
 * @returns Authorization result with details
 */
export function checkStrictAuthorization(
  user: UserContext,
  requiredPermissions?: (Permission | string)[],
  requiredRoles?: (Role | string)[]
): AuthorizationResult {
  // Check if user exists
  if (!user || !user.roles) {
    return {
      authorized: false,
      reason: 'User context is missing or invalid',
    };
  }

  // Super admin bypasses all checks
  if (isSuperAdmin(user)) {
    return { authorized: true };
  }

  // Check role requirements (ALL required)
  if (requiredRoles && requiredRoles.length > 0) {
    const hasAllRequiredRoles = hasAllRoles(user, requiredRoles);
    if (!hasAllRequiredRoles) {
      return {
        authorized: false,
        reason: 'User does not have all required roles',
        missingRoles: requiredRoles.filter(role => !user.roles.includes(role)),
      };
    }
  }

  // Check permission requirements (ALL required)
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAllRequiredPermissions = hasAllPermissions(user, requiredPermissions);
    if (!hasAllRequiredPermissions) {
      return {
        authorized: false,
        reason: 'User does not have all required permissions',
        missingPermissions: requiredPermissions.filter(
          permission => !hasPermission(user, permission)
        ),
      };
    }
  }

  return { authorized: true };
}

// ============================================================================
// Export RBAC Service Object
// ============================================================================

/**
 * RBAC service object for convenient access to all functions.
 */
export const RBACService = {
  // Permission checking
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  
  // Role checking
  hasRole,
  hasAnyRole,
  hasAllRoles,
  
  // Admin checking
  isSuperAdmin,
  isAdmin,
  
  // Utilities
  getUserPermissions,
  getUserRoleInfo,
  getHighestRoleLevel,
  
  // Authorization
  checkAuthorization,
  checkStrictAuthorization,
};

export default RBACService;
