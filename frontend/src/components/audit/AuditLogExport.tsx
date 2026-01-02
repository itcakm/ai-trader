'use client';

import React, { useState } from 'react';
import type { AuditLogFilter, AuditExportFormat } from '@/types/audit';
import { Button } from '@/components/ui/Button';
import { useAuditLogExport } from './useAuditLog';

/**
 * Props for AuditLogExport component
 */
export interface AuditLogExportProps {
  /** Current filter to apply to export */
  filter: AuditLogFilter;
  /** Total count of entries matching filter */
  totalCount?: number;
  /** Additional CSS class */
  className?: string;
}

/**
 * AuditLogExport - Export controls for audit logs
 * 
 * Supports:
 * - CSV export
 * - JSON export
 * - Applies current filters to export
 * 
 * Validates: Requirements 11.5
 */
export function AuditLogExport({
  filter,
  totalCount,
  className = '',
}: AuditLogExportProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const { downloadExport, isExporting, error } = useAuditLogExport();

  const handleExport = async (format: AuditExportFormat) => {
    setShowDropdown(false);
    await downloadExport(filter, format);
  };

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isExporting}
        aria-haspopup="menu"
        aria-expanded={showDropdown}
      >
        {isExporting ? (
          <>
            <svg
              className="w-4 h-4 mr-2 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export
          </>
        )}
      </Button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          
          {/* Menu */}
          <div
            className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-20"
            role="menu"
          >
            <div className="p-2">
              {totalCount !== undefined && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  {totalCount.toLocaleString()} entries
                </p>
              )}
              
              <button
                onClick={() => handleExport('csv')}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded transition-colors"
                role="menuitem"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export as CSV
              </button>
              
              <button
                onClick={() => handleExport('json')}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded transition-colors"
                role="menuitem"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
                Export as JSON
              </button>
            </div>
          </div>
        </>
      )}

      {/* Error Display */}
      {error && (
        <p className="absolute top-full mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default AuditLogExport;
