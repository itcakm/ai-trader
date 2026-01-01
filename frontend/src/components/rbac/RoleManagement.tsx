'use client';

import React, { useState, useCallback } from 'react';
import { RoleList } from './RoleList';
import { RoleForm } from './RoleForm';
import { PermissionGate, PermissionDenied } from './PermissionGate';
import type { Role, CreateRoleInput, UpdateRoleInput } from '@/types/rbac';
import { SYSTEM_ROLES } from '@/types/rbac';

// Predefined system roles with default permissions
const PREDEFINED_ROLES: Role[] = [
  {
    id: 'role-admin',
    name: SYSTEM_ROLES.ADMIN,
    description: 'Full system access with all permissions',
    isSystem: true,
    permissions: [
      { id: 'p1', resource: 'strategy', action: 'create' },
      { id: 'p2', resource: 'strategy', action: 'read' },
      { id: 'p3', resource: 'strategy', action: 'update' },
      { id: 'p4', resource: 'strategy', action: 'delete' },
      { id: 'p5', resource: 'order', action: 'create' },
      { id: 'p6', resource: 'order', action: 'read' },
      { id: 'p7', resource: 'order', action: 'update' },
      { id: 'p8', resource: 'order', action: 'delete' },
      { id: 'p9', resource: 'order', action: 'execute' },
      { id: 'p10', resource: 'user', action: 'create' },
      { id: 'p11', resource: 'user', action: 'read' },
      { id: 'p12', resource: 'user', action: 'update' },
      { id: 'p13', resource: 'user', action: 'delete' },
      { id: 'p14', resource: 'role', action: 'create' },
      { id: 'p15', resource: 'role', action: 'read' },
      { id: 'p16', resource: 'role', action: 'update' },
      { id: 'p17', resource: 'role', action: 'delete' },
      { id: 'p18', resource: 'audit_log', action: 'read' },
      { id: 'p19', resource: 'audit_log', action: 'export' },
      { id: 'p20', resource: 'report', action: 'read' },
      { id: 'p21', resource: 'report', action: 'create' },
      { id: 'p22', resource: 'report', action: 'export' },
    ],
  },
  {
    id: 'role-trader',
    name: SYSTEM_ROLES.TRADER,
    description: 'Can create and execute trading strategies and orders',
    isSystem: true,
    permissions: [
      { id: 'p1', resource: 'strategy', action: 'create' },
      { id: 'p2', resource: 'strategy', action: 'read' },
      { id: 'p3', resource: 'strategy', action: 'update' },
      { id: 'p4', resource: 'order', action: 'create' },
      { id: 'p5', resource: 'order', action: 'read' },
      { id: 'p6', resource: 'order', action: 'update' },
      { id: 'p7', resource: 'order', action: 'execute' },
      { id: 'p8', resource: 'position', action: 'read' },
      { id: 'p9', resource: 'market_data', action: 'read' },
      { id: 'p10', resource: 'risk_control', action: 'read' },
    ],
  },
  {
    id: 'role-analyst',
    name: SYSTEM_ROLES.ANALYST,
    description: 'Can view data and create reports, but cannot execute trades',
    isSystem: true,
    permissions: [
      { id: 'p1', resource: 'strategy', action: 'read' },
      { id: 'p2', resource: 'order', action: 'read' },
      { id: 'p3', resource: 'position', action: 'read' },
      { id: 'p4', resource: 'market_data', action: 'read' },
      { id: 'p5', resource: 'ai_model', action: 'read' },
      { id: 'p6', resource: 'risk_control', action: 'read' },
      { id: 'p7', resource: 'report', action: 'read' },
      { id: 'p8', resource: 'report', action: 'create' },
      { id: 'p9', resource: 'report', action: 'export' },
    ],
  },
  {
    id: 'role-viewer',
    name: SYSTEM_ROLES.VIEWER,
    description: 'Read-only access to view system data',
    isSystem: true,
    permissions: [
      { id: 'p1', resource: 'strategy', action: 'read' },
      { id: 'p2', resource: 'order', action: 'read' },
      { id: 'p3', resource: 'position', action: 'read' },
      { id: 'p4', resource: 'market_data', action: 'read' },
      { id: 'p5', resource: 'report', action: 'read' },
    ],
  },
];

type ViewMode = 'list' | 'create' | 'edit';

interface RoleManagementProps {
  /**
   * Initial custom roles (in addition to predefined system roles)
   */
  initialCustomRoles?: Role[];
  /**
   * Callback when a role is created
   */
  onRoleCreate?: (role: CreateRoleInput) => Promise<Role>;
  /**
   * Callback when a role is updated
   */
  onRoleUpdate?: (role: UpdateRoleInput) => Promise<Role>;
  /**
   * Callback when a role is deleted
   */
  onRoleDelete?: (roleId: string) => Promise<void>;
}

/**
 * RoleManagement - Complete role management interface
 * 
 * Features:
 * - List all roles (predefined and custom)
 * - Create new custom roles
 * - Edit existing roles
 * - Delete custom roles (system roles cannot be deleted)
 * - Granular permission assignment
 */
export function RoleManagement({
  initialCustomRoles = [],
  onRoleCreate,
  onRoleUpdate,
  onRoleDelete,
}: RoleManagementProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [customRoles, setCustomRoles] = useState<Role[]>(initialCustomRoles);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Role | null>(null);

  // Combine predefined and custom roles
  const allRoles = [...PREDEFINED_ROLES, ...customRoles];

  const handleCreateRole = useCallback(() => {
    setEditingRole(null);
    setViewMode('create');
  }, []);

  const handleEditRole = useCallback((role: Role) => {
    setEditingRole(role);
    setViewMode('edit');
  }, []);

  const handleDeleteRole = useCallback((role: Role) => {
    setDeleteConfirm(role);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    setLoading(true);
    try {
      if (onRoleDelete) {
        await onRoleDelete(deleteConfirm.id);
      }
      setCustomRoles((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } finally {
      setLoading(false);
    }
  }, [deleteConfirm, onRoleDelete]);

  const handleSubmit = useCallback(
    async (data: CreateRoleInput | UpdateRoleInput) => {
      setLoading(true);
      try {
        if ('id' in data && data.id) {
          // Update existing role
          let updatedRole: Role;
          if (onRoleUpdate) {
            updatedRole = await onRoleUpdate(data);
          } else {
            // Mock update
            updatedRole = {
              ...editingRole!,
              name: data.name ?? editingRole!.name,
              description: data.description ?? editingRole!.description,
              permissions: data.permissions?.map((p, i) => ({
                ...p,
                id: `p${i}`,
              })) ?? editingRole!.permissions,
            };
          }

          // Update in predefined or custom roles
          if (PREDEFINED_ROLES.some((r) => r.id === updatedRole.id)) {
            // Can't actually update predefined roles in this mock
          } else {
            setCustomRoles((prev) =>
              prev.map((r) => (r.id === updatedRole.id ? updatedRole : r))
            );
          }
        } else {
          // Create new role
          let newRole: Role;
          if (onRoleCreate) {
            newRole = await onRoleCreate(data as CreateRoleInput);
          } else {
            // Mock create
            newRole = {
              id: `role-${Date.now()}`,
              name: data.name!,
              description: data.description!,
              permissions: data.permissions!.map((p, i) => ({
                ...p,
                id: `p${i}`,
              })),
              isSystem: false,
            };
          }
          setCustomRoles((prev) => [...prev, newRole]);
        }
        setViewMode('list');
        setEditingRole(null);
      } finally {
        setLoading(false);
      }
    },
    [editingRole, onRoleCreate, onRoleUpdate]
  );

  const handleCancel = useCallback(() => {
    setViewMode('list');
    setEditingRole(null);
  }, []);

  return (
    <PermissionGate
      resource="role"
      action="read"
      fallback={<PermissionDenied message="You do not have permission to manage roles." />}
    >
      <div className="space-y-6">
        {viewMode === 'list' && (
          <RoleList
            roles={allRoles}
            onCreateRole={handleCreateRole}
            onEditRole={handleEditRole}
            onDeleteRole={handleDeleteRole}
            loading={loading}
          />
        )}

        {(viewMode === 'create' || viewMode === 'edit') && (
          <RoleForm
            role={editingRole ?? undefined}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Delete Role
              </h3>
              <p className="text-muted-foreground mb-4">
                Are you sure you want to delete the role &quot;{deleteConfirm.name}&quot;?
                This action cannot be undone. Users with this role will lose
                their associated permissions.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-md hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}

export default RoleManagement;
