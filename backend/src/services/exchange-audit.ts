/**
 * Exchange Audit Service
 *
 * Provides audit logging functionality for all exchange REST API operations.
 * Records requests, responses, timestamps, latency, and success status.
 *
 * Requirements: 2.6
 */

import {
  ExchangeAuditLog,
  ExchangeAuditFilters,
  ExchangeOperationStats,
  ExchangeOperationType,
  CreateExchangeAuditLogInput,
} from '../types/exchange-audit';
import { ExchangeId } from '../types/exchange';
import { ExchangeAuditRepository } from '../repositories/exchange-audit';
import { generateUUID } from '../utils/uuid';

/**
 * Configuration for the Exchange Audit Service
 */
export interface ExchangeAuditServiceConfig {
  /** Default TTL in days for audit logs */
  defaultTTLDays: number;
  /** Maximum records per query */
  maxQueryLimit: number;
  /** Whether to log request/response payloads (can be disabled for sensitive data) */
  logPayloads: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExchangeAuditServiceConfig = {
  defaultTTLDays: 90,
  maxQueryLimit: 1000,
  logPayloads: true,
};

/**
 * Validates that an audit log contains all required fields
 *
 * Requirements: 2.6
 */
export function validateAuditLogCompleteness(log: ExchangeAuditLog): {
  valid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  // Check required fields
  if (!log.logId) missingFields.push('logId');
  if (!log.tenantId) missingFields.push('tenantId');
  if (!log.exchangeId) missingFields.push('exchangeId');
  if (!log.operationType) missingFields.push('operationType');
  if (!log.timestamp) missingFields.push('timestamp');
  if (log.latencyMs === undefined || log.latencyMs === null) missingFields.push('latencyMs');
  if (log.success === undefined || log.success === null) missingFields.push('success');

  // Request and response payloads should be present (can be null but not undefined)
  if (log.requestPayload === undefined) missingFields.push('requestPayload');
  if (log.responsePayload === undefined) missingFields.push('responsePayload');

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Exchange Audit Service
 *
 * Provides complete audit trail functionality for exchange operations.
 * All REST API requests and responses are logged for compliance and debugging.
 *
 * Requirements: 2.6
 */
export const ExchangeAuditService = {
  config: { ...DEFAULT_CONFIG } as ExchangeAuditServiceConfig,

  /**
   * Configure the service
   */
  configure(config: Partial<ExchangeAuditServiceConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  },

  /**
   * Create an audit log entry with all required fields
   *
   * Requirements: 2.6
   *
   * @param input - The input data for creating the audit log
   * @returns The created audit log entry
   */
  createAuditLog(input: CreateExchangeAuditLogInput): ExchangeAuditLog {
    const now = new Date();
    const ttlDays = this.config.defaultTTLDays;
    const expiresAt = Math.floor((now.getTime() + ttlDays * 24 * 60 * 60 * 1000) / 1000);

    const log: ExchangeAuditLog = {
      logId: generateUUID(),
      tenantId: input.tenantId,
      exchangeId: input.exchangeId,
      operationType: input.operationType,
      requestPayload: this.config.logPayloads ? input.requestPayload : '[REDACTED]',
      responsePayload: this.config.logPayloads ? input.responsePayload : '[REDACTED]',
      latencyMs: input.latencyMs,
      success: input.success,
      errorDetails: input.errorDetails,
      timestamp: now.toISOString(),
      expiresAt,
    };

    return log;
  },

  /**
   * Log an exchange operation
   *
   * Requirements: 2.6
   *
   * @param log - The audit log entry to store
   */
  async logOperation(log: ExchangeAuditLog): Promise<void> {
    // Validate completeness before storing
    const validation = validateAuditLogCompleteness(log);
    if (!validation.valid) {
      console.warn('Exchange audit log missing fields:', validation.missingFields);
      // Still store the log, but warn about missing fields
    }

    await ExchangeAuditRepository.putAuditLog(log, this.config.defaultTTLDays);
  },

  /**
   * Create and log an operation in one call
   *
   * Requirements: 2.6
   *
   * @param input - The input data for creating the audit log
   * @returns The created and stored audit log entry
   */
  async createAndLogOperation(input: CreateExchangeAuditLogInput): Promise<ExchangeAuditLog> {
    const log = this.createAuditLog(input);
    await this.logOperation(log);
    return log;
  },

  /**
   * Get audit logs for a tenant with optional filters
   *
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters for the query
   * @returns List of audit log entries
   */
  async getAuditLogs(
    tenantId: string,
    filters?: ExchangeAuditFilters
  ): Promise<ExchangeAuditLog[]> {
    // Enforce maximum query limit
    const effectiveFilters: ExchangeAuditFilters = {
      ...filters,
      limit: Math.min(filters?.limit ?? this.config.maxQueryLimit, this.config.maxQueryLimit),
    };

    return ExchangeAuditRepository.listAuditLogs(tenantId, effectiveFilters);
  },

  /**
   * Get a specific audit log entry
   *
   * @param tenantId - The tenant identifier
   * @param timestamp - The timestamp of the log entry
   * @param logId - The log entry identifier
   * @returns The audit log entry, or null if not found
   */
  async getAuditLog(
    tenantId: string,
    timestamp: string,
    logId: string
  ): Promise<ExchangeAuditLog | null> {
    return ExchangeAuditRepository.getAuditLog(tenantId, timestamp, logId);
  },

  /**
   * Get audit logs for a specific exchange
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param limit - Maximum number of results
   * @returns List of audit log entries for the exchange
   */
  async getAuditLogsByExchange(
    tenantId: string,
    exchangeId: ExchangeId,
    limit?: number
  ): Promise<ExchangeAuditLog[]> {
    return this.getAuditLogs(tenantId, { exchangeId, limit });
  },

  /**
   * Get audit logs for a specific operation type
   *
   * @param tenantId - The tenant identifier
   * @param operationType - The operation type
   * @param limit - Maximum number of results
   * @returns List of audit log entries for the operation type
   */
  async getAuditLogsByOperationType(
    tenantId: string,
    operationType: ExchangeOperationType,
    limit?: number
  ): Promise<ExchangeAuditLog[]> {
    return this.getAuditLogs(tenantId, { operationType, limit });
  },

  /**
   * Get failed operations
   *
   * @param tenantId - The tenant identifier
   * @param limit - Maximum number of results
   * @returns List of failed audit log entries
   */
  async getFailedOperations(
    tenantId: string,
    limit?: number
  ): Promise<ExchangeAuditLog[]> {
    return this.getAuditLogs(tenantId, { success: false, limit });
  },

  /**
   * Get operation statistics for an exchange
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param period - Time period (e.g., '1h', '24h', '7d')
   * @returns Operation statistics
   */
  async getOperationStats(
    tenantId: string,
    exchangeId: ExchangeId,
    period: string
  ): Promise<ExchangeOperationStats> {
    // Calculate time range based on period
    const now = new Date();
    let startTime: Date;

    switch (period) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
    }

    // Get all logs for the period
    const logs = await this.getAuditLogs(tenantId, {
      exchangeId,
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      limit: this.config.maxQueryLimit,
    });

    // Calculate statistics
    const totalOperations = logs.length;
    const successfulOperations = logs.filter((log) => log.success).length;
    const successRate = totalOperations > 0 ? successfulOperations / totalOperations : 0;

    // Calculate latency statistics
    const latencies = logs.map((log) => log.latencyMs).sort((a, b) => a - b);
    const averageLatencyMs =
      latencies.length > 0
        ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
        : 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95LatencyMs = latencies.length > 0 ? latencies[p95Index] || latencies[latencies.length - 1] : 0;

    // Count errors by type
    const errorsByType: Record<string, number> = {};
    for (const log of logs) {
      if (!log.success && log.errorDetails) {
        // Extract error type from error details (simplified)
        const errorType = log.errorDetails.split(':')[0] || 'UNKNOWN';
        errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      }
    }

    return {
      totalOperations,
      successRate,
      averageLatencyMs,
      p95LatencyMs,
      errorsByType,
      period,
      exchangeId,
    };
  },

  /**
   * Count audit logs for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters
   * @returns Count of matching audit logs
   */
  async countAuditLogs(
    tenantId: string,
    filters?: ExchangeAuditFilters
  ): Promise<number> {
    return ExchangeAuditRepository.countAuditLogs(tenantId, filters);
  },

  /**
   * Delete an audit log entry
   *
   * @param tenantId - The tenant identifier
   * @param timestamp - The timestamp of the log entry
   * @param logId - The log entry identifier
   */
  async deleteAuditLog(
    tenantId: string,
    timestamp: string,
    logId: string
  ): Promise<void> {
    await ExchangeAuditRepository.deleteAuditLog(tenantId, timestamp, logId);
  },
};
