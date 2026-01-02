/**
 * Dashboard types for the AI-Assisted Crypto Trading System
 * Supports role-specific dashboards with real-time data and customization
 */

import type { ResourceType, ActionType } from './rbac';

/**
 * Dashboard types based on user roles
 */
export type DashboardType = 'trader' | 'risk' | 'admin' | 'executive';

/**
 * Widget types available in dashboards
 */
export type WidgetType =
  | 'metric_card'
  | 'line_chart'
  | 'bar_chart'
  | 'pie_chart'
  | 'data_table'
  | 'alert_list'
  | 'activity_feed'
  | 'heatmap';

/**
 * Widget position in the grid layout
 */
export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Base widget configuration
 */
export interface BaseWidgetConfig {
  title?: string;
  refreshInterval?: number;
  showHeader?: boolean;
}

/**
 * Metric card configuration
 */
export interface MetricCardConfig extends BaseWidgetConfig {
  metric: string;
  format?: 'number' | 'currency' | 'percentage';
  currency?: string;
  showTrend?: boolean;
  trendPeriod?: 'hour' | 'day' | 'week' | 'month';
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/**
 * Chart configuration (line, bar, pie)
 */
export interface ChartConfig extends BaseWidgetConfig {
  dataSource: string;
  xAxis?: string;
  yAxis?: string | string[];
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
}

/**
 * Data table configuration
 */
export interface DataTableConfig extends BaseWidgetConfig {
  dataSource: string;
  columns: string[];
  sortable?: boolean;
  filterable?: boolean;
  pageSize?: number;
}

/**
 * Alert list configuration
 */
export interface AlertListConfig extends BaseWidgetConfig {
  severityFilter?: ('info' | 'warning' | 'critical')[];
  maxItems?: number;
  showAcknowledged?: boolean;
}

/**
 * Activity feed configuration
 */
export interface ActivityFeedConfig extends BaseWidgetConfig {
  activityTypes?: string[];
  maxItems?: number;
  showTimestamps?: boolean;
}

/**
 * Union type for all widget configurations
 */
export type WidgetConfig =
  | MetricCardConfig
  | ChartConfig
  | DataTableConfig
  | AlertListConfig
  | ActivityFeedConfig
  | BaseWidgetConfig;

/**
 * Dashboard widget definition
 */
export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: WidgetConfig;
  position: WidgetPosition;
  drillDownPath?: string;
  permission?: {
    resource: ResourceType;
    action: ActionType;
  };
}

/**
 * Grid layout configuration
 */
export interface GridLayout {
  columns: number;
  rowHeight: number;
  gap: number;
  breakpoints?: {
    lg: number;
    md: number;
    sm: number;
    xs: number;
  };
}

/**
 * Dashboard definition
 */
export interface Dashboard {
  id: string;
  type: DashboardType;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  layout: GridLayout;
  refreshInterval: number;
  isShared: boolean;
  sharedWith?: string[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dashboard subscription for real-time updates
 */
export interface DashboardSubscription {
  id: string;
  dashboardId: string;
  widgetId?: string;
  dataSource: string;
  callback: (data: unknown) => void;
  interval?: number;
}

/**
 * Dashboard data point for charts
 */
export interface DataPoint {
  timestamp: string;
  value: number;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Metric data for metric cards
 */
export interface MetricData {
  value: number;
  previousValue?: number;
  change?: number;
  changePercent?: number;
  trend?: 'up' | 'down' | 'stable';
  timestamp: string;
}

/**
 * Alert data for alert lists
 */
export interface AlertData {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

/**
 * Activity data for activity feeds
 */
export interface ActivityData {
  id: string;
  type: string;
  actor: string;
  action: string;
  target?: string;
  details?: string;
  timestamp: string;
}

/**
 * Dashboard context value
 */
export interface DashboardContextValue {
  // Current dashboard
  dashboard: Dashboard | null;
  isLoading: boolean;
  error: string | null;

  // Dashboard operations
  loadDashboard: (id: string) => Promise<void>;
  saveDashboard: (dashboard: Dashboard) => Promise<void>;
  createDashboard: (dashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Dashboard>;
  deleteDashboard: (id: string) => Promise<void>;

  // Widget operations
  addWidget: (widget: Omit<DashboardWidget, 'id'>) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
  removeWidget: (id: string) => void;
  moveWidget: (id: string, position: WidgetPosition) => void;

  // Real-time subscriptions
  subscribe: (subscription: Omit<DashboardSubscription, 'id'>) => string;
  unsubscribe: (subscriptionId: string) => void;

  // Sharing
  shareDashboard: (dashboardId: string, userIds: string[]) => Promise<void>;
  unshareDashboard: (dashboardId: string, userIds: string[]) => Promise<void>;

  // Refresh
  refreshWidget: (widgetId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  setRefreshInterval: (interval: number) => void;
}

/**
 * Default grid layout
 */
export const DEFAULT_GRID_LAYOUT: GridLayout = {
  columns: 12,
  rowHeight: 80,
  gap: 16,
  breakpoints: {
    lg: 1200,
    md: 996,
    sm: 768,
    xs: 480,
  },
};

/**
 * Default refresh interval (30 seconds)
 */
export const DEFAULT_REFRESH_INTERVAL = 30000;

/**
 * Widget size presets
 */
export const WIDGET_SIZE_PRESETS: Record<WidgetType, WidgetPosition> = {
  metric_card: { x: 0, y: 0, w: 3, h: 2 },
  line_chart: { x: 0, y: 0, w: 6, h: 4 },
  bar_chart: { x: 0, y: 0, w: 6, h: 4 },
  pie_chart: { x: 0, y: 0, w: 4, h: 4 },
  data_table: { x: 0, y: 0, w: 12, h: 5 },
  alert_list: { x: 0, y: 0, w: 4, h: 4 },
  activity_feed: { x: 0, y: 0, w: 4, h: 5 },
  heatmap: { x: 0, y: 0, w: 6, h: 4 },
};
