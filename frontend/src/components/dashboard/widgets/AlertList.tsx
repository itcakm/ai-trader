'use client';

import React, { useMemo } from 'react';
import { WidgetWrapper } from './WidgetWrapper';
import type { AlertData, AlertListConfig } from '@/types/dashboard';

/**
 * Props for AlertList component
 */
export interface AlertListProps {
  title: string;
  alerts: AlertData[];
  config?: AlertListConfig;
  onDrillDown?: () => void;
  onAlertClick?: (alert: AlertData) => void;
  onAcknowledge?: (alertId: string) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Get severity badge styles
 */
function getSeverityStyles(severity: AlertData['severity']): {
  bg: string;
  text: string;
  icon: string;
} {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        icon: '🔴',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-700 dark:text-yellow-400',
        icon: '🟡',
      };
    default:
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        icon: '🔵',
      };
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * AlertList - Displays a list of alerts with severity indicators
 * 
 * Features:
 * - Severity-based styling (info, warning, critical)
 * - Acknowledge functionality
 * - Filtering by severity
 * - Time-based formatting
 * - Drill-down navigation
 */
export function AlertList({
  title,
  alerts,
  config = {},
  onDrillDown,
  onAlertClick,
  onAcknowledge,
  isLoading = false,
  error = null,
  className = '',
}: AlertListProps) {
  // Filter alerts based on config
  const filteredAlerts = useMemo(() => {
    let result = alerts;

    // Filter by severity
    if (config.severityFilter && config.severityFilter.length > 0) {
      result = result.filter((a) => config.severityFilter!.includes(a.severity));
    }

    // Filter acknowledged
    if (!config.showAcknowledged) {
      result = result.filter((a) => !a.acknowledged);
    }

    // Limit items
    if (config.maxItems && config.maxItems > 0) {
      result = result.slice(0, config.maxItems);
    }

    return result;
  }, [alerts, config.severityFilter, config.showAcknowledged, config.maxItems]);

  // Count by severity
  const severityCounts = useMemo(() => {
    return {
      critical: alerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length,
      warning: alerts.filter((a) => a.severity === 'warning' && !a.acknowledged).length,
      info: alerts.filter((a) => a.severity === 'info' && !a.acknowledged).length,
    };
  }, [alerts]);

  return (
    <WidgetWrapper
      title={title}
      showHeader={config.showHeader !== false}
      onDrillDown={onDrillDown}
      isLoading={isLoading}
      error={error}
      className={className}
      actions={
        <div className="flex gap-2 text-xs">
          {severityCounts.critical > 0 && (
            <span className="text-red-500">{severityCounts.critical} critical</span>
          )}
          {severityCounts.warning > 0 && (
            <span className="text-yellow-500">{severityCounts.warning} warning</span>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2 h-full overflow-auto">
        {filteredAlerts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No alerts
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const styles = getSeverityStyles(alert.severity);

            return (
              <div
                key={alert.id}
                className={`
                  p-3 rounded-lg border border-border
                  ${styles.bg}
                  ${alert.acknowledged ? 'opacity-60' : ''}
                  ${onAlertClick ? 'cursor-pointer hover:opacity-80' : ''}
                `}
                onClick={() => onAlertClick?.(alert)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span className="flex-shrink-0">{styles.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${styles.text}`}>
                        {alert.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {alert.message}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{alert.source}</span>
                        <span>•</span>
                        <span>{formatTimestamp(alert.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                  {!alert.acknowledged && onAcknowledge && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAcknowledge(alert.id);
                      }}
                      className="text-xs px-2 py-1 rounded bg-background hover:bg-muted"
                    >
                      Ack
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </WidgetWrapper>
  );
}

export default AlertList;
