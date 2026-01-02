'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

export interface AuditTrailEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  resource: string;
  resourceId: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  beforeValue?: unknown;
  afterValue?: unknown;
  requestTrackingId: string;
  ipAddress?: string;
}

export interface AuditTrailViewerProps {
  entries: AuditTrailEntry[];
  loading?: boolean;
  onRefresh?: () => void;
  onExport?: (format: 'CSV' | 'JSON') => void;
  onViewDetails?: (entry: AuditTrailEntry) => void;
}

const severityOptions = [
  { value: '', label: 'All Severities' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
];

const moduleOptions = [
  { value: '', label: 'All Modules' },
  { value: 'STRATEGY', label: 'Strategy' },
  { value: 'ORDER', label: 'Order' },
  { value: 'RISK', label: 'Risk' },
  { value: 'USER', label: 'User' },
  { value: 'EXCHANGE', label: 'Exchange' },
  { value: 'AI', label: 'AI' },
];

const severityVariant: Record<AuditTrailEntry['severity'], 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'error',
};

export function AuditTrailViewer({
  entries,
  loading = false,
  onRefresh,
  onExport,
  onViewDetails,
}: AuditTrailViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        entry.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.requestTrackingId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSeverity = !severityFilter || entry.severity === severityFilter;
      const matchesModule = !moduleFilter || entry.module === moduleFilter;
      return matchesSearch && matchesSeverity && matchesModule;
    });
  }, [entries, searchTerm, severityFilter, moduleFilter]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Audit Trail</CardTitle>
          <div className="flex items-center gap-2">
            {onExport && (
              <>
                <Button variant="outline" size="sm" onClick={() => onExport('CSV')}>
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => onExport('JSON')}>
                  Export JSON
                </Button>
              </>
            )}
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} loading={loading}>
                Refresh
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by user, action, resource, or tracking ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={severityOptions}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={moduleOptions}
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Entries */}
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {entries.length === 0 ? 'No audit entries yet.' : 'No entries match your filters.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <AuditEntryRow
                key={entry.id}
                entry={entry}
                expanded={expandedEntry === entry.id}
                onToggleExpand={() =>
                  setExpandedEntry(expandedEntry === entry.id ? null : entry.id)
                }
                onViewDetails={onViewDetails}
                formatTime={formatTime}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AuditEntryRowProps {
  entry: AuditTrailEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onViewDetails?: (entry: AuditTrailEntry) => void;
  formatTime: (timestamp: string) => string;
}

function AuditEntryRow({
  entry,
  expanded,
  onToggleExpand,
  onViewDetails,
  formatTime,
}: AuditEntryRowProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <Badge variant={severityVariant[entry.severity]}>{entry.severity}</Badge>
          <div>
            <p className="font-medium text-foreground">
              {entry.userName} - {entry.action}
            </p>
            <p className="text-sm text-muted-foreground">
              {entry.module} / {entry.resource}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{formatTime(entry.timestamp)}</span>
          <svg
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p className="text-sm font-mono">{entry.userId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resource ID</p>
              <p className="text-sm font-mono">{entry.resourceId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tracking ID</p>
              <p className="text-sm font-mono truncate">{entry.requestTrackingId}</p>
            </div>
            {entry.ipAddress && (
              <div>
                <p className="text-xs text-muted-foreground">IP Address</p>
                <p className="text-sm font-mono">{entry.ipAddress}</p>
              </div>
            )}
          </div>

          {(entry.beforeValue !== undefined || entry.afterValue !== undefined) && (
            <div className="grid grid-cols-2 gap-4">
              {entry.beforeValue !== undefined && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Before</p>
                  <pre className="p-2 bg-background rounded text-xs overflow-auto max-h-32">
                    {typeof entry.beforeValue === 'string' 
                      ? entry.beforeValue 
                      : JSON.stringify(entry.beforeValue, null, 2)}
                  </pre>
                </div>
              )}
              {entry.afterValue !== undefined && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">After</p>
                  <pre className="p-2 bg-background rounded text-xs overflow-auto max-h-32">
                    {typeof entry.afterValue === 'string' 
                      ? entry.afterValue 
                      : JSON.stringify(entry.afterValue, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {onViewDetails && (
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => onViewDetails(entry)}>
                View Full Details
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
