'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Position, AggregatedPosition, ExchangeId } from '../../types/exchange';

export interface PositionViewerProps {
  positions: Position[];
  aggregatedPositions?: AggregatedPosition[];
  loading?: boolean;
  onRefresh?: () => void;
  onClosePosition?: (positionId: string) => void;
  onViewPositionDetails?: (position: Position) => void;
  viewMode?: 'individual' | 'aggregated';
  onViewModeChange?: (mode: 'individual' | 'aggregated') => void;
}

export function PositionViewer({
  positions,
  aggregatedPositions = [],
  loading = false,
  onRefresh,
  onClosePosition,
  onViewPositionDetails,
  viewMode = 'individual',
  onViewModeChange,
}: PositionViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState('');

  const exchanges = useMemo(() => {
    const uniqueExchanges = new Set(positions.map((p) => p.exchangeId));
    return Array.from(uniqueExchanges);
  }, [positions]);

  const exchangeOptions = [
    { value: '', label: 'All Exchanges' },
    ...exchanges.map((ex) => ({ value: ex, label: ex })),
  ];

  const filteredPositions = useMemo(() => {
    return positions.filter((position) => {
      const matchesSearch = position.assetId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesExchange = !exchangeFilter || position.exchangeId === exchangeFilter;
      return matchesSearch && matchesExchange;
    });
  }, [positions, searchTerm, exchangeFilter]);

  const filteredAggregated = useMemo(() => {
    return aggregatedPositions.filter((position) =>
      position.assetId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [aggregatedPositions, searchTerm]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatQuantity = (quantity: number) => {
    return quantity.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    });
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const getPnLColor = (value: number) => {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-muted-foreground';
  };

  const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const totalRealizedPnL = positions.reduce((sum, p) => sum + p.realizedPnL, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Positions"
          value={positions.length.toString()}
          loading={loading}
        />
        <SummaryCard
          title="Unrealized P&L"
          value={formatCurrency(totalUnrealizedPnL)}
          valueColor={getPnLColor(totalUnrealizedPnL)}
          loading={loading}
        />
        <SummaryCard
          title="Realized P&L"
          value={formatCurrency(totalRealizedPnL)}
          valueColor={getPnLColor(totalRealizedPnL)}
          loading={loading}
        />
        <SummaryCard
          title="Active Exchanges"
          value={exchanges.length.toString()}
          loading={loading}
        />
      </div>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Positions</CardTitle>
            <div className="flex items-center gap-2">
              {onViewModeChange && (
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    className={`px-3 py-1 text-sm ${
                      viewMode === 'individual'
                        ? 'bg-primary-600 text-white'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                    onClick={() => onViewModeChange('individual')}
                  >
                    Individual
                  </button>
                  <button
                    className={`px-3 py-1 text-sm ${
                      viewMode === 'aggregated'
                        ? 'bg-primary-600 text-white'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                    onClick={() => onViewModeChange('aggregated')}
                  >
                    Aggregated
                  </button>
                </div>
              )}
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh} loading={loading}>
                  Refresh
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Search by asset..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {viewMode === 'individual' && (
              <div className="w-48">
                <Select
                  options={exchangeOptions}
                  value={exchangeFilter}
                  onChange={(e) => setExchangeFilter(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Table */}
          {loading && positions.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : viewMode === 'individual' ? (
            filteredPositions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {positions.length === 0 ? 'No open positions.' : 'No positions match your filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Asset</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Exchange</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Quantity</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Avg Entry</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Current</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Unrealized P&L</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Realized P&L</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.map((position) => (
                      <tr
                        key={position.positionId}
                        className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => onViewPositionDetails?.(position)}
                      >
                        <td className="py-3 px-4 font-medium text-foreground">{position.assetId}</td>
                        <td className="py-3 px-4 text-muted-foreground">{position.exchangeId}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatQuantity(position.quantity)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(position.averageEntryPrice)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(position.currentPrice)}</td>
                        <td className={`py-3 px-4 text-right font-mono ${getPnLColor(position.unrealizedPnL)}`}>
                          {formatCurrency(position.unrealizedPnL)}
                          <span className="text-xs ml-1">({formatPercent(position.unrealizedPnLPercent)})</span>
                        </td>
                        <td className={`py-3 px-4 text-right font-mono ${getPnLColor(position.realizedPnL)}`}>
                          {formatCurrency(position.realizedPnL)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {onClosePosition && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onClosePosition(position.positionId);
                              }}
                            >
                              Close
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // Aggregated View
            filteredAggregated.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No aggregated positions available.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAggregated.map((position) => (
                  <AggregatedPositionCard
                    key={position.assetId}
                    position={position}
                    formatCurrency={formatCurrency}
                    formatQuantity={formatQuantity}
                    getPnLColor={getPnLColor}
                  />
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  valueColor?: string;
  loading?: boolean;
}

function SummaryCard({ title, value, valueColor, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        {loading ? (
          <div className="h-7 w-20 bg-muted animate-pulse rounded" />
        ) : (
          <p className={`text-xl font-semibold ${valueColor || 'text-foreground'}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface AggregatedPositionCardProps {
  position: AggregatedPosition;
  formatCurrency: (value: number) => string;
  formatQuantity: (quantity: number) => string;
  getPnLColor: (value: number) => string;
}

function AggregatedPositionCard({
  position,
  formatCurrency,
  formatQuantity,
  getPnLColor,
}: AggregatedPositionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h4 className="font-medium text-foreground">{position.assetId}</h4>
          <p className="text-sm text-muted-foreground">
            {position.positionsByExchange.length} exchange(s)
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Quantity</p>
            <p className="font-mono">{formatQuantity(position.totalQuantity)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Unrealized P&L</p>
            <p className={`font-mono ${getPnLColor(position.unrealizedPnL)}`}>
              {formatCurrency(position.unrealizedPnL)}
            </p>
          </div>
          <svg
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/30">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left py-2">Exchange</th>
                <th className="text-right py-2">Quantity</th>
                <th className="text-right py-2">Avg Entry</th>
                <th className="text-right py-2">Unrealized P&L</th>
              </tr>
            </thead>
            <tbody>
              {position.positionsByExchange.map((ex) => (
                <tr key={ex.exchangeId} className="text-sm">
                  <td className="py-2">{ex.exchangeId}</td>
                  <td className="py-2 text-right font-mono">{formatQuantity(ex.quantity)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(ex.averageEntryPrice)}</td>
                  <td className={`py-2 text-right font-mono ${getPnLColor(ex.unrealizedPnL)}`}>
                    {formatCurrency(ex.unrealizedPnL)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
