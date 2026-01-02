'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Strategy, StrategyState, strategyStateVariant } from '../../types/strategy';

export interface StrategyListProps {
  strategies: Strategy[];
  loading?: boolean;
  onCreateNew?: () => void;
  onEdit?: (strategy: Strategy) => void;
  onDeploy?: (strategy: Strategy) => void;
  onViewDetails?: (strategy: Strategy) => void;
  onStateChange?: (strategyId: string, newState: StrategyState) => void;
}

const stateOptions = [
  { value: '', label: 'All States' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'STOPPED', label: 'Stopped' },
  { value: 'ERROR', label: 'Error' },
];

export function StrategyList({
  strategies,
  loading = false,
  onCreateNew,
  onEdit,
  onDeploy,
  onViewDetails,
  onStateChange,
}: StrategyListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  const filteredStrategies = useMemo(() => {
    return strategies.filter((strategy) => {
      const matchesSearch = strategy.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesState = !stateFilter || strategy.state === stateFilter;
      return matchesSearch && matchesState;
    });
  }, [strategies, searchTerm, stateFilter]);

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
          <CardTitle>Strategies</CardTitle>
          {onCreateNew && (
            <Button onClick={onCreateNew} size="sm">
              Create Strategy
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search strategies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              options={stateOptions}
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Strategy List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredStrategies.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {strategies.length === 0
              ? 'No strategies yet. Create your first strategy to get started.'
              : 'No strategies match your filters.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredStrategies.map((strategy) => (
              <StrategyListItem
                key={strategy.strategyId}
                strategy={strategy}
                onEdit={onEdit}
                onDeploy={onDeploy}
                onViewDetails={onViewDetails}
                onStateChange={onStateChange}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


interface StrategyListItemProps {
  strategy: Strategy;
  onEdit?: (strategy: Strategy) => void;
  onDeploy?: (strategy: Strategy) => void;
  onViewDetails?: (strategy: Strategy) => void;
  onStateChange?: (strategyId: string, newState: StrategyState) => void;
  formatDate: (dateString: string) => string;
}

function StrategyListItem({
  strategy,
  onEdit,
  onDeploy,
  onViewDetails,
  onStateChange,
  formatDate,
}: StrategyListItemProps) {
  const canDeploy = strategy.state === 'DRAFT' || strategy.state === 'STOPPED';
  const canPause = strategy.state === 'ACTIVE';
  const canResume = strategy.state === 'PAUSED';
  const canStop = strategy.state === 'ACTIVE' || strategy.state === 'PAUSED';

  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h4 className="font-medium text-foreground">{strategy.name}</h4>
          <Badge variant={strategyStateVariant[strategy.state]}>{strategy.state}</Badge>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Version {strategy.currentVersion} • Updated {formatDate(strategy.updatedAt)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onStateChange && (
          <>
            {canPause && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStateChange(strategy.strategyId, 'PAUSED')}
              >
                Pause
              </Button>
            )}
            {canResume && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStateChange(strategy.strategyId, 'ACTIVE')}
              >
                Resume
              </Button>
            )}
            {canStop && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStateChange(strategy.strategyId, 'STOPPED')}
              >
                Stop
              </Button>
            )}
          </>
        )}
        {onDeploy && canDeploy && (
          <Button variant="outline" size="sm" onClick={() => onDeploy(strategy)}>
            Deploy
          </Button>
        )}
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={() => onEdit(strategy)}>
            Edit
          </Button>
        )}
        {onViewDetails && (
          <Button variant="ghost" size="sm" onClick={() => onViewDetails(strategy)}>
            View
          </Button>
        )}
      </div>
    </div>
  );
}
