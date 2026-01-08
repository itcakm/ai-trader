'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useTradingStore, type Position } from '@/stores/trading-store';

const CRYPTO_PRICES: Record<string, number> = {
  BTC: 43500, ETH: 2650, SOL: 98, AVAX: 38, MATIC: 0.92, DOT: 7.5, LINK: 15.2, UNI: 6.8, AAVE: 95, ADA: 0.52,
};

function OpenPositionForm({ onClose }: { onClose: () => void }) {
  const { openPosition, totalDeposited, positions } = useTradingStore();
  const [symbol, setSymbol] = useState('BTC');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [amount, setAmount] = useState('');

  const currentPrice = CRYPTO_PRICES[symbol] || 0;
  const positionValue = parseFloat(amount || '0') * currentPrice;
  
  const usedMargin = positions.reduce((sum, p) => sum + p.entryPrice * p.amount, 0);
  const availableBalance = totalDeposited - usedMargin;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (amountNum <= 0 || positionValue > availableBalance) return;

    openPosition({ symbol, side, amount: amountNum, entryPrice: currentPrice });
    onClose();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open New Position</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Asset</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
            >
              {Object.entries(CRYPTO_PRICES).map(([sym, price]) => (
                <option key={sym} value={sym}>{sym} - ${price.toLocaleString()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Side</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide('LONG')}
                className={`flex-1 py-2 rounded-lg border transition-colors ${
                  side === 'LONG' ? 'bg-green-500 text-white border-green-500' : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                Long (Buy)
              </button>
              <button
                type="button"
                onClick={() => setSide('SHORT')}
                className={`flex-1 py-2 rounded-lg border transition-colors ${
                  side === 'SHORT' ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                Short (Sell)
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount ({symbol})</label>
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
              Value: ${positionValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Available Balance</span>
              <span className={availableBalance < positionValue ? 'text-red-500' : ''}>
                ${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          {availableBalance <= 0 && (
            <p className="text-sm text-red-500">Insufficient balance. Please make a deposit first.</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!amount || positionValue <= 0 || positionValue > availableBalance}>
              Open {side} Position
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PositionRow({ position }: { position: Position }) {
  const { closePosition } = useTradingStore();
  const [showConfirm, setShowConfirm] = useState(false);

  const value = position.currentPrice * position.amount;
  const cost = position.entryPrice * position.amount;
  const pnl = position.side === 'LONG'
    ? (position.currentPrice - position.entryPrice) * position.amount
    : (position.entryPrice - position.currentPrice) * position.amount;
  const pnlPercent = (pnl / cost) * 100;

  return (
    <tr className="border-b dark:border-gray-700">
      <td className="py-3 px-4 font-medium">{position.symbol}</td>
      <td className="py-3 px-4">
        <Badge variant={position.side === 'LONG' ? 'success' : 'error'}>{position.side}</Badge>
      </td>
      <td className="py-3 px-4">{position.amount.toFixed(4)}</td>
      <td className="py-3 px-4">${position.entryPrice.toLocaleString()}</td>
      <td className="py-3 px-4">${position.currentPrice.toLocaleString()}</td>
      <td className="py-3 px-4">${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td className={`py-3 px-4 font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
      </td>
      <td className={`py-3 px-4 ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
      </td>
      <td className="py-3 px-4">
        {showConfirm ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button variant="outline" size="sm" onClick={() => closePosition(position.id)}>Confirm</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowConfirm(true)}>Close</Button>
        )}
      </td>
    </tr>
  );
}

export default function PositionsPage() {
  const positions = useTradingStore((state) => state.positions);
  const totalDeposited = useTradingStore((state) => state.totalDeposited);
  const [showForm, setShowForm] = useState(false);

  const totalValue = positions.reduce((sum, p) => sum + p.currentPrice * p.amount, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.entryPrice * p.amount, 0);
  const totalPnl = positions.reduce((sum, p) => {
    const pnl = p.side === 'LONG'
      ? (p.currentPrice - p.entryPrice) * p.amount
      : (p.entryPrice - p.currentPrice) * p.amount;
    return sum + pnl;
  }, 0);
  const marginUsed = totalDeposited > 0 ? (totalCost / totalDeposited) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Positions</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {positions.length === 0 ? 'No open positions' : `${positions.length} open positions`}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={totalDeposited <= 0}>
          Open Position
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total Value</p>
            <p className="text-2xl font-bold">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total P&L</p>
            <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Open Positions</p>
            <p className="text-2xl font-bold">{positions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Margin Used</p>
            <p className="text-2xl font-bold">{marginUsed.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {showForm && <OpenPositionForm onClose={() => setShowForm(false)} />}

      {positions.length === 0 && !showForm ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-medium mb-2">No open positions</h3>
            <p className="text-gray-500 mb-4">
              {totalDeposited > 0 ? 'Open your first position to start trading' : 'Make a deposit first to start trading'}
            </p>
            <Button onClick={() => setShowForm(true)} disabled={totalDeposited <= 0}>
              Open Position
            </Button>
          </CardContent>
        </Card>
      ) : positions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Symbol</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Side</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Entry Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Current Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Value</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">P&L</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">P&L %</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <PositionRow key={position.id} position={position} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
