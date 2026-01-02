'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { PositionLimit, LimitScope, LimitType, limitScopeVariant } from '../../types/risk-controls';

export interface LimitConfigPanelProps {
  limits: PositionLimit[];
  loading?: boolean;
  onAddLimit?: () => void;
  onEditLimit?: (limit: PositionLimit) => void;
  onDeleteLimit?: (limitId: string) => void;
}

const scopeOptions = [
  { value: '', label: 'All Scopes' },
  { value: 'ASSET', label: 'Asset' },
  { value: 'STRATEGY', label: 'Strategy' },
  { value: 'PORTFOLIO', label: 'Portfolio' },
];

export function LimitConfigPanel({
  limits,
  loading = false,
  onAddLimit,
  onEditLimit,
  onDeleteLimit,
}: LimitConfigPanelProps) {
  const [scopeFilter, setScopeFilter] = useState('');

  const filteredLimits = scopeFilter
    ? limits.filter((l) => l.scope === scopeFilter)
    : limits;

  const formatValue = (limit: PositionLimit) => {
    if (limit.limitType === 'PERCENTAGE') {
      return `${limit.maxValue}%`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(limit.maxValue);
  };

  const getUtilizationColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Position Limits</CardTitle>
          {onAddLimit && (
            <Button size="sm" onClick={onAddLimit}>
              Add Limit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter */}
        <div className="mb-6 w-48">
          <Select
            options={scopeOptions}
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
          />
        </div>

        {/* Limits List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredLimits.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {limits.length === 0
              ? 'No position limits configured.'
              : 'No limits match your filter.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLimits.map((limit) => (
              <div
                key={limit.limitId}
                className="p-4 border border-border rounded-lg"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={limitScopeVariant[limit.scope]}>{limit.scope}</Badge>
                      <span className="font-medium text-foreground">
                        {limit.assetId || limit.strategyId || 'Portfolio-wide'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {limit.limitType === 'PERCENTAGE' ? 'Percentage' : 'Absolute'} Limit: {formatValue(limit)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {onEditLimit && (
                      <Button variant="ghost" size="sm" onClick={() => onEditLimit(limit)}>
                        Edit
                      </Button>
                    )}
                    {onDeleteLimit && (
                      <Button variant="ghost" size="sm" onClick={() => onDeleteLimit(limit.limitId)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {/* Utilization Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Utilization</span>
                    <span className="font-medium">
                      {limit.utilizationPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getUtilizationColor(limit.utilizationPercent)} transition-all`}
                      style={{ width: `${Math.min(limit.utilizationPercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1 text-muted-foreground">
                    <span>Current: {formatValue({ ...limit, maxValue: limit.currentValue })}</span>
                    <span>Max: {formatValue(limit)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface LimitFormProps {
  limit?: PositionLimit;
  loading?: boolean;
  onSubmit: (data: LimitFormData) => void;
  onCancel: () => void;
}

export interface LimitFormData {
  scope: LimitScope;
  assetId?: string;
  strategyId?: string;
  limitType: LimitType;
  maxValue: number;
}

export function LimitForm({ limit, loading = false, onSubmit, onCancel }: LimitFormProps) {
  const isEditing = !!limit;
  const [scope, setScope] = useState<LimitScope>(limit?.scope || 'PORTFOLIO');
  const [assetId, setAssetId] = useState(limit?.assetId || '');
  const [strategyId, setStrategyId] = useState(limit?.strategyId || '');
  const [limitType, setLimitType] = useState<LimitType>(limit?.limitType || 'ABSOLUTE');
  const [maxValue, setMaxValue] = useState(limit?.maxValue || 0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (scope === 'ASSET' && !assetId.trim()) {
      newErrors.assetId = 'Asset ID is required for asset-level limits';
    }

    if (scope === 'STRATEGY' && !strategyId.trim()) {
      newErrors.strategyId = 'Strategy ID is required for strategy-level limits';
    }

    if (maxValue <= 0) {
      newErrors.maxValue = 'Max value must be greater than 0';
    }

    if (limitType === 'PERCENTAGE' && maxValue > 100) {
      newErrors.maxValue = 'Percentage cannot exceed 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({
        scope,
        assetId: scope === 'ASSET' ? assetId : undefined,
        strategyId: scope === 'STRATEGY' ? strategyId : undefined,
        limitType,
        maxValue,
      });
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Limit' : 'Add Position Limit'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Scope</label>
              <Select
                options={[
                  { value: 'PORTFOLIO', label: 'Portfolio' },
                  { value: 'STRATEGY', label: 'Strategy' },
                  { value: 'ASSET', label: 'Asset' },
                ]}
                value={scope}
                onChange={(e) => setScope(e.target.value as LimitScope)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Limit Type</label>
              <Select
                options={[
                  { value: 'ABSOLUTE', label: 'Absolute (USD)' },
                  { value: 'PERCENTAGE', label: 'Percentage' },
                ]}
                value={limitType}
                onChange={(e) => setLimitType(e.target.value as LimitType)}
              />
            </div>
          </div>

          {scope === 'ASSET' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Asset ID</label>
              <Input
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                placeholder="e.g., BTC, ETH"
                error={errors.assetId}
              />
              {errors.assetId && <p className="mt-1 text-sm text-red-600">{errors.assetId}</p>}
            </div>
          )}

          {scope === 'STRATEGY' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Strategy ID</label>
              <Input
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                placeholder="Strategy identifier"
                error={errors.strategyId}
              />
              {errors.strategyId && <p className="mt-1 text-sm text-red-600">{errors.strategyId}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Maximum Value {limitType === 'PERCENTAGE' ? '(%)' : '(USD)'}
            </label>
            <Input
              type="number"
              value={maxValue}
              onChange={(e) => setMaxValue(Number(e.target.value))}
              min={0}
              max={limitType === 'PERCENTAGE' ? 100 : undefined}
              error={errors.maxValue}
            />
            {errors.maxValue && <p className="mt-1 text-sm text-red-600">{errors.maxValue}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEditing ? 'Save Changes' : 'Add Limit'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
