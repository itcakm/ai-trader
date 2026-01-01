/**
 * BISON Exchange Adapter
 *
 * Implements the ExchangeAdapter interface for BISON trading app.
 * BISON is a cryptocurrency trading app operated by Boerse Stuttgart Group.
 * Provides REST API calls for order submission, cancellation, status query, and balance query.
 *
 * Requirements: 1.1, 2.1
 */

import * as crypto from 'crypto';
import {
  ExchangeId,
  ExchangeMode,
  SubscriptionHandle,
  BalanceResponse,
  PositionResponse,
  AssetBalance,
  RateLimitStatus,
} from '../../types/exchange';
import {
  OrderRequest,
  OrderResponse,
  OrderModification,
  CancelResponse,
  OrderStatus,
  OrderUpdate,
  ExecutionUpdate,
  OrderType,
  TimeInForce,
} from '../../types/exchange-order';
import {
  BaseExchangeAdapter,
  ExchangeAdapterConfig,
  ExchangeAdapterError,
} from './base-exchange-adapter';
import { generateUUID } from '../../utils/uuid';

/**
 * BISON-specific configuration
 */
export interface BISONAdapterConfig extends ExchangeAdapterConfig {
  deviceId?: string; // Optional device identifier for BISON
}

/**
 * BISON API response types
 */
interface BISONOrderResponse {
  id: string;
  clientOrderId: string;
  tradingPair: string;
  side: string;
  orderType: string;
  status: string;
  amount: string;
  filledAmount: string;
  price?: string;
  averageExecutionPrice?: string;
  fees?: string;
  feeCurrency?: string;
  createdAt: string;
  updatedAt: string;
}

interface BISONWalletBalance {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

interface BISONWalletResponse {
  userId: string;
  wallets: BISONWalletBalance[];
  lastUpdated: string;
}

/**
 * BISON Exchange Adapter
 *
 * Implements connectivity to BISON trading app via REST API.
 * BISON focuses on simplicity and is designed for retail investors.
 */
export class BISONAdapter extends BaseExchangeAdapter {
  readonly exchangeId: ExchangeId = 'BISON';
  readonly mode: ExchangeMode;

  private readonly deviceId?: string;
  private orderUpdateCallbacks: Map<string, (update: OrderUpdate) => void> = new Map();
  private executionCallbacks: Map<string, (execution: ExecutionUpdate) => void> = new Map();

  // BISON API endpoints
  private static readonly PRODUCTION_REST_ENDPOINT = 'https://api.bisonapp.com';
  private static readonly SANDBOX_REST_ENDPOINT = 'https://api.sandbox.bisonapp.com';

  constructor(config: BISONAdapterConfig) {
    super(config);
    this.mode = config.mode;
    this.deviceId = config.deviceId;
  }

  /**
   * Get the appropriate REST endpoint based on mode
   */
  private getRestEndpoint(): string {
    if (this.config.restEndpoint) {
      return this.config.restEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? BISONAdapter.SANDBOX_REST_ENDPOINT
      : BISONAdapter.PRODUCTION_REST_ENDPOINT;
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to BISON exchange
   */
  async connect(): Promise<void> {
    this.setConnectionStatus('CONNECTING');

    try {
      // Test REST API connectivity
      await this.ping();
      this.setConnectionStatus('CONNECTED');
    } catch (error) {
      this.setConnectionStatus('ERROR');
      throw new ExchangeAdapterError(
        `Failed to connect to BISON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.exchangeId,
        undefined,
        true,
        error
      );
    }
  }

  /**
   * Disconnect from BISON exchange
   */
  async disconnect(): Promise<void> {
    // Clear callbacks
    this.orderUpdateCallbacks.clear();
    this.executionCallbacks.clear();

    this.setConnectionStatus('DISCONNECTED');
  }

  // ============================================
  // REST API - Order Operations
  // ============================================

  /**
   * Submit an order to BISON
   */
  async submitOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      const body = this.buildOrderBody(order);
      const response = await this.signedRequest<BISONOrderResponse>(
        'POST',
        '/v1/orders',
        body
      );

      return this.mapBISONOrderResponse(response, order.orderId);
    }, 'submitOrder');
  }

  /**
   * Cancel an order on BISON
   */
  async cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse> {
    return this.executeWithRetry(async () => {
      await this.signedRequest<void>(
        'DELETE',
        `/v1/orders/${exchangeOrderId}`
      );

      return {
        orderId,
        exchangeOrderId,
        status: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
      };
    }, 'cancelOrder');
  }

  /**
   * Modify an existing order on BISON
   * Note: BISON may not support direct order modification, so we cancel and resubmit
   */
  async modifyOrder(orderId: string, modifications: OrderModification): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      // Get current order status
      const currentOrder = await this.getOrderDetails(orderId);

      // Cancel existing order
      await this.cancelOrder(orderId, currentOrder.id);

      // Create new order with modifications
      const newOrderRequest: OrderRequest = {
        orderId: generateUUID(),
        tenantId: this.config.tenantId,
        strategyId: '',
        assetId: currentOrder.tradingPair,
        side: currentOrder.side.toUpperCase() as 'BUY' | 'SELL',
        orderType: this.mapBISONOrderType(currentOrder.orderType),
        quantity: modifications.newQuantity ?? parseFloat(currentOrder.amount),
        price: modifications.newPrice ?? (currentOrder.price ? parseFloat(currentOrder.price) : undefined),
        timeInForce: 'GTC',
        idempotencyKey: generateUUID(),
        timestamp: new Date().toISOString(),
      };

      return this.submitOrder(newOrderRequest);
    }, 'modifyOrder');
  }

  /**
   * Get the status of an order
   */
  async getOrderStatus(orderId: string, exchangeOrderId: string): Promise<OrderStatus> {
    return this.executeWithRetry(async () => {
      const response = await this.signedRequest<BISONOrderResponse>(
        'GET',
        `/v1/orders/${exchangeOrderId}`
      );

      return this.mapBISONOrderStatus(response.status);
    }, 'getOrderStatus');
  }

  /**
   * Get order details
   */
  private async getOrderDetails(orderId: string): Promise<BISONOrderResponse> {
    const response = await this.signedRequest<BISONOrderResponse>(
      'GET',
      `/v1/orders/${orderId}`
    );
    return response;
  }

  // ============================================
  // REST API - Account Operations
  // ============================================

  /**
   * Get account balance
   */
  async getBalance(asset?: string): Promise<BalanceResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.signedRequest<BISONWalletResponse>(
        'GET',
        '/v1/wallets'
      );

      let balances: AssetBalance[] = response.wallets.map((w) => ({
        asset: w.currency,
        free: parseFloat(w.available),
        locked: parseFloat(w.locked),
        total: parseFloat(w.total),
      }));

      // Filter by asset if specified
      if (asset) {
        balances = balances.filter((b) => b.asset === asset);
      }

      // Filter out zero balances
      balances = balances.filter((b) => b.total > 0);

      return {
        exchangeId: this.exchangeId,
        balances,
        timestamp: new Date().toISOString(),
      };
    }, 'getBalance');
  }

  /**
   * Get current positions
   */
  async getPositions(): Promise<PositionResponse[]> {
    const balanceResponse = await this.getBalance();

    return balanceResponse.balances
      .filter((b) => b.total > 0)
      .map((b) => ({
        exchangeId: this.exchangeId,
        assetId: b.asset,
        quantity: b.total,
        averageEntryPrice: 0,
        unrealizedPnL: 0,
        timestamp: balanceResponse.timestamp,
      }));
  }

  // ============================================
  // Real-time Subscriptions (Polling-based for BISON)
  // ============================================

  /**
   * Subscribe to order updates
   * Note: BISON may use polling instead of WebSocket
   */
  async subscribeToOrderUpdates(
    callback: (update: OrderUpdate) => void
  ): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle('orderUpdates');
    this.orderUpdateCallbacks.set(handle.id, callback);
    return handle;
  }

  /**
   * Subscribe to execution/fill updates
   */
  async subscribeToExecutions(
    callback: (execution: ExecutionUpdate) => void
  ): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle('executions');
    this.executionCallbacks.set(handle.id, callback);
    return handle;
  }

  /**
   * Unsubscribe from a subscription
   */
  async unsubscribe(handle: SubscriptionHandle): Promise<void> {
    this.orderUpdateCallbacks.delete(handle.id);
    this.executionCallbacks.delete(handle.id);
    this.removeSubscriptionHandle(handle.id);
  }

  // ============================================
  // HMAC Authentication
  // ============================================

  /**
   * Make a signed request to BISON API
   */
  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';

    // Create signature
    const signature = this.createSignature(timestamp, method, path, bodyStr);

    const url = `${this.getRestEndpoint()}${path}`;
    const headers: Record<string, string> = {
      'X-BISON-APIKEY': this.config.apiKey,
      'X-BISON-SIGNATURE': signature,
      'X-BISON-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
    };

    if (this.deviceId) {
      headers['X-BISON-DEVICE-ID'] = this.deviceId;
    }

    const response = await this.fetchWithTimeout(url, {
      method,
      headers,
      body: body ? bodyStr : undefined,
    });

    if (!response.ok) {
      const errorBody = await this.safeParseJson(response);
      throw this.createBISONError(response.status, errorBody);
    }

    // Handle empty responses (e.g., DELETE)
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Create HMAC-SHA256 signature
   */
  createSignature(timestamp: string, method: string, path: string, body: string): string {
    const message = timestamp + method + path + body;
    return crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Ping BISON API to test connectivity
   */
  private async ping(): Promise<void> {
    const url = `${this.getRestEndpoint()}/v1/health`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new ExchangeAdapterError(
        'BISON API health check failed',
        this.exchangeId,
        response.status,
        true
      );
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Build order body for BISON API
   */
  private buildOrderBody(order: OrderRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      clientOrderId: order.orderId,
      tradingPair: order.assetId,
      side: order.side.toLowerCase(),
      orderType: this.mapOrderTypeToBISON(order.orderType),
      amount: order.quantity.toString(),
    };

    // Add price for limit orders
    if (order.price !== undefined && order.orderType === 'LIMIT') {
      body.price = order.price.toString();
    }

    return body;
  }

  /**
   * Map internal order type to BISON order type
   * Note: BISON may have limited order type support
   */
  private mapOrderTypeToBISON(orderType: OrderType): string {
    const mapping: Record<OrderType, string> = {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP_LIMIT: 'limit', // BISON may not support stop orders
      STOP_MARKET: 'market',
      TRAILING_STOP: 'market',
    };
    return mapping[orderType];
  }

  /**
   * Map BISON order type to internal order type
   */
  private mapBISONOrderType(type: string): OrderType {
    const mapping: Record<string, OrderType> = {
      market: 'MARKET',
      limit: 'LIMIT',
    };
    return mapping[type.toLowerCase()] ?? 'LIMIT';
  }

  /**
   * Map BISON order status to internal status
   */
  private mapBISONOrderStatus(status: string): OrderStatus {
    const mapping: Record<string, OrderStatus> = {
      pending: 'PENDING',
      open: 'OPEN',
      partial: 'PARTIALLY_FILLED',
      filled: 'FILLED',
      cancelled: 'CANCELLED',
      rejected: 'REJECTED',
      expired: 'EXPIRED',
    };
    return mapping[status.toLowerCase()] ?? 'PENDING';
  }

  /**
   * Map BISON order response to internal OrderResponse
   */
  private mapBISONOrderResponse(
    response: BISONOrderResponse,
    orderId: string
  ): OrderResponse {
    const filledQuantity = parseFloat(response.filledAmount);
    const originalQuantity = parseFloat(response.amount);

    return {
      orderId,
      exchangeOrderId: response.id,
      exchangeId: this.exchangeId,
      status: this.mapBISONOrderStatus(response.status),
      filledQuantity,
      remainingQuantity: originalQuantity - filledQuantity,
      averagePrice: response.averageExecutionPrice ? parseFloat(response.averageExecutionPrice) : undefined,
      commission: response.fees ? parseFloat(response.fees) : undefined,
      commissionAsset: response.feeCurrency,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    };
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30000
    );

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Safely parse JSON from response
   */
  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Create BISON-specific error
   */
  private createBISONError(status: number, body: unknown): ExchangeAdapterError {
    let message = `BISON API error: HTTP ${status}`;
    let retryable = false;

    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      if (errorBody.message) {
        message = `BISON API error: ${errorBody.message}`;
      }
      if (errorBody.errorCode) {
        message += ` (code: ${errorBody.errorCode})`;
      }
    }

    // Determine if error is retryable
    if (status >= 500 || status === 429) {
      retryable = true;
    }

    return new ExchangeAdapterError(
      message,
      this.exchangeId,
      status,
      retryable,
      body
    );
  }

  /**
   * Override rate limit status
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      exchangeId: this.exchangeId,
      ordersRemaining: -1,
      queriesRemaining: -1,
      wsMessagesRemaining: -1,
      resetsAt: new Date(Date.now() + 60000).toISOString(),
    };
  }
}
