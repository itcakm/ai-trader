'use client';

import React, { useState, useMemo } from 'react';
import { WidgetWrapper } from './WidgetWrapper';
import type { DataTableConfig } from '@/types/dashboard';

/**
 * Table row data type
 */
export interface TableRow {
  id: string;
  [key: string]: unknown;
}

/**
 * Props for DataTable component
 */
export interface DataTableProps {
  title: string;
  data: TableRow[];
  columns: string[];
  config?: Partial<DataTableConfig>;
  onDrillDown?: () => void;
  onRowClick?: (row: TableRow) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Format cell value for display
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    return new Intl.NumberFormat().format(value);
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

/**
 * DataTable - Displays tabular data with sorting and pagination
 * 
 * Features:
 * - Column sorting
 * - Pagination
 * - Row click handling
 * - Responsive layout
 * - Drill-down navigation
 */
export function DataTable({
  title,
  data,
  columns,
  config = {},
  onDrillDown,
  onRowClick,
  isLoading = false,
  error = null,
  className = '',
}: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = config.pageSize || 10;

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn || !config.sortable) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, config.sortable]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(data.length / pageSize);

  // Handle column header click for sorting
  const handleSort = (column: string) => {
    if (!config.sortable) return;

    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return (
    <WidgetWrapper
      title={title}
      showHeader={config.showHeader !== false}
      onDrillDown={onDrillDown}
      isLoading={isLoading}
      error={error}
      className={className}
    >
      <div className="flex flex-col h-full">
        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                {columns.map((column) => (
                  <th
                    key={column}
                    className={`
                      px-3 py-2 text-left font-medium text-muted-foreground
                      ${config.sortable ? 'cursor-pointer hover:text-foreground' : ''}
                    `}
                    onClick={() => handleSort(column)}
                  >
                    <div className="flex items-center gap-1">
                      {column}
                      {config.sortable && sortColumn === column && (
                        <span className="text-xs">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row) => (
                <tr
                  key={row.id}
                  className={`
                    border-b border-border/50 hover:bg-muted/50
                    ${onRowClick ? 'cursor-pointer' : ''}
                  `}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <td key={column} className="px-3 py-2">
                      {formatCellValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {currentPage * pageSize + 1}-
              {Math.min((currentPage + 1) * pageSize, data.length)} of {data.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-2 py-1 text-xs rounded hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-2 py-1 text-xs rounded hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default DataTable;
