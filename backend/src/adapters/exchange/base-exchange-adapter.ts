/**
 * Base Exchange Adapter - provides common functionality for all exchange adapters
 *
 * This abstract class implements the common functionality shared by all exchange adapters:
 * - Connection management (connect, disconnect, isConnected)
 * - Health check with latency measurement
 * - Rate limit status tracking
 * - Request logging for audit
 * - Retry logic with exponential backoff
 *
 * Requirements: 1.1, 1.3, 2.1
 */

import {
  ExchangeId,
  ExchangeMode,
  ExchangeConfig,
  ExchangeHealthResult,
  RateLimitStatus,
  SubscriptionHandle,
  BalanceResponse,
  PositionResponse,
} from '../../types/exchange';
import {
  OrderRequest,
  OrderResponse,
  OrderModification,
  CancelResponse,
  OrderStatus,
  OrderUpdate,
  ExecutionUpdate,
} from '../../types/exchange-order';
import { ConnectionStatus } from '../../types/exchange-connection';
import { generateUUID } from '../../utils/uuid';

/**
 * Configuration for an exchange adapter
 */
export interface ExchangeAdapterConfig {
  exchangeId: ExchangeId;
  tenantId: string;
  mode: ExchangeMode;
  restEndpoint: string;
  wsEndpoint?: string;
  fixEndpoint?: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Request log entry for audit purposes
 */
export interface ExchangeRequestLog {
  logId: string;
  timestamp: string;
  exchangeId: ExchangeId;
  operationType: string;
  endpoint: string;
  method: string;
  durationMs: number;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
}

/**
 * Error thrown when an exchange operation fails
 */
export class ExchangeAdapterError extends Error {
  constructor(
    message: string,
    public readonly exchangeId: ExchangeId,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'ExchangeAdapterError';
  }
}


/**
 * Abstract base class for exchange adapters
 *
 * All exchange-specific adapters (Binance, Coinbase, etc.) extend this class
 * and implement the abstract methods for their specific API protocols.
 */
export abstract class BaseExchangeAdapter {
  abstract readonly exchangeId: ExchangeId;
  abstract readonly mode: ExchangeMode;

  protected config: ExchangeAdapterConfig;
  protected connectionStatus: ConnectionStatus = 'DISCONNECTED';
  protected requestLogs: ExchangeRequestLog[] = [];
  protected readonly maxLogEntries = 1000;
  protected lastHealthCheck?: ExchangeHealthResult;
  protected subscriptions: Map<string, SubscriptionHandle> = new Map();

  constructor(config: ExchangeAdapterConfig) {
    this.config = {
      timeoutMs: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Establish connection to the exchange
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the exchange
   */
  abstract disconnect(): Promise<void>;

  /**
   * Check if currently connected to the exchange
   */
  isConnected(): boolean {
    return this.connectionStatus === 'CONNECTED';
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Set connection status (for use by subclasses)
   */
  protected setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
  }

  // ============================================
  // Order Operations (Abstract - must be implemented by subclasses)
  // ============================================

  /**
   * Submit an order to the exchange
   */
  abstract submitOrder(order: OrderRequest): Promise<OrderResponse>;

  /**
   * Cancel an existing order
   */
  abstract cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse>;

  /**
   * Modify an existing order (price/quantity)
   */
  abstract modifyOrder(orderId: string, modifications: OrderModification): Promise<OrderResponse>;

  /**
   * Get the current status of an order
   */
  abstract getOrderStatus(orderId: string, exchangeOrderId: string): Promise<OrderStatus>;

  // ============================================
  // Account Operations (Abstract - must be implemented by subclasses)
  // ============================================

  /**
   * Get account balance for one or all assets
   */
  abstract getBalance(asset?: string): Promise<BalanceResponse>;

  /**
   * Get current positions
   */
  abstract getPositions(): Promise<PositionResponse[]>;

  // ============================================
  // Real-time Subscriptions (Abstract - must be implemented by subclasses)
  // ============================================

  /**
   * Subscribe to order updates
   */
  abstract subscribeToOrderUpdates(
    callback: (update: OrderUpdate) => void
  ): Promise<SubscriptionHandle>;

  /**
   * Subscribe to execution/fill updates
   */
  abstract subscribeToExecutions(
    callback: (execution: ExecutionUpdate) => void
  ): Promise<SubscriptionHandle>;

  /**
   * Unsubscribe from a subscription
   */
  abstract unsubscribe(handle: SubscriptionHandle): Promise<void>;


  // ============================================
  // Health Check and Rate Limit Status
  // ============================================

  /**
   * Perform a health check on the exchange connection
   *
   * Default implementation pings the exchange and measures latency.
   * Subclasses can override for exchange-specific health checks.
   */
  async healthCheck(): Promise<ExchangeHealthResult> {
    const startTime = Date.now();

    try {
      // Attempt to get balance as a health check (lightweight operation)
      await this.getBalance();

      const latencyMs = Date.now() - startTime;
      const result: ExchangeHealthResult = {
        exchangeId: this.exchangeId,
        healthy: true,
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
      };

      this.lastHealthCheck = result;
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const result: ExchangeHealthResult = {
        exchangeId: this.exchangeId,
        healthy: false,
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };

      this.lastHealthCheck = result;
      return result;
    }
  }

  /**
   * Get the last health check result
   */
  getLastHealthCheck(): ExchangeHealthResult | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Get current rate limit status
   *
   * Default implementation returns placeholder values.
   * Subclasses should override to track actual rate limit usage.
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      exchangeId: this.exchangeId,
      ordersRemaining: -1, // -1 indicates unknown
      queriesRemaining: -1,
      wsMessagesRemaining: -1,
      resetsAt: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
    };
  }

  // ============================================
  // Retry Logic with Exponential Backoff
  // ============================================

  /**
   * Execute an operation with retry logic and exponential backoff
   *
   * @param operation - The async operation to execute
   * @param operationType - Type of operation for logging
   * @returns The result of the operation
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationType: string
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const result = await operation();
        this.logRequest(operationType, Date.now() - startTime, true);
        return result;
      } catch (error) {
        lastError = error as Error;

        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === this.config.maxRetries) {
          this.logRequest(operationType, Date.now() - startTime, false, lastError.message);
          throw error;
        }

        // Exponential backoff: delay = initialDelay * (2 ^ attemptNumber)
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculate retry delay using exponential backoff
   *
   * Formula: initialDelay * (multiplier ^ attemptNumber)
   * Default multiplier is 2 for exponential backoff
   */
  protected calculateRetryDelay(attemptNumber: number, multiplier: number = 2): number {
    const delay = this.config.retryDelayMs! * Math.pow(multiplier, attemptNumber);
    // Cap at a reasonable maximum (e.g., 60 seconds)
    return Math.min(delay, 60000);
  }

  /**
   * Determine if an error is retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof ExchangeAdapterError) {
      return error.retryable;
    }

    // Retry on network errors or 5xx status codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504') ||
        message.includes('500')
      );
    }

    return false;
  }


  // ============================================
  // Request Logging for Audit
  // ============================================

  /**
   * Log a request for audit purposes
   */
  protected logRequest(
    operationType: string,
    durationMs: number,
    success: boolean,
    errorMessage?: string,
    requestPayload?: unknown,
    responsePayload?: unknown,
    statusCode?: number
  ): void {
    const entry: ExchangeRequestLog = {
      logId: generateUUID(),
      timestamp: new Date().toISOString(),
      exchangeId: this.exchangeId,
      operationType,
      endpoint: this.config.restEndpoint,
      method: 'POST', // Default, can be overridden
      durationMs,
      success,
      statusCode,
      errorMessage,
      requestPayload,
      responsePayload,
    };

    this.requestLogs.push(entry);

    // Keep log size bounded
    if (this.requestLogs.length > this.maxLogEntries) {
      this.requestLogs = this.requestLogs.slice(-this.maxLogEntries);
    }
  }

  /**
   * Get recent request logs
   */
  getRequestLogs(limit?: number): ExchangeRequestLog[] {
    const logs = [...this.requestLogs];
    return limit ? logs.slice(-limit) : logs;
  }

  /**
   * Clear request logs
   */
  clearRequestLogs(): void {
    this.requestLogs = [];
  }

  // ============================================
  // Subscription Management
  // ============================================

  /**
   * Create a subscription handle
   */
  protected createSubscriptionHandle(channel: string): SubscriptionHandle {
    const handle: SubscriptionHandle = {
      id: generateUUID(),
      exchangeId: this.exchangeId,
      channel,
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.set(handle.id, handle);
    return handle;
  }

  /**
   * Remove a subscription handle
   */
  protected removeSubscriptionHandle(handleId: string): boolean {
    return this.subscriptions.delete(handleId);
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): SubscriptionHandle[] {
    return Array.from(this.subscriptions.values());
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Sleep for a specified duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a timeout promise
   */
  protected createTimeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new ExchangeAdapterError(message, this.exchangeId, undefined, true)
          ),
        ms
      );
    });
  }

  /**
   * Execute with timeout
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const timeout = timeoutMs ?? this.config.timeoutMs!;
    return Promise.race([
      promise,
      this.createTimeout<T>(timeout, `Request timed out after ${timeout}ms`),
    ]);
  }

  /**
   * Get the exchange configuration
   */
  getConfig(): ExchangeAdapterConfig {
    return { ...this.config };
  }

  /**
   * Get the tenant ID
   */
  getTenantId(): string {
    return this.config.tenantId;
  }

  /**
   * Check if running in sandbox mode
   */
  isSandboxMode(): boolean {
    return this.config.mode === 'SANDBOX';
  }
}
