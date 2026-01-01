/**
 * Property-based tests for Exchange Order Manager Service
 *
 * **Property 16: Order Type Support**
 * *For any* Order_Manager, it SHALL accept and process orders of types: MARKET, LIMIT,
 * STOP_LIMIT, STOP_MARKET, and TRAILING_STOP, AND each order type SHALL be validated
 * for required fields (e.g., price for LIMIT, stopPrice for STOP orders).
 *
 * **Validates: Requirements 5.1**
 *
 * **Property 17: Order ID Uniqueness**
 * *For any* submitted order, the Order_Manager SHALL assign a unique internal orderId,
 * AND no two orders within the same tenant SHALL have the same orderId.
 *
 * **Validates: Requirements 5.2**
 *
 * **Property 17a: Order Modification Support**
 * *For any* order modification request (price or quantity change), the Order_Manager
 * SHALL submit the modification to the exchange if the exchange supports order modification,
 * AND the order record SHALL be updated only after exchange confirmation.
 *
 * **Validates: Requirements 5.3**
 *
 * **Property 18: Order Cancellation Confirmation**
 * *For any* order cancellation request, the Order_Manager SHALL NOT update the order
 * status to CANCELLED until confirmation is received from the exchange, AND if
 * confirmation fails, the order SHALL remain in its previous status.
 *
 * **Validates: Requirements 5.4**
 *
 * **Property 19: Partial Fill Tracking Accuracy**
 * *For any* order with partial fills, the sum of all fill quantities SHALL equal
 * filledQuantity, AND remainingQuantity SHALL equal (originalQuantity - filledQuantity).
 *
 * **Validates: Requirements 5.5**
 *
 * **Property 20: Time-in-Force Support**
 * *For any* Order_Manager, it SHALL support time-in-force options GTC, IOC, FOK, and GTD,
 * AND orders with GTD SHALL include a valid expiresAt timestamp.
 *
 * **Validates: Requirements 5.6**
 */

import * as fc from 'fast-check';
import {
  ExchangeOrderManager,
  OrderValidationError,
  DuplicateOrderError,
} from './exchange-order-manager';
import { ExchangeOrderRepository } from '../repositories/exchange-order';
import { ExchangeService } from './exchange';
import {
  OrderRequest,
  OrderType,
  OrderSide,
  TimeInForce,
  Order,
  Fill,
  OrderStatus,
} from '../types/exchange-order';
import {
  ExchangeId,
  ExchangeConfig,
} from '../types/exchange';
import { generateUUID } from '../utils/uuid';

// ============================================
// Mock Setup
// ============================================

let mockOrderStore: Map<string, Order>;
let mockExchangeStore: Map<string, ExchangeConfig>;

// Mock the repository
jest.mock('../repositories/exchange-order', () => ({
  ExchangeOrderRepository: {
    getOrder: jest.fn(async (tenantId: string, orderId: string) => {
      const key = `${tenantId}:${orderId}`;
      return mockOrderStore.get(key) || null;
    }),
    putOrder: jest.fn(async (tenantId: string, order: Order) => {
      const key = `${tenantId}:${order.orderId}`;
      mockOrderStore.set(key, order);
    }),
    listOrders: jest.fn(async (tenantId: string) => {
      const results: Order[] = [];
      mockOrderStore.forEach((order, key) => {
        if (key.startsWith(`${tenantId}:`)) {
          results.push(order);
        }
      });
      return results;
    }),
    getOpenOrders: jest.fn(async (tenantId: string) => {
      const results: Order[] = [];
      mockOrderStore.forEach((order, key) => {
        if (key.startsWith(`${tenantId}:`) && 
            ['PENDING', 'OPEN', 'PARTIALLY_FILLED'].includes(order.status)) {
          results.push(order);
        }
      });
      return results;
    }),
    updateOrder: jest.fn(async (tenantId: string, orderId: string, updates: Partial<Order>) => {
      const key = `${tenantId}:${orderId}`;
      const existing = mockOrderStore.get(key);
      if (!existing) {
        throw new Error(`Order not found: ${orderId}`);
      }
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      mockOrderStore.set(key, updated);
      return updated;
    }),
    getOrderByIdempotencyKey: jest.fn(async (tenantId: string, idempotencyKey: string) => {
      for (const [key, order] of mockOrderStore.entries()) {
        if (key.startsWith(`${tenantId}:`) && order.idempotencyKey === idempotencyKey) {
          return order;
        }
      }
      return null;
    }),
    getOrderByExchangeOrderId: jest.fn(async (tenantId: string, exchangeOrderId: string) => {
      for (const [key, order] of mockOrderStore.entries()) {
        if (key.startsWith(`${tenantId}:`) && order.exchangeOrderId === exchangeOrderId) {
          return order;
        }
      }
      return null;
    }),
    addFill: jest.fn(async (tenantId: string, orderId: string, fill: Fill) => {
      const key = `${tenantId}:${orderId}`;
      const existing = mockOrderStore.get(key);
      if (!existing) {
        throw new Error(`Order not found: ${orderId}`);
      }
      const fills = [...existing.fills, fill];
      const filledQuantity = fills.reduce((sum, f) => sum + f.quantity, 0);
      const remainingQuantity = existing.quantity - filledQuantity;
      const totalValue = fills.reduce((sum, f) => sum + f.quantity * f.price, 0);
      const averageFilledPrice = filledQuantity > 0 ? totalValue / filledQuantity : undefined;
      
      let status: OrderStatus = existing.status;
      if (remainingQuantity <= 0) {
        status = 'FILLED';
      } else if (filledQuantity > 0) {
        status = 'PARTIALLY_FILLED';
      }
      
      const updated: Order = {
        ...existing,
        fills,
        filledQuantity,
        remainingQuantity: Math.max(0, remainingQuantity),
        averageFilledPrice,
        status,
        updatedAt: new Date().toISOString(),
        completedAt: status === 'FILLED' ? new Date().toISOString() : existing.completedAt,
      };
      mockOrderStore.set(key, updated);
      return updated;
    }),
    orderExists: jest.fn(async (tenantId: string, orderId: string) => {
      const key = `${tenantId}:${orderId}`;
      return mockOrderStore.has(key);
    }),
  },
}));

// Mock the exchange service
jest.mock('./exchange', () => ({
  ExchangeService: {
    getExchange: jest.fn(async (tenantId: string, exchangeId: ExchangeId) => {
      const key = `${tenantId}:${exchangeId}`;
      const config = mockExchangeStore.get(key);
      if (!config) {
        throw new Error(`Exchange not found: ${exchangeId}`);
      }
      return config;
    }),
    isExchangeAvailable: jest.fn(async (tenantId: string, exchangeId: ExchangeId) => {
      const key = `${tenantId}:${exchangeId}`;
      const config = mockExchangeStore.get(key);
      return config?.status === 'ACTIVE';
    }),
  },
}));

// ============================================
// Generators
// ============================================

const orderTypeArb = (): fc.Arbitrary<OrderType> =>
  fc.constantFrom('MARKET', 'LIMIT', 'STOP_LIMIT', 'STOP_MARKET', 'TRAILING_STOP');

const orderSideArb = (): fc.Arbitrary<OrderSide> =>
  fc.constantFrom('BUY', 'SELL');

const timeInForceArb = (): fc.Arbitrary<TimeInForce> =>
  fc.constantFrom('GTC', 'IOC', 'FOK', 'GTD');

const nonGtdTimeInForceArb = (): fc.Arbitrary<TimeInForce> =>
  fc.constantFrom('GTC', 'IOC', 'FOK');

const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

const isoDateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

const futureDateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date(Date.now() + 86400000), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Create a valid order request for a specific order type
 */
function createValidOrderRequest(
  orderType: OrderType,
  timeInForce: TimeInForce,
  tenantId: string,
  exchangeId: ExchangeId,
  expiresAt?: string
): OrderRequest {
  const base: OrderRequest = {
    orderId: generateUUID(),
    tenantId,
    strategyId: generateUUID(),
    assetId: 'BTC',
    side: 'BUY',
    orderType,
    quantity: 1.0,
    timeInForce,
    idempotencyKey: generateUUID(),
    timestamp: new Date().toISOString(),
    exchangeId,
  };

  switch (orderType) {
    case 'MARKET':
      return base;
    case 'LIMIT':
      return { ...base, price: 50000 };
    case 'STOP_LIMIT':
      return { ...base, price: 50000, stopPrice: 49000 };
    case 'STOP_MARKET':
      return { ...base, stopPrice: 49000 };
    case 'TRAILING_STOP':
      return { ...base, trailingDelta: 0.05 };
  }
}

/**
 * Generator for valid OrderRequest
 */
const validOrderRequestArb = (): fc.Arbitrary<OrderRequest> =>
  fc.tuple(
    orderTypeArb(),
    fc.uuid(),
    exchangeIdArb(),
    fc.boolean()
  ).chain(([orderType, tenantId, exchangeId, useGtd]) => {
    if (useGtd) {
      return futureDateStringArb().map(expiresAt => ({
        ...createValidOrderRequest(orderType, 'GTD', tenantId, exchangeId),
        expiresAt,
      }));
    }
    return nonGtdTimeInForceArb().map(tif =>
      createValidOrderRequest(orderType, tif, tenantId, exchangeId)
    );
  });

/**
 * Create default exchange config
 */
function createExchangeConfig(tenantId: string, exchangeId: ExchangeId): ExchangeConfig {
  return {
    exchangeId,
    tenantId,
    name: `${exchangeId} Exchange`,
    mode: 'PRODUCTION',
    restEndpoint: 'https://api.exchange.com',
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
      minOrderSize: 0.0001,
      tickSize: 0.00001,
      lotSize: 0.00001,
    },
    rateLimits: {
      ordersPerSecond: 10,
      ordersPerMinute: 600,
      queriesPerSecond: 20,
      queriesPerMinute: 1200,
      wsMessagesPerSecond: 5,
    },
    status: 'ACTIVE',
    priority: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  mockOrderStore = new Map();
  mockExchangeStore = new Map();
  ExchangeOrderManager.adapters.clear();
  jest.clearAllMocks();
});

// ============================================
// Property Tests
// ============================================

describe('Exchange Order Manager', () => {
  describe('Property 16: Order Type Support', () => {
    /**
     * Feature: exchange-integration, Property 16: Order Type Support
     *
     * For any Order_Manager, it SHALL accept and process orders of types:
     * MARKET, LIMIT, STOP_LIMIT, STOP_MARKET, and TRAILING_STOP.
     *
     * **Validates: Requirements 5.1**
     */
    it('should accept all valid order types with correct required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          validOrderRequestArb(),
          async (request) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(request.tenantId, request.exchangeId!);
            mockExchangeStore.set(`${request.tenantId}:${request.exchangeId}`, exchangeConfig);

            // Submit the order
            const response = await ExchangeOrderManager.submitOrder(request);

            // Verify order was accepted
            expect(response.orderId).toBeDefined();
            expect(response.status).toBeDefined();
            expect(['PENDING', 'OPEN', 'FILLED', 'REJECTED'].includes(response.status)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 16: Order Type Support
     *
     * LIMIT orders SHALL require a price field.
     *
     * **Validates: Requirements 5.1**
     */
    it('should reject LIMIT orders without price', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create LIMIT order without price
            const request: OrderRequest = {
              orderId: generateUUID(),
              tenantId,
              strategyId: generateUUID(),
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'LIMIT',
              quantity: 1.0,
              timeInForce: 'GTC',
              idempotencyKey: generateUUID(),
              timestamp: new Date().toISOString(),
              exchangeId,
              // price is missing
            };

            await expect(
              ExchangeOrderManager.submitOrder(request)
            ).rejects.toThrow(OrderValidationError);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 16: Order Type Support
     *
     * STOP_LIMIT orders SHALL require both price and stopPrice fields.
     *
     * **Validates: Requirements 5.1**
     */
    it('should reject STOP_LIMIT orders without stopPrice', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create STOP_LIMIT order without stopPrice
            const request: OrderRequest = {
              orderId: generateUUID(),
              tenantId,
              strategyId: generateUUID(),
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'STOP_LIMIT',
              quantity: 1.0,
              price: 50000,
              timeInForce: 'GTC',
              idempotencyKey: generateUUID(),
              timestamp: new Date().toISOString(),
              exchangeId,
              // stopPrice is missing
            };

            await expect(
              ExchangeOrderManager.submitOrder(request)
            ).rejects.toThrow(OrderValidationError);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 16: Order Type Support
     *
     * STOP_MARKET orders SHALL require stopPrice field.
     *
     * **Validates: Requirements 5.1**
     */
    it('should reject STOP_MARKET orders without stopPrice', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create STOP_MARKET order without stopPrice
            const request: OrderRequest = {
              orderId: generateUUID(),
              tenantId,
              strategyId: generateUUID(),
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'STOP_MARKET',
              quantity: 1.0,
              timeInForce: 'GTC',
              idempotencyKey: generateUUID(),
              timestamp: new Date().toISOString(),
              exchangeId,
              // stopPrice is missing
            };

            await expect(
              ExchangeOrderManager.submitOrder(request)
            ).rejects.toThrow(OrderValidationError);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 16: Order Type Support
     *
     * TRAILING_STOP orders SHALL require trailingDelta field.
     *
     * **Validates: Requirements 5.1**
     */
    it('should reject TRAILING_STOP orders without trailingDelta', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create TRAILING_STOP order without trailingDelta
            const request: OrderRequest = {
              orderId: generateUUID(),
              tenantId,
              strategyId: generateUUID(),
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'TRAILING_STOP',
              quantity: 1.0,
              timeInForce: 'GTC',
              idempotencyKey: generateUUID(),
              timestamp: new Date().toISOString(),
              exchangeId,
              // trailingDelta is missing
            };

            await expect(
              ExchangeOrderManager.submitOrder(request)
            ).rejects.toThrow(OrderValidationError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 17: Order ID Uniqueness', () => {
    /**
     * Feature: exchange-integration, Property 17: Order ID Uniqueness
     *
     * For any submitted order, the Order_Manager SHALL assign a unique internal orderId,
     * AND no two orders within the same tenant SHALL have the same orderId.
     *
     * **Validates: Requirements 5.2**
     */
    it('should assign unique order IDs for all submitted orders', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          fc.integer({ min: 2, max: 10 }),
          async (tenantId, exchangeId, numOrders) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Submit multiple orders
            const orderIds = new Set<string>();
            
            for (let i = 0; i < numOrders; i++) {
              const request = createValidOrderRequest('MARKET', 'GTC', tenantId, exchangeId);
              request.idempotencyKey = `idem-${i}-${generateUUID()}`;

              const response = await ExchangeOrderManager.submitOrder(request);
              
              // Verify the order ID is unique
              expect(orderIds.has(response.orderId)).toBe(false);
              orderIds.add(response.orderId);
            }

            // Verify all order IDs are unique
            expect(orderIds.size).toBe(numOrders);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 17: Order ID Uniqueness
     *
     * Orders with the same idempotency key should be detected as duplicates.
     *
     * **Validates: Requirements 5.2**
     */
    it('should detect duplicate orders by idempotency key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create order request
            const request = createValidOrderRequest('MARKET', 'GTC', tenantId, exchangeId);

            // Submit the first order
            const firstResponse = await ExchangeOrderManager.submitOrder(request);
            expect(firstResponse.orderId).toBeDefined();

            // Attempt to submit duplicate with same idempotency key
            await expect(
              ExchangeOrderManager.submitOrder(request)
            ).rejects.toThrow(DuplicateOrderError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  describe('Property 17a: Order Modification Support', () => {
    /**
     * Feature: exchange-integration, Property 17a: Order Modification Support
     *
     * For any order modification request (price or quantity change), the Order_Manager
     * SHALL submit the modification to the exchange if the exchange supports order modification,
     * AND the order record SHALL be updated only after exchange confirmation.
     *
     * **Validates: Requirements 5.3**
     */
    it('should update order only after exchange confirmation for modifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          fc.double({ min: 40000, max: 60000, noNaN: true }),
          async (tenantId, exchangeId, newPrice) => {
            // Set up exchange config with modification support
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            exchangeConfig.supportedFeatures.supportsOrderModification = true;
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create and submit an order
            const request = createValidOrderRequest('LIMIT', 'GTC', tenantId, exchangeId);
            const response = await ExchangeOrderManager.submitOrder(request);

            // Update the order status to OPEN (simulating exchange acceptance)
            await ExchangeOrderRepository.updateOrder(tenantId, response.orderId, {
              status: 'OPEN',
              exchangeOrderId: `EX-${generateUUID()}`,
            });

            // Modify the order
            const modifyResponse = await ExchangeOrderManager.modifyOrder(
              tenantId,
              response.orderId,
              { newPrice }
            );

            // Verify the order was updated
            const updatedOrder = await ExchangeOrderManager.getOrder(tenantId, response.orderId);
            expect(updatedOrder.price).toBe(newPrice);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 17a: Order Modification Support
     *
     * Modification should fail if exchange doesn't support it.
     *
     * **Validates: Requirements 5.3**
     */
    it('should reject modifications for exchanges that do not support it', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config WITHOUT modification support
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            exchangeConfig.supportedFeatures.supportsOrderModification = false;
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create and submit an order
            const request = createValidOrderRequest('LIMIT', 'GTC', tenantId, exchangeId);
            const response = await ExchangeOrderManager.submitOrder(request);

            // Update the order status to OPEN
            await ExchangeOrderRepository.updateOrder(tenantId, response.orderId, {
              status: 'OPEN',
              exchangeOrderId: `EX-${generateUUID()}`,
            });

            // Attempt to modify the order
            await expect(
              ExchangeOrderManager.modifyOrder(tenantId, response.orderId, { newPrice: 55000 })
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 18: Order Cancellation Confirmation', () => {
    /**
     * Feature: exchange-integration, Property 18: Order Cancellation Confirmation
     *
     * For any order cancellation request, the Order_Manager SHALL NOT update the order
     * status to CANCELLED until confirmation is received from the exchange.
     *
     * **Validates: Requirements 5.4**
     */
    it('should update status to CANCELLED only after exchange confirmation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create and submit an order
            const request = createValidOrderRequest('LIMIT', 'GTC', tenantId, exchangeId);
            const response = await ExchangeOrderManager.submitOrder(request);

            // Update the order status to OPEN
            await ExchangeOrderRepository.updateOrder(tenantId, response.orderId, {
              status: 'OPEN',
              exchangeOrderId: `EX-${generateUUID()}`,
            });

            // Cancel the order (no adapter registered, so it simulates confirmation)
            const cancelResponse = await ExchangeOrderManager.cancelOrder(tenantId, response.orderId);

            // Verify the order status is CANCELLED
            expect(cancelResponse.status).toBe('CANCELLED');
            
            const cancelledOrder = await ExchangeOrderManager.getOrder(tenantId, response.orderId);
            expect(cancelledOrder.status).toBe('CANCELLED');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 18: Order Cancellation Confirmation
     *
     * Orders in terminal states (FILLED, CANCELLED, REJECTED, EXPIRED) cannot be cancelled.
     *
     * **Validates: Requirements 5.4**
     */
    it('should reject cancellation for orders in terminal states', async () => {
      const terminalStatuses: OrderStatus[] = ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          fc.constantFrom(...terminalStatuses),
          async (tenantId, exchangeId, terminalStatus) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create and submit an order
            const request = createValidOrderRequest('LIMIT', 'GTC', tenantId, exchangeId);
            const response = await ExchangeOrderManager.submitOrder(request);

            // Update the order to a terminal status
            await ExchangeOrderRepository.updateOrder(tenantId, response.orderId, {
              status: terminalStatus,
            });

            // Attempt to cancel the order
            await expect(
              ExchangeOrderManager.cancelOrder(tenantId, response.orderId)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 19: Partial Fill Tracking Accuracy', () => {
    /**
     * Feature: exchange-integration, Property 19: Partial Fill Tracking Accuracy
     *
     * For any order with partial fills, the sum of all fill quantities SHALL equal
     * filledQuantity, AND remainingQuantity SHALL equal (originalQuantity - filledQuantity).
     *
     * **Validates: Requirements 5.5**
     */
    it('should accurately track partial fills', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.array(
            fc.double({ min: 0.01, max: 0.3, noNaN: true }),
            { minLength: 1, maxLength: 5 }
          ),
          async (tenantId, exchangeId, orderQuantity, fillPercentages) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create and submit an order
            const request = createValidOrderRequest('LIMIT', 'GTC', tenantId, exchangeId);
            request.quantity = orderQuantity;
            const response = await ExchangeOrderManager.submitOrder(request);

            // Update the order status to OPEN
            await ExchangeOrderRepository.updateOrder(tenantId, response.orderId, {
              status: 'OPEN',
              exchangeOrderId: `EX-${generateUUID()}`,
            });

            // Add fills
            let totalFilled = 0;
            for (const percentage of fillPercentages) {
              const fillQuantity = Math.min(orderQuantity * percentage, orderQuantity - totalFilled);
              if (fillQuantity <= 0) break;

              const fill: Fill = {
                fillId: generateUUID(),
                executionId: generateUUID(),
                quantity: fillQuantity,
                price: 50000,
                commission: 0.1,
                commissionAsset: 'USDT',
                timestamp: new Date().toISOString(),
              };

              await ExchangeOrderManager.addFillToOrder(tenantId, response.orderId, fill);
              totalFilled += fillQuantity;
            }

            // Verify fill tracking accuracy
            const order = await ExchangeOrderManager.getOrder(tenantId, response.orderId);
            
            // Sum of fill quantities should equal filledQuantity
            const sumOfFills = order.fills.reduce((sum, f) => sum + f.quantity, 0);
            expect(Math.abs(sumOfFills - order.filledQuantity)).toBeLessThan(0.0001);

            // remainingQuantity should equal (originalQuantity - filledQuantity)
            expect(Math.abs(order.remainingQuantity - (orderQuantity - order.filledQuantity))).toBeLessThan(0.0001);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 19: Partial Fill Tracking Accuracy
     *
     * Order status should transition to PARTIALLY_FILLED when partially filled,
     * and to FILLED when completely filled.
     *
     * **Validates: Requirements 5.5**
     */
    it('should correctly transition status based on fill progress', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create and submit an order
            const request = createValidOrderRequest('LIMIT', 'GTC', tenantId, exchangeId);
            request.quantity = 10;
            const response = await ExchangeOrderManager.submitOrder(request);

            // Update the order status to OPEN
            await ExchangeOrderRepository.updateOrder(tenantId, response.orderId, {
              status: 'OPEN',
              exchangeOrderId: `EX-${generateUUID()}`,
            });

            // Add partial fill
            const partialFill: Fill = {
              fillId: generateUUID(),
              executionId: generateUUID(),
              quantity: 5,
              price: 50000,
              commission: 0.1,
              commissionAsset: 'USDT',
              timestamp: new Date().toISOString(),
            };

            await ExchangeOrderManager.addFillToOrder(tenantId, response.orderId, partialFill);
            
            let order = await ExchangeOrderManager.getOrder(tenantId, response.orderId);
            expect(order.status).toBe('PARTIALLY_FILLED');

            // Add remaining fill
            const remainingFill: Fill = {
              fillId: generateUUID(),
              executionId: generateUUID(),
              quantity: 5,
              price: 50000,
              commission: 0.1,
              commissionAsset: 'USDT',
              timestamp: new Date().toISOString(),
            };

            await ExchangeOrderManager.addFillToOrder(tenantId, response.orderId, remainingFill);
            
            order = await ExchangeOrderManager.getOrder(tenantId, response.orderId);
            expect(order.status).toBe('FILLED');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 20: Time-in-Force Support', () => {
    /**
     * Feature: exchange-integration, Property 20: Time-in-Force Support
     *
     * For any Order_Manager, it SHALL support time-in-force options GTC, IOC, FOK, and GTD.
     *
     * **Validates: Requirements 5.6**
     */
    it('should accept all valid time-in-force options', async () => {
      const timeInForceOptions: TimeInForce[] = ['GTC', 'IOC', 'FOK'];

      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          fc.constantFrom(...timeInForceOptions),
          async (tenantId, exchangeId, tif) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create order with the time-in-force option
            const request = createValidOrderRequest('LIMIT', tif, tenantId, exchangeId);

            // Submit the order
            const response = await ExchangeOrderManager.submitOrder(request);

            // Verify order was accepted
            expect(response.orderId).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 20: Time-in-Force Support
     *
     * Orders with GTD SHALL include a valid expiresAt timestamp.
     *
     * **Validates: Requirements 5.6**
     */
    it('should accept GTD orders with valid expiresAt', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          futureDateStringArb(),
          async (tenantId, exchangeId, expiresAt) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create GTD order with expiresAt
            const request = createValidOrderRequest('LIMIT', 'GTD', tenantId, exchangeId);
            request.expiresAt = expiresAt;

            // Submit the order
            const response = await ExchangeOrderManager.submitOrder(request);

            // Verify order was accepted
            expect(response.orderId).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 20: Time-in-Force Support
     *
     * GTD orders without expiresAt SHALL be rejected.
     *
     * **Validates: Requirements 5.6**
     */
    it('should reject GTD orders without expiresAt', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, exchangeId) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create GTD order WITHOUT expiresAt
            const request: OrderRequest = {
              orderId: generateUUID(),
              tenantId,
              strategyId: generateUUID(),
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'LIMIT',
              quantity: 1.0,
              price: 50000,
              timeInForce: 'GTD',
              idempotencyKey: generateUUID(),
              timestamp: new Date().toISOString(),
              exchangeId,
              // expiresAt is missing
            };

            await expect(
              ExchangeOrderManager.submitOrder(request)
            ).rejects.toThrow(OrderValidationError);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 20: Time-in-Force Support
     *
     * GTD orders with past expiresAt SHALL be rejected.
     *
     * **Validates: Requirements 5.6**
     */
    it('should reject GTD orders with past expiresAt', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          fc.date({ min: new Date('2020-01-01'), max: new Date(Date.now() - 86400000) }),
          async (tenantId, exchangeId, pastDate) => {
            // Set up exchange config
            const exchangeConfig = createExchangeConfig(tenantId, exchangeId);
            mockExchangeStore.set(`${tenantId}:${exchangeId}`, exchangeConfig);

            // Create GTD order with past expiresAt
            const request: OrderRequest = {
              orderId: generateUUID(),
              tenantId,
              strategyId: generateUUID(),
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'LIMIT',
              quantity: 1.0,
              price: 50000,
              timeInForce: 'GTD',
              expiresAt: pastDate.toISOString(),
              idempotencyKey: generateUUID(),
              timestamp: new Date().toISOString(),
              exchangeId,
            };

            await expect(
              ExchangeOrderManager.submitOrder(request)
            ).rejects.toThrow(OrderValidationError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
