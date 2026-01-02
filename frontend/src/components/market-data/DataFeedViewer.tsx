'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { DataFeedEntry, DataSourceType } from '../../types/market-data';

export interface DataFeedViewerProps {
  feeds: DataFeedEntry[];
  loading?: boolean;
  onRefresh?: () => void;
  onSelectFeed?: (feed: DataFeedEntry) => void;
  autoRefreshInterval?: number;
}

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'PRICE', label: 'Price' },
  { value: 'NEWS', label: 'News' },
  { value: 'SENTIMENT', label: 'Sentiment' },
  { value: 'ON_CHAIN', label: 'On-Chain' },
];

export function DataFeedViewer({
  feeds,
  loading = false,
  onRefresh,
  onSelectFeed,
}: DataFeedViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const filteredFeeds = useMemo(() => {
    return feeds.filter((feed) => {
      const matchesSearch =
        feed.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        feed.source.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = !typeFilter || feed.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [feeds, searchTerm, typeFilter]);

  const formatPrice = (price?: number) => {
    if (price === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(price);
  };

  const formatChange = (change?: number, changePercent?: number) => {
    if (change === undefined || changePercent === undefined) return '-';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
  };

  const formatVolume = (volume?: number) => {
    if (volume === undefined) return '-';
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
    return volume.toFixed(2);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Live Data Feeds</CardTitle>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} loading={loading}>
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search by symbol or source..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              options={typeOptions}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Feed Table */}
        {loading && feeds.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredFeeds.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {feeds.length === 0
              ? 'No data feeds available.'
              : 'No feeds match your filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Symbol</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Source</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Price</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Change</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Volume</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeeds.map((feed) => (
                  <tr
                    key={feed.id}
                    className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onSelectFeed?.(feed)}
                  >
                    <td className="py-3 px-4 font-medium text-foreground">{feed.symbol}</td>
                    <td className="py-3 px-4 text-muted-foreground">{feed.source}</td>
                    <td className="py-3 px-4">
                      <Badge variant="info">{feed.type}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatPrice(feed.price)}</td>
                    <td className={`py-3 px-4 text-right font-mono ${
                      feed.change !== undefined
                        ? feed.change >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                        : ''
                    }`}>
                      {formatChange(feed.change, feed.changePercent)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatVolume(feed.volume)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground text-sm">
                      {formatTime(feed.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
