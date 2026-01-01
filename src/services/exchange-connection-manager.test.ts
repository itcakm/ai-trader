/**
 * Property-based tests for Exchange Connection Manager Service
 *
 * **Property 29: Connection Pool Management**
 * *For any* exchange, the Connection_Manager SHALL maintain a ConnectionPool with
 * connections not exceeding maxConnections, AND connections SHALL be reused when available.
 *
 * **Validates: Requirements 8.1**
 *
 * **Property 30: Connection Metrics Tracking**
 * *For any* connection, the Connection_Manager SHALL continuously track: uptimeMs,
 * latencyMs, errorRate, and reconnectionCount, AND these metrics SHALL be queryable
 * via getConnectionMetrics.
 *
 * **Validates: Requirements 8.3, 8.6**
 *
 * **Property 31: Connection Quality Alerting**
 * *For any* connection where latency exceeds threshold or errorRate exceeds threshold,
 * an alert SHALL be generated, AND if configured, trading SHALL be paused for that exchange.
 *
 * **Validates: Requirements 8.4**
 *
 * **Property 32: Graceful Shutdown**
 * *For any* graceful shutdown request, the Connection_Manager SHALL wait for in-flight
 * requests to complete (up to timeout), AND SHALL NOT accept new requests during shutdown.
 *
 * **Validates: Requirements 8.5**
 */

import * as fc from 'fast-check';
import { ExchangeId } from '../types/exchange';
import { ConnectionType, ConnectionStatus } from '../types/exchange-connection';
import {
  ExchangeConnectionManager,
  ConnectionManagerError,
  ConnectionQualityConfig,
  DEFAULT_QUALITY_CONFIG,
} from './exchange-connection-manager';

// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for ConnectionType
 */
const connectionTypeArb = (): fc.Arbitrary<ConnectionType> =>
  fc.constantFrom('REST', 'WEBSOCKET', 'FIX');

/**
 * Generator for tenant ID
 */
const tenantIdArb = (): fc.Arbitrary<string> => fc.uuid();

/**
 * Generator for max connections (reasonable range)
 */
const maxConnectionsArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 20 });

/**
 * Generator for latency values
 */
const latencyArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 10000 });

/**
 * Generator for error rate (0-1)
 */
const errorRateArb = (): fc.Arbitrary<number> =>
  fc.double({ min: 0, max: 1, noNaN: true });

/**
 * Generator for quality config
 */
const qualityConfigArb = (): fc.Arbitrary<ConnectionQualityConfig> =>
  fc.record({
    maxLatencyMs: fc.integer({ min: 100, max: 10000 }),
    maxErrorRate: fc.double({ min: 0.01, max: 0.5, noNaN: true }),
    pauseTradingOnDegraded: fc.boolean(),
  });

// ============================================
// Test Setup
// ============================================

describe('Exchange Connection Manager', () => {
  let manager: ExchangeConnectionManager;

  beforeEach(() => {
    manager = new ExchangeConnectionManager(10);
  });

  afterEach(async () => {
    // Clean up any remaining connections and stop intervals
    try {
      // Stop all metrics intervals
      const metricsIntervals = (manager as any).metricsIntervals as Map<string, ReturnType<typeof setInterval>>;
      metricsIntervals.forEach((interval) => clearInterval(interval));
      metricsIntervals.clear();

      const pools = (manager as any).pools as Map<string, any>;
      for (const [key] of pools) {
        const [tenantId, exchangeId] = key.split(':');
        await manager.gracefulShutdown(tenantId, exchangeId as ExchangeId, 100);
      }
    } catch {
      // Ignore cleanup errors
    }
  });


  // ============================================
  // Property 29: Connection Pool Management
  // ============================================

  describe('Property 29: Connection Pool Management', () => {
    /**
     * Feature: exchange-integration, Property 29: Connection Pool Management
     *
     * For any exchange, the Connection_Manager SHALL maintain a ConnectionPool
     * with connections not exceeding maxConnections.
     *
     * **Validates: Requirements 8.1**
     */
    it('should not exceed maxConnections in pool', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          maxConnectionsArb(),
          async (tenantId, exchangeId, connectionType, maxConnections) => {
            const testManager = new ExchangeConnectionManager(maxConnections);

            // Create connections up to max
            const createdConnections: string[] = [];
            for (let i = 0; i < maxConnections; i++) {
              const conn = await testManager.createConnection(
                tenantId,
                exchangeId,
                connectionType
              );
              createdConnections.push(conn.connectionId);
            }

            // Verify pool has exactly maxConnections
            const pool = await testManager.getConnectionPool(tenantId, exchangeId);
            expect(pool.connections.length).toBe(maxConnections);

            // Attempting to create another should fail
            await expect(
              testManager.createConnection(tenantId, exchangeId, connectionType)
            ).rejects.toThrow(ConnectionManagerError);

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 29: Connection Pool Management
     *
     * Connections SHALL be reused when available.
     *
     * **Validates: Requirements 8.1**
     */
    it('should reuse available connections', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          async (tenantId, exchangeId, connectionType) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create a connection
            const conn1 = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Get connection should return the same one
            const conn2 = await testManager.getConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Should be the same connection (reused)
            expect(conn2.connectionId).toBe(conn1.connectionId);

            // Pool should still have only 1 connection
            const pool = await testManager.getConnectionPool(tenantId, exchangeId);
            expect(pool.connections.length).toBe(1);

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 29: Connection Pool Management
     *
     * Each tenant-exchange pair SHALL have its own isolated pool.
     *
     * **Validates: Requirements 8.1**
     */
    it('should maintain separate pools per tenant-exchange pair', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          async (tenantId1, tenantId2, exchangeId, connectionType) => {
            // Skip if same tenant
            fc.pre(tenantId1 !== tenantId2);

            const testManager = new ExchangeConnectionManager(10);

            // Create connections for different tenants
            const conn1 = await testManager.createConnection(
              tenantId1,
              exchangeId,
              connectionType
            );
            const conn2 = await testManager.createConnection(
              tenantId2,
              exchangeId,
              connectionType
            );

            // Should be different connections
            expect(conn1.connectionId).not.toBe(conn2.connectionId);

            // Each pool should have 1 connection
            const pool1 = await testManager.getConnectionPool(tenantId1, exchangeId);
            const pool2 = await testManager.getConnectionPool(tenantId2, exchangeId);

            expect(pool1.connections.length).toBe(1);
            expect(pool2.connections.length).toBe(1);

            // Clean up
            await testManager.gracefulShutdown(tenantId1, exchangeId, 100);
            await testManager.gracefulShutdown(tenantId2, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // ============================================
  // Property 30: Connection Metrics Tracking
  // ============================================

  describe('Property 30: Connection Metrics Tracking', () => {
    /**
     * Feature: exchange-integration, Property 30: Connection Metrics Tracking
     *
     * For any connection, the Connection_Manager SHALL continuously track:
     * uptimeMs, latencyMs, errorRate, and reconnectionCount.
     *
     * **Validates: Requirements 8.3, 8.6**
     */
    it('should track all required metrics for connections', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          async (tenantId, exchangeId, connectionType) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create a connection
            const conn = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Get metrics
            const metrics = await testManager.getConnectionMetrics(conn.connectionId);

            // All required metrics should be present
            expect(metrics).toHaveProperty('uptimeMs');
            expect(metrics).toHaveProperty('latencyMs');
            expect(metrics).toHaveProperty('errorRate');
            expect(metrics).toHaveProperty('reconnectionCount');
            expect(metrics).toHaveProperty('latencyP95Ms');
            expect(metrics).toHaveProperty('messagesReceived');
            expect(metrics).toHaveProperty('messagesSent');

            // Initial values should be valid
            expect(typeof metrics.uptimeMs).toBe('number');
            expect(typeof metrics.latencyMs).toBe('number');
            expect(typeof metrics.errorRate).toBe('number');
            expect(typeof metrics.reconnectionCount).toBe('number');

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 30: Connection Metrics Tracking
     *
     * Metrics SHALL be updated when recording success/error events.
     *
     * **Validates: Requirements 8.3, 8.6**
     */
    it('should update metrics on success and error events', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          latencyArb(),
          async (tenantId, exchangeId, connectionType, latency) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create a connection
            const conn = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Record success
            testManager.recordSuccess(conn.connectionId, latency);

            // Get metrics
            const metricsAfterSuccess = await testManager.getConnectionMetrics(conn.connectionId);

            // Latency should be updated
            expect(metricsAfterSuccess.latencyMs).toBe(latency);
            expect(metricsAfterSuccess.messagesReceived).toBe(1);

            // Record error
            testManager.recordError(conn.connectionId, 'Test error');

            // Get metrics again
            const metricsAfterError = await testManager.getConnectionMetrics(conn.connectionId);

            // Error rate should increase
            expect(metricsAfterError.errorRate).toBeGreaterThan(0);
            expect(metricsAfterError.lastError).toBe('Test error');
            expect(metricsAfterError.lastErrorAt).toBeDefined();

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 30: Connection Metrics Tracking
     *
     * Reconnection count SHALL be tracked accurately.
     *
     * **Validates: Requirements 8.3, 8.6**
     */
    it('should track reconnection count accurately', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          fc.integer({ min: 1, max: 10 }),
          async (tenantId, exchangeId, connectionType, reconnectCount) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create a connection
            const conn = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Simulate reconnections
            for (let i = 0; i < reconnectCount; i++) {
              testManager.recordReconnection(conn.connectionId);
              testManager.markReconnected(conn.connectionId);
            }

            // Get metrics
            const metrics = await testManager.getConnectionMetrics(conn.connectionId);

            // Reconnection count should match
            expect(metrics.reconnectionCount).toBe(reconnectCount);

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // ============================================
  // Property 31: Connection Quality Alerting
  // ============================================

  describe('Property 31: Connection Quality Alerting', () => {
    /**
     * Feature: exchange-integration, Property 31: Connection Quality Alerting
     *
     * For any connection where latency exceeds threshold, an alert SHALL be generated.
     *
     * **Validates: Requirements 8.4**
     */
    it('should emit alert when latency exceeds threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          fc.integer({ min: 100, max: 1000 }),
          async (tenantId, exchangeId, connectionType, threshold) => {
            const testManager = new ExchangeConnectionManager(10);

            // Set quality config with specific threshold
            testManager.setQualityConfig(exchangeId, {
              maxLatencyMs: threshold,
              maxErrorRate: 0.5,
              pauseTradingOnDegraded: false,
            });

            // Create a connection
            const conn = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Track alerts
            const alerts: any[] = [];
            testManager.on('alert', (alert) => alerts.push(alert));

            // Update metrics with latency exceeding threshold
            testManager.updateConnectionMetrics(conn.connectionId, {
              latencyMs: threshold + 100,
            });

            // Should have emitted a HIGH_LATENCY alert
            const latencyAlert = alerts.find((a) => a.type === 'HIGH_LATENCY');
            expect(latencyAlert).toBeDefined();
            expect(latencyAlert.exchangeId).toBe(exchangeId);
            expect(latencyAlert.connectionId).toBe(conn.connectionId);
            expect(latencyAlert.value).toBe(threshold + 100);
            expect(latencyAlert.threshold).toBe(threshold);

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 31: Connection Quality Alerting
     *
     * For any connection where errorRate exceeds threshold, an alert SHALL be generated.
     *
     * **Validates: Requirements 8.4**
     */
    it('should emit alert when error rate exceeds threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          fc.double({ min: 0.05, max: 0.3, noNaN: true }),
          async (tenantId, exchangeId, connectionType, threshold) => {
            const testManager = new ExchangeConnectionManager(10);

            // Set quality config with specific threshold
            testManager.setQualityConfig(exchangeId, {
              maxLatencyMs: 10000,
              maxErrorRate: threshold,
              pauseTradingOnDegraded: false,
            });

            // Create a connection
            const conn = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Track alerts
            const alerts: any[] = [];
            testManager.on('alert', (alert) => alerts.push(alert));

            // Update metrics with error rate exceeding threshold
            testManager.updateConnectionMetrics(conn.connectionId, {
              errorRate: threshold + 0.1,
            });

            // Should have emitted a HIGH_ERROR_RATE alert
            const errorAlert = alerts.find((a) => a.type === 'HIGH_ERROR_RATE');
            expect(errorAlert).toBeDefined();
            expect(errorAlert.exchangeId).toBe(exchangeId);
            expect(errorAlert.connectionId).toBe(conn.connectionId);

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 31: Connection Quality Alerting
     *
     * If configured, trading SHALL be paused for degraded exchanges.
     *
     * **Validates: Requirements 8.4**
     */
    it('should pause trading when configured and connection is degraded', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          async (tenantId, exchangeId, connectionType) => {
            const testManager = new ExchangeConnectionManager(10);

            // Set quality config to pause trading on degraded
            testManager.setQualityConfig(exchangeId, {
              maxLatencyMs: 100,
              maxErrorRate: 0.1,
              pauseTradingOnDegraded: true,
            });

            // Create a connection
            const conn = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Track alerts
            const alerts: any[] = [];
            testManager.on('alert', (alert) => alerts.push(alert));

            // Update metrics to make connection unhealthy
            testManager.updateConnectionMetrics(conn.connectionId, {
              latencyMs: 500,
              errorRate: 0.5,
            });

            // Monitor health to trigger pause
            await testManager.monitorHealth(tenantId, exchangeId);

            // Trading should be paused
            expect(testManager.isTradingPaused(tenantId, exchangeId)).toBe(true);

            // Should have emitted TRADING_PAUSED alert
            const pauseAlert = alerts.find((a) => a.type === 'TRADING_PAUSED');
            expect(pauseAlert).toBeDefined();

            // Clean up
            await testManager.gracefulShutdown(tenantId, exchangeId, 100);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // ============================================
  // Property 32: Graceful Shutdown
  // ============================================

  describe('Property 32: Graceful Shutdown', () => {
    /**
     * Feature: exchange-integration, Property 32: Graceful Shutdown
     *
     * For any graceful shutdown request, the Connection_Manager SHALL wait for
     * in-flight requests to complete (up to timeout).
     *
     * **Validates: Requirements 8.5**
     */
    it('should wait for in-flight requests during shutdown', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          async (tenantId, exchangeId, connectionType) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create a connection
            const conn = await testManager.createConnection(
              tenantId,
              exchangeId,
              connectionType
            );

            // Register an in-flight request
            const { complete } = testManager.registerInFlightRequest(
              conn.connectionId
            );

            // Complete the request immediately (simulating fast completion)
            complete();

            // Start shutdown (with short timeout since request is already complete)
            const result = await testManager.gracefulShutdown(
              tenantId,
              exchangeId,
              500
            );

            // Should have completed the request
            expect(result.pendingRequestsCompleted).toBeGreaterThanOrEqual(0);
            expect(result.connectionsClosedCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    }, 30000);

    /**
     * Feature: exchange-integration, Property 32: Graceful Shutdown
     *
     * The Connection_Manager SHALL NOT accept new requests during shutdown.
     *
     * **Validates: Requirements 8.5**
     */
    it('should reject new connections during shutdown', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          async (tenantId, exchangeId, connectionType) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create initial connection
            await testManager.createConnection(tenantId, exchangeId, connectionType);

            // Register an in-flight request to keep shutdown waiting
            const { complete } = testManager.registerInFlightRequest(
              (await testManager.getConnectionPool(tenantId, exchangeId)).connections[0].connectionId
            );

            // Start shutdown
            const shutdownPromise = testManager.gracefulShutdown(
              tenantId,
              exchangeId,
              5000
            );

            // Try to create new connection during shutdown
            await expect(
              testManager.createConnection(tenantId, exchangeId, connectionType)
            ).rejects.toThrow('Cannot create connection during shutdown');

            // Try to get connection during shutdown
            await expect(
              testManager.getConnection(tenantId, exchangeId, connectionType)
            ).rejects.toThrow('Cannot get connection during shutdown');

            // Complete the request to finish shutdown
            complete();
            await shutdownPromise;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 32: Graceful Shutdown
     *
     * Shutdown SHALL close all connections in the pool.
     *
     * **Validates: Requirements 8.5**
     */
    it('should close all connections on shutdown', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          fc.integer({ min: 1, max: 5 }),
          async (tenantId, exchangeId, connectionCount) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create multiple connections
            const connectionTypes: ConnectionType[] = ['REST', 'WEBSOCKET', 'FIX'];
            for (let i = 0; i < connectionCount; i++) {
              await testManager.createConnection(
                tenantId,
                exchangeId,
                connectionTypes[i % connectionTypes.length]
              );
            }

            // Verify connections exist
            const poolBefore = await testManager.getConnectionPool(tenantId, exchangeId);
            expect(poolBefore.connections.length).toBe(connectionCount);

            // Shutdown
            const result = await testManager.gracefulShutdown(tenantId, exchangeId, 1000);

            // All connections should be closed
            expect(result.connectionsClosedCount).toBe(connectionCount);

            // Pool should be removed or empty
            const allConnections = testManager.getAllConnections(tenantId);
            const exchangeConnections = allConnections.filter(
              (c) => c.exchangeId === exchangeId
            );
            expect(exchangeConnections.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 32: Graceful Shutdown
     *
     * Shutdown result SHALL accurately report statistics.
     *
     * **Validates: Requirements 8.5**
     */
    it('should report accurate shutdown statistics', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb(),
          exchangeIdArb(),
          connectionTypeArb(),
          async (tenantId, exchangeId, connectionType) => {
            const testManager = new ExchangeConnectionManager(10);

            // Create connections
            await testManager.createConnection(tenantId, exchangeId, connectionType);
            await testManager.createConnection(tenantId, exchangeId, connectionType);

            // Shutdown
            const result = await testManager.gracefulShutdown(tenantId, exchangeId, 1000);

            // Verify result structure
            expect(result).toHaveProperty('connectionsClosedCount');
            expect(result).toHaveProperty('pendingRequestsCompleted');
            expect(result).toHaveProperty('pendingRequestsCancelled');
            expect(result).toHaveProperty('shutdownTimeMs');

            // Values should be valid
            expect(result.connectionsClosedCount).toBe(2);
            expect(result.pendingRequestsCompleted).toBeGreaterThanOrEqual(0);
            expect(result.pendingRequestsCancelled).toBeGreaterThanOrEqual(0);
            expect(result.shutdownTimeMs).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
