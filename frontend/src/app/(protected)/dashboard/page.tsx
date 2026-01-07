'use client';

import React, { useCallback } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { DashboardProvider, useDashboard } from '@/providers/DashboardProvider';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { MetricCard, LineChart, AlertList, ActivityFeed } from '@/components/dashboard';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { Dashboard, DashboardWidget, MetricData, DataPoint, AlertData, ActivityData } from '@/types/dashboard';

// Mock data for demo
const mockMetrics: Record<string, MetricData> = {
  portfolio_value: {
    value: 125847.32,
    previousValue: 121500.00,
    change: 4347.32,
    changePercent: 3.58,
    trend: 'up',
    timestamp: new Date().toISOString(),
  },
  daily_pnl: {
    value: 2847.50,
    previousValue: 1200.00,
    change: 1647.50,
    changePercent: 137.29,
    trend: 'up',
    timestamp: new Date().toISOString(),
  },
  active_strategies: {
    value: 5,
    previousValue: 4,
    change: 1,
    changePercent: 25,
    trend: 'up',
    timestamp: new Date().toISOString(),
  },
  win_rate: {
    value: 68.5,
    previousValue: 65.2,
    change: 3.3,
    changePercent: 5.06,
    trend: 'up',
    timestamp: new Date().toISOString(),
  },
};

const mockChartData: DataPoint[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
  value: 120000 + Math.random() * 10000 + i * 200,
  label: `${i}:00`,
}));

const mockAlerts: AlertData[] = [
  { id: '1', severity: 'warning', title: 'High Volatility', message: 'BTC volatility above threshold', source: 'Risk Monitor', timestamp: new Date().toISOString(), acknowledged: false },
  { id: '2', severity: 'info', title: 'Strategy Update', message: 'Momentum strategy rebalanced', source: 'Strategy Engine', timestamp: new Date(Date.now() - 3600000).toISOString(), acknowledged: true },
  { id: '3', severity: 'critical', title: 'Position Limit', message: 'ETH position approaching limit', source: 'Risk Controls', timestamp: new Date(Date.now() - 7200000).toISOString(), acknowledged: false },
];

const mockActivities: ActivityData[] = [
  { id: '1', type: 'trade', actor: 'AI Engine', action: 'executed', target: 'BTC-USD', details: 'Buy 0.5 BTC @ $42,150', timestamp: new Date().toISOString() },
  { id: '2', type: 'strategy', actor: 'System', action: 'activated', target: 'Momentum Strategy', timestamp: new Date(Date.now() - 1800000).toISOString() },
  { id: '3', type: 'alert', actor: 'Risk Monitor', action: 'triggered', target: 'Volatility Alert', timestamp: new Date(Date.now() - 3600000).toISOString() },
];

// Default dashboard configuration
const defaultDashboard: Dashboard = {
  id: 'default',
  type: 'trader',
  name: 'Trading Dashboard',
  description: 'Main trading overview',
  widgets: [
    { id: 'w1', type: 'metric_card', title: 'Portfolio Value', config: { metric: 'portfolio_value', format: 'currency', showTrend: true, trendPeriod: 'day' }, position: { x: 0, y: 0, w: 3, h: 2 } },
    { id: 'w2', type: 'metric_card', title: 'Daily P&L', config: { metric: 'daily_pnl', format: 'currency', showTrend: true, trendPeriod: 'day' }, position: { x: 3, y: 0, w: 3, h: 2 } },
    { id: 'w3', type: 'metric_card', title: 'Active Strategies', config: { metric: 'active_strategies', format: 'number', showTrend: true }, position: { x: 6, y: 0, w: 3, h: 2 } },
    { id: 'w4', type: 'metric_card', title: 'Win Rate', config: { metric: 'win_rate', format: 'percentage', showTrend: true }, position: { x: 9, y: 0, w: 3, h: 2 } },
    { id: 'w5', type: 'line_chart', title: 'Portfolio Performance', config: { dataSource: 'portfolio_history' }, position: { x: 0, y: 2, w: 8, h: 4 } },
    { id: 'w6', type: 'alert_list', title: 'Active Alerts', config: { maxItems: 5 }, position: { x: 8, y: 2, w: 4, h: 4 } },
    { id: 'w7', type: 'activity_feed', title: 'Recent Activity', config: { maxItems: 5 }, position: { x: 0, y: 6, w: 12, h: 3 } },
  ],
  layout: { columns: 12, rowHeight: 80, gap: 16 },
  refreshInterval: 30000,
  isShared: false,
  ownerId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function TradingDashboard() {
  const { dashboard } = useDashboard();
  const { session, logout } = useAuth();
  const currentDashboard = dashboard || defaultDashboard;

  const renderWidget = useCallback((widget: DashboardWidget) => {
    switch (widget.type) {
      case 'metric_card':
        const metricKey = (widget.config as { metric?: string }).metric || '';
        return (
          <MetricCard
            title={widget.title}
            data={mockMetrics[metricKey] || null}
            config={widget.config as Parameters<typeof MetricCard>[0]['config']}
          />
        );
      case 'line_chart':
        return (
          <LineChart
            title={widget.title}
            data={mockChartData}
            config={widget.config as Parameters<typeof LineChart>[0]['config']}
          />
        );
      case 'alert_list':
        return (
          <AlertList
            title={widget.title}
            alerts={mockAlerts}
            config={widget.config as Parameters<typeof AlertList>[0]['config']}
          />
        );
      case 'activity_feed':
        return (
          <ActivityFeed
            title={widget.title}
            activities={mockActivities}
            config={widget.config as Parameters<typeof ActivityFeed>[0]['config']}
          />
        );
      default:
        return (
          <Card className="h-full">
            <CardHeader>
              <CardTitle>{widget.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Widget: {widget.type}</p>
            </CardContent>
          </Card>
        );
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-foreground">AI Crypto Trading</h1>
            <span className="text-sm text-muted-foreground">|</span>
            <span className="text-sm text-muted-foreground">{currentDashboard.name}</span>
          </div>
          <div className="flex items-center gap-4">
            {session && (
              <span className="text-sm text-muted-foreground">
                {session.name || session.email}
              </span>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">Settings</Button>
              <Button variant="primary" size="sm">New Strategy</Button>
              <Button variant="ghost" size="sm" onClick={() => logout()}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto px-4 py-6" tabIndex={-1} aria-label="Main content">
        <DashboardGrid
          widgets={currentDashboard.widgets}
          layout={currentDashboard.layout}
          renderWidget={renderWidget}
          className="min-h-[600px]"
        />
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardProvider initialDashboard={defaultDashboard}>
      <TradingDashboard />
    </DashboardProvider>
  );
}
