'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useTradingStore, type Order } from '@/stores/trading-store';

const TRADING_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'MATIC/USDT', 'DOT/USDT', 'LINK/USDT'];
const CRYPTO_PRICES: Record<string, number> = {
  'BTC/USDT': 43500, 'ETH/USDT': 2650, 'SOL/USDT': 98, 'AVAX/USDT': 38, 'MATIC/USDT': 0.92, 'DOT/USDT': 7.5, 'LINK/USDT': 15.2,
};

const statusColors = { OPEN: 'info', FILLED: 'success', PENDING: 'warning', CANCELLED: 'error', REJECTED: 'error' } as const;
const sideColors = { BUY: 'text-green-600', SELL: 'text-red-600' };

function NewOrderForm({ onClose }: { onClose: () => void }) {
  const { createOrder, totalDeposited, positions } = useTradingStore();
  const [pair, setPair] = useState('BTC/USDT');
  const [type, setType] = useState<Order['type']>('LIMIT');
  const [side, setSide] = useState<Order['side']>('BUY');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');

  const currentPrice = CRYPTO_PRICES[pair] || 0;
  const orderValue = parseFloat(amount || '0') * (type === 'MARKET' ? currentPrice : parseFloat(price || '0'));
  
  const usedMargin = positions.reduce((sum, p) => sum + p.entryPrice * p.amount, 0);
  const availableBalance = totalDeposited - usedMargin;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    const priceNum = type === 'MARKET' ? null : parseFloat(price);
    
    if (amountNum <= 0) return;
    if (type !== 'MARKET' && (!priceNum || priceNum <= 0)) return;

    createOrder({ pair, type, side, price: priceNum, amount: amountNum });
    onClose();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Order</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Trading Pair</label>
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
            >
              {TRADING_PAIRS.map((p) => (
                <option key={p} value={p}>{p} - ${CRYPTO_PRICES[p]?.toLocaleString()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Order Type</label>
            <div className="flex gap-2">
              {(['MARKET', 'LIMIT', 'STOP_LIMIT'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg border transition-colors text-sm ${
                    type === t ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Side</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className={`flex-1 py-2 rounded-lg border transition-colors ${
                  side === 'BUY' ? 'bg-green-500 text-white border-green-500' : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                className={`flex-1 py-2 rounded-lg border transition-colors ${
                  side === 'SELL' ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                Sell
              </button>
            </div>
          </div>
          {type !== 'MARKET' && (
            <div>
              <label className="block text-sm font-medium mb-1">Price (USDT)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                placeholder={currentPrice.toString()}
                step="0.01"
                min="0"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Amount ({pair.split('/')[0]})</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
              placeholder="0.00"
              step="0.001"
              min="0"
            />
            <p className="text-sm text-gray-500 mt-1">
              Order Value: ${orderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Available Balance</span>
              <span>${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!amount || parseFloat(amount) <= 0 || (type !== 'MARKET' && (!price || parseFloat(price) <= 0))}>
              Place {side} Order
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hour${Math.floor(diff / 3600000) > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

export default function OrdersPage() {
  const orders = useTradingStore((state) => state.orders);
  const cancelOrder = useTradingStore((state) => state.cancelOrder);
  const totalDeposited = useTradingStore((state) => state.totalDeposited);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'filled'>('all');

  const filteredOrders = orders.filter((order) => {
    if (filter === 'all') return true;
    if (filter === 'open') return order.status === 'OPEN' || order.status === 'PENDING';
    if (filter === 'filled') return order.status === 'FILLED';
    return true;
  });

  const openCount = orders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING').length;
  const filledCount = orders.filter((o) => o.status === 'FILLED').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {orders.length === 0 ? 'No orders yet' : `${orders.length} orders • ${openCount} open`}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={totalDeposited <= 0}>
          New Order
        </Button>
      </div>

      {showForm && <NewOrderForm onClose={() => setShowForm(false)} />}

      {orders.length === 0 && !showForm ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-lg font-medium mb-2">No orders yet</h3>
            <p className="text-gray-500 mb-4">
              {totalDeposited > 0 ? 'Place your first order to start trading' : 'Make a deposit first to start trading'}
            </p>
            <Button onClick={() => setShowForm(true)} disabled={totalDeposited <= 0}>
              Create Order
            </Button>
          </CardContent>
        </Card>
      ) : orders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Order History</CardTitle>
              <div className="flex gap-2">
                {[
                  { key: 'all', label: `All (${orders.length})` },
                  { key: 'open', label: `Open (${openCount})` },
                  { key: 'filled', label: `Filled (${filledCount})` },
                ].map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={filter === key ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setFilter(key as typeof filter)}
                  >
                    {label}
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
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Filled</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Time</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b dark:border-gray-700">
                      <td className="py-3 px-4 font-mono text-sm">{order.id.slice(0, 12)}...</td>
                      <td className="py-3 px-4 font-medium">{order.pair}</td>
                      <td className="py-3 px-4 text-sm">{order.type.replace('_', ' ')}</td>
                      <td className={`py-3 px-4 font-medium ${sideColors[order.side]}`}>{order.side}</td>
                      <td className="py-3 px-4">{order.price ? `$${order.price.toLocaleString()}` : 'Market'}</td>
                      <td className="py-3 px-4">{order.amount.toFixed(4)}</td>
                      <td className="py-3 px-4">{order.filled.toFixed(4)}</td>
                      <td className="py-3 px-4">
                        <Badge variant={statusColors[order.status]}>{order.status}</Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">{formatTime(order.createdAt)}</td>
                      <td className="py-3 px-4">
                        {(order.status === 'OPEN' || order.status === 'PENDING') && (
                          <Button variant="ghost" size="sm" onClick={() => cancelOrder(order.id)}>Cancel</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && (
              <p className="text-center py-8 text-gray-500">No {filter} orders found</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
