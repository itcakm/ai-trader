'use client';

import React, { useState } from 'react';
import { MemberManagement } from '@/components/organization/MemberManagement';
import { MemberInviteForm } from '@/components/organization/MemberInviteForm';
import { DepartmentManagement } from '@/components/organization/DepartmentManagement';
import { Button } from '@/components/ui/Button';

type Tab = 'members' | 'departments';

export default function MembersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const [showInvite, setShowInvite] = useState(false);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'members', label: 'Members' },
    { id: 'departments', label: 'Departments' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team Members</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage team members and departments</p>
        </div>
        {activeTab === 'members' && (
          <Button onClick={() => setShowInvite(true)}>Invite Member</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Invite Team Member</h2>
            <MemberInviteForm onSuccess={() => setShowInvite(false)} onCancel={() => setShowInvite(false)} />
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div>
        {activeTab === 'members' && <MemberManagement />}
        {activeTab === 'departments' && <DepartmentManagement />}
      </div>
    </div>
  );
}
