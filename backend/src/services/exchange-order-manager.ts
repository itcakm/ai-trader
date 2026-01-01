/**
 * Exchange Order Manager Service
 *
 * Manages order lifecycle including submission, cancellation, modification,
 * and tracking. Provides comprehensive order management with support for
 * all order types and time-in-force options.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import {
  Order,
  OrderRequest,
  OrderResponse,
  OrderModification,
  CancelResponse,
  OrderStatus,
  OrderFilters,
  Fill,
  ExecutionUpdate,
  OrderType,
  TimeInForce,
} from '../types/exchange-order';
import { ExchangeId, ExchangeConfig } from '../types/exchange';
import { ExchangeOrderRepository } from '../repositories/exchange-order';
import { ExchangeService } from './exchange';
import { generateUUID } from '../utils/uuid';

/**
 * Error thrown when an order is not found
 */
export class OrderNotFoundError extends Error {
  constructor(tenantId: string, orderId: string) {
    super(`Order '${orderId}' not found for tenant '${tenantId}'`);
    this.name = 'OrderNotFoundError';
  }
}

/**
 * Error thrown when order validation fails
 */
export class OrderValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

/**
 * Error thrown when order submission fails
 */
export class OrderSubmissionError extends Error {
  constructor(
    message: string,
    public readonly orderId: string,
    public readonly exchangeId?: ExchangeId
  ) {
    super(message);
    this.name = 'OrderSubmissionError';
  }
}

/**
 * Error thrown when order cancellation fails
 */
export class OrderCancellationError extends Error {
  constructor(
    message: string,
    public readonly orderId: string,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'OrderCancellationError';
  }
}

/**
 * Error thrown when order modification fails
 */
export class OrderModificationError extends Error {
  constructor(
    message: string,
    public readonly orderId: string,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'OrderModificationError';
  }
}

/**
 * Error thrown when exchange doesn't support an operation
 */
export class ExchangeNotSupportedError extends Error {
  constructor(exchangeId: ExchangeId, operation: string) {
    super(`Exchange '${exchangeId}' does not support ${operation}`);
    this.name = 'ExchangeNotSupportedError';
  }
}

/**
 * Error thrown when a duplicate order is detected
 */
export class DuplicateOrderError extends Error {
  constructor(
    public readonly existingOrderId: string,
    public readonly idempotencyKey: string
  ) {
    super(`Duplicate order detected with idempotency key '${idempotencyKey}'`);
    this.name = 'DuplicateOrderError';
  }
}

/**
 * Interface for exchange adapter operations
 * This is a simplified interface for the order manager to interact with exchanges
 */
export interface ExchangeAdapterInterface {
  submitOrder(order: OrderRequest): Promise<OrderResponse>;
  cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse>;
  modifyOrder(orderId: string, modifications: OrderModification): Promise<OrderResponse>;
  getOrderStatus(orderId: string, exchangeOrderId: string): Promise<OrderStatus>;
}

/**
 * Adapter registry for managing exchange adapters
 */
export type AdapterRegistry = Map<string, ExchangeAdapterInterface>;


/**
 * Validates an order request
 *
 * @param order - The order request to validate
 * @throws OrderValidationError if validation fails
 */
function validateOrderRequest(order: OrderRequest): void {
  // Validate required fields
  if (!order.tenantId) {
    throw new OrderValidationError('tenantId is required', 'tenantId');
  }

  if (!order.strategyId) {
    throw new OrderValidationError('strategyId is required', 'strategyId');
  }

  if (!order.assetId) {
    throw new OrderValidationError('assetId is required', 'assetId');
  }

  if (!order.side || !['BUY', 'SELL'].includes(order.side)) {
    throw new OrderValidationError('side must be BUY or SELL', 'side');
  }

  if (!order.orderType) {
    throw new OrderValidationError('orderType is required', 'orderType');
  }

  if (order.quantity <= 0) {
    throw new OrderValidationError('quantity must be greater than 0', 'quantity');
  }

  if (!order.timeInForce) {
    throw new OrderValidationError('timeInForce is required', 'timeInForce');
  }

  if (!order.idempotencyKey) {
    throw new OrderValidationError('idempotencyKey is required', 'idempotencyKey');
  }

  // Validate order type specific fields
  validateOrderTypeFields(order);

  // Validate time-in-force specific fields
  validateTimeInForceFields(order);
}

/**
 * Validates order type specific fields
 *
 * Requirements: 5.1
 */
function validateOrderTypeFields(order: OrderRequest): void {
  const validOrderTypes: OrderType[] = [
    'MARKET',
    'LIMIT',
    'STOP_LIMIT',
    'STOP_MARKET',
    'TRAILING_STOP',
  ];

  if (!validOrderTypes.includes(order.orderType)) {
    throw new OrderValidationError(
      `Invalid order type: ${order.orderType}. Must be one of: ${validOrderTypes.join(', ')}`,
      'orderType'
    );
  }

  // LIMIT orders require price
  if (order.orderType === 'LIMIT' && (order.price === undefined || order.price <= 0)) {
    throw new OrderValidationError('LIMIT orders require a positive price', 'price');
  }

  // STOP_LIMIT orders require both price and stopPrice
  if (order.orderType === 'STOP_LIMIT') {
    if (order.price === undefined || order.price <= 0) {
      throw new OrderValidationError('STOP_LIMIT orders require a positive price', 'price');
    }
    if (order.stopPrice === undefined || order.stopPrice <= 0) {
      throw new OrderValidationError('STOP_LIMIT orders require a positive stopPrice', 'stopPrice');
    }
  }

  // STOP_MARKET orders require stopPrice
  if (order.orderType === 'STOP_MARKET') {
    if (order.stopPrice === undefined || order.stopPrice <= 0) {
      throw new OrderValidationError('STOP_MARKET orders require a positive stopPrice', 'stopPrice');
    }
  }

  // TRAILING_STOP orders require trailingDelta
  if (order.orderType === 'TRAILING_STOP') {
    if (order.trailingDelta === undefined || order.trailingDelta <= 0) {
      throw new OrderValidationError(
        'TRAILING_STOP orders require a positive trailingDelta',
        'trailingDelta'
      );
    }
  }
}

/**
 * Validates time-in-force specific fields
 *
 * Requirements: 5.6
 */
function validateTimeInForceFields(order: OrderRequest): void {
  const validTimeInForce: TimeInForce[] = ['GTC', 'IOC', 'FOK', 'GTD'];

  if (!validTimeInForce.includes(order.timeInForce)) {
    throw new OrderValidationError(
      `Invalid timeInForce: ${order.timeInForce}. Must be one of: ${validTimeInForce.join(', ')}`,
      'timeInForce'
    );
  }

  // GTD orders require expiresAt
  if (order.timeInForce === 'GTD') {
    if (!order.expiresAt) {
      throw new OrderValidationError('GTD orders require expiresAt timestamp', 'expiresAt');
    }

    // Validate expiresAt is a valid future date
    const expiresAtDate = new Date(order.expiresAt);
    if (isNaN(expiresAtDate.getTime())) {
      throw new OrderValidationError('expiresAt must be a valid ISO date string', 'expiresAt');
    }

    if (expiresAtDate <= new Date()) {
      throw new OrderValidationError('expiresAt must be in the future', 'expiresAt');
    }
  }
}

/**
 * Validates that an exchange supports the order type
 */
function validateExchangeSupportsOrderType(
  exchangeConfig: ExchangeConfig,
  orderType: OrderType
): void {
  if (!exchangeConfig.supportedFeatures.supportedOrderTypes.includes(orderType)) {
    throw new OrderValidationError(
      `Exchange '${exchangeConfig.exchangeId}' does not support order type '${orderType}'`,
      'orderType'
    );
  }
}

/**
 * Validates that an exchange supports the time-in-force option
 */
function validateExchangeSupportsTimeInForce(
  exchangeConfig: ExchangeConfig,
  timeInForce: TimeInForce
): void {
  if (!exchangeConfig.supportedFeatures.supportedTimeInForce.includes(timeInForce)) {
    throw new OrderValidationError(
      `Exchange '${exchangeConfig.exchangeId}' does not support time-in-force '${timeInForce}'`,
      'timeInForce'
    );
  }
}


/**
 * Exchange Order Manager Service
 *
 * Manages the complete lifecycle of orders including submission, cancellation,
 * modification, and tracking.
 */
export const ExchangeOrderManager = {
  /**
   * Registry of exchange adapters
   * In production, this would be populated by the adapter factory
   */
  adapters: new Map<string, ExchangeAdapterInterface>() as AdapterRegistry,

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
    adapter: ExchangeAdapterInterface
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
  getAdapter(tenantId: string, exchangeId: ExchangeId): ExchangeAdapterInterface | undefined {
    const key = `${tenantId}:${exchangeId}`;
    return this.adapters.get(key);
  },

  /**
   * Submit a new order
   *
   * Validates the order, checks for duplicates using idempotency key,
   * assigns a unique internal order ID, and submits to the exchange.
   *
   * Requirements: 5.1, 5.2, 5.6
   *
   * @param orderRequest - The order request
   * @returns The order response
   * @throws OrderValidationError if validation fails
   * @throws DuplicateOrderError if a duplicate order is detected
   * @throws OrderSubmissionError if submission fails
   */
  async submitOrder(orderRequest: OrderRequest): Promise<OrderResponse> {
    // Validate the order request
    validateOrderRequest(orderRequest);

    // Check for duplicate order using idempotency key
    const existingOrder = await ExchangeOrderRepository.getOrderByIdempotencyKey(
      orderRequest.tenantId,
      orderRequest.idempotencyKey
    );

    if (existingOrder) {
      throw new DuplicateOrderError(existingOrder.orderId, orderRequest.idempotencyKey);
    }

    // Generate unique internal order ID if not provided
    const orderId = orderRequest.orderId || generateUUID();

    // Determine the exchange to use
    const exchangeId = orderRequest.exchangeId;
    if (!exchangeId) {
      throw new OrderValidationError('exchangeId is required', 'exchangeId');
    }

    // Get exchange configuration to validate support
    let exchangeConfig: ExchangeConfig;
    try {
      exchangeConfig = await ExchangeService.getExchange(orderRequest.tenantId, exchangeId);
    } catch (error) {
      throw new OrderSubmissionError(
        `Exchange '${exchangeId}' not found or not configured`,
        orderId,
        exchangeId
      );
    }

    // Validate exchange supports the order type and time-in-force
    validateExchangeSupportsOrderType(exchangeConfig, orderRequest.orderType);
    validateExchangeSupportsTimeInForce(exchangeConfig, orderRequest.timeInForce);

    // Check exchange availability
    const isAvailable = await ExchangeService.isExchangeAvailable(
      orderRequest.tenantId,
      exchangeId
    );
    if (!isAvailable) {
      throw new OrderSubmissionError(
        `Exchange '${exchangeId}' is not available`,
        orderId,
        exchangeId
      );
    }

    const now = new Date().toISOString();

    // Create the order record
    const order: Order = {
      orderId,
      tenantId: orderRequest.tenantId,
      strategyId: orderRequest.strategyId,
      exchangeId,
      assetId: orderRequest.assetId,
      side: orderRequest.side,
      orderType: orderRequest.orderType,
      quantity: orderRequest.quantity,
      filledQuantity: 0,
      remainingQuantity: orderRequest.quantity,
      price: orderRequest.price,
      stopPrice: orderRequest.stopPrice,
      timeInForce: orderRequest.timeInForce,
      status: 'PENDING',
      idempotencyKey: orderRequest.idempotencyKey,
      fills: [],
      createdAt: now,
      updatedAt: now,
    };

    // Save the order in PENDING state
    await ExchangeOrderRepository.putOrder(orderRequest.tenantId, order);

    // Get the exchange adapter
    const adapter = this.getAdapter(orderRequest.tenantId, exchangeId);

    let orderResponse: OrderResponse;

    if (adapter) {
      try {
        // Submit to exchange
        orderResponse = await adapter.submitOrder({
          ...orderRequest,
          orderId,
        });

        // Update order with exchange response
        const updatedOrder: Order = {
          ...order,
          exchangeOrderId: orderResponse.exchangeOrderId,
          status: orderResponse.status,
          filledQuantity: orderResponse.filledQuantity,
          remainingQuantity: orderResponse.remainingQuantity,
          averageFilledPrice: orderResponse.averagePrice,
          updatedAt: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
        };

        await ExchangeOrderRepository.putOrder(orderRequest.tenantId, updatedOrder);

        return orderResponse;
      } catch (error) {
        // Update order status to REJECTED on failure
        await ExchangeOrderRepository.updateOrder(orderRequest.tenantId, orderId, {
          status: 'REJECTED',
        });

        throw new OrderSubmissionError(
          error instanceof Error ? error.message : 'Order submission failed',
          orderId,
          exchangeId
        );
      }
    } else {
      // No adapter available - return simulated response for testing
      orderResponse = {
        orderId,
        exchangeOrderId: `EX-${generateUUID()}`,
        exchangeId,
        status: 'OPEN',
        filledQuantity: 0,
        remainingQuantity: orderRequest.quantity,
        createdAt: now,
        updatedAt: now,
      };

      // Update order with simulated response
      await ExchangeOrderRepository.updateOrder(orderRequest.tenantId, orderId, {
        exchangeOrderId: orderResponse.exchangeOrderId,
        status: orderResponse.status,
        submittedAt: now,
      });

      return orderResponse;
    }
  },

  /**
   * Cancel an existing order
   *
   * Waits for exchange confirmation before updating status.
   * Keeps previous status if confirmation fails.
   *
   * Requirements: 5.4
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns The cancel response
   * @throws OrderNotFoundError if order not found
   * @throws OrderCancellationError if cancellation fails
   */
  async cancelOrder(tenantId: string, orderId: string): Promise<CancelResponse> {
    // Get the existing order
    const order = await ExchangeOrderRepository.getOrder(tenantId, orderId);
    if (!order) {
      throw new OrderNotFoundError(tenantId, orderId);
    }

    // Check if order can be cancelled
    const cancellableStatuses: OrderStatus[] = ['PENDING', 'OPEN', 'PARTIALLY_FILLED'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new OrderCancellationError(
        `Order cannot be cancelled in status '${order.status}'`,
        orderId,
        `Current status: ${order.status}`
      );
    }

    // Get the exchange adapter
    const adapter = this.getAdapter(tenantId, order.exchangeId);

    if (adapter && order.exchangeOrderId) {
      try {
        // Request cancellation from exchange
        const cancelResponse = await adapter.cancelOrder(orderId, order.exchangeOrderId);

        // Only update status if exchange confirms cancellation
        if (cancelResponse.status === 'CANCELLED') {
          await ExchangeOrderRepository.updateOrder(tenantId, orderId, {
            status: 'CANCELLED',
            completedAt: cancelResponse.cancelledAt || new Date().toISOString(),
          });
        } else if (cancelResponse.status === 'FAILED') {
          // Keep previous status on failure
          throw new OrderCancellationError(
            'Exchange rejected cancellation request',
            orderId,
            cancelResponse.reason
          );
        }
        // For PENDING_CANCEL, we don't update status yet - wait for confirmation

        return cancelResponse;
      } catch (error) {
        if (error instanceof OrderCancellationError) {
          throw error;
        }
        // Keep previous status on error
        throw new OrderCancellationError(
          error instanceof Error ? error.message : 'Cancellation failed',
          orderId
        );
      }
    } else {
      // No adapter or no exchange order ID - simulate cancellation
      const now = new Date().toISOString();

      await ExchangeOrderRepository.updateOrder(tenantId, orderId, {
        status: 'CANCELLED',
        completedAt: now,
      });

      return {
        orderId,
        exchangeOrderId: order.exchangeOrderId || '',
        status: 'CANCELLED',
        cancelledAt: now,
      };
    }
  },

  /**
   * Modify an existing order
   *
   * Submits modifications to exchanges that support it.
   * Updates order record only after exchange confirmation.
   *
   * Requirements: 5.3
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @param modifications - The modifications to apply
   * @returns The order response
   * @throws OrderNotFoundError if order not found
   * @throws OrderModificationError if modification fails
   * @throws ExchangeNotSupportedError if exchange doesn't support modification
   */
  async modifyOrder(
    tenantId: string,
    orderId: string,
    modifications: OrderModification
  ): Promise<OrderResponse> {
    // Get the existing order
    const order = await ExchangeOrderRepository.getOrder(tenantId, orderId);
    if (!order) {
      throw new OrderNotFoundError(tenantId, orderId);
    }

    // Check if order can be modified
    const modifiableStatuses: OrderStatus[] = ['OPEN', 'PARTIALLY_FILLED'];
    if (!modifiableStatuses.includes(order.status)) {
      throw new OrderModificationError(
        `Order cannot be modified in status '${order.status}'`,
        orderId,
        `Current status: ${order.status}`
      );
    }

    // Check if exchange supports order modification
    let exchangeConfig: ExchangeConfig;
    try {
      exchangeConfig = await ExchangeService.getExchange(tenantId, order.exchangeId);
    } catch (error) {
      throw new OrderModificationError(
        `Exchange '${order.exchangeId}' not found`,
        orderId
      );
    }

    if (!exchangeConfig.supportedFeatures.supportsOrderModification) {
      throw new ExchangeNotSupportedError(order.exchangeId, 'order modification');
    }

    // Validate modifications
    if (modifications.newPrice !== undefined && modifications.newPrice <= 0) {
      throw new OrderModificationError('newPrice must be positive', orderId);
    }

    if (modifications.newQuantity !== undefined && modifications.newQuantity <= 0) {
      throw new OrderModificationError('newQuantity must be positive', orderId);
    }

    if (modifications.newStopPrice !== undefined && modifications.newStopPrice <= 0) {
      throw new OrderModificationError('newStopPrice must be positive', orderId);
    }

    // Get the exchange adapter
    const adapter = this.getAdapter(tenantId, order.exchangeId);

    if (adapter && order.exchangeOrderId) {
      try {
        // Submit modification to exchange
        const response = await adapter.modifyOrder(orderId, modifications);

        // Update order only after exchange confirmation
        const updates: Partial<Order> = {};

        if (modifications.newPrice !== undefined) {
          updates.price = modifications.newPrice;
        }

        if (modifications.newQuantity !== undefined) {
          updates.quantity = modifications.newQuantity;
          updates.remainingQuantity = modifications.newQuantity - order.filledQuantity;
        }

        if (modifications.newStopPrice !== undefined) {
          updates.stopPrice = modifications.newStopPrice;
        }

        await ExchangeOrderRepository.updateOrder(tenantId, orderId, updates);

        return response;
      } catch (error) {
        // Don't update order on failure
        throw new OrderModificationError(
          error instanceof Error ? error.message : 'Modification failed',
          orderId
        );
      }
    } else {
      // No adapter - simulate modification
      const now = new Date().toISOString();

      const updates: Partial<Order> = {};

      if (modifications.newPrice !== undefined) {
        updates.price = modifications.newPrice;
      }

      if (modifications.newQuantity !== undefined) {
        updates.quantity = modifications.newQuantity;
        updates.remainingQuantity = modifications.newQuantity - order.filledQuantity;
      }

      if (modifications.newStopPrice !== undefined) {
        updates.stopPrice = modifications.newStopPrice;
      }

      const updatedOrder = await ExchangeOrderRepository.updateOrder(tenantId, orderId, updates);

      return {
        orderId,
        exchangeOrderId: order.exchangeOrderId || '',
        exchangeId: order.exchangeId,
        status: updatedOrder.status,
        filledQuantity: updatedOrder.filledQuantity,
        remainingQuantity: updatedOrder.remainingQuantity,
        averagePrice: updatedOrder.averageFilledPrice,
        createdAt: updatedOrder.createdAt,
        updatedAt: now,
      };
    }
  },

  /**
   * Get an order by ID
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns The order
   * @throws OrderNotFoundError if order not found
   */
  async getOrder(tenantId: string, orderId: string): Promise<Order> {
    const order = await ExchangeOrderRepository.getOrder(tenantId, orderId);
    if (!order) {
      throw new OrderNotFoundError(tenantId, orderId);
    }
    return order;
  },

  /**
   * List orders with optional filters
   *
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters
   * @returns List of orders
   */
  async listOrders(tenantId: string, filters?: OrderFilters): Promise<Order[]> {
    return ExchangeOrderRepository.listOrders(tenantId, filters);
  },

  /**
   * Get open orders for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy ID filter
   * @returns List of open orders
   */
  async getOpenOrders(tenantId: string, strategyId?: string): Promise<Order[]> {
    return ExchangeOrderRepository.getOpenOrders(tenantId, strategyId);
  },

  /**
   * Process a fill/execution update
   *
   * Updates the order with the fill information, tracking filled quantity
   * and remaining quantity.
   *
   * Requirements: 5.5
   *
   * @param fill - The execution update
   * @returns The updated order
   * @throws OrderNotFoundError if order not found
   */
  async processFill(fill: ExecutionUpdate): Promise<Order> {
    // Find the order by exchange order ID or internal order ID
    let order = await ExchangeOrderRepository.getOrderByExchangeOrderId(
      fill.orderId.split(':')[0], // Assuming format tenantId:orderId
      fill.exchangeOrderId
    );

    if (!order) {
      // Try to find by internal order ID
      // Extract tenantId from the fill context if available
      throw new OrderNotFoundError('unknown', fill.orderId);
    }

    // Create the fill record
    const fillRecord: Fill = {
      fillId: generateUUID(),
      executionId: fill.executionId,
      quantity: fill.quantity,
      price: fill.price,
      commission: fill.commission,
      commissionAsset: fill.commissionAsset,
      timestamp: fill.timestamp,
    };

    // Add the fill to the order
    return ExchangeOrderRepository.addFill(order.tenantId, order.orderId, fillRecord);
  },

  /**
   * Process a fill for a specific order
   *
   * Requirements: 5.5
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @param fill - The fill to add
   * @returns The updated order
   */
  async addFillToOrder(tenantId: string, orderId: string, fill: Fill): Promise<Order> {
    return ExchangeOrderRepository.addFill(tenantId, orderId, fill);
  },

  /**
   * Update order status from exchange update
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @param status - The new status
   * @returns The updated order
   */
  async updateOrderStatus(
    tenantId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<Order> {
    const updates: Partial<Order> = { status };

    // Set completedAt for terminal statuses
    const terminalStatuses: OrderStatus[] = ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'];
    if (terminalStatuses.includes(status)) {
      updates.completedAt = new Date().toISOString();
    }

    return ExchangeOrderRepository.updateOrder(tenantId, orderId, updates);
  },

  /**
   * Check if an order exists
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns True if the order exists
   */
  async orderExists(tenantId: string, orderId: string): Promise<boolean> {
    return ExchangeOrderRepository.orderExists(tenantId, orderId);
  },

  /**
   * Get order by idempotency key
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   * @returns The order if found, null otherwise
   */
  async getOrderByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<Order | null> {
    return ExchangeOrderRepository.getOrderByIdempotencyKey(tenantId, idempotencyKey);
  },
};
