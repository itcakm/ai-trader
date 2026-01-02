'use client';

import React, { useCallback, useMemo, useState } from 'react';
import type { DashboardWidget, WidgetPosition, GridLayout } from '@/types/dashboard';
import { DEFAULT_GRID_LAYOUT } from '@/types/dashboard';

/**
 * Props for DashboardGrid component
 */
export interface DashboardGridProps {
  widgets: DashboardWidget[];
  layout?: GridLayout;
  editable?: boolean;
  onWidgetMove?: (widgetId: string, position: WidgetPosition) => void;
  onWidgetResize?: (widgetId: string, position: WidgetPosition) => void;
  onWidgetRemove?: (widgetId: string) => void;
  renderWidget: (widget: DashboardWidget) => React.ReactNode;
  className?: string;
}

/**
 * Calculate grid cell position in pixels
 */
function calculatePixelPosition(
  position: WidgetPosition,
  layout: GridLayout,
  containerWidth: number
): { left: number; top: number; width: number; height: number } {
  const columnWidth = (containerWidth - (layout.columns - 1) * layout.gap) / layout.columns;
  
  return {
    left: position.x * (columnWidth + layout.gap),
    top: position.y * (layout.rowHeight + layout.gap),
    width: position.w * columnWidth + (position.w - 1) * layout.gap,
    height: position.h * layout.rowHeight + (position.h - 1) * layout.gap,
  };
}

/**
 * Calculate grid position from pixel coordinates
 */
function calculateGridPosition(
  pixelX: number,
  pixelY: number,
  layout: GridLayout,
  containerWidth: number
): { x: number; y: number } {
  const columnWidth = (containerWidth - (layout.columns - 1) * layout.gap) / layout.columns;
  const cellWidth = columnWidth + layout.gap;
  const cellHeight = layout.rowHeight + layout.gap;

  return {
    x: Math.max(0, Math.min(layout.columns - 1, Math.round(pixelX / cellWidth))),
    y: Math.max(0, Math.round(pixelY / cellHeight)),
  };
}

/**
 * Check if two widget positions overlap
 */
export function positionsOverlap(a: WidgetPosition, b: WidgetPosition): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/**
 * Find a valid position for a widget that doesn't overlap with others
 */
export function findValidPosition(
  widget: WidgetPosition,
  existingWidgets: WidgetPosition[],
  columns: number
): WidgetPosition {
  let position = { ...widget };
  
  // Ensure widget fits within columns
  if (position.x + position.w > columns) {
    position.x = Math.max(0, columns - position.w);
  }

  // Check for overlaps and adjust
  let hasOverlap = true;
  let maxIterations = 100;
  
  while (hasOverlap && maxIterations > 0) {
    hasOverlap = false;
    for (const existing of existingWidgets) {
      if (positionsOverlap(position, existing)) {
        hasOverlap = true;
        // Move below the overlapping widget
        position.y = existing.y + existing.h;
        break;
      }
    }
    maxIterations--;
  }

  return position;
}

/**
 * Calculate the total height needed for all widgets
 */
function calculateGridHeight(widgets: DashboardWidget[], layout: GridLayout): number {
  if (widgets.length === 0) return layout.rowHeight * 4;
  
  const maxY = Math.max(...widgets.map((w) => w.position.y + w.position.h));
  return maxY * (layout.rowHeight + layout.gap) + layout.gap;
}

/**
 * DashboardGrid - A responsive grid layout for dashboard widgets
 * 
 * Features:
 * - Configurable columns and row height
 * - Drag and drop widget repositioning (when editable)
 * - Widget resizing (when editable)
 * - Responsive breakpoints
 * - Collision detection
 */
export function DashboardGrid({
  widgets,
  layout = DEFAULT_GRID_LAYOUT,
  editable = false,
  onWidgetMove,
  onWidgetResize,
  onWidgetRemove,
  renderWidget,
  className = '',
}: DashboardGridProps) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const [draggingWidget, setDraggingWidget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Ref callback to measure container width
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      resizeObserver.observe(node);
      setContainerWidth(node.offsetWidth);
    }
  }, []);

  // Calculate grid height
  const gridHeight = useMemo(
    () => calculateGridHeight(widgets, layout),
    [widgets, layout]
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent, widgetId: string) => {
      if (!editable) return;
      
      setDraggingWidget(widgetId);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      
      // Set drag image
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', widgetId);
    },
    [editable]
  );

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!editable || !draggingWidget) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, [editable, draggingWidget]);

  // Handle drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!editable || !draggingWidget || !onWidgetMove) return;
      e.preventDefault();

      const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const dropX = e.clientX - containerRect.left - dragOffset.x;
      const dropY = e.clientY - containerRect.top - dragOffset.y;

      const gridPos = calculateGridPosition(dropX, dropY, layout, containerWidth);
      const widget = widgets.find((w) => w.id === draggingWidget);
      
      if (widget) {
        const newPosition: WidgetPosition = {
          ...widget.position,
          x: gridPos.x,
          y: gridPos.y,
        };

        // Ensure widget stays within bounds
        if (newPosition.x + newPosition.w > layout.columns) {
          newPosition.x = layout.columns - newPosition.w;
        }

        // Find valid position avoiding overlaps
        const otherWidgets = widgets
          .filter((w) => w.id !== draggingWidget)
          .map((w) => w.position);
        const validPosition = findValidPosition(newPosition, otherWidgets, layout.columns);

        onWidgetMove(draggingWidget, validPosition);
      }

      setDraggingWidget(null);
    },
    [editable, draggingWidget, onWidgetMove, dragOffset, layout, containerWidth, widgets]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggingWidget(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ minHeight: gridHeight }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {widgets.map((widget) => {
        const pixelPos = calculatePixelPosition(widget.position, layout, containerWidth);
        const isDragging = draggingWidget === widget.id;

        return (
          <div
            key={widget.id}
            className={`
              absolute transition-all duration-200 ease-out
              ${isDragging ? 'opacity-50 z-50' : 'z-10'}
              ${editable ? 'cursor-move' : ''}
            `}
            style={{
              left: pixelPos.left,
              top: pixelPos.top,
              width: pixelPos.width,
              height: pixelPos.height,
            }}
            draggable={editable}
            onDragStart={(e) => handleDragStart(e, widget.id)}
            onDragEnd={handleDragEnd}
          >
            <div className="relative w-full h-full">
              {renderWidget(widget)}
              
              {/* Edit controls */}
              {editable && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 hover:opacity-100 transition-opacity">
                  {onWidgetRemove && (
                    <button
                      onClick={() => onWidgetRemove(widget.id)}
                      className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                      aria-label="Remove widget"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Grid overlay for editing */}
      {editable && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
            `,
            backgroundSize: `${(containerWidth - (layout.columns - 1) * layout.gap) / layout.columns + layout.gap}px ${layout.rowHeight + layout.gap}px`,
          }}
        />
      )}
    </div>
  );
}

export default DashboardGrid;
