/**
 * Coinbase Exchange Adapter
 *
 * Implements the ExchangeAdapter interface for Coinbase exchange.
 * Provides REST API calls for order submission, cancellation, status query, and balance query.
 * Supports WebSocket integration for real-time order updates and executions.
 * Implements passphrase authentication with HMAC signature for REST requests.
 *
 * Requirements: 1.1, 2.1, 2.2, 3.1, 3.2
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
  OrderSide,
  TimeInForce,
} from '../../types/exchange-order';
import {
  BaseExchangeAdapter,
  ExchangeAdapterConfig,
  ExchangeAdapterError,
} from './base-exchange-adapter';
import {
  WebSocketClient,
  NormalizedWSMessage,
} from './websocket-client';
import { generateUUID } from '../../utils/uuid';

/**
 * Coinbase-specific configuration
 */
export interface CoinbaseAdapterConfig extends ExchangeAdapterConfig {
  passphrase: string; // Required for Coinbase authentication
}

/**
 * Coinbase API response types
 */
interface CoinbaseOrderResponse {
  id: string;
  product_id: string;
  side: string;
  type: string;
  time_in_force: string;
  post_only: boolean;
  created_at: string;
  done_at?: string;
  done_reason?: string;
  fill_fees: string;
  filled_size: string;
  executed_value: string;
  status: string;
  settled: boolean;
  size: string;
  price?: string;
  stop_price?: string;
  funds?: string;
}

interface CoinbaseAccount {
  id: string;
  currency: string;
  balance: string;
  available: string;
  hold: string;
  profile_id: string;
  trading_enabled: boolean;
}

interface CoinbaseFill {
  trade_id: number;
  product_id: string;
  order_id: string;
  user_id: string;
  profile_id: string;
  liquidity: string;
  price: string;
  size: string;
  fee: string;
  created_at: string;
  side: string;
  settled: boolean;
  usd_volume: string;
}


/**
 * Coinbase WebSocket message types
 */
interface CoinbaseWSMessage {
  type: string;
  sequence?: number;
  product_id?: string;
  time?: string;
  order_id?: string;
  client_oid?: string;
  side?: string;
  order_type?: string;
  size?: string;
  remaining_size?: string;
  price?: string;
  reason?: string;
  trade_id?: number;
  maker_order_id?: string;
  taker_order_id?: string;
  taker_user_id?: string;
  user_id?: string;
  taker_profile_id?: string;
  profile_id?: string;
  new_size?: string;
  old_size?: string;
  new_funds?: string;
  old_funds?: string;
  message?: string;
  funds?: string;
}

/**
 * Coinbase Exchange Adapter
 *
 * Implements connectivity to Coinbase exchange via REST and WebSocket APIs.
 */
export class CoinbaseAdapter extends BaseExchangeAdapter {
  readonly exchangeId: ExchangeId = 'COINBASE';
  readonly mode: ExchangeMode;

  private readonly passphrase: string;
  private wsClient: WebSocketClient | null = null;
  private orderUpdateCallbacks: Map<string, (update: OrderUpdate) => void> = new Map();
  private executionCallbacks: Map<string, (execution: ExecutionUpdate) => void> = new Map();
  private wsConnectionId: string | null = null;

  // Coinbase API endpoints
  private static readonly PRODUCTION_REST_ENDPOINT = 'https://api.exchange.coinbase.com';
  private static readonly SANDBOX_REST_ENDPOINT = 'https://api-public.sandbox.exchange.coinbase.com';
  private static readonly PRODUCTION_WS_ENDPOINT = 'wss://ws-feed.exchange.coinbase.com';
  private static readonly SANDBOX_WS_ENDPOINT = 'wss://ws-feed-public.sandbox.exchange.coinbase.com';

  constructor(config: CoinbaseAdapterConfig) {
    super(config);
    this.mode = config.mode;
    this.passphrase = config.passphrase;
  }

  /**
   * Get the appropriate REST endpoint based on mode
   */
  private getRestEndpoint(): string {
    if (this.config.restEndpoint) {
      return this.config.restEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? CoinbaseAdapter.SANDBOX_REST_ENDPOINT
      : CoinbaseAdapter.PRODUCTION_REST_ENDPOINT;
  }

  /**
   * Get the appropriate WebSocket endpoint based on mode
   */
  private getWsEndpoint(): string {
    if (this.config.wsEndpoint) {
      return this.config.wsEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? CoinbaseAdapter.SANDBOX_WS_ENDPOINT
      : CoinbaseAdapter.PRODUCTION_WS_ENDPOINT;
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to Coinbase exchange
   */
  async connect(): Promise<void> {
    this.setConnectionStatus('CONNECTING');

    try {
      // Test REST API connectivity
      await this.getServerTime();

      // Initialize WebSocket client
      this.wsClient = new WebSocketClient(
        this.exchangeId,
        {
          reconnect: true,
          reconnectStrategy: {
            initialDelayMs: 1000,
            maxDelayMs: 60000,
            multiplier: 2,
            maxAttempts: 10,
            jitterPercent: 10,
          },
          heartbeatIntervalMs: 30000,
          pingTimeoutMs: 10000,
        },
        this.parseCoinbaseWSMessage.bind(this)
      );

      this.setConnectionStatus('CONNECTED');
    } catch (error) {
      this.setConnectionStatus('ERROR');
      throw new ExchangeAdapterError(
        `Failed to connect to Coinbase: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.exchangeId,
        undefined,
        true,
        error
      );
    }
  }

  /**
   * Disconnect from Coinbase exchange
   */
  async disconnect(): Promise<void> {
    // Disconnect WebSocket
    if (this.wsClient) {
      await this.wsClient.disconnectAll();
      this.wsClient = null;
    }

    this.wsConnectionId = null;

    // Clear callbacks
    this.orderUpdateCallbacks.clear();
    this.executionCallbacks.clear();

    this.setConnectionStatus('DISCONNECTED');
  }


  // ============================================
  // REST API - Order Operations
  // ============================================

  /**
   * Submit an order to Coinbase
   */
  async submitOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      const body = this.buildOrderBody(order);
      const response = await this.signedRequest<CoinbaseOrderResponse>(
        'POST',
        '/orders',
        body
      );

      return this.mapCoinbaseOrderResponse(response, order.orderId);
    }, 'submitOrder');
  }

  /**
   * Cancel an order on Coinbase
   */
  async cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse> {
    return this.executeWithRetry(async () => {
      await this.signedRequest<string>(
        'DELETE',
        `/orders/${exchangeOrderId}`
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
   * Modify an existing order on Coinbase
   * Note: Coinbase doesn't support direct order modification, so we cancel and resubmit
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
        assetId: currentOrder.product_id,
        side: currentOrder.side.toUpperCase() as OrderSide,
        orderType: this.mapCoinbaseOrderType(currentOrder.type),
        quantity: modifications.newQuantity ?? parseFloat(currentOrder.size),
        price: modifications.newPrice ?? (currentOrder.price ? parseFloat(currentOrder.price) : undefined),
        stopPrice: modifications.newStopPrice ?? (currentOrder.stop_price ? parseFloat(currentOrder.stop_price) : undefined),
        timeInForce: this.mapCoinbaseTimeInForce(currentOrder.time_in_force),
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
      const response = await this.signedRequest<CoinbaseOrderResponse>(
        'GET',
        `/orders/${exchangeOrderId}`
      );

      return this.mapCoinbaseOrderStatus(response.status);
    }, 'getOrderStatus');
  }

  /**
   * Get order details
   */
  private async getOrderDetails(orderId: string): Promise<CoinbaseOrderResponse> {
    // Try to get by client_oid first
    const orders = await this.signedRequest<CoinbaseOrderResponse[]>(
      'GET',
      '/orders',
      undefined,
      { status: 'all' }
    );

    const order = orders.find(o => o.id === orderId);
    if (!order) {
      throw new ExchangeAdapterError(
        `Order ${orderId} not found`,
        this.exchangeId,
        404,
        false
      );
    }

    return order;
  }

  // ============================================
  // REST API - Account Operations
  // ============================================

  /**
   * Get account balance
   */
  async getBalance(asset?: string): Promise<BalanceResponse> {
    return this.executeWithRetry(async () => {
      const accounts = await this.signedRequest<CoinbaseAccount[]>(
        'GET',
        '/accounts'
      );

      let balances: AssetBalance[] = accounts.map((a) => ({
        asset: a.currency,
        free: parseFloat(a.available),
        locked: parseFloat(a.hold),
        total: parseFloat(a.balance),
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
   * Note: Coinbase spot doesn't have positions in the traditional sense,
   * so we return balances as positions
   */
  async getPositions(): Promise<PositionResponse[]> {
    const balanceResponse = await this.getBalance();

    return balanceResponse.balances
      .filter((b) => b.total > 0)
      .map((b) => ({
        exchangeId: this.exchangeId,
        assetId: b.asset,
        quantity: b.total,
        averageEntryPrice: 0, // Not available for spot
        unrealizedPnL: 0, // Not applicable for spot
        timestamp: balanceResponse.timestamp,
      }));
  }


  // ============================================
  // WebSocket - Real-time Subscriptions
  // ============================================

  /**
   * Subscribe to order updates via WebSocket
   */
  async subscribeToOrderUpdates(
    callback: (update: OrderUpdate) => void
  ): Promise<SubscriptionHandle> {
    await this.ensureWebSocketConnection();

    const handle = this.createSubscriptionHandle('user');
    this.orderUpdateCallbacks.set(handle.id, callback);

    // Subscribe to user channel if not already subscribed
    if (this.orderUpdateCallbacks.size === 1 && this.executionCallbacks.size === 0) {
      await this.subscribeToUserChannel();
    }

    return handle;
  }

  /**
   * Subscribe to execution/fill updates via WebSocket
   */
  async subscribeToExecutions(
    callback: (execution: ExecutionUpdate) => void
  ): Promise<SubscriptionHandle> {
    await this.ensureWebSocketConnection();

    const handle = this.createSubscriptionHandle('user');
    this.executionCallbacks.set(handle.id, callback);

    // Subscribe to user channel if not already subscribed
    if (this.orderUpdateCallbacks.size === 0 && this.executionCallbacks.size === 1) {
      await this.subscribeToUserChannel();
    }

    return handle;
  }

  /**
   * Unsubscribe from a subscription
   */
  async unsubscribe(handle: SubscriptionHandle): Promise<void> {
    this.orderUpdateCallbacks.delete(handle.id);
    this.executionCallbacks.delete(handle.id);
    this.removeSubscriptionHandle(handle.id);

    // If no more subscriptions, unsubscribe from user channel
    if (this.orderUpdateCallbacks.size === 0 && this.executionCallbacks.size === 0) {
      await this.unsubscribeFromUserChannel();
    }
  }

  /**
   * Ensure WebSocket connection is established
   */
  private async ensureWebSocketConnection(): Promise<void> {
    if (this.wsConnectionId && this.wsClient) {
      const status = this.wsClient.getConnectionStatus(this.wsConnectionId);
      if (status === 'CONNECTED') {
        return;
      }
    }

    if (!this.wsClient) {
      throw new ExchangeAdapterError(
        'WebSocket client not initialized',
        this.exchangeId,
        undefined,
        false
      );
    }

    const wsEndpoint = this.getWsEndpoint();
    this.wsConnectionId = await this.wsClient.connect(wsEndpoint, 'coinbase-user');

    // Set up message handlers
    this.wsClient.on('message', (message: NormalizedWSMessage) => {
      this.handleWSMessage(message);
    });
  }

  /**
   * Subscribe to user channel for order updates
   */
  private async subscribeToUserChannel(): Promise<void> {
    if (!this.wsClient || !this.wsConnectionId) {
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.createWSSignature(timestamp, 'GET', '/users/self/verify');

    const subscribeMessage = {
      type: 'subscribe',
      channels: [{ name: 'user', product_ids: ['BTC-USD', 'ETH-USD'] }], // Can be configured
      signature,
      key: this.config.apiKey,
      passphrase: this.passphrase,
      timestamp,
    };

    await this.wsClient.send(this.wsConnectionId, subscribeMessage);
  }

  /**
   * Unsubscribe from user channel
   */
  private async unsubscribeFromUserChannel(): Promise<void> {
    if (!this.wsClient || !this.wsConnectionId) {
      return;
    }

    const unsubscribeMessage = {
      type: 'unsubscribe',
      channels: ['user'],
    };

    await this.wsClient.send(this.wsConnectionId, unsubscribeMessage);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWSMessage(message: NormalizedWSMessage): void {
    if (message.type === 'ORDER_UPDATE' && message.data) {
      const orderUpdate = message.data as OrderUpdate;
      Array.from(this.orderUpdateCallbacks.values()).forEach((callback) => {
        callback(orderUpdate);
      });
    } else if (message.type === 'EXECUTION_UPDATE' && message.data) {
      const executionUpdate = message.data as ExecutionUpdate;
      Array.from(this.executionCallbacks.values()).forEach((callback) => {
        callback(executionUpdate);
      });
    }
  }

  /**
   * Parse Coinbase WebSocket message into normalized format
   */
  private parseCoinbaseWSMessage(rawMessage: unknown): NormalizedWSMessage {
    const timestamp = new Date().toISOString();

    if (!rawMessage || typeof rawMessage !== 'object') {
      return {
        type: 'UNKNOWN',
        exchangeId: this.exchangeId,
        timestamp,
        rawMessage,
      };
    }

    const msg = rawMessage as CoinbaseWSMessage;
    const messageType = msg.type;

    // Handle different Coinbase message types
    switch (messageType) {
      case 'received':
      case 'open':
      case 'done':
      case 'change':
        return {
          type: 'ORDER_UPDATE',
          exchangeId: this.exchangeId,
          data: this.parseCoinbaseOrderUpdate(msg),
          timestamp: msg.time ?? timestamp,
          rawMessage,
        };

      case 'match':
        return {
          type: 'EXECUTION_UPDATE',
          exchangeId: this.exchangeId,
          data: this.parseCoinbaseExecutionUpdate(msg),
          timestamp: msg.time ?? timestamp,
          rawMessage,
        };

      case 'heartbeat':
        return {
          type: 'HEARTBEAT',
          exchangeId: this.exchangeId,
          timestamp: msg.time ?? timestamp,
          rawMessage,
        };

      case 'subscriptions':
        return {
          type: 'SUBSCRIPTION_ACK',
          exchangeId: this.exchangeId,
          timestamp,
          rawMessage,
        };

      case 'error':
        return {
          type: 'ERROR',
          exchangeId: this.exchangeId,
          data: { message: msg.message },
          timestamp,
          rawMessage,
        };

      default:
        return {
          type: 'UNKNOWN',
          exchangeId: this.exchangeId,
          timestamp,
          rawMessage,
        };
    }
  }

  /**
   * Parse Coinbase message into OrderUpdate
   */
  private parseCoinbaseOrderUpdate(msg: CoinbaseWSMessage): OrderUpdate {
    let status: OrderStatus = 'PENDING';

    switch (msg.type) {
      case 'received':
        status = 'PENDING';
        break;
      case 'open':
        status = 'OPEN';
        break;
      case 'done':
        status = msg.reason === 'filled' ? 'FILLED' : 'CANCELLED';
        break;
      case 'change':
        status = 'OPEN';
        break;
    }

    return {
      orderId: msg.client_oid ?? msg.order_id ?? '',
      exchangeOrderId: msg.order_id ?? '',
      exchangeId: this.exchangeId,
      status,
      filledQuantity: 0, // Coinbase doesn't provide this in order updates
      remainingQuantity: msg.remaining_size ? parseFloat(msg.remaining_size) : 0,
      lastFilledPrice: msg.price ? parseFloat(msg.price) : undefined,
      timestamp: msg.time ?? new Date().toISOString(),
    };
  }

  /**
   * Parse Coinbase match message into ExecutionUpdate
   */
  private parseCoinbaseExecutionUpdate(msg: CoinbaseWSMessage): ExecutionUpdate {
    return {
      executionId: msg.trade_id?.toString() ?? generateUUID(),
      orderId: msg.maker_order_id ?? msg.taker_order_id ?? '',
      exchangeOrderId: msg.maker_order_id ?? msg.taker_order_id ?? '',
      exchangeId: this.exchangeId,
      side: (msg.side?.toUpperCase() ?? 'BUY') as OrderSide,
      quantity: msg.size ? parseFloat(msg.size) : 0,
      price: msg.price ? parseFloat(msg.price) : 0,
      commission: 0, // Coinbase doesn't provide commission in match messages
      commissionAsset: 'USD',
      timestamp: msg.time ?? new Date().toISOString(),
    };
  }


  // ============================================
  // Passphrase + HMAC Authentication
  // ============================================

  /**
   * Make a signed request to Coinbase API (requires passphrase + HMAC signature)
   */
  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : '';

    // Build full path with query params
    let fullPath = path;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const queryString = new URLSearchParams(queryParams).toString();
      fullPath = `${path}?${queryString}`;
    }

    // Create signature
    const signature = this.createSignature(timestamp, method, fullPath, bodyStr);

    const url = `${this.getRestEndpoint()}${fullPath}`;
    const headers: Record<string, string> = {
      'CB-ACCESS-KEY': this.config.apiKey,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      'CB-ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json',
    };

    const response = await this.fetchWithTimeout(url, {
      method,
      headers,
      body: body ? bodyStr : undefined,
    });

    if (!response.ok) {
      const errorBody = await this.safeParseJson(response);
      throw this.createCoinbaseError(response.status, errorBody);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create HMAC-SHA256 signature for REST API
   *
   * Coinbase signature format: base64(hmac-sha256(timestamp + method + requestPath + body))
   */
  createSignature(timestamp: string, method: string, requestPath: string, body: string): string {
    const message = timestamp + method + requestPath + body;
    const key = Buffer.from(this.config.apiSecret, 'base64');
    return crypto
      .createHmac('sha256', key)
      .update(message)
      .digest('base64');
  }

  /**
   * Create HMAC-SHA256 signature for WebSocket authentication
   */
  private createWSSignature(timestamp: string, method: string, requestPath: string): string {
    const message = timestamp + method + requestPath;
    const key = Buffer.from(this.config.apiSecret, 'base64');
    return crypto
      .createHmac('sha256', key)
      .update(message)
      .digest('base64');
  }

  /**
   * Get server time to test connectivity
   */
  private async getServerTime(): Promise<void> {
    const url = `${this.getRestEndpoint()}/time`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new ExchangeAdapterError(
        'Coinbase API time check failed',
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
   * Build order body for Coinbase API
   */
  private buildOrderBody(order: OrderRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      product_id: order.assetId,
      side: order.side.toLowerCase(),
      type: this.mapOrderTypeToCoinbase(order.orderType),
      size: order.quantity.toString(),
      client_oid: order.orderId,
    };

    // Add time in force
    body.time_in_force = this.mapTimeInForceToCoinbase(order.timeInForce);

    // Add price for limit orders
    if (order.price !== undefined && (order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT')) {
      body.price = order.price.toString();
    }

    // Add stop price for stop orders
    if (order.stopPrice !== undefined && (order.orderType === 'STOP_LIMIT' || order.orderType === 'STOP_MARKET')) {
      body.stop_price = order.stopPrice.toString();
      body.stop = order.side === 'BUY' ? 'entry' : 'loss';
    }

    return body;
  }

  /**
   * Map internal order type to Coinbase order type
   */
  private mapOrderTypeToCoinbase(orderType: OrderType): string {
    const mapping: Record<OrderType, string> = {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP_LIMIT: 'limit',
      STOP_MARKET: 'market',
      TRAILING_STOP: 'market', // Coinbase doesn't support trailing stop directly
    };
    return mapping[orderType];
  }

  /**
   * Map Coinbase order type to internal order type
   */
  private mapCoinbaseOrderType(type: string): OrderType {
    const mapping: Record<string, OrderType> = {
      market: 'MARKET',
      limit: 'LIMIT',
    };
    return mapping[type.toLowerCase()] ?? 'LIMIT';
  }

  /**
   * Map internal time in force to Coinbase time in force
   */
  private mapTimeInForceToCoinbase(tif: TimeInForce): string {
    const mapping: Record<TimeInForce, string> = {
      GTC: 'GTC',
      IOC: 'IOC',
      FOK: 'FOK',
      GTD: 'GTT', // Coinbase uses GTT (Good Till Time)
    };
    return mapping[tif];
  }

  /**
   * Map Coinbase time in force to internal time in force
   */
  private mapCoinbaseTimeInForce(tif: string): TimeInForce {
    const mapping: Record<string, TimeInForce> = {
      GTC: 'GTC',
      IOC: 'IOC',
      FOK: 'FOK',
      GTT: 'GTD',
    };
    return mapping[tif.toUpperCase()] ?? 'GTC';
  }

  /**
   * Map Coinbase order status to internal status
   */
  private mapCoinbaseOrderStatus(status: string): OrderStatus {
    const mapping: Record<string, OrderStatus> = {
      pending: 'PENDING',
      open: 'OPEN',
      active: 'OPEN',
      done: 'FILLED',
      settled: 'FILLED',
      cancelled: 'CANCELLED',
      rejected: 'REJECTED',
    };
    return mapping[status.toLowerCase()] ?? 'PENDING';
  }

  /**
   * Map Coinbase order response to internal OrderResponse
   */
  private mapCoinbaseOrderResponse(
    response: CoinbaseOrderResponse,
    orderId: string
  ): OrderResponse {
    const filledQuantity = parseFloat(response.filled_size);
    const originalQuantity = parseFloat(response.size);

    // Calculate average price from executed value
    let averagePrice: number | undefined;
    if (filledQuantity > 0) {
      const executedValue = parseFloat(response.executed_value);
      averagePrice = executedValue / filledQuantity;
    }

    const commission = parseFloat(response.fill_fees);

    return {
      orderId,
      exchangeOrderId: response.id,
      exchangeId: this.exchangeId,
      status: this.mapCoinbaseOrderStatus(response.status),
      filledQuantity,
      remainingQuantity: originalQuantity - filledQuantity,
      averagePrice,
      commission: commission > 0 ? commission : undefined,
      commissionAsset: 'USD',
      createdAt: response.created_at,
      updatedAt: response.done_at ?? response.created_at,
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
   * Create Coinbase-specific error
   */
  private createCoinbaseError(status: number, body: unknown): ExchangeAdapterError {
    let message = `Coinbase API error: HTTP ${status}`;
    let retryable = false;

    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      if (errorBody.message) {
        message = `Coinbase API error: ${errorBody.message}`;
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
   * Override rate limit status to provide Coinbase-specific information
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    // Coinbase rate limits are returned in response headers
    // For now, return placeholder values
    return {
      exchangeId: this.exchangeId,
      ordersRemaining: -1,
      queriesRemaining: -1,
      wsMessagesRemaining: -1,
      resetsAt: new Date(Date.now() + 60000).toISOString(),
    };
  }
}
