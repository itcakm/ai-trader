/**
 * Property-based tests for Exchange Manual Intervention Service
 *
 * **Property 39: Stuck Order Identification**
 * *For any* order that remains in an uncertain state (PENDING, OPEN with no updates)
 * beyond a configured threshold, it SHALL be flagged as a StuckOrder and made
 * available for manual intervention.
 *
 * **Validates: Requirements 10.6**
 */

import * as fc from 'fast-check';
import {
  ExchangeManualInterventionService,
  DEFAULT_STUCK_ORDER_CONFIG,
  StuckOrderNotFoundError,
} from './exchange-manual-intervention';
import { ExchangeOrderRepository } from '../repositories/exchange-order';
import { ExchangeOrderManager } from './exchange-order-manager';
import {
  Order,
  OrderStatus,
  OrderType,
  OrderSide,
  TimeInForce,
} from '../types/exchange-order';
import { ExchangeId } from '../types/exchange';
import { generateUUID } from '../utils/uuid';

// ============================================
// Mock Setup
// ============================================

let mockOrderStore: Map<string, Order>;

// Mock the repository
jest.mock('../repositories/exchange-order', () => ({
  ExchangeOrderRepository: {
    getOrder: jest.fn(async (tenantId: string, orderId: string) => {
      const key = `${tenantId}:${orderId}`;
      return mockOrderStore.get(key) || null;
    }),
    getOrdersByStatus: jest.fn(async (tenantId: string, statuses: OrderStatus[]) => {
      const results: Order[] = [];
      mockOrderStore.forEach((order, key) => {
        if (key.startsWith(`${tenantId}:`) && statuses.includes(order.status)) {
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
  },
}));

// Mock the order manager
jest.mock('./exchange-order-manager', () => ({
  ExchangeOrderManager: {
    adapters: new Map(),
    getAdapter: jest.fn(() => undefined),
    cancelOrder: jest.fn(async (tenantId: string, orderId: string) => {
      // Update the mock store when cancelling
      const key = `${tenantId}:${orderId}`;
      const existing = mockOrderStore.get(key);
      if (existing) {
        const updated: Order = { 
          ...existing, 
          status: 'CANCELLED' as OrderStatus, 
          completedAt: new Date().toISOString() 
        };
        mockOrderStore.set(key, updated);
      }
      return {
        orderId,
        exchangeOrderId: `EX-${orderId}`,
        status: 'CANCELLED' as const,
        cancelledAt: new Date().toISOString(),
      };
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
  fc.constantFrom('GTC', 'IOC', 'FOK');

const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

const uncertainStatusArb = (): fc.Arbitrary<OrderStatus> =>
  fc.constantFrom('PENDING', 'OPEN');

const terminalStatusArb = (): fc.Arbitrary<OrderStatus> =>
  fc.constantFrom('FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');

/**
 * Generator for a timestamp in the past by a specified number of milliseconds
 */
const pastTimestampArb = (msAgo: number): fc.Arbitrary<string> =>
  fc.constant(new Date(Date.now() - msAgo).toISOString());

/**
 * Generator for a recent timestamp (within threshold)
 */
const recentTimestampArb = (): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: 1000 }).map(ms => new Date(Date.now() - ms).toISOString());

/**
 * Generator for a base order without status-specific fields
 */
const baseOrderArb = (): fc.Arbitrary<Omit<Order, 'status' | 'updatedAt'>> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    exchangeId: exchangeIdArb(),
    exchangeOrderId: fc.option(fc.uuid().map(id => `EX-${id}`), { nil: undefined }),
    assetId: fc.constantFrom('BTC', 'ETH', 'SOL', 'ADA'),
    side: orderSideArb(),
    orderType: orderTypeArb(),
    quantity: fc.double({ min: 0.01, max: 100, noNaN: true }),
    filledQuantity: fc.constant(0),
    remainingQuantity: fc.double({ min: 0.01, max: 100, noNaN: true }),
    price: fc.option(fc.double({ min: 1000, max: 100000, noNaN: true }), { nil: undefined }),
    stopPrice: fc.option(fc.double({ min: 1000, max: 100000, noNaN: true }), { nil: undefined }),
    averageFilledPrice: fc.option(fc.double({ min: 1000, max: 100000, noNaN: true }), { nil: undefined }),
    timeInForce: timeInForceArb(),
    idempotencyKey: fc.uuid(),
    fills: fc.constant([]),
    createdAt: fc.constant(new Date().toISOString()),
    submittedAt: fc.option(fc.constant(new Date().toISOString()), { nil: undefined }),
    completedAt: fc.option(fc.constant(undefined), { nil: undefined }),
  });

/**
 * Generator for a stuck PENDING order (beyond threshold)
 */
const stuckPendingOrderArb = (): fc.Arbitrary<Order> =>
  baseOrderArb().chain(base =>
    pastTimestampArb(DEFAULT_STUCK_ORDER_CONFIG.pendingThresholdMs + 60000).map(updatedAt => ({
      ...base,
      status: 'PENDING' as OrderStatus,
      updatedAt,
      remainingQuantity: base.quantity,
    }))
  );

/**
 * Generator for a stuck OPEN order (beyond threshold)
 */
const stuckOpenOrderArb = (): fc.Arbitrary<Order> =>
  baseOrderArb().chain(base =>
    pastTimestampArb(DEFAULT_STUCK_ORDER_CONFIG.openNoUpdateThresholdMs + 60000).map(updatedAt => ({
      ...base,
      status: 'OPEN' as OrderStatus,
      updatedAt,
      remainingQuantity: base.quantity,
    }))
  );

/**
 * Generator for a non-stuck order (recent update)
 */
const nonStuckOrderArb = (): fc.Arbitrary<Order> =>
  baseOrderArb().chain(base =>
    fc.tuple(uncertainStatusArb(), recentTimestampArb()).map(([status, updatedAt]) => ({
      ...base,
      status,
      updatedAt,
      remainingQuantity: base.quantity,
    }))
  );

/**
 * Generator for an order in terminal state
 */
const terminalOrderArb = (): fc.Arbitrary<Order> =>
  baseOrderArb().chain(base =>
    fc.tuple(terminalStatusArb(), recentTimestampArb()).map(([status, updatedAt]) => ({
      ...base,
      status,
      updatedAt,
      remainingQuantity: status === 'FILLED' ? 0 : base.quantity,
      filledQuantity: status === 'FILLED' ? base.quantity : 0,
      completedAt: new Date().toISOString(),
    }))
  );

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  mockOrderStore = new Map();
  ExchangeManualInterventionService.resetConfig();
  ExchangeManualInterventionService.clearAllStuckOrderTracking();
  jest.clearAllMocks();
});

// ============================================
// Property Tests
// ============================================

describe('Exchange Manual Intervention Service', () => {
  describe('Property 39: Stuck Order Identification', () => {
    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any order that remains in PENDING state beyond the configured threshold,
     * it SHALL be flagged as a StuckOrder.
     *
     * **Validates: Requirements 10.6**
     */
    it('should identify PENDING orders beyond threshold as stuck', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckPendingOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Get stuck orders
            const stuckOrders = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );

            // Verify the order is identified as stuck
            const found = stuckOrders.find(so => so.orderId === order.orderId);
            expect(found).toBeDefined();
            expect(found?.status).toBe('PENDING');
            expect(found?.exchangeId).toBe(order.exchangeId);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any order that remains in OPEN state with no updates beyond the configured
     * threshold, it SHALL be flagged as a StuckOrder.
     *
     * **Validates: Requirements 10.6**
     */
    it('should identify OPEN orders with no updates beyond threshold as stuck', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckOpenOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Get stuck orders
            const stuckOrders = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );

            // Verify the order is identified as stuck
            const found = stuckOrders.find(so => so.orderId === order.orderId);
            expect(found).toBeDefined();
            expect(found?.status).toBe('OPEN');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any order with recent updates (within threshold), it SHALL NOT be
     * flagged as stuck.
     *
     * **Validates: Requirements 10.6**
     */
    it('should not identify orders with recent updates as stuck', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonStuckOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Get stuck orders
            const stuckOrders = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );

            // Verify the order is NOT identified as stuck
            const found = stuckOrders.find(so => so.orderId === order.orderId);
            expect(found).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any order in a terminal state (FILLED, CANCELLED, REJECTED, EXPIRED),
     * it SHALL NOT be flagged as stuck regardless of update time.
     *
     * **Validates: Requirements 10.6**
     */
    it('should not identify terminal state orders as stuck', async () => {
      await fc.assert(
        fc.asyncProperty(
          terminalOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Get stuck orders
            const stuckOrders = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );

            // Verify the order is NOT identified as stuck
            const found = stuckOrders.find(so => so.orderId === order.orderId);
            expect(found).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any stuck order, it SHALL be made available for manual intervention
     * after exceeding the maximum resolution attempts.
     *
     * **Validates: Requirements 10.6**
     */
    it('should mark orders as requiring manual intervention after max resolution attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckPendingOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // First identify the order as stuck
            await ExchangeManualInterventionService.getStuckOrders(order.tenantId);

            // Simulate multiple failed resolution attempts with RECONCILE
            // (which will fail since no adapter is available)
            const maxAttempts = DEFAULT_STUCK_ORDER_CONFIG.maxResolutionAttempts;
            for (let i = 0; i < maxAttempts; i++) {
              try {
                await ExchangeManualInterventionService.resolveStuckOrder(
                  order.tenantId,
                  order.orderId,
                  { action: 'RECONCILE', reason: 'Test attempt', resolvedBy: 'test' }
                );
              } catch {
                // Expected to fail since no adapter is available
              }
            }

            // Get stuck orders requiring intervention
            const stuckOrders = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );

            const found = stuckOrders.find(so => so.orderId === order.orderId);
            // After max attempts, should require manual intervention
            expect(found).toBeDefined();
            expect(found!.resolutionAttempts).toBeGreaterThanOrEqual(maxAttempts);
            expect(found!.requiresManualIntervention).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any stuck order, the stuckSince timestamp SHALL be preserved across
     * multiple getStuckOrders calls.
     *
     * **Validates: Requirements 10.6**
     */
    it('should preserve stuckSince timestamp across multiple calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckPendingOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // First call to identify stuck order
            const firstCall = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );
            const firstFound = firstCall.find(so => so.orderId === order.orderId);
            expect(firstFound).toBeDefined();
            const originalStuckSince = firstFound!.stuckSince;

            // Second call should preserve stuckSince
            const secondCall = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );
            const secondFound = secondCall.find(so => so.orderId === order.orderId);
            expect(secondFound).toBeDefined();
            expect(secondFound!.stuckSince).toBe(originalStuckSince);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Stuck Order Resolution', () => {
    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any stuck order resolved with CANCEL action, the order status
     * SHALL be updated to CANCELLED.
     *
     * **Validates: Requirements 10.6**
     */
    it('should resolve stuck orders with CANCEL action', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckPendingOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Resolve with CANCEL
            await ExchangeManualInterventionService.resolveStuckOrder(
              order.tenantId,
              order.orderId,
              { action: 'CANCEL', reason: 'Test cancellation', resolvedBy: 'test' }
            );

            // Verify order is cancelled
            const updatedOrder = mockOrderStore.get(key);
            expect(updatedOrder?.status).toBe('CANCELLED');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any stuck order resolved with MARK_FILLED action, the order status
     * SHALL be updated to FILLED.
     *
     * **Validates: Requirements 10.6**
     */
    it('should resolve stuck orders with MARK_FILLED action', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckOpenOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Resolve with MARK_FILLED
            await ExchangeManualInterventionService.resolveStuckOrder(
              order.tenantId,
              order.orderId,
              { action: 'MARK_FILLED', reason: 'Manual fill confirmation', resolvedBy: 'test' }
            );

            // Verify order is filled
            const updatedOrder = mockOrderStore.get(key);
            expect(updatedOrder?.status).toBe('FILLED');
            expect(updatedOrder?.completedAt).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any stuck order resolved with MARK_REJECTED action, the order status
     * SHALL be updated to REJECTED.
     *
     * **Validates: Requirements 10.6**
     */
    it('should resolve stuck orders with MARK_REJECTED action', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckPendingOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Resolve with MARK_REJECTED
            await ExchangeManualInterventionService.resolveStuckOrder(
              order.tenantId,
              order.orderId,
              { action: 'MARK_REJECTED', reason: 'Exchange rejected', resolvedBy: 'test' }
            );

            // Verify order is rejected
            const updatedOrder = mockOrderStore.get(key);
            expect(updatedOrder?.status).toBe('REJECTED');
            expect(updatedOrder?.completedAt).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any non-existent order, resolution SHALL throw StuckOrderNotFoundError.
     *
     * **Validates: Requirements 10.6**
     */
    it('should throw error when resolving non-existent order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          async (tenantId, orderId) => {
            // Attempt to resolve non-existent order
            await expect(
              ExchangeManualInterventionService.resolveStuckOrder(
                tenantId,
                orderId,
                { action: 'CANCEL', reason: 'Test', resolvedBy: 'test' }
              )
            ).rejects.toThrow(StuckOrderNotFoundError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Force Cancel', () => {
    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any stuck order, forceCancel SHALL update the order status to CANCELLED.
     *
     * **Validates: Requirements 10.6**
     */
    it('should force cancel stuck orders', async () => {
      await fc.assert(
        fc.asyncProperty(
          stuckPendingOrderArb(),
          async (order) => {
            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Force cancel
            const response = await ExchangeManualInterventionService.forceCancel(
              order.tenantId,
              order.orderId
            );

            // Verify response
            expect(response.status).toBe('CANCELLED');
            expect(response.orderId).toBe(order.orderId);

            // Verify order is cancelled
            const updatedOrder = mockOrderStore.get(key);
            expect(updatedOrder?.status).toBe('CANCELLED');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Configuration', () => {
    /**
     * Feature: exchange-integration, Property 39: Stuck Order Identification
     *
     * For any custom threshold configuration, stuck order identification
     * SHALL respect the configured thresholds.
     *
     * **Validates: Requirements 10.6**
     */
    it('should respect custom threshold configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          baseOrderArb(),
          fc.integer({ min: 1000, max: 10000 }),
          async (baseOrder, customThresholdMs) => {
            // Set custom threshold
            ExchangeManualInterventionService.setConfig({
              pendingThresholdMs: customThresholdMs,
            });

            // Create order that is beyond custom threshold
            const order: Order = {
              ...baseOrder,
              status: 'PENDING',
              updatedAt: new Date(Date.now() - customThresholdMs - 1000).toISOString(),
              remainingQuantity: baseOrder.quantity,
            };

            // Store the order
            const key = `${order.tenantId}:${order.orderId}`;
            mockOrderStore.set(key, order);

            // Get stuck orders
            const stuckOrders = await ExchangeManualInterventionService.getStuckOrders(
              order.tenantId
            );

            // Verify the order is identified as stuck
            const found = stuckOrders.find(so => so.orderId === order.orderId);
            expect(found).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
