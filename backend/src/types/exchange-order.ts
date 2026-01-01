/**
 * Exchange Order Type Definitions
 * Requirements: 5.1, 5.2, 5.5, 5.6
 */

import { ExchangeId } from './exchange';

// Order execution types
export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_LIMIT'
  | 'STOP_MARKET'
  | 'TRAILING_STOP';

// Order direction
export type OrderSide = 'BUY' | 'SELL';

// Order lifecycle status
export type OrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

// Time-in-force options
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTD';

// Order submission request
export interface OrderRequest {
  orderId: string; // Internal unique ID
  tenantId: string;
  strategyId: string;
  assetId: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price?: number; // Required for LIMIT orders
  stopPrice?: number; // Required for STOP orders
  trailingDelta?: number; // For TRAILING_STOP
  timeInForce: TimeInForce;
  expiresAt?: string; // For GTD orders
  exchangeId?: ExchangeId; // Optional - router selects if not specified
  idempotencyKey: string; // For duplicate prevention
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// Response from order submission
export interface OrderResponse {
  orderId: string;
  exchangeOrderId: string;
  exchangeId: ExchangeId;
  status: OrderStatus;
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice?: number;
  commission?: number;
  commissionAsset?: string;
  createdAt: string;
  updatedAt: string;
}

// Order modification request
export interface OrderModification {
  newPrice?: number;
  newQuantity?: number;
  newStopPrice?: number;
}

// Response from order cancellation
export interface CancelResponse {
  orderId: string;
  exchangeOrderId: string;
  status: 'CANCELLED' | 'PENDING_CANCEL' | 'FAILED';
  reason?: string;
  cancelledAt?: string;
}

// Real-time order status update
export interface OrderUpdate {
  orderId: string;
  exchangeOrderId: string;
  exchangeId: ExchangeId;
  status: OrderStatus;
  filledQuantity: number;
  remainingQuantity: number;
  lastFilledPrice?: number;
  lastFilledQuantity?: number;
  timestamp: string;
}

// Execution/trade update
export interface ExecutionUpdate {
  executionId: string;
  orderId: string;
  exchangeOrderId: string;
  exchangeId: ExchangeId;
  side: OrderSide;
  quantity: number;
  price: number;
  commission: number;
  commissionAsset: string;
  timestamp: string;
}

// Individual fill record
export interface Fill {
  fillId: string;
  executionId: string;
  quantity: number;
  price: number;
  commission: number;
  commissionAsset: string;
  timestamp: string;
}

// Complete order record with full lifecycle data
export interface Order {
  orderId: string;
  tenantId: string;
  strategyId: string;
  exchangeId: ExchangeId;
  exchangeOrderId?: string;
  assetId: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  stopPrice?: number;
  averageFilledPrice?: number;
  timeInForce: TimeInForce;
  status: OrderStatus;
  idempotencyKey: string;
  fills: Fill[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  completedAt?: string;
}

// Filters for querying orders
export interface OrderFilters {
  strategyId?: string;
  exchangeId?: ExchangeId;
  assetId?: string;
  status?: OrderStatus[];
  side?: OrderSide;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

// Result of order reconciliation
export interface ReconciliationResult {
  ordersChecked: number;
  discrepancies: OrderDiscrepancy[];
  reconciled: boolean;
  timestamp: string;
}

// Individual order discrepancy
export interface OrderDiscrepancy {
  orderId: string;
  field: string;
  internalValue: unknown;
  exchangeValue: unknown;
  resolved: boolean;
}
