/**
 * Exchange Manual Intervention Service
 *
 * Handles stuck orders that remain in uncertain states beyond a configured threshold.
 * Provides methods for identifying, resolving, and managing orders that require
 * manual intervention.
 *
 * Requirements: 10.6
 */

import {
  Order,
  OrderStatus,
  CancelResponse,
} from '../types/exchange-order';
import {
  StuckOrder,
  OrderResolution,
  OrderResolutionAction,
} from '../types/exchange-error';
import { ExchangeId } from '../types/exchange';
import { ExchangeOrderRepository } from '../repositories/exchange-order';
import { ExchangeOrderManager } from './exchange-order-manager';
import { generateUUID } from '../utils/uuid';

/**
 * Configuration for stuck order detection
 */
export interface StuckOrderConfig {
  /** Time in milliseconds after which a PENDING order is considered stuck */
  pendingThresholdMs: number;
  /** Time in milliseconds after which an OPEN order with no updates is considered stuck */
  openNoUpdateThresholdMs: number;
  /** Maximum resolution attempts before requiring manual intervention */
  maxResolutionAttempts: number;
}

/**
 * Default configuration for stuck order detection
 */
export const DEFAULT_STUCK_ORDER_CONFIG: StuckOrderConfig = {
  pendingThresholdMs: 5 * 60 * 1000, // 5 minutes
  openNoUpdateThresholdMs: 30 * 60 * 1000, // 30 minutes
  maxResolutionAttempts: 3,
};

/**
 * Error thrown when a stuck order is not found
 */
export class StuckOrderNotFoundError extends Error {
  constructor(tenantId: string, orderId: string) {
    super(`Stuck order '${orderId}' not found for tenant '${tenantId}'`);
    this.name = 'StuckOrderNotFoundError';
  }
}

/**
 * Error thrown when resolution fails
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    public readonly orderId: string,
    public readonly action: OrderResolutionAction
  ) {
    super(message);
    this.name = 'ResolutionError';
  }
}

/**
 * In-memory store for stuck order tracking
 * In production, this would be persisted to DynamoDB
 */
const stuckOrderStore = new Map<string, StuckOrder>();

/**
 * Determines if an order is stuck based on its status and timestamps
 *
 * @param order - The order to check
 * @param config - Configuration for stuck order detection
 * @returns True if the order is stuck
 */
function isOrderStuck(order: Order, config: StuckOrderConfig): boolean {
  const now = Date.now();
  const updatedAt = new Date(order.updatedAt).getTime();
  const timeSinceUpdate = now - updatedAt;

  // PENDING orders are stuck if they've been pending too long
  if (order.status === 'PENDING') {
    return timeSinceUpdate > config.pendingThresholdMs;
  }

  // OPEN orders with no recent updates are stuck
  if (order.status === 'OPEN') {
    return timeSinceUpdate > config.openNoUpdateThresholdMs;
  }

  return false;
}

/**
 * Creates a StuckOrder record from an Order
 *
 * @param order - The order that is stuck
 * @returns A StuckOrder record
 */
function createStuckOrderRecord(order: Order): StuckOrder {
  const existingKey = `${order.tenantId}:${order.orderId}`;
  const existing = stuckOrderStore.get(existingKey);

  // Preserve existing tracking data if available
  if (existing) {
    return {
      orderId: order.orderId,
      exchangeOrderId: order.exchangeOrderId,
      exchangeId: order.exchangeId,
      status: order.status,
      lastKnownStatus: existing.lastKnownStatus,
      stuckSince: existing.stuckSince,
      resolutionAttempts: existing.resolutionAttempts,
      requiresManualIntervention: existing.requiresManualIntervention,
    };
  }

  return {
    orderId: order.orderId,
    exchangeOrderId: order.exchangeOrderId,
    exchangeId: order.exchangeId,
    status: order.status,
    lastKnownStatus: order.status,
    stuckSince: new Date().toISOString(),
    resolutionAttempts: 0,
    requiresManualIntervention: false,
  };
}

/**
 * Exchange Manual Intervention Service
 *
 * Provides methods for identifying and resolving stuck orders.
 */
export const ExchangeManualInterventionService = {
  /**
   * Configuration for stuck order detection
   */
  config: { ...DEFAULT_STUCK_ORDER_CONFIG },

  /**
   * Set configuration for stuck order detection
   *
   * @param config - Partial configuration to merge
   */
  setConfig(config: Partial<StuckOrderConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_STUCK_ORDER_CONFIG };
  },

  /**
   * Get all stuck orders for a tenant
   *
   * Identifies orders that have been in uncertain states (PENDING, OPEN with no updates)
   * beyond the configured threshold.
   *
   * Requirements: 10.6
   *
   * @param tenantId - The tenant identifier
   * @returns List of stuck orders
   */
  async getStuckOrders(tenantId: string): Promise<StuckOrder[]> {
    // Get all orders that could potentially be stuck
    const potentiallyStuckStatuses: OrderStatus[] = ['PENDING', 'OPEN'];
    const orders = await ExchangeOrderRepository.getOrdersByStatus(
      tenantId,
      potentiallyStuckStatuses
    );

    const stuckOrders: StuckOrder[] = [];

    for (const order of orders) {
      if (isOrderStuck(order, this.config)) {
        const stuckOrder = createStuckOrderRecord(order);
        
        // Store/update in the tracking store
        const key = `${tenantId}:${order.orderId}`;
        stuckOrderStore.set(key, stuckOrder);
        
        stuckOrders.push(stuckOrder);
      }
    }

    return stuckOrders;
  },

  /**
   * Check if a specific order is stuck
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns The stuck order if stuck, null otherwise
   */
  async checkIfStuck(tenantId: string, orderId: string): Promise<StuckOrder | null> {
    const order = await ExchangeOrderRepository.getOrder(tenantId, orderId);
    if (!order) {
      return null;
    }

    if (isOrderStuck(order, this.config)) {
      const stuckOrder = createStuckOrderRecord(order);
      const key = `${tenantId}:${order.orderId}`;
      stuckOrderStore.set(key, stuckOrder);
      return stuckOrder;
    }

    return null;
  },

  /**
   * Resolve a stuck order with a specified action
   *
   * Requirements: 10.6
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @param resolution - The resolution action and details
   * @throws StuckOrderNotFoundError if order not found
   * @throws ResolutionError if resolution fails
   */
  async resolveStuckOrder(
    tenantId: string,
    orderId: string,
    resolution: OrderResolution
  ): Promise<void> {
    const order = await ExchangeOrderRepository.getOrder(tenantId, orderId);
    if (!order) {
      throw new StuckOrderNotFoundError(tenantId, orderId);
    }

    const key = `${tenantId}:${orderId}`;
    let stuckOrder = stuckOrderStore.get(key);

    // Create stuck order record if it doesn't exist
    if (!stuckOrder) {
      stuckOrder = createStuckOrderRecord(order);
      stuckOrderStore.set(key, stuckOrder);
    }

    // Increment resolution attempts
    stuckOrder.resolutionAttempts += 1;
    stuckOrder.requiresManualIntervention =
      stuckOrder.resolutionAttempts >= this.config.maxResolutionAttempts;
    stuckOrderStore.set(key, stuckOrder);

    try {
      switch (resolution.action) {
        case 'CANCEL':
          await this.forceCancel(tenantId, orderId);
          break;

        case 'MARK_FILLED':
          await ExchangeOrderRepository.updateOrder(tenantId, orderId, {
            status: 'FILLED',
            completedAt: new Date().toISOString(),
          });
          // Remove from stuck order tracking on successful resolution
          stuckOrderStore.delete(key);
          break;

        case 'MARK_REJECTED':
          await ExchangeOrderRepository.updateOrder(tenantId, orderId, {
            status: 'REJECTED',
            completedAt: new Date().toISOString(),
          });
          // Remove from stuck order tracking on successful resolution
          stuckOrderStore.delete(key);
          break;

        case 'RECONCILE':
          const reconciledOrder = await this.forceReconcile(tenantId, orderId);
          // Only remove from tracking if the order reached a terminal state
          if (['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(reconciledOrder.status)) {
            stuckOrderStore.delete(key);
          }
          break;

        default:
          throw new ResolutionError(
            `Unknown resolution action: ${resolution.action}`,
            orderId,
            resolution.action
          );
      }
    } catch (error) {
      if (error instanceof ResolutionError) {
        throw error;
      }
      throw new ResolutionError(
        error instanceof Error ? error.message : 'Resolution failed',
        orderId,
        resolution.action
      );
    }
  },

  /**
   * Force cancel a stuck order
   *
   * Attempts to cancel the order on the exchange. If that fails,
   * marks the order as cancelled locally.
   *
   * Requirements: 10.6
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns The cancel response
   * @throws StuckOrderNotFoundError if order not found
   */
  async forceCancel(tenantId: string, orderId: string): Promise<CancelResponse> {
    const order = await ExchangeOrderRepository.getOrder(tenantId, orderId);
    if (!order) {
      throw new StuckOrderNotFoundError(tenantId, orderId);
    }

    try {
      // Try to cancel through the normal order manager
      const response = await ExchangeOrderManager.cancelOrder(tenantId, orderId);
      
      // Remove from stuck order tracking
      const key = `${tenantId}:${orderId}`;
      stuckOrderStore.delete(key);
      
      return response;
    } catch (error) {
      // If normal cancellation fails, force the status update
      const now = new Date().toISOString();
      
      await ExchangeOrderRepository.updateOrder(tenantId, orderId, {
        status: 'CANCELLED',
        completedAt: now,
      });

      // Remove from stuck order tracking
      const key = `${tenantId}:${orderId}`;
      stuckOrderStore.delete(key);

      return {
        orderId,
        exchangeOrderId: order.exchangeOrderId || '',
        status: 'CANCELLED',
        reason: 'Force cancelled due to stuck state',
        cancelledAt: now,
      };
    }
  },

  /**
   * Force reconcile a stuck order with exchange data
   *
   * Queries the exchange for the current order status and updates
   * the local record to match.
   *
   * Requirements: 10.6
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns The reconciled order
   * @throws StuckOrderNotFoundError if order not found
   */
  async forceReconcile(tenantId: string, orderId: string): Promise<Order> {
    const order = await ExchangeOrderRepository.getOrder(tenantId, orderId);
    if (!order) {
      throw new StuckOrderNotFoundError(tenantId, orderId);
    }

    // Get the exchange adapter
    const adapter = ExchangeOrderManager.getAdapter(tenantId, order.exchangeId);

    if (adapter && order.exchangeOrderId) {
      try {
        // Query the exchange for current status
        const exchangeStatus = await adapter.getOrderStatus(orderId, order.exchangeOrderId);

        // Update local record with exchange status
        const updatedOrder = await ExchangeOrderRepository.updateOrder(tenantId, orderId, {
          status: exchangeStatus,
          completedAt: ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(exchangeStatus)
            ? new Date().toISOString()
            : undefined,
        });

        // Remove from stuck order tracking if resolved
        if (['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(exchangeStatus)) {
          const key = `${tenantId}:${orderId}`;
          stuckOrderStore.delete(key);
        }

        return updatedOrder;
      } catch (error) {
        // If exchange query fails, mark as requiring manual intervention
        const key = `${tenantId}:${orderId}`;
        const stuckOrder = stuckOrderStore.get(key);
        if (stuckOrder) {
          stuckOrder.requiresManualIntervention = true;
          stuckOrderStore.set(key, stuckOrder);
        }
        throw new ResolutionError(
          `Failed to reconcile with exchange: ${error instanceof Error ? error.message : 'Unknown error'}`,
          orderId,
          'RECONCILE'
        );
      }
    }

    // No adapter available - mark as requiring manual intervention
    const key = `${tenantId}:${orderId}`;
    const stuckOrder = stuckOrderStore.get(key);
    if (stuckOrder) {
      stuckOrder.requiresManualIntervention = true;
      stuckOrderStore.set(key, stuckOrder);
    }

    return order;
  },

  /**
   * Get stuck orders that require manual intervention
   *
   * @param tenantId - The tenant identifier
   * @returns List of stuck orders requiring manual intervention
   */
  async getOrdersRequiringIntervention(tenantId: string): Promise<StuckOrder[]> {
    const allStuckOrders = await this.getStuckOrders(tenantId);
    return allStuckOrders.filter(order => order.requiresManualIntervention);
  },

  /**
   * Clear stuck order tracking for a tenant
   * Used primarily for testing
   *
   * @param tenantId - The tenant identifier
   */
  clearStuckOrderTracking(tenantId: string): void {
    const keysToDelete: string[] = [];
    stuckOrderStore.forEach((_, key) => {
      if (key.startsWith(`${tenantId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => stuckOrderStore.delete(key));
  },

  /**
   * Clear all stuck order tracking
   * Used primarily for testing
   */
  clearAllStuckOrderTracking(): void {
    stuckOrderStore.clear();
  },
};
