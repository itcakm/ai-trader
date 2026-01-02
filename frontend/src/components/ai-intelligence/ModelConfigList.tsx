'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { ModelConfiguration } from '../../types/ai-intelligence';

export interface ModelConfigListProps {
  configs: ModelConfiguration[];
  loading?: boolean;
  onAddConfig?: () => void;
  onEditConfig?: (config: ModelConfiguration) => void;
  onDeleteConfig?: (configId: string) => void;
  onToggleEnabled?: (configId: string, enabled: boolean) => void;
}

export function ModelConfigList({
  configs,
  loading = false,
  onAddConfig,
  onEditConfig,
  onDeleteConfig,
  onToggleEnabled,
}: ModelConfigListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConfigs = configs.filter(
    (config) =>
      config.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      config.providerId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>AI Model Configurations</CardTitle>
          {onAddConfig && (
            <Button size="sm" onClick={onAddConfig}>
              Add Model
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Config List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredConfigs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {configs.length === 0
              ? 'No AI models configured. Add a model to get started.'
              : 'No models match your search.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredConfigs.map((config) => (
              <ModelConfigCard
                key={config.configId}
                config={config}
                onEdit={onEditConfig}
                onDelete={onDeleteConfig}
                onToggleEnabled={onToggleEnabled}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ModelConfigCardProps {
  config: ModelConfiguration;
  onEdit?: (config: ModelConfiguration) => void;
  onDelete?: (configId: string) => void;
  onToggleEnabled?: (configId: string, enabled: boolean) => void;
  formatCurrency: (value: number) => string;
  formatDate: (dateString: string) => string;
}

function ModelConfigCard({
  config,
  onEdit,
  onDelete,
  onToggleEnabled,
  formatCurrency,
  formatDate,
}: ModelConfigCardProps) {
  const dailyUsagePercent = (config.costLimits.currentDailyCostUsd / config.costLimits.maxDailyCostUsd) * 100;
  const monthlyUsagePercent = (config.costLimits.currentMonthlyCostUsd / config.costLimits.maxMonthlyCostUsd) * 100;

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-foreground">{config.modelName}</h4>
            <Badge variant={config.enabled ? 'success' : 'default'}>
              {config.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {config.providerId} • Priority: {config.priority}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onToggleEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleEnabled(config.configId, !config.enabled)}
            >
              {config.enabled ? 'Disable' : 'Enable'}
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(config)}>
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(config.configId)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Cost Usage */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Daily Cost</span>
            <span className="font-medium">
              {formatCurrency(config.costLimits.currentDailyCostUsd)} / {formatCurrency(config.costLimits.maxDailyCostUsd)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                dailyUsagePercent >= 90 ? 'bg-red-500' : dailyUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(dailyUsagePercent, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Monthly Cost</span>
            <span className="font-medium">
              {formatCurrency(config.costLimits.currentMonthlyCostUsd)} / {formatCurrency(config.costLimits.maxMonthlyCostUsd)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                monthlyUsagePercent >= 90 ? 'bg-red-500' : monthlyUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(monthlyUsagePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Rate Limits */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span>Rate Limits: {config.rateLimits.requestsPerMinute} req/min</span>
          <span>{config.rateLimits.tokensPerMinute.toLocaleString()} tokens/min</span>
          <span className="ml-auto">Updated {formatDate(config.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
