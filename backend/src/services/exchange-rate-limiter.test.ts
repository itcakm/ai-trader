/**
 * Property-based tests for Exchange Rate Limiter Service
 *
 * **Property 8: Rate Limit Enforcement**
 * *For any* exchange with configured rate limits, when usage approaches the limit
 * (within warningThresholdPercent), requests SHALL be queued rather than rejected,
 * AND critical operations (cancellations) SHALL have reserved capacity.
 *
 * **Validates: Requirements 2.5, 9.1, 9.2, 9.5**
 *
 * **Property 33: Rate Limit Category Support**
 * *For any* exchange, the Rate_Limiter SHALL track separate rate limits for categories:
 * ORDERS, QUERIES, WEBSOCKET, and WEIGHT (if applicable), AND each category SHALL
 * have independent usage tracking.
 *
 * **Validates: Requirements 9.3**
 *
 * **Property 34: Retry-After Header Handling**
 * *For any* rate limit response from an exchange that includes a retry-after header,
 * the Rate_Limiter SHALL parse the value and delay subsequent requests accordingly.
 *
 * **Validates: Requirements 9.4**
 *
 * **Property 35: Rate Limit Visibility**
 * *For any* exchange, the current rate limit usage and remaining capacity SHALL be
 * queryable via getRateLimitStatus, AND the response SHALL include all configured categories.
 *
 * **Validates: Requirements 9.6**
 */

import * as fc from 'fast-check';
import { ExchangeRateLimiter, parseRetryAfterHeader } from './exchange-rate-limiter';
import { ExchangeId } from '../types/exchange';
import {
  RateLimitCategory,
  RateLimitConfig,
  RequestPriority,
} from '../types/exchange-rate-limit';

// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for RateLimitCategory
 */
const rateLimitCategoryArb = (): fc.Arbitrary<RateLimitCategory> =>
  fc.constantFrom('ORDERS', 'QUERIES', 'WEBSOCKET', 'WEIGHT');

/**
 * Generator for RequestPriority
 */
const requestPriorityArb = (): fc.Arbitrary<RequestPriority> =>
  fc.constantFrom('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

/**
 * Generator for RateLimitConfig
 */
const rateLimitConfigArb = (exchangeId: ExchangeId): fc.Arbitrary<RateLimitConfig> =>
  fc.record({
    exchangeId: fc.constant(exchangeId),
    limits: fc.constant([
      { category: 'ORDERS' as RateLimitCategory, requestsPerSecond: 10, requestsPerMinute: 100 },
      { category: 'QUERIES' as RateLimitCategory, requestsPerSecond: 20, requestsPerMinute: 200 },
      { category: 'WEBSOCKET' as RateLimitCategory, requestsPerSecond: 5, requestsPerMinute: 50 },
      { category: 'WEIGHT' as RateLimitCategory, requestsPerSecond: 100, requestsPerMinute: 1000, weight: 1 },
    ]),
    criticalReservationPercent: fc.integer({ min: 5, max: 20 }),
    warningThresholdPercent: fc.integer({ min: 70, max: 90 }),
    burstAllowed: fc.boolean(),
  });

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  ExchangeRateLimiter.resetAll();
});

// ============================================
// Property Tests
// ============================================

describe('Exchange Rate Limiter', () => {
  describe('Property 8: Rate Limit Enforcement', () => {
    /**
     * Feature: exchange-integration, Property 8: Rate Limit Enforcement
     *
     * When usage approaches the limit, requests SHALL be queued rather than rejected.
     *
     * **Validates: Requirements 2.5, 9.1, 9.2, 9.5**
     */
    it('should queue requests when approaching rate limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.uuid(),
          rateLimitCategoryArb(),
          async (exchangeId, tenantId, category) => {
            // Configure with a small limit for testing
            const config: RateLimitConfig = {
              exchangeId,
              limits: [
                { category: 'ORDERS', requestsPerSecond: 5, requestsPerMinute: 10 },
                { category: 'QUERIES', requestsPerSecond: 5, requestsPerMinute: 10 },
                { category: 'WEBSOCKET', requestsPerSecond: 5, requestsPerMinute: 10 },
                { category: 'WEIGHT', requestsPerSecond: 5, requestsPerMinute: 10 },
              ],
              criticalReservationPercent: 10,
              warningThresholdPercent: 80,
              burstAllowed: true,
            };
            ExchangeRateLimiter.configure(config);

            // Consume most of the limit (leaving only reserved capacity)
            const limit = 10;
            const reserved = Math.floor(limit * 0.1); // 10% reserved = 1
            const toConsume = limit - reserved;

            for (let i = 0; i < toConsume; i++) {
              ExchangeRateLimiter.consumeLimit(exchangeId, tenantId, category);
            }

            // Non-critical request should not be allowed (reserved capacity is for critical)
            const checkResult = ExchangeRateLimiter.checkLimit(
              exchangeId,
              tenantId,
              category,
              'NORMAL'
            );

            // Should not be allowed since only reserved capacity remains
            expect(checkResult.allowed).toBe(false);
            expect(checkResult.waitMs).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 8: Rate Limit Enforcement
     *
     * Critical operations SHALL have reserved capacity.
     *
     * **Validates: Requirements 9.5**
     */
    it('should allow critical requests to use reserved capacity', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.uuid(),
          rateLimitCategoryArb(),
          async (exchangeId, tenantId, category) => {
            // Configure with a small limit for testing
            const config: RateLimitConfig = {
              exchangeId,
              limits: [
                { category: 'ORDERS', requestsPerSecond: 5, requestsPerMinute: 10 },
                { category: 'QUERIES', requestsPerSecond: 5, requestsPerMinute: 10 },
                { category: 'WEBSOCKET', requestsPerSecond: 5, requestsPerMinute: 10 },
                { category: 'WEIGHT', requestsPerSecond: 5, requestsPerMinute: 10 },
              ],
              criticalReservationPercent: 20, // 20% reserved = 2 requests
              warningThresholdPercent: 80,
              burstAllowed: true,
            };
            ExchangeRateLimiter.configure(config);

            // Consume most of the limit (leaving only reserved capacity)
            const limit = 10;
            const reserved = Math.floor(limit * 0.2); // 20% reserved = 2
            const toConsume = limit - reserved;

            for (let i = 0; i < toConsume; i++) {
              ExchangeRateLimiter.consumeLimit(exchangeId, tenantId, category);
            }

            // Critical request should be allowed (can use reserved capacity)
            const criticalCheck = ExchangeRateLimiter.checkLimit(
              exchangeId,
              tenantId,
              category,
              'CRITICAL'
            );

            expect(criticalCheck.allowed).toBe(true);
            expect(criticalCheck.remaining).toBe(reserved);

            // Non-critical request should not be allowed
            const normalCheck = ExchangeRateLimiter.checkLimit(
              exchangeId,
              tenantId,
              category,
              'NORMAL'
            );

            expect(normalCheck.allowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 8: Rate Limit Enforcement
     *
     * Requests SHALL be queued with priority ordering.
     *
     * **Validates: Requirements 9.2**
     */
    it('should queue requests with priority ordering', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.array(requestPriorityArb(), { minLength: 5, maxLength: 20 }),
          async (exchangeId, priorities) => {
            // Queue requests with different priorities
            for (const priority of priorities) {
              ExchangeRateLimiter.queueRequest(exchangeId, {
                category: 'ORDERS',
                priority,
                request: async () => ({ priority }),
                queuedAt: new Date().toISOString(),
              });
            }

            // Dequeue and verify priority ordering
            const dequeued: RequestPriority[] = [];
            let request = ExchangeRateLimiter.dequeueRequest(exchangeId);
            while (request) {
              dequeued.push(request.priority);
              request = ExchangeRateLimiter.dequeueRequest(exchangeId);
            }

            // Verify priority ordering: CRITICAL < HIGH < NORMAL < LOW
            const priorityOrder: Record<RequestPriority, number> = {
              CRITICAL: 0,
              HIGH: 1,
              NORMAL: 2,
              LOW: 3,
            };

            for (let i = 1; i < dequeued.length; i++) {
              expect(priorityOrder[dequeued[i]]).toBeGreaterThanOrEqual(
                priorityOrder[dequeued[i - 1]]
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 33: Rate Limit Category Support', () => {
    /**
     * Feature: exchange-integration, Property 33: Rate Limit Category Support
     *
     * The Rate_Limiter SHALL track separate rate limits for categories:
     * ORDERS, QUERIES, WEBSOCKET, and WEIGHT.
     *
     * **Validates: Requirements 9.3**
     */
    it('should track independent usage per category', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.uuid(),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          async (exchangeId, tenantId, ordersUsage, queriesUsage, wsUsage, weightUsage) => {
            // Configure the rate limiter
            const config: RateLimitConfig = {
              exchangeId,
              limits: [
                { category: 'ORDERS', requestsPerSecond: 10, requestsPerMinute: 100 },
                { category: 'QUERIES', requestsPerSecond: 20, requestsPerMinute: 200 },
                { category: 'WEBSOCKET', requestsPerSecond: 5, requestsPerMinute: 50 },
                { category: 'WEIGHT', requestsPerSecond: 100, requestsPerMinute: 1000, weight: 1 },
              ],
              criticalReservationPercent: 10,
              warningThresholdPercent: 80,
              burstAllowed: true,
            };
            ExchangeRateLimiter.configure(config);

            // Consume different amounts for each category
            for (let i = 0; i < ordersUsage; i++) {
              ExchangeRateLimiter.consumeLimit(exchangeId, tenantId, 'ORDERS');
            }
            for (let i = 0; i < queriesUsage; i++) {
              ExchangeRateLimiter.consumeLimit(exchangeId, tenantId, 'QUERIES');
            }
            for (let i = 0; i < wsUsage; i++) {
              ExchangeRateLimiter.consumeLimit(exchangeId, tenantId, 'WEBSOCKET');
            }
            for (let i = 0; i < weightUsage; i++) {
              ExchangeRateLimiter.consumeLimit(exchangeId, tenantId, 'WEIGHT');
            }

            // Verify each category has independent tracking
            const ordersState = ExchangeRateLimiter.getCategoryStatus(exchangeId, tenantId, 'ORDERS');
            const queriesState = ExchangeRateLimiter.getCategoryStatus(exchangeId, tenantId, 'QUERIES');
            const wsState = ExchangeRateLimiter.getCategoryStatus(exchangeId, tenantId, 'WEBSOCKET');
            const weightState = ExchangeRateLimiter.getCategoryStatus(exchangeId, tenantId, 'WEIGHT');

            expect(ordersState.used).toBe(ordersUsage);
            expect(queriesState.used).toBe(queriesUsage);
            expect(wsState.used).toBe(wsUsage);
            expect(weightState.used).toBe(weightUsage);

            // Verify remaining is calculated correctly
            expect(ordersState.remaining).toBe(ordersState.limit - ordersUsage);
            expect(queriesState.remaining).toBe(queriesState.limit - queriesUsage);
            expect(wsState.remaining).toBe(wsState.limit - wsUsage);
            expect(weightState.remaining).toBe(weightState.limit - weightUsage);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 33: Rate Limit Category Support
     *
     * Each category SHALL have independent limits.
     *
     * **Validates: Requirements 9.3**
     */
    it('should have independent limits per category', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeIdArb(), fc.uuid(), async (exchangeId, tenantId) => {
          // Configure with different limits per category
          const config: RateLimitConfig = {
            exchangeId,
            limits: [
              { category: 'ORDERS', requestsPerSecond: 10, requestsPerMinute: 100 },
              { category: 'QUERIES', requestsPerSecond: 20, requestsPerMinute: 200 },
              { category: 'WEBSOCKET', requestsPerSecond: 5, requestsPerMinute: 50 },
              { category: 'WEIGHT', requestsPerSecond: 100, requestsPerMinute: 1000, weight: 1 },
            ],
            criticalReservationPercent: 10,
            warningThresholdPercent: 80,
            burstAllowed: true,
          };
          ExchangeRateLimiter.configure(config);

          // Get status for all categories
          const status = ExchangeRateLimiter.getRateLimitStatus(exchangeId, tenantId);

          // Verify all categories are present
          const categories = status.map((s) => s.category);
          expect(categories).toContain('ORDERS');
          expect(categories).toContain('QUERIES');
          expect(categories).toContain('WEBSOCKET');
          expect(categories).toContain('WEIGHT');

          // Verify limits match configuration
          const ordersState = status.find((s) => s.category === 'ORDERS');
          const queriesState = status.find((s) => s.category === 'QUERIES');
          const wsState = status.find((s) => s.category === 'WEBSOCKET');
          const weightState = status.find((s) => s.category === 'WEIGHT');

          expect(ordersState?.limit).toBe(100);
          expect(queriesState?.limit).toBe(200);
          expect(wsState?.limit).toBe(50);
          expect(weightState?.limit).toBe(1000);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 34: Retry-After Header Handling', () => {
    /**
     * Feature: exchange-integration, Property 34: Retry-After Header Handling
     *
     * The Rate_Limiter SHALL parse retry-after and delay subsequent requests.
     *
     * **Validates: Requirements 9.4**
     */
    it('should delay requests after receiving retry-after', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.uuid(),
          fc.integer({ min: 100, max: 5000 }),
          async (exchangeId, tenantId, retryAfterMs) => {
            // Configure the rate limiter
            const config: RateLimitConfig = {
              exchangeId,
              limits: [
                { category: 'ORDERS', requestsPerSecond: 10, requestsPerMinute: 100 },
              ],
              criticalReservationPercent: 10,
              warningThresholdPercent: 80,
              burstAllowed: true,
            };
            ExchangeRateLimiter.configure(config);

            // Handle rate limit response
            ExchangeRateLimiter.handleRateLimitResponse(exchangeId, retryAfterMs);

            // Check that requests are delayed
            const checkResult = ExchangeRateLimiter.checkLimit(
              exchangeId,
              tenantId,
              'ORDERS',
              'NORMAL'
            );

            expect(checkResult.allowed).toBe(false);
            expect(checkResult.waitMs).toBeGreaterThan(0);
            expect(checkResult.waitMs).toBeLessThanOrEqual(retryAfterMs);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 34: Retry-After Header Handling
     *
     * The delay SHALL be queryable via getRetryAfterDelay.
     *
     * **Validates: Requirements 9.4**
     */
    it('should return remaining delay via getRetryAfterDelay', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.integer({ min: 100, max: 5000 }),
          async (exchangeId, retryAfterMs) => {
            // Handle rate limit response
            ExchangeRateLimiter.handleRateLimitResponse(exchangeId, retryAfterMs);

            // Get the delay
            const delay = ExchangeRateLimiter.getRetryAfterDelay(exchangeId);

            expect(delay).toBeGreaterThan(0);
            expect(delay).toBeLessThanOrEqual(retryAfterMs);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 34: Retry-After Header Handling
     *
     * The parseRetryAfterHeader function SHALL correctly parse numeric seconds.
     *
     * **Validates: Requirements 9.4**
     */
    it('should parse numeric retry-after header values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3600 }),
          async (seconds) => {
            const result = parseRetryAfterHeader(String(seconds));
            expect(result).toBe(seconds * 1000);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 34: Retry-After Header Handling
     *
     * The handleRetryAfterHeader method SHALL parse header and apply delay.
     *
     * **Validates: Requirements 9.4**
     */
    it('should handle retry-after header string values', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.uuid(),
          fc.integer({ min: 1, max: 60 }),
          async (exchangeId, tenantId, seconds) => {
            // Configure the rate limiter
            const config: RateLimitConfig = {
              exchangeId,
              limits: [
                { category: 'ORDERS', requestsPerSecond: 10, requestsPerMinute: 100 },
              ],
              criticalReservationPercent: 10,
              warningThresholdPercent: 80,
              burstAllowed: true,
            };
            ExchangeRateLimiter.configure(config);

            // Handle retry-after header
            ExchangeRateLimiter.handleRetryAfterHeader(exchangeId, String(seconds));

            // Check that requests are delayed
            const checkResult = ExchangeRateLimiter.checkLimit(
              exchangeId,
              tenantId,
              'ORDERS',
              'NORMAL'
            );

            expect(checkResult.allowed).toBe(false);
            expect(checkResult.waitMs).toBeGreaterThan(0);
            expect(checkResult.waitMs).toBeLessThanOrEqual(seconds * 1000);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 35: Rate Limit Visibility', () => {
    /**
     * Feature: exchange-integration, Property 35: Rate Limit Visibility
     *
     * Current rate limit usage and remaining capacity SHALL be queryable.
     *
     * **Validates: Requirements 9.6**
     */
    it('should provide visibility into rate limit status', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.uuid(),
          fc.integer({ min: 0, max: 50 }),
          async (exchangeId, tenantId, usageCount) => {
            // Configure the rate limiter
            const config: RateLimitConfig = {
              exchangeId,
              limits: [
                { category: 'ORDERS', requestsPerSecond: 10, requestsPerMinute: 100 },
                { category: 'QUERIES', requestsPerSecond: 20, requestsPerMinute: 200 },
                { category: 'WEBSOCKET', requestsPerSecond: 5, requestsPerMinute: 50 },
                { category: 'WEIGHT', requestsPerSecond: 100, requestsPerMinute: 1000, weight: 1 },
              ],
              criticalReservationPercent: 10,
              warningThresholdPercent: 80,
              burstAllowed: true,
            };
            ExchangeRateLimiter.configure(config);

            // Consume some capacity
            for (let i = 0; i < usageCount; i++) {
              ExchangeRateLimiter.consumeLimit(exchangeId, tenantId, 'ORDERS');
            }

            // Get status
            const status = ExchangeRateLimiter.getRateLimitStatus(exchangeId, tenantId);

            // Verify all categories are included
            expect(status.length).toBe(4);

            // Verify ORDERS category reflects usage
            const ordersStatus = status.find((s) => s.category === 'ORDERS');
            expect(ordersStatus).toBeDefined();
            expect(ordersStatus!.used).toBe(usageCount);
            expect(ordersStatus!.remaining).toBe(ordersStatus!.limit - usageCount);
            expect(ordersStatus!.limit).toBe(100);

            // Verify other categories are unaffected
            const queriesStatus = status.find((s) => s.category === 'QUERIES');
            expect(queriesStatus).toBeDefined();
            expect(queriesStatus!.used).toBe(0);
            expect(queriesStatus!.remaining).toBe(queriesStatus!.limit);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 35: Rate Limit Visibility
     *
     * Status SHALL include reset time and reserved capacity.
     *
     * **Validates: Requirements 9.6**
     */
    it('should include reset time and reserved capacity in status', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.uuid(),
          fc.integer({ min: 5, max: 20 }),
          async (exchangeId, tenantId, reservationPercent) => {
            // Configure with specific reservation percent
            const config: RateLimitConfig = {
              exchangeId,
              limits: [
                { category: 'ORDERS', requestsPerSecond: 10, requestsPerMinute: 100 },
              ],
              criticalReservationPercent: reservationPercent,
              warningThresholdPercent: 80,
              burstAllowed: true,
            };
            ExchangeRateLimiter.configure(config);

            // Get status
            const status = ExchangeRateLimiter.getCategoryStatus(exchangeId, tenantId, 'ORDERS');

            // Verify reset time is in the future
            const resetTime = new Date(status.resetsAt);
            const now = new Date();
            expect(resetTime.getTime()).toBeGreaterThan(now.getTime());

            // Verify reserved capacity
            const expectedReserved = Math.floor(100 * (reservationPercent / 100));
            expect(status.reservedForCritical).toBe(expectedReserved);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
