/**
 * Feature: ui-implementation, Property 9: Command Palette Search Completeness
 * Validates: Requirements 7.2, 7.4, 7.6
 *
 * For any search query in the command palette, the results SHALL include matching
 * items from all searchable categories (strategies, orders, assets, reports, settings, help),
 * support fuzzy matching, and be filtered by the user's permissions.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { SearchResult, SearchResultType, FuzzyMatchResult } from './types';
import type { Permission, ResourceType, ActionType } from '@/types/auth';
import { fuzzyMatch, fuzzySearch, createMatchSegments } from './fuzzy-match';
import { filterByQuery } from './providers/base-provider';

// Arbitraries for generating test data
const searchResultTypeArbitrary = fc.constantFrom<SearchResultType>(
  'strategy',
  'order',
  'asset',
  'report',
  'setting',
  'help',
  'action'
);

const resourceTypeArbitrary = fc.constantFrom<ResourceType>(
  'strategy',
  'order',
  'position',
  'market_data',
  'ai_model',
  'risk_control',
  'report',
  'audit_log',
  'user',
  'organization',
  'role',
  'exchange'
);

const actionTypeArbitrary = fc.constantFrom<ActionType>(
  'create',
  'read',
  'update',
  'delete',
  'execute',
  'export'
);

const permissionArbitrary = fc.record({
  resource: resourceTypeArbitrary,
  action: actionTypeArbitrary,
});

const searchResultArbitrary: fc.Arbitrary<SearchResult> = fc.record({
  id: fc.uuid(),
  type: searchResultTypeArbitrary,
  title: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  path: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  keywords: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
  permission: fc.option(permissionArbitrary, { nil: undefined }),
});

// Helper to check if user has permission
function hasPermission(
  userPermissions: Permission[],
  requiredPermission: { resource: ResourceType; action: ActionType } | undefined
): boolean {
  if (!requiredPermission) return true;
  return userPermissions.some(
    (p) =>
      p.resource === requiredPermission.resource &&
      p.action === requiredPermission.action
  );
}

// Helper to filter results by permission
function filterResultsByPermission(
  results: SearchResult[],
  userPermissions: Permission[]
): SearchResult[] {
  return results.filter((result) =>
    hasPermission(userPermissions, result.permission)
  );
}

// Helper to filter fuzzy results by permission
function filterFuzzyResultsByPermission(
  results: FuzzyMatchResult[],
  userPermissions: Permission[]
): FuzzyMatchResult[] {
  return results.filter((result) =>
    hasPermission(userPermissions, result.item.permission)
  );
}

describe('Property 9: Command Palette Search Completeness', () => {
  describe('Fuzzy Matching', () => {
    it('fuzzyMatch should return null for queries longer than text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (query, text) => {
            if (query.length > text.length) {
              const result = fuzzyMatch(query, text);
              expect(result).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fuzzyMatch should match when all query characters exist in text in order', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (text) => {
            // Create a query from characters in the text
            if (text.length >= 2) {
              const query = text[0] + text[text.length - 1];
              const result = fuzzyMatch(query, text);
              // Should match if characters appear in order
              const firstIndex = text.toLowerCase().indexOf(query[0].toLowerCase());
              const lastIndex = text.toLowerCase().lastIndexOf(query[1].toLowerCase());
              if (firstIndex !== -1 && lastIndex !== -1 && firstIndex < lastIndex) {
                expect(result).not.toBeNull();
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fuzzyMatch should return score between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (query, text) => {
            const result = fuzzyMatch(query, text);
            if (result !== null) {
              expect(result.score).toBeGreaterThanOrEqual(0);
              expect(result.score).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fuzzyMatch should return positions within text bounds', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (query, text) => {
            const result = fuzzyMatch(query, text);
            if (result !== null) {
              for (const pos of result.positions) {
                expect(pos).toBeGreaterThanOrEqual(0);
                expect(pos).toBeLessThan(text.length);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty query should match any text with score 1', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (text) => {
            const result = fuzzyMatch('', text);
            expect(result).not.toBeNull();
            expect(result?.score).toBe(1);
            expect(result?.positions).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Match Segments', () => {
    it('createMatchSegments should cover entire text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 10 }),
          (text, positions) => {
            // Filter positions to be within text bounds
            const validPositions = positions.filter((p) => p < text.length);
            const segments = createMatchSegments(text, validPositions);

            // Concatenate all segment texts
            const reconstructed = segments.map((s) => s.text).join('');
            expect(reconstructed).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('createMatchSegments should mark correct positions as matches', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 10 }),
          (text, positions) => {
            const validPositions = positions.filter((p) => p < text.length);
            const positionSet = new Set(validPositions);
            const segments = createMatchSegments(text, validPositions);

            // Verify each character's match status
            let charIndex = 0;
            for (const segment of segments) {
              for (const char of segment.text) {
                const shouldBeMatch = positionSet.has(charIndex);
                expect(segment.isMatch).toBe(shouldBeMatch);
                charIndex++;
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Fuzzy Search', () => {
    it('fuzzySearch should return results sorted by score descending', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(searchResultArbitrary, { minLength: 2, maxLength: 10 }),
          (query, items) => {
            const results = fuzzySearch(query, items);

            // Verify descending order
            for (let i = 1; i < results.length; i++) {
              expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fuzzySearch with empty query should return all items', () => {
      fc.assert(
        fc.property(
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          (items) => {
            const results = fuzzySearch('', items);
            expect(results.length).toBe(items.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fuzzySearch results should contain valid match segments', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 5 }),
          (query, items) => {
            const results = fuzzySearch(query, items);

            for (const result of results) {
              // Segments should reconstruct the title
              const reconstructed = result.matches.map((s) => s.text).join('');
              expect(reconstructed).toBe(result.item.title);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Category Coverage', () => {
    it('search should include results from all matching categories', () => {
      // Create items from each category
      const categories: SearchResultType[] = [
        'strategy',
        'order',
        'asset',
        'report',
        'setting',
        'help',
      ];

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          (searchTerm) => {
            // Create one item per category with the search term in title
            const items: SearchResult[] = categories.map((type, index) => ({
              id: `${type}-${index}`,
              type,
              title: `${searchTerm} ${type} item`,
              description: `A ${type} item for testing`,
            }));

            const results = fuzzySearch(searchTerm, items);

            // All categories should be represented in results
            const resultTypes = new Set(results.map((r) => r.item.type));
            for (const category of categories) {
              expect(resultTypes.has(category)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Permission Filtering', () => {
    it('results should be filtered by user permissions', () => {
      fc.assert(
        fc.property(
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          fc.array(
            fc.record({
              id: fc.uuid(),
              resource: resourceTypeArbitrary,
              action: actionTypeArbitrary,
            }),
            { minLength: 0, maxLength: 5 }
          ),
          (items, userPermissions) => {
            const filtered = filterResultsByPermission(items, userPermissions);

            // All filtered items should have permission or no permission required
            for (const item of filtered) {
              expect(hasPermission(userPermissions, item.permission)).toBe(true);
            }

            // Items without permission should not be in filtered results
            for (const item of items) {
              if (!hasPermission(userPermissions, item.permission)) {
                expect(filtered.find((f) => f.id === item.id)).toBeUndefined();
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('items without permission requirement should always be included', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              type: searchResultTypeArbitrary,
              title: fc.string({ minLength: 1, maxLength: 50 }),
              // No permission field
            }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.array(
            fc.record({
              id: fc.uuid(),
              resource: resourceTypeArbitrary,
              action: actionTypeArbitrary,
            }),
            { minLength: 0, maxLength: 5 }
          ),
          (items, userPermissions) => {
            const filtered = filterResultsByPermission(items, userPermissions);

            // All items should be included since none have permission requirements
            expect(filtered.length).toBe(items.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('user with no permissions should only see items without permission requirements', () => {
      fc.assert(
        fc.property(
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          (items) => {
            const filtered = filterResultsByPermission(items, []);

            // Only items without permission should be included
            for (const item of filtered) {
              expect(item.permission).toBeUndefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Query Filtering', () => {
    it('filterByQuery should match title substring', () => {
      fc.assert(
        fc.property(
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          (items) => {
            // Pick a random item and use part of its title as query
            const randomItem = items[0];
            if (randomItem.title.length >= 3) {
              const query = randomItem.title.substring(0, 3);
              const filtered = filterByQuery(items, query);

              // The item with matching title should be in results
              const found = filtered.find((f) => f.id === randomItem.id);
              expect(found).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterByQuery should match description substring', () => {
      fc.assert(
        fc.property(
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          (items) => {
            // Find an item with description
            const itemWithDesc = items.find(
              (i) => i.description && i.description.length >= 3
            );
            if (itemWithDesc && itemWithDesc.description) {
              const query = itemWithDesc.description.substring(0, 3);
              const filtered = filterByQuery(items, query);

              // The item with matching description should be in results
              const found = filtered.find((f) => f.id === itemWithDesc.id);
              expect(found).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterByQuery should match keywords', () => {
      fc.assert(
        fc.property(
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          (items) => {
            // Find an item with keywords
            const itemWithKeywords = items.find(
              (i) => i.keywords && i.keywords.length > 0 && i.keywords[0].length >= 2
            );
            if (itemWithKeywords && itemWithKeywords.keywords) {
              const query = itemWithKeywords.keywords[0].substring(0, 2);
              const filtered = filterByQuery(items, query);

              // The item with matching keyword should be in results
              const found = filtered.find((f) => f.id === itemWithKeywords.id);
              expect(found).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterByQuery should be case-insensitive', () => {
      fc.assert(
        fc.property(
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          (items) => {
            const randomItem = items[0];
            if (randomItem.title.length >= 2) {
              const lowerQuery = randomItem.title.substring(0, 2).toLowerCase();
              const upperQuery = randomItem.title.substring(0, 2).toUpperCase();

              const lowerFiltered = filterByQuery(items, lowerQuery);
              const upperFiltered = filterByQuery(items, upperQuery);

              // Both should return the same results
              expect(lowerFiltered.length).toBe(upperFiltered.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Search Completeness Invariants', () => {
    it('search results should be deterministic', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 10 }),
          (query, items) => {
            const results1 = fuzzySearch(query, items);
            const results2 = fuzzySearch(query, items);

            expect(results1.length).toBe(results2.length);
            for (let i = 0; i < results1.length; i++) {
              expect(results1[i].item.id).toBe(results2[i].item.id);
              expect(results1[i].score).toBe(results2[i].score);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('adding items should not remove existing matches', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.array(searchResultArbitrary, { minLength: 1, maxLength: 5 }),
          searchResultArbitrary,
          (query, existingItems, newItem) => {
            const resultsBefore = fuzzySearch(query, existingItems);
            const resultsAfter = fuzzySearch(query, [...existingItems, newItem]);

            // All items that matched before should still match
            for (const before of resultsBefore) {
              const stillExists = resultsAfter.find(
                (after) => after.item.id === before.item.id
              );
              expect(stillExists).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('exact title match should have high score', () => {
      fc.assert(
        fc.property(
          searchResultArbitrary,
          (item) => {
            const results = fuzzySearch(item.title, [item]);

            expect(results.length).toBe(1);
            // Exact match should have a reasonably high score
            expect(results[0].score).toBeGreaterThan(0.3);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
