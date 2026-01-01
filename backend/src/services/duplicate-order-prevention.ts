/**
 * Duplicate Order Prevention Service
 *
 * Provides mechanisms to prevent duplicate order submissions by:
 * - Verifying order status with exchange before retrying
 * - Tracking idempotency keys to detect duplicate requests
 * - Managing order submission state during retry scenarios
 *
 * Requirements: 10.3, 10.4
 */

import { ExchangeId } from '../types/exchange';
import { Order, OrderRequest, OrderStatus, OrderResponse } from '../types/exchange-order';
import { ExchangeOrderRepository } from '../repositories/exchange-order';

/**
 * Result of order existence check on exchange
 */
export interface OrderExistenceResult {
  exists: boolean;
  order?: Order;
  exchangeOrderId?: string;
  status?: OrderStatus;
  checkedAt: string;
}

/**
 * Result of duplicate check
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingOrder?: Order;
  reason?: string;
}

/**
 * Idempotency record for tracking order submissions
 */
export interface IdempotencyRecord {
  idempotencyKey: string;
  tenantId: string;
  orderId: string;
  exchangeId: ExchangeId;
  status: 'PENDING' | 'SUBMITTED' | 'COMPLETED' | 'FAILED';
  response?: OrderResponse;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * Interface for exchange adapter operations needed for duplicate prevention
 */
export interface ExchangeAdapterForDuplicatePrevention {
  getOrderStatus(orderId: string, exchangeOrderId: string): Promise<OrderStatus>;
}

/**
 * In-memory store for idempotency records (in production, use DynamoDB)
 */
const idempotencyStore = new Map<string, IdempotencyRecord>();

/**
 * Default TTL for idempotency records (24 hours)
 */
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Duplicate Order Prevention Service
 */
export const DuplicateOrderPreventionService = {
  /**
   * Registry of exchange adapters for status verification
   */
  adapters: new Map<string, ExchangeAdapterForDuplicatePrevention>(),

  /**
   * Register an exchange adapter for status verification
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param adapter - The exchange adapter
   */
  registerAdapter(
    tenantId: string,
    exchangeId: ExchangeId,
    adapter: ExchangeAdapterForDuplicatePrevention
  ): void {
    const key = `${tenantId}:${exchangeId}`;
    this.adapters.set(key, adapter);
  },

  /**
   * Get an exchange adapter
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns The exchange adapter, or undefined if not found
   */
  getAdapter(
    tenantId: string,
    exchangeId: ExchangeId
  ): ExchangeAdapterForDuplicatePrevention | undefined {
    const key = `${tenantId}:${exchangeId}`;
    return this.adapters.get(key);
  },

  /**
   * Check if an order exists on the exchange before retrying submission
   *
   * This method verifies the order status with the exchange to prevent
   * duplicate submissions when retrying after a failure.
   *
   * Requirements: 10.3
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The internal order identifier
   * @param exchangeId - The exchange identifier
   * @param exchangeOrderId - The exchange order identifier (if known)
   * @returns Result indicating if order exists on exchange
   */
  async verifyOrderStatusBeforeRetry(
    tenantId: string,
    orderId: string,
    exchangeId: ExchangeId,
    exchangeOrderId?: string
  ): Promise<OrderExistenceResult> {
    const now = new Date().toISOString();

    // First, check our internal records
    const internalOrder = await ExchangeOrderRepository.getOrder(tenantId, orderId);

    if (internalOrder) {
      // If we have an exchange order ID, verify with exchange
      if (internalOrder.exchangeOrderId || exchangeOrderId) {
        const adapter = this.getAdapter(tenantId, exchangeId);
        
        if (adapter) {
          try {
            const exchangeStatus = await adapter.getOrderStatus(
              orderId,
              internalOrder.exchangeOrderId || exchangeOrderId!
            );

            return {
              exists: true,
              order: internalOrder,
              exchangeOrderId: internalOrder.exchangeOrderId || exchangeOrderId,
              status: exchangeStatus,
              checkedAt: now,
            };
          } catch (error) {
            // If we can't verify with exchange, use internal state
            return {
              exists: true,
              order: internalOrder,
              exchangeOrderId: internalOrder.exchangeOrderId,
              status: internalOrder.status,
              checkedAt: now,
            };
          }
        }

        // No adapter available, use internal state
        return {
          exists: true,
          order: internalOrder,
          exchangeOrderId: internalOrder.exchangeOrderId,
          status: internalOrder.status,
          checkedAt: now,
        };
      }

      // Order exists internally but no exchange order ID
      // This means it was never successfully submitted
      return {
        exists: false,
        order: internalOrder,
        checkedAt: now,
      };
    }

    // No internal record found
    return {
      exists: false,
      checkedAt: now,
    };
  },

  /**
   * Check for duplicate order submission using idempotency key
   *
   * Requirements: 10.3
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   * @returns Result indicating if this is a duplicate submission
   */
  async checkForDuplicate(
    tenantId: string,
    idempotencyKey: string
  ): Promise<DuplicateCheckResult> {
    // Check internal repository first
    const existingOrder = await ExchangeOrderRepository.getOrderByIdempotencyKey(
      tenantId,
      idempotencyKey
    );

    if (existingOrder) {
      return {
        isDuplicate: true,
        existingOrder,
        reason: `Order with idempotency key '${idempotencyKey}' already exists`,
      };
    }

    // Check idempotency store for in-flight submissions
    const idempotencyRecord = this.getIdempotencyRecord(tenantId, idempotencyKey);

    if (idempotencyRecord) {
      // Check if record has expired
      if (new Date(idempotencyRecord.expiresAt) > new Date()) {
        // Record is still valid
        if (idempotencyRecord.status === 'PENDING' || idempotencyRecord.status === 'SUBMITTED') {
          return {
            isDuplicate: true,
            reason: `Order submission with idempotency key '${idempotencyKey}' is already in progress`,
          };
        }

        if (idempotencyRecord.status === 'COMPLETED') {
          // Try to get the completed order
          const completedOrder = await ExchangeOrderRepository.getOrder(
            tenantId,
            idempotencyRecord.orderId
          );

          return {
            isDuplicate: true,
            existingOrder: completedOrder || undefined,
            reason: `Order with idempotency key '${idempotencyKey}' was already completed`,
          };
        }
      } else {
        // Record has expired, clean it up
        this.removeIdempotencyRecord(tenantId, idempotencyKey);
      }
    }

    return {
      isDuplicate: false,
    };
  },

  /**
   * Determine if an order should be retried based on current state
   *
   * Requirements: 10.3
   *
   * @param tenantId - The tenant identifier
   * @param orderRequest - The order request to potentially retry
   * @returns True if the order should be retried, false if it already exists
   */
  async shouldRetryOrder(
    tenantId: string,
    orderRequest: OrderRequest
  ): Promise<{ shouldRetry: boolean; reason: string; existingOrder?: Order }> {
    // Check for duplicate using idempotency key
    const duplicateCheck = await this.checkForDuplicate(
      tenantId,
      orderRequest.idempotencyKey
    );

    if (duplicateCheck.isDuplicate) {
      return {
        shouldRetry: false,
        reason: duplicateCheck.reason || 'Duplicate order detected',
        existingOrder: duplicateCheck.existingOrder,
      };
    }

    // If we have an order ID, verify status before retry
    if (orderRequest.orderId && orderRequest.exchangeId) {
      const existenceResult = await this.verifyOrderStatusBeforeRetry(
        tenantId,
        orderRequest.orderId,
        orderRequest.exchangeId
      );

      if (existenceResult.exists && existenceResult.status) {
        // Order exists on exchange - don't retry
        const terminalStatuses: OrderStatus[] = ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'];
        const activeStatuses: OrderStatus[] = ['PENDING', 'OPEN', 'PARTIALLY_FILLED'];

        if (terminalStatuses.includes(existenceResult.status)) {
          return {
            shouldRetry: false,
            reason: `Order already completed with status '${existenceResult.status}'`,
            existingOrder: existenceResult.order,
          };
        }

        if (activeStatuses.includes(existenceResult.status)) {
          return {
            shouldRetry: false,
            reason: `Order already active with status '${existenceResult.status}'`,
            existingOrder: existenceResult.order,
          };
        }
      }
    }

    return {
      shouldRetry: true,
      reason: 'Order can be submitted',
    };
  },

  /**
   * Create an idempotency record for tracking order submission
   *
   * Requirements: 10.4
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   * @param orderId - The order identifier
   * @param exchangeId - The exchange identifier
   * @param ttlMs - Time-to-live in milliseconds (default 24 hours)
   * @returns The created idempotency record
   */
  createIdempotencyRecord(
    tenantId: string,
    idempotencyKey: string,
    orderId: string,
    exchangeId: ExchangeId,
    ttlMs: number = DEFAULT_IDEMPOTENCY_TTL_MS
  ): IdempotencyRecord {
    const now = new Date();
    const record: IdempotencyRecord = {
      idempotencyKey,
      tenantId,
      orderId,
      exchangeId,
      status: 'PENDING',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };

    const key = `${tenantId}:${idempotencyKey}`;
    idempotencyStore.set(key, record);

    return record;
  },

  /**
   * Get an idempotency record
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   * @returns The idempotency record, or undefined if not found
   */
  getIdempotencyRecord(
    tenantId: string,
    idempotencyKey: string
  ): IdempotencyRecord | undefined {
    const key = `${tenantId}:${idempotencyKey}`;
    return idempotencyStore.get(key);
  },

  /**
   * Update an idempotency record status
   *
   * Requirements: 10.4
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   * @param status - The new status
   * @param response - Optional order response for completed submissions
   * @returns The updated record, or undefined if not found
   */
  updateIdempotencyRecord(
    tenantId: string,
    idempotencyKey: string,
    status: IdempotencyRecord['status'],
    response?: OrderResponse
  ): IdempotencyRecord | undefined {
    const key = `${tenantId}:${idempotencyKey}`;
    const record = idempotencyStore.get(key);

    if (!record) {
      return undefined;
    }

    const updatedRecord: IdempotencyRecord = {
      ...record,
      status,
      response,
      updatedAt: new Date().toISOString(),
    };

    idempotencyStore.set(key, updatedRecord);

    return updatedRecord;
  },

  /**
   * Remove an idempotency record
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   */
  removeIdempotencyRecord(tenantId: string, idempotencyKey: string): void {
    const key = `${tenantId}:${idempotencyKey}`;
    idempotencyStore.delete(key);
  },

  /**
   * Clear all idempotency records (for testing)
   */
  clearAllIdempotencyRecords(): void {
    idempotencyStore.clear();
  },

  /**
   * Get all idempotency records for a tenant (for debugging/monitoring)
   *
   * @param tenantId - The tenant identifier
   * @returns Array of idempotency records
   */
  getIdempotencyRecordsForTenant(tenantId: string): IdempotencyRecord[] {
    const records: IdempotencyRecord[] = [];
    
    for (const [key, record] of idempotencyStore.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        records.push(record);
      }
    }

    return records;
  },

  /**
   * Clean up expired idempotency records
   *
   * @returns Number of records cleaned up
   */
  cleanupExpiredRecords(): number {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, record] of idempotencyStore.entries()) {
      if (new Date(record.expiresAt) <= now) {
        idempotencyStore.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  },
};
