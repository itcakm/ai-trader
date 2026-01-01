/**
 * Order and Execution Types
 * Requirements: 6.1, 7.1
 */

import { RiskEvent } from './risk-event';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP';

export interface OrderRequest {
  orderId: string;
  tenantId: string;
  strategyId: string;
  assetId: string;
  side: OrderSide;
  quantity: number;
  price?: number;
  orderType: OrderType;
  exchangeId: string;
  timestamp: string;
}

export interface ExecutionReport {
  executionId: string;
  orderId: string;
  tenantId: string;
  strategyId: string;
  assetId: string;
  side: OrderSide;
  executedQuantity: number;
  executedPrice: number;
  commission: number;
  exchangeId: string;
  timestamp: string;
}

export interface PostTradeResult {
  positionUpdated: boolean;
  newPositionSize: number;
  realizedPnL: number;
  drawdownUpdated: boolean;
  newDrawdownPercent: number;
  riskEventsTriggered: RiskEvent[];
}

export interface PreTradeChecker {
  validate(order: OrderRequest): Promise<import('./risk-engine').RiskCheckResult>;
}

export interface PostTradeUpdater {
  processExecution(execution: ExecutionReport): Promise<PostTradeResult>;
}
