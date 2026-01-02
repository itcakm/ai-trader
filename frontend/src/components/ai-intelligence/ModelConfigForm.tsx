'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { ModelConfiguration, AIProvider, CostLimits, RateLimitConfig } from '../../types/ai-intelligence';

export interface ModelConfigFormProps {
  config?: ModelConfiguration;
  providers: AIProvider[];
  loading?: boolean;
  onSubmit: (data: ModelConfigFormData) => void;
  onCancel: () => void;
}

export interface ModelConfigFormData {
  providerId: string;
  modelId: string;
  modelName: string;
  enabled: boolean;
  apiKey: string;
  costLimits: CostLimits;
  rateLimits: RateLimitConfig;
  priority: number;
}

export function ModelConfigForm({
  config,
  providers,
  loading = false,
  onSubmit,
  onCancel,
}: ModelConfigFormProps) {
  const isEditing = !!config;
  const [providerId, setProviderId] = useState(config?.providerId || '');
  const [modelId, setModelId] = useState(config?.modelId || '');
  const [modelName, setModelName] = useState(config?.modelName || '');
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [apiKey, setApiKey] = useState('');
  const [maxDailyCost, setMaxDailyCost] = useState(config?.costLimits.maxDailyCostUsd || 100);
  const [maxMonthlyCost, setMaxMonthlyCost] = useState(config?.costLimits.maxMonthlyCostUsd || 1000);
  const [requestsPerMinute, setRequestsPerMinute] = useState(config?.rateLimits.requestsPerMinute || 60);
  const [tokensPerMinute, setTokensPerMinute] = useState(config?.rateLimits.tokensPerMinute || 100000);
  const [priority, setPriority] = useState(config?.priority || 5);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedProvider = providers.find((p) => p.providerId === providerId);
  const selectedModel = selectedProvider?.models.find((m) => m.modelId === modelId);

  const providerOptions = [
    { value: '', label: 'Select provider...' },
    ...providers.map((p) => ({ value: p.providerId, label: p.name })),
  ];

  const modelOptions = selectedProvider
    ? [
        { value: '', label: 'Select model...' },
        ...selectedProvider.models.map((m) => ({ value: m.modelId, label: m.name })),
      ]
    : [{ value: '', label: 'Select provider first' }];

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!providerId) {
      newErrors.providerId = 'Provider is required';
    }

    if (!modelId) {
      newErrors.modelId = 'Model is required';
    }

    if (!isEditing && !apiKey.trim()) {
      newErrors.apiKey = 'API key is required';
    }

    if (maxDailyCost <= 0) {
      newErrors.maxDailyCost = 'Must be greater than 0';
    }

    if (maxMonthlyCost <= 0) {
      newErrors.maxMonthlyCost = 'Must be greater than 0';
    }

    if (maxMonthlyCost < maxDailyCost) {
      newErrors.maxMonthlyCost = 'Monthly limit must be >= daily limit';
    }

    if (requestsPerMinute <= 0) {
      newErrors.requestsPerMinute = 'Must be greater than 0';
    }

    if (tokensPerMinute <= 0) {
      newErrors.tokensPerMinute = 'Must be greater than 0';
    }

    if (priority < 1 || priority > 10) {
      newErrors.priority = 'Priority must be between 1 and 10';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({
        providerId,
        modelId,
        modelName: modelName || selectedModel?.name || modelId,
        enabled,
        apiKey,
        costLimits: {
          maxDailyCostUsd: maxDailyCost,
          maxMonthlyCostUsd: maxMonthlyCost,
          currentDailyCostUsd: config?.costLimits.currentDailyCostUsd || 0,
          currentMonthlyCostUsd: config?.costLimits.currentMonthlyCostUsd || 0,
          lastResetDate: config?.costLimits.lastResetDate || new Date().toISOString(),
        },
        rateLimits: {
          requestsPerMinute,
          tokensPerMinute,
        },
        priority,
      });
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Model Configuration' : 'Add AI Model'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider and Model */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Provider</label>
              <Select
                options={providerOptions}
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  setModelId('');
                }}
                disabled={isEditing}
              />
              {errors.providerId && <p className="mt-1 text-sm text-red-600">{errors.providerId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Model</label>
              <Select
                options={modelOptions}
                value={modelId}
                onChange={(e) => {
                  setModelId(e.target.value);
                  const model = selectedProvider?.models.find((m) => m.modelId === e.target.value);
                  if (model) setModelName(model.name);
                }}
                disabled={isEditing || !providerId}
              />
              {errors.modelId && <p className="mt-1 text-sm text-red-600">{errors.modelId}</p>}
            </div>
          </div>

          {/* Model Info */}
          {selectedModel && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-foreground mb-2">{selectedModel.description}</p>
              <div className="flex flex-wrap gap-2">
                {selectedModel.capabilities.map((cap) => (
                  <span key={cap} className="px-2 py-1 bg-background text-xs rounded">
                    {cap}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Cost: ${selectedModel.costPer1kTokens.toFixed(4)} per 1K tokens
              </p>
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Display Name</label>
            <Input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Custom display name (optional)"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              API Key {isEditing && '(leave blank to keep existing)'}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEditing ? '••••••••••••••••' : 'Enter API key'}
              error={errors.apiKey}
            />
            {errors.apiKey && <p className="mt-1 text-sm text-red-600">{errors.apiKey}</p>}
          </div>

          {/* Cost Limits */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Cost Limits (USD)</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Daily Maximum</label>
                <Input
                  type="number"
                  value={maxDailyCost}
                  onChange={(e) => setMaxDailyCost(Number(e.target.value))}
                  min={0}
                  step={10}
                  error={errors.maxDailyCost}
                />
                {errors.maxDailyCost && <p className="mt-1 text-sm text-red-600">{errors.maxDailyCost}</p>}
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Monthly Maximum</label>
                <Input
                  type="number"
                  value={maxMonthlyCost}
                  onChange={(e) => setMaxMonthlyCost(Number(e.target.value))}
                  min={0}
                  step={100}
                  error={errors.maxMonthlyCost}
                />
                {errors.maxMonthlyCost && <p className="mt-1 text-sm text-red-600">{errors.maxMonthlyCost}</p>}
              </div>
            </div>
          </div>

          {/* Rate Limits */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Rate Limits</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Requests/Minute</label>
                <Input
                  type="number"
                  value={requestsPerMinute}
                  onChange={(e) => setRequestsPerMinute(Number(e.target.value))}
                  min={1}
                  error={errors.requestsPerMinute}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Tokens/Minute</label>
                <Input
                  type="number"
                  value={tokensPerMinute}
                  onChange={(e) => setTokensPerMinute(Number(e.target.value))}
                  min={1}
                  error={errors.tokensPerMinute}
                />
              </div>
            </div>
          </div>

          {/* Priority and Enabled */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Priority (1-10)</label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={1}
                max={10}
                error={errors.priority}
              />
              <p className="mt-1 text-xs text-muted-foreground">Higher priority models are preferred</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-foreground">Enabled</span>
              </label>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEditing ? 'Save Changes' : 'Add Model'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
