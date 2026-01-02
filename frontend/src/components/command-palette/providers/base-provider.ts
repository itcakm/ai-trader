/**
 * Base search provider interface and utilities
 */

import type { SearchResult, SearchProvider, SearchResultType } from '../types';

/**
 * Create a search provider with common functionality
 */
export function createSearchProvider(
  type: SearchResultType,
  searchFn: (query: string) => Promise<SearchResult[]>,
  getAllFn?: () => Promise<SearchResult[]>
): SearchProvider {
  return {
    type,
    search: searchFn,
    getAll: getAllFn,
  };
}

/**
 * Filter results by query (simple substring match)
 * Used as fallback when fuzzy matching is handled elsewhere
 */
export function filterByQuery(
  items: SearchResult[],
  query: string
): SearchResult[] {
  const lowerQuery = query.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(lowerQuery) ||
      item.description?.toLowerCase().includes(lowerQuery) ||
      item.keywords?.some((k) => k.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Mock data generator for development/testing
 */
export function generateMockId(): string {
  return Math.random().toString(36).substring(2, 11);
}
