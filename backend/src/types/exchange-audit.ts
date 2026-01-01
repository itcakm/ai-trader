/**
 * Exchange Audit Types
 * 
 * Types for logging and auditing all exchange REST API operations.
 * 
 * Requirements: 2.6
 */

import { ExchangeId } from './exchange';

/**
 * Types of operations that can be audited
 */
export type ExchangeOperationType =
  | 'ORDER_SUBMIT'
  | 'ORDER_CANCEL'
  | 'ORDER_MODIFY'
  | 'ORDER_STATUS'
  | 'BALANCE_QUERY'
  | 'POSITION_QUERY';

/**
 * Exchange audit log entry
 * 
 * Records all REST API requests and responses for debugging and compliance.
 */
export interface ExchangeAuditLog {
  /** Unique identifier for this log entry */
  logId: string;
  /** Tenant identifier for isolation */
  tenantId: string;
  /** Exchange this operation was performed on */
  exchangeId: ExchangeId;
  /** Type of operation performed */
  operationType: ExchangeOperationType;
  /** The request payload sent to the exchange */
  requestPayload: unknown;
  /** The response payload received from the exchange */
  responsePayload: unknown;
  /** Time taken for the operation in milliseconds */
  latencyMs: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error details if the operation failed */
  errorDetails?: string;
  /** ISO timestamp when the operation was performed */
  timestamp: string;
  /** TTL for automatic expiration (Unix timestamp in seconds) */
  expiresAt?: number;
}

/**
 * Input for creating an audit log entry
 */
export interface CreateExchangeAuditLogInput {
  tenantId: string;
  exchangeId: ExchangeId;
  operationType: ExchangeOperationType;
  requestPayload: unknown;
  responsePayload: unknown;
  latencyMs: number;
  success: boolean;
  errorDetails?: string;
}

/**
 * Filters for querying audit logs
 */
export interface ExchangeAuditFilters {
  /** Filter by exchange */
  exchangeId?: ExchangeId;
  /** Filter by operation type */
  operationType?: ExchangeOperationType;
  /** Filter by success status */
  success?: boolean;
  /** Start of time range (ISO string) */
  startTime?: string;
  /** End of time range (ISO string) */
  endTime?: string;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Statistics for exchange operations
 */
export interface ExchangeOperationStats {
  /** Total number of operations */
  totalOperations: number;
  /** Success rate as a decimal (0-1) */
  successRate: number;
  /** Average latency in milliseconds */
  averageLatencyMs: number;
  /** 95th percentile latency in milliseconds */
  p95LatencyMs: number;
  /** Count of errors by category */
  errorsByType: Record<string, number>;
  /** Time period for these stats */
  period: string;
  /** Exchange these stats are for */
  exchangeId: ExchangeId;
}
