'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { DashboardProvider, useDashboard } from '@/providers/DashboardProvider';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { MetricCard, LineChart, AlertList, ActivityFeed } from '@/components/dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  useTradingStore, 
  selectActiveStrategies, 
  selectTotalPnL, 
  selectWinRate 
} from '@/stores/trading-store';
import type { Dashboard, DashboardWidget, MetricData, DataPoint, AlertData, ActivityData } from '@/types/dashboard';

// Quick Actions Modal
function QuickActionsModal({ onClose }: { onClose: () => void }) {
  const [action, setAction] = useState<'deposit' | 'strategy' | null>(null);
  const [amount, setAmount] = useState('');
  const [strategyName, setStrategyName] = useState('');
  const [strategyType, setStrategyType] = useState<'Momentum' | 'Mean Reversion' | 'DCA'>('Momentum');
  
  const { addDeposit, addStrategy } = useTradingStore();

  const handleDeposit = () => {
    const depositAmount = parseFloat(amount);
    if (depositAmount > 0) {
      addDeposit(depositAmount);
      onClose();
    }
  };

  const handleCreateStrategy = () => {
    if (strategyName.trim()) {
      addStrategy({
        name: strategyName,
        type: strategyType,
        description: `${strategyType} trading strategy`,
        status: 'draft',
        pairs: ['BTC/USDT'],
        parameters: {},
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {!action ? (
          <>
            <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Button className="w-full" onClick={() => setAction('deposit')}>
                💰 Make a Deposit
              </Button>
              <Button className="w-full" variant="outline" onClick={() => setAction('strategy')}>
                📈 Create Strategy
              </Button>
            </div>
            <Button variant="ghost" className="w-full mt-4" onClick={onClose}>Cancel</Button>
          </>
        ) : action === 'deposit' ? (
          <>
            <h2 className="text-xl font-bold mb-4">Make a Deposit</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount (USD)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Enter amount"
                  min="0"
                  step="100"
                />
              </div>
              <div className="flex gap-2">
                {[1000, 5000, 10000, 25000].map((preset) => (
                  <Button key={preset} variant="outline" size="sm" onClick={() => setAmount(preset.toString())}>
                    ${preset.toLocaleString()}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setAction(null)}>Back</Button>
                <Button className="flex-1" onClick={handleDeposit} disabled={!amount || parseFloat(amount) <= 0}>
                  Deposit ${amount ? parseFloat(amount).toLocaleString() : '0'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-4">Create Strategy</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Strategy Name</label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  placeholder="My Trading Strategy"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Strategy Type</label>
                <select
                  value={strategyType}
                  onChange={(e) => setStrategyType(e.target.value as typeof strategyType)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="Momentum">Momentum</option>
                  <option value="Mean Reversion">Mean Reversion</option>
                  <option value="DCA">DCA (Dollar Cost Average)</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setAction(null)}>Back</Button>
                <Button className="flex-1" onClick={handleCreateStrategy} disabled={!strategyName.trim()}>
                  Create Strategy
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Empty State Component
function EmptyDashboard() {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] text-center">
      <div className="text-6xl mb-4">🚀</div>
      <h2 className="text-2xl font-bold mb-2">Welcome to Your Trading Dashboard</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
        Get started by making your first deposit and creating a trading strategy.
      </p>
      <Button size="lg" onClick={() => setShowModal(true)}>Get Started</Button>
      {showModal && <QuickActionsModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

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
  const currentDashboard = dashboard || defaultDashboard;
  const [showQuickActions, setShowQuickActions] = useState(false);
  
  const portfolioValue = useTradingStore((state) => state.portfolioValue);
  const totalDeposited = useTradingStore((state) => state.totalDeposited);
  const positions = useTradingStore((state) => state.positions);
  const activeStrategies = useTradingStore(selectActiveStrategies);
  const totalPnL = useTradingStore(selectTotalPnL);
  const winRate = useTradingStore(selectWinRate);
  const alerts = useTradingStore((state) => state.alerts);
  const activities = useTradingStore((state) => state.activities);
  const acknowledgeAlert = useTradingStore((state) => state.acknowledgeAlert);

  const hasData = totalDeposited > 0 || positions.length > 0;

  const metrics: Record<string, MetricData> = useMemo(() => ({
    portfolio_value: {
      value: portfolioValue || totalDeposited,
      previousValue: totalDeposited,
      change: totalPnL,
      changePercent: totalDeposited > 0 ? (totalPnL / totalDeposited) * 100 : 0,
      trend: totalPnL >= 0 ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    },
    daily_pnl: {
      value: totalPnL,
      previousValue: 0,
      change: totalPnL,
      changePercent: totalDeposited > 0 ? (totalPnL / totalDeposited) * 100 : 0,
      trend: totalPnL >= 0 ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    },
    active_strategies: {
      value: activeStrategies.length,
      previousValue: 0,
      change: activeStrategies.length,
      changePercent: 0,
      trend: activeStrategies.length > 0 ? 'up' : 'stable',
      timestamp: new Date().toISOString(),
    },
    win_rate: {
      value: winRate,
      previousValue: 50,
      change: winRate - 50,
      changePercent: ((winRate - 50) / 50) * 100,
      trend: winRate >= 50 ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    },
  }), [portfolioValue, totalDeposited, totalPnL, activeStrategies.length, winRate]);

  const chartData: DataPoint[] = useMemo(() => {
    const baseValue = totalDeposited || 10000;
    return Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      value: baseValue + (Math.random() - 0.3) * baseValue * 0.02 * i + totalPnL * (i / 24),
      label: `${i}:00`,
    }));
  }, [totalDeposited, totalPnL]);

  const dashboardAlerts: AlertData[] = useMemo(() => {
    if (alerts.length === 0) {
      return [{ id: 'welcome', severity: 'info', title: 'Welcome!', message: 'Start by making a deposit and creating your first strategy', source: 'System', timestamp: new Date().toISOString(), acknowledged: false }];
    }
    return alerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message, source: a.source, timestamp: a.timestamp, acknowledged: a.acknowledged }));
  }, [alerts]);

  const dashboardActivities: ActivityData[] = useMemo(() => {
    if (activities.length === 0) {
      return [{ id: 'welcome', type: 'system', actor: 'System', action: 'initialized', target: 'Dashboard', details: 'Ready to start trading', timestamp: new Date().toISOString() }];
    }
    return activities.slice(0, 10).map((a) => ({ id: a.id, type: a.type, actor: a.actor, action: a.action, target: a.target, details: a.details, timestamp: a.timestamp }));
  }, [activities]);

  const renderWidget = useCallback((widget: DashboardWidget) => {
    switch (widget.type) {
      case 'metric_card':
        const metricKey = (widget.config as { metric?: string }).metric || '';
        return <MetricCard title={widget.title} data={metrics[metricKey] || null} config={widget.config as Parameters<typeof MetricCard>[0]['config']} />;
      case 'line_chart':
        return <LineChart title={widget.title} data={chartData} config={widget.config as Parameters<typeof LineChart>[0]['config']} />;
      case 'alert_list':
        return <AlertList title={widget.title} alerts={dashboardAlerts} config={widget.config as Parameters<typeof AlertList>[0]['config']} onAcknowledge={acknowledgeAlert} />;
      case 'activity_feed':
        return <ActivityFeed title={widget.title} activities={dashboardActivities} config={widget.config as Parameters<typeof ActivityFeed>[0]['config']} />;
      default:
        return <Card className="h-full"><CardHeader><CardTitle>{widget.title}</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Widget: {widget.type}</p></CardContent></Card>;
    }
  }, [metrics, chartData, dashboardAlerts, dashboardActivities, acknowledgeAlert]);

  if (!hasData) return <EmptyDashboard />;

  return (
    <div id="main-content" tabIndex={-1} aria-label="Main content">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Trading Dashboard</h1>
        <Button onClick={() => setShowQuickActions(true)}>Quick Actions</Button>
      </div>
      <DashboardGrid widgets={currentDashboard.widgets} layout={currentDashboard.layout} renderWidget={renderWidget} className="min-h-[600px]" />
      {showQuickActions && <QuickActionsModal onClose={() => setShowQuickActions(false)} />}
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
