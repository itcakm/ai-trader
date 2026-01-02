'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePreferencesStore } from '@/store/preferences';
import type { 
  GridPreferences as StoreGridPreferences,
  SortModel as StoreSortModel,
  FilterModel as StoreFilterModel,
} from '@/types/preferences';
import { DEFAULT_GRID_PREFERENCES } from '@/types/preferences';
import type { GridPreferences, SortModel, FilterModel, PinnedColumns } from './types';
import { DEFAULT_FILTER_MODEL, DEFAULT_PINNED_COLUMNS, DEFAULT_PAGE_SIZE } from './types';

/**
 * Options for the useGridPreferences hook
 */
export interface UseGridPreferencesOptions {
  /** Unique identifier for the grid */
  gridId: string;
  /** Whether to persist preferences */
  enabled?: boolean;
  /** Default column order */
  defaultColumnOrder?: string[];
  /** Default page size */
  defaultPageSize?: number;
  /** Debounce delay for saving preferences (ms) */
  debounceDelay?: number;
}

/**
 * Return type for the useGridPreferences hook
 */
export interface UseGridPreferencesReturn {
  /** Current grid preferences */
  preferences: GridPreferences;
  /** Update column order */
  setColumnOrder: (order: string[]) => void;
  /** Update column widths */
  setColumnWidths: (widths: Record<string, number>) => void;
  /** Update a single column width */
  setColumnWidth: (columnId: string, width: number) => void;
  /** Update pinned columns */
  setPinnedColumns: (pinned: PinnedColumns) => void;
  /** Pin a column */
  pinColumn: (columnId: string, side: 'left' | 'right' | null) => void;
  /** Update sort model */
  setSortModel: (sortModel: SortModel[]) => void;
  /** Update filter model */
  setFilterModel: (filterModel: FilterModel) => void;
  /** Update page size */
  setPageSize: (pageSize: number) => void;
  /** Reset preferences to defaults */
  resetPreferences: () => void;
  /** Whether preferences are being loaded */
  isLoading: boolean;
}

/**
 * Default grid preferences
 */
const getDefaultPreferences = (
  defaultColumnOrder: string[] = [],
  defaultPageSize: number = DEFAULT_PAGE_SIZE
): GridPreferences => ({
  columnOrder: defaultColumnOrder,
  columnWidths: {},
  pinnedColumns: DEFAULT_PINNED_COLUMNS,
  sortModel: [],
  filterModel: DEFAULT_FILTER_MODEL,
  pageSize: defaultPageSize,
});

/**
 * Convert store preferences to DataGrid preferences
 */
function fromStorePreferences(stored: StoreGridPreferences, defaults: GridPreferences): GridPreferences {
  return {
    columnOrder: stored.columnOrder.length > 0 ? stored.columnOrder : defaults.columnOrder,
    columnWidths: stored.columnWidths,
    pinnedColumns: stored.pinnedColumns,
    sortModel: stored.sortModel as SortModel[],
    filterModel: stored.filterModel as FilterModel,
    pageSize: stored.pageSize || defaults.pageSize,
  };
}

/**
 * Convert DataGrid preferences to store preferences
 */
function toStorePreferences(prefs: Partial<GridPreferences>): Partial<StoreGridPreferences> {
  const result: Partial<StoreGridPreferences> = {};
  
  if (prefs.columnOrder !== undefined) result.columnOrder = prefs.columnOrder;
  if (prefs.columnWidths !== undefined) result.columnWidths = prefs.columnWidths;
  if (prefs.pinnedColumns !== undefined) result.pinnedColumns = prefs.pinnedColumns;
  if (prefs.sortModel !== undefined) result.sortModel = prefs.sortModel as StoreSortModel[];
  if (prefs.filterModel !== undefined) result.filterModel = prefs.filterModel as StoreFilterModel;
  if (prefs.pageSize !== undefined) result.pageSize = prefs.pageSize;
  
  return result;
}

/**
 * Hook for managing grid preferences with persistence
 * Integrates with the global preferences store
 */
export function useGridPreferences({
  gridId,
  enabled = true,
  defaultColumnOrder = [],
  defaultPageSize = DEFAULT_PAGE_SIZE,
  debounceDelay = 500,
}: UseGridPreferencesOptions): UseGridPreferencesReturn {
  const store = usePreferencesStore();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  const defaults = useMemo(
    () => getDefaultPreferences(defaultColumnOrder, defaultPageSize),
    [defaultColumnOrder, defaultPageSize]
  );

  // Get current preferences from store or use defaults
  const preferences = useMemo(() => {
    if (!enabled) {
      return defaults;
    }

    const stored = store.getGridState(gridId);
    return fromStorePreferences(stored, defaults);
  }, [enabled, store, gridId, defaults]);

  // Debounced save function
  const savePreferences = useCallback(
    (updates: Partial<GridPreferences>) => {
      if (!enabled) return;

      // Clear existing timeout
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Schedule save
      debounceRef.current = setTimeout(() => {
        store.setGridState(gridId, toStorePreferences(updates));
      }, debounceDelay);
    },
    [enabled, store, gridId, debounceDelay]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Initialize preferences on first mount
  useEffect(() => {
    if (!enabled || isInitializedRef.current) return;
    isInitializedRef.current = true;

    // If no stored preferences, save defaults
    const stored = store.getGridState(gridId);
    if (stored.columnOrder.length === 0 && defaultColumnOrder.length > 0) {
      store.setGridState(gridId, toStorePreferences({
        columnOrder: defaultColumnOrder,
        pageSize: defaultPageSize,
      }));
    }
  }, [enabled, store, gridId, defaultColumnOrder, defaultPageSize]);

  // Update column order
  const setColumnOrder = useCallback(
    (order: string[]) => {
      savePreferences({ columnOrder: order });
    },
    [savePreferences]
  );

  // Update column widths
  const setColumnWidths = useCallback(
    (widths: Record<string, number>) => {
      savePreferences({ columnWidths: widths });
    },
    [savePreferences]
  );

  // Update a single column width
  const setColumnWidth = useCallback(
    (columnId: string, width: number) => {
      savePreferences({
        columnWidths: {
          ...preferences.columnWidths,
          [columnId]: width,
        },
      });
    },
    [savePreferences, preferences.columnWidths]
  );

  // Update pinned columns
  const setPinnedColumns = useCallback(
    (pinned: PinnedColumns) => {
      savePreferences({ pinnedColumns: pinned });
    },
    [savePreferences]
  );

  // Pin a column
  const pinColumn = useCallback(
    (columnId: string, side: 'left' | 'right' | null) => {
      const newPinned = {
        left: preferences.pinnedColumns.left.filter((id) => id !== columnId),
        right: preferences.pinnedColumns.right.filter((id) => id !== columnId),
      };

      if (side === 'left') {
        newPinned.left.push(columnId);
      } else if (side === 'right') {
        newPinned.right.push(columnId);
      }

      savePreferences({ pinnedColumns: newPinned });
    },
    [savePreferences, preferences.pinnedColumns]
  );

  // Update sort model
  const setSortModel = useCallback(
    (sortModel: SortModel[]) => {
      savePreferences({ sortModel });
    },
    [savePreferences]
  );

  // Update filter model
  const setFilterModel = useCallback(
    (filterModel: FilterModel) => {
      savePreferences({ filterModel });
    },
    [savePreferences]
  );

  // Update page size
  const setPageSize = useCallback(
    (pageSize: number) => {
      savePreferences({ pageSize });
    },
    [savePreferences]
  );

  // Reset preferences to defaults
  const resetPreferences = useCallback(() => {
    if (!enabled) return;

    store.setGridState(gridId, toStorePreferences(getDefaultPreferences(defaultColumnOrder, defaultPageSize)));
  }, [enabled, store, gridId, defaultColumnOrder, defaultPageSize]);

  return {
    preferences,
    setColumnOrder,
    setColumnWidths,
    setColumnWidth,
    setPinnedColumns,
    pinColumn,
    setSortModel,
    setFilterModel,
    setPageSize,
    resetPreferences,
    isLoading: false, // Could be enhanced to track loading state
  };
}

/**
 * Hook to create a DataGrid with automatic preference persistence
 * Returns props that can be spread onto the DataGrid component
 */
export function useDataGridWithPreferences<T>(
  gridId: string,
  columns: { id: string }[],
  options: Omit<UseGridPreferencesOptions, 'gridId' | 'defaultColumnOrder'> = {}
) {
  const defaultColumnOrder = useMemo(
    () => columns.map((col) => col.id),
    [columns]
  );

  const {
    preferences,
    setColumnOrder,
    setColumnWidths,
    setPinnedColumns,
    setSortModel,
    setFilterModel,
    setPageSize,
  } = useGridPreferences({
    gridId,
    defaultColumnOrder,
    ...options,
  });

  // Create callback for preference changes
  const onPreferencesChange = useCallback(
    (newPreferences: GridPreferences) => {
      // The individual setters handle debouncing, so we can update all at once
      if (JSON.stringify(newPreferences.columnOrder) !== JSON.stringify(preferences.columnOrder)) {
        setColumnOrder(newPreferences.columnOrder);
      }
      if (JSON.stringify(newPreferences.columnWidths) !== JSON.stringify(preferences.columnWidths)) {
        setColumnWidths(newPreferences.columnWidths);
      }
      if (JSON.stringify(newPreferences.pinnedColumns) !== JSON.stringify(preferences.pinnedColumns)) {
        setPinnedColumns(newPreferences.pinnedColumns);
      }
      if (JSON.stringify(newPreferences.sortModel) !== JSON.stringify(preferences.sortModel)) {
        setSortModel(newPreferences.sortModel);
      }
      if (JSON.stringify(newPreferences.filterModel) !== JSON.stringify(preferences.filterModel)) {
        setFilterModel(newPreferences.filterModel);
      }
      if (newPreferences.pageSize !== preferences.pageSize) {
        setPageSize(newPreferences.pageSize);
      }
    },
    [
      preferences,
      setColumnOrder,
      setColumnWidths,
      setPinnedColumns,
      setSortModel,
      setFilterModel,
      setPageSize,
    ]
  );

  return {
    initialPreferences: preferences,
    persistPreferences: true,
    onPreferencesChange,
  };
}
