'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { FundAllocation, ModelAllocation, ModelConfiguration } from '../../types/ai-intelligence';

export interface AllocationManagerProps {
  allocation?: FundAllocation;
  models: ModelConfiguration[];
  strategyId: string;
  strategyName: string;
  loading?: boolean;
  onSave: (allocations: ModelAllocation[], ensembleMode: boolean) => void;
  onCancel: () => void;
}

const MIN_PERCENTAGE = 10;
const MAX_MODELS = 5;

export function AllocationManager({
  allocation,
  models,
  strategyId,
  strategyName,
  loading = false,
  onSave,
  onCancel,
}: AllocationManagerProps) {
  const [allocations, setAllocations] = useState<ModelAllocation[]>(
    allocation?.allocations || []
  );
  const [ensembleMode, setEnsembleMode] = useState(allocation?.ensembleMode ?? false);
  const [errors, setErrors] = useState<string[]>([]);

  const enabledModels = models.filter((m) => m.enabled);
  const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);

  const availableModels = enabledModels.filter(
    (m) => !allocations.some((a) => a.modelConfigId === m.configId)
  );

  const validateAllocations = (): boolean => {
    const newErrors: string[] = [];

    if (allocations.length === 0) {
      newErrors.push('At least one model must be allocated');
    }

    if (allocations.length > MAX_MODELS) {
      newErrors.push(`Maximum ${MAX_MODELS} models allowed`);
    }

    if (totalPercentage !== 100) {
      newErrors.push('Total allocation must equal 100%');
    }

    allocations.forEach((a) => {
      if (a.percentage < MIN_PERCENTAGE) {
        const model = models.find((m) => m.configId === a.modelConfigId);
        newErrors.push(`${model?.modelName || 'Model'} must have at least ${MIN_PERCENTAGE}%`);
      }
    });

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleAddModel = (modelConfigId: string) => {
    if (allocations.length >= MAX_MODELS) return;

    const remainingPercentage = 100 - totalPercentage;
    const newPercentage = Math.max(MIN_PERCENTAGE, remainingPercentage);

    setAllocations([
      ...allocations,
      {
        modelConfigId,
        percentage: newPercentage,
        priority: allocations.length + 1,
      },
    ]);
  };

  const handleRemoveModel = (modelConfigId: string) => {
    setAllocations(allocations.filter((a) => a.modelConfigId !== modelConfigId));
  };

  const handlePercentageChange = (modelConfigId: string, percentage: number) => {
    setAllocations(
      allocations.map((a) =>
        a.modelConfigId === modelConfigId ? { ...a, percentage } : a
      )
    );
  };

  const handlePriorityChange = (modelConfigId: string, priority: number) => {
    setAllocations(
      allocations.map((a) =>
        a.modelConfigId === modelConfigId ? { ...a, priority } : a
      )
    );
  };

  const handleDistributeEvenly = () => {
    if (allocations.length === 0) return;
    const evenPercentage = Math.floor(100 / allocations.length);
    const remainder = 100 - evenPercentage * allocations.length;

    setAllocations(
      allocations.map((a, i) => ({
        ...a,
        percentage: evenPercentage + (i === 0 ? remainder : 0),
      }))
    );
  };

  const handleSubmit = () => {
    if (validateAllocations()) {
      onSave(allocations, ensembleMode);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Allocation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure how trading capital is distributed across AI models for {strategyName}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ensemble Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div>
            <p className="font-medium text-foreground">Ensemble Mode</p>
            <p className="text-sm text-muted-foreground">
              When enabled, models vote on decisions weighted by allocation
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={ensembleMode}
              onChange={(e) => setEnsembleMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
          </label>
        </div>

        {/* Add Model */}
        {availableModels.length > 0 && allocations.length < MAX_MODELS && (
          <div className="flex items-center gap-4">
            <Select
              options={[
                { value: '', label: 'Add a model...' },
                ...availableModels.map((m) => ({ value: m.configId, label: m.modelName })),
              ]}
              value=""
              onChange={(e) => {
                if (e.target.value) handleAddModel(e.target.value);
              }}
            />
            <Button variant="outline" size="sm" onClick={handleDistributeEvenly}>
              Distribute Evenly
            </Button>
          </div>
        )}

        {/* Allocation List */}
        {allocations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No models allocated. Add a model to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {allocations.map((alloc) => {
              const model = models.find((m) => m.configId === alloc.modelConfigId);
              return (
                <AllocationRow
                  key={alloc.modelConfigId}
                  allocation={alloc}
                  modelName={model?.modelName || 'Unknown Model'}
                  providerName={model?.providerId || ''}
                  onPercentageChange={(p) => handlePercentageChange(alloc.modelConfigId, p)}
                  onPriorityChange={(p) => handlePriorityChange(alloc.modelConfigId, p)}
                  onRemove={() => handleRemoveModel(alloc.modelConfigId)}
                />
              );
            })}
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between p-4 border border-border rounded-lg">
          <span className="font-medium text-foreground">Total Allocation</span>
          <span
            className={`text-xl font-semibold ${
              totalPercentage === 100
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {totalPercentage}%
          </span>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-1">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          Save Allocation
        </Button>
      </CardFooter>
    </Card>
  );
}

interface AllocationRowProps {
  allocation: ModelAllocation;
  modelName: string;
  providerName: string;
  onPercentageChange: (percentage: number) => void;
  onPriorityChange: (priority: number) => void;
  onRemove: () => void;
}

function AllocationRow({
  allocation,
  modelName,
  providerName,
  onPercentageChange,
  onPriorityChange,
  onRemove,
}: AllocationRowProps) {
  return (
    <div className="flex items-center gap-4 p-4 border border-border rounded-lg">
      <div className="flex-1">
        <p className="font-medium text-foreground">{modelName}</p>
        <p className="text-sm text-muted-foreground">{providerName}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-24">
          <label className="block text-xs text-muted-foreground mb-1">Allocation %</label>
          <Input
            type="number"
            value={allocation.percentage}
            onChange={(e) => onPercentageChange(Number(e.target.value))}
            min={MIN_PERCENTAGE}
            max={100}
          />
        </div>
        <div className="w-20">
          <label className="block text-xs text-muted-foreground mb-1">Priority</label>
          <Input
            type="number"
            value={allocation.priority}
            onChange={(e) => onPriorityChange(Number(e.target.value))}
            min={1}
            max={10}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}
