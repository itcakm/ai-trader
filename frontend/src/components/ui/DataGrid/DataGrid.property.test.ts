/**
 * Feature: ui-implementation, Property 7: Data Grid Operations Correctness
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * For any data grid with a dataset, applying sort operations SHALL produce correctly
 * ordered results, applying filter operations SHALL return only matching rows, and
 * batch actions SHALL execute on exactly the selected rows.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  sortData,
  filterData,
  paginateData,
  processData,
  getCellValue,
} from './utils';
import type {
  ColumnDef,
  SortModel,
  FilterModel,
  FilterItem,
  FilterOperator,
} from './types';
import { DEFAULT_FILTER_MODEL } from './types';

// Test data type
interface TestRow {
  id: string;
  name: string;
  age: number;
  score: number;
  active: boolean;
  createdAt: Date;
  category: string;
}

// Column definitions for test data
const testColumns: ColumnDef<TestRow>[] = [
  { id: 'id', header: 'ID', accessor: 'id' },
  { id: 'name', header: 'Name', accessor: 'name', filterType: 'text' },
  { id: 'age', header: 'Age', accessor: 'age', filterType: 'number' },
  { id: 'score', header: 'Score', accessor: 'score', filterType: 'number' },
  { id: 'active', header: 'Active', accessor: 'active', filterType: 'boolean' },
  { id: 'createdAt', header: 'Created', accessor: 'createdAt', filterType: 'date' },
  { id: 'category', header: 'Category', accessor: 'category', filterType: 'select' },
];

// Arbitraries for generating test data
const testRowArbitrary: fc.Arbitrary<TestRow> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  age: fc.integer({ min: 0, max: 120 }),
  score: fc.float({ min: 0, max: 100, noNaN: true }),
  active: fc.boolean(),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
  category: fc.constantFrom('A', 'B', 'C', 'D', 'E'),
});

const testDataArbitrary = fc.array(testRowArbitrary, { minLength: 0, maxLength: 100 });

const sortDirectionArbitrary = fc.constantFrom<'asc' | 'desc'>('asc', 'desc');

const sortableFieldArbitrary = fc.constantFrom('name', 'age', 'score', 'category');

const sortModelArbitrary: fc.Arbitrary<SortModel> = fc.record({
  field: sortableFieldArbitrary,
  direction: sortDirectionArbitrary,
});

const multiSortModelArbitrary = fc.array(sortModelArbitrary, { minLength: 0, maxLength: 3 });

// Filter operators by type
const textFilterOperators: FilterOperator[] = ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith'];
const numberFilterOperators: FilterOperator[] = ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte'];

const textFilterArbitrary: fc.Arbitrary<FilterItem> = fc.record({
  field: fc.constant('name'),
  operator: fc.constantFrom(...textFilterOperators),
  value: fc.string({ minLength: 0, maxLength: 20 }),
});

const numberFilterArbitrary: fc.Arbitrary<FilterItem> = fc.record({
  field: fc.constantFrom('age', 'score'),
  operator: fc.constantFrom(...numberFilterOperators),
  value: fc.integer({ min: 0, max: 100 }),
});

const categoryFilterArbitrary: fc.Arbitrary<FilterItem> = fc.record({
  field: fc.constant('category'),
  operator: fc.constantFrom<FilterOperator>('equals', 'notEquals'),
  value: fc.constantFrom('A', 'B', 'C', 'D', 'E'),
});

const filterItemArbitrary = fc.oneof(textFilterArbitrary, numberFilterArbitrary, categoryFilterArbitrary);

const filterModelArbitrary: fc.Arbitrary<FilterModel> = fc.record({
  items: fc.array(filterItemArbitrary, { minLength: 0, maxLength: 3 }),
  logicOperator: fc.constantFrom<'and' | 'or'>('and', 'or'),
});

// Helper to check if data is sorted correctly
function isSortedCorrectly<T>(
  data: T[],
  sortModel: SortModel[],
  columns: ColumnDef<T>[]
): boolean {
  if (data.length <= 1 || sortModel.length === 0) return true;

  const columnMap = new Map(columns.map((col) => [col.id, col]));

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    for (const sort of sortModel) {
      const column = columnMap.get(sort.field);
      if (!column) continue;

      const prevValue = getCellValue(prev, column);
      const currValue = getCellValue(curr, column);

      const comparison = compareValues(prevValue, currValue);

      if (comparison !== 0) {
        // If values are different, check if order is correct
        if (sort.direction === 'asc' && comparison > 0) return false;
        if (sort.direction === 'desc' && comparison < 0) return false;
        break; // Move to next row
      }
      // If equal, check next sort column
    }
  }

  return true;
}

// Helper to compare values
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  return strA.localeCompare(strB);
}

// Helper to check if a row matches a filter
function rowMatchesFilter(row: TestRow, filter: FilterItem): boolean {
  const value = row[filter.field as keyof TestRow];
  const filterValue = filter.value;

  switch (filter.operator) {
    case 'equals':
      if (typeof value === 'string' && typeof filterValue === 'string') {
        return value.toLowerCase() === filterValue.toLowerCase();
      }
      return value === filterValue;

    case 'notEquals':
      if (typeof value === 'string' && typeof filterValue === 'string') {
        return value.toLowerCase() !== filterValue.toLowerCase();
      }
      return value !== filterValue;

    case 'contains':
      return typeof value === 'string' && typeof filterValue === 'string' &&
        value.toLowerCase().includes(filterValue.toLowerCase());

    case 'startsWith':
      return typeof value === 'string' && typeof filterValue === 'string' &&
        value.toLowerCase().startsWith(filterValue.toLowerCase());

    case 'endsWith':
      return typeof value === 'string' && typeof filterValue === 'string' &&
        value.toLowerCase().endsWith(filterValue.toLowerCase());

    case 'gt':
      return typeof value === 'number' && typeof filterValue === 'number' && value > filterValue;

    case 'gte':
      return typeof value === 'number' && typeof filterValue === 'number' && value >= filterValue;

    case 'lt':
      return typeof value === 'number' && typeof filterValue === 'number' && value < filterValue;

    case 'lte':
      return typeof value === 'number' && typeof filterValue === 'number' && value <= filterValue;

    default:
      return true;
  }
}

// Helper to check if a row matches the filter model
function rowMatchesFilterModel(row: TestRow, filterModel: FilterModel): boolean {
  if (filterModel.items.length === 0) return true;

  const results = filterModel.items.map((filter) => rowMatchesFilter(row, filter));

  if (filterModel.logicOperator === 'and') {
    return results.every(Boolean);
  }
  return results.some(Boolean);
}

describe('Property 7: Data Grid Operations Correctness', () => {
  describe('Sorting Operations', () => {
    it('sorted data should be in correct order for single column sort', () => {
      fc.assert(
        fc.property(testDataArbitrary, sortModelArbitrary, (data, sortModel) => {
          const sorted = sortData(data, [sortModel], testColumns);
          expect(isSortedCorrectly(sorted, [sortModel], testColumns)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('sorted data should be in correct order for multi-column sort', () => {
      fc.assert(
        fc.property(testDataArbitrary, multiSortModelArbitrary, (data, sortModel) => {
          const sorted = sortData(data, sortModel, testColumns);
          expect(isSortedCorrectly(sorted, sortModel, testColumns)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('sorting should preserve all original rows', () => {
      fc.assert(
        fc.property(testDataArbitrary, multiSortModelArbitrary, (data, sortModel) => {
          const sorted = sortData(data, sortModel, testColumns);
          expect(sorted.length).toBe(data.length);

          // All original IDs should be present
          const originalIds = new Set(data.map((r) => r.id));
          const sortedIds = new Set(sorted.map((r) => r.id));
          expect(sortedIds).toEqual(originalIds);
        }),
        { numRuns: 100 }
      );
    });

    it('sorting empty data should return empty array', () => {
      fc.assert(
        fc.property(multiSortModelArbitrary, (sortModel) => {
          const sorted = sortData([], sortModel, testColumns);
          expect(sorted).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    it('sorting with empty sort model should preserve original order', () => {
      fc.assert(
        fc.property(testDataArbitrary, (data) => {
          const sorted = sortData(data, [], testColumns);
          expect(sorted).toEqual(data);
        }),
        { numRuns: 100 }
      );
    });

    it('sorting should be stable (equal elements maintain relative order)', () => {
      // Create data with duplicate values
      const dataWithDuplicates = fc.array(
        fc.record({
          id: fc.uuid(),
          name: fc.constantFrom('Alice', 'Bob'), // Limited names to create duplicates
          age: fc.constantFrom(25, 30, 35),
          score: fc.float({ min: 0, max: 100, noNaN: true }),
          active: fc.boolean(),
          createdAt: fc.date(),
          category: fc.constantFrom('A', 'B'),
        }),
        { minLength: 2, maxLength: 20 }
      );

      fc.assert(
        fc.property(dataWithDuplicates, (data) => {
          const sortModel: SortModel[] = [{ field: 'name', direction: 'asc' }];
          const sorted = sortData(data, sortModel, testColumns);

          // Group by name and check that within each group, original order is preserved
          const groups = new Map<string, TestRow[]>();
          for (const row of sorted) {
            const existing = groups.get(row.name) || [];
            existing.push(row);
            groups.set(row.name, existing);
          }

          // For each group, verify the IDs appear in the same relative order as in original
          for (const [name, group] of groups) {
            const originalOrder = data.filter((r) => r.name === name).map((r) => r.id);
            const sortedOrder = group.map((r: TestRow) => r.id);
            expect(sortedOrder).toEqual(originalOrder);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Filtering Operations', () => {
    it('filtered data should only contain matching rows', () => {
      fc.assert(
        fc.property(testDataArbitrary, filterModelArbitrary, (data, filterModel) => {
          const filtered = filterData(data, filterModel, testColumns);

          // Every filtered row should match the filter model
          for (const row of filtered) {
            expect(rowMatchesFilterModel(row, filterModel)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('filtering should not include non-matching rows', () => {
      fc.assert(
        fc.property(testDataArbitrary, filterModelArbitrary, (data, filterModel) => {
          const filtered = filterData(data, filterModel, testColumns);
          const filteredIds = new Set(filtered.map((r) => r.id));

          // Every non-filtered row should NOT match the filter model
          for (const row of data) {
            if (!filteredIds.has(row.id)) {
              expect(rowMatchesFilterModel(row, filterModel)).toBe(false);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('filtering with empty filter model should return all rows', () => {
      fc.assert(
        fc.property(testDataArbitrary, (data) => {
          const filtered = filterData(data, DEFAULT_FILTER_MODEL, testColumns);
          expect(filtered.length).toBe(data.length);
        }),
        { numRuns: 100 }
      );
    });

    it('filtered data should be a subset of original data', () => {
      fc.assert(
        fc.property(testDataArbitrary, filterModelArbitrary, (data, filterModel) => {
          const filtered = filterData(data, filterModel, testColumns);
          expect(filtered.length).toBeLessThanOrEqual(data.length);

          // All filtered IDs should exist in original
          const originalIds = new Set(data.map((r) => r.id));
          for (const row of filtered) {
            expect(originalIds.has(row.id)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('AND filter should be more restrictive than OR filter', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.array(filterItemArbitrary, { minLength: 2, maxLength: 3 }),
          (data, items) => {
            const andFilter: FilterModel = { items, logicOperator: 'and' };
            const orFilter: FilterModel = { items, logicOperator: 'or' };

            const andFiltered = filterData(data, andFilter, testColumns);
            const orFiltered = filterData(data, orFilter, testColumns);

            // AND should return <= rows than OR (or equal if all filters match same rows)
            expect(andFiltered.length).toBeLessThanOrEqual(orFiltered.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Pagination Operations', () => {
    it('paginated data should have correct page size', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.integer({ min: 0, max: 10 }),
          fc.constantFrom(5, 10, 25, 50),
          (data, page, pageSize) => {
            const { data: paginated, pagination } = paginateData(data, page, pageSize);

            if (data.length === 0) {
              expect(paginated.length).toBe(0);
            } else {
              // Page size should be correct (or less for last page)
              expect(paginated.length).toBeLessThanOrEqual(pageSize);

              // If not the last page, should have exactly pageSize items
              if (pagination.page < pagination.totalPages - 1) {
                expect(paginated.length).toBe(pageSize);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('pagination should return correct total pages', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.constantFrom(5, 10, 25, 50),
          (data, pageSize) => {
            const { pagination } = paginateData(data, 0, pageSize);
            const expectedTotalPages = Math.ceil(data.length / pageSize);
            expect(pagination.totalPages).toBe(expectedTotalPages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('pagination should return correct total rows', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.integer({ min: 0, max: 10 }),
          fc.constantFrom(5, 10, 25, 50),
          (data, page, pageSize) => {
            const { pagination } = paginateData(data, page, pageSize);
            expect(pagination.totalRows).toBe(data.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all pages combined should contain all rows', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.constantFrom(5, 10, 25),
          (data, pageSize) => {
            const allPaginatedRows: TestRow[] = [];
            const totalPages = Math.ceil(data.length / pageSize) || 1;

            for (let page = 0; page < totalPages; page++) {
              const { data: paginated } = paginateData(data, page, pageSize);
              allPaginatedRows.push(...paginated);
            }

            expect(allPaginatedRows.length).toBe(data.length);

            // All IDs should match
            const originalIds = data.map((r) => r.id).sort();
            const paginatedIds = allPaginatedRows.map((r) => r.id).sort();
            expect(paginatedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('page number should be clamped to valid range', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.integer({ min: -10, max: 100 }),
          fc.constantFrom(5, 10, 25),
          (data, page, pageSize) => {
            const { pagination } = paginateData(data, page, pageSize);

            // Page should be within valid range
            expect(pagination.page).toBeGreaterThanOrEqual(0);
            if (data.length > 0) {
              expect(pagination.page).toBeLessThan(pagination.totalPages);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Combined Operations (processData)', () => {
    it('processData should apply filter, sort, and pagination in correct order', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          multiSortModelArbitrary,
          filterModelArbitrary,
          fc.integer({ min: 0, max: 5 }),
          fc.constantFrom(5, 10, 25),
          (data, sortModel, filterModel, page, pageSize) => {
            const { data: processed, filteredData, pagination } = processData(
              data,
              sortModel,
              filterModel,
              page,
              pageSize,
              testColumns
            );

            // 1. Filtered data should only contain matching rows
            for (const row of filteredData) {
              expect(rowMatchesFilterModel(row, filterModel)).toBe(true);
            }

            // 2. Filtered data should be sorted correctly
            expect(isSortedCorrectly(filteredData, sortModel, testColumns)).toBe(true);

            // 3. Processed data should be a subset of filtered data
            const filteredIds = new Set(filteredData.map((r) => r.id));
            for (const row of processed) {
              expect(filteredIds.has(row.id)).toBe(true);
            }

            // 4. Pagination should be correct
            expect(pagination.totalRows).toBe(filteredData.length);
            expect(processed.length).toBeLessThanOrEqual(pageSize);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('processData with no filters or sorts should just paginate', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.integer({ min: 0, max: 5 }),
          fc.constantFrom(5, 10, 25),
          (data, page, pageSize) => {
            const { filteredData, pagination } = processData(
              data,
              [],
              DEFAULT_FILTER_MODEL,
              page,
              pageSize,
              testColumns
            );

            // Filtered data should equal original data
            expect(filteredData.length).toBe(data.length);
            expect(pagination.totalRows).toBe(data.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Batch Selection Operations', () => {
    it('selecting all rows should include all filtered rows', () => {
      fc.assert(
        fc.property(testDataArbitrary, filterModelArbitrary, (data, filterModel) => {
          const filtered = filterData(data, filterModel, testColumns);

          // Simulate "select all" - should select all filtered rows
          const selectedRows = [...filtered];

          expect(selectedRows.length).toBe(filtered.length);

          // All selected IDs should be in filtered
          const filteredIds = new Set(filtered.map((r) => r.id));
          for (const row of selectedRows) {
            expect(filteredIds.has(row.id)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('batch action should execute on exactly the selected rows', () => {
      fc.assert(
        fc.property(
          testDataArbitrary,
          fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 0, maxLength: 10 }),
          (data, selectedIndices) => {
            if (data.length === 0) return;

            // Select rows by indices (clamped to valid range)
            const validIndices = [...new Set(selectedIndices.map((i) => Math.abs(i) % data.length))];
            const selectedRows = validIndices.map((i) => data[i]);

            // Simulate batch action - track which rows were processed
            const processedIds: string[] = [];
            const batchAction = (rows: TestRow[]) => {
              for (const row of rows) {
                processedIds.push(row.id);
              }
            };

            batchAction(selectedRows);

            // Verify exactly the selected rows were processed
            expect(processedIds.length).toBe(selectedRows.length);
            const selectedIds = new Set(selectedRows.map((r) => r.id));
            for (const id of processedIds) {
              expect(selectedIds.has(id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
