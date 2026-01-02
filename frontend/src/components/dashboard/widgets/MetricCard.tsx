'use client';

import React, { useMemo } from 'react';
import { WidgetWrapper } from './WidgetWrapper';
import type { MetricData, MetricCardConfig } from '@/types/dashboard';

/**
 * Props for MetricCard component
 */
export interface MetricCardProps {
  title: string;
  data: MetricData | null;
  config?: MetricCardConfig;
  onDrillDown?: () => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Format a number based on the specified format
 */
function formatValue(
  value: number,
  format: MetricCardConfig['format'] = 'number',
  currency?: string,
  locale: string = 'en-US'
): string {
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    case 'percentage':
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value / 100);
    default:
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
  }
}

/**
 * Get trend indicator color and icon
 */
function getTrendIndicator(trend?: MetricData['trend']): {
  color: string;
  icon: string;
} {
  switch (trend) {
    case 'up':
      return { color: 'text-green-500', icon: '↑' };
    case 'down':
      return { color: 'text-red-500', icon: '↓' };
    default:
      return { color: 'text-gray-500', icon: '→' };
  }
}

/**
 * Get threshold status color
 */
function getThresholdColor(
  value: number,
  thresholds?: MetricCardConfig['thresholds']
): string {
  if (!thresholds) return '';
  if (thresholds.critical !== undefined && value >= thresholds.critical) {
    return 'text-red-500';
  }
  if (thresholds.warning !== undefined && value >= thresholds.warning) {
    return 'text-yellow-500';
  }
  return '';
}

/**
 * MetricCard - Displays a single metric with optional trend and threshold indicators
 * 
 * Features:
 * - Formatted value display (number, currency, percentage)
 * - Trend indicator (up, down, stable)
 * - Change percentage display
 * - Threshold-based coloring (warning, critical)
 * - Drill-down navigation
 */
export function MetricCard({
  title,
  data,
  config = {},
  onDrillDown,
  isLoading = false,
  error = null,
  className = '',
}: MetricCardProps) {
  const formattedValue = useMemo(() => {
    if (!data) return '--';
    return formatValue(data.value, config.format, config.currency);
  }, [data, config.format, config.currency]);

  const trendIndicator = useMemo(() => {
    if (!data || !config.showTrend) return null;
    return getTrendIndicator(data.trend);
  }, [data, config.showTrend]);

  const thresholdColor = useMemo(() => {
    if (!data) return '';
    return getThresholdColor(data.value, config.thresholds);
  }, [data, config.thresholds]);

  return (
    <WidgetWrapper
      title={title}
      showHeader={config.showHeader !== false}
      onDrillDown={onDrillDown}
      isLoading={isLoading}
      error={error}
      className={className}
    >
      <div className="flex flex-col justify-center h-full">
        <div className={`text-3xl font-bold ${thresholdColor}`}>
          {formattedValue}
        </div>
        
        {data && config.showTrend && trendIndicator && (
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-lg ${trendIndicator.color}`}>
              {trendIndicator.icon}
            </span>
            {data.changePercent !== undefined && (
              <span className={`text-sm ${trendIndicator.color}`}>
                {data.changePercent >= 0 ? '+' : ''}
                {data.changePercent.toFixed(2)}%
              </span>
            )}
            {config.trendPeriod && (
              <span className="text-xs text-muted-foreground">
                vs last {config.trendPeriod}
              </span>
            )}
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default MetricCard;
