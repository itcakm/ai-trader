'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  DataSource,
  DataSourceType,
  DataSourceStatus,
  AuthMethod,
  RateLimitConfig,
  dataSourceStatusVariant,
} from '../../types/market-data';

export interface DataSourceConfigProps {
  sources: DataSource[];
  loading?: boolean;
  onAddSource?: () => void;
  onEditSource?: (source: DataSource) => void;
  onDeleteSource?: (sourceId: string) => void;
  onToggleStatus?: (sourceId: string, status: DataSourceStatus) => void;
}

export function DataSourceConfig({
  sources,
  loading = false,
  onAddSource,
  onEditSource,
  onDeleteSource,
  onToggleStatus,
}: DataSourceConfigProps) {
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

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
          <CardTitle>Data Sources</CardTitle>
          {onAddSource && (
            <Button size="sm" onClick={onAddSource}>
              Add Source
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No data sources configured. Add a source to start receiving market data.
          </div>
        ) : (
          <div className="space-y-4">
            {sources.map((source) => (
              <DataSourceCard
                key={source.sourceId}
                source={source}
                expanded={expandedSource === source.sourceId}
                onToggleExpand={() =>
                  setExpandedSource(
                    expandedSource === source.sourceId ? null : source.sourceId
                  )
                }
                onEdit={onEditSource}
                onDelete={onDeleteSource}
                onToggleStatus={onToggleStatus}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DataSourceCardProps {
  source: DataSource;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit?: (source: DataSource) => void;
  onDelete?: (sourceId: string) => void;
  onToggleStatus?: (sourceId: string, status: DataSourceStatus) => void;
  formatDate: (dateString: string) => string;
}

function DataSourceCard({
  source,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleStatus,
  formatDate,
}: DataSourceCardProps) {
  const isActive = source.status === 'ACTIVE';

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              source.status === 'ACTIVE'
                ? 'bg-green-500'
                : source.status === 'ERROR'
                ? 'bg-red-500'
                : source.status === 'RATE_LIMITED'
                ? 'bg-yellow-500'
                : 'bg-gray-400'
            }`}
          />
          <div>
            <h4 className="font-medium text-foreground">{source.name}</h4>
            <p className="text-sm text-muted-foreground">{source.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={dataSourceStatusVariant[source.status]}>{source.status}</Badge>
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

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-border p-4 bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">API Endpoint</p>
              <p className="text-sm font-mono truncate">{source.apiEndpoint}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Auth Method</p>
              <p className="text-sm">{source.authMethod}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Priority</p>
              <p className="text-sm">{source.priority}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cost/Request</p>
              <p className="text-sm">{source.costPerRequest ? `$${source.costPerRequest}` : 'Free'}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Rate Limits</p>
            <div className="flex gap-4 text-sm">
              <span>{source.rateLimits.requestsPerSecond}/sec</span>
              <span>{source.rateLimits.requestsPerMinute}/min</span>
              <span>{source.rateLimits.requestsPerDay}/day</span>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Supported Symbols</p>
            <div className="flex flex-wrap gap-2">
              {source.supportedSymbols.slice(0, 10).map((symbol) => (
                <Badge key={symbol} variant="default">{symbol}</Badge>
              ))}
              {source.supportedSymbols.length > 10 && (
                <Badge variant="default">+{source.supportedSymbols.length - 10} more</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Created {formatDate(source.createdAt)} • Updated {formatDate(source.updatedAt)}
            </p>
            <div className="flex items-center gap-2">
              {onToggleStatus && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStatus(source.sourceId, isActive ? 'INACTIVE' : 'ACTIVE');
                  }}
                >
                  {isActive ? 'Disable' : 'Enable'}
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(source);
                  }}
                >
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(source.sourceId);
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
