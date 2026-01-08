'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const mockOrders = [
  { id: 'ORD-001', pair: 'BTC/USDT', type: 'LIMIT', side: 'BUY', price: '$42,150', amount: '0.5 BTC', status: 'OPEN', time: '2 min ago' },
  { id: 'ORD-002', pair: 'ETH/USDT', type: 'MARKET', side: 'SELL', price: 'Market', amount: '2.0 ETH', status: 'FILLED', time: '5 min ago' },
  { id: 'ORD-003', pair: 'SOL/USDT', type: 'LIMIT', side: 'BUY', price: '$98.50', amount: '10 SOL', status: 'PENDING', time: '10 min ago' },
  { id: 'ORD-004', pair: 'BTC/USDT', type: 'STOP_LIMIT', side: 'SELL', price: '$40,000', amount: '0.25 BTC', status: 'OPEN', time: '1 hour ago' },
];

const statusColors = {
  OPEN: 'info',
  FILLED: 'success',
  PENDING: 'warning',
  CANCELLED: 'error',
} as const;

const sideColors = {
  BUY: 'text-green-600',
  SELL: 'text-red-600',
};

export default function OrdersPage() {
  const [filter, setFilter] = useState<'all' | 'open' | 'filled'>('all');

  const filteredOrders = mockOrders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'open') return order.status === 'OPEN' || order.status === 'PENDING';
    if (filter === 'filled') return order.status === 'FILLED';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
          <p className="text-gray-600 dark:text-gray-400">View and manage your orders</p>
        </div>
        <Button>New Order</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Order History</CardTitle>
            <div className="flex gap-2">
              {(['all', 'open', 'filled'] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Order ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Pair</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Side</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Price</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Time</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b dark:border-gray-700">
                    <td className="py-3 px-4 font-mono text-sm">{order.id}</td>
                    <td className="py-3 px-4 font-medium">{order.pair}</td>
                    <td className="py-3 px-4 text-sm">{order.type}</td>
                    <td className={`py-3 px-4 font-medium ${sideColors[order.side as keyof typeof sideColors]}`}>
                      {order.side}
                    </td>
                    <td className="py-3 px-4">{order.price}</td>
                    <td className="py-3 px-4">{order.amount}</td>
                    <td className="py-3 px-4">
                      <Badge variant={statusColors[order.status as keyof typeof statusColors]}>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{order.time}</td>
                    <td className="py-3 px-4">
                      {(order.status === 'OPEN' || order.status === 'PENDING') && (
                        <Button variant="ghost" size="sm">Cancel</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
