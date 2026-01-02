'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { CommandPalette } from './CommandPalette';
import { fuzzySearch } from './fuzzy-match';
import type {
  SearchResult,
  FuzzyMatchResult,
  SearchProvider,
  SearchResultType,
  CommandPaletteContextValue,
  SearchHistoryEntry,
} from './types';
import {
  RECENT_SEARCHES_KEY,
  FREQUENT_ACTIONS_KEY,
  MAX_RECENT_SEARCHES,
  MAX_FREQUENT_ACTIONS,
} from './types';

// Context
const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(
  undefined
);

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

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

export interface CommandPaletteProviderProps {
  children: React.ReactNode;
  debounceMs?: number;
}

/**
 * CommandPaletteProvider - Manages command palette state and search
 */
export function CommandPaletteProvider({
  children,
  debounceMs = 150,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FuzzyMatchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [frequentActions, setFrequentActions] = useState<SearchHistoryEntry[]>([]);

  const providersRef = useRef<Map<SearchResultType, SearchProvider>>(new Map());
  const debouncedQuery = useDebounce(query, debounceMs);

  // Load history from storage on mount
  useEffect(() => {
    setRecentSearches(loadFromStorage<SearchResult[]>(RECENT_SEARCHES_KEY, []));
    setFrequentActions(
      loadFromStorage<SearchHistoryEntry[]>(FREQUENT_ACTIONS_KEY, [])
    );
  }, []);

  // Register keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Perform search when debounced query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedQuery.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);

      try {
        // Collect results from all providers
        const allResults: SearchResult[] = [];
        const providers = Array.from(providersRef.current.values());

        const searchPromises = providers.map(async (provider) => {
          try {
            const providerResults = await provider.search(debouncedQuery);
            return providerResults;
          } catch {
            return [];
          }
        });

        const providerResults = await Promise.all(searchPromises);
        for (const results of providerResults) {
          allResults.push(...results);
        }

        // Apply fuzzy search and ranking
        const fuzzyResults = fuzzySearch(debouncedQuery, allResults);
        setResults(fuzzyResults);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery]);

  // Open palette
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setResults([]);
  }, []);

  // Close palette
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  // Toggle palette
  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        setQuery('');
        setResults([]);
      }
      return !prev;
    });
  }, []);

  // Search function (for external use)
  const search = useCallback(
    async (searchQuery: string): Promise<SearchResult[]> => {
      const allResults: SearchResult[] = [];
      const providers = Array.from(providersRef.current.values());

      const searchPromises = providers.map(async (provider) => {
        try {
          return await provider.search(searchQuery);
        } catch {
          return [];
        }
      });

      const providerResults = await Promise.all(searchPromises);
      for (const results of providerResults) {
        allResults.push(...results);
      }

      return fuzzySearch(searchQuery, allResults).map((r) => r.item);
    },
    []
  );

  // Add to recent searches
  const addToRecentSearches = useCallback((result: SearchResult) => {
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
  const updateFrequentActions = useCallback((result: SearchResult) => {
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

  // Execute action
  const executeAction = useCallback(
    async (result: SearchResult) => {
      // Track in history
      addToRecentSearches(result);
      updateFrequentActions(result);

      // Execute action if provided
      if (result.action) {
        await result.action();
      } else if (result.path) {
        // Navigate to path
        window.location.href = result.path;
      }

      // Close palette
      close();
    },
    [addToRecentSearches, updateFrequentActions, close]
  );

  // Get recent searches
  const getRecentSearches = useCallback(() => {
    return recentSearches;
  }, [recentSearches]);

  // Get frequent actions
  const getFrequentActions = useCallback(() => {
    return frequentActions.map((e) => e.result);
  }, [frequentActions]);

  // Register provider
  const registerProvider = useCallback((provider: SearchProvider) => {
    providersRef.current.set(provider.type, provider);
  }, []);

  // Unregister provider
  const unregisterProvider = useCallback((type: SearchResultType) => {
    providersRef.current.delete(type);
  }, []);

  // Handle query change
  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);

  // Handle selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      executeAction(result);
    },
    [executeAction]
  );

  // Context value
  const contextValue: CommandPaletteContextValue = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      search,
      executeAction,
      getRecentSearches,
      getFrequentActions,
      registerProvider,
      unregisterProvider,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      search,
      executeAction,
      getRecentSearches,
      getFrequentActions,
      registerProvider,
      unregisterProvider,
    ]
  );

  // Frequent actions as SearchResult[]
  const frequentActionsResults = useMemo(
    () => frequentActions.map((e) => e.result),
    [frequentActions]
  );

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandPalette
        isOpen={isOpen}
        onClose={close}
        results={results}
        recentSearches={recentSearches}
        frequentActions={frequentActionsResults}
        query={query}
        onQueryChange={handleQueryChange}
        onSelect={handleSelect}
        isLoading={isLoading}
      />
    </CommandPaletteContext.Provider>
  );
}

/**
 * Hook to access command palette context
 */
export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (context === undefined) {
    throw new Error(
      'useCommandPalette must be used within a CommandPaletteProvider'
    );
  }
  return context;
}

export default CommandPaletteProvider;
