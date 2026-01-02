// Command Palette exports
export { CommandPalette } from './CommandPalette';
export type { CommandPaletteProps } from './CommandPalette';

export { CommandPaletteProvider, useCommandPalette } from './CommandPaletteProvider';
export type { CommandPaletteProviderProps } from './CommandPaletteProvider';

export { useCommandHistory, executeSearchResult } from './useCommandHistory';
export type { CommandHistoryState, CommandHistoryActions } from './useCommandHistory';

export { fuzzyMatch, fuzzySearch, createMatchSegments, highlightMatches } from './fuzzy-match';

export type {
  SearchResult,
  SearchResultType,
  SearchProvider,
  FuzzyMatchResult,
  MatchSegment,
  CommandPaletteState,
  CommandPaletteContextValue,
  SearchHistoryEntry,
} from './types';

export {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  RECENT_SEARCHES_KEY,
  FREQUENT_ACTIONS_KEY,
  MAX_RECENT_SEARCHES,
  MAX_FREQUENT_ACTIONS,
} from './types';

// Search providers
export {
  createSearchProvider,
  filterByQuery,
  generateMockId,
  createStrategyProvider,
  createOrderProvider,
  createAssetProvider,
  createReportProvider,
  createSettingsProvider,
  createHelpProvider,
  createDefaultProviders,
  SearchProviderRegistry,
} from './providers';
