/**
 * BSDEX (Boerse Stuttgart Digital Exchange) Adapter
 *
 * Implements the ExchangeAdapter interface for BSDEX exchange.
 * BSDEX is a regulated German cryptocurrency exchange operated by Boerse Stuttgart.
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
 * BSDEX-specific configuration
 */
export interface BSDEXAdapterConfig extends ExchangeAdapterConfig {
  clientId?: string; // Optional client identifier for BSDEX
}

/**
 * BSDEX API response types
 */
interface BSDEXOrderResponse {
  orderId: string;
  clientOrderId: string;
  instrument: string;
  side: string;
  type: string;
  status: string;
  quantity: string;
  filledQuantity: string;
  price?: string;
  stopPrice?: string;
  averagePrice?: string;
  fee?: string;
  feeAsset?: string;
  createdAt: string;
  updatedAt: string;
}

interface BSDEXAccountBalance {
  asset: string;
  available: string;
  reserved: string;
  total: string;
}

interface BSDEXAccountResponse {
  accountId: string;
  balances: BSDEXAccountBalance[];
  updatedAt: string;
}

/**
 * BSDEX Exchange Adapter
 *
 * Implements connectivity to BSDEX exchange via REST API.
 * BSDEX is a regulated exchange, so it follows strict compliance requirements.
 */
export class BSDEXAdapter extends BaseExchangeAdapter {
  readonly exchangeId: ExchangeId = 'BSDEX';
  readonly mode: ExchangeMode;

  private readonly clientId?: string;
  private orderUpdateCallbacks: Map<string, (update: OrderUpdate) => void> = new Map();
  private executionCallbacks: Map<string, (execution: ExecutionUpdate) => void> = new Map();

  // BSDEX API endpoints
  private static readonly PRODUCTION_REST_ENDPOINT = 'https://api.bsdex.de';
  private static readonly SANDBOX_REST_ENDPOINT = 'https://api.sandbox.bsdex.de';

  constructor(config: BSDEXAdapterConfig) {
    super(config);
    this.mode = config.mode;
    this.clientId = config.clientId;
  }

  /**
   * Get the appropriate REST endpoint based on mode
   */
  private getRestEndpoint(): string {
    if (this.config.restEndpoint) {
      return this.config.restEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? BSDEXAdapter.SANDBOX_REST_ENDPOINT
      : BSDEXAdapter.PRODUCTION_REST_ENDPOINT;
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to BSDEX exchange
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
        `Failed to connect to BSDEX: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.exchangeId,
        undefined,
        true,
        error
      );
    }
  }

  /**
   * Disconnect from BSDEX exchange
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
   * Submit an order to BSDEX
   */
  async submitOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      const body = this.buildOrderBody(order);
      const response = await this.signedRequest<BSDEXOrderResponse>(
        'POST',
        '/v1/orders',
        body
      );

      return this.mapBSDEXOrderResponse(response, order.orderId);
    }, 'submitOrder');
  }

  /**
   * Cancel an order on BSDEX
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
   * Modify an existing order on BSDEX
   * Note: BSDEX may not support direct order modification, so we cancel and resubmit
   */
  async modifyOrder(orderId: string, modifications: OrderModification): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      // Get current order status
      const currentOrder = await this.getOrderDetails(orderId);

      // Cancel existing order
      await this.cancelOrder(orderId, currentOrder.orderId);

      // Create new order with modifications
      const newOrderRequest: OrderRequest = {
        orderId: generateUUID(),
        tenantId: this.config.tenantId,
        strategyId: '',
        assetId: currentOrder.instrument,
        side: currentOrder.side.toUpperCase() as 'BUY' | 'SELL',
        orderType: this.mapBSDEXOrderType(currentOrder.type),
        quantity: modifications.newQuantity ?? parseFloat(currentOrder.quantity),
        price: modifications.newPrice ?? (currentOrder.price ? parseFloat(currentOrder.price) : undefined),
        stopPrice: modifications.newStopPrice ?? (currentOrder.stopPrice ? parseFloat(currentOrder.stopPrice) : undefined),
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
      const response = await this.signedRequest<BSDEXOrderResponse>(
        'GET',
        `/v1/orders/${exchangeOrderId}`
      );

      return this.mapBSDEXOrderStatus(response.status);
    }, 'getOrderStatus');
  }

  /**
   * Get order details
   */
  private async getOrderDetails(orderId: string): Promise<BSDEXOrderResponse> {
    const response = await this.signedRequest<BSDEXOrderResponse>(
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
      const response = await this.signedRequest<BSDEXAccountResponse>(
        'GET',
        '/v1/account'
      );

      let balances: AssetBalance[] = response.balances.map((b) => ({
        asset: b.asset,
        free: parseFloat(b.available),
        locked: parseFloat(b.reserved),
        total: parseFloat(b.total),
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
  // Real-time Subscriptions (Polling-based for BSDEX)
  // ============================================

  /**
   * Subscribe to order updates
   * Note: BSDEX may use polling instead of WebSocket
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
   * Make a signed request to BSDEX API
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
      'X-BSDEX-APIKEY': this.config.apiKey,
      'X-BSDEX-SIGNATURE': signature,
      'X-BSDEX-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
    };

    if (this.clientId) {
      headers['X-BSDEX-CLIENT-ID'] = this.clientId;
    }

    const response = await this.fetchWithTimeout(url, {
      method,
      headers,
      body: body ? bodyStr : undefined,
    });

    if (!response.ok) {
      const errorBody = await this.safeParseJson(response);
      throw this.createBSDEXError(response.status, errorBody);
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
   * Ping BSDEX API to test connectivity
   */
  private async ping(): Promise<void> {
    const url = `${this.getRestEndpoint()}/v1/ping`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new ExchangeAdapterError(
        'BSDEX API ping failed',
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
   * Build order body for BSDEX API
   */
  private buildOrderBody(order: OrderRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      clientOrderId: order.orderId,
      instrument: order.assetId,
      side: order.side.toLowerCase(),
      type: this.mapOrderTypeToBSDEX(order.orderType),
      quantity: order.quantity.toString(),
    };

    // Add price for limit orders
    if (order.price !== undefined && (order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT')) {
      body.price = order.price.toString();
    }

    // Add stop price for stop orders
    if (order.stopPrice !== undefined && (order.orderType === 'STOP_LIMIT' || order.orderType === 'STOP_MARKET')) {
      body.stopPrice = order.stopPrice.toString();
    }

    // Add time in force
    body.timeInForce = this.mapTimeInForceToBSDEX(order.timeInForce);

    return body;
  }

  /**
   * Map internal order type to BSDEX order type
   */
  private mapOrderTypeToBSDEX(orderType: OrderType): string {
    const mapping: Record<OrderType, string> = {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP_LIMIT: 'stop_limit',
      STOP_MARKET: 'stop_market',
      TRAILING_STOP: 'trailing_stop',
    };
    return mapping[orderType];
  }

  /**
   * Map BSDEX order type to internal order type
   */
  private mapBSDEXOrderType(type: string): OrderType {
    const mapping: Record<string, OrderType> = {
      market: 'MARKET',
      limit: 'LIMIT',
      stop_limit: 'STOP_LIMIT',
      stop_market: 'STOP_MARKET',
      trailing_stop: 'TRAILING_STOP',
    };
    return mapping[type.toLowerCase()] ?? 'LIMIT';
  }

  /**
   * Map internal time in force to BSDEX time in force
   */
  private mapTimeInForceToBSDEX(tif: TimeInForce): string {
    const mapping: Record<TimeInForce, string> = {
      GTC: 'gtc',
      IOC: 'ioc',
      FOK: 'fok',
      GTD: 'gtd',
    };
    return mapping[tif];
  }

  /**
   * Map BSDEX order status to internal status
   */
  private mapBSDEXOrderStatus(status: string): OrderStatus {
    const mapping: Record<string, OrderStatus> = {
      new: 'PENDING',
      open: 'OPEN',
      partially_filled: 'PARTIALLY_FILLED',
      filled: 'FILLED',
      cancelled: 'CANCELLED',
      rejected: 'REJECTED',
      expired: 'EXPIRED',
    };
    return mapping[status.toLowerCase()] ?? 'PENDING';
  }

  /**
   * Map BSDEX order response to internal OrderResponse
   */
  private mapBSDEXOrderResponse(
    response: BSDEXOrderResponse,
    orderId: string
  ): OrderResponse {
    const filledQuantity = parseFloat(response.filledQuantity);
    const originalQuantity = parseFloat(response.quantity);

    return {
      orderId,
      exchangeOrderId: response.orderId,
      exchangeId: this.exchangeId,
      status: this.mapBSDEXOrderStatus(response.status),
      filledQuantity,
      remainingQuantity: originalQuantity - filledQuantity,
      averagePrice: response.averagePrice ? parseFloat(response.averagePrice) : undefined,
      commission: response.fee ? parseFloat(response.fee) : undefined,
      commissionAsset: response.feeAsset,
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
   * Create BSDEX-specific error
   */
  private createBSDEXError(status: number, body: unknown): ExchangeAdapterError {
    let message = `BSDEX API error: HTTP ${status}`;
    let retryable = false;

    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      if (errorBody.message) {
        message = `BSDEX API error: ${errorBody.message}`;
      }
      if (errorBody.code) {
        message += ` (code: ${errorBody.code})`;
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
