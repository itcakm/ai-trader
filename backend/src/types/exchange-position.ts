/**
 * Exchange Position Type Definitions
 * Requirements: 7.1, 7.6
 */

import { ExchangeId } from './exchange';

// Position for a single asset on a single exchange
export interface Position {
  positionId: string;
  tenantId: string;
  assetId: string;
  exchangeId: ExchangeId;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  totalCommissions: number;
  openedAt: string;
  updatedAt: string;
}

// Position breakdown by exchange
export interface ExchangePosition {
  exchangeId: ExchangeId;
  quantity: number;
  averageEntryPrice: number;
  unrealizedPnL: number;
}

// Aggregated position across all exchanges
export interface AggregatedPosition {
  tenantId: string;
  assetId: string;
  totalQuantity: number;
  weightedAveragePrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  positionsByExchange: ExchangePosition[];
  updatedAt: string;
}

// Position change event types
export type PositionEventType =
  | 'OPEN'
  | 'INCREASE'
  | 'DECREASE'
  | 'CLOSE'
  | 'RECONCILE';

// Historical record of position changes
export interface PositionHistory {
  historyId: string;
  positionId: string;
  tenantId: string;
  assetId: string;
  exchangeId: ExchangeId;
  eventType: PositionEventType;
  previousQuantity: number;
  newQuantity: number;
  previousAvgPrice: number;
  newAvgPrice: number;
  fillId?: string;
  timestamp: string;
}

// Result of position reconciliation
export interface PositionReconciliationResult {
  exchangeId: ExchangeId;
  positionsChecked: number;
  discrepancies: PositionDiscrepancy[];
  adjustmentsMade: PositionAdjustment[];
  timestamp: string;
}

// Individual position discrepancy
export interface PositionDiscrepancy {
  assetId: string;
  internalQuantity: number;
  exchangeQuantity: number;
  difference: number;
}

// Position adjustment record
export interface PositionAdjustment {
  assetId: string;
  previousQuantity: number;
  adjustedQuantity: number;
  reason: string;
}
