'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

/**
 * Props for WidgetWrapper component
 */
export interface WidgetWrapperProps {
  title: string;
  children: React.ReactNode;
  showHeader?: boolean;
  onDrillDown?: () => void;
  drillDownLabel?: string;
  isLoading?: boolean;
  error?: string | null;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * WidgetWrapper - Common wrapper for all dashboard widgets
 * 
 * Features:
 * - Consistent card styling
 * - Optional header with title
 * - Drill-down navigation support
 * - Loading and error states
 * - Custom actions slot
 */
export function WidgetWrapper({
  title,
  children,
  showHeader = true,
  onDrillDown,
  drillDownLabel = 'View Details',
  isLoading = false,
  error = null,
  actions,
  className = '',
}: WidgetWrapperProps) {
  return (
    <Card className={`h-full flex flex-col ${className}`}>
      {showHeader && (
        <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {actions}
            {onDrillDown && (
              <button
                onClick={onDrillDown}
                className="text-xs text-primary hover:underline"
                aria-label={drillDownLabel}
              >
                {drillDownLabel}
              </button>
            )}
          </div>
        </CardHeader>
      )}
      <CardContent className="flex-1 overflow-hidden p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive text-sm">
            {error}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default WidgetWrapper;
