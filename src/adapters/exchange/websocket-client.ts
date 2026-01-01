/**
 * WebSocket Client for Exchange Integration
 *
 * Provides WebSocket connectivity with:
 * - Connection management (connect, disconnect)
 * - Message sending and receiving
 * - Subscription management (subscribe, unsubscribe)
 * - Message parsing and event emission
 * - Automatic reconnection with exponential backoff
 * - Heartbeat mechanism for connection health
 * - Support for multiple concurrent connections
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { EventEmitter } from 'events';
import { ExchangeId } from '../../types/exchange';
import { OrderUpdate, ExecutionUpdate } from '../../types/exchange-order';
import { ConnectionStatus, ReconnectionStrategy } from '../../types/exchange-connection';
import { generateUUID } from '../../utils/uuid';

/**
 * WebSocket connection options
 */
export interface WSOptions {
  reconnect: boolean;
  reconnectStrategy: ReconnectionStrategy;
  heartbeatIntervalMs: number;
  pingTimeoutMs: number;
}

/**
 * Default WebSocket options
 */
export const DEFAULT_WS_OPTIONS: WSOptions = {
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
};

/**
 * Subscription handle for tracking active subscriptions
 */
export interface WSSubscriptionHandle {
  id: string;
  channel: string;
  callback: (message: unknown) => void;
  createdAt: string;
}

/**
 * Normalized WebSocket message types
 */
export type WSMessageType = 'ORDER_UPDATE' | 'EXECUTION_UPDATE' | 'HEARTBEAT' | 'SUBSCRIPTION_ACK' | 'ERROR' | 'UNKNOWN';

/**
 * Normalized WebSocket message
 */
export interface NormalizedWSMessage {
  type: WSMessageType;
  exchangeId: ExchangeId;
  channel?: string;
  data?: OrderUpdate | ExecutionUpdate | unknown;
  timestamp: string;
  rawMessage: unknown;
}

/**
 * Connection state for a single WebSocket connection
 */
export interface WSConnectionState {
  connectionId: string;
  endpoint: string;
  status: ConnectionStatus;
  socket: WebSocket | null;
  subscriptions: Map<string, WSSubscriptionHandle>;
  reconnectAttempts: number;
  lastActivityAt: string;
  connectedAt?: string;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  pingTimer?: ReturnType<typeof setTimeout>;
  isHealthy: boolean;
}


/**
 * Error thrown by WebSocket client operations
 */
export class WebSocketClientError extends Error {
  constructor(
    message: string,
    public readonly exchangeId: ExchangeId,
    public readonly connectionId?: string,
    public readonly retryable: boolean = false,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'WebSocketClientError';
  }
}

/**
 * WebSocket Client for exchange communication
 *
 * Handles WebSocket connections with automatic reconnection,
 * heartbeat monitoring, and message normalization.
 */
export class WebSocketClient extends EventEmitter {
  private readonly exchangeId: ExchangeId;
  private readonly options: WSOptions;
  private connections: Map<string, WSConnectionState> = new Map();
  private messageParser: (message: unknown) => NormalizedWSMessage;

  constructor(
    exchangeId: ExchangeId,
    options: Partial<WSOptions> = {},
    messageParser?: (message: unknown) => NormalizedWSMessage
  ) {
    super();
    this.exchangeId = exchangeId;
    this.options = { ...DEFAULT_WS_OPTIONS, ...options };
    this.messageParser = messageParser ?? this.defaultMessageParser.bind(this);
  }

  /**
   * Connect to a WebSocket endpoint
   *
   * @param endpoint - WebSocket URL to connect to
   * @param connectionId - Optional connection ID (auto-generated if not provided)
   * @returns Connection ID
   */
  async connect(endpoint: string, connectionId?: string): Promise<string> {
    const connId = connectionId ?? generateUUID();

    // Check if connection already exists
    const existing = this.connections.get(connId);
    if (existing && existing.status === 'CONNECTED') {
      return connId;
    }

    // Create connection state
    const state: WSConnectionState = {
      connectionId: connId,
      endpoint,
      status: 'CONNECTING',
      socket: null,
      subscriptions: new Map(),
      reconnectAttempts: 0,
      lastActivityAt: new Date().toISOString(),
      isHealthy: true,
    };

    this.connections.set(connId, state);

    try {
      await this.establishConnection(state);
      return connId;
    } catch (error) {
      state.status = 'ERROR';
      throw new WebSocketClientError(
        `Failed to connect to ${endpoint}`,
        this.exchangeId,
        connId,
        true,
        error
      );
    }
  }

  /**
   * Establish WebSocket connection
   */
  private async establishConnection(state: WSConnectionState): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(state.endpoint);

        socket.onopen = () => {
          state.socket = socket;
          state.status = 'CONNECTED';
          state.connectedAt = new Date().toISOString();
          state.lastActivityAt = new Date().toISOString();
          state.reconnectAttempts = 0;
          state.isHealthy = true;

          // Start heartbeat
          this.startHeartbeat(state);

          this.emit('connected', { connectionId: state.connectionId, endpoint: state.endpoint });
          resolve();
        };

        socket.onclose = (event) => {
          this.handleClose(state, event.code, event.reason);
        };

        socket.onerror = (error) => {
          this.handleError(state, error);
          if (state.status === 'CONNECTING') {
            reject(new WebSocketClientError(
              'WebSocket connection error',
              this.exchangeId,
              state.connectionId,
              true,
              error
            ));
          }
        };

        socket.onmessage = (event) => {
          this.handleMessage(state, event.data);
        };

        state.socket = socket;
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from a WebSocket endpoint
   *
   * @param connectionId - Connection ID to disconnect
   */
  async disconnect(connectionId: string): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) {
      return;
    }

    // Stop heartbeat
    this.stopHeartbeat(state);

    // Close socket
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.close(1000, 'Client disconnect');
    }

    state.status = 'DISCONNECTED';
    state.socket = null;

    this.emit('disconnected', { connectionId, reason: 'Client disconnect' });
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map(
      (connId) => this.disconnect(connId)
    );
    await Promise.all(disconnectPromises);
    this.connections.clear();
  }

  /**
   * Send a message through a WebSocket connection
   *
   * @param connectionId - Connection ID to send through
   * @param message - Message to send
   */
  async send(connectionId: string, message: unknown): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state || state.status !== 'CONNECTED' || !state.socket) {
      throw new WebSocketClientError(
        `Connection ${connectionId} is not connected`,
        this.exchangeId,
        connectionId,
        false
      );
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    state.socket.send(payload);
    state.lastActivityAt = new Date().toISOString();
  }

  /**
   * Subscribe to a channel
   *
   * @param connectionId - Connection ID
   * @param channel - Channel to subscribe to
   * @param callback - Callback for messages on this channel
   * @returns Subscription handle
   */
  async subscribe(
    connectionId: string,
    channel: string,
    callback: (message: unknown) => void
  ): Promise<WSSubscriptionHandle> {
    const state = this.connections.get(connectionId);
    if (!state) {
      throw new WebSocketClientError(
        `Connection ${connectionId} not found`,
        this.exchangeId,
        connectionId,
        false
      );
    }

    const handle: WSSubscriptionHandle = {
      id: generateUUID(),
      channel,
      callback,
      createdAt: new Date().toISOString(),
    };

    state.subscriptions.set(handle.id, handle);

    // Send subscription message to exchange (exchange-specific format)
    if (state.status === 'CONNECTED' && state.socket) {
      await this.sendSubscriptionMessage(state, channel, 'subscribe');
    }

    this.emit('subscribed', { connectionId, channel, subscriptionId: handle.id });
    return handle;
  }

  /**
   * Unsubscribe from a channel
   *
   * @param connectionId - Connection ID
   * @param handle - Subscription handle to unsubscribe
   */
  async unsubscribe(connectionId: string, handle: WSSubscriptionHandle): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) {
      return;
    }

    state.subscriptions.delete(handle.id);

    // Send unsubscription message to exchange
    if (state.status === 'CONNECTED' && state.socket) {
      await this.sendSubscriptionMessage(state, handle.channel, 'unsubscribe');
    }

    this.emit('unsubscribed', { connectionId, channel: handle.channel, subscriptionId: handle.id });
  }


  /**
   * Send subscription/unsubscription message
   */
  private async sendSubscriptionMessage(
    state: WSConnectionState,
    channel: string,
    action: 'subscribe' | 'unsubscribe'
  ): Promise<void> {
    const message = {
      action,
      channel,
      timestamp: new Date().toISOString(),
    };
    await this.send(state.connectionId, message);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(state: WSConnectionState, data: unknown): void {
    state.lastActivityAt = new Date().toISOString();
    state.isHealthy = true;

    try {
      // Parse the raw message
      const rawMessage = typeof data === 'string' ? JSON.parse(data) : data;

      // Normalize the message
      const normalized = this.messageParser(rawMessage);

      // Handle heartbeat responses
      if (normalized.type === 'HEARTBEAT') {
        this.handleHeartbeatResponse(state);
        return;
      }

      // Emit normalized message
      this.emit('message', normalized);

      // Route to specific event types
      if (normalized.type === 'ORDER_UPDATE' && normalized.data) {
        this.emit('orderUpdate', normalized.data as OrderUpdate);
      } else if (normalized.type === 'EXECUTION_UPDATE' && normalized.data) {
        this.emit('executionUpdate', normalized.data as ExecutionUpdate);
      }

      // Route to channel subscribers
      if (normalized.channel) {
        for (const sub of state.subscriptions.values()) {
          if (sub.channel === normalized.channel) {
            sub.callback(normalized);
          }
        }
      }
    } catch (error) {
      // Log parse error but don't crash
      this.emit('parseError', {
        connectionId: state.connectionId,
        rawData: data,
        error,
      });
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(state: WSConnectionState, code: number, reason: string): void {
    this.stopHeartbeat(state);
    state.socket = null;

    const wasConnected = state.status === 'CONNECTED';
    state.status = 'DISCONNECTED';

    this.emit('close', { connectionId: state.connectionId, code, reason });

    // Attempt reconnection if enabled and was previously connected
    if (this.options.reconnect && wasConnected && code !== 1000) {
      this.attemptReconnection(state);
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(state: WSConnectionState, error: Event): void {
    state.isHealthy = false;
    this.emit('error', {
      connectionId: state.connectionId,
      error,
    });
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private async attemptReconnection(state: WSConnectionState): Promise<void> {
    const strategy = this.options.reconnectStrategy;

    if (state.reconnectAttempts >= strategy.maxAttempts) {
      state.status = 'ERROR';
      this.emit('reconnectFailed', {
        connectionId: state.connectionId,
        attempts: state.reconnectAttempts,
      });
      return;
    }

    state.status = 'RECONNECTING';
    state.reconnectAttempts++;

    // Calculate delay with exponential backoff and jitter
    const delay = this.calculateReconnectDelay(state.reconnectAttempts - 1, strategy);

    this.emit('reconnecting', {
      connectionId: state.connectionId,
      attempt: state.reconnectAttempts,
      delayMs: delay,
    });

    await this.sleep(delay);

    try {
      await this.establishConnection(state);

      // Re-subscribe to all active subscriptions
      await this.resubscribeAll(state);

      this.emit('reconnected', {
        connectionId: state.connectionId,
        attempts: state.reconnectAttempts,
      });
    } catch (error) {
      // Retry again
      this.attemptReconnection(state);
    }
  }

  /**
   * Calculate reconnection delay with exponential backoff and jitter
   *
   * Formula: delay = min(initialDelay * (multiplier ^ attempt), maxDelay) * (1 + jitter)
   */
  calculateReconnectDelay(attempt: number, strategy: ReconnectionStrategy): number {
    const baseDelay = strategy.initialDelayMs * Math.pow(strategy.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, strategy.maxDelayMs);

    // Add jitter
    const jitterFactor = 1 + (Math.random() * strategy.jitterPercent * 2 - strategy.jitterPercent) / 100;
    return Math.floor(cappedDelay * jitterFactor);
  }

  /**
   * Re-subscribe to all active subscriptions after reconnection
   */
  private async resubscribeAll(state: WSConnectionState): Promise<void> {
    const subscriptions = Array.from(state.subscriptions.values());

    for (const sub of subscriptions) {
      try {
        await this.sendSubscriptionMessage(state, sub.channel, 'subscribe');
      } catch (error) {
        this.emit('resubscribeFailed', {
          connectionId: state.connectionId,
          channel: sub.channel,
          error,
        });
      }
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(state: WSConnectionState): void {
    this.stopHeartbeat(state);

    state.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat(state);
    }, this.options.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(state: WSConnectionState): void {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = undefined;
    }
    if (state.pingTimer) {
      clearTimeout(state.pingTimer);
      state.pingTimer = undefined;
    }
  }

  /**
   * Send heartbeat/ping message
   */
  async sendHeartbeat(state: WSConnectionState): Promise<void> {
    if (state.status !== 'CONNECTED' || !state.socket) {
      return;
    }

    try {
      // Send ping message
      const pingMessage = { type: 'ping', timestamp: Date.now() };
      await this.send(state.connectionId, pingMessage);

      // Set timeout for pong response
      state.pingTimer = setTimeout(() => {
        this.handleHeartbeatTimeout(state);
      }, this.options.pingTimeoutMs);
    } catch (error) {
      this.handleHeartbeatTimeout(state);
    }
  }

  /**
   * Handle heartbeat response (pong)
   */
  private handleHeartbeatResponse(state: WSConnectionState): void {
    if (state.pingTimer) {
      clearTimeout(state.pingTimer);
      state.pingTimer = undefined;
    }
    state.isHealthy = true;
    state.lastActivityAt = new Date().toISOString();
  }

  /**
   * Handle heartbeat timeout
   */
  private handleHeartbeatTimeout(state: WSConnectionState): void {
    state.isHealthy = false;
    this.emit('heartbeatTimeout', { connectionId: state.connectionId });

    // Trigger reconnection
    if (state.socket) {
      state.socket.close(4000, 'Heartbeat timeout');
    }
  }


  /**
   * Default message parser - normalizes exchange messages
   *
   * This is a generic parser that can be overridden for exchange-specific formats.
   */
  private defaultMessageParser(rawMessage: unknown): NormalizedWSMessage {
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

    // Detect message type based on common patterns
    const type = this.detectMessageType(msg);

    // Extract channel if present
    const channel = this.extractChannel(msg);

    // Parse data based on type
    const data = this.parseMessageData(msg, type);

    // Ensure timestamp is always a string
    const msgTimestamp = msg.timestamp ?? msg.T ?? msg.ts ?? msg.E;
    const normalizedTimestamp = msgTimestamp !== undefined
      ? (typeof msgTimestamp === 'number' ? new Date(msgTimestamp).toISOString() : String(msgTimestamp))
      : timestamp;

    return {
      type,
      exchangeId: this.exchangeId,
      channel,
      data,
      timestamp: normalizedTimestamp,
      rawMessage,
    };
  }

  /**
   * Detect message type from raw message
   */
  private detectMessageType(msg: Record<string, unknown>): WSMessageType {
    // Check for explicit type field
    const typeField = msg.type ?? msg.e ?? msg.event ?? msg.op;

    if (typeof typeField === 'string') {
      const typeLower = typeField.toLowerCase();

      if (typeLower.includes('pong') || typeLower.includes('heartbeat')) {
        return 'HEARTBEAT';
      }
      if (typeLower.includes('order') || typeLower.includes('executionreport')) {
        return 'ORDER_UPDATE';
      }
      if (typeLower.includes('trade') || typeLower.includes('fill') || typeLower.includes('execution')) {
        return 'EXECUTION_UPDATE';
      }
      if (typeLower.includes('subscribed') || typeLower.includes('ack')) {
        return 'SUBSCRIPTION_ACK';
      }
      if (typeLower.includes('error')) {
        return 'ERROR';
      }
    }

    // Check for order update indicators
    if (msg.orderId || msg.orderID || msg.i || msg.c) {
      if (msg.executionId || msg.tradeId || msg.t) {
        return 'EXECUTION_UPDATE';
      }
      return 'ORDER_UPDATE';
    }

    return 'UNKNOWN';
  }

  /**
   * Extract channel from message
   */
  private extractChannel(msg: Record<string, unknown>): string | undefined {
    return (msg.channel ?? msg.stream ?? msg.s ?? msg.topic) as string | undefined;
  }

  /**
   * Parse message data based on type
   */
  private parseMessageData(
    msg: Record<string, unknown>,
    type: WSMessageType
  ): OrderUpdate | ExecutionUpdate | unknown {
    if (type === 'ORDER_UPDATE') {
      return this.parseOrderUpdate(msg);
    }
    if (type === 'EXECUTION_UPDATE') {
      return this.parseExecutionUpdate(msg);
    }
    return msg.data ?? msg;
  }

  /**
   * Parse order update from raw message
   */
  private parseOrderUpdate(msg: Record<string, unknown>): OrderUpdate {
    // Handle nested data
    const data = (msg.data ?? msg) as Record<string, unknown>;

    return {
      orderId: String(data.orderId ?? data.c ?? data.clientOrderId ?? ''),
      exchangeOrderId: String(data.exchangeOrderId ?? data.i ?? data.orderID ?? ''),
      exchangeId: this.exchangeId,
      status: this.normalizeOrderStatus(data.status ?? data.X ?? data.orderStatus),
      filledQuantity: Number(data.filledQuantity ?? data.z ?? data.cumQty ?? 0),
      remainingQuantity: Number(data.remainingQuantity ?? data.leavesQty ?? 0),
      lastFilledPrice: data.lastFilledPrice !== undefined ? Number(data.lastFilledPrice ?? data.L ?? data.lastPx) : undefined,
      lastFilledQuantity: data.lastFilledQuantity !== undefined ? Number(data.lastFilledQuantity ?? data.l ?? data.lastQty) : undefined,
      timestamp: String(data.timestamp ?? data.T ?? data.transactTime ?? new Date().toISOString()),
    };
  }

  /**
   * Parse execution update from raw message
   */
  private parseExecutionUpdate(msg: Record<string, unknown>): ExecutionUpdate {
    // Handle nested data
    const data = (msg.data ?? msg) as Record<string, unknown>;

    return {
      executionId: String(data.executionId ?? data.t ?? data.tradeId ?? generateUUID()),
      orderId: String(data.orderId ?? data.c ?? data.clientOrderId ?? ''),
      exchangeOrderId: String(data.exchangeOrderId ?? data.i ?? data.orderID ?? ''),
      exchangeId: this.exchangeId,
      side: this.normalizeOrderSide(data.side ?? data.S),
      quantity: Number(data.quantity ?? data.q ?? data.lastQty ?? 0),
      price: Number(data.price ?? data.p ?? data.lastPx ?? 0),
      commission: Number(data.commission ?? data.n ?? 0),
      commissionAsset: String(data.commissionAsset ?? data.N ?? 'USDT'),
      timestamp: String(data.timestamp ?? data.T ?? data.transactTime ?? new Date().toISOString()),
    };
  }

  /**
   * Normalize order status from various exchange formats
   */
  private normalizeOrderStatus(status: unknown): OrderUpdate['status'] {
    if (!status) return 'PENDING';

    const statusStr = String(status).toUpperCase();

    const statusMap: Record<string, OrderUpdate['status']> = {
      'NEW': 'OPEN',
      'OPEN': 'OPEN',
      'PARTIALLY_FILLED': 'PARTIALLY_FILLED',
      'PARTIAL': 'PARTIALLY_FILLED',
      'FILLED': 'FILLED',
      'DONE': 'FILLED',
      'CANCELLED': 'CANCELLED',
      'CANCELED': 'CANCELLED',
      'REJECTED': 'REJECTED',
      'EXPIRED': 'EXPIRED',
      'PENDING': 'PENDING',
      'PENDING_NEW': 'PENDING',
    };

    return statusMap[statusStr] ?? 'PENDING';
  }

  /**
   * Normalize order side from various exchange formats
   */
  private normalizeOrderSide(side: unknown): ExecutionUpdate['side'] {
    if (!side) return 'BUY';

    const sideStr = String(side).toUpperCase();
    return sideStr === 'SELL' || sideStr === 'S' || sideStr === 'ASK' ? 'SELL' : 'BUY';
  }

  // ============================================
  // Public Getters and Utilities
  // ============================================

  /**
   * Get connection state
   */
  getConnectionState(connectionId: string): WSConnectionState | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connection IDs
   */
  getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection status
   */
  getConnectionStatus(connectionId: string): ConnectionStatus | undefined {
    return this.connections.get(connectionId)?.status;
  }

  /**
   * Check if connection is healthy
   */
  isConnectionHealthy(connectionId: string): boolean {
    const state = this.connections.get(connectionId);
    return state?.isHealthy ?? false;
  }

  /**
   * Get all subscriptions for a connection
   */
  getSubscriptions(connectionId: string): WSSubscriptionHandle[] {
    const state = this.connections.get(connectionId);
    return state ? Array.from(state.subscriptions.values()) : [];
  }

  /**
   * Get exchange ID
   */
  getExchangeId(): ExchangeId {
    return this.exchangeId;
  }

  /**
   * Get options
   */
  getOptions(): WSOptions {
    return { ...this.options };
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get active connection count
   */
  getActiveConnectionCount(): number {
    let count = 0;
    for (const state of this.connections.values()) {
      if (state.status === 'CONNECTED') {
        count++;
      }
    }
    return count;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
