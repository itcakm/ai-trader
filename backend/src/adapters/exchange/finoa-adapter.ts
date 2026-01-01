/**
 * Finoa Exchange Adapter
 *
 * Implements the ExchangeAdapter interface for Finoa custody and trading platform.
 * Finoa is a regulated German digital asset custodian and trading platform
 * focused on institutional clients.
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
 * Finoa-specific configuration
 */
export interface FinoaAdapterConfig extends ExchangeAdapterConfig {
  organizationId?: string; // Optional organization identifier for Finoa
  accountId?: string; // Optional account identifier for multi-account setups
}

/**
 * Finoa API response types
 */
interface FinoaOrderResponse {
  orderId: string;
  externalOrderId: string;
  asset: string;
  quoteAsset: string;
  direction: string;
  type: string;
  state: string;
  requestedQuantity: string;
  executedQuantity: string;
  requestedPrice?: string;
  executedPrice?: string;
  fee?: string;
  feeAsset?: string;
  createdTimestamp: string;
  lastUpdatedTimestamp: string;
}

interface FinoaAssetBalance {
  assetId: string;
  symbol: string;
  availableBalance: string;
  pendingBalance: string;
  totalBalance: string;
}

interface FinoaAccountResponse {
  accountId: string;
  organizationId: string;
  balances: FinoaAssetBalance[];
  timestamp: string;
}

/**
 * Finoa Exchange Adapter
 *
 * Implements connectivity to Finoa custody and trading platform via REST API.
 * Finoa is designed for institutional clients with strict compliance requirements.
 */
export class FinoaAdapter extends BaseExchangeAdapter {
  readonly exchangeId: ExchangeId = 'FINOA';
  readonly mode: ExchangeMode;

  private readonly organizationId?: string;
  private readonly accountId?: string;
  private orderUpdateCallbacks: Map<string, (update: OrderUpdate) => void> = new Map();
  private executionCallbacks: Map<string, (execution: ExecutionUpdate) => void> = new Map();

  // Finoa API endpoints
  private static readonly PRODUCTION_REST_ENDPOINT = 'https://api.finoa.io';
  private static readonly SANDBOX_REST_ENDPOINT = 'https://api.sandbox.finoa.io';

  constructor(config: FinoaAdapterConfig) {
    super(config);
    this.mode = config.mode;
    this.organizationId = config.organizationId;
    this.accountId = config.accountId;
  }

  /**
   * Get the appropriate REST endpoint based on mode
   */
  private getRestEndpoint(): string {
    if (this.config.restEndpoint) {
      return this.config.restEndpoint;
    }
    return this.mode === 'SANDBOX'
      ? FinoaAdapter.SANDBOX_REST_ENDPOINT
      : FinoaAdapter.PRODUCTION_REST_ENDPOINT;
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to Finoa exchange
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
        `Failed to connect to Finoa: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.exchangeId,
        undefined,
        true,
        error
      );
    }
  }

  /**
   * Disconnect from Finoa exchange
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
   * Submit an order to Finoa
   */
  async submitOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.executeWithRetry(async () => {
      const body = this.buildOrderBody(order);
      const response = await this.signedRequest<FinoaOrderResponse>(
        'POST',
        '/v1/trading/orders',
        body
      );

      return this.mapFinoaOrderResponse(response, order.orderId);
    }, 'submitOrder');
  }

  /**
   * Cancel an order on Finoa
   */
  async cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse> {
    return this.executeWithRetry(async () => {
      await this.signedRequest<void>(
        'DELETE',
        `/v1/trading/orders/${exchangeOrderId}`
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
   * Modify an existing order on Finoa
   * Note: Finoa may not support direct order modification, so we cancel and resubmit
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
        assetId: `${currentOrder.asset}-${currentOrder.quoteAsset}`,
        side: currentOrder.direction.toUpperCase() as 'BUY' | 'SELL',
        orderType: this.mapFinoaOrderType(currentOrder.type),
        quantity: modifications.newQuantity ?? parseFloat(currentOrder.requestedQuantity),
        price: modifications.newPrice ?? (currentOrder.requestedPrice ? parseFloat(currentOrder.requestedPrice) : undefined),
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
      const response = await this.signedRequest<FinoaOrderResponse>(
        'GET',
        `/v1/trading/orders/${exchangeOrderId}`
      );

      return this.mapFinoaOrderStatus(response.state);
    }, 'getOrderStatus');
  }

  /**
   * Get order details
   */
  private async getOrderDetails(orderId: string): Promise<FinoaOrderResponse> {
    const response = await this.signedRequest<FinoaOrderResponse>(
      'GET',
      `/v1/trading/orders/${orderId}`
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
      const path = this.accountId
        ? `/v1/custody/accounts/${this.accountId}/balances`
        : '/v1/custody/balances';

      const response = await this.signedRequest<FinoaAccountResponse>(
        'GET',
        path
      );

      let balances: AssetBalance[] = response.balances.map((b) => ({
        asset: b.symbol,
        free: parseFloat(b.availableBalance),
        locked: parseFloat(b.pendingBalance),
        total: parseFloat(b.totalBalance),
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
  // Real-time Subscriptions (Polling-based for Finoa)
  // ============================================

  /**
   * Subscribe to order updates
   * Note: Finoa may use polling or webhooks instead of WebSocket
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
   * Make a signed request to Finoa API
   */
  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const timestamp = new Date().toISOString();
    const bodyStr = body ? JSON.stringify(body) : '';

    // Create signature
    const signature = this.createSignature(timestamp, method, path, bodyStr);

    const url = `${this.getRestEndpoint()}${path}`;
    const headers: Record<string, string> = {
      'X-Finoa-Api-Key': this.config.apiKey,
      'X-Finoa-Signature': signature,
      'X-Finoa-Timestamp': timestamp,
      'Content-Type': 'application/json',
    };

    if (this.organizationId) {
      headers['X-Finoa-Organization-Id'] = this.organizationId;
    }

    if (this.accountId) {
      headers['X-Finoa-Account-Id'] = this.accountId;
    }

    const response = await this.fetchWithTimeout(url, {
      method,
      headers,
      body: body ? bodyStr : undefined,
    });

    if (!response.ok) {
      const errorBody = await this.safeParseJson(response);
      throw this.createFinoaError(response.status, errorBody);
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
   * Ping Finoa API to test connectivity
   */
  private async ping(): Promise<void> {
    const url = `${this.getRestEndpoint()}/v1/health`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new ExchangeAdapterError(
        'Finoa API health check failed',
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
   * Build order body for Finoa API
   */
  private buildOrderBody(order: OrderRequest): Record<string, unknown> {
    // Parse asset pair (e.g., "BTC-EUR" -> asset: "BTC", quoteAsset: "EUR")
    const [asset, quoteAsset] = order.assetId.split('-');

    const body: Record<string, unknown> = {
      externalOrderId: order.orderId,
      asset,
      quoteAsset: quoteAsset || 'EUR',
      direction: order.side.toLowerCase(),
      type: this.mapOrderTypeToFinoa(order.orderType),
      requestedQuantity: order.quantity.toString(),
    };

    // Add price for limit orders
    if (order.price !== undefined && order.orderType === 'LIMIT') {
      body.requestedPrice = order.price.toString();
    }

    // Add time in force
    body.timeInForce = this.mapTimeInForceToFinoa(order.timeInForce);

    return body;
  }

  /**
   * Map internal order type to Finoa order type
   */
  private mapOrderTypeToFinoa(orderType: OrderType): string {
    const mapping: Record<OrderType, string> = {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP_LIMIT: 'STOP_LIMIT',
      STOP_MARKET: 'STOP_MARKET',
      TRAILING_STOP: 'TRAILING_STOP',
    };
    return mapping[orderType];
  }

  /**
   * Map Finoa order type to internal order type
   */
  private mapFinoaOrderType(type: string): OrderType {
    const mapping: Record<string, OrderType> = {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP_LIMIT: 'STOP_LIMIT',
      STOP_MARKET: 'STOP_MARKET',
      TRAILING_STOP: 'TRAILING_STOP',
    };
    return mapping[type.toUpperCase()] ?? 'LIMIT';
  }

  /**
   * Map internal time in force to Finoa time in force
   */
  private mapTimeInForceToFinoa(tif: TimeInForce): string {
    const mapping: Record<TimeInForce, string> = {
      GTC: 'GTC',
      IOC: 'IOC',
      FOK: 'FOK',
      GTD: 'GTD',
    };
    return mapping[tif];
  }

  /**
   * Map Finoa order status to internal status
   */
  private mapFinoaOrderStatus(state: string): OrderStatus {
    const mapping: Record<string, OrderStatus> = {
      PENDING: 'PENDING',
      OPEN: 'OPEN',
      PARTIALLY_FILLED: 'PARTIALLY_FILLED',
      FILLED: 'FILLED',
      CANCELLED: 'CANCELLED',
      REJECTED: 'REJECTED',
      EXPIRED: 'EXPIRED',
    };
    return mapping[state.toUpperCase()] ?? 'PENDING';
  }

  /**
   * Map Finoa order response to internal OrderResponse
   */
  private mapFinoaOrderResponse(
    response: FinoaOrderResponse,
    orderId: string
  ): OrderResponse {
    const filledQuantity = parseFloat(response.executedQuantity);
    const originalQuantity = parseFloat(response.requestedQuantity);

    return {
      orderId,
      exchangeOrderId: response.orderId,
      exchangeId: this.exchangeId,
      status: this.mapFinoaOrderStatus(response.state),
      filledQuantity,
      remainingQuantity: originalQuantity - filledQuantity,
      averagePrice: response.executedPrice ? parseFloat(response.executedPrice) : undefined,
      commission: response.fee ? parseFloat(response.fee) : undefined,
      commissionAsset: response.feeAsset,
      createdAt: response.createdTimestamp,
      updatedAt: response.lastUpdatedTimestamp,
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
   * Create Finoa-specific error
   */
  private createFinoaError(status: number, body: unknown): ExchangeAdapterError {
    let message = `Finoa API error: HTTP ${status}`;
    let retryable = false;

    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      if (errorBody.message) {
        message = `Finoa API error: ${errorBody.message}`;
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
