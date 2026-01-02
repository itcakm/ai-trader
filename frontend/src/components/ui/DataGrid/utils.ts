/**
 * DataGrid Utilities
 * Helper functions for sorting, filtering, and pagination
 */

import type {
  ColumnDef,
  SortModel,
  FilterModel,
  FilterItem,
  FilterOperator,
  PaginationState,
} from './types';

/**
 * Get the value from a row using the column accessor
 */
export function getCellValue<T>(row: T, column: ColumnDef<T>): unknown {
  if (typeof column.accessor === 'function') {
    return column.accessor(row);
  }
  return row[column.accessor as keyof T];
}

/**
 * Compare two values for sorting
 */
function compareValues(a: unknown, b: unknown, direction: 'asc' | 'desc'): number {
  const multiplier = direction === 'asc' ? 1 : -1;

  // Handle null/undefined
  if (a == null && b == null) return 0;
  if (a == null) return 1 * multiplier;
  if (b == null) return -1 * multiplier;

  // Handle dates
  if (a instanceof Date && b instanceof Date) {
    return (a.getTime() - b.getTime()) * multiplier;
  }

  // Handle numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * multiplier;
  }

  // Handle strings
  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  return strA.localeCompare(strB) * multiplier;
}

/**
 * Sort data based on sort model
 */
export function sortData<T>(
  data: T[],
  sortModel: SortModel[],
  columns: ColumnDef<T>[]
): T[] {
  if (sortModel.length === 0) return data;

  const columnMap = new Map(columns.map((col) => [col.id, col]));

  return [...data].sort((a, b) => {
    for (const sort of sortModel) {
      const column = columnMap.get(sort.field);
      if (!column) continue;

      const valueA = getCellValue(a, column);
      const valueB = getCellValue(b, column);
      const result = compareValues(valueA, valueB, sort.direction);

      if (result !== 0) return result;
    }
    return 0;
  });
}

/**
 * Check if a value matches a filter item
 */
function matchesFilter(value: unknown, filter: FilterItem): boolean {
  const { operator, value: filterValue, valueTo } = filter;

  // Handle empty checks first
  if (operator === 'isEmpty') {
    return value == null || value === '' || (Array.isArray(value) && value.length === 0);
  }
  if (operator === 'isNotEmpty') {
    return value != null && value !== '' && !(Array.isArray(value) && value.length === 0);
  }

  // Handle null/undefined values
  if (value == null) return false;

  // Convert to string for text operations
  const strValue = String(value).toLowerCase();
  const strFilterValue = String(filterValue).toLowerCase();

  switch (operator) {
    case 'equals':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value === filterValue;
      }
      return strValue === strFilterValue;

    case 'notEquals':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value !== filterValue;
      }
      return strValue !== strFilterValue;

    case 'contains':
      return strValue.includes(strFilterValue);

    case 'startsWith':
      return strValue.startsWith(strFilterValue);

    case 'endsWith':
      return strValue.endsWith(strFilterValue);

    case 'gt':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value > filterValue;
      }
      if (value instanceof Date && filterValue instanceof Date) {
        return value.getTime() > filterValue.getTime();
      }
      return strValue > strFilterValue;

    case 'gte':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value >= filterValue;
      }
      if (value instanceof Date && filterValue instanceof Date) {
        return value.getTime() >= filterValue.getTime();
      }
      return strValue >= strFilterValue;

    case 'lt':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value < filterValue;
      }
      if (value instanceof Date && filterValue instanceof Date) {
        return value.getTime() < filterValue.getTime();
      }
      return strValue < strFilterValue;

    case 'lte':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value <= filterValue;
      }
      if (value instanceof Date && filterValue instanceof Date) {
        return value.getTime() <= filterValue.getTime();
      }
      return strValue <= strFilterValue;

    case 'between':
      if (typeof value === 'number' && typeof filterValue === 'number' && typeof valueTo === 'number') {
        return value >= filterValue && value <= valueTo;
      }
      if (value instanceof Date && filterValue instanceof Date && valueTo instanceof Date) {
        const time = value.getTime();
        return time >= filterValue.getTime() && time <= valueTo.getTime();
      }
      return false;

    default:
      return true;
  }
}

/**
 * Filter data based on filter model
 */
export function filterData<T>(
  data: T[],
  filterModel: FilterModel,
  columns: ColumnDef<T>[]
): T[] {
  if (filterModel.items.length === 0) return data;

  const columnMap = new Map(columns.map((col) => [col.id, col]));

  return data.filter((row) => {
    const results = filterModel.items.map((filter) => {
      const column = columnMap.get(filter.field);
      if (!column) return true;

      const value = getCellValue(row, column);
      return matchesFilter(value, filter);
    });

    if (filterModel.logicOperator === 'and') {
      return results.every(Boolean);
    }
    return results.some(Boolean);
  });
}

/**
 * Paginate data
 */
export function paginateData<T>(
  data: T[],
  page: number,
  pageSize: number
): { data: T[]; pagination: PaginationState } {
  const totalRows = data.length;
  const totalPages = Math.ceil(totalRows / pageSize);
  const validPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = validPage * pageSize;
  const end = start + pageSize;

  return {
    data: data.slice(start, end),
    pagination: {
      page: validPage,
      pageSize,
      totalRows,
      totalPages,
    },
  };
}

/**
 * Process data with sorting, filtering, and pagination
 */
export function processData<T>(
  data: T[],
  sortModel: SortModel[],
  filterModel: FilterModel,
  page: number,
  pageSize: number,
  columns: ColumnDef<T>[]
): { data: T[]; filteredData: T[]; pagination: PaginationState } {
  // Apply filters first
  const filteredData = filterData(data, filterModel, columns);

  // Then sort
  const sortedData = sortData(filteredData, sortModel, columns);

  // Finally paginate
  const { data: paginatedData, pagination } = paginateData(sortedData, page, pageSize);

  return {
    data: paginatedData,
    filteredData: sortedData,
    pagination,
  };
}

/**
 * Get available filter operators for a filter type
 */
export function getFilterOperators(filterType: string): FilterOperator[] {
  switch (filterType) {
    case 'text':
      return ['contains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'];
    case 'number':
      return ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'];
    case 'date':
      return ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'];
    case 'select':
      return ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'];
    case 'boolean':
      return ['equals', 'notEquals'];
    default:
      return ['equals', 'notEquals', 'contains'];
  }
}

/**
 * Get human-readable label for filter operator
 */
export function getOperatorLabel(operator: FilterOperator): string {
  const labels: Record<FilterOperator, string> = {
    equals: 'Equals',
    notEquals: 'Not equals',
    contains: 'Contains',
    startsWith: 'Starts with',
    endsWith: 'Ends with',
    gt: 'Greater than',
    gte: 'Greater than or equal',
    lt: 'Less than',
    lte: 'Less than or equal',
    between: 'Between',
    isEmpty: 'Is empty',
    isNotEmpty: 'Is not empty',
  };
  return labels[operator] || operator;
}

/**
 * Generate a unique row ID
 */
export function generateRowId<T>(row: T, index: number, getRowId?: (row: T) => string): string {
  if (getRowId) {
    return getRowId(row);
  }
  // Try common ID fields
  const record = row as Record<string, unknown>;
  if (record.id != null) return String(record.id);
  if (record._id != null) return String(record._id);
  if (record.key != null) return String(record.key);
  return `row-${index}`;
}
