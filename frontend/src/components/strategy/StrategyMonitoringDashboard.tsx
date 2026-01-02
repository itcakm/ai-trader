'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Strategy, StrategyPerformance, strategyStateVariant } from '../../types/strategy';

export interface StrategyMonitoringDashboardProps {
  strategy: Strategy;
  performance?: StrategyPerformance;
  loading?: boolean;
  onRefresh?: () => void;
}

export function StrategyMonitoringDashboard({
  strategy,
  performance,
  loading = false,
  onRefresh,
}: StrategyMonitoringDashboardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Strategy Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>{strategy.name}</CardTitle>
              <Badge variant={strategyStateVariant[strategy.state]}>{strategy.state}</Badge>
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                disabled={loading}
              >
                <svg
                  className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Template</p>
              <p className="font-medium">{strategy.templateId}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Version</p>
              <p className="font-medium">{strategy.currentVersion}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">
                {new Date(strategy.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Updated</p>
              <p className="font-medium">
                {new Date(strategy.updatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      {performance && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Total Trades"
            value={performance.totalTrades.toString()}
            loading={loading}
          />
          <MetricCard
            title="Win Rate"
            value={formatPercent(performance.winRate)}
            variant={performance.winRate >= 50 ? 'success' : 'warning'}
            loading={loading}
          />
          <MetricCard
            title="P&L"
            value={formatCurrency(performance.profitLoss)}
            variant={performance.profitLoss >= 0 ? 'success' : 'error'}
            loading={loading}
          />
          <MetricCard
            title="Sharpe Ratio"
            value={performance.sharpeRatio.toFixed(2)}
            variant={performance.sharpeRatio >= 1 ? 'success' : 'warning'}
            loading={loading}
          />
          <MetricCard
            title="Max Drawdown"
            value={formatPercent(-performance.maxDrawdown)}
            variant={performance.maxDrawdown <= 10 ? 'success' : 'error'}
            loading={loading}
          />
        </div>
      )}

      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(strategy.parameters).map(([key, value]) => (
              <div key={key} className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">{key}</p>
                <p className="font-medium text-foreground">
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


interface MetricCardProps {
  title: string;
  value: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  loading?: boolean;
}

function MetricCard({ title, value, variant = 'default', loading }: MetricCardProps) {
  const variantStyles = {
    default: 'text-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400',
  };

  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        {loading ? (
          <div className="h-7 w-20 bg-muted animate-pulse rounded" />
        ) : (
          <p className={`text-xl font-semibold ${variantStyles[variant]}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
