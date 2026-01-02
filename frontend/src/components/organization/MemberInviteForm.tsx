'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { useOrganization } from '@/providers/OrganizationProvider';
import type { MemberInviteInput } from '@/types/organization';

interface MemberInviteFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const AVAILABLE_ROLES = [
  { id: 'admin', name: 'Admin', description: 'Full access to all features' },
  { id: 'trader', name: 'Trader', description: 'Can execute trades and manage strategies' },
  { id: 'analyst', name: 'Analyst', description: 'Can view data and create reports' },
  { id: 'viewer', name: 'Viewer', description: 'Read-only access' },
];

export function MemberInviteForm({ onSuccess, onCancel }: MemberInviteFormProps) {
  const { organization, inviteMember, isLoading, error } = useOrganization();
  const [formData, setFormData] = useState<MemberInviteInput>({
    email: '',
    name: '',
    roleIds: ['viewer'],
    departmentId: undefined,
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof MemberInviteInput, string>>>({});

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof MemberInviteInput, string>> = {};

    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }

    if (!formData.name) {
      errors.name = 'Name is required';
    }

    if (formData.roleIds.length === 0) {
      errors.roleIds = 'At least one role is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      await inviteMember(formData);
      onSuccess?.();
    } catch {
      // Error handled by provider
    }
  };

  const handleRoleToggle = (roleId: string) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Invite Team Member</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
              {error}
            </div>
          )}

          <Input
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            error={formErrors.email}
            placeholder="colleague@company.com"
            disabled={isLoading}
          />

          <Input
            label="Full Name"
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="Enter their name"
            disabled={isLoading}
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Assign Roles
            </label>
            <div className="space-y-2">
              {AVAILABLE_ROLES.map((role) => (
                <label
                  key={role.id}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.roleIds.includes(role.id)
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-border hover:border-primary-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.roleIds.includes(role.id)}
                    onChange={() => handleRoleToggle(role.id)}
                    className="mt-1 h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                    disabled={isLoading}
                  />
                  <div>
                    <p className="font-medium text-foreground">{role.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {role.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            {formErrors.roleIds && (
              <p className="mt-1 text-sm text-red-500">{formErrors.roleIds}</p>
            )}
          </div>

          {organization && organization.departments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Department (Optional)
              </label>
              <select
                value={formData.departmentId || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    departmentId: e.target.value || undefined,
                  }))
                }
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isLoading}
              >
                <option value="">No department</option>
                {organization.departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={isLoading}>
            Send Invitation
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
