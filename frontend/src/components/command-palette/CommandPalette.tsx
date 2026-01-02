'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useRBAC } from '@/providers/RBACProvider';
import { fuzzySearch } from './fuzzy-match';
import type {
  SearchResult,
  FuzzyMatchResult,
  MatchSegment,
  SearchResultType,
} from './types';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
} from './types';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  results: FuzzyMatchResult[];
  recentSearches: SearchResult[];
  frequentActions: SearchResult[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (result: SearchResult) => void;
  isLoading?: boolean;
}

/**
 * Render highlighted match segments
 */
function HighlightedText({ segments }: { segments: MatchSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.isMatch ? (
          <mark
            key={index}
            className="bg-primary-200 dark:bg-primary-700 text-foreground rounded px-0.5"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
}

/**
 * Group results by category
 */
function groupResultsByCategory(
  results: FuzzyMatchResult[]
): Map<SearchResultType, FuzzyMatchResult[]> {
  const groups = new Map<SearchResultType, FuzzyMatchResult[]>();

  for (const result of results) {
    const type = result.item.type;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(result);
  }

  return groups;
}

/**
 * CommandPalette - Modal component for global search and actions
 */
export function CommandPalette({
  isOpen,
  onClose,
  results,
  recentSearches,
  frequentActions,
  query,
  onQueryChange,
  onSelect,
  isLoading = false,
}: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { hasPermission } = useRBAC();

  // Filter results by permission
  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      if (!result.item.permission) return true;
      return hasPermission(
        result.item.permission.resource,
        result.item.permission.action
      );
    });
  }, [results, hasPermission]);

  // Filter recent searches by permission
  const filteredRecentSearches = useMemo(() => {
    return recentSearches.filter((item) => {
      if (!item.permission) return true;
      return hasPermission(item.permission.resource, item.permission.action);
    });
  }, [recentSearches, hasPermission]);

  // Filter frequent actions by permission
  const filteredFrequentActions = useMemo(() => {
    return frequentActions.filter((item) => {
      if (!item.permission) return true;
      return hasPermission(item.permission.resource, item.permission.action);
    });
  }, [frequentActions, hasPermission]);

  // Determine what to show
  const showResults = query.trim().length > 0;
  const showRecent = !showResults && filteredRecentSearches.length > 0;
  const showFrequent = !showResults && filteredFrequentActions.length > 0;

  // Flatten items for keyboard navigation
  const flatItems = useMemo(() => {
    if (showResults) {
      return filteredResults.map((r) => r.item);
    }
    return [...filteredFrequentActions, ...filteredRecentSearches];
  }, [showResults, filteredResults, filteredFrequentActions, filteredRecentSearches]);

  // Group results by category for display
  const groupedResults = useMemo(
    () => groupResultsByCategory(filteredResults),
    [filteredResults]
  );

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, filteredResults.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < flatItems.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : flatItems.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            onSelect(flatItems[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, onSelect, onClose]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-2xl bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
      >
        {/* Search Input */}
        <div className="flex items-center px-4 border-b border-border">
          <svg
            className="w-5 h-5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 px-3 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder="Search strategies, orders, assets, reports..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
          />
          {isLoading && (
            <svg
              className="w-5 h-5 text-muted-foreground animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs text-muted-foreground bg-muted rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="command-palette-results"
          className="max-h-[60vh] overflow-y-auto"
          role="listbox"
        >
          {/* Show search results */}
          {showResults && filteredResults.length > 0 && (
            <div className="py-2">
              {Array.from(groupedResults.entries()).map(([type, items]) => (
                <div key={type}>
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {CATEGORY_ICONS[type]} {CATEGORY_LABELS[type]}
                  </div>
                  {items.map((result) => {
                    const globalIndex = flatItems.indexOf(result.item);
                    return (
                      <ResultItem
                        key={result.item.id}
                        result={result}
                        isSelected={globalIndex === selectedIndex}
                        index={globalIndex}
                        onClick={() => onSelect(result.item)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Show no results message */}
          {showResults && filteredResults.length === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <p>No results found for &quot;{query}&quot;</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          )}

          {/* Show frequent actions */}
          {showFrequent && (
            <div className="py-2">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                ⚡ Frequent Actions
              </div>
              {filteredFrequentActions.map((item, index) => (
                <SimpleResultItem
                  key={item.id}
                  item={item}
                  isSelected={index === selectedIndex}
                  index={index}
                  onClick={() => onSelect(item)}
                />
              ))}
            </div>
          )}

          {/* Show recent searches */}
          {showRecent && (
            <div className="py-2">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                🕐 Recent Searches
              </div>
              {filteredRecentSearches.map((item, index) => {
                const globalIndex = filteredFrequentActions.length + index;
                return (
                  <SimpleResultItem
                    key={item.id}
                    item={item}
                    isSelected={globalIndex === selectedIndex}
                    index={globalIndex}
                    onClick={() => onSelect(item)}
                  />
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!showResults && !showRecent && !showFrequent && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <p>Start typing to search...</p>
              <p className="text-sm mt-1">
                Search strategies, orders, assets, reports, and more
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border bg-muted/50 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded ml-1">↓</kbd>
              <span className="ml-1">to navigate</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded">↵</kbd>
              <span className="ml-1">to select</span>
            </span>
          </div>
          <span>
            <kbd className="px-1.5 py-0.5 bg-background border border-border rounded">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-background border border-border rounded ml-1">K</kbd>
            <span className="ml-1">to toggle</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Result item with fuzzy match highlighting
 */
function ResultItem({
  result,
  isSelected,
  index,
  onClick,
}: {
  result: FuzzyMatchResult;
  isSelected: boolean;
  index: number;
  onClick: () => void;
}) {
  return (
    <div
      data-index={index}
      className={`
        px-4 py-2 cursor-pointer flex items-center gap-3
        ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30' : 'hover:bg-muted'}
      `}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
    >
      <span className="text-lg" aria-hidden="true">
        {CATEGORY_ICONS[result.item.type]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          <HighlightedText segments={result.matches} />
        </div>
        {result.item.description && (
          <div className="text-xs text-muted-foreground truncate">
            {result.item.description}
          </div>
        )}
      </div>
      {result.item.path && (
        <span className="text-xs text-muted-foreground">
          {result.item.path}
        </span>
      )}
    </div>
  );
}

/**
 * Simple result item without highlighting (for recent/frequent)
 */
function SimpleResultItem({
  item,
  isSelected,
  index,
  onClick,
}: {
  item: SearchResult;
  isSelected: boolean;
  index: number;
  onClick: () => void;
}) {
  return (
    <div
      data-index={index}
      className={`
        px-4 py-2 cursor-pointer flex items-center gap-3
        ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30' : 'hover:bg-muted'}
      `}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
    >
      <span className="text-lg" aria-hidden="true">
        {CATEGORY_ICONS[item.type]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {item.title}
        </div>
        {item.description && (
          <div className="text-xs text-muted-foreground truncate">
            {item.description}
          </div>
        )}
      </div>
      {item.path && (
        <span className="text-xs text-muted-foreground">{item.path}</span>
      )}
    </div>
  );
}

export default CommandPalette;
