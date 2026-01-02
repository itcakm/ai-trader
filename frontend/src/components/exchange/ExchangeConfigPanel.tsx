'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { ExchangeConfig, ExchangeStatus, exchangeStatusVariant } from '../../types/exchange';

export interface ExchangeConfigPanelProps {
  exchanges: ExchangeConfig[];
  loading?: boolean;
  onAddExchange?: () => void;
  onEditExchange?: (exchange: ExchangeConfig) => void;
  onDeleteExchange?: (exchangeId: string) => void;
  onToggleStatus?: (exchangeId: string, status: ExchangeStatus) => void;
  onTestConnection?: (exchangeId: string) => void;
}

export function ExchangeConfigPanel({
  exchanges,
  loading = false,
  onAddExchange,
  onEditExchange,
  onDeleteExchange,
  onToggleStatus,
  onTestConnection,
}: ExchangeConfigPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedExchange, setExpandedExchange] = useState<string | null>(null);

  const filteredExchanges = exchanges.filter(
    (ex) =>
      ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.exchangeId.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <CardTitle>Exchange Connections</CardTitle>
          {onAddExchange && (
            <Button size="sm" onClick={onAddExchange}>
              Add Exchange
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Search exchanges..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Exchange List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredExchanges.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {exchanges.length === 0
              ? 'No exchanges configured. Add an exchange to start trading.'
              : 'No exchanges match your search.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredExchanges.map((exchange) => (
              <ExchangeCard
                key={exchange.exchangeId}
                exchange={exchange}
                expanded={expandedExchange === exchange.exchangeId}
                onToggleExpand={() =>
                  setExpandedExchange(
                    expandedExchange === exchange.exchangeId ? null : exchange.exchangeId
                  )
                }
                onEdit={onEditExchange}
                onDelete={onDeleteExchange}
                onToggleStatus={onToggleStatus}
                onTestConnection={onTestConnection}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ExchangeCardProps {
  exchange: ExchangeConfig;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit?: (exchange: ExchangeConfig) => void;
  onDelete?: (exchangeId: string) => void;
  onToggleStatus?: (exchangeId: string, status: ExchangeStatus) => void;
  onTestConnection?: (exchangeId: string) => void;
  formatDate: (dateString: string) => string;
}

function ExchangeCard({
  exchange,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleStatus,
  onTestConnection,
  formatDate,
}: ExchangeCardProps) {
  const isActive = exchange.status === 'ACTIVE';

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              exchange.status === 'ACTIVE'
                ? 'bg-green-500'
                : exchange.status === 'ERROR'
                ? 'bg-red-500'
                : exchange.status === 'MAINTENANCE'
                ? 'bg-yellow-500'
                : 'bg-gray-400'
            }`}
          />
          <div>
            <h4 className="font-medium text-foreground">{exchange.name}</h4>
            <p className="text-sm text-muted-foreground">
              {exchange.exchangeId} • {exchange.mode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={exchangeStatusVariant[exchange.status]}>{exchange.status}</Badge>
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
          {/* Connection Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">REST Endpoint</p>
              <p className="text-sm font-mono truncate">{exchange.restEndpoint}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">WebSocket</p>
              <p className="text-sm font-mono truncate">{exchange.wsEndpoint || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Auth Method</p>
              <p className="text-sm">{exchange.authMethod}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Priority</p>
              <p className="text-sm">{exchange.priority}</p>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Rate Limits</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>{exchange.rateLimits.ordersPerSecond} orders/sec</span>
              <span>{exchange.rateLimits.ordersPerMinute} orders/min</span>
              <span>{exchange.rateLimits.queriesPerSecond} queries/sec</span>
            </div>
          </div>

          {/* Features */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Supported Features</p>
            <div className="flex flex-wrap gap-2">
              {exchange.supportedFeatures.supportsWebSocket && (
                <Badge variant="info">WebSocket</Badge>
              )}
              {exchange.supportedFeatures.supportsFIX && (
                <Badge variant="info">FIX</Badge>
              )}
              {exchange.supportedFeatures.supportsOrderModification && (
                <Badge variant="info">Order Modification</Badge>
              )}
              {exchange.supportedFeatures.supportedOrderTypes.map((type) => (
                <Badge key={type} variant="default">{type}</Badge>
              ))}
            </div>
          </div>

          {/* Supported Assets */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Supported Assets</p>
            <div className="flex flex-wrap gap-2">
              {exchange.supportedFeatures.supportedAssets.slice(0, 10).map((asset) => (
                <Badge key={asset} variant="default">{asset}</Badge>
              ))}
              {exchange.supportedFeatures.supportedAssets.length > 10 && (
                <Badge variant="default">
                  +{exchange.supportedFeatures.supportedAssets.length - 10} more
                </Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Created {formatDate(exchange.createdAt)} • Updated {formatDate(exchange.updatedAt)}
            </p>
            <div className="flex items-center gap-2">
              {onTestConnection && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTestConnection(exchange.exchangeId);
                  }}
                >
                  Test Connection
                </Button>
              )}
              {onToggleStatus && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStatus(exchange.exchangeId, isActive ? 'INACTIVE' : 'ACTIVE');
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
                    onEdit(exchange);
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
                    onDelete(exchange.exchangeId);
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
