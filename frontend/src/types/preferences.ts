import type { SupportedLocale } from './i18n';
import type { Theme } from './theme';

/**
 * Sort model for data grids
 */
export interface SortModel {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Filter model for data grids
 */
export interface FilterModel {
  items: FilterItem[];
  logicOperator: 'and' | 'or';
}

/**
 * Individual filter item
 */
export interface FilterItem {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value: unknown;
}

/**
 * Grid preferences for individual data grids
 */
export interface GridPreferences {
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: { left: string[]; right: string[] };
  sortModel: SortModel[];
  filterModel: FilterModel;
  pageSize: number;
}

/**
 * Widget position in a workspace layout
 */
export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Widget configuration in a workspace
 */
export interface WorkspaceWidget {
  id: string;
  type: string;
  position: WidgetPosition;
  config?: Record<string, unknown>;
}

/**
 * Workspace layout configuration
 */
export interface WorkspaceLayout {
  id: string;
  name: string;
  widgets: WorkspaceWidget[];
  createdAt: string;
  updatedAt: string;
}

/**
 * User preferences structure
 */
export interface UserPreferences {
  theme: Theme;
  locale: SupportedLocale;
  defaultDashboard: string;
  gridPreferences: Record<string, GridPreferences>;
  workspaceLayouts: WorkspaceLayout[];
  activeWorkspaceId: string;
}

/**
 * Default grid preferences
 */
export const DEFAULT_GRID_PREFERENCES: GridPreferences = {
  columnOrder: [],
  columnWidths: {},
  pinnedColumns: { left: [], right: [] },
  sortModel: [],
  filterModel: { items: [], logicOperator: 'and' },
  pageSize: 25,
};

/**
 * Default user preferences
 */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  locale: 'en-US',
  defaultDashboard: 'trader',
  gridPreferences: {},
  workspaceLayouts: [],
  activeWorkspaceId: '',
};

/**
 * Module types for navigation
 */
export type ModuleType =
  | 'dashboard'
  | 'strategy'
  | 'market-data'
  | 'ai-intelligence'
  | 'risk-controls'
  | 'exchange'
  | 'reporting'
  | 'admin'
  | 'settings';
