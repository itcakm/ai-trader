/**
 * Property-based tests for Base Exchange Adapter Interface Consistency
 *
 * **Property 1: Exchange Adapter Interface Consistency**
 * *For any* registered Exchange_Adapter, it SHALL implement all methods defined in the
 * ExchangeAdapter interface (submitOrder, cancelOrder, modifyOrder, getOrderStatus,
 * getBalance, getPositions), AND calling these methods SHALL return responses
 * conforming to the defined response types.
 *
 * **Validates: Requirements 1.1, 1.3, 2.1**
 */

import * as fc from 'fast-check';
import {
  BaseExchangeAdapter,
  ExchangeAdapterConfig,
  ExchangeAdapterError,
} from './base-exchange-adapter';
import {
  ExchangeId,
  ExchangeMode,
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

// ============================================
// Mock Implementation for Testing
// ============================================

/**
 * Mock exchange adapter that implements all abstract methods
 * Used to verify interface compliance
 */
class MockExchangeAdapter extends BaseExchangeAdapter {
  readonly exchangeId: ExchangeId;
  readonly mode: ExchangeMode;

  constructor(config: ExchangeAdapterConfig) {
    super(config);
    this.exchangeId = config.exchangeId;
    this.mode = config.mode;
  }

  async connect(): Promise<void> {
    this.setConnectionStatus('CONNECTED');
  }

  async disconnect(): Promise<void> {
    this.setConnectionStatus('DISCONNECTED');
  }

  async submitOrder(order: OrderRequest): Promise<OrderResponse> {
    const startTime = Date.now();
    const response: OrderResponse = {
      orderId: order.orderId,
      exchangeOrderId: `EX-${order.orderId}`,
      exchangeId: this.exchangeId,
      status: 'OPEN',
      filledQuantity: 0,
      remainingQuantity: order.quantity,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Log the request using the protected method via a public wrapper
    this.logSubmitOrder(Date.now() - startTime, true);
    return response;
  }

  // Public wrapper to call protected logRequest
  logSubmitOrder(durationMs: number, success: boolean, errorMessage?: string): void {
    this.logRequest('submitOrder', durationMs, success, errorMessage);
  }

  async cancelOrder(orderId: string, exchangeOrderId: string): Promise<CancelResponse> {
    return {
      orderId,
      exchangeOrderId,
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
    };
  }

  async modifyOrder(orderId: string, modifications: OrderModification): Promise<OrderResponse> {
    return {
      orderId,
      exchangeOrderId: `EX-${orderId}`,
      exchangeId: this.exchangeId,
      status: 'OPEN',
      filledQuantity: 0,
      remainingQuantity: modifications.newQuantity ?? 1,
      averagePrice: modifications.newPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async getOrderStatus(orderId: string, exchangeOrderId: string): Promise<OrderStatus> {
    return 'OPEN';
  }

  async getBalance(asset?: string): Promise<BalanceResponse> {
    return {
      exchangeId: this.exchangeId,
      balances: asset
        ? [{ asset, free: 100, locked: 10, total: 110 }]
        : [
            { asset: 'BTC', free: 1.5, locked: 0.5, total: 2 },
            { asset: 'USDT', free: 10000, locked: 1000, total: 11000 },
          ],
      timestamp: new Date().toISOString(),
    };
  }

  async getPositions(): Promise<PositionResponse[]> {
    return [
      {
        exchangeId: this.exchangeId,
        assetId: 'BTC',
        quantity: 1.5,
        averageEntryPrice: 45000,
        unrealizedPnL: 500,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  async subscribeToOrderUpdates(
    callback: (update: OrderUpdate) => void
  ): Promise<SubscriptionHandle> {
    return this.createSubscriptionHandle('orderUpdates');
  }

  async subscribeToExecutions(
    callback: (execution: ExecutionUpdate) => void
  ): Promise<SubscriptionHandle> {
    return this.createSubscriptionHandle('executions');
  }

  async unsubscribe(handle: SubscriptionHandle): Promise<void> {
    this.removeSubscriptionHandle(handle.id);
  }
}


// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for ExchangeMode
 */
const exchangeModeArb = (): fc.Arbitrary<ExchangeMode> =>
  fc.constantFrom('PRODUCTION', 'SANDBOX');

/**
 * Generator for API keys
 */
const apiKeyArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 10, maxLength: 64 }).filter((s) => s.trim().length >= 10);

/**
 * Generator for API endpoints
 */
const apiEndpointArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'https://api.binance.com',
    'https://api.coinbase.com',
    'https://api.kraken.com',
    'https://api.okx.com',
    'https://api.bsdex.de',
    'https://api.bisonapp.com',
    'https://api.finoa.io',
    'https://api.bybit.com'
  );

/**
 * Generator for ExchangeAdapterConfig
 */
const exchangeAdapterConfigArb = (): fc.Arbitrary<ExchangeAdapterConfig> =>
  fc.record({
    exchangeId: exchangeIdArb(),
    tenantId: fc.uuid(),
    mode: exchangeModeArb(),
    restEndpoint: apiEndpointArb(),
    wsEndpoint: fc.option(apiEndpointArb(), { nil: undefined }),
    fixEndpoint: fc.option(apiEndpointArb(), { nil: undefined }),
    apiKey: apiKeyArb(),
    apiSecret: apiKeyArb(),
    passphrase: fc.option(fc.string({ minLength: 5, maxLength: 32 }), { nil: undefined }),
    timeoutMs: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
    maxRetries: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
    retryDelayMs: fc.option(fc.integer({ min: 100, max: 5000 }), { nil: undefined }),
  });

/**
 * Generator for OrderRequest
 */
const orderRequestArb = (): fc.Arbitrary<OrderRequest> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    assetId: fc.constantFrom('BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'ADA-USDT'),
    side: fc.constantFrom('BUY', 'SELL'),
    orderType: fc.constantFrom('MARKET', 'LIMIT', 'STOP_LIMIT', 'STOP_MARKET', 'TRAILING_STOP'),
    quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    price: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
    stopPrice: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
    trailingDelta: fc.option(fc.double({ min: 0.001, max: 0.1, noNaN: true }), { nil: undefined }),
    timeInForce: fc.constantFrom('GTC', 'IOC', 'FOK', 'GTD'),
    expiresAt: fc.option(
      fc.date({ min: new Date(), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) }).map(
        (d) => d.toISOString()
      ),
      { nil: undefined }
    ),
    exchangeId: fc.option(exchangeIdArb(), { nil: undefined }),
    idempotencyKey: fc.uuid(),
    metadata: fc.option(fc.constant({}), { nil: undefined }),
    timestamp: fc.date().map((d) => d.toISOString()),
  });

/**
 * Generator for OrderModification
 */
const orderModificationArb = (): fc.Arbitrary<OrderModification> =>
  fc.record({
    newPrice: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
    newQuantity: fc.option(fc.double({ min: 0.001, max: 1000, noNaN: true }), { nil: undefined }),
    newStopPrice: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
  });

// ============================================
// Property Tests
// ============================================

describe('Base Exchange Adapter', () => {
  describe('Property 1: Exchange Adapter Interface Consistency', () => {
    /**
     * Feature: exchange-integration, Property 1: Exchange Adapter Interface Consistency
     *
     * For any exchange adapter configuration, the adapter SHALL implement all
     * required methods of the ExchangeAdapter interface.
     */
    it('should implement all required interface methods for any configuration', () => {
      fc.assert(
        fc.property(exchangeAdapterConfigArb(), (config) => {
          const adapter = new MockExchangeAdapter(config);

          // Verify all required interface methods exist and are functions
          expect(typeof adapter.connect).toBe('function');
          expect(typeof adapter.disconnect).toBe('function');
          expect(typeof adapter.isConnected).toBe('function');
          expect(typeof adapter.submitOrder).toBe('function');
          expect(typeof adapter.cancelOrder).toBe('function');
          expect(typeof adapter.modifyOrder).toBe('function');
          expect(typeof adapter.getOrderStatus).toBe('function');
          expect(typeof adapter.getBalance).toBe('function');
          expect(typeof adapter.getPositions).toBe('function');
          expect(typeof adapter.subscribeToOrderUpdates).toBe('function');
          expect(typeof adapter.subscribeToExecutions).toBe('function');
          expect(typeof adapter.unsubscribe).toBe('function');
          expect(typeof adapter.healthCheck).toBe('function');
          expect(typeof adapter.getRateLimitStatus).toBe('function');

          // Verify exchangeId and mode properties
          expect(adapter.exchangeId).toBe(config.exchangeId);
          expect(adapter.mode).toBe(config.mode);
        }),
        { numRuns: 100 }
      );
    });


    /**
     * Feature: exchange-integration, Property 1: Exchange Adapter Interface Consistency
     *
     * For any order request, submitOrder SHALL return a response conforming to
     * the OrderResponse interface with all required fields.
     */
    it('should return valid OrderResponse for any order submission', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeAdapterConfigArb(),
          orderRequestArb(),
          async (config, order) => {
            const adapter = new MockExchangeAdapter(config);
            await adapter.connect();

            const response = await adapter.submitOrder(order);

            // Verify response conforms to OrderResponse interface
            expect(response.orderId).toBe(order.orderId);
            expect(typeof response.exchangeOrderId).toBe('string');
            expect(response.exchangeOrderId.length).toBeGreaterThan(0);
            expect(response.exchangeId).toBe(config.exchangeId);
            expect(['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']).toContain(response.status);
            expect(typeof response.filledQuantity).toBe('number');
            expect(typeof response.remainingQuantity).toBe('number');
            expect(typeof response.createdAt).toBe('string');
            expect(typeof response.updatedAt).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 1: Exchange Adapter Interface Consistency
     *
     * For any cancel request, cancelOrder SHALL return a response conforming to
     * the CancelResponse interface.
     */
    it('should return valid CancelResponse for any cancellation', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeAdapterConfigArb(),
          fc.uuid(),
          fc.uuid(),
          async (config, orderId, exchangeOrderId) => {
            const adapter = new MockExchangeAdapter(config);
            await adapter.connect();

            const response = await adapter.cancelOrder(orderId, exchangeOrderId);

            // Verify response conforms to CancelResponse interface
            expect(response.orderId).toBe(orderId);
            expect(response.exchangeOrderId).toBe(exchangeOrderId);
            expect(['CANCELLED', 'PENDING_CANCEL', 'FAILED']).toContain(response.status);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 1: Exchange Adapter Interface Consistency
     *
     * For any modification request, modifyOrder SHALL return a response conforming to
     * the OrderResponse interface.
     */
    it('should return valid OrderResponse for any modification', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeAdapterConfigArb(),
          fc.uuid(),
          orderModificationArb(),
          async (config, orderId, modifications) => {
            const adapter = new MockExchangeAdapter(config);
            await adapter.connect();

            const response = await adapter.modifyOrder(orderId, modifications);

            // Verify response conforms to OrderResponse interface
            expect(response.orderId).toBe(orderId);
            expect(typeof response.exchangeOrderId).toBe('string');
            expect(response.exchangeId).toBe(config.exchangeId);
            expect(['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']).toContain(response.status);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 1: Exchange Adapter Interface Consistency
     *
     * For any balance query, getBalance SHALL return a response conforming to
     * the BalanceResponse interface.
     */
    it('should return valid BalanceResponse for any balance query', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeAdapterConfigArb(),
          fc.option(fc.constantFrom('BTC', 'ETH', 'USDT', 'SOL'), { nil: undefined }),
          async (config, asset) => {
            const adapter = new MockExchangeAdapter(config);
            await adapter.connect();

            const response = await adapter.getBalance(asset);

            // Verify response conforms to BalanceResponse interface
            expect(response.exchangeId).toBe(config.exchangeId);
            expect(Array.isArray(response.balances)).toBe(true);
            expect(typeof response.timestamp).toBe('string');

            // Verify each balance entry
            for (const balance of response.balances) {
              expect(typeof balance.asset).toBe('string');
              expect(typeof balance.free).toBe('number');
              expect(typeof balance.locked).toBe('number');
              expect(typeof balance.total).toBe('number');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 1: Exchange Adapter Interface Consistency
     *
     * For any positions query, getPositions SHALL return an array of responses
     * conforming to the PositionResponse interface.
     */
    it('should return valid PositionResponse array for any positions query', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeAdapterConfigArb(), async (config) => {
          const adapter = new MockExchangeAdapter(config);
          await adapter.connect();

          const positions = await adapter.getPositions();

          // Verify response is an array
          expect(Array.isArray(positions)).toBe(true);

          // Verify each position conforms to PositionResponse interface
          for (const position of positions) {
            expect(position.exchangeId).toBe(config.exchangeId);
            expect(typeof position.assetId).toBe('string');
            expect(typeof position.quantity).toBe('number');
            expect(typeof position.averageEntryPrice).toBe('number');
            expect(typeof position.unrealizedPnL).toBe('number');
            expect(typeof position.timestamp).toBe('string');
          }
        }),
        { numRuns: 100 }
      );
    });
  });


  describe('Connection Management', () => {
    it('should correctly track connection status', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeAdapterConfigArb(), async (config) => {
          const adapter = new MockExchangeAdapter(config);

          // Initially disconnected
          expect(adapter.isConnected()).toBe(false);
          expect(adapter.getConnectionStatus()).toBe('DISCONNECTED');

          // After connect
          await adapter.connect();
          expect(adapter.isConnected()).toBe(true);
          expect(adapter.getConnectionStatus()).toBe('CONNECTED');

          // After disconnect
          await adapter.disconnect();
          expect(adapter.isConnected()).toBe(false);
          expect(adapter.getConnectionStatus()).toBe('DISCONNECTED');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Health Check', () => {
    it('should return valid ExchangeHealthResult', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeAdapterConfigArb(), async (config) => {
          const adapter = new MockExchangeAdapter(config);
          await adapter.connect();

          const result = await adapter.healthCheck();

          // Verify result conforms to ExchangeHealthResult interface
          expect(result.exchangeId).toBe(config.exchangeId);
          expect(typeof result.healthy).toBe('boolean');
          expect(typeof result.latencyMs).toBe('number');
          expect(result.latencyMs).toBeGreaterThanOrEqual(0);
          expect(typeof result.lastCheckedAt).toBe('string');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Rate Limit Status', () => {
    it('should return valid RateLimitStatus', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeAdapterConfigArb(), async (config) => {
          const adapter = new MockExchangeAdapter(config);

          const status = await adapter.getRateLimitStatus();

          // Verify status conforms to RateLimitStatus interface
          expect(status.exchangeId).toBe(config.exchangeId);
          expect(typeof status.ordersRemaining).toBe('number');
          expect(typeof status.queriesRemaining).toBe('number');
          expect(typeof status.wsMessagesRemaining).toBe('number');
          expect(typeof status.resetsAt).toBe('string');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Subscription Management', () => {
    it('should create and track subscriptions correctly', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeAdapterConfigArb(), async (config) => {
          const adapter = new MockExchangeAdapter(config);
          await adapter.connect();

          // Subscribe to order updates
          const orderHandle = await adapter.subscribeToOrderUpdates(() => {});
          expect(orderHandle.exchangeId).toBe(config.exchangeId);
          expect(typeof orderHandle.id).toBe('string');
          expect(typeof orderHandle.channel).toBe('string');
          expect(typeof orderHandle.createdAt).toBe('string');

          // Subscribe to executions
          const execHandle = await adapter.subscribeToExecutions(() => {});
          expect(execHandle.exchangeId).toBe(config.exchangeId);

          // Verify subscriptions are tracked
          const subscriptions = adapter.getActiveSubscriptions();
          expect(subscriptions.length).toBe(2);

          // Unsubscribe
          await adapter.unsubscribe(orderHandle);
          expect(adapter.getActiveSubscriptions().length).toBe(1);

          await adapter.unsubscribe(execHandle);
          expect(adapter.getActiveSubscriptions().length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Request Logging', () => {
    it('should log requests correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeAdapterConfigArb(),
          orderRequestArb(),
          async (config, order) => {
            const adapter = new MockExchangeAdapter(config);
            await adapter.connect();

            // Clear any existing logs
            adapter.clearRequestLogs();
            expect(adapter.getRequestLogs().length).toBe(0);

            // Submit an order (which logs the request)
            await adapter.submitOrder(order);

            // Verify log was created
            const logs = adapter.getRequestLogs();
            expect(logs.length).toBeGreaterThan(0);

            // Verify log entry structure
            const log = logs[logs.length - 1];
            expect(log.exchangeId).toBe(config.exchangeId);
            expect(typeof log.logId).toBe('string');
            expect(typeof log.timestamp).toBe('string');
            expect(typeof log.operationType).toBe('string');
            expect(typeof log.durationMs).toBe('number');
            expect(typeof log.success).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Sandbox Mode', () => {
    it('should correctly identify sandbox mode', () => {
      fc.assert(
        fc.property(exchangeAdapterConfigArb(), (config) => {
          const adapter = new MockExchangeAdapter(config);

          expect(adapter.isSandboxMode()).toBe(config.mode === 'SANDBOX');
        }),
        { numRuns: 100 }
      );
    });
  });
});
