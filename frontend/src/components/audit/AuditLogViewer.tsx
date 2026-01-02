'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { AuditLogEntry, AuditLogFilter, AuditSeverity } from '@/types/audit';
import { DEFAULT_AUDIT_PAGE_SIZE, AUDIT_PAGE_SIZES } from '@/types/audit';
import { DataGrid } from '@/components/ui/DataGrid';
import type { ColumnDef, FilterModel } from '@/components/ui/DataGrid';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AuditLogFilters } from './AuditLogFilters';
import { AuditLogDetail } from './AuditLogDetail';
import { AuditLogExport } from './AuditLogExport';
import { AuditLogStream } from './AuditLogStream';
import { useAuditLogQuery } from './useAuditLog';
import { useRBAC } from '@/providers/RBACProvider';

/**
 * Props for AuditLogViewer component
 */
export interface AuditLogViewerProps {
  /** Initial filter to apply */
  initialFilter?: AuditLogFilter;
  /** Whether to show the streaming panel */
  showStream?: boolean;
  /** Whether to show export controls */
  showExport?: boolean;
  /** Additional CSS class */
  className?: string;
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
 * Column definitions for the audit log grid
 */
const createColumns = (
  onViewDetail: (entry: AuditLogEntry) => void
): ColumnDef<AuditLogEntry>[] => [
  {
    id: 'timestamp',
    header: 'Timestamp',
    accessor: 'timestamp',
    sortable: true,
    filterable: true,
    filterType: 'date',
    width: 180,
    render: (value) => {
      const date = value as Date;
      return (
        <span className="text-sm">
          {date.toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'medium',
          })}
        </span>
      );
    },
  },
  {
    id: 'severity',
    header: 'Severity',
    accessor: 'severity',
    sortable: true,
    filterable: true,
    filterType: 'select',
    filterOptions: [
      { label: 'Info', value: 'info' },
      { label: 'Warning', value: 'warning' },
      { label: 'Critical', value: 'critical' },
    ],
    width: 100,
    render: (value) => (
      <Badge variant={getSeverityVariant(value as string)} className="text-xs">
        {value as string}
      </Badge>
    ),
  },
  {
    id: 'userName',
    header: 'User',
    accessor: 'userName',
    sortable: true,
    filterable: true,
    filterType: 'text',
    width: 150,
  },
  {
    id: 'action',
    header: 'Action',
    accessor: 'action',
    sortable: true,
    filterable: true,
    filterType: 'text',
    width: 180,
    render: (value) => (
      <span className="font-medium text-sm">{value as string}</span>
    ),
  },
  {
    id: 'module',
    header: 'Module',
    accessor: 'module',
    sortable: true,
    filterable: true,
    filterType: 'select',
    filterOptions: [
      { label: 'Strategy Management', value: 'strategy_management' },
      { label: 'Market Data', value: 'market_data' },
      { label: 'AI Intelligence', value: 'ai_intelligence' },
      { label: 'Risk Controls', value: 'risk_controls' },
      { label: 'Reporting', value: 'reporting' },
      { label: 'Exchange Integration', value: 'exchange_integration' },
      { label: 'Administration', value: 'administration' },
    ],
    width: 160,
    render: (value) => (
      <span className="text-sm">{(value as string).replace(/_/g, ' ')}</span>
    ),
  },
  {
    id: 'resource',
    header: 'Resource',
    accessor: (row) => `${row.resource} (${row.resourceId})`,
    sortable: true,
    filterable: true,
    filterType: 'text',
    width: 200,
    render: (value) => (
      <span className="text-sm text-muted-foreground">{value as string}</span>
    ),
  },
  {
    id: 'hasChanges',
    header: 'Changes',
    accessor: (row) => row.beforeValue !== undefined || row.afterValue !== undefined,
    width: 80,
    align: 'center',
    render: (value) =>
      value ? (
        <span className="text-green-500" title="Has before/after values">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'requestTrackingId',
    header: 'Tracking ID',
    accessor: 'requestTrackingId',
    sortable: false,
    filterable: true,
    filterType: 'text',
    width: 180,
    render: (value) => (
      <span className="font-mono text-xs text-muted-foreground">
        {value as string}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    accessor: (row) => row,
    width: 80,
    align: 'center',
    render: (_, row) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onViewDetail(row);
        }}
        aria-label="View details"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      </Button>
    ),
  },
];

/**
 * AuditLogViewer - Main component for viewing and managing audit logs
 * 
 * Features:
 * - Data grid with sorting, filtering, pagination
 * - Advanced filter panel
 * - Real-time streaming panel
 * - Export to CSV/JSON
 * - Detail view with before/after values
 * - RBAC-filtered results
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
export function AuditLogViewer({
  initialFilter = {},
  showStream = true,
  showExport = true,
  className = '',
}: AuditLogViewerProps) {
  const { hasPermission } = useRBAC();
  const { query, result, isLoading, error } = useAuditLogQuery();
  
  const [filter, setFilter] = useState<AuditLogFilter>(initialFilter);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_AUDIT_PAGE_SIZE);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [showStreamPanel, setShowStreamPanel] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'stream'>('grid');

  // Check permission
  const canViewAuditLogs = hasPermission('audit_log', 'read');
  const canExportAuditLogs = hasPermission('audit_log', 'export');

  // Load data on mount and when filter/pagination changes
  useEffect(() => {
    if (canViewAuditLogs) {
      query(filter, { page, pageSize });
    }
  }, [canViewAuditLogs, query, filter, page, pageSize]);

  // Handle filter apply
  const handleApplyFilters = useCallback(() => {
    setPage(0);
    query(filter, { page: 0, pageSize });
  }, [filter, pageSize, query]);

  // Handle filter clear
  const handleClearFilters = useCallback(() => {
    setFilter({});
    setPage(0);
    query({}, { page: 0, pageSize });
  }, [pageSize, query]);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Handle page size change
  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(0);
  }, []);

  // Handle entry click
  const handleEntryClick = useCallback((entry: AuditLogEntry) => {
    setSelectedEntry(entry);
  }, []);

  // Create columns with detail handler
  const columns = createColumns(handleEntryClick);

  // Permission denied view
  if (!canViewAuditLogs) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <svg
            className="w-12 h-12 mx-auto text-muted-foreground mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h3 className="text-lg font-medium mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            You do not have permission to view audit logs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Audit Logs</h2>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          {showStream && (
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-sm ${
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('stream')}
                className={`px-3 py-1.5 text-sm ${
                  viewMode === 'stream'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                Live
              </button>
            </div>
          )}
          
          {/* Export */}
          {showExport && canExportAuditLogs && (
            <AuditLogExport
              filter={filter}
              totalCount={result?.totalCount}
            />
          )}
        </div>
      </div>

      {/* Filters */}
      <AuditLogFilters
        filter={filter}
        onFilterChange={setFilter}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        isLoading={isLoading}
      />

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {viewMode === 'grid' ? (
        <DataGrid
          id="audit-log-grid"
          data={result?.entries || []}
          columns={columns}
          loading={isLoading}
          sortable
          filterable={false} // Using custom filter panel
          paginated
          pageSizes={AUDIT_PAGE_SIZES}
          defaultPageSize={pageSize}
          virtualScroll={false}
          selectable={false}
          getRowId={(row) => row.id}
          emptyMessage="No audit log entries found"
          ariaLabel="Audit log entries"
          className="min-h-[400px]"
        />
      ) : (
        <AuditLogStream
          filter={filter}
          maxEntries={100}
          onEntryClick={handleEntryClick}
        />
      )}

      {/* Pagination Info (for grid mode) */}
      {viewMode === 'grid' && result && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {result.entries.length} of {result.totalCount.toLocaleString()} entries
          </span>
          <div className="flex items-center gap-2">
            <span>Page {result.page + 1} of {result.totalPages}</span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 0 || isLoading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={!result.hasMore || isLoading}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <AuditLogDetail
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
            className="w-full max-w-2xl"
          />
        </div>
      )}
    </div>
  );
}

export default AuditLogViewer;
