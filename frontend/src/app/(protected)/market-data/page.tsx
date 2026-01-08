'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Tab = 'feeds' | 'quality' | 'sources';

const mockFeeds = [
  { id: '1', name: 'BTC/USDT', exchange: 'Binance', status: 'active', latency: '12ms', updates: '1.2k/s' },
  { id: '2', name: 'ETH/USDT', exchange: 'Binance', status: 'active', latency: '15ms', updates: '980/s' },
  { id: '3', name: 'SOL/USDT', exchange: 'Coinbase', status: 'delayed', latency: '45ms', updates: '450/s' },
];

const mockSources = [
  { id: '1', name: 'Binance WebSocket', type: 'WebSocket', status: 'connected', pairs: 150 },
  { id: '2', name: 'Coinbase REST', type: 'REST API', status: 'connected', pairs: 85 },
  { id: '3', name: 'Kraken Feed', type: 'WebSocket', status: 'disconnected', pairs: 0 },
];

export default function MarketDataPage() {
  const [activeTab, setActiveTab] = useState<Tab>('feeds');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'feeds', label: 'Data Feeds' },
    { id: 'quality', label: 'Quality Monitoring' },
    { id: 'sources', label: 'Data Sources' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Market Data</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor and configure market data feeds</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'feeds' && (
          <Card>
            <CardHeader>
              <CardTitle>Active Data Feeds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockFeeds.map((feed) => (
                  <div key={feed.id} className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700">
                    <div>
                      <h3 className="font-medium">{feed.name}</h3>
                      <p className="text-sm text-gray-500">{feed.exchange}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Latency</p>
                        <p className="font-medium">{feed.latency}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Updates</p>
                        <p className="font-medium">{feed.updates}</p>
                      </div>
                      <Badge variant={feed.status === 'active' ? 'success' : 'warning'}>
                        {feed.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        
        {activeTab === 'quality' && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Data Quality Score</p>
                <p className="text-3xl font-bold text-green-600">98.5%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Avg Latency</p>
                <p className="text-3xl font-bold">24ms</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Uptime (24h)</p>
                <p className="text-3xl font-bold text-green-600">99.9%</p>
              </CardContent>
            </Card>
          </div>
        )}
        
        {activeTab === 'sources' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Data Sources</CardTitle>
                <Button>Add Source</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockSources.map((source) => (
                  <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700">
                    <div>
                      <h3 className="font-medium">{source.name}</h3>
                      <p className="text-sm text-gray-500">{source.type}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">{source.pairs} pairs</span>
                      <Badge variant={source.status === 'connected' ? 'success' : 'error'}>
                        {source.status}
                      </Badge>
                      <Button variant="outline" size="sm">Configure</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
