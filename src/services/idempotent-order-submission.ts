/**
 * Idempotent Order Submission Service
 *
 * Provides idempotent order submission capabilities by:
 * - Including idempotency keys in all order submissions
 * - Handling idempotent responses from exchanges
 * - Returning existing orders for duplicate submissions
 *
 * Requirements: 10.4
 */

import { ExchangeId } from '../types/exchange';
import { OrderRequest, OrderResponse, Order, OrderStatus } from '../types/exchange-order';
import { ExchangeOrderRepository } from '../repositories/exchange-order';
import {
  DuplicateOrderPreventionService,
  IdempotencyRecord,
} from './duplicate-order-prevention';
import { generateUUID } from '../utils/uuid';

/**
 * Result of idempotent order submission
 */
export interface IdempotentSubmissionResult {
  success: boolean;
  response?: OrderResponse;
  existingOrder?: Order;
  isIdempotentResponse: boolean;
  idempotencyKey: string;
  error?: string;
}

/**
 * Interface for exchange adapter that supports idempotent submissions
 */
export interface IdempotentExchangeAdapter {
  submitOrder(order: OrderRequest): Promise<OrderResponse>;
  supportsIdempotency(): boolean;
  getOrderByIdempotencyKey?(idempotencyKey: string): Promise<Order | null>;
}

/**
 * Idempotent Order Submission Service
 */
export const IdempotentOrderSubmissionService = {
  /**
   * Registry of exchange adapters
   */
  adapters: new Map<string, IdempotentExchangeAdapter>(),

  /**
   * Register an exchange adapter
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param adapter - The exchange adapter
   */
  registerAdapter(
    tenantId: string,
    exchangeId: ExchangeId,
    adapter: IdempotentExchangeAdapter
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
  ): IdempotentExchangeAdapter | undefined {
    const key = `${tenantId}:${exchangeId}`;
    return this.adapters.get(key);
  },

  /**
   * Submit an order with idempotency guarantees
   *
   * This method ensures that:
   * 1. The idempotency key is included in the submission
   * 2. Duplicate submissions return the existing order
   * 3. The submission state is tracked throughout the process
   *
   * Requirements: 10.4
   *
   * @param tenantId - The tenant identifier
   * @param orderRequest - The order request
   * @param exchangeId - The exchange identifier
   * @returns The idempotent submission result
   */
  async submitOrderIdempotently(
    tenantId: string,
    orderRequest: OrderRequest,
    exchangeId: ExchangeId
  ): Promise<IdempotentSubmissionResult> {
    const idempotencyKey = orderRequest.idempotencyKey || generateUUID();

    // Ensure the request has an idempotency key
    const requestWithKey: OrderRequest = {
      ...orderRequest,
      idempotencyKey,
    };

    // Check for existing order with this idempotency key
    const existingOrder = await ExchangeOrderRepository.getOrderByIdempotencyKey(
      tenantId,
      idempotencyKey
    );

    if (existingOrder) {
      // Return the existing order - this is an idempotent response
      return {
        success: true,
        existingOrder,
        isIdempotentResponse: true,
        idempotencyKey,
        response: this.orderToResponse(existingOrder),
      };
    }

    // Check for in-flight submission with this idempotency key
    const idempotencyRecord = DuplicateOrderPreventionService.getIdempotencyRecord(
      tenantId,
      idempotencyKey
    );

    if (idempotencyRecord) {
      // Check if the record has expired
      if (new Date(idempotencyRecord.expiresAt) > new Date()) {
        if (idempotencyRecord.status === 'PENDING' || idempotencyRecord.status === 'SUBMITTED') {
          // Submission is in progress
          return {
            success: false,
            isIdempotentResponse: true,
            idempotencyKey,
            error: 'Order submission is already in progress',
          };
        }

        if (idempotencyRecord.status === 'COMPLETED' && idempotencyRecord.response) {
          // Return the completed response
          return {
            success: true,
            response: idempotencyRecord.response,
            isIdempotentResponse: true,
            idempotencyKey,
          };
        }
      }
    }

    // Create idempotency record to track this submission
    const orderId = requestWithKey.orderId || generateUUID();
    DuplicateOrderPreventionService.createIdempotencyRecord(
      tenantId,
      idempotencyKey,
      orderId,
      exchangeId
    );

    // Update status to SUBMITTED
    DuplicateOrderPreventionService.updateIdempotencyRecord(
      tenantId,
      idempotencyKey,
      'SUBMITTED'
    );

    try {
      // Get the exchange adapter
      const adapter = this.getAdapter(tenantId, exchangeId);

      if (!adapter) {
        // No adapter - mark as failed
        DuplicateOrderPreventionService.updateIdempotencyRecord(
          tenantId,
          idempotencyKey,
          'FAILED'
        );

        return {
          success: false,
          isIdempotentResponse: false,
          idempotencyKey,
          error: `No adapter registered for exchange ${exchangeId}`,
        };
      }

      // Check if exchange supports idempotency and has the order
      if (adapter.supportsIdempotency() && adapter.getOrderByIdempotencyKey) {
        const exchangeOrder = await adapter.getOrderByIdempotencyKey(idempotencyKey);
        
        if (exchangeOrder) {
          // Exchange already has this order - return it
          DuplicateOrderPreventionService.updateIdempotencyRecord(
            tenantId,
            idempotencyKey,
            'COMPLETED',
            this.orderToResponse(exchangeOrder)
          );

          return {
            success: true,
            existingOrder: exchangeOrder,
            isIdempotentResponse: true,
            idempotencyKey,
            response: this.orderToResponse(exchangeOrder),
          };
        }
      }

      // Submit the order
      const response = await adapter.submitOrder({
        ...requestWithKey,
        orderId,
      });

      // Mark as completed
      DuplicateOrderPreventionService.updateIdempotencyRecord(
        tenantId,
        idempotencyKey,
        'COMPLETED',
        response
      );

      return {
        success: true,
        response,
        isIdempotentResponse: false,
        idempotencyKey,
      };
    } catch (error) {
      // Mark as failed
      DuplicateOrderPreventionService.updateIdempotencyRecord(
        tenantId,
        idempotencyKey,
        'FAILED'
      );

      return {
        success: false,
        isIdempotentResponse: false,
        idempotencyKey,
        error: error instanceof Error ? error.message : 'Order submission failed',
      };
    }
  },

  /**
   * Get the result of a previous idempotent submission
   *
   * Requirements: 10.4
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   * @returns The submission result, or null if not found
   */
  async getIdempotentResult(
    tenantId: string,
    idempotencyKey: string
  ): Promise<IdempotentSubmissionResult | null> {
    // Check for existing order
    const existingOrder = await ExchangeOrderRepository.getOrderByIdempotencyKey(
      tenantId,
      idempotencyKey
    );

    if (existingOrder) {
      return {
        success: true,
        existingOrder,
        isIdempotentResponse: true,
        idempotencyKey,
        response: this.orderToResponse(existingOrder),
      };
    }

    // Check idempotency record
    const record = DuplicateOrderPreventionService.getIdempotencyRecord(
      tenantId,
      idempotencyKey
    );

    if (!record) {
      return null;
    }

    if (record.status === 'COMPLETED' && record.response) {
      return {
        success: true,
        response: record.response,
        isIdempotentResponse: true,
        idempotencyKey,
      };
    }

    if (record.status === 'FAILED') {
      return {
        success: false,
        isIdempotentResponse: true,
        idempotencyKey,
        error: 'Previous submission failed',
      };
    }

    if (record.status === 'PENDING' || record.status === 'SUBMITTED') {
      return {
        success: false,
        isIdempotentResponse: true,
        idempotencyKey,
        error: 'Submission is in progress',
      };
    }

    return null;
  },

  /**
   * Generate a unique idempotency key
   *
   * Requirements: 10.4
   *
   * @param prefix - Optional prefix for the key
   * @returns A unique idempotency key
   */
  generateIdempotencyKey(prefix?: string): string {
    const uuid = generateUUID();
    return prefix ? `${prefix}-${uuid}` : uuid;
  },

  /**
   * Validate an idempotency key format
   *
   * @param idempotencyKey - The key to validate
   * @returns True if the key is valid
   */
  isValidIdempotencyKey(idempotencyKey: string): boolean {
    // Key must be non-empty and not too long
    if (!idempotencyKey || idempotencyKey.length === 0) {
      return false;
    }

    if (idempotencyKey.length > 256) {
      return false;
    }

    // Key should only contain alphanumeric characters, hyphens, and underscores
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(idempotencyKey);
  },

  /**
   * Convert an Order to an OrderResponse
   *
   * @param order - The order to convert
   * @returns The order response
   */
  orderToResponse(order: Order): OrderResponse {
    return {
      orderId: order.orderId,
      exchangeOrderId: order.exchangeOrderId || '',
      exchangeId: order.exchangeId,
      status: order.status,
      filledQuantity: order.filledQuantity,
      remainingQuantity: order.remainingQuantity,
      averagePrice: order.averageFilledPrice,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  },

  /**
   * Clear all adapters (for testing)
   */
  clearAdapters(): void {
    this.adapters.clear();
  },
};
