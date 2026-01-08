'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useTradingStore, type Strategy } from '@/stores/trading-store';

const STRATEGY_TYPES = ['Momentum', 'Mean Reversion', 'Arbitrage', 'Grid Trading', 'DCA', 'Custom'] as const;
const TRADING_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'MATIC/USDT', 'DOT/USDT', 'LINK/USDT'];

function StrategyForm({ onClose, editStrategy }: { onClose: () => void; editStrategy?: Strategy }) {
  const { addStrategy, updateStrategy } = useTradingStore();
  const [name, setName] = useState(editStrategy?.name || '');
  const [type, setType] = useState<Strategy['type']>(editStrategy?.type || 'Momentum');
  const [description, setDescription] = useState(editStrategy?.description || '');
  const [pairs, setPairs] = useState<string[]>(editStrategy?.pairs || ['BTC/USDT']);
  const [riskLevel, setRiskLevel] = useState(editStrategy?.parameters?.riskLevel as string || 'medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editStrategy) {
      updateStrategy(editStrategy.id, { name, type, description, pairs, parameters: { riskLevel } });
    } else {
      addStrategy({ name, type, description, status: 'draft', pairs, parameters: { riskLevel } });
    }
    onClose();
  };

  const togglePair = (pair: string) => {
    setPairs((prev) => prev.includes(pair) ? prev.filter((p) => p !== pair) : [...prev, pair]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editStrategy ? 'Edit Strategy' : 'Create New Strategy'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Strategy Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
              placeholder="Enter strategy name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Strategy Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Strategy['type'])}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
            >
              {STRATEGY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
              rows={3}
              placeholder="Describe your strategy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Trading Pairs</label>
            <div className="flex flex-wrap gap-2">
              {TRADING_PAIRS.map((pair) => (
                <button
                  key={pair}
                  type="button"
                  onClick={() => togglePair(pair)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    pairs.includes(pair)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
                  }`}
                >
                  {pair}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Risk Level</label>
            <div className="flex gap-2">
              {['low', 'medium', 'high'].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setRiskLevel(level)}
                  className={`flex-1 px-3 py-2 rounded-lg border transition-colors capitalize ${
                    riskLevel === level
                      ? level === 'low' ? 'bg-green-500 text-white border-green-500'
                        : level === 'medium' ? 'bg-yellow-500 text-white border-yellow-500'
                        : 'bg-red-500 text-white border-red-500'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || pairs.length === 0}>
              {editStrategy ? 'Save Changes' : 'Create Strategy'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function StrategyCard({ strategy }: { strategy: Strategy }) {
  const { toggleStrategyStatus, deleteStrategy } = useTradingStore();
  const [showEdit, setShowEdit] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  if (showEdit) {
    return <StrategyForm onClose={() => setShowEdit(false)} editStrategy={strategy} />;
  }

  const statusColors = {
    active: 'success',
    paused: 'warning',
    draft: 'default',
    stopped: 'error',
  } as const;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-lg">{strategy.name}</h3>
              <Badge variant={statusColors[strategy.status]}>{strategy.status}</Badge>
            </div>
            <p className="text-sm text-gray-500 mb-2">{strategy.type} • {strategy.pairs.length} pairs</p>
            {strategy.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{strategy.description}</p>
            )}
            <div className="flex flex-wrap gap-1">
              {strategy.pairs.map((pair) => (
                <span key={pair} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                  {pair}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <p className="text-sm text-gray-500">Return</p>
              <p className={`font-medium ${strategy.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {strategy.totalReturn >= 0 ? '+' : ''}{strategy.totalReturn.toFixed(1)}%
              </p>
            </div>
            <div className="flex gap-2">
              {strategy.status !== 'draft' && (
                <Button
                  variant={strategy.status === 'active' ? 'outline' : 'primary'}
                  size="sm"
                  onClick={() => toggleStrategyStatus(strategy.id)}
                >
                  {strategy.status === 'active' ? 'Pause' : 'Activate'}
                </Button>
              )}
              {strategy.status === 'draft' && (
                <Button size="sm" onClick={() => toggleStrategyStatus(strategy.id)}>
                  Activate
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>Edit</Button>
              {showConfirmDelete ? (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setShowConfirmDelete(false)}>Cancel</Button>
                  <Button variant="outline" size="sm" className="text-red-600" onClick={() => deleteStrategy(strategy.id)}>
                    Confirm
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setShowConfirmDelete(true)}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StrategiesPage() {
  const strategies = useTradingStore((state) => state.strategies);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');

  const filteredStrategies = strategies.filter((s) => filter === 'all' || s.status === filter);
  const activeCount = strategies.filter((s) => s.status === 'active').length;
  const pausedCount = strategies.filter((s) => s.status === 'paused').length;
  const draftCount = strategies.filter((s) => s.status === 'draft').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Strategies</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {strategies.length === 0 ? 'Create your first trading strategy' : `${strategies.length} strategies • ${activeCount} active`}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>New Strategy</Button>
      </div>

      {strategies.length > 0 && (
        <div className="flex gap-2">
          {[
            { key: 'all', label: `All (${strategies.length})` },
            { key: 'active', label: `Active (${activeCount})` },
            { key: 'paused', label: `Paused (${pausedCount})` },
            { key: 'draft', label: `Draft (${draftCount})` },
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
      )}

      {showForm && <StrategyForm onClose={() => setShowForm(false)} />}

      {strategies.length === 0 && !showForm ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-lg font-medium mb-2">No strategies yet</h3>
            <p className="text-gray-500 mb-4">Create your first trading strategy to get started</p>
            <Button onClick={() => setShowForm(true)}>Create Strategy</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredStrategies.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
          {filteredStrategies.length === 0 && strategies.length > 0 && (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No {filter} strategies found
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
