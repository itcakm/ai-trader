'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PermissionGate } from './PermissionGate';
import type { Role } from '@/types/rbac';
import { SYSTEM_ROLES } from '@/types/rbac';

interface RoleListProps {
  roles: Role[];
  onCreateRole?: () => void;
  onEditRole?: (role: Role) => void;
  onDeleteRole?: (role: Role) => void;
  loading?: boolean;
}

/**
 * RoleList - Displays a list of roles with actions
 */
export function RoleList({
  roles,
  onCreateRole,
  onEditRole,
  onDeleteRole,
  loading = false,
}: RoleListProps) {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const systemRoleNames = Object.values(SYSTEM_ROLES);

  const isSystemRole = (role: Role) =>
    role.isSystem || systemRoleNames.includes(role.name as typeof systemRoleNames[number]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Roles</CardTitle>
        <PermissionGate resource="role" action="create">
          <Button onClick={onCreateRole} size="sm">
            Create Role
          </Button>
        </PermissionGate>
      </CardHeader>
      <CardContent className="p-0">
        {roles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No roles found. Create your first role to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {roles.map((role) => (
              <div
                key={role.id}
                className={`
                  p-4 flex items-center justify-between
                  hover:bg-muted/50 cursor-pointer transition-colors
                  ${selectedRole?.id === role.id ? 'bg-muted/50' : ''}
                `}
                onClick={() => setSelectedRole(role)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {role.name}
                    </span>
                    {isSystemRole(role) && (
                      <Badge variant="info">System</Badge>
                    )}
                    {role.organizationId && (
                      <Badge variant="default">Custom</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {role.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {role.permissions.length} permission
                    {role.permissions.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PermissionGate resource="role" action="update">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditRole?.(role);
                      }}
                    >
                      Edit
                    </Button>
                  </PermissionGate>
                  {!isSystemRole(role) && (
                    <PermissionGate resource="role" action="delete">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRole?.(role);
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </Button>
                    </PermissionGate>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RoleList;
