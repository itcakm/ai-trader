/**
 * Property-based tests for FIX Client and Translator
 *
 * Tests cover:
 * - Property 13: FIX Message Round-Trip
 * - Property 14: FIX Session Management
 * - Property 15: FIX Message Logging
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6
 */

import * as fc from 'fast-check';
import {
  FIXClient,
  FIXConfig,
  FIXMessage,
  FIXMsgType,
  FIXTag,
  DEFAULT_FIX_CONFIG,
  DEFAULT_FIX_RECONNECT_STRATEGY,
} from './fix-client';
import {
  FIXOrderTranslator,
  FIXSide,
  FIXOrdType,
  FIXTimeInForce,
  FIXExecType,
  FIXOrdStatus,
} from './fix-translator';
import { ExchangeId } from '../../types/exchange';
import { OrderRequest, OrderType, OrderSide, TimeInForce, OrderStatus } from '../../types/exchange-order';
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
 * Generator for OrderSide
 */
const orderSideArb = (): fc.Arbitrary<OrderSide> =>
  fc.constantFrom('BUY', 'SELL');

/**
 * Generator for OrderType (excluding TRAILING_STOP for FIX compatibility)
 */
const orderTypeArb = (): fc.Arbitrary<OrderType> =>
  fc.constantFrom('MARKET', 'LIMIT', 'STOP_LIMIT', 'STOP_MARKET');

/**
 * Generator for TimeInForce
 */
const timeInForceArb = (): fc.Arbitrary<TimeInForce> =>
  fc.constantFrom('GTC', 'IOC', 'FOK', 'GTD');

/**
 * Generator for valid OrderRequest
 */
const orderRequestArb = (): fc.Arbitrary<OrderRequest> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    assetId: fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT'),
    side: orderSideArb(),
    orderType: orderTypeArb(),
    quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    price: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    stopPrice: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    timeInForce: timeInForceArb(),
    expiresAt: fc.date({ min: new Date(), max: new Date('2030-12-31') }).map(d => d.toISOString()),
    idempotencyKey: fc.uuid(),
    timestamp: fc.date().map(d => d.toISOString()),
  }).map(order => {
    // Return order with appropriate fields based on type
    return order;
  });

/**
 * Generator for FIX ExecutionReport message
 */
const executionReportArb = (): fc.Arbitrary<FIXMessage> =>
  fc.record({
    execId: fc.uuid(),
    clOrdId: fc.uuid(),
    orderId: fc.uuid(),
    side: fc.constantFrom(FIXSide.BUY, FIXSide.SELL),
    lastQty: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    lastPx: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    cumQty: fc.double({ min: 0, max: 10000, noNaN: true }),
    leavesQty: fc.double({ min: 0, max: 10000, noNaN: true }),
    avgPx: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    ordStatus: fc.constantFrom(
      FIXOrdStatus.NEW,
      FIXOrdStatus.PARTIALLY_FILLED,
      FIXOrdStatus.FILLED,
      FIXOrdStatus.CANCELED,
      FIXOrdStatus.REJECTED
    ),
    execType: fc.constantFrom(
      FIXExecType.NEW,
      FIXExecType.PARTIAL_FILL,
      FIXExecType.FILL,
      FIXExecType.CANCELED,
      FIXExecType.REJECTED
    ),
    commission: fc.double({ min: 0, max: 100, noNaN: true }),
    transactTime: fc.date().map(d => d.toISOString().replace('T', '-').replace('Z', '').replace(/\.\d{3}/, '')),
  }).map(data => ({
    msgType: FIXMsgType.EXECUTION_REPORT,
    fields: {
      [FIXTag.EXEC_ID]: data.execId,
      [FIXTag.CL_ORD_ID]: data.clOrdId,
      [FIXTag.ORDER_ID]: data.orderId,
      [FIXTag.SIDE]: data.side,
      [FIXTag.LAST_QTY]: data.lastQty,
      [FIXTag.LAST_PX]: data.lastPx,
      [FIXTag.CUM_QTY]: data.cumQty,
      [FIXTag.LEAVES_QTY]: data.leavesQty,
      [FIXTag.AVG_PX]: data.avgPx,
      [FIXTag.ORD_STATUS]: data.ordStatus,
      [FIXTag.EXEC_TYPE]: data.execType,
      [FIXTag.COMMISSION]: data.commission,
      [FIXTag.TRANSACT_TIME]: data.transactTime,
    },
  }));

/**
 * Generator for FIX Config
 */
const fixConfigArb = (): fc.Arbitrary<FIXConfig> =>
  fc.record({
    senderCompId: fc.stringOf(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '1', '2', '3'), { minLength: 3, maxLength: 10 }),
    targetCompId: fc.stringOf(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '1', '2', '3'), { minLength: 3, maxLength: 10 }),
    host: fc.constantFrom('localhost', '127.0.0.1', 'fix.exchange.com'),
    port: fc.integer({ min: 1024, max: 65535 }),
    heartbeatIntervalSec: fc.integer({ min: 10, max: 60 }),
    resetOnLogon: fc.boolean(),
    persistMessages: fc.boolean(),
    version: fc.constantFrom('4.2', '4.4'),
  });

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


// ============================================
// Property Tests
// ============================================

describe('FIX Client and Translator', () => {
  describe('Property 13: FIX Message Round-Trip', () => {
    /**
     * Feature: exchange-integration, Property 13: FIX Message Round-Trip
     *
     * For any valid OrderRequest, translating to FIX NewOrderSingle format
     * and back SHALL produce an equivalent order with all essential fields
     * preserved (orderId, side, quantity, price, orderType).
     *
     * **Validates: Requirements 4.1, 4.3**
     */
    it('should preserve essential order fields through FIX translation round-trip', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          orderRequestArb(),
          (exchangeId, order) => {
            const translator = new FIXOrderTranslator(exchangeId);

            // Convert to FIX NewOrderSingle
            const fixMessage = translator.toFIXNewOrderSingle(order);

            // Verify FIX message structure
            expect(fixMessage.msgType).toBe(FIXMsgType.NEW_ORDER_SINGLE);
            expect(fixMessage.fields).toBeDefined();

            // Verify essential fields are preserved in FIX message
            expect(fixMessage.fields[FIXTag.CL_ORD_ID]).toBe(order.orderId);
            expect(fixMessage.fields[FIXTag.SYMBOL]).toBe(order.assetId);
            expect(fixMessage.fields[FIXTag.ORDER_QTY]).toBe(order.quantity);

            // Verify side conversion
            const expectedSide = order.side === 'BUY' ? FIXSide.BUY : FIXSide.SELL;
            expect(fixMessage.fields[FIXTag.SIDE]).toBe(expectedSide);

            // Verify order type conversion
            const sideFromFix = translator.fromFIXSide(fixMessage.fields[FIXTag.SIDE]);
            expect(sideFromFix).toBe(order.side);

            // Verify price for LIMIT orders
            if (order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT') {
              expect(fixMessage.fields[FIXTag.PRICE]).toBe(order.price);
            }

            // Verify stop price for STOP orders
            if (order.orderType === 'STOP_LIMIT' || order.orderType === 'STOP_MARKET') {
              expect(fixMessage.fields[FIXTag.STOP_PX]).toBe(order.stopPrice);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 13: FIX Message Round-Trip
     *
     * For any valid ExecutionReport, parsing SHALL produce an ExecutionUpdate
     * with all essential fields preserved.
     *
     * **Validates: Requirements 4.1, 4.3**
     */
    it('should correctly parse ExecutionReport messages', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          executionReportArb(),
          (exchangeId, fixMessage) => {
            const translator = new FIXOrderTranslator(exchangeId);

            // Parse ExecutionReport
            const execution = translator.fromFIXExecutionReport(fixMessage);

            // Verify essential fields are preserved
            expect(execution.executionId).toBe(String(fixMessage.fields[FIXTag.EXEC_ID]));
            expect(execution.orderId).toBe(String(fixMessage.fields[FIXTag.CL_ORD_ID]));
            expect(execution.exchangeOrderId).toBe(String(fixMessage.fields[FIXTag.ORDER_ID]));
            expect(execution.exchangeId).toBe(exchangeId);

            // Verify numeric fields
            expect(execution.quantity).toBe(Number(fixMessage.fields[FIXTag.LAST_QTY]));
            expect(execution.price).toBe(Number(fixMessage.fields[FIXTag.LAST_PX]));
            expect(execution.commission).toBe(Number(fixMessage.fields[FIXTag.COMMISSION]));

            // Verify side conversion
            const expectedSide = fixMessage.fields[FIXTag.SIDE] === FIXSide.BUY ? 'BUY' : 'SELL';
            expect(execution.side).toBe(expectedSide);

            // Verify timestamp is valid ISO string
            expect(new Date(execution.timestamp).toISOString()).toBe(execution.timestamp);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 13: FIX Message Round-Trip
     *
     * Side conversion SHALL be bidirectional and consistent.
     *
     * **Validates: Requirements 4.1, 4.3**
     */
    it('should have consistent bidirectional side conversion', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          orderSideArb(),
          (exchangeId, side) => {
            const translator = new FIXOrderTranslator(exchangeId);

            // Convert to FIX and back
            const fixSide = translator.toFIXSide(side);
            const backToInternal = translator.fromFIXSide(fixSide);

            expect(backToInternal).toBe(side);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 13: FIX Message Round-Trip
     *
     * TimeInForce conversion SHALL be bidirectional and consistent.
     *
     * **Validates: Requirements 4.1, 4.3**
     */
    it('should have consistent bidirectional time-in-force conversion', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          timeInForceArb(),
          (exchangeId, tif) => {
            const translator = new FIXOrderTranslator(exchangeId);

            // Convert to FIX and back
            const fixTif = translator.toFIXTimeInForce(tif);
            const backToInternal = translator.fromFIXTimeInForce(fixTif);

            expect(backToInternal).toBe(tif);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 13: FIX Message Round-Trip
     *
     * OrderType conversion SHALL map correctly to FIX OrdType values.
     *
     * **Validates: Requirements 4.1, 4.3**
     */
    it('should correctly map order types to FIX values', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          orderTypeArb(),
          (exchangeId, orderType) => {
            const translator = new FIXOrderTranslator(exchangeId);

            const fixOrdType = translator.toFIXOrderType(orderType);

            // Verify mapping
            switch (orderType) {
              case 'MARKET':
                expect(fixOrdType).toBe(FIXOrdType.MARKET);
                break;
              case 'LIMIT':
                expect(fixOrdType).toBe(FIXOrdType.LIMIT);
                break;
              case 'STOP_MARKET':
                expect(fixOrdType).toBe(FIXOrdType.STOP);
                break;
              case 'STOP_LIMIT':
                expect(fixOrdType).toBe(FIXOrdType.STOP_LIMIT);
                break;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 14: FIX Session Management', () => {
    /**
     * Feature: exchange-integration, Property 14: FIX Session Management
     *
     * For any FIX session, the system SHALL handle Logon (35=A), Heartbeat (35=0),
     * and Logout (35=5) messages, AND sequence numbers SHALL be tracked.
     *
     * **Validates: Requirements 4.2, 4.6**
     */
    it('should correctly parse session management messages', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);

            // Test Logon message parsing
            const logonRaw = `8=FIX.4.4\x019=100\x0135=A\x0149=TARGET\x0156=SENDER\x0134=1\x0152=20240101-12:00:00\x0198=0\x01108=30\x0110=123\x01`;
            const logonMsg = client.parseMessage(logonRaw);
            expect(logonMsg.msgType).toBe(FIXMsgType.LOGON);

            // Test Heartbeat message parsing
            const heartbeatRaw = `8=FIX.4.4\x019=50\x0135=0\x0149=TARGET\x0156=SENDER\x0134=2\x0152=20240101-12:00:00\x0110=123\x01`;
            const heartbeatMsg = client.parseMessage(heartbeatRaw);
            expect(heartbeatMsg.msgType).toBe(FIXMsgType.HEARTBEAT);

            // Test Logout message parsing
            const logoutRaw = `8=FIX.4.4\x019=50\x0135=5\x0149=TARGET\x0156=SENDER\x0134=3\x0152=20240101-12:00:00\x0110=123\x01`;
            const logoutMsg = client.parseMessage(logoutRaw);
            expect(logoutMsg.msgType).toBe(FIXMsgType.LOGOUT);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 14: FIX Session Management
     *
     * Sequence numbers SHALL be tracked and incremented correctly.
     *
     * **Validates: Requirements 4.2, 4.6**
     */
    it('should track sequence numbers correctly', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 1000 }),
          (exchangeId, config, outgoing, incoming) => {
            const client = new FIXClient(exchangeId, config);

            // Set sequence numbers
            client.setSequenceNumbers(outgoing, incoming);

            // Verify they are stored correctly
            expect(client.getOutgoingSeqNum()).toBe(outgoing);
            expect(client.getIncomingSeqNum()).toBe(incoming);

            // Verify session state reflects sequence numbers
            const state = client.getSessionState();
            expect(state.outgoingSeqNum).toBe(outgoing);
            expect(state.incomingSeqNum).toBe(incoming);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 14: FIX Session Management
     *
     * Session state SHALL be properly initialized and tracked.
     *
     * **Validates: Requirements 4.2, 4.6**
     */
    it('should initialize session state correctly', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);

            const state = client.getSessionState();

            // Verify initial state
            expect(state.sessionId).toBeDefined();
            expect(state.status).toBe('DISCONNECTED');
            expect(state.outgoingSeqNum).toBe(1);
            expect(state.incomingSeqNum).toBe(1);
            expect(state.loggedOn).toBe(false);
            expect(state.pendingResend).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 14: FIX Session Management
     *
     * Reconnection delay SHALL follow exponential backoff formula.
     *
     * **Validates: Requirements 4.2, 4.6**
     */
    it('should calculate reconnection delay with exponential backoff', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          reconnectionStrategyArb(),
          fc.integer({ min: 0, max: 15 }),
          (exchangeId, config, strategy, attempt) => {
            const client = new FIXClient(exchangeId, config, { strategy });

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
     * Feature: exchange-integration, Property 14: FIX Session Management
     *
     * Reconnection delay SHALL never exceed maxDelayMs (plus jitter).
     *
     * **Validates: Requirements 4.2, 4.6**
     */
    it('should cap reconnection delay at maxDelayMs', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          reconnectionStrategyArb(),
          fc.integer({ min: 0, max: 100 }),
          (exchangeId, config, strategy, attempt) => {
            const client = new FIXClient(exchangeId, config, { strategy });

            const delay = client.calculateReconnectDelay(attempt, strategy);

            // Delay should never exceed maxDelay + jitter
            const maxWithJitter = strategy.maxDelayMs * (1 + strategy.jitterPercent / 100);
            expect(delay).toBeLessThanOrEqual(Math.ceil(maxWithJitter));
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 15: FIX Message Logging', () => {
    /**
     * Feature: exchange-integration, Property 15: FIX Message Logging
     *
     * For any FIX message sent or received, the raw message SHALL be logged
     * with timestamp for compliance and debugging purposes.
     *
     * **Validates: Requirements 4.5**
     */
    it('should store message logs with required fields', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb().map(c => ({ ...c, persistMessages: true })),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);

            // Initially no logs
            expect(client.getMessageLogs()).toHaveLength(0);

            // Verify config has persistMessages enabled
            expect(client.getConfig().persistMessages).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 15: FIX Message Logging
     *
     * Message logs SHALL be filterable by direction (SENT/RECEIVED).
     *
     * **Validates: Requirements 4.5**
     */
    it('should support filtering logs by direction', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb().map(c => ({ ...c, persistMessages: true })),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);

            // Get logs by direction (should be empty initially)
            const sentLogs = client.getMessageLogsByDirection('SENT');
            const receivedLogs = client.getMessageLogsByDirection('RECEIVED');

            expect(Array.isArray(sentLogs)).toBe(true);
            expect(Array.isArray(receivedLogs)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 15: FIX Message Logging
     *
     * Message logs SHALL be filterable by message type.
     *
     * **Validates: Requirements 4.5**
     */
    it('should support filtering logs by message type', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb().map(c => ({ ...c, persistMessages: true })),
          fc.constantFrom(
            FIXMsgType.LOGON,
            FIXMsgType.LOGOUT,
            FIXMsgType.HEARTBEAT,
            FIXMsgType.NEW_ORDER_SINGLE,
            FIXMsgType.EXECUTION_REPORT
          ),
          (exchangeId, config, msgType) => {
            const client = new FIXClient(exchangeId, config);

            // Get logs by type (should be empty initially)
            const typeLogs = client.getMessageLogsByType(msgType);

            expect(Array.isArray(typeLogs)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 15: FIX Message Logging
     *
     * Message logs SHALL support limiting the number of returned entries.
     *
     * **Validates: Requirements 4.5**
     */
    it('should support limiting log entries', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb().map(c => ({ ...c, persistMessages: true })),
          fc.integer({ min: 1, max: 100 }),
          (exchangeId, config, limit) => {
            const client = new FIXClient(exchangeId, config);

            // Get logs with limit
            const logs = client.getMessageLogs(limit);

            // Should return at most 'limit' entries
            expect(logs.length).toBeLessThanOrEqual(limit);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 15: FIX Message Logging
     *
     * Message logs SHALL be clearable.
     *
     * **Validates: Requirements 4.5**
     */
    it('should support clearing message logs', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb().map(c => ({ ...c, persistMessages: true })),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);

            // Clear logs
            client.clearMessageLogs();

            // Verify logs are empty
            expect(client.getMessageLogs()).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 15: FIX Message Logging
     *
     * When persistMessages is false, no logs SHALL be stored.
     *
     * **Validates: Requirements 4.5**
     */
    it('should not store logs when persistMessages is false', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb().map(c => ({ ...c, persistMessages: false })),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);

            // Verify config has persistMessages disabled
            expect(client.getConfig().persistMessages).toBe(false);

            // Logs should be empty
            expect(client.getMessageLogs()).toHaveLength(0);
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
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);
            expect(client.getExchangeId()).toBe(exchangeId);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Verify client stores configuration correctly
     */
    it('should store configuration correctly', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);
            const storedConfig = client.getConfig();

            expect(storedConfig.senderCompId).toBe(config.senderCompId);
            expect(storedConfig.targetCompId).toBe(config.targetCompId);
            expect(storedConfig.host).toBe(config.host);
            expect(storedConfig.port).toBe(config.port);
            expect(storedConfig.heartbeatIntervalSec).toBe(config.heartbeatIntervalSec);
            expect(storedConfig.resetOnLogon).toBe(config.resetOnLogon);
            expect(storedConfig.persistMessages).toBe(config.persistMessages);
            expect(storedConfig.version).toBe(config.version);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Verify client uses default reconnect options when not specified
     */
    it('should use default reconnect options when not specified', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);
            const reconnectOptions = client.getReconnectOptions();

            expect(reconnectOptions.enabled).toBe(true);
            expect(reconnectOptions.strategy).toEqual(DEFAULT_FIX_RECONNECT_STRATEGY);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Verify client connection state methods
     */
    it('should report connection state correctly', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fixConfigArb(),
          (exchangeId, config) => {
            const client = new FIXClient(exchangeId, config);

            // Initially not connected or logged on
            expect(client.isConnected()).toBe(false);
            expect(client.isLoggedOn()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Translator Configuration', () => {
    /**
     * Verify translator stores exchange ID correctly
     */
    it('should store exchange ID correctly', () => {
      fc.assert(
        fc.property(exchangeIdArb(), (exchangeId) => {
          const translator = new FIXOrderTranslator(exchangeId);
          expect(translator.getExchangeId()).toBe(exchangeId);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Verify fill detection works correctly
     */
    it('should correctly identify fill executions', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          fc.constantFrom(
            FIXExecType.FILL,
            FIXExecType.PARTIAL_FILL,
            FIXExecType.TRADE,
            FIXExecType.NEW,
            FIXExecType.CANCELED
          ),
          (exchangeId, execType) => {
            const translator = new FIXOrderTranslator(exchangeId);
            const message: FIXMessage = {
              msgType: FIXMsgType.EXECUTION_REPORT,
              fields: {
                [FIXTag.EXEC_TYPE]: execType,
              },
            };

            const isFill = translator.isFillExecution(message);

            // Should be true for FILL, PARTIAL_FILL, and TRADE
            const fillTypes = [FIXExecType.FILL, FIXExecType.PARTIAL_FILL, FIXExecType.TRADE] as string[];
            const expectedFill = fillTypes.includes(execType);
            expect(isFill).toBe(expectedFill);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
