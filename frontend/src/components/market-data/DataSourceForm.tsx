'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { DataSource, DataSourceType, AuthMethod, RateLimitConfig } from '../../types/market-data';

export interface DataSourceFormProps {
  source?: DataSource;
  loading?: boolean;
  onSubmit: (data: DataSourceFormData) => void;
  onCancel: () => void;
}

export interface DataSourceFormData {
  name: string;
  type: DataSourceType;
  apiEndpoint: string;
  authMethod: AuthMethod;
  supportedSymbols: string[];
  rateLimits: RateLimitConfig;
  priority: number;
  costPerRequest?: number;
}

const typeOptions = [
  { value: 'PRICE', label: 'Price Data' },
  { value: 'NEWS', label: 'News' },
  { value: 'SENTIMENT', label: 'Sentiment' },
  { value: 'ON_CHAIN', label: 'On-Chain Data' },
];

const authOptions = [
  { value: 'API_KEY', label: 'API Key' },
  { value: 'OAUTH', label: 'OAuth' },
  { value: 'HMAC', label: 'HMAC Signature' },
];

export function DataSourceForm({
  source,
  loading = false,
  onSubmit,
  onCancel,
}: DataSourceFormProps) {
  const isEditing = !!source;
  const [name, setName] = useState(source?.name || '');
  const [type, setType] = useState<DataSourceType>(source?.type || 'PRICE');
  const [apiEndpoint, setApiEndpoint] = useState(source?.apiEndpoint || '');
  const [authMethod, setAuthMethod] = useState<AuthMethod>(source?.authMethod || 'API_KEY');
  const [symbolsInput, setSymbolsInput] = useState(source?.supportedSymbols.join(', ') || '');
  const [requestsPerSecond, setRequestsPerSecond] = useState(source?.rateLimits.requestsPerSecond || 10);
  const [requestsPerMinute, setRequestsPerMinute] = useState(source?.rateLimits.requestsPerMinute || 100);
  const [requestsPerDay, setRequestsPerDay] = useState(source?.rateLimits.requestsPerDay || 10000);
  const [priority, setPriority] = useState(source?.priority || 1);
  const [costPerRequest, setCostPerRequest] = useState(source?.costPerRequest || 0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!apiEndpoint.trim()) {
      newErrors.apiEndpoint = 'API endpoint is required';
    } else if (!apiEndpoint.startsWith('http://') && !apiEndpoint.startsWith('https://')) {
      newErrors.apiEndpoint = 'API endpoint must be a valid URL';
    }

    if (!symbolsInput.trim()) {
      newErrors.symbols = 'At least one symbol is required';
    }

    if (requestsPerSecond <= 0) {
      newErrors.requestsPerSecond = 'Must be greater than 0';
    }

    if (requestsPerMinute <= 0) {
      newErrors.requestsPerMinute = 'Must be greater than 0';
    }

    if (requestsPerDay <= 0) {
      newErrors.requestsPerDay = 'Must be greater than 0';
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
      const supportedSymbols = symbolsInput
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);

      onSubmit({
        name,
        type,
        apiEndpoint,
        authMethod,
        supportedSymbols,
        rateLimits: {
          requestsPerSecond,
          requestsPerMinute,
          requestsPerDay,
        },
        priority,
        costPerRequest: costPerRequest > 0 ? costPerRequest : undefined,
      });
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Data Source' : 'Add Data Source'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Binance Price Feed"
                error={errors.name}
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <Select
                options={typeOptions}
                value={type}
                onChange={(e) => setType(e.target.value as DataSourceType)}
              />
            </div>
          </div>

          {/* API Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">API Endpoint</label>
              <Input
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="https://api.example.com/v1"
                error={errors.apiEndpoint}
              />
              {errors.apiEndpoint && <p className="mt-1 text-sm text-red-600">{errors.apiEndpoint}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Auth Method</label>
              <Select
                options={authOptions}
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
              />
            </div>
          </div>

          {/* Symbols */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Supported Symbols</label>
            <Input
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              placeholder="BTC, ETH, SOL, AVAX"
              error={errors.symbols}
            />
            <p className="mt-1 text-xs text-muted-foreground">Comma-separated list of symbols</p>
            {errors.symbols && <p className="mt-1 text-sm text-red-600">{errors.symbols}</p>}
          </div>

          {/* Rate Limits */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Rate Limits</label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Per Second</label>
                <Input
                  type="number"
                  value={requestsPerSecond}
                  onChange={(e) => setRequestsPerSecond(Number(e.target.value))}
                  min={1}
                  error={errors.requestsPerSecond}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Per Minute</label>
                <Input
                  type="number"
                  value={requestsPerMinute}
                  onChange={(e) => setRequestsPerMinute(Number(e.target.value))}
                  min={1}
                  error={errors.requestsPerMinute}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Per Day</label>
                <Input
                  type="number"
                  value={requestsPerDay}
                  onChange={(e) => setRequestsPerDay(Number(e.target.value))}
                  min={1}
                  error={errors.requestsPerDay}
                />
              </div>
            </div>
          </div>

          {/* Priority and Cost */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <p className="mt-1 text-xs text-muted-foreground">Higher priority sources are preferred</p>
              {errors.priority && <p className="mt-1 text-sm text-red-600">{errors.priority}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Cost per Request ($)</label>
              <Input
                type="number"
                value={costPerRequest}
                onChange={(e) => setCostPerRequest(Number(e.target.value))}
                min={0}
                step={0.0001}
              />
              <p className="mt-1 text-xs text-muted-foreground">Leave 0 for free sources</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEditing ? 'Save Changes' : 'Add Source'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
