/**
 * Permission Audit Service
 * 
 * Tracks and logs all permission changes for audit compliance.
 * Validates: Requirements 2.6
 */

import type { Permission, Role, PermissionChangeAudit } from '@/types/rbac';

// Generate a unique request tracking ID
export function generateRequestTrackingId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Generate a unique audit entry ID
export function generateAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create an audit entry for a role assignment change
 */
export function createRoleAssignmentAudit(
  adminId: string,
  adminName: string,
  targetUserId: string,
  beforeRoles: Role[],
  afterRoles: Role[],
  requestTrackingId?: string
): PermissionChangeAudit {
  // Extract permissions from roles for before/after comparison
  const beforePermissions = extractPermissionsFromRoles(beforeRoles);
  const afterPermissions = extractPermissionsFromRoles(afterRoles);

  return {
    id: generateAuditId(),
    timestamp: new Date(),
    adminId,
    adminName,
    targetUserId,
    changeType: 'role_assigned',
    beforeValue: beforePermissions,
    afterValue: afterPermissions,
    requestTrackingId: requestTrackingId ?? generateRequestTrackingId(),
  };
}

/**
 * Create an audit entry for a role removal
 */
export function createRoleRemovalAudit(
  adminId: string,
  adminName: string,
  targetUserId: string,
  removedRole: Role,
  requestTrackingId?: string
): PermissionChangeAudit {
  return {
    id: generateAuditId(),
    timestamp: new Date(),
    adminId,
    adminName,
    targetUserId,
    changeType: 'role_removed',
    beforeValue: removedRole,
    afterValue: null,
    requestTrackingId: requestTrackingId ?? generateRequestTrackingId(),
  };
}

/**
 * Create an audit entry for permission addition
 */
export function createPermissionAddedAudit(
  adminId: string,
  adminName: string,
  targetRoleId: string,
  addedPermissions: Permission[],
  requestTrackingId?: string
): PermissionChangeAudit {
  return {
    id: generateAuditId(),
    timestamp: new Date(),
    adminId,
    adminName,
    targetRoleId,
    changeType: 'permission_added',
    beforeValue: null,
    afterValue: addedPermissions,
    requestTrackingId: requestTrackingId ?? generateRequestTrackingId(),
  };
}

/**
 * Create an audit entry for permission removal
 */
export function createPermissionRemovedAudit(
  adminId: string,
  adminName: string,
  targetRoleId: string,
  removedPermissions: Permission[],
  requestTrackingId?: string
): PermissionChangeAudit {
  return {
    id: generateAuditId(),
    timestamp: new Date(),
    adminId,
    adminName,
    targetRoleId,
    changeType: 'permission_removed',
    beforeValue: removedPermissions,
    afterValue: null,
    requestTrackingId: requestTrackingId ?? generateRequestTrackingId(),
  };
}

/**
 * Create an audit entry for role creation
 */
export function createRoleCreatedAudit(
  adminId: string,
  adminName: string,
  createdRole: Role,
  requestTrackingId?: string
): PermissionChangeAudit {
  return {
    id: generateAuditId(),
    timestamp: new Date(),
    adminId,
    adminName,
    targetRoleId: createdRole.id,
    changeType: 'role_created',
    beforeValue: null,
    afterValue: createdRole,
    requestTrackingId: requestTrackingId ?? generateRequestTrackingId(),
  };
}

/**
 * Create an audit entry for role update
 */
export function createRoleUpdatedAudit(
  adminId: string,
  adminName: string,
  beforeRole: Role,
  afterRole: Role,
  requestTrackingId?: string
): PermissionChangeAudit {
  return {
    id: generateAuditId(),
    timestamp: new Date(),
    adminId,
    adminName,
    targetRoleId: afterRole.id,
    changeType: 'role_updated',
    beforeValue: beforeRole,
    afterValue: afterRole,
    requestTrackingId: requestTrackingId ?? generateRequestTrackingId(),
  };
}

/**
 * Create an audit entry for role deletion
 */
export function createRoleDeletedAudit(
  adminId: string,
  adminName: string,
  deletedRole: Role,
  requestTrackingId?: string
): PermissionChangeAudit {
  return {
    id: generateAuditId(),
    timestamp: new Date(),
    adminId,
    adminName,
    targetRoleId: deletedRole.id,
    changeType: 'role_deleted',
    beforeValue: deletedRole,
    afterValue: null,
    requestTrackingId: requestTrackingId ?? generateRequestTrackingId(),
  };
}

/**
 * Extract permissions from roles
 */
function extractPermissionsFromRoles(roles: Role[]): Permission[] {
  const permissionMap = new Map<string, Permission>();

  for (const role of roles) {
    for (const permission of role.permissions) {
      const key = `${permission.resource}:${permission.action}`;
      permissionMap.set(key, permission);
    }
  }

  return Array.from(permissionMap.values());
}

/**
 * Validate that an audit entry is complete and well-formed
 */
export function validateAuditEntry(audit: PermissionChangeAudit): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!audit.id) {
    errors.push('Audit entry must have an id');
  }

  if (!audit.timestamp) {
    errors.push('Audit entry must have a timestamp');
  }

  if (!audit.adminId) {
    errors.push('Audit entry must have an adminId');
  }

  if (!audit.adminName) {
    errors.push('Audit entry must have an adminName');
  }

  if (!audit.changeType) {
    errors.push('Audit entry must have a changeType');
  }

  if (!audit.requestTrackingId) {
    errors.push('Audit entry must have a requestTrackingId');
  }

  // Change type specific validation
  const changeTypesRequiringTarget = [
    'role_assigned',
    'role_removed',
  ];

  const changeTypesRequiringRoleTarget = [
    'permission_added',
    'permission_removed',
    'role_created',
    'role_updated',
    'role_deleted',
  ];

  if (changeTypesRequiringTarget.includes(audit.changeType) && !audit.targetUserId) {
    errors.push(`Change type '${audit.changeType}' requires targetUserId`);
  }

  if (changeTypesRequiringRoleTarget.includes(audit.changeType) && !audit.targetRoleId) {
    errors.push(`Change type '${audit.changeType}' requires targetRoleId`);
  }

  // Before/after value validation based on change type
  switch (audit.changeType) {
    case 'role_assigned':
    case 'role_updated':
      if (audit.beforeValue === undefined || audit.afterValue === undefined) {
        errors.push(`Change type '${audit.changeType}' requires both beforeValue and afterValue`);
      }
      break;
    case 'role_removed':
    case 'permission_removed':
    case 'role_deleted':
      if (audit.beforeValue === undefined) {
        errors.push(`Change type '${audit.changeType}' requires beforeValue`);
      }
      break;
    case 'permission_added':
    case 'role_created':
      if (audit.afterValue === undefined) {
        errors.push(`Change type '${audit.changeType}' requires afterValue`);
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Compare two permission sets and return the differences
 */
export function comparePermissions(
  before: Permission[],
  after: Permission[]
): {
  added: Permission[];
  removed: Permission[];
  unchanged: Permission[];
} {
  const beforeKeys = new Set(before.map((p) => `${p.resource}:${p.action}`));
  const afterKeys = new Set(after.map((p) => `${p.resource}:${p.action}`));

  const added = after.filter(
    (p) => !beforeKeys.has(`${p.resource}:${p.action}`)
  );
  const removed = before.filter(
    (p) => !afterKeys.has(`${p.resource}:${p.action}`)
  );
  const unchanged = before.filter((p) =>
    afterKeys.has(`${p.resource}:${p.action}`)
  );

  return { added, removed, unchanged };
}
