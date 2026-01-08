'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Tab = 'generate' | 'exports';

const mockReports = [
  { id: '1', name: 'Daily Trading Summary', type: 'Performance', date: 'Jan 8, 2026', status: 'completed' },
  { id: '2', name: 'Weekly P&L Report', type: 'Financial', date: 'Jan 5, 2026', status: 'completed' },
  { id: '3', name: 'Risk Analysis Q4', type: 'Risk', date: 'Dec 31, 2025', status: 'completed' },
];

const reportTemplates = [
  { id: '1', name: 'Daily Summary', description: 'Daily trading activity and P&L summary' },
  { id: '2', name: 'Weekly Performance', description: 'Weekly strategy performance metrics' },
  { id: '3', name: 'Monthly Financial', description: 'Monthly financial statements and analysis' },
  { id: '4', name: 'Risk Assessment', description: 'Portfolio risk analysis and exposure report' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('generate');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'generate', label: 'Generate Reports' },
    { id: 'exports', label: 'Recent Reports' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-gray-600 dark:text-gray-400">Generate and export trading reports</p>
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
        {activeTab === 'generate' && (
          <div className="grid grid-cols-2 gap-4">
            {reportTemplates.map((template) => (
              <Card key={template.id}>
                <CardContent className="pt-6">
                  <h3 className="font-medium mb-2">{template.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{template.description}</p>
                  <Button variant="outline" size="sm">Generate Report</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {activeTab === 'exports' && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockReports.map((report) => (
                  <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700">
                    <div>
                      <h3 className="font-medium">{report.name}</h3>
                      <p className="text-sm text-gray-500">{report.type} • {report.date}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="success">{report.status}</Badge>
                      <Button variant="outline" size="sm">Download</Button>
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
