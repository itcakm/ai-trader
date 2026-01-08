'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const mockStrategies = [
  { id: 'strat-1', name: 'Momentum Trading', type: 'Momentum', status: 'active', return: '+24.5%', pairs: 3 },
  { id: 'strat-2', name: 'Mean Reversion', type: 'Mean Reversion', status: 'active', return: '+18.2%', pairs: 5 },
  { id: 'strat-3', name: 'Arbitrage Bot', type: 'Arbitrage', status: 'paused', return: '+12.8%', pairs: 8 },
  { id: 'strat-4', name: 'Grid Trading', type: 'Grid', status: 'draft', return: 'N/A', pairs: 2 },
];

export default function StrategiesPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Strategies</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your trading strategies</p>
        </div>
        <Button onClick={() => setShowForm(true)}>New Strategy</Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Create New Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Strategy Name</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Enter strategy name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Strategy Type</label>
                <select className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700">
                  <option>Momentum</option>
                  <option>Mean Reversion</option>
                  <option>Arbitrage</option>
                  <option>Grid Trading</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea 
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  rows={3}
                  placeholder="Describe your strategy"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={() => setShowForm(false)}>Create Strategy</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {mockStrategies.map((strategy) => (
            <Card key={strategy.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/strategies/${strategy.id}`)}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-lg">{strategy.name}</h3>
                    <p className="text-sm text-gray-500">{strategy.type} • {strategy.pairs} pairs</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Return</p>
                      <p className={`font-medium ${strategy.return.startsWith('+') ? 'text-green-600' : ''}`}>
                        {strategy.return}
                      </p>
                    </div>
                    <Badge variant={
                      strategy.status === 'active' ? 'success' : 
                      strategy.status === 'paused' ? 'warning' : 'default'
                    }>
                      {strategy.status}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); }}>
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
