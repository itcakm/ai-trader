'use client';

import React from 'react';
import { AuditLogViewer } from '@/components/audit/AuditLogViewer';

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
        <p className="text-gray-600 dark:text-gray-400">View system activity and audit trail</p>
      </div>

      <AuditLogViewer />
    </div>
  );
}
