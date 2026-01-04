'use client';

import React, { useMemo } from 'react';
import { WidgetWrapper } from './WidgetWrapper';
import type { DataPoint, ChartConfig } from '@/types/dashboard';

/**
 * Props for BarChart component
 */
export interface BarChartProps {
  title: string;
  data: DataPoint[];
  config?: Partial<ChartConfig>;
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
 * BarChart - Displays categorical data as a bar chart
 * 
 * Features:
 * - SVG-based rendering (no external dependencies)
 * - Configurable colors
 * - Optional grid lines
 * - Optional legend
 * - Stacked bar support
 * - Responsive sizing
 * - Drill-down navigation
 */
export function BarChart({
  title,
  data,
  config = {},
  onDrillDown,
  isLoading = false,
  error = null,
  className = '',
}: BarChartProps) {
  const colors = config.colors || DEFAULT_COLORS;
  const showGrid = config.showGrid !== false;
  const showLegend = config.showLegend !== false;

  // Chart dimensions
  const width = 400;
  const height = 200;
  const padding = 40;

  // Calculate bar dimensions
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barCount = data.length;
  const barGap = 8;
  const barWidth = Math.max(10, (chartWidth - barGap * (barCount - 1)) / barCount);

  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    if (data.length === 0) return 100;
    return Math.max(...data.map((d) => d.value));
  }, [data]);

  // Calculate Y-axis labels
  const yAxisLabels = useMemo(() => {
    const step = maxValue / 4 || 1;
    return Array.from({ length: 5 }, (_, i) => step * i);
  }, [maxValue]);

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
              {yAxisLabels.map((_, i) => {
                const y = padding + (chartHeight / 4) * (4 - i);
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
            </g>
          )}

          {/* Bars */}
          {data.map((point, index) => {
            const barHeight = (point.value / maxValue) * chartHeight;
            const x = padding + index * (barWidth + barGap);
            const y = padding + chartHeight - barHeight;

            return (
              <g key={index}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={colors[index % colors.length]}
                  rx={2}
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <title>{`${point.label || point.timestamp}: ${point.value}`}</title>
                </rect>
                {/* Value label on top of bar */}
                {barHeight > 20 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className="text-xs fill-muted-foreground"
                  >
                    {point.value.toFixed(0)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Y-axis labels */}
          {yAxisLabels.map((value, i) => {
            const y = padding + (chartHeight / 4) * (4 - i);
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
          {data.map((point, index) => {
            const x = padding + index * (barWidth + barGap) + barWidth / 2;
            return (
              <text
                key={`x-${index}`}
                x={x}
                y={height - padding + 16}
                textAnchor="middle"
                className="text-xs fill-muted-foreground"
              >
                {(point.label || point.timestamp).slice(0, 8)}
              </text>
            );
          })}

          {/* Axes */}
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="currentColor"
            className="text-border"
          />
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="currentColor"
            className="text-border"
          />
        </svg>

        {/* Legend */}
        {showLegend && data.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {data.slice(0, 6).map((point, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="text-xs text-muted-foreground">
                  {(point.label || point.timestamp).slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default BarChart;
