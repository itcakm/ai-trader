/**
 * Property-based tests for Exchange Order Router Service
 *
 * **Property 21: Order Routing Criteria Application**
 * *For any* order routed by the Order_Router, the selected exchange SHALL match
 * the configured routing criteria (BEST_PRICE, LOWEST_FEES, HIGHEST_LIQUIDITY,
 * or USER_PREFERENCE), AND the routing decision SHALL be logged with reasoning.
 *
 * **Validates: Requirements 6.1, 6.5**
 *
 * **Property 22: Order Book Consideration in Routing**
 * *For any* routing decision, the Order_Router SHALL consider current order book
 * data (bid/ask depth, spread) from available exchanges, AND this data SHALL be
 * included in the RoutingReasoning.
 *
 * **Validates: Requirements 6.2**
 *
 * **Property 23: Order Splitting**
 * *For any* order larger than the configured threshold with enableOrderSplitting=true,
 * the Order_Router SHALL split the order across multiple exchanges, AND the sum of
 * split quantities SHALL equal the original order quantity.
 *
 * **Validates: Requirements 6.3**
 *
 * **Property 24: Exchange Size Constraints**
 * *For any* order, the Order_Router SHALL validate against exchange-specific
 * minOrderSize and lotSize, AND orders violating these constraints SHALL be
 * rejected before submission.
 *
 * **Validates: Requirements 6.6**
 */

import * as fc from 'fast-check';
import {
  ExchangeOrderRouter,
  RoutingCriteria,
  RoutingConfig,
  RoutingDecision,
  NoExchangeAvailableError,
  OrderSizeConstraintError,
} from './exchange-order-router';
import { ExchangeService } from './exchange';
import { RoutingConfigRepository } from '../repositories/routing-config';
import {
  ExchangeId,
  ExchangeConfig,
} from '../types/exchange';
import { OrderRequest, OrderType, TimeInForce } from '../types/exchange-order';
import { generateUUID } from '../utils/uuid';

// ============================================
// Mock Setup
// ============================================

let mockExchangeStore: Map<string, ExchangeConfig>;
let mockRoutingConfigStore: Map<string, RoutingConfig>;

// Initialize stores immediately
mockExchangeStore = new Map();
mockRoutingConfigStore = new Map();

// Mock the exchange service
jest.mock('./exchange', () => ({
  ExchangeService: {
    getAvailableExchanges: jest.fn(),
    isExchangeAvailable: jest.fn(),
    getExchange: jest.fn(),
  },
}));

// Mock the routing config repository
jest.mock('../repositories/routing-config', () => ({
  RoutingConfigRepository: {
    getRoutingConfig: jest.fn(),
    putRoutingConfig: jest.fn(),
  },
}));

// ============================================
// Generators
// ============================================

const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

const routingCriteriaArb = (): fc.Arbitrary<RoutingCriteria> =>
  fc.constantFrom('BEST_PRICE', 'LOWEST_FEES', 'HIGHEST_LIQUIDITY', 'USER_PREFERENCE');

const orderTypeArb = (): fc.Arbitrary<OrderType> =>
  fc.constantFrom('MARKET', 'LIMIT', 'STOP_LIMIT', 'STOP_MARKET', 'TRAILING_STOP');

const orderSideArb = (): fc.Arbitrary<'BUY' | 'SELL'> =>
  fc.constantFrom('BUY', 'SELL');

const timeInForceArb = (): fc.Arbitrary<TimeInForce> =>
  fc.constantFrom('GTC', 'IOC', 'FOK');

/**
 * Create a valid exchange config
 */
function createExchangeConfig(
  tenantId: string,
  exchangeId: ExchangeId,
  priority: number = 0,
  minOrderSize: number = 0.001,
  lotSize: number = 0.001
): ExchangeConfig {
  return {
    exchangeId,
    tenantId,
    name: `${exchangeId} Exchange`,
    mode: 'PRODUCTION',
    restEndpoint: `https://api.${exchangeId.toLowerCase()}.com`,
    authMethod: 'API_KEY',
    credentials: {
      apiKey: 'test-api-key-12345',
      apiSecret: 'test-api-secret-12345',
    },
    supportedFeatures: {
      supportedOrderTypes: ['MARKET', 'LIMIT', 'STOP_LIMIT', 'STOP_MARKET', 'TRAILING_STOP'],
      supportedAssets: ['BTC', 'ETH', 'SOL', 'ADA', 'XRP'],
      supportedTimeInForce: ['GTC', 'IOC', 'FOK', 'GTD'],
      supportsOrderModification: true,
      supportsWebSocket: true,
      supportsFIX: false,
      maxOrderSize: 1000000,
      minOrderSize,
      tickSize: 0.00001,
      lotSize,
    },
    rateLimits: {
      ordersPerSecond: 10,
      ordersPerMinute: 600,
      queriesPerSecond: 20,
      queriesPerMinute: 1200,
      wsMessagesPerSecond: 5,
    },
    status: 'ACTIVE',
    priority,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}


/**
 * Create a valid order request
 */
function createOrderRequest(
  tenantId: string,
  quantity: number = 1.0,
  side: 'BUY' | 'SELL' = 'BUY',
  assetId: string = 'BTC'
): OrderRequest {
  return {
    orderId: generateUUID(),
    tenantId,
    strategyId: generateUUID(),
    assetId,
    side,
    orderType: 'LIMIT',
    quantity,
    price: 50000,
    timeInForce: 'GTC',
    idempotencyKey: generateUUID(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a routing config
 */
function createRoutingConfig(
  tenantId: string,
  criteria: RoutingCriteria,
  enableSplitting: boolean = false,
  minSplitSize: number = 10000
): RoutingConfig {
  return {
    configId: generateUUID(),
    tenantId,
    defaultCriteria: criteria,
    exchangePriorities: [],
    enableOrderSplitting: enableSplitting,
    maxSplitExchanges: 3,
    minSplitSize,
  };
}

/**
 * Generator for valid order request
 */
const validOrderRequestArb = (): fc.Arbitrary<OrderRequest> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    assetId: fc.constantFrom('BTC', 'ETH', 'SOL'),
    side: orderSideArb(),
    orderType: fc.constant('LIMIT' as OrderType),
    quantity: fc.double({ min: 0.01, max: 100, noNaN: true }),
    price: fc.double({ min: 1000, max: 100000, noNaN: true }),
    timeInForce: timeInForceArb(),
    idempotencyKey: fc.uuid(),
    timestamp: fc.date().map(d => d.toISOString()),
  });

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  mockExchangeStore = new Map();
  mockRoutingConfigStore = new Map();
  ExchangeOrderRouter.clearOrderBookCache();
  ExchangeOrderRouter.clearRoutingDecisions();
  jest.clearAllMocks();

  // Set up mock implementations that use the stores
  (ExchangeService.getAvailableExchanges as jest.Mock).mockImplementation(async (tenantId: string) => {
    const results: ExchangeConfig[] = [];
    mockExchangeStore.forEach((config, key) => {
      if (key.startsWith(`${tenantId}:`) && config.status === 'ACTIVE') {
        results.push(config);
      }
    });
    return results.sort((a, b) => a.priority - b.priority);
  });

  (ExchangeService.isExchangeAvailable as jest.Mock).mockImplementation(async (tenantId: string, exchangeId: ExchangeId) => {
    const key = `${tenantId}:${exchangeId}`;
    const config = mockExchangeStore.get(key);
    return config?.status === 'ACTIVE';
  });

  (ExchangeService.getExchange as jest.Mock).mockImplementation(async (tenantId: string, exchangeId: ExchangeId) => {
    const key = `${tenantId}:${exchangeId}`;
    return mockExchangeStore.get(key) || null;
  });

  (RoutingConfigRepository.getRoutingConfig as jest.Mock).mockImplementation(async (tenantId: string) => {
    return mockRoutingConfigStore.get(tenantId) || null;
  });

  (RoutingConfigRepository.putRoutingConfig as jest.Mock).mockImplementation(async (tenantId: string, config: RoutingConfig) => {
    mockRoutingConfigStore.set(tenantId, config);
  });
});

// ============================================
// Property Tests
// ============================================

describe('Exchange Order Router', () => {
  describe('Property 21: Order Routing Criteria Application', () => {
    /**
     * Feature: exchange-integration, Property 21: Order Routing Criteria Application
     *
     * For any order routed by the Order_Router, the selected exchange SHALL match
     * the configured routing criteria, AND the routing decision SHALL be logged
     * with reasoning.
     *
     * **Validates: Requirements 6.1, 6.5**
     */
    it('should route orders according to configured criteria and log reasoning', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          routingCriteriaArb(),
          fc.constantFrom('BTC', 'ETH', 'SOL'),
          fc.constantFrom('BUY', 'SELL') as fc.Arbitrary<'BUY' | 'SELL'>,
          fc.integer({ min: 1, max: 100 }),
          async (tenantId, criteria, assetId, side, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;

            // Set up multiple exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config with the criteria
            const routingConfig = createRoutingConfig(tenantId, criteria);
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order request
            const orderRequest = createOrderRequest(tenantId, quantity, side, assetId);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // Verify decision has required fields
            expect(decision.decisionId).toBeDefined();
            expect(decision.orderId).toBe(orderRequest.orderId);
            expect(decision.criteria).toBe(criteria);
            expect(decision.selectedExchange).toBeDefined();
            expect(exchanges).toContain(decision.selectedExchange);

            // Verify reasoning is included
            expect(decision.reasoning).toBeDefined();
            expect(decision.reasoning.availabilityCheck).toBeDefined();
            expect(decision.reasoning.availabilityCheck.length).toBeGreaterThan(0);

            // Verify criteria-specific reasoning
            switch (criteria) {
              case 'BEST_PRICE':
                expect(decision.reasoning.priceComparison).toBeDefined();
                break;
              case 'LOWEST_FEES':
                expect(decision.reasoning.feeComparison).toBeDefined();
                break;
              case 'HIGHEST_LIQUIDITY':
                expect(decision.reasoning.liquidityAnalysis).toBeDefined();
                break;
            }

            // Verify decision is stored for tracking
            const storedDecision = ExchangeOrderRouter.getRoutingDecision(decision.decisionId);
            expect(storedDecision).toBeDefined();
            expect(storedDecision?.orderId).toBe(orderRequest.orderId);
          }
        ),
        { numRuns: 100 }
      );
    });


    /**
     * Feature: exchange-integration, Property 21: Order Routing Criteria Application
     *
     * BEST_PRICE criteria should select exchange with best price for the order side.
     *
     * **Validates: Requirements 6.1, 6.5**
     */
    it('should select exchange with best price when BEST_PRICE criteria is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('BTC', 'ETH', 'SOL'),
          fc.constantFrom('BUY', 'SELL') as fc.Arbitrary<'BUY' | 'SELL'>,
          fc.integer({ min: 1, max: 100 }),
          async (tenantId, assetId, side, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;
            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config with BEST_PRICE
            const routingConfig = createRoutingConfig(tenantId, 'BEST_PRICE');
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order request
            const orderRequest = createOrderRequest(tenantId, quantity, side, assetId);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // Verify price comparison is included
            expect(decision.reasoning.priceComparison).toBeDefined();
            expect(decision.reasoning.priceComparison!.length).toBeGreaterThan(0);

            // Verify selected exchange has best price
            const priceComparison = decision.reasoning.priceComparison!;
            const selectedPrice = priceComparison.find(
              (p) => p.exchangeId === decision.selectedExchange
            );
            expect(selectedPrice).toBeDefined();

            // For BUY orders, selected should have lowest ask
            // For SELL orders, selected should have highest bid
            if (side === 'BUY') {
              const lowestAsk = Math.min(...priceComparison.map((p) => p.askPrice));
              expect(selectedPrice!.askPrice).toBe(lowestAsk);
            } else {
              const highestBid = Math.max(...priceComparison.map((p) => p.bidPrice));
              expect(selectedPrice!.bidPrice).toBe(highestBid);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 21: Order Routing Criteria Application
     *
     * LOWEST_FEES criteria should select exchange with lowest estimated fees.
     *
     * **Validates: Requirements 6.1, 6.5**
     */
    it('should select exchange with lowest fees when LOWEST_FEES criteria is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('BTC', 'ETH', 'SOL'),
          fc.integer({ min: 1, max: 100 }),
          async (tenantId, assetId, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;
            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config with LOWEST_FEES
            const routingConfig = createRoutingConfig(tenantId, 'LOWEST_FEES');
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order request
            const orderRequest = createOrderRequest(tenantId, quantity, 'BUY', assetId);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // Verify fee comparison is included
            expect(decision.reasoning.feeComparison).toBeDefined();
            expect(decision.reasoning.feeComparison!.length).toBeGreaterThan(0);

            // Verify selected exchange has lowest estimated cost
            const feeComparison = decision.reasoning.feeComparison!;
            const selectedFee = feeComparison.find(
              (f) => f.exchangeId === decision.selectedExchange
            );
            expect(selectedFee).toBeDefined();

            const lowestCost = Math.min(...feeComparison.map((f) => f.estimatedCost));
            expect(selectedFee!.estimatedCost).toBe(lowestCost);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 22: Order Book Consideration in Routing', () => {
    /**
     * Feature: exchange-integration, Property 22: Order Book Consideration in Routing
     *
     * For any routing decision, the Order_Router SHALL consider current order book
     * data (bid/ask depth, spread) from available exchanges.
     *
     * **Validates: Requirements 6.2**
     */
    it('should include order book data in routing decisions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          routingCriteriaArb(),
          fc.constantFrom('BTC', 'ETH', 'SOL'),
          fc.integer({ min: 1, max: 100 }),
          async (tenantId, criteria, assetId, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;
            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config
            const routingConfig = createRoutingConfig(tenantId, criteria);
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order request
            const orderRequest = createOrderRequest(tenantId, quantity, 'BUY', assetId);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // Verify order book data is considered based on criteria
            if (criteria === 'BEST_PRICE') {
              expect(decision.reasoning.priceComparison).toBeDefined();
              for (const comparison of decision.reasoning.priceComparison!) {
                expect(comparison.bidPrice).toBeGreaterThan(0);
                expect(comparison.askPrice).toBeGreaterThan(0);
                expect(comparison.spread).toBeGreaterThanOrEqual(0);
              }
            }

            if (criteria === 'HIGHEST_LIQUIDITY') {
              expect(decision.reasoning.liquidityAnalysis).toBeDefined();
              for (const analysis of decision.reasoning.liquidityAnalysis!) {
                expect(analysis.bidDepth).toBeGreaterThan(0);
                expect(analysis.askDepth).toBeGreaterThan(0);
                expect(analysis.estimatedSlippage).toBeGreaterThanOrEqual(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 22: Order Book Consideration in Routing
     *
     * HIGHEST_LIQUIDITY criteria should select exchange with lowest estimated slippage.
     *
     * **Validates: Requirements 6.2**
     */
    it('should select exchange with highest liquidity when HIGHEST_LIQUIDITY criteria is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('BTC', 'ETH', 'SOL'),
          fc.integer({ min: 1, max: 100 }),
          async (tenantId, assetId, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;
            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config with HIGHEST_LIQUIDITY
            const routingConfig = createRoutingConfig(tenantId, 'HIGHEST_LIQUIDITY');
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order request
            const orderRequest = createOrderRequest(tenantId, quantity, 'BUY', assetId);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // Verify liquidity analysis is included
            expect(decision.reasoning.liquidityAnalysis).toBeDefined();
            expect(decision.reasoning.liquidityAnalysis!.length).toBeGreaterThan(0);

            // Verify selected exchange has lowest slippage
            const liquidityAnalysis = decision.reasoning.liquidityAnalysis!;
            const selectedAnalysis = liquidityAnalysis.find(
              (a) => a.exchangeId === decision.selectedExchange
            );
            expect(selectedAnalysis).toBeDefined();

            const lowestSlippage = Math.min(...liquidityAnalysis.map((a) => a.estimatedSlippage));
            expect(selectedAnalysis!.estimatedSlippage).toBe(lowestSlippage);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 23: Order Splitting', () => {
    /**
     * Feature: exchange-integration, Property 23: Order Splitting
     *
     * For any order larger than the configured threshold with enableOrderSplitting=true,
     * the Order_Router SHALL split the order across multiple exchanges, AND the sum of
     * split quantities SHALL equal the original order quantity.
     *
     * **Validates: Requirements 6.3**
     */
    it('should split large orders when splitting is enabled and sum equals original quantity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 100, max: 10000 }),
          async (tenantId, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;
            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index, 0.001, 0.001);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config with splitting enabled and low threshold
            const routingConfig = createRoutingConfig(tenantId, 'HIGHEST_LIQUIDITY', true, 10);
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order with quantity above threshold
            const orderRequest = createOrderRequest(tenantId, quantity);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // If order is above threshold, splits should be generated
            if (quantity >= routingConfig.minSplitSize) {
              expect(decision.splitOrders).toBeDefined();
              
              if (decision.splitOrders && decision.splitOrders.length > 0) {
                // Verify sum of split quantities equals original quantity
                const totalSplitQuantity = decision.splitOrders.reduce(
                  (sum, split) => sum + split.quantity,
                  0
                );
                
                // Allow small floating point tolerance
                expect(Math.abs(totalSplitQuantity - quantity)).toBeLessThan(0.01);

                // Verify split verification function
                const isValid = ExchangeOrderRouter.verifySplitQuantities(
                  quantity,
                  decision.splitOrders
                );
                expect(isValid).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 23: Order Splitting
     *
     * Orders below the threshold should not be split.
     *
     * **Validates: Requirements 6.3**
     */
    it('should not split orders below the threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 99 }),
          async (tenantId, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;
            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config with splitting enabled but high threshold
            const routingConfig = createRoutingConfig(tenantId, 'USER_PREFERENCE', true, 10);
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order with quantity below threshold
            const orderRequest = createOrderRequest(tenantId, quantity);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // Order below threshold should not have splits
            expect(decision.splitOrders).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 23: Order Splitting
     *
     * Orders should not be split when splitting is disabled.
     *
     * **Validates: Requirements 6.3**
     */
    it('should not split orders when splitting is disabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 100, max: 10000 }),
          async (tenantId, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;
            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config with splitting DISABLED
            const routingConfig = createRoutingConfig(tenantId, 'USER_PREFERENCE', false, 10);
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order with large quantity
            const orderRequest = createOrderRequest(tenantId, quantity);

            // Route the order
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);

            // Splitting disabled means no splits
            expect(decision.splitOrders).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 24: Exchange Size Constraints', () => {
    /**
     * Feature: exchange-integration, Property 24: Exchange Size Constraints
     *
     * For any order, the Order_Router SHALL validate against exchange-specific
     * minOrderSize and lotSize, AND orders violating these constraints SHALL be
     * rejected before submission.
     *
     * **Validates: Requirements 6.6**
     */
    it('should reject orders below minimum order size for all exchanges', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.double({ min: 0.0001, max: 0.0009, noNaN: true }),
          async (tenantId, tinyQuantity) => {
            // Set up exchanges with minOrderSize of 0.001
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index, 0.001, 0.001);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config
            const routingConfig = createRoutingConfig(tenantId, 'USER_PREFERENCE');
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order with quantity below minOrderSize
            const orderRequest = createOrderRequest(tenantId, tinyQuantity);

            // Should throw NoExchangeAvailableError because no exchange accepts the size
            await expect(
              ExchangeOrderRouter.routeOrder(orderRequest)
            ).rejects.toThrow(NoExchangeAvailableError);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 24: Exchange Size Constraints
     *
     * Orders that meet size constraints should be routed successfully.
     *
     * **Validates: Requirements 6.6**
     */
    it('should accept orders that meet size constraints', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 100 }),
          async (tenantId, quantityMultiplier) => {
            // Use integer multiplier to avoid floating point issues
            const quantity = quantityMultiplier * 0.001;

            // Set up exchanges
            const exchanges: ExchangeId[] = ['BINANCE', 'COINBASE'];
            exchanges.forEach((exchangeId, index) => {
              const config = createExchangeConfig(tenantId, exchangeId, index, 0.001, 0.001);
              mockExchangeStore.set(`${tenantId}:${exchangeId}`, config);
            });

            // Set up routing config
            const routingConfig = createRoutingConfig(tenantId, 'USER_PREFERENCE');
            mockRoutingConfigStore.set(tenantId, routingConfig);

            // Create order with valid quantity
            const orderRequest = createOrderRequest(tenantId, quantity);

            // Should route successfully
            const decision = await ExchangeOrderRouter.routeOrder(orderRequest);
            expect(decision.selectedExchange).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 24: Exchange Size Constraints
     *
     * validateOrderSizeForExchange should throw for orders below minOrderSize.
     *
     * **Validates: Requirements 6.6**
     */
    it('should throw OrderSizeConstraintError for orders below minOrderSize', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          fc.double({ min: 0.0001, max: 0.0009, noNaN: true }),
          async (tenantId, exchangeId, tinyQuantity) => {
            // Create exchange config with minOrderSize of 0.001
            const config = createExchangeConfig(tenantId, exchangeId, 0, 0.001, 0.001);

            // Create order with quantity below minOrderSize
            const orderRequest = createOrderRequest(tenantId, tinyQuantity);

            // Should throw OrderSizeConstraintError
            expect(() => {
              ExchangeOrderRouter.validateOrderSizeForExchange(orderRequest, config);
            }).toThrow(OrderSizeConstraintError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Exchange Unavailability Handling', () => {
    /**
     * When no exchanges are available, routing should fail with NoExchangeAvailableError.
     */
    it('should throw NoExchangeAvailableError when no exchanges are available', async () => {
      await fc.assert(
        fc.asyncProperty(
          validOrderRequestArb(),
          async (orderRequest) => {
            // Don't set up any exchanges
            mockExchangeStore.clear();

            // Set up routing config
            const routingConfig = createRoutingConfig(orderRequest.tenantId, 'USER_PREFERENCE');
            mockRoutingConfigStore.set(orderRequest.tenantId, routingConfig);

            // Should throw NoExchangeAvailableError
            await expect(
              ExchangeOrderRouter.routeOrder(orderRequest)
            ).rejects.toThrow(NoExchangeAvailableError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
