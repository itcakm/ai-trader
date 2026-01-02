/**
 * Help search provider for Command Palette
 */

import type { SearchResult, SearchProvider } from '../types';
import { createSearchProvider, filterByQuery } from './base-provider';

// Help articles
const helpArticles: SearchResult[] = [
  {
    id: 'help-getting-started',
    type: 'help',
    title: 'Getting Started Guide',
    description: 'Learn the basics of the trading platform',
    path: '/help/getting-started',
    keywords: ['getting started', 'beginner', 'tutorial', 'introduction', 'basics'],
  },
  {
    id: 'help-create-strategy',
    type: 'help',
    title: 'How to Create a Strategy',
    description: 'Step-by-step guide to creating trading strategies',
    path: '/help/create-strategy',
    keywords: ['strategy', 'create', 'how to', 'guide', 'tutorial'],
  },
  {
    id: 'help-risk-management',
    type: 'help',
    title: 'Risk Management Guide',
    description: 'Understanding and configuring risk controls',
    path: '/help/risk-management',
    keywords: ['risk', 'management', 'controls', 'limits', 'exposure'],
  },
  {
    id: 'help-api-documentation',
    type: 'help',
    title: 'API Documentation',
    description: 'Complete API reference and examples',
    path: '/help/api-docs',
    keywords: ['api', 'documentation', 'reference', 'endpoints', 'integration'],
  },
  {
    id: 'help-exchange-setup',
    type: 'help',
    title: 'Exchange Setup Guide',
    description: 'How to connect and configure exchanges',
    path: '/help/exchange-setup',
    keywords: ['exchange', 'setup', 'connect', 'binance', 'coinbase', 'api keys'],
  },
  {
    id: 'help-backtesting',
    type: 'help',
    title: 'Backtesting Guide',
    description: 'How to backtest your trading strategies',
    path: '/help/backtesting',
    keywords: ['backtest', 'historical', 'simulation', 'testing', 'performance'],
  },
  {
    id: 'help-ai-models',
    type: 'help',
    title: 'AI Models Overview',
    description: 'Understanding AI-powered trading features',
    path: '/help/ai-models',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'models', 'predictions'],
  },
  {
    id: 'help-keyboard-shortcuts',
    type: 'help',
    title: 'Keyboard Shortcuts',
    description: 'Complete list of keyboard shortcuts',
    path: '/help/keyboard-shortcuts',
    keywords: ['keyboard', 'shortcuts', 'hotkeys', 'commands', 'quick'],
  },
  {
    id: 'help-troubleshooting',
    type: 'help',
    title: 'Troubleshooting Guide',
    description: 'Common issues and how to resolve them',
    path: '/help/troubleshooting',
    keywords: ['troubleshooting', 'problems', 'issues', 'errors', 'fix', 'help'],
  },
  {
    id: 'help-faq',
    type: 'help',
    title: 'Frequently Asked Questions',
    description: 'Answers to common questions',
    path: '/help/faq',
    keywords: ['faq', 'questions', 'answers', 'common', 'help'],
  },
];

// Help actions
const helpActions: SearchResult[] = [
  {
    id: 'action-contact-support',
    type: 'action',
    title: 'Contact Support',
    description: 'Get help from our support team',
    path: '/help/support',
    keywords: ['support', 'contact', 'help', 'ticket', 'assistance'],
  },
  {
    id: 'action-report-bug',
    type: 'action',
    title: 'Report a Bug',
    description: 'Report an issue or bug',
    path: '/help/report-bug',
    keywords: ['bug', 'report', 'issue', 'problem', 'feedback'],
  },
  {
    id: 'action-feature-request',
    type: 'action',
    title: 'Request a Feature',
    description: 'Suggest a new feature',
    path: '/help/feature-request',
    keywords: ['feature', 'request', 'suggest', 'idea', 'improvement'],
  },
  {
    id: 'action-view-changelog',
    type: 'action',
    title: 'View Changelog',
    description: 'See recent updates and changes',
    path: '/help/changelog',
    keywords: ['changelog', 'updates', 'releases', 'new', 'version'],
  },
];

/**
 * Search help articles
 */
async function searchHelp(query: string): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const allItems = [...helpArticles, ...helpActions];
  return filterByQuery(allItems, query);
}

/**
 * Get all help articles
 */
async function getAllHelp(): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [...helpArticles, ...helpActions];
}

/**
 * Create help search provider
 */
export function createHelpProvider(): SearchProvider {
  return createSearchProvider('help', searchHelp, getAllHelp);
}

export default createHelpProvider;
