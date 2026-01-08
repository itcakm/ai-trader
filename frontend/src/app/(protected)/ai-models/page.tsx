'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Tab = 'models' | 'analysis' | 'allocation';

// Mock data for AI models
const mockModels = [
  { id: '1', name: 'GPT-4 Trading Analyst', provider: 'OpenAI', status: 'active', usage: '45%' },
  { id: '2', name: 'Claude Market Predictor', provider: 'Anthropic', status: 'active', usage: '32%' },
  { id: '3', name: 'Custom LSTM Model', provider: 'Internal', status: 'training', usage: '0%' },
];

const mockAnalyses = [
  { id: '1', model: 'GPT-4', type: 'Market Sentiment', result: 'Bullish', confidence: '87%', time: '2 min ago' },
  { id: '2', model: 'Claude', type: 'Risk Assessment', result: 'Low Risk', confidence: '92%', time: '5 min ago' },
  { id: '3', model: 'LSTM', type: 'Price Prediction', result: '+2.3%', confidence: '76%', time: '10 min ago' },
];

export default function AIModelsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('models');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'models', label: 'Model Configuration' },
    { id: 'analysis', label: 'Analysis Results' },
    { id: 'allocation', label: 'Resource Allocation' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Models</h1>
        <p className="text-gray-600 dark:text-gray-400">Configure and monitor AI trading models</p>
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
        {activeTab === 'models' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>AI Model Configurations</CardTitle>
                <Button>Add Model</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockModels.map((model) => (
                  <div key={model.id} className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700">
                    <div>
                      <h3 className="font-medium">{model.name}</h3>
                      <p className="text-sm text-gray-500">{model.provider}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">Usage: {model.usage}</span>
                      <Badge variant={model.status === 'active' ? 'success' : 'warning'}>
                        {model.status}
                      </Badge>
                      <Button variant="outline" size="sm">Configure</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        
        {activeTab === 'analysis' && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Analysis Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockAnalyses.map((analysis) => (
                  <div key={analysis.id} className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700">
                    <div>
                      <h3 className="font-medium">{analysis.type}</h3>
                      <p className="text-sm text-gray-500">Model: {analysis.model}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-medium">{analysis.result}</p>
                        <p className="text-sm text-gray-500">Confidence: {analysis.confidence}</p>
                      </div>
                      <span className="text-sm text-gray-400">{analysis.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        
        {activeTab === 'allocation' && (
          <Card>
            <CardHeader>
              <CardTitle>Resource Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-500">Total Budget</p>
                    <p className="text-2xl font-bold">$500/mo</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-500">Used This Month</p>
                    <p className="text-2xl font-bold">$234.50</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-500">Remaining</p>
                    <p className="text-2xl font-bold text-green-600">$265.50</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-3">Usage by Model</h4>
                  {mockModels.filter(m => m.status === 'active').map((model) => (
                    <div key={model.id} className="flex items-center gap-4 mb-2">
                      <span className="w-40 text-sm">{model.name}</span>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: model.usage }}
                        />
                      </div>
                      <span className="text-sm text-gray-500 w-12">{model.usage}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
