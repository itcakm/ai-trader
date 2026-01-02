/**
 * Order search provider for Command Palette
 */

import type { SearchResult, SearchProvider } from '../types';
import { createSearchProvider, filterByQuery, generateMockId } from './base-provider';

// Mock order data
const mockOrders: SearchResult[] = [
  {
    id: generateMockId(),
    type: 'order',
    title: 'BTC-USD Buy Order #12345',
    description: 'Limit buy 0.5 BTC @ $42,000',
    path: '/orders/12345',
    keywords: ['bitcoin', 'buy', 'limit', 'btc', 'usd'],
    permission: { resource: 'order', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'order',
    title: 'ETH-USD Sell Order #12346',
    description: 'Market sell 2.0 ETH',
    path: '/orders/12346',
    keywords: ['ethereum', 'sell', 'market', 'eth', 'usd'],
    permission: { resource: 'order', action: 'read' },
  },
  {
    id: generateMockId(),
    type: 'order',
    title: 'SOL-USD Buy Order #12347',
    description: 'Stop-limit buy 50 SOL @ $95',
    path: '/orders/12347',
    keywords: ['solana', 'buy', 'stop-limit', 'sol', 'usd'],
    permission: { resource: 'order', action: 'read' },
  },
];

// Order actions
const orderActions: SearchResult[] = [
  {
    id: 'action-create-order',
    type: 'action',
    title: 'Create New Order',
    description: 'Place a new trading order',
    path: '/orders/new',
    keywords: ['create', 'new', 'order', 'place', 'trade'],
    permission: { resource: 'order', action: 'create' },
  },
  {
    id: 'action-cancel-orders',
    type: 'action',
    title: 'Cancel All Orders',
    description: 'Cancel all open orders',
    keywords: ['cancel', 'orders', 'all', 'stop'],
    permission: { resource: 'order', action: 'delete' },
  },
  {
    id: 'action-view-order-history',
    type: 'action',
    title: 'View Order History',
    description: 'View historical orders',
    path: '/orders/history',
    keywords: ['history', 'orders', 'past', 'completed'],
    permission: { resource: 'order', action: 'read' },
  },
];

/**
 * Search orders
 */
async function searchOrders(query: string): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const allItems = [...mockOrders, ...orderActions];
  return filterByQuery(allItems, query);
}

/**
 * Get all orders
 */
async function getAllOrders(): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [...mockOrders, ...orderActions];
}

/**
 * Create order search provider
 */
export function createOrderProvider(): SearchProvider {
  return createSearchProvider('order', searchOrders, getAllOrders);
}

export default createOrderProvider;
