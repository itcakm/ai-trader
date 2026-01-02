'use client';

import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import type { ColumnDef, PinnedColumns } from './types';
import { getCellValue, generateRowId } from './utils';

interface DataGridBodyProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading: boolean;
  selectable: boolean;
  isRowSelected: (row: T) => boolean;
  onRowSelect: (row: T, selected: boolean) => void;
  getRowId?: (row: T) => string;
  virtualScroll: boolean;
  rowHeight: number;
  overscan: number;
  pinnedColumns: PinnedColumns;
}

export function DataGridBody<T>({
  data,
  columns,
  loading,
  selectable,
  isRowSelected,
  onRowSelect,
  getRowId,
  virtualScroll,
  rowHeight,
  overscan,
  pinnedColumns,
}: DataGridBodyProps<T>) {
  const containerRef = useRef<HTMLTableSectionElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);

  // Update container height on resize
  useEffect(() => {
    if (!virtualScroll) return;

    const container = containerRef.current?.parentElement;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [virtualScroll]);

  // Handle scroll for virtual scrolling
  useEffect(() => {
    if (!virtualScroll) return;

    const container = containerRef.current?.parentElement;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [virtualScroll]);

  // Calculate virtual scroll range
  const virtualRange = useMemo(() => {
    if (!virtualScroll || data.length === 0) {
      return { startIndex: 0, endIndex: data.length - 1, offsetTop: 0, totalHeight: 0 };
    }

    const totalHeight = data.length * rowHeight;
    const visibleStartIndex = Math.floor(scrollTop / rowHeight);
    const visibleEndIndex = Math.min(
      data.length - 1,
      Math.floor((scrollTop + containerHeight) / rowHeight)
    );

    const startIndex = Math.max(0, visibleStartIndex - overscan);
    const endIndex = Math.min(data.length - 1, visibleEndIndex + overscan);
    const offsetTop = startIndex * rowHeight;

    return { startIndex, endIndex, offsetTop, totalHeight };
  }, [virtualScroll, data.length, rowHeight, scrollTop, containerHeight, overscan]);

  // Determine if a column is pinned
  const isPinned = useCallback((columnId: string): 'left' | 'right' | null => {
    if (pinnedColumns.left.includes(columnId)) return 'left';
    if (pinnedColumns.right.includes(columnId)) return 'right';
    return null;
  }, [pinnedColumns]);

  // Calculate pinned column offsets
  const pinnedOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let leftOffset = selectable ? 48 : 0; // Account for checkbox column
    let rightOffset = 0;

    // Calculate left pinned offsets
    for (const colId of pinnedColumns.left) {
      const col = columns.find((c) => c.id === colId);
      offsets[colId] = leftOffset;
      leftOffset += col?.width || 150;
    }

    // Calculate right pinned offsets (from right edge)
    for (let i = pinnedColumns.right.length - 1; i >= 0; i--) {
      const colId = pinnedColumns.right[i];
      const col = columns.find((c) => c.id === colId);
      offsets[colId] = rightOffset;
      rightOffset += col?.width || 150;
    }

    return offsets;
  }, [columns, pinnedColumns, selectable]);

  // Render a single cell
  const renderCell = useCallback((row: T, column: ColumnDef<T>, rowIndex: number) => {
    const value = getCellValue(row, column);

    if (column.render) {
      return column.render(value, row, rowIndex);
    }

    // Default rendering
    if (value == null) {
      return <span className="text-muted-foreground">—</span>;
    }

    if (value instanceof Date) {
      return value.toLocaleDateString();
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    return String(value);
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <tbody>
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <tr key={`skeleton-${rowIndex}`} className="animate-pulse">
            {selectable && (
              <td className="px-3 py-3 border-b border-border">
                <div className="h-4 w-4 bg-muted rounded" />
              </td>
            )}
            {columns.map((column) => (
              <td
                key={column.id}
                className="px-4 py-3 border-b border-border"
              >
                <div className="h-4 bg-muted rounded w-3/4" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={columns.length + (selectable ? 1 : 0)}
            className="px-4 py-8 text-center text-muted-foreground"
          >
            No data available
          </td>
        </tr>
      </tbody>
    );
  }

  // Get rows to render (all rows or virtual range)
  const rowsToRender = virtualScroll
    ? data.slice(virtualRange.startIndex, virtualRange.endIndex + 1)
    : data;

  const startIndex = virtualScroll ? virtualRange.startIndex : 0;

  return (
    <tbody ref={containerRef} style={virtualScroll ? { position: 'relative' } : undefined}>
      {/* Spacer for virtual scroll */}
      {virtualScroll && virtualRange.offsetTop > 0 && (
        <tr style={{ height: virtualRange.offsetTop }} aria-hidden="true">
          <td colSpan={columns.length + (selectable ? 1 : 0)} />
        </tr>
      )}

      {rowsToRender.map((row, index) => {
        const actualIndex = startIndex + index;
        const rowId = generateRowId(row, actualIndex, getRowId);
        const selected = isRowSelected(row);

        return (
          <tr
            key={rowId}
            className={`
              hover:bg-muted/50 transition-colors
              ${selected ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
            `}
            style={{ height: virtualScroll ? rowHeight : undefined }}
            aria-selected={selected}
          >
            {/* Selection checkbox */}
            {selectable && (
              <td className="w-12 px-3 py-3 border-b border-border sticky left-0 bg-background z-10">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => onRowSelect(row, e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                  aria-label={`Select row ${actualIndex + 1}`}
                />
              </td>
            )}

            {/* Data cells */}
            {columns.map((column) => {
              const pinned = isPinned(column.id);

              return (
                <td
                  key={column.id}
                  className={`
                    px-4 py-3 text-sm text-foreground border-b border-border
                    ${pinned ? 'sticky bg-background z-10' : ''}
                    ${selected && pinned ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                  `}
                  style={{
                    width: column.width,
                    minWidth: column.minWidth,
                    maxWidth: column.maxWidth,
                    textAlign: column.align || 'left',
                    ...(pinned === 'left' && { left: pinnedOffsets[column.id] }),
                    ...(pinned === 'right' && { right: pinnedOffsets[column.id] }),
                  }}
                >
                  {renderCell(row, column, actualIndex)}
                </td>
              );
            })}
          </tr>
        );
      })}

      {/* Bottom spacer for virtual scroll */}
      {virtualScroll && (
        <tr
          style={{
            height: virtualRange.totalHeight - virtualRange.offsetTop - (rowsToRender.length * rowHeight),
          }}
          aria-hidden="true"
        >
          <td colSpan={columns.length + (selectable ? 1 : 0)} />
        </tr>
      )}
    </tbody>
  );
}
