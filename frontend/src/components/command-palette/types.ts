/**
 * Command Palette types for the AI-Assisted Crypto Trading System
 * Supports global search, action execution, and RBAC-filtered results
 */

import type { ResourceType, ActionType } from '@/types/auth';

// Search result categories
export type SearchResultType =
  | 'strategy'
  | 'order'
  | 'asset'
  | 'report'
  | 'setting'
  | 'help'
  | 'action';

// Search result item
export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description?: string;
  path?: string;
  action?: () => void | Promise<void>;
  icon?: string;
  permission?: {
    resource: ResourceType;
    action: ActionType;
  };
  keywords?: string[];
  category?: string;
}

// Search provider interface
export interface SearchProvider {
  type: SearchResultType;
  search: (query: string) => Promise<SearchResult[]>;
  getAll?: () => Promise<SearchResult[]>;
}

// Fuzzy match result with highlighted segments
export interface FuzzyMatchResult {
  item: SearchResult;
  score: number;
  matches: MatchSegment[];
}

// Match segment for highlighting
export interface MatchSegment {
  text: string;
  isMatch: boolean;
}

// Command palette state
export interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  results: FuzzyMatchResult[];
  selectedIndex: number;
  isLoading: boolean;
  recentSearches: SearchResult[];
  frequentActions: SearchResult[];
}

// Command palette context value
export interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  search: (query: string) => Promise<SearchResult[]>;
  executeAction: (result: SearchResult) => Promise<void>;
  getRecentSearches: () => SearchResult[];
  getFrequentActions: () => SearchResult[];
  registerProvider: (provider: SearchProvider) => void;
  unregisterProvider: (type: SearchResultType) => void;
}

// History entry for tracking
export interface SearchHistoryEntry {
  result: SearchResult;
  timestamp: number;
  executionCount: number;
}

// Storage keys
export const RECENT_SEARCHES_KEY = 'command-palette-recent';
export const FREQUENT_ACTIONS_KEY = 'command-palette-frequent';
export const MAX_RECENT_SEARCHES = 10;
export const MAX_FREQUENT_ACTIONS = 5;

// Category display names
export const CATEGORY_LABELS: Record<SearchResultType, string> = {
  strategy: 'Strategies',
  order: 'Orders',
  asset: 'Assets',
  report: 'Reports',
  setting: 'Settings',
  help: 'Help',
  action: 'Actions',
};

// Category icons (using emoji for simplicity, can be replaced with icon components)
export const CATEGORY_ICONS: Record<SearchResultType, string> = {
  strategy: '📊',
  order: '📝',
  asset: '💰',
  report: '📈',
  setting: '⚙️',
  help: '❓',
  action: '⚡',
};
