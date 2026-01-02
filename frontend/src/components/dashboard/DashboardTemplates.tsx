'use client';

import type { Dashboard, DashboardType, DashboardWidget, GridLayout } from '@/types/dashboard';
import { DEFAULT_GRID_LAYOUT, DEFAULT_REFRESH_INTERVAL } from '@/types/dashboard';

/**
 * Dashboard template definition
 */
export interface DashboardTemplate {
  type: DashboardType;
  name: string;
  description: string;
  widgets: Omit<DashboardWidget, 'id'>[];
  layout: GridLayout;
  refreshInterval: number;
}

/**
 * Generate unique widget ID
 */
function generateWidgetId(prefix: string, index: number): string {
  return `${prefix}_widget_${index}`;
}

/**
 * Trader Dashboard Template
 * Focus: Portfolio performance, active orders, market data
 */
const traderDashboardTemplate: DashboardTemplate = {
  type: 'trader',
  name: 'Trader Dashboard',
  description: 'Monitor portfolio performance, active orders, and market conditions',
  layout: DEFAULT_GRID_LAYOUT,
  refreshInterval: 10000, // 10 seconds for traders
  widgets: [
    {
      type: 'metric_card',
      title: 'Portfolio Value',
      config: {
        metric: 'portfolio_value',
        format: 'currency',
        currency: 'USD',
        showTrend: true,
        trendPeriod: 'day',
      },
      position: { x: 0, y: 0, w: 3, h: 2 },
      drillDownPath: '/portfolio',
    },
    {
      type: 'metric_card',
      title: 'Daily P&L',
      config: {
        metric: 'daily_pnl',
        format: 'currency',
        currency: 'USD',
        showTrend: true,
        trendPeriod: 'hour',
        thresholds: { warning: -1000, critical: -5000 },
      },
      position: { x: 3, y: 0, w: 3, h: 2 },
      drillDownPath: '/reports/pnl',
    },
    {
      type: 'metric_card',
      title: 'Open Positions',
      config: {
        metric: 'open_positions',
        format: 'number',
        showTrend: false,
      },
      position: { x: 6, y: 0, w: 3, h: 2 },
      drillDownPath: '/positions',
    },
    {
      type: 'metric_card',
      title: 'Active Orders',
      config: {
        metric: 'active_orders',
        format: 'number',
        showTrend: false,
      },
      position: { x: 9, y: 0, w: 3, h: 2 },
      drillDownPath: '/orders',
    },
    {
      type: 'line_chart',
      title: 'Portfolio Performance',
      config: {
        dataSource: '/api/charts/portfolio-performance',
        showLegend: true,
        showGrid: true,
      },
      position: { x: 0, y: 2, w: 8, h: 4 },
      drillDownPath: '/reports/performance',
    },
    {
      type: 'alert_list',
      title: 'Trading Alerts',
      config: {
        severityFilter: ['warning', 'critical'],
        maxItems: 5,
        showAcknowledged: false,
      },
      position: { x: 8, y: 2, w: 4, h: 4 },
      drillDownPath: '/alerts',
    },
    {
      type: 'data_table',
      title: 'Recent Orders',
      config: {
        dataSource: '/api/orders/recent',
        columns: ['symbol', 'side', 'quantity', 'price', 'status', 'time'],
        sortable: true,
        pageSize: 5,
      },
      position: { x: 0, y: 6, w: 12, h: 4 },
      drillDownPath: '/orders',
    },
  ],
};

/**
 * Risk Dashboard Template
 * Focus: Risk metrics, limit utilization, alerts
 */
const riskDashboardTemplate: DashboardTemplate = {
  type: 'risk',
  name: 'Risk Dashboard',
  description: 'Monitor risk metrics, limit utilization, and system health',
  layout: DEFAULT_GRID_LAYOUT,
  refreshInterval: 15000, // 15 seconds
  widgets: [
    {
      type: 'metric_card',
      title: 'VaR (95%)',
      config: {
        metric: 'var_95',
        format: 'currency',
        currency: 'USD',
        showTrend: true,
        trendPeriod: 'day',
        thresholds: { warning: 50000, critical: 100000 },
      },
      position: { x: 0, y: 0, w: 3, h: 2 },
      drillDownPath: '/risk/var',
    },
    {
      type: 'metric_card',
      title: 'Max Drawdown',
      config: {
        metric: 'max_drawdown',
        format: 'percentage',
        showTrend: true,
        trendPeriod: 'week',
        thresholds: { warning: 5, critical: 10 },
      },
      position: { x: 3, y: 0, w: 3, h: 2 },
      drillDownPath: '/risk/drawdown',
    },
    {
      type: 'metric_card',
      title: 'Position Limit Used',
      config: {
        metric: 'position_limit_pct',
        format: 'percentage',
        showTrend: false,
        thresholds: { warning: 80, critical: 95 },
      },
      position: { x: 6, y: 0, w: 3, h: 2 },
      drillDownPath: '/risk/limits',
    },
    {
      type: 'metric_card',
      title: 'Risk Score',
      config: {
        metric: 'risk_score',
        format: 'number',
        showTrend: true,
        trendPeriod: 'hour',
        thresholds: { warning: 70, critical: 90 },
      },
      position: { x: 9, y: 0, w: 3, h: 2 },
      drillDownPath: '/risk/overview',
    },
    {
      type: 'bar_chart',
      title: 'Limit Utilization by Asset',
      config: {
        dataSource: '/api/risk/limit-utilization',
        showLegend: true,
        showGrid: true,
      },
      position: { x: 0, y: 2, w: 6, h: 4 },
      drillDownPath: '/risk/limits',
    },
    {
      type: 'pie_chart',
      title: 'Risk by Strategy',
      config: {
        dataSource: '/api/risk/by-strategy',
        showLegend: true,
      },
      position: { x: 6, y: 2, w: 6, h: 4 },
      drillDownPath: '/strategies',
    },
    {
      type: 'alert_list',
      title: 'Risk Alerts',
      config: {
        severityFilter: ['warning', 'critical'],
        maxItems: 10,
        showAcknowledged: false,
      },
      position: { x: 0, y: 6, w: 6, h: 4 },
      drillDownPath: '/alerts?type=risk',
    },
    {
      type: 'activity_feed',
      title: 'Risk Events',
      config: {
        activityTypes: ['risk', 'alert', 'limit'],
        maxItems: 10,
        showTimestamps: true,
      },
      position: { x: 6, y: 6, w: 6, h: 4 },
      drillDownPath: '/audit?module=risk',
    },
  ],
};

/**
 * Admin Dashboard Template
 * Focus: System health, user activity, audit logs
 */
const adminDashboardTemplate: DashboardTemplate = {
  type: 'admin',
  name: 'Admin Dashboard',
  description: 'Monitor system health, user activity, and administrative tasks',
  layout: DEFAULT_GRID_LAYOUT,
  refreshInterval: 30000, // 30 seconds
  widgets: [
    {
      type: 'metric_card',
      title: 'Active Users',
      config: {
        metric: 'active_users',
        format: 'number',
        showTrend: true,
        trendPeriod: 'hour',
      },
      position: { x: 0, y: 0, w: 3, h: 2 },
      drillDownPath: '/admin/users',
    },
    {
      type: 'metric_card',
      title: 'API Requests/min',
      config: {
        metric: 'api_requests_per_min',
        format: 'number',
        showTrend: true,
        trendPeriod: 'hour',
        thresholds: { warning: 1000, critical: 5000 },
      },
      position: { x: 3, y: 0, w: 3, h: 2 },
      drillDownPath: '/admin/metrics',
    },
    {
      type: 'metric_card',
      title: 'Error Rate',
      config: {
        metric: 'error_rate',
        format: 'percentage',
        showTrend: true,
        trendPeriod: 'hour',
        thresholds: { warning: 1, critical: 5 },
      },
      position: { x: 6, y: 0, w: 3, h: 2 },
      drillDownPath: '/admin/errors',
    },
    {
      type: 'metric_card',
      title: 'System Health',
      config: {
        metric: 'system_health',
        format: 'percentage',
        showTrend: false,
        thresholds: { warning: 90, critical: 80 },
      },
      position: { x: 9, y: 0, w: 3, h: 2 },
      drillDownPath: '/admin/health',
    },
    {
      type: 'line_chart',
      title: 'API Traffic',
      config: {
        dataSource: '/api/admin/traffic',
        showLegend: true,
        showGrid: true,
      },
      position: { x: 0, y: 2, w: 8, h: 4 },
      drillDownPath: '/admin/metrics',
    },
    {
      type: 'pie_chart',
      title: 'Users by Role',
      config: {
        dataSource: '/api/admin/users-by-role',
        showLegend: true,
      },
      position: { x: 8, y: 2, w: 4, h: 4 },
      drillDownPath: '/admin/users',
    },
    {
      type: 'activity_feed',
      title: 'Recent Activity',
      config: {
        activityTypes: ['login', 'logout', 'config', 'user'],
        maxItems: 15,
        showTimestamps: true,
      },
      position: { x: 0, y: 6, w: 6, h: 5 },
      drillDownPath: '/audit',
    },
    {
      type: 'alert_list',
      title: 'System Alerts',
      config: {
        severityFilter: ['info', 'warning', 'critical'],
        maxItems: 10,
        showAcknowledged: false,
      },
      position: { x: 6, y: 6, w: 6, h: 5 },
      drillDownPath: '/alerts?type=system',
    },
  ],
};

/**
 * Executive Dashboard Template
 * Focus: High-level metrics, performance summary, trends
 */
const executiveDashboardTemplate: DashboardTemplate = {
  type: 'executive',
  name: 'Executive Dashboard',
  description: 'High-level overview of business performance and key metrics',
  layout: DEFAULT_GRID_LAYOUT,
  refreshInterval: 60000, // 1 minute
  widgets: [
    {
      type: 'metric_card',
      title: 'Total AUM',
      config: {
        metric: 'total_aum',
        format: 'currency',
        currency: 'USD',
        showTrend: true,
        trendPeriod: 'month',
      },
      position: { x: 0, y: 0, w: 3, h: 2 },
      drillDownPath: '/reports/aum',
    },
    {
      type: 'metric_card',
      title: 'MTD Return',
      config: {
        metric: 'mtd_return',
        format: 'percentage',
        showTrend: true,
        trendPeriod: 'week',
      },
      position: { x: 3, y: 0, w: 3, h: 2 },
      drillDownPath: '/reports/returns',
    },
    {
      type: 'metric_card',
      title: 'YTD Return',
      config: {
        metric: 'ytd_return',
        format: 'percentage',
        showTrend: true,
        trendPeriod: 'month',
      },
      position: { x: 6, y: 0, w: 3, h: 2 },
      drillDownPath: '/reports/returns',
    },
    {
      type: 'metric_card',
      title: 'Sharpe Ratio',
      config: {
        metric: 'sharpe_ratio',
        format: 'number',
        showTrend: true,
        trendPeriod: 'month',
      },
      position: { x: 9, y: 0, w: 3, h: 2 },
      drillDownPath: '/reports/risk-adjusted',
    },
    {
      type: 'line_chart',
      title: 'Portfolio Performance (YTD)',
      config: {
        dataSource: '/api/charts/ytd-performance',
        showLegend: true,
        showGrid: true,
      },
      position: { x: 0, y: 2, w: 8, h: 4 },
      drillDownPath: '/reports/performance',
    },
    {
      type: 'pie_chart',
      title: 'Asset Allocation',
      config: {
        dataSource: '/api/charts/asset-allocation',
        showLegend: true,
      },
      position: { x: 8, y: 2, w: 4, h: 4 },
      drillDownPath: '/portfolio/allocation',
    },
    {
      type: 'bar_chart',
      title: 'Strategy Performance',
      config: {
        dataSource: '/api/charts/strategy-performance',
        showLegend: true,
        showGrid: true,
      },
      position: { x: 0, y: 6, w: 6, h: 4 },
      drillDownPath: '/strategies',
    },
    {
      type: 'data_table',
      title: 'Top Performers',
      config: {
        dataSource: '/api/reports/top-performers',
        columns: ['asset', 'return', 'volume', 'contribution'],
        sortable: true,
        pageSize: 5,
      },
      position: { x: 6, y: 6, w: 6, h: 4 },
      drillDownPath: '/reports/performance',
    },
  ],
};

/**
 * All dashboard templates
 */
export const DashboardTemplates: Record<DashboardType, DashboardTemplate> = {
  trader: traderDashboardTemplate,
  risk: riskDashboardTemplate,
  admin: adminDashboardTemplate,
  executive: executiveDashboardTemplate,
};

/**
 * Get a dashboard template by type
 */
export function getDashboardTemplate(type: DashboardType): DashboardTemplate {
  return DashboardTemplates[type];
}

/**
 * Create a dashboard from a template
 */
export function createDashboardFromTemplate(
  type: DashboardType,
  ownerId: string,
  customName?: string
): Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'> {
  const template = getDashboardTemplate(type);
  
  return {
    type,
    name: customName || template.name,
    description: template.description,
    widgets: template.widgets.map((widget, index) => ({
      ...widget,
      id: generateWidgetId(type, index),
    })),
    layout: template.layout,
    refreshInterval: template.refreshInterval,
    isShared: false,
    ownerId,
  };
}

/**
 * Get all available dashboard templates
 */
export function getAllDashboardTemplates(): DashboardTemplate[] {
  return Object.values(DashboardTemplates);
}

export default DashboardTemplates;
