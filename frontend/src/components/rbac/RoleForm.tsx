'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Role, Permission, ResourceType, ActionType, CreateRoleInput, UpdateRoleInput } from '@/types/rbac';

// All available resources and actions
const RESOURCES: ResourceType[] = [
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
  'exchange',
];

const ACTIONS: ActionType[] = ['create', 'read', 'update', 'delete', 'execute', 'export'];

// Resource display names
const RESOURCE_LABELS: Record<ResourceType, string> = {
  strategy: 'Strategies',
  order: 'Orders',
  position: 'Positions',
  market_data: 'Market Data',
  ai_model: 'AI Models',
  risk_control: 'Risk Controls',
  report: 'Reports',
  audit_log: 'Audit Logs',
  user: 'Users',
  organization: 'Organization',
  role: 'Roles',
  exchange: 'Exchanges',
};

interface RoleFormProps {
  role?: Role;
  onSubmit: (data: CreateRoleInput | UpdateRoleInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

/**
 * RoleForm - Create or edit a role with granular permission assignment
 */
export function RoleForm({
  role,
  onSubmit,
  onCancel,
  loading = false,
}: RoleFormProps) {
  const isEditing = !!role;

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<Map<string, boolean>>(() => {
    const map = new Map<string, boolean>();
    if (role) {
      for (const perm of role.permissions) {
        map.set(`${perm.resource}:${perm.action}`, true);
      }
    }
    return map;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getPermissionKey = (resource: ResourceType, action: ActionType) =>
    `${resource}:${action}`;

  const hasPermission = (resource: ResourceType, action: ActionType) =>
    permissions.get(getPermissionKey(resource, action)) ?? false;

  const togglePermission = useCallback(
    (resource: ResourceType, action: ActionType) => {
      const key = getPermissionKey(resource, action);
      setPermissions((prev) => {
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.set(key, true);
        }
        return next;
      });
    },
    []
  );

  const toggleResourceAll = useCallback(
    (resource: ResourceType, enable: boolean) => {
      setPermissions((prev) => {
        const next = new Map(prev);
        for (const action of ACTIONS) {
          const key = getPermissionKey(resource, action);
          if (enable) {
            next.set(key, true);
          } else {
            next.delete(key);
          }
        }
        return next;
      });
    },
    []
  );

  const isResourceFullySelected = (resource: ResourceType) =>
    ACTIONS.every((action) => hasPermission(resource, action));

  const isResourcePartiallySelected = (resource: ResourceType) =>
    ACTIONS.some((action) => hasPermission(resource, action)) &&
    !isResourceFullySelected(resource);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Role name is required';
    } else if (name.length < 2) {
      newErrors.name = 'Role name must be at least 2 characters';
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (permissions.size === 0) {
      newErrors.permissions = 'At least one permission is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const permissionList: Omit<Permission, 'id'>[] = [];
    permissions.forEach((_, key) => {
      const [resource, action] = key.split(':') as [ResourceType, ActionType];
      permissionList.push({ resource, action });
    });

    if (isEditing && role) {
      await onSubmit({
        id: role.id,
        name: name.trim(),
        description: description.trim(),
        permissions: permissionList,
      });
    } else {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        permissions: permissionList,
      });
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Role' : 'Create Role'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <Input
              label="Role Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              placeholder="e.g., Senior Trader"
              disabled={role?.isSystem}
            />
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              placeholder="Describe what this role can do"
            />
          </div>

          {/* Permission Matrix */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">
              Permissions
            </h4>
            {errors.permissions && (
              <p className="text-sm text-red-500 mb-2">{errors.permissions}</p>
            )}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-medium">Resource</th>
                    {ACTIONS.map((action) => (
                      <th
                        key={action}
                        className="text-center p-3 font-medium capitalize"
                      >
                        {action}
                      </th>
                    ))}
                    <th className="text-center p-3 font-medium">All</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {RESOURCES.map((resource) => (
                    <tr key={resource} className="hover:bg-muted/50">
                      <td className="p-3 font-medium">
                        {RESOURCE_LABELS[resource]}
                      </td>
                      {ACTIONS.map((action) => (
                        <td key={action} className="text-center p-3">
                          <input
                            type="checkbox"
                            checked={hasPermission(resource, action)}
                            onChange={() => togglePermission(resource, action)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            aria-label={`${RESOURCE_LABELS[resource]} ${action}`}
                          />
                        </td>
                      ))}
                      <td className="text-center p-3">
                        <input
                          type="checkbox"
                          checked={isResourceFullySelected(resource)}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate = isResourcePartiallySelected(resource);
                            }
                          }}
                          onChange={(e) =>
                            toggleResourceAll(resource, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          aria-label={`Select all ${RESOURCE_LABELS[resource]} permissions`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEditing ? 'Save Changes' : 'Create Role'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default RoleForm;
