/**
 * Feature: ui-implementation, Property 2: Session Permission Retrieval
 * Validates: Requirements 1.2, 2.5
 *
 * For any successful user login, the resulting session SHALL contain exactly
 * the roles and permissions configured for that user, including any user-level
 * overrides of organization-level permissions.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Role, Permission, ResourceType, ActionType } from '@/types/auth';
import { mergePermissions } from './AuthProvider';

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


describe('Property 2: Session Permission Retrieval', () => {
  it('merged permissions should contain all permissions from all roles', () => {
    fc.assert(
      fc.property(
        fc.array(roleArbitrary, { minLength: 1, maxLength: 5 }),
        (roles) => {
          const mergedPermissions = mergePermissions(roles);

          // Collect all unique resource:action pairs from roles
          const expectedPairs = new Set<string>();
          for (const role of roles) {
            for (const permission of role.permissions) {
              expectedPairs.add(`${permission.resource}:${permission.action}`);
            }
          }

          // Verify merged permissions contain all expected pairs
          const mergedPairs = new Set(
            mergedPermissions.map((p) => `${p.resource}:${p.action}`)
          );

          // Every expected pair should be in merged permissions
          for (const pair of expectedPairs) {
            expect(mergedPairs.has(pair)).toBe(true);
          }

          // Merged permissions should not have duplicates
          expect(mergedPermissions.length).toBe(mergedPairs.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('user-level overrides should take precedence over role permissions', () => {
    fc.assert(
      fc.property(
        fc.array(roleArbitrary, { minLength: 1, maxLength: 3 }),
        fc.array(permissionArbitrary, { minLength: 1, maxLength: 5 }),
        (roles, userOverrides) => {
          const mergedPermissions = mergePermissions(roles, userOverrides);

          // For each unique resource:action in user overrides, verify it's in the merged result
          // and that the merged permission comes from overrides (not roles)
          const overridesByKey = new Map<string, Permission>();
          for (const override of userOverrides) {
            const key = `${override.resource}:${override.action}`;
            // Last override for each key wins
            overridesByKey.set(key, override);
          }

          for (const [key, override] of overridesByKey) {
            const found = mergedPermissions.find(
              (p) => `${p.resource}:${p.action}` === key
            );

            // The override should be present
            expect(found).toBeDefined();

            // The found permission should be the last override (same id)
            expect(found?.id).toBe(override.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty roles should result in empty permissions', () => {
    const mergedPermissions = mergePermissions([]);
    expect(mergedPermissions).toEqual([]);
  });

  it('roles with empty permissions should not add any permissions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ maxLength: 200 }),
            permissions: fc.constant([]),
            isSystem: fc.boolean(),
            organizationId: fc.option(fc.uuid(), { nil: undefined }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (emptyRoles) => {
          const mergedPermissions = mergePermissions(emptyRoles);
          expect(mergedPermissions).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });


  it('merging permissions should be idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(roleArbitrary, { minLength: 1, maxLength: 5 }),
        (roles) => {
          const firstMerge = mergePermissions(roles);
          
          // Create a role from the first merge result
          const roleFromMerge: Role = {
            id: 'merged-role',
            name: 'Merged',
            description: 'Merged permissions',
            permissions: firstMerge,
            isSystem: false,
          };
          
          const secondMerge = mergePermissions([roleFromMerge]);

          // Both merges should have the same permissions
          expect(secondMerge.length).toBe(firstMerge.length);

          const firstPairs = new Set(
            firstMerge.map((p) => `${p.resource}:${p.action}`)
          );
          const secondPairs = new Set(
            secondMerge.map((p) => `${p.resource}:${p.action}`)
          );

          expect(firstPairs).toEqual(secondPairs);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('duplicate permissions across roles should be deduplicated', () => {
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

          const mergedPermissions = mergePermissions(roles);

          // Should only have one permission for this resource:action pair
          const matchingPermissions = mergedPermissions.filter(
            (p) =>
              p.resource === permission.resource && p.action === permission.action
          );

          expect(matchingPermissions.length).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('permission count should not exceed unique resource:action combinations', () => {
    fc.assert(
      fc.property(
        fc.array(roleArbitrary, { minLength: 1, maxLength: 10 }),
        fc.array(permissionArbitrary, { minLength: 0, maxLength: 10 }),
        (roles, userOverrides) => {
          const mergedPermissions = mergePermissions(roles, userOverrides);

          // Count unique resource:action pairs from all sources
          const allPairs = new Set<string>();
          for (const role of roles) {
            for (const permission of role.permissions) {
              allPairs.add(`${permission.resource}:${permission.action}`);
            }
          }
          for (const override of userOverrides) {
            allPairs.add(`${override.resource}:${override.action}`);
          }

          // Merged permissions should have exactly the unique count
          expect(mergedPermissions.length).toBe(allPairs.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});
