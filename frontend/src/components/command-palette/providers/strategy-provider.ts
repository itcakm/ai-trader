/**
 * Strategy search provider for Command Palette
 */

import type { SearchResult, SearchProvider } from '../types';
import { createSearchProvider, filterByQuery, generateMockId } from './base-provider';

// Mock strategy data (in production, this would come from an API)
const mockStrategies: SearchResult[] = [
  {
    id: generateMockId(),
    type: 'strategy',
    title: 'BTC Momentum Strategy',
    description: 'Momentum-based trading strategy for Bitcoin',
    path: '/strategies/btc-momentum',
    keywords: ['bitcoin', 'momentum', 'btc', 'trading'],
    permission: { resource: 'strategy', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'strategy',
    title: 'ETH Mean Reversion',
    description: 'Mean reversion strategy for Ethereum',
    path: '/strategies/eth-mean-reversion',
    keywords: ['ethereum', 'mean reversion', 'eth'],
    permission: { resource: 'strategy', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'strategy',
    title: 'Multi-Asset Arbitrage',
    description: 'Cross-exchange arbitrage strategy',
    path: '/strategies/multi-asset-arbitrage',
    keywords: ['arbitrage', 'multi-asset', 'cross-exchange'],
    permission: { resource: 'strategy', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'strategy',
    title: 'AI Sentiment Trading',
    description: 'AI-powered sentiment analysis trading',
    path: '/strategies/ai-sentiment',
    keywords: ['ai', 'sentiment', 'machine learning', 'nlp'],
    permission: { resource: 'strategy', action: 'read' },
  },
];

// Strategy actions
const strategyActions: SearchResult[] = [
  {
    id: 'action-create-strategy',
    type: 'action',
    title: 'Create New Strategy',
    description: 'Create a new trading strategy',
    path: '/strategies/new',
    keywords: ['create', 'new', 'strategy', 'add'],
    permission: { resource: 'strategy', action: 'create' },
  },
  {
    id: 'action-deploy-strategy',
    type: 'action',
    title: 'Deploy Strategy',
    description: 'Deploy a strategy to production',
    keywords: ['deploy', 'strategy', 'production', 'live'],
    permission: { resource: 'strategy', action: 'execute' },
  },
];

/**
 * Search strategies
 */
async function searchStrategies(query: string): Promise<SearchResult[]> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  const allItems = [...mockStrategies, ...strategyActions];
  return filterByQuery(allItems, query);
}

/**
 * Get all strategies
 */
async function getAllStrategies(): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [...mockStrategies, ...strategyActions];
}

/**
 * Create strategy search provider
 */
export function createStrategyProvider(): SearchProvider {
  return createSearchProvider('strategy', searchStrategies, getAllStrategies);
}

export default createStrategyProvider;
