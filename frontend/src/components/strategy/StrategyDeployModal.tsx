'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Strategy, StrategyDeployment } from '../../types/strategy';

export interface StrategyDeployModalProps {
  strategy: Strategy;
  loading?: boolean;
  onDeploy: (deployment: Omit<StrategyDeployment, 'deployedAt' | 'deployedBy'>) => void;
  onCancel: () => void;
}

const environmentOptions = [
  { value: 'paper', label: 'Paper Trading (Simulated)' },
  { value: 'live', label: 'Live Trading (Real Funds)' },
];

export function StrategyDeployModal({
  strategy,
  loading = false,
  onDeploy,
  onCancel,
}: StrategyDeployModalProps) {
  const [environment, setEnvironment] = useState<'paper' | 'live'>('paper');
  const [allocatedCapital, setAllocatedCapital] = useState(10000);
  const [maxPositionSize, setMaxPositionSize] = useState(1000);
  const [riskLimit, setRiskLimit] = useState(5);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmLive, setConfirmLive] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (allocatedCapital <= 0) {
      newErrors.allocatedCapital = 'Capital must be greater than 0';
    }

    if (maxPositionSize <= 0) {
      newErrors.maxPositionSize = 'Position size must be greater than 0';
    }

    if (maxPositionSize > allocatedCapital) {
      newErrors.maxPositionSize = 'Position size cannot exceed allocated capital';
    }

    if (riskLimit <= 0 || riskLimit > 100) {
      newErrors.riskLimit = 'Risk limit must be between 0 and 100';
    }

    if (environment === 'live' && !confirmLive) {
      newErrors.confirmLive = 'Please confirm live trading deployment';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onDeploy({
        strategyId: strategy.strategyId,
        environment,
        allocatedCapital,
        maxPositionSize,
        riskLimit,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Deploy Strategy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium text-foreground">{strategy.name}</p>
              <p className="text-xs text-muted-foreground">Version {strategy.currentVersion}</p>
            </div>

            {/* Environment */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Environment
              </label>
              <Select
                options={environmentOptions}
                value={environment}
                onChange={(e) => {
                  setEnvironment(e.target.value as 'paper' | 'live');
                  setConfirmLive(false);
                }}
              />
            </div>

            {/* Allocated Capital */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Allocated Capital (USD)
              </label>
              <Input
                type="number"
                value={allocatedCapital}
                onChange={(e) => setAllocatedCapital(Number(e.target.value))}
                min={0}
                error={errors.allocatedCapital}
              />
              {errors.allocatedCapital && (
                <p className="mt-1 text-sm text-red-600">{errors.allocatedCapital}</p>
              )}
            </div>

            {/* Max Position Size */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Max Position Size (USD)
              </label>
              <Input
                type="number"
                value={maxPositionSize}
                onChange={(e) => setMaxPositionSize(Number(e.target.value))}
                min={0}
                error={errors.maxPositionSize}
              />
              {errors.maxPositionSize && (
                <p className="mt-1 text-sm text-red-600">{errors.maxPositionSize}</p>
              )}
            </div>

            {/* Risk Limit */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Risk Limit (%)
              </label>
              <Input
                type="number"
                value={riskLimit}
                onChange={(e) => setRiskLimit(Number(e.target.value))}
                min={0}
                max={100}
                error={errors.riskLimit}
              />
              {errors.riskLimit && (
                <p className="mt-1 text-sm text-red-600">{errors.riskLimit}</p>
              )}
            </div>

            {/* Live Trading Warning */}
            {environment === 'live' && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                  ⚠️ Live Trading Warning
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-3">
                  You are about to deploy this strategy with real funds. Ensure you have
                  thoroughly tested the strategy in paper trading mode first.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmLive}
                    onChange={(e) => setConfirmLive(e.target.checked)}
                    className="w-4 h-4 rounded border-yellow-400 text-yellow-600 focus:ring-yellow-500"
                  />
                  <span className="text-sm text-yellow-800 dark:text-yellow-200">
                    I understand the risks and want to proceed
                  </span>
                </label>
                {errors.confirmLive && (
                  <p className="mt-1 text-sm text-red-600">{errors.confirmLive}</p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              variant={environment === 'live' ? 'destructive' : 'primary'}
            >
              {environment === 'live' ? 'Deploy to Live' : 'Deploy to Paper'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
