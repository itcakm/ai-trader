'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { RiskStatusSummary, RiskEvent, riskEventSeverityVariant } from '../../types/risk-controls';

export interface RiskStatusDashboardProps {
  status: RiskStatusSummary;
  recentEvents: RiskEvent[];
  loading?: boolean;
  onRefresh?: () => void;
  onAcknowledgeEvent?: (eventId: string) => void;
  onViewAllEvents?: () => void;
}

export function RiskStatusDashboard({
  status,
  recentEvents,
  loading = false,
  onRefresh,
  onAcknowledgeEvent,
  onViewAllEvents,
}: RiskStatusDashboardProps) {
  const getUtilizationColor = (percent: number) => {
    if (percent >= 90) return 'text-red-600 dark:text-red-400';
    if (percent >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getProgressColor = (current: number, max: number) => {
    const percent = (current / max) * 100;
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Risk Status</h2>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} loading={loading}>
            Refresh
          </Button>
        )}
      </div>

      {/* Kill Switch Status */}
      <Card className={status.killSwitchActive ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-4 h-4 rounded-full ${
                  status.killSwitchActive ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                }`}
              />
              <div>
                <p className="font-medium text-foreground">Kill Switch</p>
                <p className="text-sm text-muted-foreground">
                  {status.killSwitchActive ? 'ACTIVE - All trading halted' : 'Inactive - Trading enabled'}
                </p>
              </div>
            </div>
            <Badge variant={status.killSwitchActive ? 'error' : 'success'}>
              {status.killSwitchActive ? 'ACTIVE' : 'INACTIVE'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Active Alerts"
          value={status.activeAlerts.toString()}
          valueColor={status.activeAlerts > 0 ? 'text-yellow-600 dark:text-yellow-400' : undefined}
          loading={loading}
        />
        <SummaryCard
          title="Position Utilization"
          value={`${status.positionUtilization.toFixed(1)}%`}
          valueColor={getUtilizationColor(status.positionUtilization)}
          loading={loading}
        />
        <SummaryCard
          title="Current Drawdown"
          value={`${status.drawdownCurrent.toFixed(2)}%`}
          subtitle={`Max: ${status.drawdownMax}%`}
          valueColor={getUtilizationColor((status.drawdownCurrent / status.drawdownMax) * 100)}
          loading={loading}
        />
        <SummaryCard
          title="Volatility"
          value={`${status.volatilityCurrent.toFixed(2)}%`}
          subtitle={`Max: ${status.volatilityMax}%`}
          valueColor={getUtilizationColor((status.volatilityCurrent / status.volatilityMax) * 100)}
          loading={loading}
        />
      </div>

      {/* Risk Meters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Drawdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current</span>
                <span className="font-medium">{status.drawdownCurrent.toFixed(2)}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${getProgressColor(status.drawdownCurrent, status.drawdownMax)} transition-all`}
                  style={{ width: `${Math.min((status.drawdownCurrent / status.drawdownMax) * 100, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>Max: {status.drawdownMax}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volatility</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current</span>
                <span className="font-medium">{status.volatilityCurrent.toFixed(2)}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${getProgressColor(status.volatilityCurrent, status.volatilityMax)} transition-all`}
                  style={{ width: `${Math.min((status.volatilityCurrent / status.volatilityMax) * 100, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>Max: {status.volatilityMax}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Risk Events</CardTitle>
            {onViewAllEvents && (
              <Button variant="ghost" size="sm" onClick={onViewAllEvents}>
                View All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent risk events.
            </div>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event) => (
                <div
                  key={event.eventId}
                  className={`flex items-start justify-between p-3 border rounded-lg ${
                    !event.acknowledged ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Badge variant={riskEventSeverityVariant[event.severity]}>{event.severity}</Badge>
                    <div>
                      <p className="font-medium text-foreground">{event.type.replace(/_/g, ' ')}</p>
                      <p className="text-sm text-muted-foreground">{event.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatTime(event.timestamp)}</p>
                    </div>
                  </div>
                  {!event.acknowledged && onAcknowledgeEvent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAcknowledgeEvent(event.eventId)}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Updated */}
      <p className="text-xs text-muted-foreground text-right">
        Last updated: {formatTime(status.lastUpdated)}
      </p>
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  valueColor?: string;
  loading?: boolean;
}

function SummaryCard({ title, value, subtitle, valueColor, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        {loading ? (
          <div className="h-7 w-16 bg-muted animate-pulse rounded" />
        ) : (
          <>
            <p className={`text-2xl font-semibold ${valueColor || 'text-foreground'}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
