/**
 * Feature: ui-implementation, Property 3: Permission Change Audit Trail
 * Validates: Requirements 2.6
 *
 * For any permission change operation (role assignment, permission modification),
 * an audit log entry SHALL be created containing the administrator ID, timestamp,
 * and both before and after permission values.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Permission, Role, PermissionChangeAudit } from '@/types/rbac';
import {
  createRoleAssignmentAudit,
  createRoleRemovalAudit,
  createPermissionAddedAudit,
  createPermissionRemovedAudit,
  createRoleCreatedAudit,
  createRoleUpdatedAudit,
  createRoleDeletedAudit,
  validateAuditEntry,
  comparePermissions,
} from './permission-audit';
import type { ResourceType, ActionType } from '@/types/rbac';

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

const adminArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
});

const userIdArbitrary = fc.uuid();
const roleIdArbitrary = fc.uuid();
const requestTrackingIdArbitrary = fc.string({ minLength: 10, maxLength: 50 });

describe('Property 3: Permission Change Audit Trail', () => {
  describe('Audit Entry Creation', () => {
    it('role assignment audit should contain admin ID, timestamp, and before/after values', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          userIdArbitrary,
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          (admin, targetUserId, beforeRoles, afterRoles) => {
            const audit = createRoleAssignmentAudit(
              admin.id,
              admin.name,
              targetUserId,
              beforeRoles,
              afterRoles
            );

            // Verify required fields
            expect(audit.adminId).toBe(admin.id);
            expect(audit.adminName).toBe(admin.name);
            expect(audit.targetUserId).toBe(targetUserId);
            expect(audit.timestamp).toBeInstanceOf(Date);
            expect(audit.changeType).toBe('role_assigned');
            expect(audit.requestTrackingId).toBeDefined();
            expect(audit.requestTrackingId.length).toBeGreaterThan(0);

            // Verify before/after values are present
            expect(audit.beforeValue).toBeDefined();
            expect(audit.afterValue).toBeDefined();

            // Validate the audit entry
            const validation = validateAuditEntry(audit);
            expect(validation.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('role removal audit should contain admin ID, timestamp, and before value', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          userIdArbitrary,
          roleArbitrary,
          (admin, targetUserId, removedRole) => {
            const audit = createRoleRemovalAudit(
              admin.id,
              admin.name,
              targetUserId,
              removedRole
            );

            expect(audit.adminId).toBe(admin.id);
            expect(audit.adminName).toBe(admin.name);
            expect(audit.targetUserId).toBe(targetUserId);
            expect(audit.timestamp).toBeInstanceOf(Date);
            expect(audit.changeType).toBe('role_removed');
            expect(audit.requestTrackingId).toBeDefined();
            expect(audit.beforeValue).toEqual(removedRole);
            expect(audit.afterValue).toBeNull();

            const validation = validateAuditEntry(audit);
            expect(validation.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('permission added audit should contain admin ID, timestamp, and after value', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          roleIdArbitrary,
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 5 }),
          (admin, targetRoleId, addedPermissions) => {
            const audit = createPermissionAddedAudit(
              admin.id,
              admin.name,
              targetRoleId,
              addedPermissions
            );

            expect(audit.adminId).toBe(admin.id);
            expect(audit.adminName).toBe(admin.name);
            expect(audit.targetRoleId).toBe(targetRoleId);
            expect(audit.timestamp).toBeInstanceOf(Date);
            expect(audit.changeType).toBe('permission_added');
            expect(audit.requestTrackingId).toBeDefined();
            expect(audit.beforeValue).toBeNull();
            expect(audit.afterValue).toEqual(addedPermissions);

            const validation = validateAuditEntry(audit);
            expect(validation.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('permission removed audit should contain admin ID, timestamp, and before value', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          roleIdArbitrary,
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 5 }),
          (admin, targetRoleId, removedPermissions) => {
            const audit = createPermissionRemovedAudit(
              admin.id,
              admin.name,
              targetRoleId,
              removedPermissions
            );

            expect(audit.adminId).toBe(admin.id);
            expect(audit.adminName).toBe(admin.name);
            expect(audit.targetRoleId).toBe(targetRoleId);
            expect(audit.timestamp).toBeInstanceOf(Date);
            expect(audit.changeType).toBe('permission_removed');
            expect(audit.requestTrackingId).toBeDefined();
            expect(audit.beforeValue).toEqual(removedPermissions);
            expect(audit.afterValue).toBeNull();

            const validation = validateAuditEntry(audit);
            expect(validation.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('role created audit should contain admin ID, timestamp, and after value', () => {
      fc.assert(
        fc.property(adminArbitrary, roleArbitrary, (admin, createdRole) => {
          const audit = createRoleCreatedAudit(admin.id, admin.name, createdRole);

          expect(audit.adminId).toBe(admin.id);
          expect(audit.adminName).toBe(admin.name);
          expect(audit.targetRoleId).toBe(createdRole.id);
          expect(audit.timestamp).toBeInstanceOf(Date);
          expect(audit.changeType).toBe('role_created');
          expect(audit.requestTrackingId).toBeDefined();
          expect(audit.beforeValue).toBeNull();
          expect(audit.afterValue).toEqual(createdRole);

          const validation = validateAuditEntry(audit);
          expect(validation.valid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('role updated audit should contain admin ID, timestamp, and before/after values', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          roleArbitrary,
          roleArbitrary,
          (admin, beforeRole, afterRole) => {
            // Ensure same role ID for update
            const updatedAfterRole = { ...afterRole, id: beforeRole.id };

            const audit = createRoleUpdatedAudit(
              admin.id,
              admin.name,
              beforeRole,
              updatedAfterRole
            );

            expect(audit.adminId).toBe(admin.id);
            expect(audit.adminName).toBe(admin.name);
            expect(audit.targetRoleId).toBe(updatedAfterRole.id);
            expect(audit.timestamp).toBeInstanceOf(Date);
            expect(audit.changeType).toBe('role_updated');
            expect(audit.requestTrackingId).toBeDefined();
            expect(audit.beforeValue).toEqual(beforeRole);
            expect(audit.afterValue).toEqual(updatedAfterRole);

            const validation = validateAuditEntry(audit);
            expect(validation.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('role deleted audit should contain admin ID, timestamp, and before value', () => {
      fc.assert(
        fc.property(adminArbitrary, roleArbitrary, (admin, deletedRole) => {
          const audit = createRoleDeletedAudit(admin.id, admin.name, deletedRole);

          expect(audit.adminId).toBe(admin.id);
          expect(audit.adminName).toBe(admin.name);
          expect(audit.targetRoleId).toBe(deletedRole.id);
          expect(audit.timestamp).toBeInstanceOf(Date);
          expect(audit.changeType).toBe('role_deleted');
          expect(audit.requestTrackingId).toBeDefined();
          expect(audit.beforeValue).toEqual(deletedRole);
          expect(audit.afterValue).toBeNull();

          const validation = validateAuditEntry(audit);
          expect(validation.valid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Request Tracking ID', () => {
    it('audit entries should use provided request tracking ID when given', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          userIdArbitrary,
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          requestTrackingIdArbitrary,
          (admin, targetUserId, beforeRoles, afterRoles, trackingId) => {
            const audit = createRoleAssignmentAudit(
              admin.id,
              admin.name,
              targetUserId,
              beforeRoles,
              afterRoles,
              trackingId
            );

            expect(audit.requestTrackingId).toBe(trackingId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('audit entries should generate unique request tracking IDs when not provided', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          userIdArbitrary,
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          (admin, targetUserId, beforeRoles, afterRoles) => {
            const audit1 = createRoleAssignmentAudit(
              admin.id,
              admin.name,
              targetUserId,
              beforeRoles,
              afterRoles
            );
            const audit2 = createRoleAssignmentAudit(
              admin.id,
              admin.name,
              targetUserId,
              beforeRoles,
              afterRoles
            );

            // Each audit should have a unique tracking ID
            expect(audit1.requestTrackingId).not.toBe(audit2.requestTrackingId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Audit Entry Validation', () => {
    it('valid audit entries should pass validation', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          userIdArbitrary,
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(roleArbitrary, { minLength: 0, maxLength: 3 }),
          (admin, targetUserId, beforeRoles, afterRoles) => {
            const audit = createRoleAssignmentAudit(
              admin.id,
              admin.name,
              targetUserId,
              beforeRoles,
              afterRoles
            );

            const validation = validateAuditEntry(audit);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('audit entries missing required fields should fail validation', () => {
      // Test with missing adminId
      const invalidAudit: PermissionChangeAudit = {
        id: 'test-id',
        timestamp: new Date(),
        adminId: '', // Empty - should fail
        adminName: 'Test Admin',
        changeType: 'role_assigned',
        targetUserId: 'user-123',
        beforeValue: [],
        afterValue: [],
        requestTrackingId: 'req-123',
      };

      const validation = validateAuditEntry(invalidAudit);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Permission Comparison', () => {
    it('comparePermissions should correctly identify added permissions', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 0, maxLength: 5 }),
          fc.array(permissionArbitrary, { minLength: 1, maxLength: 5 }),
          (before, additionalPerms) => {
            // Create after by adding new permissions
            const after = [...before, ...additionalPerms];

            const { added, removed, unchanged } = comparePermissions(before, after);

            // All original permissions should be unchanged or in added
            const beforeKeys = new Set(
              before.map((p) => `${p.resource}:${p.action}`)
            );
            const afterKeys = new Set(
              after.map((p) => `${p.resource}:${p.action}`)
            );

            // Added should contain permissions in after but not in before
            for (const perm of added) {
              const key = `${perm.resource}:${perm.action}`;
              expect(beforeKeys.has(key)).toBe(false);
              expect(afterKeys.has(key)).toBe(true);
            }

            // Unchanged should contain permissions in both
            for (const perm of unchanged) {
              const key = `${perm.resource}:${perm.action}`;
              expect(beforeKeys.has(key)).toBe(true);
              expect(afterKeys.has(key)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('comparePermissions should correctly identify removed permissions', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 2, maxLength: 10 }),
          (permissions) => {
            // Remove some permissions
            const before = permissions;
            const after = permissions.slice(0, Math.floor(permissions.length / 2));

            const { added, removed } = comparePermissions(before, after);

            const beforeKeys = new Set(
              before.map((p) => `${p.resource}:${p.action}`)
            );
            const afterKeys = new Set(
              after.map((p) => `${p.resource}:${p.action}`)
            );

            // Removed should contain permissions in before but not in after
            for (const perm of removed) {
              const key = `${perm.resource}:${perm.action}`;
              expect(beforeKeys.has(key)).toBe(true);
              expect(afterKeys.has(key)).toBe(false);
            }

            // Added should be empty when only removing
            expect(added.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('comparePermissions with identical sets should have no changes', () => {
      fc.assert(
        fc.property(
          fc.array(permissionArbitrary, { minLength: 0, maxLength: 10 }),
          (permissions) => {
            const { added, removed, unchanged } = comparePermissions(
              permissions,
              permissions
            );

            expect(added.length).toBe(0);
            expect(removed.length).toBe(0);
            expect(unchanged.length).toBe(permissions.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Audit Trail Completeness', () => {
    it('all audit entries should have unique IDs', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          fc.array(roleArbitrary, { minLength: 1, maxLength: 5 }),
          (admin, roles) => {
            const audits: PermissionChangeAudit[] = [];

            // Create multiple audit entries
            for (const role of roles) {
              audits.push(createRoleCreatedAudit(admin.id, admin.name, role));
            }

            // All IDs should be unique
            const ids = audits.map((a) => a.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('audit timestamps should be in chronological order when created sequentially', () => {
      fc.assert(
        fc.property(
          adminArbitrary,
          fc.array(roleArbitrary, { minLength: 2, maxLength: 5 }),
          (admin, roles) => {
            const audits: PermissionChangeAudit[] = [];

            // Create audit entries sequentially
            for (const role of roles) {
              audits.push(createRoleCreatedAudit(admin.id, admin.name, role));
            }

            // Timestamps should be non-decreasing
            for (let i = 1; i < audits.length; i++) {
              expect(audits[i].timestamp.getTime()).toBeGreaterThanOrEqual(
                audits[i - 1].timestamp.getTime()
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
