'use client';

import React from 'react';
import { RoleManagement } from '@/components/rbac/RoleManagement';

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Role Management</h1>
        <p className="text-gray-600 dark:text-gray-400">Configure roles and permissions</p>
      </div>

      <RoleManagement />
    </div>
  );
}
