'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Tab = 'status' | 'killswitch' | 'limits';

const riskLimits = [
  { id: '1', name: 'Max Position Size', current: '$50,000', limit: '$100,000', usage: 50 },
  { id: '2', name: 'Daily Loss Limit', current: '$2,500', limit: '$10,000', usage: 25 },
  { id: '3', name: 'Max Open Orders', current: '15', limit: '50', usage: 30 },
  { id: '4', name: 'Leverage Limit', current: '3x', limit: '10x', usage: 30 },
];

export default function RiskControlsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'status', label: 'Risk Status' },
    { id: 'killswitch', label: 'Kill Switch' },
    { id: 'limits', label: 'Risk Limits' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Risk Controls</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor and manage trading risk parameters</p>
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
        {activeTab === 'status' && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Risk Score</p>
                  <p className="text-3xl font-bold text-green-600">Low</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Active Alerts</p>
                  <p className="text-3xl font-bold text-yellow-600">2</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Margin Usage</p>
                  <p className="text-3xl font-bold">42%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Kill Switch</p>
                  <p className="text-3xl font-bold text-green-600">OFF</p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Risk Limit Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {riskLimits.map((limit) => (
                    <div key={limit.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{limit.name}</span>
                        <span>{limit.current} / {limit.limit}</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${limit.usage > 80 ? 'bg-red-600' : limit.usage > 50 ? 'bg-yellow-600' : 'bg-green-600'}`}
                          style={{ width: `${limit.usage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {activeTab === 'killswitch' && (
          <Card>
            <CardHeader>
              <CardTitle>Emergency Kill Switch</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  The kill switch will immediately close all open positions and cancel all pending orders.
                </p>
                <div className="mb-6">
                  <Badge variant={killSwitchActive ? 'error' : 'success'} className="text-lg px-4 py-2">
                    {killSwitchActive ? 'ACTIVE - All Trading Halted' : 'INACTIVE - Trading Enabled'}
                  </Badge>
                </div>
                <Button 
                  variant={killSwitchActive ? 'primary' : 'outline'}
                  size="lg"
                  onClick={() => setKillSwitchActive(!killSwitchActive)}
                  className={killSwitchActive ? '' : 'border-red-500 text-red-500 hover:bg-red-50'}
                >
                  {killSwitchActive ? 'Deactivate Kill Switch' : 'Activate Kill Switch'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {activeTab === 'limits' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Risk Limit Configuration</CardTitle>
                <Button>Save Changes</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {riskLimits.map((limit) => (
                  <div key={limit.id} className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700">
                    <div>
                      <h3 className="font-medium">{limit.name}</h3>
                      <p className="text-sm text-gray-500">Current: {limit.current}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <input 
                        type="text" 
                        defaultValue={limit.limit}
                        className="w-32 px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                      />
                      <Button variant="outline" size="sm">Edit</Button>
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
