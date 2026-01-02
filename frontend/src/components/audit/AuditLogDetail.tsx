'use client';

import React, { useState } from 'react';
import type { AuditLogEntry } from '@/types/audit';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

/**
 * Props for AuditLogDetail component
 */
export interface AuditLogDetailProps {
  /** The audit log entry to display */
  entry: AuditLogEntry;
  /** Callback to close the detail view */
  onClose?: () => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(empty)';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Get severity badge variant
 */
function getSeverityVariant(severity: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * AuditLogDetail - Detailed view of a single audit log entry
 * 
 * Displays:
 * - Full entry metadata
 * - Before/after values for changes
 * - Request tracking ID
 * - Additional metadata
 * 
 * Validates: Requirements 11.3
 */
export function AuditLogDetail({
  entry,
  onClose,
  className = '',
}: AuditLogDetailProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  const hasChanges = entry.beforeValue !== undefined || entry.afterValue !== undefined;

  return (
    <div
      className={`bg-background border border-border rounded-lg shadow-lg ${className}`}
      role="dialog"
      aria-label={`Audit log detail: ${entry.action}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Audit Log Detail</h3>
          <Badge variant={getSeverityVariant(entry.severity)}>
            {entry.severity}
          </Badge>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
            aria-label="Close detail view"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground">Entry ID</label>
            <p className="font-mono text-sm">{entry.id}</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Timestamp</label>
            <p className="text-sm">
              {entry.timestamp.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'long',
              })}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">User</label>
            <p className="text-sm">
              {entry.userName}{' '}
              <span className="text-muted-foreground">({entry.userId})</span>
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Action</label>
            <p className="text-sm font-medium">{entry.action}</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Module</label>
            <p className="text-sm">{entry.module.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Resource</label>
            <p className="text-sm">
              {entry.resource}{' '}
              <span className="text-muted-foreground">({entry.resourceId})</span>
            </p>
          </div>
        </div>

        {/* Request Tracking ID */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <label className="text-sm text-muted-foreground">Request Tracking ID</label>
          <p className="font-mono text-sm select-all">{entry.requestTrackingId}</p>
        </div>

        {/* Before/After Values */}
        {hasChanges && (
          <div className="space-y-3">
            <h4 className="font-medium">Changes</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Before Value */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  Before
                </label>
                <pre className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm overflow-x-auto max-h-48">
                  {formatValue(entry.beforeValue)}
                </pre>
              </div>

              {/* After Value */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  After
                </label>
                <pre className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm overflow-x-auto max-h-48">
                  {formatValue(entry.afterValue)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Additional Metadata */}
        {(entry.ipAddress || entry.userAgent || entry.metadata) && (
          <div className="space-y-3">
            <h4 className="font-medium">Additional Information</h4>
            <div className="space-y-2">
              {entry.ipAddress && (
                <div>
                  <label className="text-sm text-muted-foreground">IP Address</label>
                  <p className="font-mono text-sm">{entry.ipAddress}</p>
                </div>
              )}
              {entry.userAgent && (
                <div>
                  <label className="text-sm text-muted-foreground">User Agent</label>
                  <p className="text-sm text-muted-foreground truncate">
                    {entry.userAgent}
                  </p>
                </div>
              )}
              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <div>
                  <label className="text-sm text-muted-foreground">Metadata</label>
                  <pre className="p-3 bg-muted/50 rounded-lg text-sm overflow-x-auto">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Raw JSON Toggle */}
        <div className="pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRawJson(!showRawJson)}
          >
            {showRawJson ? 'Hide' : 'Show'} Raw JSON
          </Button>
          {showRawJson && (
            <pre className="mt-2 p-3 bg-muted/50 rounded-lg text-xs overflow-x-auto max-h-64">
              {JSON.stringify(entry, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuditLogDetail;
