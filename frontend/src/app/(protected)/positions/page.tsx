'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const mockPositions = [
  { id: '1', symbol: 'BTC', amount: '2.5', value: '$105,375', pnl: '+$4,250', pnlPercent: '+4.2%', side: 'LONG' },
  { id: '2', symbol: 'ETH', amount: '15.0', value: '$37,500', pnl: '+$1,875', pnlPercent: '+5.3%', side: 'LONG' },
  { id: '3', symbol: 'SOL', amount: '100', value: '$9,850', pnl: '-$150', pnlPercent: '-1.5%', side: 'LONG' },
  { id: '4', symbol: 'BTC', amount: '0.5', value: '$21,075', pnl: '+$575', pnlPercent: '+2.8%', side: 'SHORT' },
];

export default function PositionsPage() {
  const totalValue = mockPositions.reduce((sum, p) => sum + parseFloat(p.value.replace(/[$,]/g, '')), 0);
  const totalPnl = mockPositions.reduce((sum, p) => sum + parseFloat(p.pnl.replace(/[$,+]/g, '')), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Positions</h1>
        <p className="text-gray-600 dark:text-gray-400">View and manage your open positions</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total Value</p>
            <p className="text-2xl font-bold">${totalValue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total P&L</p>
            <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Open Positions</p>
            <p className="text-2xl font-bold">{mockPositions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Margin Used</p>
            <p className="text-2xl font-bold">42%</p>
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Value</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">P&L</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">P&L %</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mockPositions.map((position) => (
                  <tr key={position.id} className="border-b dark:border-gray-700">
                    <td className="py-3 px-4 font-medium">{position.symbol}</td>
                    <td className="py-3 px-4">
                      <Badge variant={position.side === 'LONG' ? 'success' : 'error'}>
                        {position.side}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">{position.amount}</td>
                    <td className="py-3 px-4">{position.value}</td>
                    <td className={`py-3 px-4 font-medium ${position.pnl.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                      {position.pnl}
                    </td>
                    <td className={`py-3 px-4 ${position.pnlPercent.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                      {position.pnlPercent}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">Close</Button>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </div>
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
