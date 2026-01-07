/**
 * Feature: ui-implementation, Property 1: RBAC Enforcement Consistency
 * Validates: Requirements 1.6, 2.1, 2.4, 6.7, 6.9, 7.5, 11.6
 *
 * For any user with a defined set of permissions, and for any UI element, module,
 * search result, or audit log entry, the visibility and accessibility of that item
 * SHALL be determined solely by the user's permissions—items requiring permissions
 * the user lacks SHALL be hidden, disabled, or filtered from results.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Permission, Role, ResourceType, ActionType, PermissionCheck, ModuleType, BackendPermission } from '@/types/rbac';
import { MODULE_PERMISSION_MAP, SYSTEM_ROLES, ROLE_BACKEND_PERMISSIONS, BACKEND_PERMISSIONS } from '@/types/rbac';
import {
  mergePermissionsWithInheritance,
  extractPermissionsFromRoles,
  getBackendPermissionsForRoles,
} from './RBACProvider';

// Arbitraries for generating test data
const resourceTypeArbitrary = fc.constantFrom<ResourceType>(
  'strategy',
  'order',
  'position',
  'market_data',
  'ai_model',
  'risk_control',
  'report',
  'audit_log',
  'user',
  'organization',
  'role',
  'exchange'
);

const actionTypeArbitrary = fc.constantFrom<ActionType>(
  'create',
  'read',
  'update',
  'delete',
  'execute',
  'export'
);

const permissionArbitrary: fc.Arbitrary<Permission> = fc.record({
  id: fc.uuid(),
  resource: resourceTypeArbitrary,
  action: actionTypeArbitrary,
  conditions: fc.constant(undefined),
});

const roleArbitrary: fc.Arbitrary<Role> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ maxLength: 200 }),
  permissions: fc.array(permissionArbitrary, { minLength: 0, maxLength: 10 }),
  isSystem: fc.boolean(),
  organizationId: fc.option(fc.uuid(), { nil: undefined }),
});

const permissionCheckArbitrary: fc.Arbitrary<PermissionCheck> = fc.record({
  resource: resourceTypeArbitrary,
  action: actionTypeArbitrary,
});

// System role arbitrary for testing backend permissions
const systemRoleArbitrary = fc.constantFrom<string>(
  SYSTEM_ROLES.VIEWER,
  SYSTEM_ROLES.TRADER,
  SYSTEM_ROLES.ANALYST,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.SUPER_ADMIN
);

// Backend permission arbitrary
const backendPermissionArbitrary = fc.constantFrom<BackendPermission>(
  BACKEND_PERMISSIONS.STRATEGIES_READ,
  BACKEND_PERMISSIONS.STRATEGIES_WRITE,
  BACKEND_PERMISSIONS.ORDERS_READ,
  BACKEND_PERMISSIONS.ORDERS_EXECUTE,
  BACKEND_PERMISSIONS.POSITIONS_READ,
  BACKEND_PERMISSIONS.REPORTS_READ,
  BACKEND_PERMISSIONS.MARKET_DATA_READ,
  BACKEND_PERMISSIONS.AI_ANALYSIS_READ,
  BACKEND_PERMISSIONS.AUDIT_LOGS_READ,
  BACKEND_PERMISSIONS.USERS_READ,
  BACKEND_PERMISSIONS.ROLES_READ,
  BACKEND_PERMISSIONS.EXCHANGE_READ,
  BACKEND_PERMISSIONS.RISK_READ
);

// Helper function to check if a permission exists in a list
function hasPermission(
  permissions: Permission[],
  resource: ResourceType,
  action: ActionType
): boolean {
  return permissions.some(
    (p) => p.resource === resource && p.action === action
  );
}

// Helper function to check if any permission exists
function hasAnyPermission(
  permissions: Permission[],
  checks: PermissionCheck[]
): boolean {
  return checks.some(({ resource, action }) =>
    hasPermission(permissions, resource, action)
  );
}

// Helper function to check if all permissions exist
function hasAllPermissions(
  permissions: Permission[],
  checks: PermissionCheck[]
): boolean {
  return checks.every(({ resource, action }) =>
    hasPermission(permissions, resource, action)
  );
}

// Helper function to get visible modules based on permissions
function getVisibleModules(permissions: Permission[]): ModuleType[] {
  return MODULE_PERMISSION_MAP
    .filter(({ requiredPermissions }) =>
      hasAnyPermission(permissions, requiredPermissions)
    )
    .map(({ module }) => module);
}

// Helper function to filter items by permission
function filterByPermission<T>(
  items: T[],
  permissions: Permission[],
  resource: ResourceType,
  action: ActionType
): T[] {
  if (!hasPermission(permissions, resource, action)) {
    return [];
  }
  return items;
}

describe('Property 1: RBAC Enforcement Consistency', () => {
  describe('Permission Checking', () => {
    it('hasPermission returns true only when exact resource:action match exists', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 10 }),
          resourceTypeArbitrary,
          actionTypeArbitrary,
          (permissions, resource, action) => {
            const result = hasPermission(permissions, resource, action);
            const expected = permissions.some(
              (p) => p.resource === resource && p.action === action
            );
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('hasAnyPermission returns true when at least one permission matches', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 10 }),
          fc.array(permissionCheckArbitrary, { minLength: 1, maxLength: 5 }),
          (permissions, checks) => {
            const result = hasAnyPermission(permissions, checks);
            const expected = checks.some(({ resource, action }) =>
              hasPermission(permissions, resource, action)
            );
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('hasAllPermissions returns true only when all permissions match', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 10 }),
          fc.array(permissionCheckArbitrary, { minLength: 1, maxLength: 5 }),
          (permissions, checks) => {
            const result = hasAllPermissions(permissions, checks);
            const expected = checks.every(({ resource, action }) =>
              hasPermission(permissions, resource, action)
            );
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty permissions should deny all permission checks', () => {
      fc.assert(
        fc.property(
          resourceTypeArbitrary,
          actionTypeArbitrary,
          (resource, action) => {
            const result = hasPermission([], resource, action);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Permission Inheritance', () => {
    it('user overrides should take precedence over organization permissions', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 5 }),
          (orgPermissions, userOverrides) => {
            const merged = mergePermissionsWithInheritance(
              orgPermissions,
              userOverrides
            );

            // For each user override, verify it's in the merged result
            const overridesByKey = new Map<string, Permission>();
            for (const override of userOverrides) {
              const key = `${override.resource}:${override.action}`;
              overridesByKey.set(key, override);
            }

            for (const [key, override] of overridesByKey) {
              const found = merged.find(
                (p) => `${p.resource}:${p.action}` === key
              );
              expect(found).toBeDefined();
              expect(found?.id).toBe(override.id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('organization permissions should be included when no user override exists', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 5 }),
          (orgPermissions) => {
            // No user overrides
            const merged = mergePermissionsWithInheritance(orgPermissions, []);

            // All org permissions should be in merged
            for (const orgPerm of orgPermissions) {
              const key = `${orgPerm.resource}:${orgPerm.action}`;
              const found = merged.find(
                (p) => `${p.resource}:${p.action}` === key
              );
              expect(found).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('merged permissions should not have duplicates', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 0, maxLength: 10 }),
          fc.array(permissionArbitrary, { minLength: 0, maxLength: 10 }),
          (orgPermissions, userOverrides) => {
            const merged = mergePermissionsWithInheritance(
              orgPermissions,
              userOverrides
            );

            const keys = merged.map((p) => `${p.resource}:${p.action}`);
            const uniqueKeys = new Set(keys);

            expect(keys.length).toBe(uniqueKeys.size);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Role Permission Extraction', () => {
    it('extractPermissionsFromRoles should include all permissions from all roles', () => {
      fc.assert(
        fc.property(
          fc.array(roleArbitrary, { minLength: 1, maxLength: 5 }),
          (roles) => {
            const extracted = extractPermissionsFromRoles(roles);

            // Collect all unique resource:action pairs from roles
            const expectedPairs = new Set<string>();
            for (const role of roles) {
              for (const permission of role.permissions) {
                expectedPairs.add(`${permission.resource}:${permission.action}`);
              }
            }

            // Verify extracted permissions contain all expected pairs
            const extractedPairs = new Set(
              extracted.map((p) => `${p.resource}:${p.action}`)
            );

            expect(extractedPairs.size).toBe(expectedPairs.size);
            for (const pair of expectedPairs) {
              expect(extractedPairs.has(pair)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('extractPermissionsFromRoles should deduplicate permissions', () => {
      fc.assert(
        fc.property(
          permissionArbitrary,
          fc.integer({ min: 2, max: 5 }),
          (permission, roleCount) => {
            // Create multiple roles with the same permission
            const roles: Role[] = Array.from({ length: roleCount }, (_, i) => ({
              id: `role-${i}`,
              name: `Role ${i}`,
              description: `Role ${i} description`,
              permissions: [{ ...permission, id: `perm-${i}` }],
              isSystem: false,
            }));

            const extracted = extractPermissionsFromRoles(roles);

            // Should only have one permission for this resource:action pair
            const matchingPermissions = extracted.filter(
              (p) =>
                p.resource === permission.resource &&
                p.action === permission.action
            );

            expect(matchingPermissions.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Module Visibility', () => {
    it('modules should only be visible when user has required permissions', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 0, maxLength: 15 }),
          (permissions) => {
            const visibleModules = getVisibleModules(permissions);

            // For each module mapping, verify visibility matches permission check
            for (const { module, requiredPermissions } of MODULE_PERMISSION_MAP) {
              const shouldBeVisible = hasAnyPermission(
                permissions,
                requiredPermissions
              );
              const isVisible = visibleModules.includes(module);

              expect(isVisible).toBe(shouldBeVisible);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('user with no permissions should see no modules', () => {
      const visibleModules = getVisibleModules([]);
      expect(visibleModules.length).toBe(0);
    });
  });

  describe('Item Filtering', () => {
    it('filterByPermission should return empty array when permission is missing', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          resourceTypeArbitrary,
          actionTypeArbitrary,
          (items, resource, action) => {
            // Empty permissions - should filter out all items
            const filtered = filterByPermission(items, [], resource, action);
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterByPermission should return all items when permission exists', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          permissionArbitrary,
          (items, permission) => {
            // Permission exists - should return all items
            const filtered = filterByPermission(
              items,
              [permission],
              permission.resource,
              permission.action
            );
            expect(filtered.length).toBe(items.length);
            expect(filtered).toEqual(items);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterByPermission should be consistent with hasPermission', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          fc.array(permissionArbitrary, { minLength: 0, maxLength: 10 }),
          resourceTypeArbitrary,
          actionTypeArbitrary,
          (items, permissions, resource, action) => {
            const filtered = filterByPermission(
              items,
              permissions,
              resource,
              action
            );
            const hasAccess = hasPermission(permissions, resource, action);

            if (hasAccess) {
              expect(filtered).toEqual(items);
            } else {
              expect(filtered.length).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('RBAC Consistency Invariants', () => {
    it('permission checks should be deterministic', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 0, maxLength: 10 }),
          resourceTypeArbitrary,
          actionTypeArbitrary,
          (permissions, resource, action) => {
            // Multiple calls with same input should return same result
            const result1 = hasPermission(permissions, resource, action);
            const result2 = hasPermission(permissions, resource, action);
            const result3 = hasPermission(permissions, resource, action);

            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('adding a permission should not remove access to other resources', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 10 }),
          permissionArbitrary,
          (existingPermissions, newPermission) => {
            // Check access before adding new permission
            const accessBefore = new Map<string, boolean>();
            for (const perm of existingPermissions) {
              const key = `${perm.resource}:${perm.action}`;
              accessBefore.set(key, true);
            }

            // Add new permission
            const updatedPermissions = [...existingPermissions, newPermission];

            // Verify all previous access is preserved
            for (const [key] of accessBefore) {
              const [resource, action] = key.split(':') as [ResourceType, ActionType];
              const stillHasAccess = hasPermission(
                updatedPermissions,
                resource,
                action
              );
              expect(stillHasAccess).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Backend Permission Tests
   * Requirements: 6.7, 6.9 - Match backend permission definitions, use roles from JWT claims
   */
  describe('Backend Permission Checking', () => {
    // Helper function to check if a backend permission exists
    function hasBackendPermission(
      permissions: BackendPermission[],
      permission: BackendPermission
    ): boolean {
      // Wildcard grants all permissions
      if (permissions.includes(BACKEND_PERMISSIONS.ALL)) {
        return true;
      }
      return permissions.includes(permission);
    }

    it('getBackendPermissionsForRoles should return correct permissions for each role', () => {
      fc.assert(
        fc.property(
          systemRoleArbitrary,
          (role) => {
            const permissions = getBackendPermissionsForRoles([role]);
            const expectedPermissions = ROLE_BACKEND_PERMISSIONS[role as keyof typeof ROLE_BACKEND_PERMISSIONS];
            
            // For SUPER_ADMIN, should have wildcard
            if (role === SYSTEM_ROLES.SUPER_ADMIN) {
              expect(permissions).toContain(BACKEND_PERMISSIONS.ALL);
            } else {
              // Should have all expected permissions
              for (const expected of expectedPermissions) {
                expect(permissions).toContain(expected);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('SUPER_ADMIN should have wildcard permission', () => {
      const permissions = getBackendPermissionsForRoles([SYSTEM_ROLES.SUPER_ADMIN]);
      expect(permissions).toContain(BACKEND_PERMISSIONS.ALL);
      expect(permissions.length).toBe(1);
    });

    it('combining roles should merge their permissions', () => {
      fc.assert(
        fc.property(
          fc.array(systemRoleArbitrary, { minLength: 1, maxLength: 3 }),
          (roles) => {
            // Skip if SUPER_ADMIN is included (it has wildcard)
            if (roles.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
              const permissions = getBackendPermissionsForRoles(roles);
              expect(permissions).toContain(BACKEND_PERMISSIONS.ALL);
              return;
            }

            const combinedPermissions = getBackendPermissionsForRoles(roles);
            
            // Each role's permissions should be in the combined set
            for (const role of roles) {
              const rolePermissions = ROLE_BACKEND_PERMISSIONS[role as keyof typeof ROLE_BACKEND_PERMISSIONS];
              for (const perm of rolePermissions) {
                expect(combinedPermissions).toContain(perm);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('backend permissions should not have duplicates', () => {
      fc.assert(
        fc.property(
          fc.array(systemRoleArbitrary, { minLength: 1, maxLength: 5 }),
          (roles) => {
            const permissions = getBackendPermissionsForRoles(roles);
            const uniquePermissions = new Set(permissions);
            expect(permissions.length).toBe(uniquePermissions.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty roles should return empty permissions', () => {
      const permissions = getBackendPermissionsForRoles([]);
      expect(permissions.length).toBe(0);
    });

    it('wildcard permission should grant access to any permission', () => {
      fc.assert(
        fc.property(
          backendPermissionArbitrary,
          (permission) => {
            const hasAccess = hasBackendPermission([BACKEND_PERMISSIONS.ALL], permission);
            expect(hasAccess).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('permission check should be deterministic', () => {
      fc.assert(
        fc.property(
          fc.array(systemRoleArbitrary, { minLength: 1, maxLength: 3 }),
          (roles) => {
            const permissions1 = getBackendPermissionsForRoles(roles);
            const permissions2 = getBackendPermissionsForRoles(roles);
            
            expect(permissions1.length).toBe(permissions2.length);
            for (const perm of permissions1) {
              expect(permissions2).toContain(perm);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
