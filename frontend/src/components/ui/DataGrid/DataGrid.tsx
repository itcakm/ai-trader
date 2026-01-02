'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  DataGridProps,
  ColumnDef,
  SortModel,
  FilterModel,
  FilterItem,
  PaginationState,
  GridPreferences,
  PinnedColumns,
} from './types';
import {
  DEFAULT_FILTER_MODEL,
  DEFAULT_PINNED_COLUMNS,
  DEFAULT_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
} from './types';
import { processData, getCellValue, generateRowId } from './utils';
import { exportData } from './export';
import { DataGridHeader } from './DataGridHeader';
import { DataGridBody } from './DataGridBody';
import { DataGridPagination } from './DataGridPagination';
import { DataGridToolbar } from './DataGridToolbar';
import { DataGridFilterPanel } from './DataGridFilterPanel';

/**
 * DataGrid Component
 * A powerful data grid with sorting, filtering, pagination, and more
 */
export function DataGrid<T>({
  id,
  data,
  columns: initialColumns,
  loading = false,
  sortable = true,
  filterable = true,
  paginated = true,
  pageSizes = DEFAULT_PAGE_SIZES,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  virtualScroll = false,
  rowHeight = 48,
  overscan = 5,
  selectable = false,
  selectionMode = 'multiple',
  onSelectionChange,
  batchActions = [],
  exportFormats = [],
  onExport,
  columnPinning = false,
  columnReordering = false,
  persistPreferences = false,
  onPreferencesChange,
  initialPreferences,
  getRowId,
  emptyMessage = 'No data available',
  renderEmpty,
  renderLoading,
  className = '',
  ariaLabel,
}: DataGridProps<T>) {
  // Initialize state from preferences or defaults
  const [sortModel, setSortModel] = useState<SortModel[]>(
    initialPreferences?.sortModel || []
  );
  const [filterModel, setFilterModel] = useState<FilterModel>(
    initialPreferences?.filterModel || DEFAULT_FILTER_MODEL
  );
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(
    initialPreferences?.pageSize || defaultPageSize
  );
  const [selectedRows, setSelectedRows] = useState<T[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(
    initialPreferences?.columnOrder || initialColumns.map((col) => col.id)
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    initialPreferences?.columnWidths || {}
  );
  const [pinnedColumns, setPinnedColumns] = useState<PinnedColumns>(
    initialPreferences?.pinnedColumns || DEFAULT_PINNED_COLUMNS
  );
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Reorder columns based on columnOrder
  const columns = useMemo(() => {
    const columnMap = new Map(initialColumns.map((col) => [col.id, col]));
    const orderedColumns: ColumnDef<T>[] = [];

    // Add columns in order
    for (const colId of columnOrder) {
      const col = columnMap.get(colId);
      if (col) {
        orderedColumns.push({
          ...col,
          width: columnWidths[colId] || col.width,
        });
      }
    }

    // Add any new columns not in the order
    for (const col of initialColumns) {
      if (!columnOrder.includes(col.id)) {
        orderedColumns.push({
          ...col,
          width: columnWidths[col.id] || col.width,
        });
      }
    }

    return orderedColumns;
  }, [initialColumns, columnOrder, columnWidths]);

  // Process data with sorting, filtering, and pagination
  const { data: processedData, filteredData, pagination } = useMemo(() => {
    return processData(data, sortModel, filterModel, page, pageSize, columns);
  }, [data, sortModel, filterModel, page, pageSize, columns]);

  // Build current preferences
  const currentPreferences = useMemo<GridPreferences>(() => ({
    columnOrder,
    columnWidths,
    pinnedColumns,
    sortModel,
    filterModel,
    pageSize,
  }), [columnOrder, columnWidths, pinnedColumns, sortModel, filterModel, pageSize]);

  // Notify preference changes
  useEffect(() => {
    if (persistPreferences && onPreferencesChange) {
      onPreferencesChange(currentPreferences);
    }
  }, [currentPreferences, persistPreferences, onPreferencesChange]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [filterModel]);

  // Handle sort
  const handleSort = useCallback((columnId: string) => {
    setSortModel((prev) => {
      const existingIndex = prev.findIndex((s) => s.field === columnId);

      if (existingIndex === -1) {
        // Add new sort (single column mode - replace existing)
        return [{ field: columnId, direction: 'asc' }];
      }

      const existing = prev[existingIndex];
      if (existing.direction === 'asc') {
        // Toggle to desc
        return [{ field: columnId, direction: 'desc' }];
      }

      // Remove sort (was desc)
      return [];
    });
  }, []);

  // Handle multi-column sort (shift+click)
  const handleMultiSort = useCallback((columnId: string) => {
    setSortModel((prev) => {
      const existingIndex = prev.findIndex((s) => s.field === columnId);

      if (existingIndex === -1) {
        // Add to existing sorts
        return [...prev, { field: columnId, direction: 'asc' }];
      }

      const existing = prev[existingIndex];
      if (existing.direction === 'asc') {
        // Toggle to desc
        const newSort = [...prev];
        newSort[existingIndex] = { ...existing, direction: 'desc' };
        return newSort;
      }

      // Remove from sorts
      return prev.filter((_, i) => i !== existingIndex);
    });
  }, []);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilterModel: FilterModel) => {
    setFilterModel(newFilterModel);
  }, []);

  // Handle adding a filter
  const handleAddFilter = useCallback((filter: FilterItem) => {
    setFilterModel((prev) => ({
      ...prev,
      items: [...prev.items, filter],
    }));
  }, []);

  // Handle removing a filter
  const handleRemoveFilter = useCallback((index: number) => {
    setFilterModel((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }, []);

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    setFilterModel(DEFAULT_FILTER_MODEL);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Handle page size change
  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(0);
  }, []);

  // Handle row selection
  const handleRowSelect = useCallback((row: T, selected: boolean) => {
    setSelectedRows((prev) => {
      let newSelection: T[];

      if (selectionMode === 'single') {
        newSelection = selected ? [row] : [];
      } else {
        if (selected) {
          newSelection = [...prev, row];
        } else {
          const rowId = generateRowId(row, 0, getRowId);
          newSelection = prev.filter((r) => generateRowId(r, 0, getRowId) !== rowId);
        }
      }

      onSelectionChange?.(newSelection);
      return newSelection;
    });
  }, [selectionMode, getRowId, onSelectionChange]);

  // Handle select all
  const handleSelectAll = useCallback((selected: boolean) => {
    const newSelection = selected ? [...filteredData] : [];
    setSelectedRows(newSelection);
    onSelectionChange?.(newSelection);
  }, [filteredData, onSelectionChange]);

  // Check if a row is selected
  const isRowSelected = useCallback((row: T) => {
    const rowId = generateRowId(row, 0, getRowId);
    return selectedRows.some((r) => generateRowId(r, 0, getRowId) === rowId);
  }, [selectedRows, getRowId]);

  // Handle column reorder
  const handleColumnReorder = useCallback((fromIndex: number, toIndex: number) => {
    setColumnOrder((prev) => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return newOrder;
    });
  }, []);

  // Handle column resize
  const handleColumnResize = useCallback((columnId: string, width: number) => {
    setColumnWidths((prev) => ({
      ...prev,
      [columnId]: width,
    }));
  }, []);

  // Handle column pin
  const handleColumnPin = useCallback((columnId: string, side: 'left' | 'right' | null) => {
    setPinnedColumns((prev) => {
      const newPinned = {
        left: prev.left.filter((id) => id !== columnId),
        right: prev.right.filter((id) => id !== columnId),
      };

      if (side === 'left') {
        newPinned.left.push(columnId);
      } else if (side === 'right') {
        newPinned.right.push(columnId);
      }

      return newPinned;
    });
  }, []);

  // Handle export
  const handleExport = useCallback((format: 'csv' | 'excel' | 'pdf') => {
    if (onExport) {
      // Use custom export handler
      onExport(format, filteredData);
    } else {
      // Use built-in export
      exportData(filteredData, columns, format, { filename: id });
    }
  }, [onExport, filteredData, columns, id]);

  // Render loading state
  if (loading && renderLoading) {
    return renderLoading();
  }

  // Render empty state
  if (!loading && data.length === 0) {
    if (renderEmpty) {
      return renderEmpty();
    }
    return (
      <div className={`flex items-center justify-center p-8 text-muted-foreground ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col border border-border rounded-lg overflow-hidden bg-background ${className}`}
      role="grid"
      aria-label={ariaLabel || `Data grid: ${id}`}
      aria-busy={loading}
    >
      {/* Toolbar */}
      {(filterable || selectable || exportFormats.length > 0) && (
        <DataGridToolbar
          filterable={filterable}
          filterCount={filterModel.items.length}
          onToggleFilters={() => setShowFilterPanel(!showFilterPanel)}
          selectable={selectable}
          selectedCount={selectedRows.length}
          batchActions={batchActions}
          selectedRows={selectedRows}
          exportFormats={exportFormats}
          onExport={handleExport}
          onClearSelection={() => handleSelectAll(false)}
        />
      )}

      {/* Filter Panel */}
      {filterable && showFilterPanel && (
        <DataGridFilterPanel
          columns={columns}
          filterModel={filterModel}
          onFilterChange={handleFilterChange}
          onAddFilter={handleAddFilter}
          onRemoveFilter={handleRemoveFilter}
          onClearFilters={handleClearFilters}
        />
      )}

      {/* Table Container */}
      <div className="overflow-auto flex-1">
        <table className="w-full border-collapse">
          <DataGridHeader
            columns={columns}
            sortable={sortable}
            sortModel={sortModel}
            onSort={handleSort}
            onMultiSort={handleMultiSort}
            selectable={selectable}
            selectionMode={selectionMode}
            allSelected={selectedRows.length === filteredData.length && filteredData.length > 0}
            someSelected={selectedRows.length > 0 && selectedRows.length < filteredData.length}
            onSelectAll={handleSelectAll}
            columnPinning={columnPinning}
            pinnedColumns={pinnedColumns}
            onColumnPin={handleColumnPin}
            columnReordering={columnReordering}
            onColumnReorder={handleColumnReorder}
            onColumnResize={handleColumnResize}
          />
          <DataGridBody
            data={processedData}
            columns={columns}
            loading={loading}
            selectable={selectable}
            isRowSelected={isRowSelected}
            onRowSelect={handleRowSelect}
            getRowId={getRowId}
            virtualScroll={virtualScroll}
            rowHeight={rowHeight}
            overscan={overscan}
            pinnedColumns={pinnedColumns}
          />
        </table>
      </div>

      {/* Pagination */}
      {paginated && (
        <DataGridPagination
          pagination={pagination}
          pageSizes={pageSizes}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
