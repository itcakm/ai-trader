'use client';

import React from 'react';
import { AccountSettings } from '@/components/organization/AccountSettings';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your account preferences</p>
      </div>

      <AccountSettings />
    </div>
  );
}
