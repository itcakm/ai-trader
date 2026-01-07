/**
 * Unit tests for RBAC (Role-Based Access Control) service.
 * 
 * Requirements: 13.2
 * - Test each role's permissions
 * - Test permission inheritance
 * - Test super-admin access
 */

import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole,
  hasAllRoles,
  isSuperAdmin,
  isAdmin,
  getUserPermissions,
  checkAuthorization,
  checkStrictAuthorization,
} from './rbac';
import { UserContext } from '../types/auth';
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '../types/rbac';

describe('RBAC Service', () => {
  describe('hasPermission', () => {
    it('should return true when VIEWER has read:strategies permission', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasPermission(user, PERMISSIONS.STRATEGIES_READ)).toBe(true);
    });

    it('should return false when VIEWER tries to write strategies', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasPermission(user, PERMISSIONS.STRATEGIES_WRITE)).toBe(false);
    });

    it('should return true when TRADER has execute:orders permission', () => {
      const user = createUserContext(['TRADER']);
      expect(hasPermission(user, PERMISSIONS.ORDERS_EXECUTE)).toBe(true);
    });

    it('should return true when ANALYST has read:ai-analysis permission', () => {
      const user = createUserContext(['ANALYST']);
      expect(hasPermission(user, PERMISSIONS.AI_ANALYSIS_READ)).toBe(true);
    });

    it('should return true when ADMIN has manage:users permission', () => {
      const user = createUserContext(['ADMIN']);
      expect(hasPermission(user, PERMISSIONS.USERS_MANAGE)).toBe(true);
    });

    it('should return true for SUPER_ADMIN with any permission', () => {
      const user = createUserContext(['SUPER_ADMIN']);
      expect(hasPermission(user, PERMISSIONS.STRATEGIES_READ)).toBe(true);
      expect(hasPermission(user, PERMISSIONS.USERS_MANAGE)).toBe(true);
      expect(hasPermission(user, PERMISSIONS.TENANTS_MANAGE)).toBe(true);
    });

    it('should return false for null user', () => {
      expect(hasPermission(null as any, PERMISSIONS.STRATEGIES_READ)).toBe(false);
    });

    it('should return false for user with empty roles', () => {
      const user = createUserContext([]);
      expect(hasPermission(user, PERMISSIONS.STRATEGIES_READ)).toBe(false);
    });

    it('should return false for invalid role', () => {
      const user = createUserContext(['INVALID_ROLE']);
      expect(hasPermission(user, PERMISSIONS.STRATEGIES_READ)).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one permission', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasAnyPermission(user, [PERMISSIONS.STRATEGIES_READ, PERMISSIONS.STRATEGIES_WRITE])).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasAnyPermission(user, [PERMISSIONS.STRATEGIES_WRITE, PERMISSIONS.USERS_MANAGE])).toBe(false);
    });

    it('should return true for empty permissions array', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasAnyPermission(user, [])).toBe(true);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when user has all permissions', () => {
      const user = createUserContext(['ADMIN']);
      expect(hasAllPermissions(user, [PERMISSIONS.STRATEGIES_READ, PERMISSIONS.USERS_MANAGE])).toBe(true);
    });

    it('should return false when user is missing one permission', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasAllPermissions(user, [PERMISSIONS.STRATEGIES_READ, PERMISSIONS.STRATEGIES_WRITE])).toBe(false);
    });

    it('should return true for empty permissions array', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasAllPermissions(user, [])).toBe(true);
    });
  });

  describe('hasRole', () => {
    it('should return true when user has the role', () => {
      const user = createUserContext(['TRADER']);
      expect(hasRole(user, ROLES.TRADER)).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasRole(user, ROLES.ADMIN)).toBe(false);
    });

    it('should return true for SUPER_ADMIN checking any role', () => {
      const user = createUserContext(['SUPER_ADMIN']);
      expect(hasRole(user, ROLES.VIEWER)).toBe(true);
      expect(hasRole(user, ROLES.ADMIN)).toBe(true);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true when user has at least one role', () => {
      const user = createUserContext(['TRADER']);
      expect(hasAnyRole(user, [ROLES.VIEWER, ROLES.TRADER])).toBe(true);
    });

    it('should return false when user has none of the roles', () => {
      const user = createUserContext(['VIEWER']);
      expect(hasAnyRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN])).toBe(false);
    });
  });

  describe('hasAllRoles', () => {
    it('should return true when user has all roles', () => {
      const user = createUserContext(['TRADER', 'ANALYST']);
      expect(hasAllRoles(user, [ROLES.TRADER, ROLES.ANALYST])).toBe(true);
    });

    it('should return false when user is missing one role', () => {
      const user = createUserContext(['TRADER']);
      expect(hasAllRoles(user, [ROLES.TRADER, ROLES.ANALYST])).toBe(false);
    });

    it('should return true for SUPER_ADMIN checking any roles', () => {
      const user = createUserContext(['SUPER_ADMIN']);
      expect(hasAllRoles(user, [ROLES.VIEWER, ROLES.ADMIN])).toBe(true);
    });
  });

  describe('isSuperAdmin', () => {
    it('should return true for SUPER_ADMIN', () => {
      const user = createUserContext(['SUPER_ADMIN']);
      expect(isSuperAdmin(user)).toBe(true);
    });

    it('should return false for ADMIN', () => {
      const user = createUserContext(['ADMIN']);
      expect(isSuperAdmin(user)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(isSuperAdmin(null as any)).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true for ADMIN', () => {
      const user = createUserContext(['ADMIN']);
      expect(isAdmin(user)).toBe(true);
    });

    it('should return true for SUPER_ADMIN', () => {
      const user = createUserContext(['SUPER_ADMIN']);
      expect(isAdmin(user)).toBe(true);
    });

    it('should return false for TRADER', () => {
      const user = createUserContext(['TRADER']);
      expect(isAdmin(user)).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return correct permissions for VIEWER', () => {
      const user = createUserContext(['VIEWER']);
      const permissions = getUserPermissions(user);
      
      expect(permissions).toContain(PERMISSIONS.STRATEGIES_READ);
      expect(permissions).toContain(PERMISSIONS.POSITIONS_READ);
      expect(permissions).not.toContain(PERMISSIONS.STRATEGIES_WRITE);
    });

    it('should return wildcard for SUPER_ADMIN', () => {
      const user = createUserContext(['SUPER_ADMIN']);
      const permissions = getUserPermissions(user);
      
      expect(permissions).toContain(PERMISSIONS.ALL);
    });

    it('should combine permissions for multiple roles', () => {
      const user = createUserContext(['TRADER', 'ANALYST']);
      const permissions = getUserPermissions(user);
      
      // TRADER permissions
      expect(permissions).toContain(PERMISSIONS.ORDERS_EXECUTE);
      // ANALYST permissions
      expect(permissions).toContain(PERMISSIONS.AI_ANALYSIS_READ);
    });
  });

  describe('checkAuthorization', () => {
    it('should authorize when user has required permission', () => {
      const user = createUserContext(['TRADER']);
      const result = checkAuthorization(user, [PERMISSIONS.ORDERS_EXECUTE]);
      
      expect(result.authorized).toBe(true);
    });

    it('should deny when user lacks required permission', () => {
      const user = createUserContext(['VIEWER']);
      const result = checkAuthorization(user, [PERMISSIONS.USERS_MANAGE]);
      
      expect(result.authorized).toBe(false);
      expect(result.missingPermissions).toContain(PERMISSIONS.USERS_MANAGE);
    });

    it('should authorize SUPER_ADMIN for any permission', () => {
      const user = createUserContext(['SUPER_ADMIN']);
      const result = checkAuthorization(user, [PERMISSIONS.TENANTS_MANAGE]);
      
      expect(result.authorized).toBe(true);
    });

    it('should deny when user context is missing', () => {
      const result = checkAuthorization(null as any, [PERMISSIONS.STRATEGIES_READ]);
      
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('missing');
    });
  });

  describe('checkStrictAuthorization', () => {
    it('should authorize when user has all required permissions', () => {
      const user = createUserContext(['ADMIN']);
      const result = checkStrictAuthorization(user, [
        PERMISSIONS.STRATEGIES_READ,
        PERMISSIONS.USERS_MANAGE,
      ]);
      
      expect(result.authorized).toBe(true);
    });

    it('should deny when user is missing one required permission', () => {
      const user = createUserContext(['TRADER']);
      const result = checkStrictAuthorization(user, [
        PERMISSIONS.ORDERS_EXECUTE,
        PERMISSIONS.USERS_MANAGE,
      ]);
      
      expect(result.authorized).toBe(false);
      expect(result.missingPermissions).toContain(PERMISSIONS.USERS_MANAGE);
    });
  });

  describe('Role Permission Definitions', () => {
    it('VIEWER should have read-only permissions', () => {
      const viewerPermissions = ROLE_PERMISSIONS[ROLES.VIEWER];
      
      expect(viewerPermissions).toContain(PERMISSIONS.STRATEGIES_READ);
      expect(viewerPermissions).toContain(PERMISSIONS.POSITIONS_READ);
      expect(viewerPermissions).toContain(PERMISSIONS.REPORTS_READ);
      expect(viewerPermissions).not.toContain(PERMISSIONS.STRATEGIES_WRITE);
      expect(viewerPermissions).not.toContain(PERMISSIONS.ORDERS_EXECUTE);
    });

    it('TRADER should have VIEWER permissions plus trading', () => {
      const traderPermissions = ROLE_PERMISSIONS[ROLES.TRADER];
      
      // Inherited from VIEWER
      expect(traderPermissions).toContain(PERMISSIONS.STRATEGIES_READ);
      // Trading permissions
      expect(traderPermissions).toContain(PERMISSIONS.STRATEGIES_WRITE);
      expect(traderPermissions).toContain(PERMISSIONS.ORDERS_EXECUTE);
      expect(traderPermissions).toContain(PERMISSIONS.ORDERS_CANCEL);
    });

    it('ANALYST should have VIEWER permissions plus analysis', () => {
      const analystPermissions = ROLE_PERMISSIONS[ROLES.ANALYST];
      
      // Inherited from VIEWER
      expect(analystPermissions).toContain(PERMISSIONS.STRATEGIES_READ);
      // Analysis permissions
      expect(analystPermissions).toContain(PERMISSIONS.AI_ANALYSIS_READ);
      expect(analystPermissions).toContain(PERMISSIONS.AUDIT_LOGS_READ);
      expect(analystPermissions).toContain(PERMISSIONS.REPORTS_EXPORT);
    });

    it('ADMIN should have full tenant access', () => {
      const adminPermissions = ROLE_PERMISSIONS[ROLES.ADMIN];
      
      expect(adminPermissions).toContain(PERMISSIONS.USERS_MANAGE);
      expect(adminPermissions).toContain(PERMISSIONS.ROLES_MANAGE);
      expect(adminPermissions).toContain(PERMISSIONS.SETTINGS_MANAGE);
      expect(adminPermissions).toContain(PERMISSIONS.KILL_SWITCH_ACTIVATE);
    });

    it('SUPER_ADMIN should have wildcard permission', () => {
      const superAdminPermissions = ROLE_PERMISSIONS[ROLES.SUPER_ADMIN];
      
      expect(superAdminPermissions).toContain(PERMISSIONS.ALL);
    });
  });
});

/**
 * Helper function to create a mock UserContext
 */
function createUserContext(roles: string[]): UserContext {
  return {
    userId: 'test-user-id',
    email: 'test@example.com',
    tenantId: 'test-tenant-id',
    roles,
    emailVerified: true,
  };
}
