'use client';

import React, { useMemo } from 'react';
import { WidgetWrapper } from './WidgetWrapper';
import type { DataPoint, ChartConfig } from '@/types/dashboard';

/**
 * Props for PieChart component
 */
export interface PieChartProps {
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
  '#ec4899', // pink
  '#84cc16', // lime
];

/**
 * Calculate SVG arc path
 */
function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', cx, cy,
    'L', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    'Z',
  ].join(' ');
}

/**
 * Convert polar coordinates to cartesian
 */
function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

/**
 * PieChart - Displays proportional data as a pie chart
 * 
 * Features:
 * - SVG-based rendering (no external dependencies)
 * - Configurable colors
 * - Optional legend
 * - Percentage labels
 * - Hover effects
 * - Drill-down navigation
 */
export function PieChart({
  title,
  data,
  config = {},
  onDrillDown,
  isLoading = false,
  error = null,
  className = '',
}: PieChartProps) {
  const colors = config.colors || DEFAULT_COLORS;
  const showLegend = config.showLegend !== false;

  // Chart dimensions
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 10;

  // Calculate total and slices
  const { total, slices } = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    let currentAngle = 0;

    const slices = data.map((point, index) => {
      const percentage = total > 0 ? (point.value / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      return {
        ...point,
        percentage,
        startAngle,
        endAngle,
        color: colors[index % colors.length],
      };
    });

    return { total, slices };
  }, [data, colors]);

  return (
    <WidgetWrapper
      title={title}
      showHeader={config.showHeader !== false}
      onDrillDown={onDrillDown}
      isLoading={isLoading}
      error={error}
      className={className}
    >
      <div className="w-full h-full flex flex-col items-center justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[200px] flex-shrink-0"
          preserveAspectRatio="xMidYMid meet"
        >
          {slices.map((slice, index) => {
            // Handle full circle case
            if (slice.percentage >= 99.9) {
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill={slice.color}
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <title>{`${slice.label || slice.timestamp}: ${slice.value} (${slice.percentage.toFixed(1)}%)`}</title>
                </circle>
              );
            }

            // Skip very small slices
            if (slice.percentage < 0.5) return null;

            const path = describeArc(cx, cy, radius, slice.startAngle, slice.endAngle);

            return (
              <path
                key={index}
                d={path}
                fill={slice.color}
                stroke="white"
                strokeWidth={1}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              >
                <title>{`${slice.label || slice.timestamp}: ${slice.value} (${slice.percentage.toFixed(1)}%)`}</title>
              </path>
            );
          })}

          {/* Center hole for donut effect (optional) */}
          <circle
            cx={cx}
            cy={cy}
            r={radius * 0.5}
            fill="var(--card)"
            className="pointer-events-none"
          />

          {/* Center text */}
          <text
            x={cx}
            y={cy - 5}
            textAnchor="middle"
            className="text-lg font-bold fill-foreground"
          >
            {total.toFixed(0)}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            className="text-xs fill-muted-foreground"
          >
            Total
          </text>
        </svg>

        {/* Legend */}
        {showLegend && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {slices.map((slice, index) => (
              <div key={index} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {(slice.label || slice.timestamp).slice(0, 12)}
                  <span className="ml-1 text-foreground">
                    ({slice.percentage.toFixed(1)}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default PieChart;
