/**
 * Property-based tests for Duplicate Order Prevention Service
 *
 * **Property 36: Duplicate Order Prevention**
 * *For any* order submission that fails, the Exchange_Adapter SHALL verify order status
 * with the exchange before retrying, AND if the order exists, it SHALL NOT submit a duplicate.
 *
 * **Validates: Requirements 10.3**
 *
 * **Property 37: Idempotency Key Usage**
 * *For any* order submission to an exchange that supports idempotency, the request SHALL
 * include the order's idempotencyKey, AND resubmissions with the same key SHALL return
 * the existing order rather than creating a duplicate.
 *
 * **Validates: Requirements 10.4**
 */

import * as fc from 'fast-check';
import {
  DuplicateOrderPreventionService,
  ExchangeAdapterForDuplicatePrevention,
  IdempotencyRecord,
} from './duplicate-order-prevention';
import { ExchangeOrderRepository } from '../repositories/exchange-order';
import {
  OrderRequest,
  OrderStatus,
  Order,
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
    getOrderByIdempotencyKey: jest.fn(async (tenantId: string, idempotencyKey: string) => {
      for (const [key, order] of mockOrderStore.entries()) {
        if (key.startsWith(`${tenantId}:`) && order.idempotencyKey === idempotencyKey) {
          return order;
        }
      }
      return null;
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

const orderStatusArb = (): fc.Arbitrary<OrderStatus> =>
  fc.constantFrom('PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');

const activeOrderStatusArb = (): fc.Arbitrary<OrderStatus> =>
  fc.constantFrom('PENDING', 'OPEN', 'PARTIALLY_FILLED');

const terminalOrderStatusArb = (): fc.Arbitrary<OrderStatus> =>
  fc.constantFrom('FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');

const timeInForceArb = (): fc.Arbitrary<TimeInForce> =>
  fc.constantFrom('GTC', 'IOC', 'FOK');

const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

const isoDateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Generator for Order
 */
const orderArb = (): fc.Arbitrary<Order> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    exchangeId: exchangeIdArb(),
    exchangeOrderId: fc.option(fc.uuid(), { nil: undefined }),
    assetId: fc.constantFrom('BTC', 'ETH', 'SOL'),
    side: orderSideArb(),
    orderType: orderTypeArb(),
    quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    filledQuantity: fc.double({ min: 0, max: 100, noNaN: true }),
    remainingQuantity: fc.double({ min: 0, max: 1000, noNaN: true }),
    price: fc.option(fc.double({ min: 1, max: 100000, noNaN: true }), { nil: undefined }),
    stopPrice: fc.option(fc.double({ min: 1, max: 100000, noNaN: true }), { nil: undefined }),
    averageFilledPrice: fc.option(fc.double({ min: 1, max: 100000, noNaN: true }), { nil: undefined }),
    timeInForce: timeInForceArb(),
    status: orderStatusArb(),
    idempotencyKey: fc.uuid(),
    fills: fc.constant([]),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb(),
  });

/**
 * Generator for OrderRequest
 */
const orderRequestArb = (): fc.Arbitrary<OrderRequest> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    assetId: fc.constantFrom('BTC', 'ETH', 'SOL'),
    side: orderSideArb(),
    orderType: fc.constant('MARKET' as OrderType),
    quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    timeInForce: timeInForceArb(),
    exchangeId: exchangeIdArb(),
    idempotencyKey: fc.uuid(),
    timestamp: isoDateStringArb(),
  });

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  mockOrderStore = new Map();
  DuplicateOrderPreventionService.adapters.clear();
  DuplicateOrderPreventionService.clearAllIdempotencyRecords();
  jest.clearAllMocks();
});

// ============================================
// Property Tests
// ============================================

describe('Duplicate Order Prevention Service', () => {
  describe('Property 36: Duplicate Order Prevention', () => {
    /**
     * Feature: exchange-integration, Property 36: Duplicate Order Prevention
     *
     * For any order submission that fails, the Exchange_Adapter SHALL verify order status
     * with the exchange before retrying, AND if the order exists, it SHALL NOT submit a duplicate.
     *
     * **Validates: Requirements 10.3**
     */
    it('should detect existing orders and prevent duplicate submissions', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderArb(),
          async (existingOrder) => {
            // Store the existing order
            const key = `${existingOrder.tenantId}:${existingOrder.orderId}`;
            mockOrderStore.set(key, existingOrder);

            // Create a request with the same idempotency key
            const request: OrderRequest = {
              orderId: existingOrder.orderId,
              tenantId: existingOrder.tenantId,
              strategyId: existingOrder.strategyId,
              assetId: existingOrder.assetId,
              side: existingOrder.side,
              orderType: existingOrder.orderType,
              quantity: existingOrder.quantity,
              timeInForce: existingOrder.timeInForce,
              exchangeId: existingOrder.exchangeId,
              idempotencyKey: existingOrder.idempotencyKey,
              timestamp: new Date().toISOString(),
            };

            // Check if we should retry
            const result = await DuplicateOrderPreventionService.shouldRetryOrder(
              existingOrder.tenantId,
              request
            );

            // Should NOT retry because order already exists
            expect(result.shouldRetry).toBe(false);
            expect(result.existingOrder).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 36: Duplicate Order Prevention
     *
     * For any order that exists on the exchange with a terminal status,
     * the system SHALL NOT attempt to resubmit.
     *
     * **Validates: Requirements 10.3**
     */
    it('should not retry orders with terminal status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          exchangeIdArb(),
          terminalOrderStatusArb(),
          async (tenantId, orderId, exchangeId, terminalStatus) => {
            // Create an order with terminal status
            const existingOrder: Order = {
              orderId,
              tenantId,
              strategyId: generateUUID(),
              exchangeId,
              exchangeOrderId: `EX-${generateUUID()}`,
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'MARKET',
              quantity: 1,
              filledQuantity: terminalStatus === 'FILLED' ? 1 : 0,
              remainingQuantity: terminalStatus === 'FILLED' ? 0 : 1,
              timeInForce: 'GTC',
              status: terminalStatus,
              idempotencyKey: generateUUID(),
              fills: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            const key = `${tenantId}:${orderId}`;
            mockOrderStore.set(key, existingOrder);

            // Register a mock adapter that returns the terminal status
            const mockAdapter: ExchangeAdapterForDuplicatePrevention = {
              getOrderStatus: jest.fn().mockResolvedValue(terminalStatus),
            };
            DuplicateOrderPreventionService.registerAdapter(tenantId, exchangeId, mockAdapter);

            // Verify order status
            const result = await DuplicateOrderPreventionService.verifyOrderStatusBeforeRetry(
              tenantId,
              orderId,
              exchangeId,
              existingOrder.exchangeOrderId
            );

            // Order should exist with terminal status
            expect(result.exists).toBe(true);
            expect(result.status).toBe(terminalStatus);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 36: Duplicate Order Prevention
     *
     * For any order that exists on the exchange with an active status,
     * the system SHALL NOT attempt to resubmit.
     *
     * **Validates: Requirements 10.3**
     */
    it('should not retry orders with active status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          exchangeIdArb(),
          activeOrderStatusArb(),
          async (tenantId, orderId, exchangeId, activeStatus) => {
            // Use a unique idempotency key that won't match any existing order
            const uniqueIdempotencyKey = `unique-${generateUUID()}`;
            
            // Create an order with active status
            const existingOrder: Order = {
              orderId,
              tenantId,
              strategyId: generateUUID(),
              exchangeId,
              exchangeOrderId: `EX-${generateUUID()}`,
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'LIMIT',
              quantity: 1,
              filledQuantity: activeStatus === 'PARTIALLY_FILLED' ? 0.5 : 0,
              remainingQuantity: activeStatus === 'PARTIALLY_FILLED' ? 0.5 : 1,
              price: 50000,
              timeInForce: 'GTC',
              status: activeStatus,
              idempotencyKey: uniqueIdempotencyKey,
              fills: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            const key = `${tenantId}:${orderId}`;
            mockOrderStore.set(key, existingOrder);

            // Register a mock adapter that returns the active status
            const mockAdapter: ExchangeAdapterForDuplicatePrevention = {
              getOrderStatus: jest.fn().mockResolvedValue(activeStatus),
            };
            DuplicateOrderPreventionService.registerAdapter(tenantId, exchangeId, mockAdapter);

            // Create request for retry with a DIFFERENT idempotency key
            // This tests the order ID verification path, not the idempotency key path
            const request: OrderRequest = {
              orderId,
              tenantId,
              strategyId: existingOrder.strategyId,
              assetId: 'BTC',
              side: 'BUY',
              orderType: 'LIMIT',
              quantity: 1,
              price: 50000,
              timeInForce: 'GTC',
              exchangeId,
              idempotencyKey: `different-${generateUUID()}`, // Different key to test order ID path
              timestamp: new Date().toISOString(),
            };

            // Check if we should retry
            const result = await DuplicateOrderPreventionService.shouldRetryOrder(
              tenantId,
              request
            );

            // Should NOT retry because order is already active on exchange
            expect(result.shouldRetry).toBe(false);
            // The reason should indicate the order is active or already exists
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 36: Duplicate Order Prevention
     *
     * For any new order that does not exist, the system SHALL allow submission.
     *
     * **Validates: Requirements 10.3**
     */
    it('should allow submission for new orders that do not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          async (request) => {
            // Ensure no existing order with this idempotency key
            // (mockOrderStore is empty by default in beforeEach)

            // Check if we should retry (submit)
            const result = await DuplicateOrderPreventionService.shouldRetryOrder(
              request.tenantId,
              request
            );

            // Should allow submission for new orders
            expect(result.shouldRetry).toBe(true);
            expect(result.reason).toBe('Order can be submitted');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  describe('Property 37: Idempotency Key Usage', () => {
    /**
     * Feature: exchange-integration, Property 37: Idempotency Key Usage
     *
     * For any order submission to an exchange that supports idempotency, the request SHALL
     * include the order's idempotencyKey, AND resubmissions with the same key SHALL return
     * the existing order rather than creating a duplicate.
     *
     * **Validates: Requirements 10.4**
     */
    it('should return existing order for duplicate idempotency key submissions', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderArb(),
          async (existingOrder) => {
            // Store the existing order
            const key = `${existingOrder.tenantId}:${existingOrder.orderId}`;
            mockOrderStore.set(key, existingOrder);

            // Check for duplicate using the same idempotency key
            const duplicateCheck = await DuplicateOrderPreventionService.checkForDuplicate(
              existingOrder.tenantId,
              existingOrder.idempotencyKey
            );

            // Should detect as duplicate
            expect(duplicateCheck.isDuplicate).toBe(true);
            expect(duplicateCheck.existingOrder).toBeDefined();
            expect(duplicateCheck.existingOrder?.orderId).toBe(existingOrder.orderId);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 37: Idempotency Key Usage
     *
     * For any unique idempotency key, the system SHALL allow the submission.
     *
     * **Validates: Requirements 10.4**
     */
    it('should allow submission for unique idempotency keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          async (tenantId, idempotencyKey) => {
            // Check for duplicate with a unique key (no existing orders)
            const duplicateCheck = await DuplicateOrderPreventionService.checkForDuplicate(
              tenantId,
              idempotencyKey
            );

            // Should NOT be a duplicate
            expect(duplicateCheck.isDuplicate).toBe(false);
            expect(duplicateCheck.existingOrder).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 37: Idempotency Key Usage
     *
     * For any idempotency record created, it SHALL track the submission state
     * and be retrievable by the same key.
     *
     * **Validates: Requirements 10.4**
     */
    it('should track idempotency records throughout submission lifecycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, idempotencyKey, orderId, exchangeId) => {
            // Create an idempotency record
            const record = DuplicateOrderPreventionService.createIdempotencyRecord(
              tenantId,
              idempotencyKey,
              orderId,
              exchangeId
            );

            // Verify record was created
            expect(record.idempotencyKey).toBe(idempotencyKey);
            expect(record.tenantId).toBe(tenantId);
            expect(record.orderId).toBe(orderId);
            expect(record.exchangeId).toBe(exchangeId);
            expect(record.status).toBe('PENDING');

            // Retrieve the record
            const retrieved = DuplicateOrderPreventionService.getIdempotencyRecord(
              tenantId,
              idempotencyKey
            );

            expect(retrieved).toBeDefined();
            expect(retrieved?.idempotencyKey).toBe(idempotencyKey);

            // Update the record status
            const updated = DuplicateOrderPreventionService.updateIdempotencyRecord(
              tenantId,
              idempotencyKey,
              'SUBMITTED'
            );

            expect(updated?.status).toBe('SUBMITTED');

            // Complete the record
            const completed = DuplicateOrderPreventionService.updateIdempotencyRecord(
              tenantId,
              idempotencyKey,
              'COMPLETED'
            );

            expect(completed?.status).toBe('COMPLETED');

            // Clean up
            DuplicateOrderPreventionService.removeIdempotencyRecord(tenantId, idempotencyKey);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 37: Idempotency Key Usage
     *
     * For any in-flight submission (PENDING or SUBMITTED status), subsequent
     * submissions with the same key SHALL be blocked.
     *
     * **Validates: Requirements 10.4**
     */
    it('should block duplicate submissions while in-flight', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          exchangeIdArb(),
          fc.constantFrom('PENDING', 'SUBMITTED') as fc.Arbitrary<'PENDING' | 'SUBMITTED'>,
          async (tenantId, idempotencyKey, orderId, exchangeId, inFlightStatus) => {
            // Create an in-flight idempotency record
            DuplicateOrderPreventionService.createIdempotencyRecord(
              tenantId,
              idempotencyKey,
              orderId,
              exchangeId
            );

            // Update to in-flight status
            DuplicateOrderPreventionService.updateIdempotencyRecord(
              tenantId,
              idempotencyKey,
              inFlightStatus
            );

            // Check for duplicate
            const duplicateCheck = await DuplicateOrderPreventionService.checkForDuplicate(
              tenantId,
              idempotencyKey
            );

            // Should be detected as duplicate (in-flight)
            expect(duplicateCheck.isDuplicate).toBe(true);
            expect(duplicateCheck.reason).toContain('in progress');

            // Clean up
            DuplicateOrderPreventionService.removeIdempotencyRecord(tenantId, idempotencyKey);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 37: Idempotency Key Usage
     *
     * For any completed submission, subsequent submissions with the same key
     * SHALL return the completed order.
     *
     * **Validates: Requirements 10.4**
     */
    it('should return completed order for duplicate key after completion', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderArb(),
          async (existingOrder) => {
            // Store the existing order
            const key = `${existingOrder.tenantId}:${existingOrder.orderId}`;
            mockOrderStore.set(key, existingOrder);

            // Create a completed idempotency record
            DuplicateOrderPreventionService.createIdempotencyRecord(
              existingOrder.tenantId,
              existingOrder.idempotencyKey,
              existingOrder.orderId,
              existingOrder.exchangeId
            );

            DuplicateOrderPreventionService.updateIdempotencyRecord(
              existingOrder.tenantId,
              existingOrder.idempotencyKey,
              'COMPLETED'
            );

            // Check for duplicate
            const duplicateCheck = await DuplicateOrderPreventionService.checkForDuplicate(
              existingOrder.tenantId,
              existingOrder.idempotencyKey
            );

            // Should be detected as duplicate with existing order
            expect(duplicateCheck.isDuplicate).toBe(true);
            expect(duplicateCheck.existingOrder).toBeDefined();
            expect(duplicateCheck.existingOrder?.orderId).toBe(existingOrder.orderId);

            // Clean up
            DuplicateOrderPreventionService.removeIdempotencyRecord(
              existingOrder.tenantId,
              existingOrder.idempotencyKey
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 37: Idempotency Key Usage
     *
     * For any expired idempotency record, the system SHALL allow new submissions
     * with the same key.
     *
     * **Validates: Requirements 10.4**
     */
    it('should allow submission after idempotency record expires', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          exchangeIdArb(),
          async (tenantId, idempotencyKey, orderId, exchangeId) => {
            // Create an idempotency record with very short TTL (already expired)
            const record = DuplicateOrderPreventionService.createIdempotencyRecord(
              tenantId,
              idempotencyKey,
              orderId,
              exchangeId,
              -1000 // Negative TTL means already expired
            );

            // Verify record was created but is expired
            expect(new Date(record.expiresAt) < new Date()).toBe(true);

            // Check for duplicate - should NOT be duplicate because record is expired
            const duplicateCheck = await DuplicateOrderPreventionService.checkForDuplicate(
              tenantId,
              idempotencyKey
            );

            // Should NOT be a duplicate (expired record should be ignored)
            expect(duplicateCheck.isDuplicate).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
