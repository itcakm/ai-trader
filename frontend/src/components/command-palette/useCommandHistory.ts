'use client';

import { useState, useCallback, useEffect } from 'react';
import type { SearchResult, SearchHistoryEntry } from './types';
import {
  RECENT_SEARCHES_KEY,
  FREQUENT_ACTIONS_KEY,
  MAX_RECENT_SEARCHES,
  MAX_FREQUENT_ACTIONS,
} from './types';

// Storage helpers
function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

export interface CommandHistoryState {
  recentSearches: SearchResult[];
  frequentActions: SearchHistoryEntry[];
}

export interface CommandHistoryActions {
  addToRecent: (result: SearchResult) => void;
  updateFrequent: (result: SearchResult) => void;
  clearRecent: () => void;
  clearFrequent: () => void;
  clearAll: () => void;
  getRecentSearches: () => SearchResult[];
  getFrequentActions: () => SearchResult[];
}

/**
 * Hook for managing command palette history
 * Tracks recent searches and frequently used actions
 */
export function useCommandHistory(): CommandHistoryState & CommandHistoryActions {
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [frequentActions, setFrequentActions] = useState<SearchHistoryEntry[]>([]);

  // Load from storage on mount
  useEffect(() => {
    setRecentSearches(loadFromStorage<SearchResult[]>(RECENT_SEARCHES_KEY, []));
    setFrequentActions(loadFromStorage<SearchHistoryEntry[]>(FREQUENT_ACTIONS_KEY, []));
  }, []);

  // Add to recent searches
  const addToRecent = useCallback((result: SearchResult) => {
    setRecentSearches((prev) => {
      // Remove if already exists
      const filtered = prev.filter((r) => r.id !== result.id);
      // Add to front
      const updated = [result, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      saveToStorage(RECENT_SEARCHES_KEY, updated);
      return updated;
    });
  }, []);

  // Update frequent actions
  const updateFrequent = useCallback((result: SearchResult) => {
    setFrequentActions((prev) => {
      const existing = prev.find((e) => e.result.id === result.id);
      let updated: SearchHistoryEntry[];

      if (existing) {
        // Increment count
        updated = prev.map((e) =>
          e.result.id === result.id
            ? { ...e, executionCount: e.executionCount + 1, timestamp: Date.now() }
            : e
        );
      } else {
        // Add new entry
        updated = [
          ...prev,
          { result, timestamp: Date.now(), executionCount: 1 },
        ];
      }

      // Sort by execution count and keep top N
      updated = updated
        .sort((a, b) => b.executionCount - a.executionCount)
        .slice(0, MAX_FREQUENT_ACTIONS);

      saveToStorage(FREQUENT_ACTIONS_KEY, updated);
      return updated;
    });
  }, []);

  // Clear recent searches
  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    saveToStorage(RECENT_SEARCHES_KEY, []);
  }, []);

  // Clear frequent actions
  const clearFrequent = useCallback(() => {
    setFrequentActions([]);
    saveToStorage(FREQUENT_ACTIONS_KEY, []);
  }, []);

  // Clear all history
  const clearAll = useCallback(() => {
    clearRecent();
    clearFrequent();
  }, [clearRecent, clearFrequent]);

  // Get recent searches
  const getRecentSearches = useCallback(() => {
    return recentSearches;
  }, [recentSearches]);

  // Get frequent actions as SearchResult[]
  const getFrequentActions = useCallback(() => {
    return frequentActions.map((e) => e.result);
  }, [frequentActions]);

  return {
    recentSearches,
    frequentActions,
    addToRecent,
    updateFrequent,
    clearRecent,
    clearFrequent,
    clearAll,
    getRecentSearches,
    getFrequentActions,
  };
}

/**
 * Execute a search result action
 * Handles both direct actions and path navigation
 */
export async function executeSearchResult(
  result: SearchResult,
  options?: {
    onNavigate?: (path: string) => void;
    onAction?: (result: SearchResult) => void;
  }
): Promise<void> {
  // Execute action if provided
  if (result.action) {
    await result.action();
    options?.onAction?.(result);
    return;
  }

  // Navigate to path if provided
  if (result.path) {
    if (options?.onNavigate) {
      options.onNavigate(result.path);
    } else {
      // Default navigation
      window.location.href = result.path;
    }
    return;
  }
}

export default useCommandHistory;
