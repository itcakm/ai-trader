'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { useOrganization } from '@/providers/OrganizationProvider';
import type { Department, DepartmentInput } from '@/types/organization';

interface DepartmentFormProps {
  department?: Department;
  parentOptions: Department[];
  onSubmit: (data: DepartmentInput) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

function DepartmentForm({
  department,
  parentOptions,
  onSubmit,
  onCancel,
  isLoading,
}: DepartmentFormProps) {
  const [formData, setFormData] = useState<DepartmentInput>({
    name: department?.name || '',
    description: department?.description || '',
    parentId: department?.parentId,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Department name is required');
      return;
    }

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save department');
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          {department ? 'Edit Department' : 'Create Department'}
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
              {error}
            </div>
          )}

          <Input
            label="Department Name"
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="e.g., Trading Team"
            disabled={isLoading}
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description (Optional)
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Brief description of this department"
              className="w-full px-3 py-2 rounded-md bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              rows={3}
              disabled={isLoading}
            />
          </div>

          {parentOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Parent Department (Optional)
              </label>
              <select
                value={formData.parentId || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    parentId: e.target.value || undefined,
                  }))
                }
                className="w-full px-3 py-2 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isLoading}
              >
                <option value="">No parent (top-level)</option>
                {parentOptions
                  .filter((d) => d.id !== department?.id)
                  .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" loading={isLoading}>
            {department ? 'Save Changes' : 'Create Department'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

interface DepartmentRowProps {
  department: Department;
  level: number;
  onEdit: (dept: Department) => void;
  onDelete: (id: string) => void;
  isLoading: boolean;
}

function DepartmentRow({
  department,
  level,
  onEdit,
  onDelete,
  isLoading,
}: DepartmentRowProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = () => {
    onDelete(department.id);
    setShowConfirm(false);
  };

  return (
    <div
      className="flex items-center justify-between py-3 border-b border-border last:border-0"
      style={{ paddingLeft: `${level * 24}px` }}
    >
      <div>
        <p className="font-medium text-foreground">{department.name}</p>
        {department.description && (
          <p className="text-sm text-muted-foreground">{department.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {department.memberCount} member{department.memberCount !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(department)}
          disabled={isLoading}
        >
          Edit
        </Button>

        {showConfirm ? (
          <div className="flex gap-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isLoading}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirm(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfirm(true)}
            disabled={isLoading}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export function DepartmentManagement() {
  const {
    organization,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    isLoading,
    error,
  } = useOrganization();
  const [showForm, setShowForm] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | undefined>();

  if (!organization) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="py-8 text-center text-muted-foreground">
          No organization found. Please upgrade your account first.
        </CardContent>
      </Card>
    );
  }

  // Build hierarchical department list
  const buildHierarchy = (
    departments: Department[],
    parentId?: string,
    level = 0
  ): Array<{ department: Department; level: number }> => {
    const result: Array<{ department: Department; level: number }> = [];
    const children = departments.filter((d) => d.parentId === parentId);

    for (const child of children) {
      result.push({ department: child, level });
      result.push(...buildHierarchy(departments, child.id, level + 1));
    }

    return result;
  };

  const hierarchicalDepartments = buildHierarchy(organization.departments);

  const handleCreate = async (data: DepartmentInput) => {
    await createDepartment(data);
    setShowForm(false);
  };

  const handleUpdate = async (data: DepartmentInput) => {
    if (editingDepartment) {
      await updateDepartment(editingDepartment.id, data);
      setEditingDepartment(undefined);
      setShowForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDepartment(id);
  };

  const handleEdit = (dept: Department) => {
    setEditingDepartment(dept);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingDepartment(undefined);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Departments</CardTitle>
          <Button onClick={() => setShowForm(true)}>
            Create Department
          </Button>
        </CardHeader>
        <CardContent>
          {hierarchicalDepartments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No departments created yet. Create your first department to organize your team.
            </p>
          ) : (
            <div>
              {hierarchicalDepartments.map(({ department, level }) => (
                <DepartmentRow
                  key={department.id}
                  department={department}
                  level={level}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isLoading={isLoading}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <DepartmentForm
            department={editingDepartment}
            parentOptions={organization.departments}
            onSubmit={editingDepartment ? handleUpdate : handleCreate}
            onCancel={handleCancel}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  );
}
