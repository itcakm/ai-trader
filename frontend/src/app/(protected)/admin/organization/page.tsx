'use client';

import React from 'react';
import { OrganizationSettings } from '@/components/organization/OrganizationSettings';

export default function OrganizationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Organization Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your organization configuration</p>
      </div>

      <OrganizationSettings />
    </div>
  );
}
