'use client';

import React, { useCallback, useState, useRef } from 'react';
import type { ColumnDef, SortModel, PinnedColumns } from './types';

interface DataGridHeaderProps<T> {
  columns: ColumnDef<T>[];
  sortable: boolean;
  sortModel: SortModel[];
  onSort: (columnId: string) => void;
  onMultiSort: (columnId: string) => void;
  selectable: boolean;
  selectionMode: 'single' | 'multiple';
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (selected: boolean) => void;
  columnPinning: boolean;
  pinnedColumns: PinnedColumns;
  onColumnPin: (columnId: string, side: 'left' | 'right' | null) => void;
  columnReordering: boolean;
  onColumnReorder: (fromIndex: number, toIndex: number) => void;
  onColumnResize: (columnId: string, width: number) => void;
}

export function DataGridHeader<T>({
  columns,
  sortable,
  sortModel,
  onSort,
  onMultiSort,
  selectable,
  selectionMode,
  allSelected,
  someSelected,
  onSelectAll,
  columnPinning,
  pinnedColumns,
  onColumnPin,
  columnReordering,
  onColumnReorder,
  onColumnResize,
}: DataGridHeaderProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  const getSortDirection = useCallback(
    (columnId: string) => {
      const sort = sortModel.find((s) => s.field === columnId);
      return sort?.direction || null;
    },
    [sortModel]
  );

  const getSortIndex = useCallback(
    (columnId: string) => {
      if (sortModel.length <= 1) return null;
      const index = sortModel.findIndex((s) => s.field === columnId);
      return index >= 0 ? index + 1 : null;
    },
    [sortModel]
  );

  const isPinned = useCallback(
    (columnId: string): 'left' | 'right' | null => {
      if (pinnedColumns.left.includes(columnId)) return 'left';
      if (pinnedColumns.right.includes(columnId)) return 'right';
      return null;
    },
    [pinnedColumns]
  );

  const handleHeaderClick = useCallback(
    (e: React.MouseEvent, columnId: string, isSortable: boolean) => {
      if (!isSortable) return;

      if (e.shiftKey) {
        onMultiSort(columnId);
      } else {
        onSort(columnId);
      }
    },
    [onSort, onMultiSort]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      if (!columnReordering) return;
      setDraggedIndex(index);
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
      
      // Create a custom drag image
      const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
      dragImage.style.opacity = '0.8';
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    },
    [columnReordering]
  );

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (fromIndex !== toIndex) {
        onColumnReorder(fromIndex, toIndex);
      }
      setDraggedIndex(null);
      setDropTargetIndex(null);
    },
    [onColumnReorder]
  );

  const handlePinClick = useCallback(
    (e: React.MouseEvent, columnId: string) => {
      e.stopPropagation();
      const currentPin = isPinned(columnId);
      if (currentPin === null) {
        onColumnPin(columnId, 'left');
      } else if (currentPin === 'left') {
        onColumnPin(columnId, 'right');
      } else {
        onColumnPin(columnId, null);
      }
    },
    [isPinned, onColumnPin]
  );

  // Column resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, columnId: string, currentWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingColumn(columnId);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = currentWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - resizeStartX.current;
        const newWidth = Math.max(50, resizeStartWidth.current + delta);
        onColumnResize(columnId, newWidth);
      };

      const handleMouseUp = () => {
        setResizingColumn(null);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onColumnResize]
  );

  return (
    <thead className="bg-muted/50 sticky top-0 z-20">
      <tr>
        {/* Selection checkbox column */}
        {selectable && selectionMode === 'multiple' && (
          <th
            className="w-12 px-3 py-3 text-left border-b border-border sticky left-0 bg-muted/50 z-30"
            scope="col"
          >
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
              aria-label="Select all rows"
            />
          </th>
        )}

        {/* Data columns */}
        {columns.map((column, index) => {
          const isSortable = sortable && column.sortable !== false;
          const sortDirection = getSortDirection(column.id);
          const sortIndex = getSortIndex(column.id);
          const pinned = isPinned(column.id);
          const canReorder = columnReordering && column.reorderable !== false;
          const canResize = column.resizable !== false;
          const isDragging = draggedIndex === index;
          const isDropTarget = dropTargetIndex === index && draggedIndex !== index;

          return (
            <th
              key={column.id}
              className={`
                px-4 py-3 text-left text-sm font-semibold text-foreground
                border-b border-border relative group
                ${isSortable ? 'cursor-pointer hover:bg-muted/80 select-none' : ''}
                ${pinned ? 'sticky bg-muted/50 z-20' : ''}
                ${isDragging ? 'opacity-50' : ''}
                ${isDropTarget ? 'bg-primary-100 dark:bg-primary-900/30' : ''}
              `}
              style={{
                width: column.width,
                minWidth: column.minWidth || 80,
                maxWidth: column.maxWidth,
                textAlign: column.align || 'left',
                ...(pinned === 'left' && { left: selectable ? 48 : 0 }),
                ...(pinned === 'right' && { right: 0 }),
              }}
              scope="col"
              aria-sort={
                sortDirection === 'asc'
                  ? 'ascending'
                  : sortDirection === 'desc'
                  ? 'descending'
                  : 'none'
              }
              onClick={(e) => handleHeaderClick(e, column.id, isSortable)}
              draggable={canReorder}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="flex items-center gap-2">
                {/* Drag handle */}
                {canReorder && (
                  <span className="cursor-grab opacity-0 group-hover:opacity-50 hover:opacity-100">
                    <DragHandleIcon />
                  </span>
                )}

                {/* Column header content */}
                <span className="flex-1 truncate">
                  {column.renderHeader ? column.renderHeader(column) : column.header}
                </span>

                {/* Sort indicator */}
                {isSortable && sortDirection && (
                  <span className="flex items-center text-primary-600">
                    {sortDirection === 'asc' ? (
                      <SortAscIcon />
                    ) : (
                      <SortDescIcon />
                    )}
                    {sortIndex && (
                      <span className="text-xs ml-0.5">{sortIndex}</span>
                    )}
                  </span>
                )}

                {/* Pin indicator/button */}
                {columnPinning && column.pinnable !== false && (
                  <button
                    onClick={(e) => handlePinClick(e, column.id)}
                    className={`
                      p-0.5 rounded hover:bg-muted
                      ${pinned ? 'text-primary-600' : 'text-muted-foreground opacity-0 group-hover:opacity-100'}
                    `}
                    aria-label={
                      pinned
                        ? `Unpin column ${column.header}`
                        : `Pin column ${column.header}`
                    }
                  >
                    <PinIcon pinned={pinned} />
                  </button>
                )}
              </div>

              {/* Resize handle */}
              {canResize && (
                <div
                  className={`
                    absolute right-0 top-0 bottom-0 w-1 cursor-col-resize
                    hover:bg-primary-500 transition-colors
                    ${resizingColumn === column.id ? 'bg-primary-500' : 'bg-transparent'}
                  `}
                  onMouseDown={(e) => handleResizeStart(e, column.id, column.width || 150)}
                />
              )}

              {/* Drop indicator */}
              {isDropTarget && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500" />
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

// Icons
function DragHandleIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
    </svg>
  );
}

function SortAscIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 15l7-7 7 7"
      />
    </svg>
  );
}

function SortDescIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

function PinIcon({ pinned }: { pinned: 'left' | 'right' | null }) {
  return (
    <svg
      className={`w-4 h-4 ${pinned === 'right' ? 'rotate-90' : ''}`}
      fill={pinned ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  );
}
