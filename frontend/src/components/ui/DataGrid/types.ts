/**
 * DataGrid Types
 * Defines all types for the DataGrid component
 */

import type { ReactNode } from 'react';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort model for a column
 */
export interface SortModel {
  field: string;
  direction: SortDirection;
}

/**
 * Filter operator types
 */
export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'isEmpty'
  | 'isNotEmpty';

/**
 * Filter type based on column data type
 */
export type FilterType = 'text' | 'number' | 'date' | 'select' | 'boolean';

/**
 * Individual filter item
 */
export interface FilterItem {
  field: string;
  operator: FilterOperator;
  value: unknown;
  valueTo?: unknown; // For 'between' operator
}

/**
 * Filter model containing all active filters
 */
export interface FilterModel {
  items: FilterItem[];
  logicOperator: 'and' | 'or';
}

/**
 * Pagination state
 */
export interface PaginationState {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

/**
 * Column definition for the grid
 */
export interface ColumnDef<T> {
  /** Unique identifier for the column */
  id: string;
  /** Header text to display */
  header: string;
  /** Accessor for the cell value - can be a key or a function */
  accessor: keyof T | ((row: T) => unknown);
  /** Whether the column is sortable */
  sortable?: boolean;
  /** Whether the column is filterable */
  filterable?: boolean;
  /** Type of filter to use */
  filterType?: FilterType;
  /** Options for select filter type */
  filterOptions?: Array<{ label: string; value: unknown }>;
  /** Whether the column can be pinned */
  pinnable?: boolean;
  /** Whether the column can be resized */
  resizable?: boolean;
  /** Whether the column can be reordered */
  reorderable?: boolean;
  /** Initial width of the column */
  width?: number;
  /** Minimum width of the column */
  minWidth?: number;
  /** Maximum width of the column */
  maxWidth?: number;
  /** Custom cell renderer */
  render?: (value: unknown, row: T, rowIndex: number) => ReactNode;
  /** Custom header renderer */
  renderHeader?: (column: ColumnDef<T>) => ReactNode;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Whether the column is visible */
  visible?: boolean;
}

/**
 * Pinned columns configuration
 */
export interface PinnedColumns {
  left: string[];
  right: string[];
}

/**
 * Batch action definition
 */
export interface BatchAction<T> {
  /** Unique identifier for the action */
  id: string;
  /** Display label */
  label: string;
  /** Icon to display (optional) */
  icon?: ReactNode;
  /** Permission required (optional) */
  permission?: { resource: string; action: string };
  /** Handler function */
  onExecute: (selected: T[]) => Promise<void> | void;
  /** Confirmation message (optional) */
  confirmMessage?: string;
  /** Whether the action is destructive */
  destructive?: boolean;
  /** Whether the action is disabled */
  disabled?: boolean;
}

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'excel' | 'pdf';

/**
 * Grid preferences for persistence
 */
export interface GridPreferences {
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: PinnedColumns;
  sortModel: SortModel[];
  filterModel: FilterModel;
  pageSize: number;
}

/**
 * DataGrid props
 */
export interface DataGridProps<T> {
  /** Unique identifier for the grid (used for preference persistence) */
  id: string;
  /** Data to display */
  data: T[];
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Loading state */
  loading?: boolean;
  /** Enable sorting */
  sortable?: boolean;
  /** Enable filtering */
  filterable?: boolean;
  /** Enable pagination */
  paginated?: boolean;
  /** Available page sizes */
  pageSizes?: number[];
  /** Default page size */
  defaultPageSize?: number;
  /** Enable virtual scrolling for large datasets */
  virtualScroll?: boolean;
  /** Virtual scroll row height */
  rowHeight?: number;
  /** Virtual scroll overscan count */
  overscan?: number;
  /** Enable row selection */
  selectable?: boolean;
  /** Selection mode */
  selectionMode?: 'single' | 'multiple';
  /** Callback when selection changes */
  onSelectionChange?: (selected: T[]) => void;
  /** Batch actions for selected rows */
  batchActions?: BatchAction<T>[];
  /** Export formats to enable */
  exportFormats?: ExportFormat[];
  /** Callback for export */
  onExport?: (format: ExportFormat, data: T[]) => void;
  /** Enable column pinning */
  columnPinning?: boolean;
  /** Enable column reordering */
  columnReordering?: boolean;
  /** Persist preferences */
  persistPreferences?: boolean;
  /** Callback when preferences change */
  onPreferencesChange?: (preferences: GridPreferences) => void;
  /** Initial preferences */
  initialPreferences?: Partial<GridPreferences>;
  /** Row key accessor */
  getRowId?: (row: T) => string;
  /** Empty state message */
  emptyMessage?: string;
  /** Custom empty state renderer */
  renderEmpty?: () => ReactNode;
  /** Custom loading renderer */
  renderLoading?: () => ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Aria label for accessibility */
  ariaLabel?: string;
}

/**
 * Internal grid state
 */
export interface GridState<T> {
  sortModel: SortModel[];
  filterModel: FilterModel;
  pagination: PaginationState;
  selectedRows: T[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: PinnedColumns;
}

/**
 * Default filter model
 */
export const DEFAULT_FILTER_MODEL: FilterModel = {
  items: [],
  logicOperator: 'and',
};

/**
 * Default pinned columns
 */
export const DEFAULT_PINNED_COLUMNS: PinnedColumns = {
  left: [],
  right: [],
};

/**
 * Default page sizes
 */
export const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

/**
 * Default page size
 */
export const DEFAULT_PAGE_SIZE = 25;
