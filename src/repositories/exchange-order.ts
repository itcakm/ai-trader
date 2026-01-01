/**
 * Exchange Order Repository
 *
 * Manages persistence of orders in DynamoDB.
 * Provides tenant-isolated access to order data with GSIs for efficient queries.
 *
 * Requirements: 5.2
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TenantAccessDeniedError, ResourceNotFoundError } from '../db/access';
import {
  Order,
  OrderStatus,
  OrderFilters,
  Fill,
} from '../types/exchange-order';
import { ExchangeId } from '../types/exchange';

/**
 * Table name for orders
 */
const TABLE_NAME = process.env.EXCHANGE_ORDERS_TABLE || 'exchange-orders';

/**
 * Key schema for orders table
 * - Partition Key: tenantId (for tenant isolation)
 * - Sort Key: orderId
 *
 * GSIs:
 * - exchangeOrderId-index: For looking up by exchange order ID
 * - strategyId-timestamp-index: For querying orders by strategy
 * - status-timestamp-index: For filtering by status
 */
const KEY_SCHEMA = {
  partitionKey: 'tenantId',
  sortKey: 'orderId',
};

/**
 * Exchange Order Repository - manages order persistence
 */
export const ExchangeOrderRepository = {
  /**
   * Get an order by tenant and order ID
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns The order, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getOrder(tenantId: string, orderId: string): Promise<Order | null> {
    const result = await documentClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
          [KEY_SCHEMA.sortKey]: orderId,
        },
      })
      .promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'order');
    }

    return result.Item as Order;
  },

  /**
   * Save an order
   *
   * @param tenantId - The tenant identifier (must match order.tenantId)
   * @param order - The order to save
   * @throws TenantAccessDeniedError if tenantId doesn't match order.tenantId
   */
  async putOrder(tenantId: string, order: Order): Promise<void> {
    // Verify the order belongs to the tenant
    if (order.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'order');
    }

    await documentClient
      .put({
        TableName: TABLE_NAME,
        Item: order,
      })
      .promise();
  },

  /**
   * List orders for a tenant with optional filters
   *
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters for the query
   * @returns List of orders matching the filters
   */
  async listOrders(tenantId: string, filters?: OrderFilters): Promise<Order[]> {
    // Build the query based on filters
    let queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KEY_SCHEMA.partitionKey,
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
      },
    };

    // Add filter expressions if filters are provided
    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = { ...queryParams.ExpressionAttributeNames };
    const expressionAttributeValues: Record<string, unknown> = { ...queryParams.ExpressionAttributeValues };

    if (filters?.strategyId) {
      filterExpressions.push('#strategyId = :strategyId');
      expressionAttributeNames['#strategyId'] = 'strategyId';
      expressionAttributeValues[':strategyId'] = filters.strategyId;
    }

    if (filters?.exchangeId) {
      filterExpressions.push('#exchangeId = :exchangeId');
      expressionAttributeNames['#exchangeId'] = 'exchangeId';
      expressionAttributeValues[':exchangeId'] = filters.exchangeId;
    }

    if (filters?.assetId) {
      filterExpressions.push('#assetId = :assetId');
      expressionAttributeNames['#assetId'] = 'assetId';
      expressionAttributeValues[':assetId'] = filters.assetId;
    }

    if (filters?.status && filters.status.length > 0) {
      const statusConditions = filters.status.map((_, index) => `:status${index}`);
      filterExpressions.push(`#status IN (${statusConditions.join(', ')})`);
      expressionAttributeNames['#status'] = 'status';
      filters.status.forEach((status, index) => {
        expressionAttributeValues[`:status${index}`] = status;
      });
    }

    if (filters?.side) {
      filterExpressions.push('#side = :side');
      expressionAttributeNames['#side'] = 'side';
      expressionAttributeValues[':side'] = filters.side;
    }

    if (filters?.startTime) {
      filterExpressions.push('#createdAt >= :startTime');
      expressionAttributeNames['#createdAt'] = 'createdAt';
      expressionAttributeValues[':startTime'] = filters.startTime;
    }

    if (filters?.endTime) {
      filterExpressions.push('#createdAt <= :endTime');
      if (!expressionAttributeNames['#createdAt']) {
        expressionAttributeNames['#createdAt'] = 'createdAt';
      }
      expressionAttributeValues[':endTime'] = filters.endTime;
    }

    if (filterExpressions.length > 0) {
      queryParams.FilterExpression = filterExpressions.join(' AND ');
    }

    queryParams.ExpressionAttributeNames = expressionAttributeNames;
    queryParams.ExpressionAttributeValues = expressionAttributeValues;

    if (filters?.limit) {
      queryParams.Limit = filters.limit;
    }

    const result = await documentClient.query(queryParams).promise();

    return (result.Items || []) as Order[];
  },

  /**
   * Get orders by status for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param statuses - The statuses to filter by
   * @returns List of orders with the specified statuses
   */
  async getOrdersByStatus(
    tenantId: string,
    statuses: OrderStatus[]
  ): Promise<Order[]> {
    return this.listOrders(tenantId, { status: statuses });
  },

  /**
   * Get open orders for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy ID filter
   * @returns List of open orders
   */
  async getOpenOrders(tenantId: string, strategyId?: string): Promise<Order[]> {
    const filters: OrderFilters = {
      status: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'],
    };

    if (strategyId) {
      filters.strategyId = strategyId;
    }

    return this.listOrders(tenantId, filters);
  },

  /**
   * Get order by exchange order ID
   *
   * @param tenantId - The tenant identifier
   * @param exchangeOrderId - The exchange order ID
   * @returns The order, or null if not found
   */
  async getOrderByExchangeOrderId(
    tenantId: string,
    exchangeOrderId: string
  ): Promise<Order | null> {
    // Query using the GSI
    const result = await documentClient
      .query({
        TableName: TABLE_NAME,
        IndexName: 'exchangeOrderId-index',
        KeyConditionExpression: '#exchangeOrderId = :exchangeOrderId',
        FilterExpression: '#tenantId = :tenantId',
        ExpressionAttributeNames: {
          '#exchangeOrderId': 'exchangeOrderId',
          '#tenantId': 'tenantId',
        },
        ExpressionAttributeValues: {
          ':exchangeOrderId': exchangeOrderId,
          ':tenantId': tenantId,
        },
      })
      .promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as Order;
  },

  /**
   * Update specific fields of an order
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @param updates - Fields to update
   * @returns The updated order
   * @throws ResourceNotFoundError if order doesn't exist
   */
  async updateOrder(
    tenantId: string,
    orderId: string,
    updates: Partial<Omit<Order, 'orderId' | 'tenantId' | 'createdAt'>>
  ): Promise<Order> {
    // Get existing order
    const existing = await this.getOrder(tenantId, orderId);
    if (!existing) {
      throw new ResourceNotFoundError('Order', orderId);
    }

    const now = new Date().toISOString();

    // Merge updates with existing order
    const updatedOrder: Order = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.putOrder(tenantId, updatedOrder);

    return updatedOrder;
  },

  /**
   * Add a fill to an order
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @param fill - The fill to add
   * @returns The updated order
   * @throws ResourceNotFoundError if order doesn't exist
   */
  async addFill(tenantId: string, orderId: string, fill: Fill): Promise<Order> {
    const existing = await this.getOrder(tenantId, orderId);
    if (!existing) {
      throw new ResourceNotFoundError('Order', orderId);
    }

    const fills = [...existing.fills, fill];
    const filledQuantity = fills.reduce((sum, f) => sum + f.quantity, 0);
    const remainingQuantity = existing.quantity - filledQuantity;

    // Calculate weighted average price
    const totalValue = fills.reduce((sum, f) => sum + f.quantity * f.price, 0);
    const averageFilledPrice = filledQuantity > 0 ? totalValue / filledQuantity : undefined;

    // Determine new status
    let status: OrderStatus = existing.status;
    if (remainingQuantity <= 0) {
      status = 'FILLED';
    } else if (filledQuantity > 0) {
      status = 'PARTIALLY_FILLED';
    }

    const now = new Date().toISOString();

    const updatedOrder: Order = {
      ...existing,
      fills,
      filledQuantity,
      remainingQuantity: Math.max(0, remainingQuantity),
      averageFilledPrice,
      status,
      updatedAt: now,
      completedAt: status === 'FILLED' ? now : existing.completedAt,
    };

    await this.putOrder(tenantId, updatedOrder);

    return updatedOrder;
  },

  /**
   * Delete an order
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @throws ResourceNotFoundError if order doesn't exist
   */
  async deleteOrder(tenantId: string, orderId: string): Promise<void> {
    // First verify the order exists and belongs to this tenant
    const existing = await this.getOrder(tenantId, orderId);
    if (!existing) {
      throw new ResourceNotFoundError('Order', orderId);
    }

    await documentClient
      .delete({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
          [KEY_SCHEMA.sortKey]: orderId,
        },
      })
      .promise();
  },

  /**
   * Check if an order exists for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param orderId - The order identifier
   * @returns True if the order exists
   */
  async orderExists(tenantId: string, orderId: string): Promise<boolean> {
    const order = await this.getOrder(tenantId, orderId);
    return order !== null;
  },

  /**
   * Check if an order with the given idempotency key exists
   *
   * @param tenantId - The tenant identifier
   * @param idempotencyKey - The idempotency key
   * @returns The existing order if found, null otherwise
   */
  async getOrderByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<Order | null> {
    // Query all orders for the tenant and filter by idempotency key
    // In production, this would use a GSI on idempotencyKey
    const result = await documentClient
      .query({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :tenantId',
        FilterExpression: '#idempotencyKey = :idempotencyKey',
        ExpressionAttributeNames: {
          '#pk': KEY_SCHEMA.partitionKey,
          '#idempotencyKey': 'idempotencyKey',
        },
        ExpressionAttributeValues: {
          ':tenantId': tenantId,
          ':idempotencyKey': idempotencyKey,
        },
      })
      .promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as Order;
  },

  /**
   * Get orders by strategy ID
   *
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param limit - Optional limit on results
   * @returns List of orders for the strategy
   */
  async getOrdersByStrategy(
    tenantId: string,
    strategyId: string,
    limit?: number
  ): Promise<Order[]> {
    return this.listOrders(tenantId, { strategyId, limit });
  },

  /**
   * Get orders by exchange ID
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param limit - Optional limit on results
   * @returns List of orders for the exchange
   */
  async getOrdersByExchange(
    tenantId: string,
    exchangeId: ExchangeId,
    limit?: number
  ): Promise<Order[]> {
    return this.listOrders(tenantId, { exchangeId, limit });
  },
};
