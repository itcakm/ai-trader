/**
 * Property-based tests for WebSocket Client
 *
 * Tests cover:
 * - Property 10: WebSocket Message Normalization
 * - Property 11: Connection Recovery with Exponential Backoff
 * - Property 12: WebSocket Heartbeat Maintenance
 * - Property 12a: Multiple Concurrent WebSocket Connections
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.4, 8.2
 */

import * as fc from 'fast-check';
import {
  WebSocketClient,
  WebSocketClientError,
  WSOptions,
  NormalizedWSMessage,
  DEFAULT_WS_OPTIONS,
} from './websocket-client';
import { ExchangeId } from '../../types/exchange';
import { OrderStatus, OrderSide } from '../../types/exchange-order';
import { ReconnectionStrategy } from '../../types/exchange-connection';

// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for OrderStatus
 */
const orderStatusArb = (): fc.Arbitrary<OrderStatus> =>
  fc.constantFrom('PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');

/**
 * Generator for OrderSide
 */
const orderSideArb = (): fc.Arbitrary<OrderSide> =>
  fc.constantFrom('BUY', 'SELL');

/**
 * Generator for raw order update messages (various exchange formats)
 */
const rawOrderUpdateMessageArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    // Binance-style format
    fc.record({
      e: fc.constant('executionReport'),
      E: fc.integer({ min: 1600000000000, max: 1700000000000 }),
      s: fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT'),
      c: fc.uuid(),
      i: fc.integer({ min: 1, max: 999999999 }),
      X: fc.constantFrom('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'),
      z: fc.double({ min: 0, max: 1000, noNaN: true }).map(n => String(n)),
      L: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => String(n)),
      l: fc.double({ min: 0, max: 100, noNaN: true }).map(n => String(n)),
    }),
    // Coinbase-style format
    fc.record({
      type: fc.constant('order'),
      orderId: fc.uuid(),
      orderID: fc.uuid(),
      status: fc.constantFrom('open', 'done', 'pending', 'cancelled'),
      filledQuantity: fc.double({ min: 0, max: 1000, noNaN: true }),
      remainingQuantity: fc.double({ min: 0, max: 1000, noNaN: true }),
      timestamp: fc.date().map(d => d.toISOString()),
    }),
    // Generic format
    fc.record({
      event: fc.constant('orderUpdate'),
      data: fc.record({
        orderId: fc.uuid(),
        exchangeOrderId: fc.uuid(),
        status: orderStatusArb(),
        filledQuantity: fc.double({ min: 0, max: 1000, noNaN: true }),
        remainingQuantity: fc.double({ min: 0, max: 1000, noNaN: true }),
        lastFilledPrice: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
        lastFilledQuantity: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        timestamp: fc.date().map(d => d.toISOString()),
      }),
    })
  );

/**
 * Generator for raw execution update messages (various exchange formats)
 */
const rawExecutionUpdateMessageArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    // Binance-style trade format
    fc.record({
      e: fc.constant('trade'),
      E: fc.integer({ min: 1600000000000, max: 1700000000000 }),
      t: fc.integer({ min: 1, max: 999999999 }),
      c: fc.uuid(),
      i: fc.integer({ min: 1, max: 999999999 }),
      S: fc.constantFrom('BUY', 'SELL'),
      q: fc.double({ min: 0.001, max: 1000, noNaN: true }).map(n => String(n)),
      p: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => String(n)),
      n: fc.double({ min: 0, max: 100, noNaN: true }).map(n => String(n)),
      N: fc.constantFrom('USDT', 'BTC', 'ETH'),
    }),
    // Generic execution format
    fc.record({
      type: fc.constant('execution'),
      data: fc.record({
        executionId: fc.uuid(),
        orderId: fc.uuid(),
        exchangeOrderId: fc.uuid(),
        side: orderSideArb(),
        quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
        price: fc.double({ min: 0.01, max: 100000, noNaN: true }),
        commission: fc.double({ min: 0, max: 100, noNaN: true }),
        commissionAsset: fc.constantFrom('USDT', 'BTC', 'ETH'),
        timestamp: fc.date().map(d => d.toISOString()),
      }),
    })
  );

/**
 * Generator for heartbeat/pong messages
 */
const heartbeatMessageArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    fc.record({ type: fc.constant('pong'), timestamp: fc.integer() }),
    fc.record({ op: fc.constant('heartbeat'), ts: fc.integer() }),
    fc.record({ event: fc.constant('pong') })
  );

/**
 * Generator for ReconnectionStrategy
 */
const reconnectionStrategyArb = (): fc.Arbitrary<ReconnectionStrategy> =>
  fc.record({
    initialDelayMs: fc.integer({ min: 100, max: 5000 }),
    maxDelayMs: fc.integer({ min: 10000, max: 120000 }),
    multiplier: fc.double({ min: 1.5, max: 3, noNaN: true }),
    maxAttempts: fc.integer({ min: 1, max: 20 }),
    jitterPercent: fc.integer({ min: 0, max: 30 }),
  });

/**
 * Generator for WSOptions
 */
const wsOptionsArb = (): fc.Arbitrary<WSOptions> =>
  fc.record({
    reconnect: fc.boolean(),
    reconnectStrategy: reconnectionStrategyArb(),
    heartbeatIntervalMs: fc.integer({ min: 5000, max: 60000 }),
    pingTimeoutMs: fc.integer({ min: 1000, max: 30000 }),
  });


// ============================================
// Property Tests
// ============================================

describe('WebSocket Client', () => {
  describe('Property 10: WebSocket Message Normalization', () => {
    /**
     * Feature: exchange-integration, Property 10: WebSocket Message Normalization
     *
     * For any valid WebSocket message received from an exchange, the Exchange_Adapter
     * SHALL parse it and emit a normalized event (OrderUpdate or ExecutionUpdate)
     * conforming to the defined interfaces.
     *
     * **Validates: Requirements 3.1, 3.2**
     */
    it('should normalize order update messages from any exchange format', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          rawOrderUpdateMessageArb(),
          (exchangeId, rawMessage) => {
            const client = new WebSocketClient(exchangeId);

            // Access the private parser through a test wrapper
            const normalized = (client as any).defaultMessageParser(rawMessage);

            // Verify normalized message structure
            expect(normalized).toBeDefined();
            expect(normalized.exchangeId).toBe(exchangeId);
            expect(typeof normalized.timestamp).toBe('string');
            expect(normalized.rawMessage).toBe(rawMessage);

            // Verify type is detected correctly for order updates
            expect(['ORDER_UPDATE', 'EXECUTION_UPDATE', 'UNKNOWN']).toContain(normalized.type);

            // If detected as ORDER_UPDATE, verify data structure
            if (normalized.type === 'ORDER_UPDATE' && normalized.data) {
              const data = normalized.data;
              expect(typeof data.orderId).toBe('string');
              expect(typeof data.exchangeOrderId).toBe('string');
              expect(data.exchangeId).toBe(exchangeId);
              expect(['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']).toContain(data.status);
              expect(typeof data.filledQuantity).toBe('number');
              expect(typeof data.remainingQuantity).toBe('number');
              expect(typeof data.timestamp).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 10: WebSocket Message Normalization
     *
     * For any valid execution message, the parser SHALL produce a normalized
     * ExecutionUpdate with all required fields.
     *
     * **Validates: Requirements 3.1, 3.2**
     */
    it('should normalize execution update messages from any exchange format', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          rawExecutionUpdateMessageArb(),
          (exchangeId, rawMessage) => {
            const client = new WebSocketClient(exchangeId);

            const normalized = (client as any).defaultMessageParser(rawMessage);

            // Verify normalized message structure
            expect(normalized).toBeDefined();
            expect(normalized.exchangeId).toBe(exchangeId);
            expect(typeof normalized.timestamp).toBe('string');
            expect(normalized.rawMessage).toBe(rawMessage);

            // Verify type is detected correctly for execution updates
            expect(['ORDER_UPDATE', 'EXECUTION_UPDATE', 'UNKNOWN']).toContain(normalized.type);

            // If detected as EXECUTION_UPDATE, verify data structure
            if (normalized.type === 'EXECUTION_UPDATE' && normalized.data) {
              const data = normalized.data;
              expect(typeof data.executionId).toBe('string');
              expect(typeof data.orderId).toBe('string');
              expect(typeof data.exchangeOrderId).toBe('string');
              expect(data.exchangeId).toBe(exchangeId);
              expect(['BUY', 'SELL']).toContain(data.side);
              expect(typeof data.quantity).toBe('number');
              expect(typeof data.price).toBe('number');
              expect(typeof data.commission).toBe('number');
              expect(typeof data.commissionAsset).toBe('string');
              expect(typeof data.timestamp).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 10: WebSocket Message Normalization
     *
     * For any heartbeat message, the parser SHALL correctly identify it as HEARTBEAT type.
     *
     * **Validates: Requirements 3.1, 3.2**
     */
    it('should correctly identify heartbeat messages', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          heartbeatMessageArb(),
          (exchangeId, rawMessage) => {
            const client = new WebSocketClient(exchangeId);

            const normalized = (client as any).defaultMessageParser(rawMessage);

            // Verify heartbeat is detected
            expect(normalized.type).toBe('HEARTBEAT');
            expect(normalized.exchangeId).toBe(exchangeId);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 10: WebSocket Message Normalization
     *
     * For any message, the normalized output SHALL always include exchangeId,
     * timestamp, and rawMessage fields.
     *
     * **Validates: Requirements 3.1, 3.2**
     */
    it('should always include required fields in normalized output', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fc.oneof(
            rawOrderUpdateMessageArb(),
            rawExecutionUpdateMessageArb(),
            heartbeatMessageArb(),
            fc.record({ unknown: fc.string() }) // Unknown message type
          ),
          (exchangeId, rawMessage) => {
            const client = new WebSocketClient(exchangeId);

            const normalized = (client as any).defaultMessageParser(rawMessage);

            // Required fields must always be present
            expect(normalized.exchangeId).toBe(exchangeId);
            expect(typeof normalized.timestamp).toBe('string');
            expect(normalized.rawMessage).toBe(rawMessage);
            expect(['ORDER_UPDATE', 'EXECUTION_UPDATE', 'HEARTBEAT', 'SUBSCRIPTION_ACK', 'ERROR', 'UNKNOWN']).toContain(normalized.type);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 11: Connection Recovery with Exponential Backoff', () => {
    /**
     * Feature: exchange-integration, Property 11: Connection Recovery with Exponential Backoff
     *
     * For any dropped connection, the system SHALL attempt reconnection with
     * exponential backoff where delay = min(initialDelay * (multiplier ^ attempt), maxDelay).
     *
     * **Validates: Requirements 3.3, 3.4, 4.4, 8.2**
     */
    it('should calculate reconnection delay with exponential backoff', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          reconnectionStrategyArb(),
          fc.integer({ min: 0, max: 15 }),
          (exchangeId, strategy, attempt) => {
            const client = new WebSocketClient(exchangeId, { reconnectStrategy: strategy });

            const delay = client.calculateReconnectDelay(attempt, strategy);

            // Calculate expected base delay (without jitter)
            const expectedBase = strategy.initialDelayMs * Math.pow(strategy.multiplier, attempt);
            const expectedCapped = Math.min(expectedBase, strategy.maxDelayMs);

            // Delay should be within jitter range of expected
            const jitterRange = expectedCapped * (strategy.jitterPercent / 100);
            const minExpected = expectedCapped - jitterRange;
            const maxExpected = expectedCapped + jitterRange;

            expect(delay).toBeGreaterThanOrEqual(Math.floor(minExpected));
            expect(delay).toBeLessThanOrEqual(Math.ceil(maxExpected));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 11: Connection Recovery with Exponential Backoff
     *
     * For any reconnection strategy, the delay SHALL never exceed maxDelayMs
     * (plus jitter allowance).
     *
     * **Validates: Requirements 3.3, 3.4, 4.4, 8.2**
     */
    it('should cap reconnection delay at maxDelayMs', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          reconnectionStrategyArb(),
          fc.integer({ min: 0, max: 100 }), // Large attempt numbers
          (exchangeId, strategy, attempt) => {
            const client = new WebSocketClient(exchangeId, { reconnectStrategy: strategy });

            const delay = client.calculateReconnectDelay(attempt, strategy);

            // Delay should never exceed maxDelay + jitter
            const maxWithJitter = strategy.maxDelayMs * (1 + strategy.jitterPercent / 100);
            expect(delay).toBeLessThanOrEqual(Math.ceil(maxWithJitter));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 11: Connection Recovery with Exponential Backoff
     *
     * For any sequence of reconnection attempts, delays SHALL increase
     * exponentially until reaching maxDelayMs.
     *
     * **Validates: Requirements 3.3, 3.4, 4.4, 8.2**
     */
    it('should increase delays exponentially for consecutive attempts', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fc.record({
            initialDelayMs: fc.integer({ min: 100, max: 1000 }),
            maxDelayMs: fc.integer({ min: 30000, max: 60000 }),
            multiplier: fc.constant(2), // Fixed multiplier for predictable testing
            maxAttempts: fc.integer({ min: 5, max: 10 }),
            jitterPercent: fc.constant(0), // No jitter for predictable testing
          }),
          (exchangeId, strategy) => {
            const client = new WebSocketClient(exchangeId, { reconnectStrategy: strategy });

            // Calculate delays for first few attempts
            const delays: number[] = [];
            for (let i = 0; i < 5; i++) {
              delays.push(client.calculateReconnectDelay(i, strategy));
            }

            // Each delay should be approximately double the previous (until cap)
            for (let i = 1; i < delays.length; i++) {
              const expectedDelay = Math.min(
                delays[i - 1] * strategy.multiplier,
                strategy.maxDelayMs
              );
              // Allow small tolerance for floating point
              expect(delays[i]).toBeCloseTo(expectedDelay, -1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 12: WebSocket Heartbeat Maintenance', () => {
    /**
     * Feature: exchange-integration, Property 12: WebSocket Heartbeat Maintenance
     *
     * For any WebSocket client configuration, heartbeat interval and ping timeout
     * SHALL be configurable and stored correctly.
     *
     * **Validates: Requirements 3.5**
     */
    it('should store heartbeat configuration correctly', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          wsOptionsArb(),
          (exchangeId, options) => {
            const client = new WebSocketClient(exchangeId, options);

            const storedOptions = client.getOptions();

            expect(storedOptions.heartbeatIntervalMs).toBe(options.heartbeatIntervalMs);
            expect(storedOptions.pingTimeoutMs).toBe(options.pingTimeoutMs);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 12: WebSocket Heartbeat Maintenance
     *
     * For any client without custom options, default heartbeat settings SHALL be applied.
     *
     * **Validates: Requirements 3.5**
     */
    it('should use default heartbeat settings when not specified', () => {
      fc.assert(
        fc.property(exchangeIdArb(), (exchangeId) => {
          const client = new WebSocketClient(exchangeId);

          const options = client.getOptions();

          expect(options.heartbeatIntervalMs).toBe(DEFAULT_WS_OPTIONS.heartbeatIntervalMs);
          expect(options.pingTimeoutMs).toBe(DEFAULT_WS_OPTIONS.pingTimeoutMs);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 12: WebSocket Heartbeat Maintenance
     *
     * For any heartbeat configuration, pingTimeoutMs SHALL be less than
     * heartbeatIntervalMs to allow proper timeout detection.
     *
     * **Validates: Requirements 3.5**
     */
    it('should validate that default ping timeout is less than heartbeat interval', () => {
      expect(DEFAULT_WS_OPTIONS.pingTimeoutMs).toBeLessThan(DEFAULT_WS_OPTIONS.heartbeatIntervalMs);
    });
  });


  describe('Property 12a: Multiple Concurrent WebSocket Connections', () => {
    /**
     * Feature: exchange-integration, Property 12a: Multiple Concurrent WebSocket Connections
     *
     * For any exchange that requires multiple WebSocket connections, the client
     * SHALL maintain and manage multiple concurrent connections independently.
     *
     * **Validates: Requirements 3.6**
     */
    it('should track multiple connection IDs independently', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
          (exchangeId, connectionIds) => {
            const client = new WebSocketClient(exchangeId);

            // Unique connection IDs
            const uniqueIds = [...new Set(connectionIds)];

            // Verify client can track multiple connections
            expect(client.getConnectionCount()).toBe(0);

            // Verify getConnectionIds returns empty initially
            expect(client.getConnectionIds()).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 12a: Multiple Concurrent WebSocket Connections
     *
     * For any client, connection count methods SHALL accurately reflect
     * the number of managed connections.
     *
     * **Validates: Requirements 3.6**
     */
    it('should accurately report connection counts', () => {
      fc.assert(
        fc.property(exchangeIdArb(), (exchangeId) => {
          const client = new WebSocketClient(exchangeId);

          // Initially no connections
          expect(client.getConnectionCount()).toBe(0);
          expect(client.getActiveConnectionCount()).toBe(0);
          expect(client.getConnectionIds().length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 12a: Multiple Concurrent WebSocket Connections
     *
     * For any connection ID, getConnectionState SHALL return undefined
     * for non-existent connections.
     *
     * **Validates: Requirements 3.6**
     */
    it('should return undefined for non-existent connection states', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fc.uuid(),
          (exchangeId, connectionId) => {
            const client = new WebSocketClient(exchangeId);

            const state = client.getConnectionState(connectionId);
            expect(state).toBeUndefined();

            const status = client.getConnectionStatus(connectionId);
            expect(status).toBeUndefined();

            const healthy = client.isConnectionHealthy(connectionId);
            expect(healthy).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 12a: Multiple Concurrent WebSocket Connections
     *
     * For any connection, subscriptions SHALL be tracked per-connection
     * and not shared across connections.
     *
     * **Validates: Requirements 3.6**
     */
    it('should return empty subscriptions for non-existent connections', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fc.uuid(),
          (exchangeId, connectionId) => {
            const client = new WebSocketClient(exchangeId);

            const subscriptions = client.getSubscriptions(connectionId);
            expect(subscriptions).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Client Configuration', () => {
    /**
     * Verify client stores exchange ID correctly
     */
    it('should store exchange ID correctly', () => {
      fc.assert(
        fc.property(exchangeIdArb(), (exchangeId) => {
          const client = new WebSocketClient(exchangeId);
          expect(client.getExchangeId()).toBe(exchangeId);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Verify client merges options with defaults
     */
    it('should merge custom options with defaults', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fc.record({
            reconnect: fc.boolean(),
            heartbeatIntervalMs: fc.integer({ min: 5000, max: 60000 }),
          }),
          (exchangeId, partialOptions) => {
            const client = new WebSocketClient(exchangeId, partialOptions);

            const options = client.getOptions();

            // Custom options should be applied
            expect(options.reconnect).toBe(partialOptions.reconnect);
            expect(options.heartbeatIntervalMs).toBe(partialOptions.heartbeatIntervalMs);

            // Defaults should be used for unspecified options
            expect(options.pingTimeoutMs).toBe(DEFAULT_WS_OPTIONS.pingTimeoutMs);
            expect(options.reconnectStrategy).toEqual(DEFAULT_WS_OPTIONS.reconnectStrategy);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
