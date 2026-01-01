/**
 * Bybit Exchange Adapter
 *
 * Implements the ExchangeAdapter interface for Bybit exchange.
 * Provides REST API calls for order submission, cancellation, status query, and balance query.
 * Supports WebSocket integration for real-time order updates and executions.
 * Implements HMAC signature generation for REST requests.
 *
 * Requirements: 1.1, 2.1, 3.1, 3.2
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
 * Bybit-specific configuration
 */
export interface BybitAdapterConfig extends ExchangeAdapterConfig {
  recvWindow?: number; // Bybit recvWindow parameter (default: 5000ms)
  category?: 'spot' | 'linear' | 'inverse' | 'option'; // Trading category
}

/**
 * Bybit API response types
 */
interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  retExtInfo: Record<string, unknown>;
  time: number;
}

interface BybitOrderResult {
  orderId: string;
  orderLinkId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  timeInForce: string;
  orderStatus: string;
  cumExecQty: string;
  cumExecValue: string;
  avgPrice: string;
  cumExecFee: string;
  createdTime: string;
  updatedTime: string;
}

interface BybitOrderListResult {
  list: BybitOrderResult[];
  nextPageCursor: string;
  category: string;
}

interface BybitWalletBalance {
  coin: string;
  walletBalance: string;
  availableToWithdraw: string;
  locked: string;
}

interface BybitAccountResult {
  list: Array<{
    accountType: string;
    coin: BybitWalletBalance[];
  }>;
}

interface BybitPositionResult {
  list: Array<{
    symbol: string;
    side: string;
    size: string;
    avgPrice: string;
    unrealisedPnl: string;
    positionValue: string;
  }>;
  category: string;
}


/**
 * Bybit WebSocket message types
 */
interface BybitWSMessage {
  topic: string;
  id?: string;
  creationTime?: number;
  data?: unknown;
  type?: string;
  success?: boolean;
  ret_msg?: string;
  op?: string;
}

interface BybitWSOrderData {
  symbol: string;
  orderId: string;
  orderLinkId: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  orderStatus: string;
  cumExecQty: string;
  cumExecValue: string;
  avgPrice: string;
  cumExecFee: string;
  timeInForce: string;
  createdTime: string;
  updatedTime: string;
}

interface BybitWSExecutionData {
  symbol: string;
  orderId: string;
  orderLinkId: string;
  side: string;
  execId: string;
  execPrice: string;
  execQty: string;
  execFee: string;
  execTime: string;
  feeRate: string;
  execType: string;
}

/**
 * Bybit Exchange Adapter
 *
 * Implements connectivity to Bybit exchange via REST and WebSocket APIs.
 */
export class BybitAdapter extends BaseExchangeAdapter {
  readonly exchangeId: ExchangeId = 'BYBIT';
  readonly mode: ExchangeMode;

  private readonly recvWindow: number;
  private readonly category: string;
  private wsClient: WebSocketClient | null = null;
  private wsConnectionId: string | null = null;
  private orderUpdateCallbacks: Map<string, (update: OrderUpdate) => void> = new Map();
  private executionCallbacks: Map<string, (execution: ExecutionUpdate) => void> = new Map();
  private wsAuthTimer: ReturnType<typeof setInterval> | null = null;

  // Bybit API endpoints
  private static readonly PRODUCTION_REST_ENDPOINT = 'https://api.bybit.com';
  private static readonly SANDBOX_REST_ENDPOINT = 'https://api-testnet.bybit.com';
  private static readonly PRODUCTION_WS_ENDPOINT = 'wss://stream.bybit.com/v5/private';
  private static readonly SANDBOX_WS_ENDPOINT = 'wss://stream-testnet.bybit.com/v5/private';

  constructor(config: BybitAdapterConfig) {
    super(config);
    this.mode = config.mode;
    this.recvWindow = config.recvWindow ?? 5000;
    this.category = config.category ?? 'spot';
  }

  /**
   * Get the appropriate REST endpoint based on mode
   */
  private getRestEndpoint(): string {
    if (this.config.restEndpoint) {
      return this.config.restEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? BybitAdapter.SANDBOX_REST_ENDPOINT
      : BybitAdapter.PRODUCTION_REST_ENDPOINT;
  }

  /**
   * Get the appropriate WebSocket endpoint based on mode
   */
  private getWsEndpoint(): string {
    if (this.config.wsEndpoint) {
      return this.config.wsEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? BybitAdapter.SANDBOX_WS_ENDPOINT
      : BybitAdapter.PRODUCTION_WS_ENDPOINT;
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to Bybit exchange
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
          heartbeatIntervalMs: 20000,
          pingTimeoutMs: 10000,
        },
        this.parseBybitWSMessage.bind(this)
      );

      this.setConnectionStatus('CONNECTED');
    } catch (error) {
      this.setConnectionStatus('ERROR');
      throw new ExchangeAdapterError(
        `Failed to connect to Bybit: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.exchangeId,
        undefined,
        true,
        error
      );
    }
  }

  /**
   * Disconnect from Bybit exchange
   */
  async disconnect(): Promise<void> {
    // Stop auth timer
    if (this.wsAuthTimer) {
      clearInterval(this.wsAuthTimer);
      this.wsAuthTimer = null;
    }

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
   * Submit an order to Bybit
   */
  async submitOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      const body = this.buildOrderBody(order);
      const response = await this.signedRequest<BybitResponse<BybitOrderResult>>(
        'POST',
        '/v5/order/create',
        body
      );

      if (response.retCode !== 0) {
        throw new ExchangeAdapterError(
          `Bybit order submission failed: ${response.retMsg}`,
          this.exchangeId,
          response.retCode,
          false
        );
      }

      return this.mapBybitOrderResponse(response.result, order.orderId);
    }, 'submitOrder');
  }

  /**
   * Cancel an order on Bybit
   */
  async cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse> {
    return this.executeWithRetry(async () => {
      const symbol = this.extractSymbolFromOrderId(orderId);

      const body = {
        category: this.category,
        symbol,
        orderId: exchangeOrderId,
      };

      const response = await this.signedRequest<BybitResponse<{ orderId: string }>>(
        'POST',
        '/v5/order/cancel',
        body
      );

      if (response.retCode !== 0) {
        throw new ExchangeAdapterError(
          `Bybit order cancellation failed: ${response.retMsg}`,
          this.exchangeId,
          response.retCode,
          false
        );
      }

      return {
        orderId,
        exchangeOrderId: response.result.orderId,
        status: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
      };
    }, 'cancelOrder');
  }

  /**
   * Modify an existing order on Bybit
   */
  async modifyOrder(orderId: string, modifications: OrderModification): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      const symbol = this.extractSymbolFromOrderId(orderId);
      const currentOrder = await this.queryOrder(symbol, orderId);

      const body: Record<string, unknown> = {
        category: this.category,
        symbol,
        orderId: currentOrder.orderId,
      };

      if (modifications.newPrice !== undefined) {
        body.price = modifications.newPrice.toString();
      }

      if (modifications.newQuantity !== undefined) {
        body.qty = modifications.newQuantity.toString();
      }

      const response = await this.signedRequest<BybitResponse<BybitOrderResult>>(
        'POST',
        '/v5/order/amend',
        body
      );

      if (response.retCode !== 0) {
        throw new ExchangeAdapterError(
          `Bybit order modification failed: ${response.retMsg}`,
          this.exchangeId,
          response.retCode,
          false
        );
      }

      return this.mapBybitOrderResponse(response.result, orderId);
    }, 'modifyOrder');
  }

  /**
   * Get the status of an order
   */
  async getOrderStatus(orderId: string, exchangeOrderId: string): Promise<OrderStatus> {
    return this.executeWithRetry(async () => {
      const symbol = this.extractSymbolFromOrderId(orderId);

      const params = {
        category: this.category,
        symbol,
        orderId: exchangeOrderId,
      };

      const response = await this.signedRequest<BybitResponse<BybitOrderListResult>>(
        'GET',
        '/v5/order/realtime',
        undefined,
        params
      );

      if (response.retCode !== 0 || response.result.list.length === 0) {
        throw new ExchangeAdapterError(
          `Order ${orderId} not found`,
          this.exchangeId,
          404,
          false
        );
      }

      return this.mapBybitOrderStatus(response.result.list[0].orderStatus);
    }, 'getOrderStatus');
  }

  /**
   * Query order details
   */
  private async queryOrder(symbol: string, orderId: string): Promise<BybitOrderResult> {
    const params = {
      category: this.category,
      symbol,
      orderLinkId: orderId,
    };

    const response = await this.signedRequest<BybitResponse<BybitOrderListResult>>(
      'GET',
      '/v5/order/realtime',
      undefined,
      params
    );

    if (response.retCode !== 0 || response.result.list.length === 0) {
      throw new ExchangeAdapterError(
        `Order ${orderId} not found`,
        this.exchangeId,
        404,
        false
      );
    }

    return response.result.list[0];
  }

  // ============================================
  // REST API - Account Operations
  // ============================================

  /**
   * Get account balance
   */
  async getBalance(asset?: string): Promise<BalanceResponse> {
    return this.executeWithRetry(async () => {
      const params = {
        accountType: this.category === 'spot' ? 'UNIFIED' : 'CONTRACT',
      };

      const response = await this.signedRequest<BybitResponse<BybitAccountResult>>(
        'GET',
        '/v5/account/wallet-balance',
        undefined,
        params
      );

      if (response.retCode !== 0) {
        throw new ExchangeAdapterError(
          `Failed to get balance: ${response.retMsg}`,
          this.exchangeId,
          response.retCode,
          false
        );
      }

      let balances: AssetBalance[] = [];

      for (const account of response.result.list) {
        for (const coin of account.coin) {
          balances.push({
            asset: coin.coin,
            free: parseFloat(coin.availableToWithdraw),
            locked: parseFloat(coin.locked),
            total: parseFloat(coin.walletBalance),
          });
        }
      }

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
    return this.executeWithRetry(async () => {
      if (this.category === 'spot') {
        // Spot doesn't have positions, return balances
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

      const params = {
        category: this.category,
        settleCoin: 'USDT',
      };

      const response = await this.signedRequest<BybitResponse<BybitPositionResult>>(
        'GET',
        '/v5/position/list',
        undefined,
        params
      );

      if (response.retCode !== 0) {
        throw new ExchangeAdapterError(
          `Failed to get positions: ${response.retMsg}`,
          this.exchangeId,
          response.retCode,
          false
        );
      }

      return response.result.list.map((p) => ({
        exchangeId: this.exchangeId,
        assetId: p.symbol,
        quantity: parseFloat(p.size),
        averageEntryPrice: parseFloat(p.avgPrice),
        unrealizedPnL: parseFloat(p.unrealisedPnl),
        timestamp: new Date().toISOString(),
      }));
    }, 'getPositions');
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

    const handle = this.createSubscriptionHandle('order');
    this.orderUpdateCallbacks.set(handle.id, callback);

    // Subscribe to order topic if first subscription
    if (this.orderUpdateCallbacks.size === 1) {
      await this.subscribeToTopic('order');
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

    const handle = this.createSubscriptionHandle('execution');
    this.executionCallbacks.set(handle.id, callback);

    // Subscribe to execution topic if first subscription
    if (this.executionCallbacks.size === 1) {
      await this.subscribeToTopic('execution');
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
  }

  /**
   * Ensure WebSocket connection is established and authenticated
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
    this.wsConnectionId = await this.wsClient.connect(wsEndpoint, 'bybit-private');

    // Set up message handlers
    this.wsClient.on('message', (message: NormalizedWSMessage) => {
      this.handleWSMessage(message);
    });

    // Authenticate WebSocket connection
    await this.authenticateWebSocket();

    // Start periodic re-authentication (Bybit requires re-auth every 2 hours)
    this.startAuthTimer();
  }

  /**
   * Authenticate WebSocket connection
   */
  private async authenticateWebSocket(): Promise<void> {
    if (!this.wsClient || !this.wsConnectionId) {
      return;
    }

    const expires = Date.now() + 10000; // 10 seconds from now
    const signature = this.createWSSignature(expires);

    const authMessage = {
      op: 'auth',
      args: [this.config.apiKey, expires.toString(), signature],
    };

    await this.wsClient.send(this.wsConnectionId, authMessage);
  }

  /**
   * Start periodic re-authentication timer
   */
  private startAuthTimer(): void {
    if (this.wsAuthTimer) {
      clearInterval(this.wsAuthTimer);
    }

    // Re-authenticate every 1.5 hours (Bybit auth expires in 2 hours)
    this.wsAuthTimer = setInterval(async () => {
      try {
        await this.authenticateWebSocket();
      } catch (error) {
        console.error('Failed to re-authenticate WebSocket:', error);
      }
    }, 90 * 60 * 1000);
  }

  /**
   * Subscribe to a WebSocket topic
   */
  private async subscribeToTopic(topic: string): Promise<void> {
    if (!this.wsClient || !this.wsConnectionId) {
      return;
    }

    const subscribeMessage = {
      op: 'subscribe',
      args: [topic],
    };

    await this.wsClient.send(this.wsConnectionId, subscribeMessage);
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
   * Parse Bybit WebSocket message into normalized format
   */
  private parseBybitWSMessage(rawMessage: unknown): NormalizedWSMessage {
    const timestamp = new Date().toISOString();

    if (!rawMessage || typeof rawMessage !== 'object') {
      return {
        type: 'UNKNOWN',
        exchangeId: this.exchangeId,
        timestamp,
        rawMessage,
      };
    }

    const msg = rawMessage as BybitWSMessage;

    // Handle auth response
    if (msg.op === 'auth') {
      return {
        type: msg.success ? 'SUBSCRIPTION_ACK' : 'ERROR',
        exchangeId: this.exchangeId,
        timestamp,
        rawMessage,
      };
    }

    // Handle subscription response
    if (msg.op === 'subscribe') {
      return {
        type: msg.success ? 'SUBSCRIPTION_ACK' : 'ERROR',
        exchangeId: this.exchangeId,
        timestamp,
        rawMessage,
      };
    }

    // Handle pong
    if (msg.op === 'pong') {
      return {
        type: 'HEARTBEAT',
        exchangeId: this.exchangeId,
        timestamp,
        rawMessage,
      };
    }

    // Handle order updates
    if (msg.topic === 'order' && msg.data) {
      const orders = msg.data as BybitWSOrderData[];
      if (orders.length > 0) {
        return {
          type: 'ORDER_UPDATE',
          exchangeId: this.exchangeId,
          data: this.parseBybitOrderUpdate(orders[0]),
          timestamp: new Date(parseInt(orders[0].updatedTime)).toISOString(),
          rawMessage,
        };
      }
    }

    // Handle execution updates
    if (msg.topic === 'execution' && msg.data) {
      const executions = msg.data as BybitWSExecutionData[];
      if (executions.length > 0) {
        return {
          type: 'EXECUTION_UPDATE',
          exchangeId: this.exchangeId,
          data: this.parseBybitExecutionUpdate(executions[0]),
          timestamp: new Date(parseInt(executions[0].execTime)).toISOString(),
          rawMessage,
        };
      }
    }

    return {
      type: 'UNKNOWN',
      exchangeId: this.exchangeId,
      timestamp,
      rawMessage,
    };
  }

  /**
   * Parse Bybit order data into OrderUpdate
   */
  private parseBybitOrderUpdate(order: BybitWSOrderData): OrderUpdate {
    return {
      orderId: order.orderLinkId,
      exchangeOrderId: order.orderId,
      exchangeId: this.exchangeId,
      status: this.mapBybitOrderStatus(order.orderStatus),
      filledQuantity: parseFloat(order.cumExecQty),
      remainingQuantity: parseFloat(order.qty) - parseFloat(order.cumExecQty),
      lastFilledPrice: order.avgPrice ? parseFloat(order.avgPrice) : undefined,
      timestamp: new Date(parseInt(order.updatedTime)).toISOString(),
    };
  }

  /**
   * Parse Bybit execution data into ExecutionUpdate
   */
  private parseBybitExecutionUpdate(exec: BybitWSExecutionData): ExecutionUpdate {
    return {
      executionId: exec.execId,
      orderId: exec.orderLinkId,
      exchangeOrderId: exec.orderId,
      exchangeId: this.exchangeId,
      side: exec.side === 'Buy' ? 'BUY' : 'SELL',
      quantity: parseFloat(exec.execQty),
      price: parseFloat(exec.execPrice),
      commission: parseFloat(exec.execFee),
      commissionAsset: 'USDT',
      timestamp: new Date(parseInt(exec.execTime)).toISOString(),
    };
  }

  // ============================================
  // HMAC Authentication
  // ============================================

  /**
   * Make a signed request to Bybit API
   */
  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>
  ): Promise<T> {
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';

    // Build query string
    let queryString = '';
    if (queryParams && Object.keys(queryParams).length > 0) {
      queryString = new URLSearchParams(queryParams).toString();
    }

    // Create signature
    const signature = this.createSignature(timestamp, method, queryString, bodyStr);

    let url = `${this.getRestEndpoint()}${path}`;
    if (queryString) {
      url += `?${queryString}`;
    }

    const headers: Record<string, string> = {
      'X-BAPI-API-KEY': this.config.apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': this.recvWindow.toString(),
      'Content-Type': 'application/json',
    };

    const response = await this.fetchWithTimeout(url, {
      method,
      headers,
      body: body ? bodyStr : undefined,
    });

    if (!response.ok) {
      const errorBody = await this.safeParseJson(response);
      throw this.createBybitError(response.status, errorBody);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create HMAC-SHA256 signature for REST API
   */
  createSignature(timestamp: string, method: string, queryString: string, body: string): string {
    let message: string;

    if (method === 'GET') {
      message = timestamp + this.config.apiKey + this.recvWindow.toString() + queryString;
    } else {
      message = timestamp + this.config.apiKey + this.recvWindow.toString() + body;
    }

    return crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Create HMAC-SHA256 signature for WebSocket authentication
   */
  private createWSSignature(expires: number): string {
    const message = `GET/realtime${expires}`;
    return crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Get server time to test connectivity
   */
  private async getServerTime(): Promise<void> {
    const url = `${this.getRestEndpoint()}/v5/market/time`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new ExchangeAdapterError(
        'Bybit API time check failed',
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
   * Build order body for Bybit API
   */
  private buildOrderBody(order: OrderRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      category: this.category,
      symbol: order.assetId,
      side: order.side === 'BUY' ? 'Buy' : 'Sell',
      orderType: this.mapOrderTypeToBybit(order.orderType),
      qty: order.quantity.toString(),
      orderLinkId: order.orderId,
    };

    // Add time in force
    body.timeInForce = this.mapTimeInForceToBybit(order.timeInForce);

    // Add price for limit orders
    if (order.price !== undefined && (order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT')) {
      body.price = order.price.toString();
    }

    // Add trigger price for stop orders
    if (order.stopPrice !== undefined && (order.orderType === 'STOP_LIMIT' || order.orderType === 'STOP_MARKET')) {
      body.triggerPrice = order.stopPrice.toString();
      body.triggerDirection = order.side === 'BUY' ? 1 : 2;
    }

    return body;
  }

  /**
   * Map internal order type to Bybit order type
   */
  private mapOrderTypeToBybit(orderType: OrderType): string {
    const mapping: Record<OrderType, string> = {
      MARKET: 'Market',
      LIMIT: 'Limit',
      STOP_LIMIT: 'Limit',
      STOP_MARKET: 'Market',
      TRAILING_STOP: 'Market',
    };
    return mapping[orderType];
  }

  /**
   * Map internal time in force to Bybit time in force
   */
  private mapTimeInForceToBybit(tif: TimeInForce): string {
    const mapping: Record<TimeInForce, string> = {
      GTC: 'GTC',
      IOC: 'IOC',
      FOK: 'FOK',
      GTD: 'GTC', // Bybit doesn't support GTD, use GTC
    };
    return mapping[tif];
  }

  /**
   * Map Bybit order status to internal status
   */
  private mapBybitOrderStatus(status: string): OrderStatus {
    const mapping: Record<string, OrderStatus> = {
      Created: 'PENDING',
      New: 'OPEN',
      PartiallyFilled: 'PARTIALLY_FILLED',
      Filled: 'FILLED',
      Cancelled: 'CANCELLED',
      Rejected: 'REJECTED',
      Expired: 'EXPIRED',
      Deactivated: 'CANCELLED',
    };
    return mapping[status] ?? 'PENDING';
  }

  /**
   * Map Bybit order response to internal OrderResponse
   */
  private mapBybitOrderResponse(
    response: BybitOrderResult,
    orderId: string
  ): OrderResponse {
    const filledQuantity = parseFloat(response.cumExecQty);
    const originalQuantity = parseFloat(response.qty);

    return {
      orderId,
      exchangeOrderId: response.orderId,
      exchangeId: this.exchangeId,
      status: this.mapBybitOrderStatus(response.orderStatus),
      filledQuantity,
      remainingQuantity: originalQuantity - filledQuantity,
      averagePrice: response.avgPrice ? parseFloat(response.avgPrice) : undefined,
      commission: response.cumExecFee ? parseFloat(response.cumExecFee) : undefined,
      commissionAsset: 'USDT',
      createdAt: new Date(parseInt(response.createdTime)).toISOString(),
      updatedAt: new Date(parseInt(response.updatedTime)).toISOString(),
    };
  }

  /**
   * Extract symbol from order ID
   */
  private extractSymbolFromOrderId(orderId: string): string {
    if (orderId.includes('_')) {
      return orderId.split('_')[0];
    }
    throw new ExchangeAdapterError(
      'Cannot extract symbol from order ID. Please provide symbol in order context.',
      this.exchangeId,
      undefined,
      false
    );
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
   * Create Bybit-specific error
   */
  private createBybitError(status: number, body: unknown): ExchangeAdapterError {
    let message = `Bybit API error: HTTP ${status}`;
    let retryable = false;

    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      if (errorBody.retMsg) {
        message = `Bybit API error: ${errorBody.retMsg}`;
      }
      if (errorBody.retCode) {
        message += ` (code: ${errorBody.retCode})`;
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
