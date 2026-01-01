/**
 * Binance Exchange Adapter
 *
 * Implements the ExchangeAdapter interface for Binance exchange.
 * Provides REST API calls for order submission, cancellation, status query, and balance query.
 * Supports WebSocket integration for real-time order updates and executions.
 * Implements HMAC signature generation for REST requests.
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
  WSSubscriptionHandle,
} from './websocket-client';
import { generateUUID } from '../../utils/uuid';

/**
 * Binance-specific configuration
 */
export interface BinanceAdapterConfig extends ExchangeAdapterConfig {
  recvWindow?: number; // Binance recvWindow parameter (default: 5000ms)
  userDataStreamKeepAliveMs?: number; // Interval to keep user data stream alive (default: 30 minutes)
}

/**
 * Binance API response types
 */
interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  fills?: BinanceFill[];
}

interface BinanceFill {
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  tradeId: number;
}

interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: BinanceBalance[];
}

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceListenKeyResponse {
  listenKey: string;
}


/**
 * Binance WebSocket message types
 */
interface BinanceWSExecutionReport {
  e: 'executionReport';
  E: number; // Event time
  s: string; // Symbol
  c: string; // Client order ID
  S: string; // Side
  o: string; // Order type
  f: string; // Time in force
  q: string; // Order quantity
  p: string; // Order price
  P: string; // Stop price
  F: string; // Iceberg quantity
  g: number; // OrderListId
  C: string; // Original client order ID
  x: string; // Current execution type
  X: string; // Current order status
  r: string; // Order reject reason
  i: number; // Order ID
  l: string; // Last executed quantity
  z: string; // Cumulative filled quantity
  L: string; // Last executed price
  n: string; // Commission amount
  N: string; // Commission asset
  T: number; // Transaction time
  t: number; // Trade ID
  I: number; // Ignore
  w: boolean; // Is the order on the book?
  m: boolean; // Is this trade the maker side?
  M: boolean; // Ignore
  O: number; // Order creation time
  Z: string; // Cumulative quote asset transacted quantity
  Y: string; // Last quote asset transacted quantity
  Q: string; // Quote Order Qty
}

interface BinanceWSOutboundAccountPosition {
  e: 'outboundAccountPosition';
  E: number;
  u: number;
  B: Array<{
    a: string;
    f: string;
    l: string;
  }>;
}

/**
 * Binance Exchange Adapter
 *
 * Implements connectivity to Binance exchange via REST and WebSocket APIs.
 */
export class BinanceAdapter extends BaseExchangeAdapter {
  readonly exchangeId: ExchangeId = 'BINANCE';
  readonly mode: ExchangeMode;

  private readonly recvWindow: number;
  private readonly userDataStreamKeepAliveMs: number;
  private wsClient: WebSocketClient | null = null;
  private listenKey: string | null = null;
  private listenKeyKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private orderUpdateCallbacks: Map<string, (update: OrderUpdate) => void> = new Map();
  private executionCallbacks: Map<string, (execution: ExecutionUpdate) => void> = new Map();

  // Binance API endpoints
  private static readonly PRODUCTION_REST_ENDPOINT = 'https://api.binance.com';
  private static readonly SANDBOX_REST_ENDPOINT = 'https://testnet.binance.vision';
  private static readonly PRODUCTION_WS_ENDPOINT = 'wss://stream.binance.com:9443/ws';
  private static readonly SANDBOX_WS_ENDPOINT = 'wss://testnet.binance.vision/ws';

  constructor(config: BinanceAdapterConfig) {
    super(config);
    this.mode = config.mode;
    this.recvWindow = config.recvWindow ?? 5000;
    this.userDataStreamKeepAliveMs = config.userDataStreamKeepAliveMs ?? 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Get the appropriate REST endpoint based on mode
   */
  private getRestEndpoint(): string {
    if (this.config.restEndpoint) {
      return this.config.restEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? BinanceAdapter.SANDBOX_REST_ENDPOINT
      : BinanceAdapter.PRODUCTION_REST_ENDPOINT;
  }

  /**
   * Get the appropriate WebSocket endpoint based on mode
   */
  private getWsEndpoint(): string {
    if (this.config.wsEndpoint) {
      return this.config.wsEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? BinanceAdapter.SANDBOX_WS_ENDPOINT
      : BinanceAdapter.PRODUCTION_WS_ENDPOINT;
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to Binance exchange
   */
  async connect(): Promise<void> {
    this.setConnectionStatus('CONNECTING');

    try {
      // Test REST API connectivity
      await this.ping();

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
        this.parseBinanceWSMessage.bind(this)
      );

      this.setConnectionStatus('CONNECTED');
    } catch (error) {
      this.setConnectionStatus('ERROR');
      throw new ExchangeAdapterError(
        `Failed to connect to Binance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.exchangeId,
        undefined,
        true,
        error
      );
    }
  }

  /**
   * Disconnect from Binance exchange
   */
  async disconnect(): Promise<void> {
    // Stop listen key keep-alive timer
    if (this.listenKeyKeepAliveTimer) {
      clearInterval(this.listenKeyKeepAliveTimer);
      this.listenKeyKeepAliveTimer = null;
    }

    // Close user data stream
    if (this.listenKey) {
      try {
        await this.closeUserDataStream();
      } catch {
        // Ignore errors during disconnect
      }
      this.listenKey = null;
    }

    // Disconnect WebSocket
    if (this.wsClient) {
      await this.wsClient.disconnectAll();
      this.wsClient = null;
    }

    // Clear callbacks
    this.orderUpdateCallbacks.clear();
    this.executionCallbacks.clear();

    this.setConnectionStatus('DISCONNECTED');
  }


  // ============================================
  // REST API - Order Operations
  // ============================================

  /**
   * Submit an order to Binance
   */
  async submitOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      const params = this.buildOrderParams(order);
      const response = await this.signedRequest<BinanceOrderResponse>(
        'POST',
        '/api/v3/order',
        params
      );

      return this.mapBinanceOrderResponse(response, order.orderId);
    }, 'submitOrder');
  }

  /**
   * Cancel an order on Binance
   */
  async cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse> {
    return this.executeWithRetry(async () => {
      // Extract symbol from orderId (format: SYMBOL_UUID)
      const symbol = this.extractSymbolFromOrderId(orderId);

      const params: Record<string, string> = {
        symbol,
        orderId: exchangeOrderId,
      };

      const response = await this.signedRequest<BinanceOrderResponse>(
        'DELETE',
        '/api/v3/order',
        params
      );

      return {
        orderId,
        exchangeOrderId: response.orderId.toString(),
        status: response.status === 'CANCELED' ? 'CANCELLED' : 'PENDING_CANCEL',
        cancelledAt: new Date().toISOString(),
      };
    }, 'cancelOrder');
  }

  /**
   * Modify an existing order on Binance
   * Note: Binance doesn't support direct order modification, so we cancel and resubmit
   */
  async modifyOrder(orderId: string, modifications: OrderModification): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      // Get current order status
      const symbol = this.extractSymbolFromOrderId(orderId);
      const currentOrder = await this.queryOrder(symbol, orderId);

      // Cancel existing order
      await this.cancelOrder(orderId, currentOrder.exchangeOrderId);

      // Create new order with modifications
      const newOrderRequest: OrderRequest = {
        orderId: generateUUID(),
        tenantId: this.config.tenantId,
        strategyId: '', // Will be filled from original order context
        assetId: symbol,
        side: currentOrder.side as OrderSide,
        orderType: currentOrder.orderType as OrderType,
        quantity: modifications.newQuantity ?? currentOrder.quantity,
        price: modifications.newPrice ?? currentOrder.price,
        stopPrice: modifications.newStopPrice ?? currentOrder.stopPrice,
        timeInForce: currentOrder.timeInForce as TimeInForce,
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
      const symbol = this.extractSymbolFromOrderId(orderId);
      const params: Record<string, string> = {
        symbol,
        orderId: exchangeOrderId,
      };

      const response = await this.signedRequest<BinanceOrderResponse>(
        'GET',
        '/api/v3/order',
        params
      );

      return this.mapBinanceOrderStatus(response.status);
    }, 'getOrderStatus');
  }

  /**
   * Query order details
   */
  private async queryOrder(symbol: string, orderId: string): Promise<{
    exchangeOrderId: string;
    side: string;
    orderType: string;
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce: string;
  }> {
    const params: Record<string, string> = {
      symbol,
      origClientOrderId: orderId,
    };

    const response = await this.signedRequest<BinanceOrderResponse>(
      'GET',
      '/api/v3/order',
      params
    );

    return {
      exchangeOrderId: response.orderId.toString(),
      side: response.side,
      orderType: response.type,
      quantity: parseFloat(response.origQty),
      price: response.price ? parseFloat(response.price) : undefined,
      stopPrice: undefined, // Binance doesn't return stop price in order query
      timeInForce: response.timeInForce,
    };
  }

  // ============================================
  // REST API - Account Operations
  // ============================================

  /**
   * Get account balance
   */
  async getBalance(asset?: string): Promise<BalanceResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.signedRequest<BinanceAccountInfo>(
        'GET',
        '/api/v3/account',
        {}
      );

      let balances: AssetBalance[] = response.balances.map((b) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
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
   * Note: Binance spot doesn't have positions in the traditional sense,
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
    await this.ensureUserDataStream();

    const handle = this.createSubscriptionHandle('orderUpdates');
    this.orderUpdateCallbacks.set(handle.id, callback);

    return handle;
  }

  /**
   * Subscribe to execution/fill updates via WebSocket
   */
  async subscribeToExecutions(
    callback: (execution: ExecutionUpdate) => void
  ): Promise<SubscriptionHandle> {
    await this.ensureUserDataStream();

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

    // If no more subscriptions, close user data stream
    if (this.orderUpdateCallbacks.size === 0 && this.executionCallbacks.size === 0) {
      await this.closeUserDataStream();
    }
  }

  /**
   * Ensure user data stream is active
   */
  private async ensureUserDataStream(): Promise<void> {
    if (this.listenKey && this.wsClient) {
      return;
    }

    // Create listen key
    this.listenKey = await this.createUserDataStream();

    // Connect to WebSocket with listen key
    if (!this.wsClient) {
      throw new ExchangeAdapterError(
        'WebSocket client not initialized',
        this.exchangeId,
        undefined,
        false
      );
    }

    const wsEndpoint = `${this.getWsEndpoint()}/${this.listenKey}`;
    await this.wsClient.connect(wsEndpoint, 'user-data-stream');

    // Set up message handlers
    this.wsClient.on('message', (message: NormalizedWSMessage) => {
      this.handleWSMessage(message);
    });

    // Start keep-alive timer
    this.startListenKeyKeepAlive();
  }

  /**
   * Create user data stream and get listen key
   */
  private async createUserDataStream(): Promise<string> {
    const response = await this.apiKeyRequest<BinanceListenKeyResponse>(
      'POST',
      '/api/v3/userDataStream'
    );
    return response.listenKey;
  }

  /**
   * Keep user data stream alive
   */
  private async keepAliveUserDataStream(): Promise<void> {
    if (!this.listenKey) return;

    await this.apiKeyRequest<Record<string, never>>(
      'PUT',
      '/api/v3/userDataStream',
      { listenKey: this.listenKey }
    );
  }

  /**
   * Close user data stream
   */
  private async closeUserDataStream(): Promise<void> {
    if (!this.listenKey) return;

    try {
      await this.apiKeyRequest<Record<string, never>>(
        'DELETE',
        '/api/v3/userDataStream',
        { listenKey: this.listenKey }
      );
    } finally {
      this.listenKey = null;
    }
  }

  /**
   * Start listen key keep-alive timer
   */
  private startListenKeyKeepAlive(): void {
    if (this.listenKeyKeepAliveTimer) {
      clearInterval(this.listenKeyKeepAliveTimer);
    }

    this.listenKeyKeepAliveTimer = setInterval(async () => {
      try {
        await this.keepAliveUserDataStream();
      } catch (error) {
        // Log error but don't throw - will retry on next interval
        console.error('Failed to keep alive user data stream:', error);
      }
    }, this.userDataStreamKeepAliveMs);
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
   * Parse Binance WebSocket message into normalized format
   */
  private parseBinanceWSMessage(rawMessage: unknown): NormalizedWSMessage {
    const timestamp = new Date().toISOString();

    if (!rawMessage || typeof rawMessage !== 'object') {
      return {
        type: 'UNKNOWN',
        exchangeId: this.exchangeId,
        timestamp,
        rawMessage,
      };
    }

    const msg = rawMessage as Record<string, unknown>;
    const eventType = msg.e as string;

    if (eventType === 'executionReport') {
      const report = msg as unknown as BinanceWSExecutionReport;
      const execType = report.x;

      // Determine if this is an order update or execution
      if (execType === 'TRADE') {
        return {
          type: 'EXECUTION_UPDATE',
          exchangeId: this.exchangeId,
          data: this.parseBinanceExecutionReport(report),
          timestamp: new Date(report.E).toISOString(),
          rawMessage,
        };
      } else {
        return {
          type: 'ORDER_UPDATE',
          exchangeId: this.exchangeId,
          data: this.parseBinanceOrderUpdate(report),
          timestamp: new Date(report.E).toISOString(),
          rawMessage,
        };
      }
    }

    if (eventType === 'outboundAccountPosition') {
      return {
        type: 'UNKNOWN', // Account updates are not order/execution updates
        exchangeId: this.exchangeId,
        timestamp,
        rawMessage,
      };
    }

    return {
      type: 'UNKNOWN',
      exchangeId: this.exchangeId,
      timestamp,
      rawMessage,
    };
  }

  /**
   * Parse Binance execution report into OrderUpdate
   */
  private parseBinanceOrderUpdate(report: BinanceWSExecutionReport): OrderUpdate {
    return {
      orderId: report.c,
      exchangeOrderId: report.i.toString(),
      exchangeId: this.exchangeId,
      status: this.mapBinanceOrderStatus(report.X),
      filledQuantity: parseFloat(report.z),
      remainingQuantity: parseFloat(report.q) - parseFloat(report.z),
      lastFilledPrice: report.L ? parseFloat(report.L) : undefined,
      lastFilledQuantity: report.l ? parseFloat(report.l) : undefined,
      timestamp: new Date(report.T).toISOString(),
    };
  }

  /**
   * Parse Binance execution report into ExecutionUpdate
   */
  private parseBinanceExecutionReport(report: BinanceWSExecutionReport): ExecutionUpdate {
    return {
      executionId: report.t.toString(),
      orderId: report.c,
      exchangeOrderId: report.i.toString(),
      exchangeId: this.exchangeId,
      side: report.S === 'BUY' ? 'BUY' : 'SELL',
      quantity: parseFloat(report.l),
      price: parseFloat(report.L),
      commission: parseFloat(report.n),
      commissionAsset: report.N,
      timestamp: new Date(report.T).toISOString(),
    };
  }


  // ============================================
  // HMAC Authentication
  // ============================================

  /**
   * Make a signed request to Binance API (requires HMAC signature)
   */
  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    params: Record<string, string>
  ): Promise<T> {
    const timestamp = Date.now().toString();
    const queryParams: Record<string, string> = {
      ...params,
      timestamp,
      recvWindow: this.recvWindow.toString(),
    };

    // Create signature
    const queryString = new URLSearchParams(queryParams).toString();
    const signature = this.createHmacSignature(queryString);
    queryParams['signature'] = signature;

    const url = this.buildUrl(path, queryParams);
    const headers = {
      'X-MBX-APIKEY': this.config.apiKey,
      'Content-Type': 'application/json',
    };

    const response = await this.fetchWithTimeout(url, {
      method,
      headers,
    });

    if (!response.ok) {
      const errorBody = await this.safeParseJson(response);
      throw this.createBinanceError(response.status, errorBody);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an API key request (no signature required)
   */
  private async apiKeyRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const headers = {
      'X-MBX-APIKEY': this.config.apiKey,
      'Content-Type': 'application/json',
    };

    const response = await this.fetchWithTimeout(url, {
      method,
      headers,
    });

    if (!response.ok) {
      const errorBody = await this.safeParseJson(response);
      throw this.createBinanceError(response.status, errorBody);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create HMAC-SHA256 signature
   */
  createHmacSignature(message: string): string {
    return crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Ping Binance API to test connectivity
   */
  private async ping(): Promise<void> {
    const url = `${this.getRestEndpoint()}/api/v3/ping`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new ExchangeAdapterError(
        'Binance API ping failed',
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
   * Build order parameters for Binance API
   */
  private buildOrderParams(order: OrderRequest): Record<string, string> {
    const params: Record<string, string> = {
      symbol: order.assetId,
      side: order.side,
      type: this.mapOrderTypeToBinance(order.orderType),
      quantity: order.quantity.toString(),
      newClientOrderId: order.orderId,
      newOrderRespType: 'FULL',
    };

    // Add time in force
    if (order.orderType !== 'MARKET') {
      params.timeInForce = this.mapTimeInForceToBinance(order.timeInForce);
    }

    // Add price for limit orders
    if (order.price !== undefined && (order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT')) {
      params.price = order.price.toString();
    }

    // Add stop price for stop orders
    if (order.stopPrice !== undefined && (order.orderType === 'STOP_LIMIT' || order.orderType === 'STOP_MARKET')) {
      params.stopPrice = order.stopPrice.toString();
    }

    // Add trailing delta for trailing stop orders
    if (order.trailingDelta !== undefined && order.orderType === 'TRAILING_STOP') {
      params.trailingDelta = order.trailingDelta.toString();
    }

    return params;
  }

  /**
   * Map internal order type to Binance order type
   */
  private mapOrderTypeToBinance(orderType: OrderType): string {
    const mapping: Record<OrderType, string> = {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP_LIMIT: 'STOP_LOSS_LIMIT',
      STOP_MARKET: 'STOP_LOSS',
      TRAILING_STOP: 'TRAILING_STOP_MARKET',
    };
    return mapping[orderType];
  }

  /**
   * Map internal time in force to Binance time in force
   */
  private mapTimeInForceToBinance(tif: TimeInForce): string {
    const mapping: Record<TimeInForce, string> = {
      GTC: 'GTC',
      IOC: 'IOC',
      FOK: 'FOK',
      GTD: 'GTC', // Binance doesn't support GTD, use GTC
    };
    return mapping[tif];
  }

  /**
   * Map Binance order status to internal status
   */
  private mapBinanceOrderStatus(status: string): OrderStatus {
    const mapping: Record<string, OrderStatus> = {
      NEW: 'OPEN',
      PARTIALLY_FILLED: 'PARTIALLY_FILLED',
      FILLED: 'FILLED',
      CANCELED: 'CANCELLED',
      PENDING_CANCEL: 'PENDING',
      REJECTED: 'REJECTED',
      EXPIRED: 'EXPIRED',
    };
    return mapping[status] ?? 'PENDING';
  }

  /**
   * Map Binance order response to internal OrderResponse
   */
  private mapBinanceOrderResponse(
    response: BinanceOrderResponse,
    orderId: string
  ): OrderResponse {
    const filledQuantity = parseFloat(response.executedQty);
    const originalQuantity = parseFloat(response.origQty);

    // Calculate average price from fills
    let averagePrice: number | undefined;
    let totalCommission = 0;
    let commissionAsset: string | undefined;

    if (response.fills && response.fills.length > 0) {
      let totalValue = 0;
      let totalQty = 0;

      for (const fill of response.fills) {
        const qty = parseFloat(fill.qty);
        const price = parseFloat(fill.price);
        totalValue += qty * price;
        totalQty += qty;
        totalCommission += parseFloat(fill.commission);
        commissionAsset = fill.commissionAsset;
      }

      if (totalQty > 0) {
        averagePrice = totalValue / totalQty;
      }
    }

    return {
      orderId,
      exchangeOrderId: response.orderId.toString(),
      exchangeId: this.exchangeId,
      status: this.mapBinanceOrderStatus(response.status),
      filledQuantity,
      remainingQuantity: originalQuantity - filledQuantity,
      averagePrice,
      commission: totalCommission > 0 ? totalCommission : undefined,
      commissionAsset,
      createdAt: new Date(response.transactTime).toISOString(),
      updatedAt: new Date(response.transactTime).toISOString(),
    };
  }

  /**
   * Extract symbol from order ID
   * Assumes order ID format includes symbol or uses asset ID
   */
  private extractSymbolFromOrderId(orderId: string): string {
    // If orderId contains underscore, assume format is SYMBOL_UUID
    if (orderId.includes('_')) {
      return orderId.split('_')[0];
    }
    // Otherwise, this is a limitation - we need the symbol from context
    throw new ExchangeAdapterError(
      'Cannot extract symbol from order ID. Please provide symbol in order context.',
      this.exchangeId,
      undefined,
      false
    );
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string>): string {
    const baseUrl = this.getRestEndpoint();
    let url = `${baseUrl}${path}`;

    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    }

    return url;
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
   * Create Binance-specific error
   */
  private createBinanceError(status: number, body: unknown): ExchangeAdapterError {
    let message = `Binance API error: HTTP ${status}`;
    let retryable = false;

    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      if (errorBody.msg) {
        message = `Binance API error: ${errorBody.msg}`;
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
   * Override rate limit status to provide Binance-specific information
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    // Binance rate limits are returned in response headers
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
