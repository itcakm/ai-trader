/**
 * Exchange Rate Limit Type Definitions
 * Requirements: 9.1, 9.3
 */

import { ExchangeId } from './exchange';

// Rate limit categories
export type RateLimitCategory = 'ORDERS' | 'QUERIES' | 'WEBSOCKET' | 'WEIGHT';

// Request priority levels
export type RequestPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

// Current state of rate limits for an exchange
export interface RateLimitState {
  exchangeId: ExchangeId;
  tenantId: string;
  category: RateLimitCategory;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  reservedForCritical: number;
}

// Limit configuration for a category
export interface CategoryLimit {
  category: RateLimitCategory;
  requestsPerSecond: number;
  requestsPerMinute: number;
  weight?: number; // For weight-based limits
}

// Complete rate limit configuration for an exchange
export interface RateLimitConfig {
  exchangeId: ExchangeId;
  limits: CategoryLimit[];
  criticalReservationPercent: number; // Reserve for cancellations
  warningThresholdPercent: number;
  burstAllowed: boolean;
}

// Request waiting in queue
export interface QueuedRequest {
  requestId: string;
  category: RateLimitCategory;
  priority: RequestPriority;
  request: () => Promise<unknown>;
  queuedAt: string;
  estimatedExecutionAt?: string;
}

// Result of rate limit check
export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  waitMs?: number;
  category: RateLimitCategory;
}

// Status of the request queue
export interface QueueStatus {
  exchangeId: ExchangeId;
  queuedRequests: number;
  criticalRequests: number;
  estimatedClearTimeMs: number;
  oldestRequestAge: number;
}
