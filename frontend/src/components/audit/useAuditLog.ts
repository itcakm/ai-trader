/**
 * Audit Log Hooks
 * 
 * Provides hooks for querying, streaming, and exporting audit logs.
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  AuditLogEntry,
  AuditLogFilter,
  AuditLogPagination,
  PaginatedAuditLogResult,
  AuditExportFormat,
} from '@/types/audit';
import { useRBAC } from '@/providers/RBACProvider';

/**
 * Mock API for audit log operations
 * In production, this would call actual API endpoints
 */
const auditApi = {
  async query(
    filter: AuditLogFilter,
    pagination: AuditLogPagination
  ): Promise<PaginatedAuditLogResult> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 200));
    
    // Generate mock data for demonstration
    const mockEntries = generateMockAuditEntries(filter, pagination);
    
    return mockEntries;
  },

  async export(filter: AuditLogFilter, format: AuditExportFormat): Promise<Blob> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Get all entries matching filter (no pagination for export)
    const result = await this.query(filter, { page: 0, pageSize: 1000 });
    
    if (format === 'json') {
      const jsonContent = JSON.stringify(result.entries, null, 2);
      return new Blob([jsonContent], { type: 'application/json' });
    } else {
      // CSV format
      const csvContent = convertToCSV(result.entries);
      return new Blob([csvContent], { type: 'text/csv' });
    }
  },
};

/**
 * Generate mock audit entries for demonstration
 */
function generateMockAuditEntries(
  filter: AuditLogFilter,
  pagination: AuditLogPagination
): PaginatedAuditLogResult {
  const allEntries: AuditLogEntry[] = [];
  const now = new Date();
  
  // Generate sample entries
  const actions = [
    'strategy.create', 'strategy.update', 'strategy.deploy',
    'order.create', 'order.cancel', 'user.login', 'user.logout',
    'role.assign', 'risk.limit_update', 'exchange.connect',
  ];
  
  const modules = [
    'strategy_management', 'market_data', 'ai_intelligence',
    'risk_controls', 'reporting', 'exchange_integration', 'administration',
  ] as const;
  
  const severities = ['info', 'warning', 'critical'] as const;
  
  const users = [
    { id: 'user-1', name: 'John Doe' },
    { id: 'user-2', name: 'Jane Smith' },
    { id: 'user-3', name: 'Bob Wilson' },
    { id: 'user-4', name: 'Alice Brown' },
  ];

  // Generate 100 mock entries
  for (let i = 0; i < 100; i++) {
    const user = users[i % users.length];
    const timestamp = new Date(now.getTime() - i * 60000 * 5); // 5 minutes apart
    
    const entry: AuditLogEntry = {
      id: `audit-${i + 1}`,
      timestamp,
      userId: user.id,
      userName: user.name,
      action: actions[i % actions.length],
      module: modules[i % modules.length],
      resource: 'strategy',
      resourceId: `resource-${(i % 10) + 1}`,
      severity: severities[i % 3],
      requestTrackingId: `req-${Date.now().toString(36)}-${i}`,
      beforeValue: i % 2 === 0 ? { status: 'inactive' } : undefined,
      afterValue: i % 2 === 0 ? { status: 'active' } : undefined,
    };
    
    allEntries.push(entry);
  }

  // Apply filters
  let filteredEntries = allEntries;
  
  if (filter.userId) {
    filteredEntries = filteredEntries.filter((e) => e.userId === filter.userId);
  }
  if (filter.userName) {
    filteredEntries = filteredEntries.filter((e) =>
      e.userName.toLowerCase().includes(filter.userName!.toLowerCase())
    );
  }
  if (filter.action) {
    filteredEntries = filteredEntries.filter((e) => e.action === filter.action);
  }
  if (filter.module) {
    filteredEntries = filteredEntries.filter((e) => e.module === filter.module);
  }
  if (filter.severity) {
    filteredEntries = filteredEntries.filter((e) => e.severity === filter.severity);
  }
  if (filter.startDate) {
    filteredEntries = filteredEntries.filter(
      (e) => e.timestamp >= filter.startDate!
    );
  }
  if (filter.endDate) {
    filteredEntries = filteredEntries.filter(
      (e) => e.timestamp <= filter.endDate!
    );
  }
  if (filter.searchText) {
    const searchLower = filter.searchText.toLowerCase();
    filteredEntries = filteredEntries.filter(
      (e) =>
        e.userName.toLowerCase().includes(searchLower) ||
        e.action.toLowerCase().includes(searchLower) ||
        e.resource.toLowerCase().includes(searchLower) ||
        e.resourceId.toLowerCase().includes(searchLower)
    );
  }

  // Sort by timestamp descending
  filteredEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply pagination
  const totalCount = filteredEntries.length;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);
  const start = pagination.page * pagination.pageSize;
  const end = start + pagination.pageSize;
  const paginatedEntries = filteredEntries.slice(start, end);

  return {
    entries: paginatedEntries,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
    hasMore: pagination.page < totalPages - 1,
  };
}

/**
 * Convert audit entries to CSV format
 */
function convertToCSV(entries: AuditLogEntry[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'User ID',
    'User Name',
    'Action',
    'Module',
    'Resource',
    'Resource ID',
    'Severity',
    'Request Tracking ID',
    'Before Value',
    'After Value',
  ];

  const rows = entries.map((entry) => [
    entry.id,
    entry.timestamp.toISOString(),
    entry.userId,
    entry.userName,
    entry.action,
    entry.module,
    entry.resource,
    entry.resourceId,
    entry.severity,
    entry.requestTrackingId,
    entry.beforeValue ? JSON.stringify(entry.beforeValue) : '',
    entry.afterValue ? JSON.stringify(entry.afterValue) : '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  return csvContent;
}

/**
 * Hook for querying audit logs
 */
export function useAuditLogQuery() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaginatedAuditLogResult | null>(null);
  const { hasPermission, filterByPermission } = useRBAC();

  const query = useCallback(
    async (filter: AuditLogFilter, pagination: AuditLogPagination) => {
      // Check permission to view audit logs
      if (!hasPermission('audit_log', 'read')) {
        setError('You do not have permission to view audit logs');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const queryResult = await auditApi.query(filter, pagination);
        
        // Apply RBAC filtering - users can only see logs they have permission to view
        // In a real implementation, this would be done server-side
        const filteredEntries = filterByPermission(
          queryResult.entries,
          'audit_log',
          'read'
        );

        const filteredResult: PaginatedAuditLogResult = {
          ...queryResult,
          entries: filteredEntries,
          totalCount: filteredEntries.length,
        };

        setResult(filteredResult);
        return filteredResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to query audit logs';
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [hasPermission, filterByPermission]
  );

  return {
    query,
    result,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

/**
 * Hook for streaming audit logs in real-time
 */
export function useAuditLogStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { hasPermission } = useRBAC();

  const subscribe = useCallback(
    (filter: AuditLogFilter, onEntry: (entry: AuditLogEntry) => void) => {
      // Check permission
      if (!hasPermission('audit_log', 'read')) {
        setError('You do not have permission to stream audit logs');
        return () => {};
      }

      setIsStreaming(true);
      setError(null);

      // In production, this would establish a WebSocket connection
      // For now, we simulate streaming with periodic mock data
      
      // Simulate WebSocket connection
      const mockStream = () => {
        const users = [
          { id: 'user-1', name: 'John Doe' },
          { id: 'user-2', name: 'Jane Smith' },
        ];
        const actions = ['strategy.update', 'order.create', 'user.login'];
        const modules = ['strategy_management', 'exchange_integration', 'administration'] as const;
        const severities = ['info', 'warning', 'critical'] as const;

        const user = users[Math.floor(Math.random() * users.length)];
        const entry: AuditLogEntry = {
          id: `audit-stream-${Date.now()}`,
          timestamp: new Date(),
          userId: user.id,
          userName: user.name,
          action: actions[Math.floor(Math.random() * actions.length)],
          module: modules[Math.floor(Math.random() * modules.length)],
          resource: 'strategy',
          resourceId: `resource-${Math.floor(Math.random() * 10) + 1}`,
          severity: severities[Math.floor(Math.random() * severities.length)],
          requestTrackingId: `req-${Date.now().toString(36)}`,
        };

        // Apply filter
        let shouldEmit = true;
        if (filter.userId && entry.userId !== filter.userId) shouldEmit = false;
        if (filter.module && entry.module !== filter.module) shouldEmit = false;
        if (filter.severity && entry.severity !== filter.severity) shouldEmit = false;
        if (filter.action && entry.action !== filter.action) shouldEmit = false;

        if (shouldEmit) {
          setEntries((prev) => [entry, ...prev].slice(0, 100)); // Keep last 100
          onEntry(entry);
        }
      };

      // Start mock streaming (every 3-8 seconds)
      const scheduleNext = () => {
        const delay = 3000 + Math.random() * 5000;
        intervalRef.current = setTimeout(() => {
          mockStream();
          scheduleNext();
        }, delay);
      };
      scheduleNext();

      // Return unsubscribe function
      return () => {
        if (intervalRef.current) {
          clearTimeout(intervalRef.current);
          intervalRef.current = null;
        }
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        setIsStreaming(false);
      };
    },
    [hasPermission]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    subscribe,
    isStreaming,
    entries,
    error,
    clearEntries: () => setEntries([]),
  };
}

/**
 * Hook for exporting audit logs
 */
export function useAuditLogExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { hasPermission } = useRBAC();

  const exportLogs = useCallback(
    async (filter: AuditLogFilter, format: AuditExportFormat): Promise<Blob | null> => {
      // Check permission
      if (!hasPermission('audit_log', 'export')) {
        setError('You do not have permission to export audit logs');
        return null;
      }

      setIsExporting(true);
      setError(null);

      try {
        const blob = await auditApi.export(filter, format);
        return blob;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to export audit logs';
        setError(errorMessage);
        return null;
      } finally {
        setIsExporting(false);
      }
    },
    [hasPermission]
  );

  const downloadExport = useCallback(
    async (filter: AuditLogFilter, format: AuditExportFormat, filename?: string) => {
      const blob = await exportLogs(filter, format);
      if (!blob) return;

      const defaultFilename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || defaultFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [exportLogs]
  );

  return {
    exportLogs,
    downloadExport,
    isExporting,
    error,
    clearError: () => setError(null),
  };
}
