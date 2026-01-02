'use client';

import React, { useMemo } from 'react';
import { WidgetWrapper } from './WidgetWrapper';
import type { DataPoint, ChartConfig } from '@/types/dashboard';

/**
 * Props for LineChart component
 */
export interface LineChartProps {
  title: string;
  data: DataPoint[];
  config?: ChartConfig;
  onDrillDown?: () => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Default chart colors
 */
const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
];

/**
 * Calculate SVG path for line chart
 */
function calculatePath(
  data: DataPoint[],
  width: number,
  height: number,
  padding: number
): string {
  if (data.length === 0) return '';

  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - minValue) / range) * chartHeight;
    return `${x},${y}`;
  });

  return `M ${points.join(' L ')}`;
}

/**
 * Calculate area path for filled line chart
 */
function calculateAreaPath(
  data: DataPoint[],
  width: number,
  height: number,
  padding: number
): string {
  if (data.length === 0) return '';

  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - minValue) / range) * chartHeight;
    return { x, y };
  });

  const bottomY = padding + chartHeight;
  const startX = points[0]?.x ?? padding;
  const endX = points[points.length - 1]?.x ?? padding + chartWidth;

  const linePath = points.map((p) => `${p.x},${p.y}`).join(' L ');
  return `M ${startX},${bottomY} L ${linePath} L ${endX},${bottomY} Z`;
}

/**
 * LineChart - Displays time series data as a line chart
 * 
 * Features:
 * - SVG-based rendering (no external dependencies)
 * - Configurable colors
 * - Optional grid lines
 * - Optional legend
 * - Responsive sizing
 * - Drill-down navigation
 */
export function LineChart({
  title,
  data,
  config = {},
  onDrillDown,
  isLoading = false,
  error = null,
  className = '',
}: LineChartProps) {
  const colors = config.colors || DEFAULT_COLORS;
  const showGrid = config.showGrid !== false;
  const showLegend = config.showLegend !== false;

  // Chart dimensions
  const width = 400;
  const height = 200;
  const padding = 40;

  // Calculate paths
  const linePath = useMemo(
    () => calculatePath(data, width, height, padding),
    [data]
  );

  const areaPath = useMemo(
    () => calculateAreaPath(data, width, height, padding),
    [data]
  );

  // Calculate Y-axis labels
  const yAxisLabels = useMemo(() => {
    if (data.length === 0) return [];
    const values = data.map((d) => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const step = (maxValue - minValue) / 4 || 1;
    return Array.from({ length: 5 }, (_, i) => minValue + step * i);
  }, [data]);

  // Calculate X-axis labels
  const xAxisLabels = useMemo(() => {
    if (data.length === 0) return [];
    const step = Math.max(1, Math.floor(data.length / 5));
    return data.filter((_, i) => i % step === 0).map((d) => d.label || d.timestamp);
  }, [data]);

  return (
    <WidgetWrapper
      title={title}
      showHeader={config.showHeader !== false}
      onDrillDown={onDrillDown}
      isLoading={isLoading}
      error={error}
      className={className}
    >
      <div className="w-full h-full flex flex-col">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full flex-1"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          {showGrid && (
            <g className="text-muted-foreground/20">
              {/* Horizontal grid lines */}
              {yAxisLabels.map((_, i) => {
                const y = padding + ((height - padding * 2) / 4) * i;
                return (
                  <line
                    key={`h-${i}`}
                    x1={padding}
                    y1={y}
                    x2={width - padding}
                    y2={y}
                    stroke="currentColor"
                    strokeDasharray="4,4"
                  />
                );
              })}
              {/* Vertical grid lines */}
              {xAxisLabels.map((_, i) => {
                const x = padding + ((width - padding * 2) / (xAxisLabels.length - 1 || 1)) * i;
                return (
                  <line
                    key={`v-${i}`}
                    x1={x}
                    y1={padding}
                    x2={x}
                    y2={height - padding}
                    stroke="currentColor"
                    strokeDasharray="4,4"
                  />
                );
              })}
            </g>
          )}

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={colors[0]}
              fillOpacity={0.1}
            />
          )}

          {/* Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={colors[0]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points */}
          {data.map((point, index) => {
            const values = data.map((d) => d.value);
            const minValue = Math.min(...values);
            const maxValue = Math.max(...values);
            const range = maxValue - minValue || 1;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
            const y = padding + chartHeight - ((point.value - minValue) / range) * chartHeight;

            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r={3}
                fill={colors[0]}
                className="hover:r-5 transition-all"
              >
                <title>{`${point.label || point.timestamp}: ${point.value}`}</title>
              </circle>
            );
          })}

          {/* Y-axis labels */}
          {yAxisLabels.map((value, i) => {
            const y = height - padding - ((height - padding * 2) / 4) * i;
            return (
              <text
                key={`y-${i}`}
                x={padding - 8}
                y={y}
                textAnchor="end"
                alignmentBaseline="middle"
                className="text-xs fill-muted-foreground"
              >
                {value.toFixed(0)}
              </text>
            );
          })}

          {/* X-axis labels */}
          {xAxisLabels.map((label, i) => {
            const x = padding + ((width - padding * 2) / (xAxisLabels.length - 1 || 1)) * i;
            return (
              <text
                key={`x-${i}`}
                x={x}
                y={height - padding + 16}
                textAnchor="middle"
                className="text-xs fill-muted-foreground"
              >
                {typeof label === 'string' ? label.slice(0, 10) : label}
              </text>
            );
          })}
        </svg>

        {/* Legend */}
        {showLegend && config.yAxis && (
          <div className="flex justify-center gap-4 mt-2">
            {(Array.isArray(config.yAxis) ? config.yAxis : [config.yAxis]).map((axis, i) => (
              <div key={axis} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="text-xs text-muted-foreground">{axis}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default LineChart;
