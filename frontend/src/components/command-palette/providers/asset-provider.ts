/**
 * Asset search provider for Command Palette
 */

import type { SearchResult, SearchProvider } from '../types';
import { createSearchProvider, filterByQuery, generateMockId } from './base-provider';

// Mock asset data
const mockAssets: SearchResult[] = [
  {
    id: generateMockId(),
    type: 'asset',
    title: 'Bitcoin (BTC)',
    description: 'The original cryptocurrency',
    path: '/assets/btc',
    keywords: ['bitcoin', 'btc', 'crypto', 'digital gold'],
    permission: { resource: 'market_data', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'asset',
    title: 'Ethereum (ETH)',
    description: 'Smart contract platform',
    path: '/assets/eth',
    keywords: ['ethereum', 'eth', 'smart contracts', 'defi'],
    permission: { resource: 'market_data', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'asset',
    title: 'Solana (SOL)',
    description: 'High-performance blockchain',
    path: '/assets/sol',
    keywords: ['solana', 'sol', 'fast', 'scalable'],
    permission: { resource: 'market_data', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'asset',
    title: 'Cardano (ADA)',
    description: 'Proof-of-stake blockchain',
    path: '/assets/ada',
    keywords: ['cardano', 'ada', 'pos', 'proof of stake'],
    permission: { resource: 'market_data', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'asset',
    title: 'Polygon (MATIC)',
    description: 'Ethereum scaling solution',
    path: '/assets/matic',
    keywords: ['polygon', 'matic', 'layer 2', 'scaling'],
    permission: { resource: 'market_data', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'asset',
    title: 'Chainlink (LINK)',
    description: 'Decentralized oracle network',
    path: '/assets/link',
    keywords: ['chainlink', 'link', 'oracle', 'data feeds'],
    permission: { resource: 'market_data', action: 'read' },
  },
];

// Asset actions
const assetActions: SearchResult[] = [
  {
    id: 'action-view-portfolio',
    type: 'action',
    title: 'View Portfolio',
    description: 'View your asset portfolio',
    path: '/portfolio',
    keywords: ['portfolio', 'holdings', 'balance', 'assets'],
    permission: { resource: 'position', action: 'read' },
  },
  {
    id: 'action-add-watchlist',
    type: 'action',
    title: 'Add to Watchlist',
    description: 'Add an asset to your watchlist',
    keywords: ['watchlist', 'watch', 'track', 'monitor'],
    permission: { resource: 'market_data', action: 'read' },
  },
];

/**
 * Search assets
 */
async function searchAssets(query: string): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const allItems = [...mockAssets, ...assetActions];
  return filterByQuery(allItems, query);
}

/**
 * Get all assets
 */
async function getAllAssets(): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [...mockAssets, ...assetActions];
}

/**
 * Create asset search provider
 */
export function createAssetProvider(): SearchProvider {
  return createSearchProvider('asset', searchAssets, getAllAssets);
}

export default createAssetProvider;
