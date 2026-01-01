/**
 * Exchange Connection Manager Service
 *
 * Manages connection pools for exchanges, providing:
 * - Connection pool management per exchange
 * - Connection creation, retrieval, and closure
 * - Connection metrics tracking (uptime, latency, error rate, reconnection count)
 * - Connection quality alerting
 * - Graceful shutdown with in-flight request handling
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { EventEmitter } from 'events';
import { ExchangeId } from '../types/exchange';
import {
  Connection,
  ConnectionPool,
  ConnectionType,
  ConnectionStatus,
  ConnectionMetrics,
  ConnectionHealthReport,
  ConnectionHealthDetail,
  ConnectionHealthLevel,
  ShutdownResult,
  ReconnectionStrategy,
} from '../types/exchange-connection';
import { generateUUID } from '../utils/uuid';

/**
 * Configuration for connection quality thresholds
 */
export interface ConnectionQualityConfig {
  maxLatencyMs: number;
  maxErrorRate: number;
  pauseTradingOnDegraded: boolean;
}

/**
 * Default connection quality configuration
 */
export const DEFAULT_QUALITY_CONFIG: ConnectionQualityConfig = {
  maxLatencyMs: 5000,
  maxErrorRate: 0.1, // 10%
  pauseTradingOnDegraded: false,
};

/**
 * Default reconnection strategy
 */
export const DEFAULT_RECONNECTION_STRATEGY: ReconnectionStrategy = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxAttempts: 10,
  jitterPercent: 10,
};

/**
 * In-flight request tracking
 */
interface InFlightRequest {
  requestId: string;
  connectionId: string;
  startedAt: string;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/**
 * Alert types for connection quality issues
 */
export type ConnectionAlertType = 'HIGH_LATENCY' | 'HIGH_ERROR_RATE' | 'CONNECTION_LOST' | 'TRADING_PAUSED';

/**
 * Connection alert event
 */
export interface ConnectionAlert {
  alertId: string;
  type: ConnectionAlertType;
  exchangeId: ExchangeId;
  connectionId?: string;
  message: string;
  value?: number;
  threshold?: number;
  timestamp: string;
}


/**
 * Connection Manager Service
 *
 * Maintains connection pools per exchange and provides connection lifecycle management.
 */
export class ExchangeConnectionManager extends EventEmitter {
  // Connection pools per tenant per exchange
  private pools: Map<string, ConnectionPool> = new Map();

  // Individual connections by ID
  private connections: Map<string, Connection> = new Map();

  // In-flight requests for graceful shutdown
  private inFlightRequests: Map<string, InFlightRequest> = new Map();

  // Shutdown state per tenant/exchange
  private shuttingDown: Set<string> = new Set();

  // Quality configuration per exchange
  private qualityConfigs: Map<ExchangeId, ConnectionQualityConfig> = new Map();

  // Reconnection strategies per exchange
  private reconnectionStrategies: Map<ExchangeId, ReconnectionStrategy> = new Map();

  // Trading paused state per exchange
  private tradingPaused: Set<string> = new Set();

  // Metrics update interval handles
  private metricsIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  // Default max connections per pool
  private readonly defaultMaxConnections: number;

  constructor(defaultMaxConnections: number = 10) {
    super();
    this.defaultMaxConnections = defaultMaxConnections;
  }

  /**
   * Get a connection from the pool, creating one if necessary
   *
   * @param tenantId - Tenant identifier
   * @param exchangeId - Exchange identifier
   * @param type - Connection type (REST, WEBSOCKET, FIX)
   * @returns Connection instance
   *
   * Requirements: 8.1
   */
  async getConnection(
    tenantId: string,
    exchangeId: ExchangeId,
    type: ConnectionType
  ): Promise<Connection> {
    const poolKey = this.getPoolKey(tenantId, exchangeId);

    // Check if shutting down
    if (this.shuttingDown.has(poolKey)) {
      throw new ConnectionManagerError(
        'Cannot get connection during shutdown',
        exchangeId,
        'SHUTDOWN_IN_PROGRESS'
      );
    }

    // Get or create pool
    let pool = this.pools.get(poolKey);
    if (!pool) {
      pool = this.createPool(tenantId, exchangeId);
    }

    // Find an available connection of the requested type
    const availableConnection = pool.connections.find(
      (conn) => conn.type === type && conn.status === 'CONNECTED'
    );

    if (availableConnection) {
      // Update last activity
      availableConnection.lastActivityAt = new Date().toISOString();
      return availableConnection;
    }

    // Create a new connection if pool has capacity
    if (pool.connections.length < pool.maxConnections) {
      return this.createConnection(tenantId, exchangeId, type);
    }

    // No available connections and pool is full
    throw new ConnectionManagerError(
      `Connection pool exhausted for ${exchangeId}`,
      exchangeId,
      'POOL_EXHAUSTED'
    );
  }

  /**
   * Create a new connection
   *
   * @param tenantId - Tenant identifier
   * @param exchangeId - Exchange identifier
   * @param type - Connection type
   * @param endpoint - Optional endpoint URL
   * @returns Created connection
   *
   * Requirements: 8.1
   */
  async createConnection(
    tenantId: string,
    exchangeId: ExchangeId,
    type: ConnectionType,
    endpoint?: string
  ): Promise<Connection> {
    const poolKey = this.getPoolKey(tenantId, exchangeId);

    // Check if shutting down
    if (this.shuttingDown.has(poolKey)) {
      throw new ConnectionManagerError(
        'Cannot create connection during shutdown',
        exchangeId,
        'SHUTDOWN_IN_PROGRESS'
      );
    }

    // Get or create pool
    let pool = this.pools.get(poolKey);
    if (!pool) {
      pool = this.createPool(tenantId, exchangeId);
    }

    // Check pool capacity
    if (pool.connections.length >= pool.maxConnections) {
      throw new ConnectionManagerError(
        `Connection pool at maximum capacity for ${exchangeId}`,
        exchangeId,
        'POOL_EXHAUSTED'
      );
    }

    const now = new Date().toISOString();
    const connectionId = generateUUID();

    // Create connection with initial metrics
    const connection: Connection = {
      connectionId,
      exchangeId,
      tenantId,
      type,
      status: 'CONNECTING',
      endpoint: endpoint ?? this.getDefaultEndpoint(exchangeId, type),
      lastActivityAt: now,
      reconnectAttempts: 0,
      metrics: this.createInitialMetrics(),
    };

    // Add to pool and connections map
    pool.connections.push(connection);
    this.connections.set(connectionId, connection);

    // Simulate connection establishment
    connection.status = 'CONNECTED';
    connection.connectedAt = now;

    // Update pool stats
    this.updatePoolStats(pool);

    // Start metrics tracking
    this.startMetricsTracking(connection);

    this.emit('connectionCreated', {
      connectionId,
      exchangeId,
      tenantId,
      type,
    });

    return connection;
  }

  /**
   * Close a connection
   *
   * @param connectionId - Connection identifier
   *
   * Requirements: 8.1
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Stop metrics tracking
    this.stopMetricsTracking(connectionId);

    // Update connection status
    connection.status = 'DISCONNECTED';

    // Remove from pool
    const poolKey = this.getPoolKey(connection.tenantId, connection.exchangeId);
    const pool = this.pools.get(poolKey);
    if (pool) {
      pool.connections = pool.connections.filter((c) => c.connectionId !== connectionId);
      this.updatePoolStats(pool);
    }

    // Remove from connections map
    this.connections.delete(connectionId);

    this.emit('connectionClosed', {
      connectionId,
      exchangeId: connection.exchangeId,
      tenantId: connection.tenantId,
    });
  }

  /**
   * Get connection pool for an exchange
   *
   * @param tenantId - Tenant identifier
   * @param exchangeId - Exchange identifier
   * @returns Connection pool
   *
   * Requirements: 8.1
   */
  async getConnectionPool(tenantId: string, exchangeId: ExchangeId): Promise<ConnectionPool> {
    const poolKey = this.getPoolKey(tenantId, exchangeId);
    let pool = this.pools.get(poolKey);

    if (!pool) {
      pool = this.createPool(tenantId, exchangeId);
    }

    return pool;
  }


  /**
   * Get metrics for a specific connection
   *
   * @param connectionId - Connection identifier
   * @returns Connection metrics
   *
   * Requirements: 8.3, 8.6
   */
  async getConnectionMetrics(connectionId: string): Promise<ConnectionMetrics> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new ConnectionManagerError(
        `Connection ${connectionId} not found`,
        'BINANCE', // Default, will be overridden
        'CONNECTION_NOT_FOUND'
      );
    }

    // Update uptime
    if (connection.connectedAt) {
      connection.metrics.uptimeMs =
        Date.now() - new Date(connection.connectedAt).getTime();
    }

    return { ...connection.metrics };
  }

  /**
   * Monitor connection health for an exchange
   *
   * @param tenantId - Tenant identifier
   * @param exchangeId - Exchange identifier
   * @returns Health report
   *
   * Requirements: 8.3, 8.4, 8.6
   */
  async monitorHealth(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<ConnectionHealthReport> {
    const poolKey = this.getPoolKey(tenantId, exchangeId);
    const pool = this.pools.get(poolKey);

    if (!pool || pool.connections.length === 0) {
      return {
        exchangeId,
        overallHealth: 'UNHEALTHY',
        connections: [],
        recommendations: ['No connections available. Create connections to enable trading.'],
        timestamp: new Date().toISOString(),
      };
    }

    const qualityConfig = this.qualityConfigs.get(exchangeId) ?? DEFAULT_QUALITY_CONFIG;
    const connectionDetails: ConnectionHealthDetail[] = [];
    const recommendations: string[] = [];

    let healthyCount = 0;
    let degradedCount = 0;

    for (const connection of pool.connections) {
      const isHealthy = this.isConnectionHealthy(connection, qualityConfig);
      const detail: ConnectionHealthDetail = {
        connectionId: connection.connectionId,
        type: connection.type,
        status: connection.status,
        latencyMs: connection.metrics.latencyMs,
        errorRate: connection.metrics.errorRate,
        healthy: isHealthy,
      };

      connectionDetails.push(detail);

      if (isHealthy) {
        healthyCount++;
      } else if (connection.status === 'CONNECTED') {
        degradedCount++;
      }

      // Generate alerts for unhealthy connections
      if (!isHealthy && connection.status === 'CONNECTED') {
        this.checkAndEmitAlerts(connection, qualityConfig);
      }
    }

    // Determine overall health
    let overallHealth: ConnectionHealthLevel;
    if (healthyCount === pool.connections.length) {
      overallHealth = 'HEALTHY';
    } else if (healthyCount > 0) {
      overallHealth = 'DEGRADED';
      recommendations.push(
        `${degradedCount} connection(s) are degraded. Consider investigating latency or error rates.`
      );
    } else {
      overallHealth = 'UNHEALTHY';
      recommendations.push(
        'All connections are unhealthy. Immediate investigation required.'
      );
    }

    // Check if trading should be paused
    if (overallHealth !== 'HEALTHY' && qualityConfig.pauseTradingOnDegraded) {
      const tradingKey = `${tenantId}:${exchangeId}`;
      if (!this.tradingPaused.has(tradingKey)) {
        this.tradingPaused.add(tradingKey);
        this.emitAlert({
          alertId: generateUUID(),
          type: 'TRADING_PAUSED',
          exchangeId,
          message: `Trading paused for ${exchangeId} due to degraded connection quality`,
          timestamp: new Date().toISOString(),
        });
        recommendations.push('Trading has been paused due to connection quality issues.');
      }
    }

    return {
      exchangeId,
      overallHealth,
      connections: connectionDetails,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Graceful shutdown of connections
   *
   * Waits for in-flight requests to complete before closing connections.
   *
   * @param tenantId - Tenant identifier
   * @param exchangeId - Optional exchange identifier (all if not specified)
   * @param timeoutMs - Maximum time to wait for in-flight requests
   * @returns Shutdown result
   *
   * Requirements: 8.5
   */
  async gracefulShutdown(
    tenantId: string,
    exchangeId?: ExchangeId,
    timeoutMs: number = 30000
  ): Promise<ShutdownResult> {
    const startTime = Date.now();
    let connectionsClosedCount = 0;
    let pendingRequestsCompleted = 0;
    let pendingRequestsCancelled = 0;

    // Get pools to shut down
    const poolsToShutdown: ConnectionPool[] = [];
    if (exchangeId) {
      const poolKey = this.getPoolKey(tenantId, exchangeId);
      const pool = this.pools.get(poolKey);
      if (pool) {
        poolsToShutdown.push(pool);
        this.shuttingDown.add(poolKey);
      }
    } else {
      // Shut down all pools for tenant
      this.pools.forEach((pool, key) => {
        if (key.startsWith(`${tenantId}:`)) {
          poolsToShutdown.push(pool);
          this.shuttingDown.add(key);
        }
      });
    }

    // Emit shutdown started event
    this.emit('shutdownStarted', { tenantId, exchangeId });

    // Wait for in-flight requests to complete
    const inFlightForPools = this.getInFlightRequestsForPools(poolsToShutdown);
    if (inFlightForPools.length > 0) {
      const waitResult = await this.waitForInFlightRequests(
        inFlightForPools,
        timeoutMs
      );
      pendingRequestsCompleted = waitResult.completed;
      pendingRequestsCancelled = waitResult.cancelled;
    }

    // Close all connections in the pools
    for (const pool of poolsToShutdown) {
      for (const connection of [...pool.connections]) {
        await this.closeConnection(connection.connectionId);
        connectionsClosedCount++;
      }

      // Remove pool
      const poolKey = this.getPoolKey(pool.tenantId, pool.exchangeId);
      this.pools.delete(poolKey);
      this.shuttingDown.delete(poolKey);
    }

    const shutdownTimeMs = Date.now() - startTime;

    this.emit('shutdownCompleted', {
      tenantId,
      exchangeId,
      connectionsClosedCount,
      pendingRequestsCompleted,
      pendingRequestsCancelled,
      shutdownTimeMs,
    });

    return {
      connectionsClosedCount,
      pendingRequestsCompleted,
      pendingRequestsCancelled,
      shutdownTimeMs,
    };
  }

  /**
   * Set reconnection strategy for an exchange
   *
   * @param exchangeId - Exchange identifier
   * @param strategy - Reconnection strategy
   *
   * Requirements: 8.2
   */
  async setReconnectionStrategy(
    exchangeId: ExchangeId,
    strategy: ReconnectionStrategy
  ): Promise<void> {
    this.reconnectionStrategies.set(exchangeId, strategy);
  }

  /**
   * Get reconnection strategy for an exchange
   *
   * @param exchangeId - Exchange identifier
   * @returns Reconnection strategy
   */
  getReconnectionStrategy(exchangeId: ExchangeId): ReconnectionStrategy {
    return this.reconnectionStrategies.get(exchangeId) ?? DEFAULT_RECONNECTION_STRATEGY;
  }

  /**
   * Set quality configuration for an exchange
   *
   * @param exchangeId - Exchange identifier
   * @param config - Quality configuration
   */
  setQualityConfig(exchangeId: ExchangeId, config: ConnectionQualityConfig): void {
    this.qualityConfigs.set(exchangeId, config);
  }

  /**
   * Get quality configuration for an exchange
   *
   * @param exchangeId - Exchange identifier
   * @returns Quality configuration
   */
  getQualityConfig(exchangeId: ExchangeId): ConnectionQualityConfig {
    return this.qualityConfigs.get(exchangeId) ?? DEFAULT_QUALITY_CONFIG;
  }

  /**
   * Check if trading is paused for an exchange
   *
   * @param tenantId - Tenant identifier
   * @param exchangeId - Exchange identifier
   * @returns True if trading is paused
   */
  isTradingPaused(tenantId: string, exchangeId: ExchangeId): boolean {
    return this.tradingPaused.has(`${tenantId}:${exchangeId}`);
  }

  /**
   * Resume trading for an exchange
   *
   * @param tenantId - Tenant identifier
   * @param exchangeId - Exchange identifier
   */
  resumeTrading(tenantId: string, exchangeId: ExchangeId): void {
    this.tradingPaused.delete(`${tenantId}:${exchangeId}`);
    this.emit('tradingResumed', { tenantId, exchangeId });
  }


  /**
   * Register an in-flight request
   *
   * @param connectionId - Connection identifier
   * @returns Request ID and promise
   */
  registerInFlightRequest(connectionId: string): {
    requestId: string;
    complete: () => void;
    fail: (error: unknown) => void;
  } {
    const requestId = generateUUID();
    let resolveFunc: (value: unknown) => void;
    let rejectFunc: (error: unknown) => void;

    const promise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const request: InFlightRequest = {
      requestId,
      connectionId,
      startedAt: new Date().toISOString(),
      promise,
      resolve: resolveFunc!,
      reject: rejectFunc!,
    };

    this.inFlightRequests.set(requestId, request);

    return {
      requestId,
      complete: () => {
        request.resolve(undefined);
        this.inFlightRequests.delete(requestId);
      },
      fail: (error: unknown) => {
        request.reject(error);
        this.inFlightRequests.delete(requestId);
      },
    };
  }

  /**
   * Update connection metrics
   *
   * @param connectionId - Connection identifier
   * @param updates - Partial metrics updates
   */
  updateConnectionMetrics(
    connectionId: string,
    updates: Partial<ConnectionMetrics>
  ): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    Object.assign(connection.metrics, updates);
    connection.lastActivityAt = new Date().toISOString();

    // Check quality thresholds
    const qualityConfig = this.qualityConfigs.get(connection.exchangeId) ?? DEFAULT_QUALITY_CONFIG;
    this.checkAndEmitAlerts(connection, qualityConfig);
  }

  /**
   * Record a successful message
   *
   * @param connectionId - Connection identifier
   * @param latencyMs - Message latency
   */
  recordSuccess(connectionId: string, latencyMs: number): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.metrics.messagesReceived++;
    connection.metrics.latencyMs = latencyMs;

    // Update P95 latency (simplified rolling calculation)
    connection.metrics.latencyP95Ms = Math.max(
      connection.metrics.latencyP95Ms,
      latencyMs * 0.95 + connection.metrics.latencyP95Ms * 0.05
    );

    // Decrease error rate over time
    connection.metrics.errorRate = connection.metrics.errorRate * 0.99;

    connection.lastActivityAt = new Date().toISOString();
  }

  /**
   * Record a failed message
   *
   * @param connectionId - Connection identifier
   * @param error - Error message
   */
  recordError(connectionId: string, error: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Increase error rate
    connection.metrics.errorRate = Math.min(
      1,
      connection.metrics.errorRate + 0.01
    );

    connection.metrics.lastErrorAt = new Date().toISOString();
    connection.metrics.lastError = error;

    connection.lastActivityAt = new Date().toISOString();
  }

  /**
   * Record a reconnection attempt
   *
   * @param connectionId - Connection identifier
   */
  recordReconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.reconnectAttempts++;
    connection.metrics.reconnectionCount++;
    connection.status = 'RECONNECTING';
  }

  /**
   * Mark connection as reconnected
   *
   * @param connectionId - Connection identifier
   */
  markReconnected(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.status = 'CONNECTED';
    connection.connectedAt = new Date().toISOString();
    connection.reconnectAttempts = 0;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Get pool key from tenant and exchange
   */
  private getPoolKey(tenantId: string, exchangeId: ExchangeId): string {
    return `${tenantId}:${exchangeId}`;
  }

  /**
   * Create a new connection pool
   */
  private createPool(tenantId: string, exchangeId: ExchangeId): ConnectionPool {
    const pool: ConnectionPool = {
      exchangeId,
      tenantId,
      connections: [],
      maxConnections: this.defaultMaxConnections,
      activeConnections: 0,
      healthyConnections: 0,
    };

    const poolKey = this.getPoolKey(tenantId, exchangeId);
    this.pools.set(poolKey, pool);

    return pool;
  }

  /**
   * Create initial metrics for a new connection
   */
  private createInitialMetrics(): ConnectionMetrics {
    return {
      uptimeMs: 0,
      latencyMs: 0,
      latencyP95Ms: 0,
      errorRate: 0,
      messagesReceived: 0,
      messagesSent: 0,
      reconnectionCount: 0,
    };
  }

  /**
   * Update pool statistics
   */
  private updatePoolStats(pool: ConnectionPool): void {
    const qualityConfig = this.qualityConfigs.get(pool.exchangeId) ?? DEFAULT_QUALITY_CONFIG;

    pool.activeConnections = pool.connections.filter(
      (c) => c.status === 'CONNECTED'
    ).length;

    pool.healthyConnections = pool.connections.filter(
      (c) => c.status === 'CONNECTED' && this.isConnectionHealthy(c, qualityConfig)
    ).length;
  }

  /**
   * Check if a connection is healthy
   */
  private isConnectionHealthy(
    connection: Connection,
    config: ConnectionQualityConfig
  ): boolean {
    if (connection.status !== 'CONNECTED') {
      return false;
    }

    if (connection.metrics.latencyMs > config.maxLatencyMs) {
      return false;
    }

    if (connection.metrics.errorRate > config.maxErrorRate) {
      return false;
    }

    return true;
  }

  /**
   * Check and emit alerts for connection quality issues
   */
  private checkAndEmitAlerts(
    connection: Connection,
    config: ConnectionQualityConfig
  ): void {
    if (connection.metrics.latencyMs > config.maxLatencyMs) {
      this.emitAlert({
        alertId: generateUUID(),
        type: 'HIGH_LATENCY',
        exchangeId: connection.exchangeId,
        connectionId: connection.connectionId,
        message: `Connection ${connection.connectionId} has high latency`,
        value: connection.metrics.latencyMs,
        threshold: config.maxLatencyMs,
        timestamp: new Date().toISOString(),
      });
    }

    if (connection.metrics.errorRate > config.maxErrorRate) {
      this.emitAlert({
        alertId: generateUUID(),
        type: 'HIGH_ERROR_RATE',
        exchangeId: connection.exchangeId,
        connectionId: connection.connectionId,
        message: `Connection ${connection.connectionId} has high error rate`,
        value: connection.metrics.errorRate,
        threshold: config.maxErrorRate,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Emit an alert
   */
  private emitAlert(alert: ConnectionAlert): void {
    this.emit('alert', alert);
  }

  /**
   * Get default endpoint for exchange and connection type
   */
  private getDefaultEndpoint(exchangeId: ExchangeId, type: ConnectionType): string {
    const endpoints: Record<ExchangeId, Record<ConnectionType, string>> = {
      BINANCE: {
        REST: 'https://api.binance.com',
        WEBSOCKET: 'wss://stream.binance.com:9443',
        FIX: 'fix.binance.com:4567',
      },
      COINBASE: {
        REST: 'https://api.coinbase.com',
        WEBSOCKET: 'wss://ws-feed.exchange.coinbase.com',
        FIX: 'fix.exchange.coinbase.com:4198',
      },
      KRAKEN: {
        REST: 'https://api.kraken.com',
        WEBSOCKET: 'wss://ws.kraken.com',
        FIX: 'fix.kraken.com:4567',
      },
      OKX: {
        REST: 'https://www.okx.com',
        WEBSOCKET: 'wss://ws.okx.com:8443',
        FIX: 'fix.okx.com:4567',
      },
      BSDEX: {
        REST: 'https://api.bsdex.de',
        WEBSOCKET: 'wss://ws.bsdex.de',
        FIX: 'fix.bsdex.de:4567',
      },
      BISON: {
        REST: 'https://api.bisonapp.com',
        WEBSOCKET: 'wss://ws.bisonapp.com',
        FIX: 'fix.bisonapp.com:4567',
      },
      FINOA: {
        REST: 'https://api.finoa.io',
        WEBSOCKET: 'wss://ws.finoa.io',
        FIX: 'fix.finoa.io:4567',
      },
      BYBIT: {
        REST: 'https://api.bybit.com',
        WEBSOCKET: 'wss://stream.bybit.com',
        FIX: 'fix.bybit.com:4567',
      },
    };

    return endpoints[exchangeId]?.[type] ?? `https://api.${exchangeId.toLowerCase()}.com`;
  }

  /**
   * Start metrics tracking for a connection
   */
  private startMetricsTracking(connection: Connection): void {
    const intervalId = setInterval(() => {
      if (connection.connectedAt) {
        connection.metrics.uptimeMs =
          Date.now() - new Date(connection.connectedAt).getTime();
      }
    }, 1000);

    this.metricsIntervals.set(connection.connectionId, intervalId);
  }

  /**
   * Stop metrics tracking for a connection
   */
  private stopMetricsTracking(connectionId: string): void {
    const intervalId = this.metricsIntervals.get(connectionId);
    if (intervalId) {
      clearInterval(intervalId);
      this.metricsIntervals.delete(connectionId);
    }
  }

  /**
   * Get in-flight requests for pools
   */
  private getInFlightRequestsForPools(pools: ConnectionPool[]): InFlightRequest[] {
    const connectionIds = new Set<string>();
    for (const pool of pools) {
      for (const connection of pool.connections) {
        connectionIds.add(connection.connectionId);
      }
    }

    const requests: InFlightRequest[] = [];
    this.inFlightRequests.forEach((request) => {
      if (connectionIds.has(request.connectionId)) {
        requests.push(request);
      }
    });

    return requests;
  }

  /**
   * Wait for in-flight requests to complete
   */
  private async waitForInFlightRequests(
    requests: InFlightRequest[],
    timeoutMs: number
  ): Promise<{ completed: number; cancelled: number }> {
    let completed = 0;
    let cancelled = 0;

    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

    const waitPromises = requests.map(async (request) => {
      try {
        await Promise.race([request.promise, timeout]);
        completed++;
      } catch {
        // Request failed or was cancelled
        cancelled++;
      }
    });

    await Promise.race([
      Promise.all(waitPromises),
      timeout.then(() => {
        // Timeout reached, cancel remaining requests
        for (const request of requests) {
          if (this.inFlightRequests.has(request.requestId)) {
            request.reject(new Error('Shutdown timeout'));
            this.inFlightRequests.delete(request.requestId);
            cancelled++;
          }
        }
      }),
    ]);

    return { completed, cancelled };
  }

  /**
   * Get connection by ID
   */
  getConnection_byId(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections for a tenant
   */
  getAllConnections(tenantId: string): Connection[] {
    const connections: Connection[] = [];
    this.connections.forEach((connection) => {
      if (connection.tenantId === tenantId) {
        connections.push(connection);
      }
    });
    return connections;
  }

  /**
   * Check if shutting down
   */
  isShuttingDown(tenantId: string, exchangeId: ExchangeId): boolean {
    return this.shuttingDown.has(this.getPoolKey(tenantId, exchangeId));
  }

  /**
   * Get in-flight request count
   */
  getInFlightRequestCount(): number {
    return this.inFlightRequests.size;
  }
}

/**
 * Error thrown by connection manager operations
 */
export class ConnectionManagerError extends Error {
  constructor(
    message: string,
    public readonly exchangeId: ExchangeId,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ConnectionManagerError';
  }
}

/**
 * Singleton instance for convenience
 */
export const connectionManager = new ExchangeConnectionManager();
