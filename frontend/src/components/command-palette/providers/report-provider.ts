/**
 * Report search provider for Command Palette
 */

import type { SearchResult, SearchProvider } from '../types';
import { createSearchProvider, filterByQuery, generateMockId } from './base-provider';

// Mock report data
const mockReports: SearchResult[] = [
  {
    id: generateMockId(),
    type: 'report',
    title: 'Daily Performance Report',
    description: 'Daily trading performance summary',
    path: '/reports/daily-performance',
    keywords: ['daily', 'performance', 'pnl', 'profit', 'loss'],
    permission: { resource: 'report', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'report',
    title: 'Weekly Risk Report',
    description: 'Weekly risk metrics and analysis',
    path: '/reports/weekly-risk',
    keywords: ['weekly', 'risk', 'var', 'exposure'],
    permission: { resource: 'report', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'report',
    title: 'Monthly Compliance Report',
    description: 'Monthly regulatory compliance summary',
    path: '/reports/monthly-compliance',
    keywords: ['monthly', 'compliance', 'regulatory', 'audit'],
    permission: { resource: 'report', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'report',
    title: 'Strategy Backtest Report',
    description: 'Historical strategy performance analysis',
    path: '/reports/backtest',
    keywords: ['backtest', 'strategy', 'historical', 'simulation'],
    permission: { resource: 'report', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'report',
    title: 'Audit Trail Export',
    description: 'Complete audit trail for compliance',
    path: '/reports/audit-trail',
    keywords: ['audit', 'trail', 'export', 'compliance', 'log'],
    permission: { resource: 'audit_log', action: 'export' },
  },
];

// Report actions
const reportActions: SearchResult[] = [
  {
    id: 'action-generate-report',
    type: 'action',
    title: 'Generate Report',
    description: 'Generate a new custom report',
    path: '/reports/generate',
    keywords: ['generate', 'create', 'report', 'new'],
    permission: { resource: 'report', action: 'create' },
  },
  {
    id: 'action-export-report',
    type: 'action',
    title: 'Export Report',
    description: 'Export report to PDF or Excel',
    keywords: ['export', 'download', 'pdf', 'excel', 'report'],
    permission: { resource: 'report', action: 'export' },
  },
  {
    id: 'action-schedule-report',
    type: 'action',
    title: 'Schedule Report',
    description: 'Schedule automated report generation',
    path: '/reports/schedule',
    keywords: ['schedule', 'automate', 'recurring', 'report'],
    permission: { resource: 'report', action: 'create' },
  },
];

/**
 * Search reports
 */
async function searchReports(query: string): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const allItems = [...mockReports, ...reportActions];
  return filterByQuery(allItems, query);
}

/**
 * Get all reports
 */
async function getAllReports(): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [...mockReports, ...reportActions];
}

/**
 * Create report search provider
 */
export function createReportProvider(): SearchProvider {
  return createSearchProvider('report', searchReports, getAllReports);
}

export default createReportProvider;
