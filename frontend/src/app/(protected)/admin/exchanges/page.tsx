'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

// Simplified mock data for display
const mockExchanges = [
  {
    id: 'exc-1',
    name: 'Binance',
    status: 'ACTIVE' as const,
    pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    lastConnected: new Date().toISOString(),
  },
  {
    id: 'exc-2',
    name: 'Coinbase Pro',
    status: 'INACTIVE' as const,
    pairs: ['BTC/USD', 'ETH/USD'],
    lastConnected: null,
  },
  {
    id: 'exc-3',
    name: 'Kraken',
    status: 'MAINTENANCE' as const,
    pairs: ['BTC/EUR', 'ETH/EUR'],
    lastConnected: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

const statusColors = {
  ACTIVE: 'success',
  INACTIVE: 'default',
  MAINTENANCE: 'warning',
  ERROR: 'error',
} as const;

export default function ExchangesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Exchange Configuration</h1>
          <p className="text-gray-600 dark:text-gray-400">Connect and configure exchange integrations</p>
        </div>
        <Button>Add Exchange</Button>
      </div>

      <div className="grid gap-4">
        {mockExchanges.map((exchange) => (
          <Card key={exchange.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{exchange.name}</CardTitle>
                <Badge variant={statusColors[exchange.status]}>{exchange.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Trading Pairs:</span>
                  <p className="font-medium">{exchange.pairs.join(', ')}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Last Connected:</span>
                  <p className="font-medium">
                    {exchange.lastConnected 
                      ? new Date(exchange.lastConnected).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm">Configure</Button>
                <Button variant="outline" size="sm">Test Connection</Button>
                {exchange.status === 'ACTIVE' ? (
                  <Button variant="ghost" size="sm">Disconnect</Button>
                ) : (
                  <Button variant="primary" size="sm">Connect</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
