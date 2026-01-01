/**
 * Property-based tests for Exchange Audit Service
 *
 * **Property 9: Audit Log Completeness**
 * *For any* REST API call (order submission, cancellation, query), both the request
 * payload and response payload SHALL be logged with timestamp, latency, and success status.
 *
 * **Validates: Requirements 2.6**
 */

import * as fc from 'fast-check';
import {
  ExchangeAuditLog,
  ExchangeOperationType,
  CreateExchangeAuditLogInput,
} from '../types/exchange-audit';
import { ExchangeId } from '../types/exchange';
import {
  ExchangeAuditService,
  validateAuditLogCompleteness,
} from './exchange-audit';
import { ExchangeAuditRepository } from '../repositories/exchange-audit';

// ============================================
// Mock Repository
// ============================================

// In-memory store for testing
let mockStore: Map<string, ExchangeAuditLog>;

// Mock the repository
jest.mock('../repositories/exchange-audit', () => ({
  ExchangeAuditRepository: {
    putAuditLog: jest.fn(async (log: ExchangeAuditLog) => {
      const key = `${log.tenantId}:${log.timestamp}:${log.logId}`;
      mockStore.set(key, log);
    }),
    getAuditLog: jest.fn(async (tenantId: string, timestamp: string, logId: string) => {
      const key = `${tenantId}:${timestamp}:${logId}`;
      return mockStore.get(key) || null;
    }),
    listAuditLogs: jest.fn(async (tenantId: string, filters?: any) => {
      const results: ExchangeAuditLog[] = [];
      mockStore.forEach((log, key) => {
        if (key.startsWith(`${tenantId}:`)) {
          // Apply filters
          if (filters?.exchangeId && log.exchangeId !== filters.exchangeId) return;
          if (filters?.operationType && log.operationType !== filters.operationType) return;
          if (filters?.success !== undefined && log.success !== filters.success) return;
          if (filters?.startTime && log.timestamp < filters.startTime) return;
          if (filters?.endTime && log.timestamp > filters.endTime) return;
          results.push(log);
        }
      });
      // Sort by timestamp descending
      results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return results.slice(0, filters?.limit ?? 100);
    }),
    deleteAuditLog: jest.fn(async (tenantId: string, timestamp: string, logId: string) => {
      const key = `${tenantId}:${timestamp}:${logId}`;
      mockStore.delete(key);
    }),
    countAuditLogs: jest.fn(async (tenantId: string, filters?: any) => {
      let count = 0;
      mockStore.forEach((log, key) => {
        if (key.startsWith(`${tenantId}:`)) {
          if (filters?.exchangeId && log.exchangeId !== filters.exchangeId) return;
          if (filters?.operationType && log.operationType !== filters.operationType) return;
          if (filters?.success !== undefined && log.success !== filters.success) return;
          count++;
        }
      });
      return count;
    }),
  },
}));

// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for ExchangeOperationType
 */
const operationTypeArb = (): fc.Arbitrary<ExchangeOperationType> =>
  fc.constantFrom(
    'ORDER_SUBMIT',
    'ORDER_CANCEL',
    'ORDER_MODIFY',
    'ORDER_STATUS',
    'BALANCE_QUERY',
    'POSITION_QUERY'
  );

/**
 * Generator for request payloads
 */
const requestPayloadArb = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    // Order submission request
    fc.record({
      orderId: fc.uuid(),
      symbol: fc.constantFrom('BTC/USDT', 'ETH/USDT', 'SOL/USDT'),
      side: fc.constantFrom('BUY', 'SELL'),
      type: fc.constantFrom('MARKET', 'LIMIT'),
      quantity: fc.double({ min: 0.001, max: 100, noNaN: true }),
      price: fc.option(fc.double({ min: 1, max: 100000, noNaN: true }), { nil: undefined }),
    }),
    // Cancel request
    fc.record({
      orderId: fc.uuid(),
      exchangeOrderId: fc.string({ minLength: 10, maxLength: 30 }),
    }),
    // Balance query
    fc.record({
      asset: fc.option(fc.constantFrom('BTC', 'ETH', 'USDT'), { nil: undefined }),
    }),
    // Position query
    fc.record({
      symbol: fc.option(fc.constantFrom('BTC/USDT', 'ETH/USDT'), { nil: undefined }),
    })
  );

/**
 * Generator for response payloads
 */
const responsePayloadArb = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    // Success response
    fc.record({
      success: fc.constant(true),
      data: fc.record({
        orderId: fc.uuid(),
        status: fc.constantFrom('PENDING', 'OPEN', 'FILLED', 'CANCELLED'),
        filledQuantity: fc.double({ min: 0, max: 100, noNaN: true }),
      }),
    }),
    // Error response
    fc.record({
      success: fc.constant(false),
      error: fc.record({
        code: fc.constantFrom('INSUFFICIENT_BALANCE', 'INVALID_ORDER', 'RATE_LIMITED'),
        message: fc.string({ minLength: 10, maxLength: 100 }),
      }),
    }),
    // Balance response
    fc.record({
      balances: fc.array(
        fc.record({
          asset: fc.constantFrom('BTC', 'ETH', 'USDT'),
          free: fc.double({ min: 0, max: 1000, noNaN: true }),
          locked: fc.double({ min: 0, max: 100, noNaN: true }),
        }),
        { minLength: 1, maxLength: 5 }
      ),
    })
  );

/**
 * Generator for CreateExchangeAuditLogInput
 */
const createAuditLogInputArb = (): fc.Arbitrary<CreateExchangeAuditLogInput> =>
  fc.record({
    tenantId: fc.uuid(),
    exchangeId: exchangeIdArb(),
    operationType: operationTypeArb(),
    requestPayload: requestPayloadArb(),
    responsePayload: responsePayloadArb(),
    latencyMs: fc.integer({ min: 1, max: 10000 }),
    success: fc.boolean(),
    errorDetails: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
  });

/**
 * Generator for a complete ExchangeAuditLog
 */
const exchangeAuditLogArb = (): fc.Arbitrary<ExchangeAuditLog> =>
  fc.record({
    logId: fc.uuid(),
    tenantId: fc.uuid(),
    exchangeId: exchangeIdArb(),
    operationType: operationTypeArb(),
    requestPayload: requestPayloadArb(),
    responsePayload: responsePayloadArb(),
    latencyMs: fc.integer({ min: 1, max: 10000 }),
    success: fc.boolean(),
    errorDetails: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString()),
    expiresAt: fc.option(fc.integer({ min: 1700000000, max: 2000000000 }), { nil: undefined }),
  });

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  mockStore = new Map();
  jest.clearAllMocks();
  ExchangeAuditService.resetConfig();
});

// ============================================
// Property Tests
// ============================================

describe('Exchange Audit Service', () => {
  describe('Property 9: Audit Log Completeness', () => {
    /**
     * Feature: exchange-integration, Property 9: Audit Log Completeness
     *
     * For any REST API call, the created audit log SHALL contain:
     * - Request payload
     * - Response payload
     * - Timestamp
     * - Latency
     * - Success status
     *
     * **Validates: Requirements 2.6**
     */
    it('should create audit logs with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(createAuditLogInputArb(), async (input) => {
          // Create the audit log
          const log = ExchangeAuditService.createAuditLog(input);

          // Validate completeness
          const validation = validateAuditLogCompleteness(log);

          // All required fields should be present
          expect(validation.valid).toBe(true);
          expect(validation.missingFields).toHaveLength(0);

          // Verify specific fields
          expect(log.logId).toBeDefined();
          expect(log.tenantId).toBe(input.tenantId);
          expect(log.exchangeId).toBe(input.exchangeId);
          expect(log.operationType).toBe(input.operationType);
          expect(log.requestPayload).toBeDefined();
          expect(log.responsePayload).toBeDefined();
          expect(log.latencyMs).toBe(input.latencyMs);
          expect(log.success).toBe(input.success);
          expect(log.timestamp).toBeDefined();
          expect(new Date(log.timestamp).getTime()).not.toBeNaN();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 9: Audit Log Completeness
     *
     * For any audit log that is stored, it SHALL be retrievable with all fields intact.
     *
     * **Validates: Requirements 2.6**
     */
    it('should store and retrieve audit logs with all fields preserved', async () => {
      await fc.assert(
        fc.asyncProperty(createAuditLogInputArb(), async (input) => {
          // Create and store the audit log
          const storedLog = await ExchangeAuditService.createAndLogOperation(input);

          // Retrieve the audit log
          const retrievedLog = await ExchangeAuditService.getAuditLog(
            storedLog.tenantId,
            storedLog.timestamp,
            storedLog.logId
          );

          // Should be retrievable
          expect(retrievedLog).not.toBeNull();

          // All fields should be preserved
          expect(retrievedLog!.logId).toBe(storedLog.logId);
          expect(retrievedLog!.tenantId).toBe(storedLog.tenantId);
          expect(retrievedLog!.exchangeId).toBe(storedLog.exchangeId);
          expect(retrievedLog!.operationType).toBe(storedLog.operationType);
          expect(retrievedLog!.latencyMs).toBe(storedLog.latencyMs);
          expect(retrievedLog!.success).toBe(storedLog.success);
          expect(retrievedLog!.timestamp).toBe(storedLog.timestamp);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 9: Audit Log Completeness
     *
     * For any operation type (ORDER_SUBMIT, ORDER_CANCEL, ORDER_MODIFY, etc.),
     * the audit log SHALL capture the operation type correctly.
     *
     * **Validates: Requirements 2.6**
     */
    it('should correctly capture all operation types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          operationTypeArb(),
          requestPayloadArb(),
          responsePayloadArb(),
          fc.integer({ min: 1, max: 5000 }),
          fc.boolean(),
          async (tenantId, exchangeId, operationType, requestPayload, responsePayload, latencyMs, success) => {
            const input: CreateExchangeAuditLogInput = {
              tenantId,
              exchangeId,
              operationType,
              requestPayload,
              responsePayload,
              latencyMs,
              success,
            };

            // Create and store
            const log = await ExchangeAuditService.createAndLogOperation(input);

            // Verify operation type is captured
            expect(log.operationType).toBe(operationType);

            // Verify it can be filtered by operation type
            const filtered = await ExchangeAuditService.getAuditLogsByOperationType(
              tenantId,
              operationType
            );

            expect(filtered.some(l => l.logId === log.logId)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 9: Audit Log Completeness
     *
     * For any failed operation, the audit log SHALL capture the error details.
     *
     * **Validates: Requirements 2.6**
     */
    it('should capture error details for failed operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeIdArb(),
          operationTypeArb(),
          requestPayloadArb(),
          responsePayloadArb(),
          fc.integer({ min: 1, max: 5000 }),
          fc.string({ minLength: 10, maxLength: 200 }),
          async (tenantId, exchangeId, operationType, requestPayload, responsePayload, latencyMs, errorDetails) => {
            const input: CreateExchangeAuditLogInput = {
              tenantId,
              exchangeId,
              operationType,
              requestPayload,
              responsePayload,
              latencyMs,
              success: false,
              errorDetails,
            };

            // Create and store
            const log = await ExchangeAuditService.createAndLogOperation(input);

            // Verify error details are captured
            expect(log.success).toBe(false);
            expect(log.errorDetails).toBe(errorDetails);

            // Verify it appears in failed operations
            const failed = await ExchangeAuditService.getFailedOperations(tenantId);
            expect(failed.some(l => l.logId === log.logId)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 9: Audit Log Completeness
     *
     * For any audit log, the latency SHALL be a non-negative number.
     *
     * **Validates: Requirements 2.6**
     */
    it('should record valid latency values', async () => {
      await fc.assert(
        fc.asyncProperty(createAuditLogInputArb(), async (input) => {
          const log = ExchangeAuditService.createAuditLog(input);

          // Latency should be preserved and non-negative
          expect(log.latencyMs).toBe(input.latencyMs);
          expect(log.latencyMs).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 9: Audit Log Completeness
     *
     * For any audit log, the timestamp SHALL be a valid ISO date string.
     *
     * **Validates: Requirements 2.6**
     */
    it('should record valid timestamps', async () => {
      await fc.assert(
        fc.asyncProperty(createAuditLogInputArb(), async (input) => {
          const log = ExchangeAuditService.createAuditLog(input);

          // Timestamp should be a valid ISO string
          expect(log.timestamp).toBeDefined();
          const parsedDate = new Date(log.timestamp);
          expect(parsedDate.getTime()).not.toBeNaN();

          // Timestamp should be recent (within last minute)
          const now = Date.now();
          const logTime = parsedDate.getTime();
          expect(logTime).toBeLessThanOrEqual(now + 1000); // Allow 1 second tolerance
          expect(logTime).toBeGreaterThan(now - 60000); // Within last minute
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Audit Log Filtering', () => {
    /**
     * Filtering by exchange should return only logs for that exchange.
     */
    it('should filter audit logs by exchange', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(createAuditLogInputArb(), { minLength: 2, maxLength: 5 }),
          async (tenantId, inputs) => {
            // Store logs with the same tenant but potentially different exchanges
            const logs: ExchangeAuditLog[] = [];
            for (const input of inputs) {
              const log = await ExchangeAuditService.createAndLogOperation({
                ...input,
                tenantId,
              });
              logs.push(log);
            }

            // Pick an exchange that has at least one log
            const targetExchange = logs[0].exchangeId;

            // Filter by exchange
            const filtered = await ExchangeAuditService.getAuditLogsByExchange(
              tenantId,
              targetExchange
            );

            // All returned logs should be for the target exchange
            for (const log of filtered) {
              expect(log.exchangeId).toBe(targetExchange);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Filtering by success status should return only matching logs.
     */
    it('should filter audit logs by success status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(createAuditLogInputArb(), { minLength: 3, maxLength: 5 }),
          async (tenantId, inputs) => {
            // Store logs with mixed success status
            for (const input of inputs) {
              await ExchangeAuditService.createAndLogOperation({
                ...input,
                tenantId,
              });
            }

            // Get failed operations
            const failed = await ExchangeAuditService.getFailedOperations(tenantId);

            // All returned logs should have success = false
            for (const log of failed) {
              expect(log.success).toBe(false);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Audit Log Validation', () => {
    /**
     * validateAuditLogCompleteness should detect missing required fields.
     */
    it('should detect missing required fields', () => {
      // Test with missing logId
      const missingLogId = {
        tenantId: 'tenant-1',
        exchangeId: 'BINANCE' as ExchangeId,
        operationType: 'ORDER_SUBMIT' as ExchangeOperationType,
        requestPayload: {},
        responsePayload: {},
        latencyMs: 100,
        success: true,
        timestamp: new Date().toISOString(),
      } as ExchangeAuditLog;

      const result = validateAuditLogCompleteness(missingLogId);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('logId');
    });

    /**
     * validateAuditLogCompleteness should pass for complete logs.
     */
    it('should pass validation for complete logs', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeAuditLogArb(), async (log) => {
          const result = validateAuditLogCompleteness(log);
          expect(result.valid).toBe(true);
          expect(result.missingFields).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Operation Statistics', () => {
    /**
     * getOperationStats should calculate correct statistics.
     */
    it('should calculate operation statistics correctly', async () => {
      const tenantId = 'test-tenant';
      const exchangeId: ExchangeId = 'BINANCE';

      // Create some test logs
      const inputs: CreateExchangeAuditLogInput[] = [
        {
          tenantId,
          exchangeId,
          operationType: 'ORDER_SUBMIT',
          requestPayload: {},
          responsePayload: {},
          latencyMs: 100,
          success: true,
        },
        {
          tenantId,
          exchangeId,
          operationType: 'ORDER_SUBMIT',
          requestPayload: {},
          responsePayload: {},
          latencyMs: 200,
          success: true,
        },
        {
          tenantId,
          exchangeId,
          operationType: 'ORDER_CANCEL',
          requestPayload: {},
          responsePayload: {},
          latencyMs: 150,
          success: false,
          errorDetails: 'ORDER_NOT_FOUND: Order does not exist',
        },
      ];

      for (const input of inputs) {
        await ExchangeAuditService.createAndLogOperation(input);
      }

      // Get statistics
      const stats = await ExchangeAuditService.getOperationStats(tenantId, exchangeId, '24h');

      // Verify statistics
      expect(stats.totalOperations).toBe(3);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
      expect(stats.averageLatencyMs).toBeCloseTo(150, 0);
      expect(stats.exchangeId).toBe(exchangeId);
      expect(stats.period).toBe('24h');
    });
  });
});
