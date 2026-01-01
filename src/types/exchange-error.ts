/**
 * Exchange Error Handling Type Definitions
 * Requirements: 10.1
 */

import { ExchangeId } from './exchange';
import { OrderStatus } from './exchange-order';

// Error classification categories
export type ErrorCategory =
  | 'RETRYABLE'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'EXCHANGE_ERROR'
  | 'FATAL';

// Structured exchange error
export interface ExchangeError {
  errorId: string;
  exchangeId: ExchangeId;
  category: ErrorCategory;
  code: string;
  message: string;
  originalError?: unknown;
  retryable: boolean;
  retryAfterMs?: number;
  timestamp: string;
}

// Configuration for retry behavior
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  retryableCategories: ErrorCategory[];
}

// Order stuck in uncertain state
export interface StuckOrder {
  orderId: string;
  exchangeOrderId?: string;
  exchangeId: ExchangeId;
  status: OrderStatus;
  lastKnownStatus: OrderStatus;
  stuckSince: string;
  resolutionAttempts: number;
  requiresManualIntervention: boolean;
}

// Resolution action types
export type OrderResolutionAction =
  | 'CANCEL'
  | 'MARK_FILLED'
  | 'MARK_REJECTED'
  | 'RECONCILE';

// Manual resolution for stuck orders
export interface OrderResolution {
  action: OrderResolutionAction;
  reason: string;
  resolvedBy: string;
}
