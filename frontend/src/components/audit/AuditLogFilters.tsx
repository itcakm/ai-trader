'use client';

import React, { useState, useCallback } from 'react';
import type { AuditLogFilter, AuditSeverity } from '@/types/audit';
import type { ModuleType } from '@/types/rbac';
import { AUDIT_ACTIONS } from '@/types/audit';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/**
 * Props for AuditLogFilters component
 */
export interface AuditLogFiltersProps {
  /** Current filter values */
  filter: AuditLogFilter;
  /** Callback when filter changes */
  onFilterChange: (filter: AuditLogFilter) => void;
  /** Callback to apply filters */
  onApply: () => void;
  /** Callback to clear all filters */
  onClear: () => void;
  /** Whether filters are being applied */
  isLoading?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * Module options for filter dropdown
 */
const MODULE_OPTIONS: Array<{ value: ModuleType; label: string }> = [
  { value: 'strategy_management', label: 'Strategy Management' },
  { value: 'market_data', label: 'Market Data' },
  { value: 'ai_intelligence', label: 'AI Intelligence' },
  { value: 'risk_controls', label: 'Risk Controls' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'exchange_integration', label: 'Exchange Integration' },
  { value: 'administration', label: 'Administration' },
];

/**
 * Severity options for filter dropdown
 */
const SEVERITY_OPTIONS: Array<{ value: AuditSeverity; label: string }> = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

/**
 * Action options for filter dropdown
 */
const ACTION_OPTIONS = Object.entries(AUDIT_ACTIONS).map(([key, value]) => ({
  value,
  label: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
}));

/**
 * AuditLogFilters - Filter panel for audit log viewer
 * 
 * Supports filtering by:
 * - User (ID or name)
 * - Action type
 * - Module
 * - Time range
 * - Severity
 * - Full-text search
 * 
 * Validates: Requirements 11.2
 */
export function AuditLogFilters({
  filter,
  onFilterChange,
  onApply,
  onClear,
  isLoading = false,
  className = '',
}: AuditLogFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleChange = useCallback(
    <K extends keyof AuditLogFilter>(field: K, value: AuditLogFilter[K]) => {
      onFilterChange({ ...filter, [field]: value || undefined });
    },
    [filter, onFilterChange]
  );

  const handleDateChange = useCallback(
    (field: 'startDate' | 'endDate', value: string) => {
      const date = value ? new Date(value) : undefined;
      onFilterChange({ ...filter, [field]: date });
    },
    [filter, onFilterChange]
  );

  const formatDateForInput = (date: Date | undefined): string => {
    if (!date) return '';
    return date.toISOString().slice(0, 16);
  };

  const activeFilterCount = Object.values(filter).filter(
    (v) => v !== undefined && v !== ''
  ).length;

  return (
    <div
      className={`bg-muted/30 border border-border rounded-lg ${className}`}
      role="region"
      aria-label="Audit log filters"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
          aria-expanded={isExpanded}
          aria-controls="audit-filter-panel"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={activeFilterCount === 0}
          >
            Clear All
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onApply}
            disabled={isLoading}
          >
            {isLoading ? 'Applying...' : 'Apply Filters'}
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {isExpanded && (
        <div
          id="audit-filter-panel"
          className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {/* Search Text */}
          <div className="lg:col-span-2">
            <label
              htmlFor="audit-search"
              className="block text-sm font-medium mb-1"
            >
              Search
            </label>
            <Input
              id="audit-search"
              type="text"
              placeholder="Search by user, action, resource..."
              value={filter.searchText || ''}
              onChange={(e) => handleChange('searchText', e.target.value)}
              className="w-full"
            />
          </div>

          {/* User Name */}
          <div>
            <label
              htmlFor="audit-user"
              className="block text-sm font-medium mb-1"
            >
              User
            </label>
            <Input
              id="audit-user"
              type="text"
              placeholder="Filter by user name"
              value={filter.userName || ''}
              onChange={(e) => handleChange('userName', e.target.value)}
              className="w-full"
            />
          </div>

          {/* Action */}
          <div>
            <Select
              id="audit-action"
              label="Action"
              value={filter.action || ''}
              onChange={(e) => handleChange('action', e.target.value)}
              options={[
                { value: '', label: 'All Actions' },
                ...ACTION_OPTIONS,
              ]}
              className="w-full"
            />
          </div>

          {/* Module */}
          <div>
            <Select
              id="audit-module"
              label="Module"
              value={filter.module || ''}
              onChange={(e) =>
                handleChange('module', e.target.value as ModuleType | undefined)
              }
              options={[
                { value: '', label: 'All Modules' },
                ...MODULE_OPTIONS,
              ]}
              className="w-full"
            />
          </div>

          {/* Severity */}
          <div>
            <Select
              id="audit-severity"
              label="Severity"
              value={filter.severity || ''}
              onChange={(e) =>
                handleChange('severity', e.target.value as AuditSeverity | undefined)
              }
              options={[
                { value: '', label: 'All Severities' },
                ...SEVERITY_OPTIONS,
              ]}
              className="w-full"
            />
          </div>

          {/* Start Date */}
          <div>
            <label
              htmlFor="audit-start-date"
              className="block text-sm font-medium mb-1"
            >
              Start Date
            </label>
            <Input
              id="audit-start-date"
              type="datetime-local"
              value={formatDateForInput(filter.startDate)}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="w-full"
            />
          </div>

          {/* End Date */}
          <div>
            <label
              htmlFor="audit-end-date"
              className="block text-sm font-medium mb-1"
            >
              End Date
            </label>
            <Input
              id="audit-end-date"
              type="datetime-local"
              value={formatDateForInput(filter.endDate)}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="w-full"
            />
          </div>

          {/* Request Tracking ID */}
          <div>
            <label
              htmlFor="audit-tracking-id"
              className="block text-sm font-medium mb-1"
            >
              Tracking ID
            </label>
            <Input
              id="audit-tracking-id"
              type="text"
              placeholder="req-..."
              value={filter.requestTrackingId || ''}
              onChange={(e) => handleChange('requestTrackingId', e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLogFilters;
