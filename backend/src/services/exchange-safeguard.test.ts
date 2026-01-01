import * as fc from 'fast-check';
import { ExchangeSafeguardService, ErrorCategory } from './exchange-safeguard';
import { ExchangeLimitsRepository, ExchangeLimits } from '../repositories/exchange-limits';
import { OrderRequest } from '../types/order';
import {
  exchangeLimitsArb,
  orderRequestArb,
  limitsAndViolatingOrderArb,
  limitsAndValidOrderArb,
  orderBelowMinSizeArb,
  orderAboveMaxSizeArb,
  orderWithPriceDeviationArb,
  retryableErrorArb,
  rateLimitErrorArb,
  invalidOrderErrorArb,
  exchangeInternalErrorArb,
  exchangeErrorArb,
  rateLimitStateArb,
  exchangeIdArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/exchange-limits');

const mockExchangeLimitsRepo = ExchangeLimitsRepository as jest.Mocked<typeof ExchangeLimitsRepository>;

describe('ExchangeSafeguardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 21: Exchange Limit Enforcement
   * 
   * For any order that violates exchange-specific limits (min/max size, price deviation),
   * the order SHALL be rejected before submission to the exchange, AND the rejection
   * SHALL include the specific limit violated.
   * 
   * **Feature: risk-controls, Property 21: Exchange Limit Enforcement**
   * **Validates: Requirements 9.1, 9.2**
   */
  describe('Property 21: Exchange Limit Enforcement', () => {
    it('should reject orders below minimum size with specific violation details', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeLimitsArb().chain(limits =>
            orderBelowMinSizeArb(limits).map(order => ({ limits, order }))
          ),
          async ({ limits, order }) => {
            const result = ExchangeSafeguardService.validateOrder(order, limits);
            
            // Order should be rejected
            expect(result.valid).toBe(false);
            
            // Should include MIN_ORDER_SIZE violation
            const minSizeViolation = result.limitViolations.find(
              v => v.limitType === 'MIN_ORDER_SIZE'
            );
            expect(minSizeViolation).toBeDefined();
            expect(minSizeViolation!.currentValue).toBe(order.quantity);
            expect(minSizeViolation!.limitValue).toBe(limits.minOrderSize);
            expect(minSizeViolation!.message).toContain('below minimum');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject orders above maximum size with specific violation details', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeLimitsArb().chain(limits =>
            orderAboveMaxSizeArb(limits).map(order => ({ limits, order }))
          ),
          async ({ limits, order }) => {
            const result = ExchangeSafeguardService.validateOrder(order, limits);
            
            // Order should be rejected
            expect(result.valid).toBe(false);
            
            // Should include MAX_ORDER_SIZE violation
            const maxSizeViolation = result.limitViolations.find(
              v => v.limitType === 'MAX_ORDER_SIZE'
            );
            expect(maxSizeViolation).toBeDefined();
            expect(maxSizeViolation!.currentValue).toBe(order.quantity);
            expect(maxSizeViolation!.limitValue).toBe(limits.maxOrderSize);
            expect(maxSizeViolation!.message).toContain('exceeds maximum');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject limit orders with price deviation exceeding threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeLimitsArb(),
          fc.double({ min: 1000, max: 50000, noNaN: true }),
          async (limits, currentPrice) => {
            // Create order with price deviation exceeding limit
            const deviationMultiplier = 1 + (limits.maxPriceDeviationPercent + 10) / 100;
            const deviatedPrice = currentPrice * deviationMultiplier;
            
            const order: OrderRequest = {
              orderId: 'test-order',
              tenantId: 'tenant-1',
              strategyId: 'strategy-1',
              assetId: limits.assetId,
              side: 'BUY',
              quantity: (limits.minOrderSize + limits.maxOrderSize) / 2,
              price: deviatedPrice,
              orderType: 'LIMIT',
              exchangeId: limits.exchangeId,
              timestamp: new Date().toISOString()
            };
            
            const result = ExchangeSafeguardService.validateOrder(order, limits, currentPrice);
            
            // Order should be rejected
            expect(result.valid).toBe(false);
            
            // Should include PRICE_DEVIATION violation
            const deviationViolation = result.limitViolations.find(
              v => v.limitType === 'PRICE_DEVIATION'
            );
            expect(deviationViolation).toBeDefined();
            expect(deviationViolation!.limitValue).toBe(limits.maxPriceDeviationPercent);
            expect(deviationViolation!.message).toContain('deviation');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should approve orders within all exchange limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          limitsAndValidOrderArb(),
          async ({ limits, order }) => {
            const result = ExchangeSafeguardService.validateOrder(order, limits);
            
            // Order should be approved
            expect(result.valid).toBe(true);
            expect(result.limitViolations).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect multiple violations in a single order', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeLimitsArb(),
          async (limits) => {
            // Create order that violates multiple limits
            const order: OrderRequest = {
              orderId: 'test-order',
              tenantId: 'tenant-1',
              strategyId: 'strategy-1',
              assetId: limits.assetId,
              side: 'BUY',
              quantity: limits.minOrderSize * 0.5, // Below min
              price: limits.minPrice * 0.5, // Below min price
              orderType: 'LIMIT',
              exchangeId: limits.exchangeId,
              timestamp: new Date().toISOString()
            };
            
            const result = ExchangeSafeguardService.validateOrder(order, limits);
            
            // Order should be rejected
            expect(result.valid).toBe(false);
            
            // Should have multiple violations
            expect(result.limitViolations.length).toBeGreaterThanOrEqual(2);
            expect(result.errors.length).toBeGreaterThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate lot size compliance', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeLimitsArb().filter(l => l.lotSize >= 0.001),
          async (limits) => {
            // Create order with quantity that is definitely not aligned to lot size
            // Use a value that's 0.3 * lotSize offset from a valid multiple
            const baseQuantity = Math.ceil(limits.minOrderSize / limits.lotSize) * limits.lotSize;
            const nonAlignedQuantity = baseQuantity + limits.lotSize * 0.3;
            
            const order: OrderRequest = {
              orderId: 'test-order',
              tenantId: 'tenant-1',
              strategyId: 'strategy-1',
              assetId: limits.assetId,
              side: 'BUY',
              quantity: nonAlignedQuantity,
              orderType: 'MARKET',
              exchangeId: limits.exchangeId,
              timestamp: new Date().toISOString()
            };
            
            const result = ExchangeSafeguardService.validateOrder(order, limits);
            
            // Should have LOT_SIZE violation
            const lotSizeViolation = result.limitViolations.find(
              v => v.limitType === 'LOT_SIZE'
            );
            expect(lotSizeViolation).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate tick size compliance for limit orders', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeLimitsArb().filter(l => l.tickSize >= 0.1),
          async (limits) => {
            // Create limit order with price that is definitely not aligned to tick size
            // Use a value that's 0.3 * tickSize offset from a valid multiple
            const basePrice = Math.ceil(limits.minPrice / limits.tickSize) * limits.tickSize;
            const nonAlignedPrice = basePrice + limits.tickSize * 0.3;
            
            const order: OrderRequest = {
              orderId: 'test-order',
              tenantId: 'tenant-1',
              strategyId: 'strategy-1',
              assetId: limits.assetId,
              side: 'BUY',
              quantity: (limits.minOrderSize + limits.maxOrderSize) / 2,
              price: nonAlignedPrice,
              orderType: 'LIMIT',
              exchangeId: limits.exchangeId,
              timestamp: new Date().toISOString()
            };
            
            const result = ExchangeSafeguardService.validateOrder(order, limits);
            
            // Should have TICK_SIZE violation
            const tickSizeViolation = result.limitViolations.find(
              v => v.limitType === 'TICK_SIZE'
            );
            expect(tickSizeViolation).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 22: Exchange Rate Limit Tracking
   * 
   * For any exchange with rate limits, the system SHALL track remaining requests,
   * AND when approaching the limit (within buffer percentage), requests SHALL be
   * throttled with appropriate delays.
   * 
   * **Feature: risk-controls, Property 22: Exchange Rate Limit Tracking**
   * **Validates: Requirements 9.3**
   */
  describe('Property 22: Exchange Rate Limit Tracking', () => {
    it('should track rate limit usage and recommend throttling when approaching limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.integer({ min: 100, max: 1000 }), // limit
          fc.integer({ min: 5, max: 20 }), // buffer percent
          async (exchangeId, limit, bufferPercent) => {
            const now = new Date();
            const resetAt = new Date(now.getTime() + 60000).toISOString();
            
            // Calculate the threshold where throttling should start
            const effectiveLimit = Math.floor(limit * (1 - bufferPercent / 100));
            
            // Set up state where we're at the threshold
            const initialState = {
              exchangeId,
              remaining: limit - effectiveLimit,
              limit,
              resetAt,
              windowStart: now.toISOString(),
              requestCount: effectiveLimit,
              updatedAt: now.toISOString()
            };
            
            mockExchangeLimitsRepo.getRateLimitState.mockResolvedValue(initialState);
            mockExchangeLimitsRepo.incrementRequestCount.mockResolvedValue({
              ...initialState,
              requestCount: effectiveLimit + 1
            });
            
            const result = await ExchangeSafeguardService.trackRateLimit(
              exchangeId, 
              1, 
              bufferPercent
            );
            
            // Should recommend throttling when at or above effective limit
            expect(result.shouldWait).toBe(true);
            expect(result.waitMs).toBeDefined();
            expect(result.waitMs).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not throttle when well below rate limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.integer({ min: 100, max: 1000 }), // limit
          fc.integer({ min: 5, max: 20 }), // buffer percent
          async (exchangeId, limit, bufferPercent) => {
            const now = new Date();
            const resetAt = new Date(now.getTime() + 60000).toISOString();
            
            // Set up state where we're well below the threshold (at 10% usage)
            const lowUsageCount = Math.floor(limit * 0.1);
            
            const initialState = {
              exchangeId,
              remaining: limit - lowUsageCount,
              limit,
              resetAt,
              windowStart: now.toISOString(),
              requestCount: lowUsageCount,
              updatedAt: now.toISOString()
            };
            
            mockExchangeLimitsRepo.getRateLimitState.mockResolvedValue(initialState);
            mockExchangeLimitsRepo.incrementRequestCount.mockResolvedValue({
              ...initialState,
              requestCount: lowUsageCount + 1
            });
            
            const result = await ExchangeSafeguardService.trackRateLimit(
              exchangeId, 
              1, 
              bufferPercent
            );
            
            // Should not recommend throttling when well below limit
            expect(result.shouldWait).toBe(false);
            expect(result.remaining).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reset rate limit window when past reset time', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.integer({ min: 100, max: 1000 }), // limit
          async (exchangeId, limit) => {
            const now = new Date();
            // Set reset time in the past
            const pastResetAt = new Date(now.getTime() - 60000).toISOString();
            
            // State with exhausted limit but past reset time
            const exhaustedState = {
              exchangeId,
              remaining: 0,
              limit,
              resetAt: pastResetAt,
              windowStart: new Date(now.getTime() - 120000).toISOString(),
              requestCount: limit,
              updatedAt: new Date(now.getTime() - 60000).toISOString()
            };
            
            mockExchangeLimitsRepo.getRateLimitState.mockResolvedValue(exhaustedState);
            mockExchangeLimitsRepo.putRateLimitState.mockResolvedValue();
            mockExchangeLimitsRepo.incrementRequestCount.mockResolvedValue({
              ...exhaustedState,
              requestCount: 1,
              remaining: limit - 1
            });
            
            const result = await ExchangeSafeguardService.trackRateLimit(exchangeId, 1);
            
            // Should have reset the window and not throttle
            expect(result.shouldWait).toBe(false);
            expect(mockExchangeLimitsRepo.putRateLimitState).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should initialize rate limit state when none exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          async (exchangeId) => {
            mockExchangeLimitsRepo.getRateLimitState.mockResolvedValue(null);
            mockExchangeLimitsRepo.putRateLimitState.mockResolvedValue();
            mockExchangeLimitsRepo.incrementRequestCount.mockResolvedValue(null);
            
            const result = await ExchangeSafeguardService.trackRateLimit(exchangeId, 1);
            
            // Should initialize state and not throttle
            expect(result.shouldWait).toBe(false);
            expect(result.limit).toBe(1000); // Default limit
            expect(mockExchangeLimitsRepo.putRateLimitState).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly calculate remaining requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.integer({ min: 100, max: 1000 }), // limit
          fc.integer({ min: 1, max: 50 }), // requests made
          async (exchangeId, limit, requestsMade) => {
            const now = new Date();
            const resetAt = new Date(now.getTime() + 60000).toISOString();
            
            const initialState = {
              exchangeId,
              remaining: limit - requestsMade,
              limit,
              resetAt,
              windowStart: now.toISOString(),
              requestCount: requestsMade,
              updatedAt: now.toISOString()
            };
            
            mockExchangeLimitsRepo.getRateLimitState.mockResolvedValue(initialState);
            mockExchangeLimitsRepo.incrementRequestCount.mockResolvedValue({
              ...initialState,
              requestCount: requestsMade + 1
            });
            
            const result = await ExchangeSafeguardService.trackRateLimit(exchangeId, 1);
            
            // Remaining should be limit minus total requests (including new one)
            const expectedRemaining = Math.max(0, limit - (requestsMade + 1));
            expect(result.remaining).toBe(expectedRemaining);
            expect(result.limit).toBe(limit);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('shouldThrottle should return true when at effective limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.integer({ min: 100, max: 1000 }), // limit
          fc.integer({ min: 5, max: 20 }), // buffer percent
          async (exchangeId, limit, bufferPercent) => {
            const now = new Date();
            const resetAt = new Date(now.getTime() + 60000).toISOString();
            
            // Calculate the threshold where throttling should start
            // Use the same calculation as the service (no floor)
            const effectiveLimit = limit * (1 - bufferPercent / 100);
            // Set request count to be at or above the effective limit
            const requestCount = Math.ceil(effectiveLimit);
            
            // Set up state where we're at the threshold
            const atThresholdState = {
              exchangeId,
              remaining: limit - requestCount,
              limit,
              resetAt,
              windowStart: now.toISOString(),
              requestCount,
              updatedAt: now.toISOString()
            };
            
            mockExchangeLimitsRepo.getRateLimitState.mockResolvedValue(atThresholdState);
            
            const shouldThrottle = await ExchangeSafeguardService.shouldThrottle(
              exchangeId, 
              bufferPercent
            );
            
            expect(shouldThrottle).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('shouldThrottle should return false when below effective limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.integer({ min: 100, max: 1000 }), // limit
          fc.integer({ min: 5, max: 20 }), // buffer percent
          async (exchangeId, limit, bufferPercent) => {
            const now = new Date();
            const resetAt = new Date(now.getTime() + 60000).toISOString();
            
            // Set up state where we're well below the threshold
            const lowUsageCount = Math.floor(limit * 0.1);
            
            const belowThresholdState = {
              exchangeId,
              remaining: limit - lowUsageCount,
              limit,
              resetAt,
              windowStart: now.toISOString(),
              requestCount: lowUsageCount,
              updatedAt: now.toISOString()
            };
            
            mockExchangeLimitsRepo.getRateLimitState.mockResolvedValue(belowThresholdState);
            
            const shouldThrottle = await ExchangeSafeguardService.shouldThrottle(
              exchangeId, 
              bufferPercent
            );
            
            expect(shouldThrottle).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 23: Exchange Error Categorization
   * 
   * For any exchange error, the system SHALL categorize it as RETRYABLE, RATE_LIMIT,
   * INVALID_ORDER, EXCHANGE_ERROR, or FATAL, AND apply the appropriate handling
   * (retry, wait, reject, or alert).
   * 
   * **Feature: risk-controls, Property 23: Exchange Error Categorization**
   * **Validates: Requirements 9.6**
   */
  describe('Property 23: Exchange Error Categorization', () => {
    it('should categorize retryable errors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          retryableErrorArb(),
          async (error) => {
            const category = ExchangeSafeguardService.categorizeError(error);
            expect(category).toBe('RETRYABLE');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should categorize rate limit errors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitErrorArb(),
          async (error) => {
            const category = ExchangeSafeguardService.categorizeError(error);
            expect(category).toBe('RATE_LIMIT');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should categorize invalid order errors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidOrderErrorArb(),
          async (error) => {
            const category = ExchangeSafeguardService.categorizeError(error);
            expect(category).toBe('INVALID_ORDER');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should categorize exchange internal errors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeInternalErrorArb(),
          async (error) => {
            const category = ExchangeSafeguardService.categorizeError(error);
            expect(category).toBe('EXCHANGE_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should categorize unknown errors as FATAL', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            code: fc.constantFrom('UNKNOWN', 'WEIRD_ERROR', 'SOMETHING_ELSE'),
            message: fc.string({ minLength: 5, maxLength: 50 }),
            exchangeId: exchangeIdArb(),
            statusCode: fc.option(fc.constantFrom(418, 451, 999), { nil: undefined })
          }),
          async (error) => {
            const category = ExchangeSafeguardService.categorizeError(error);
            expect(category).toBe('FATAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return a valid error category', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeErrorArb(),
          async (error) => {
            const category = ExchangeSafeguardService.categorizeError(error);
            
            // Category should be one of the valid types
            expect(['RETRYABLE', 'RATE_LIMIT', 'INVALID_ORDER', 'EXCHANGE_ERROR', 'FATAL']).toContain(category);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should prioritize rate limit errors over other categories', async () => {
      // Rate limit errors should be detected even if they contain other patterns
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            code: fc.constant('RATE_LIMIT'),
            message: fc.constantFrom(
              'Rate limit exceeded, please retry later',
              'Too many requests, timeout occurred',
              'Request throttled due to rate limit'
            ),
            exchangeId: exchangeIdArb(),
            statusCode: fc.constant(429)
          }),
          async (error) => {
            const category = ExchangeSafeguardService.categorizeError(error);
            expect(category).toBe('RATE_LIMIT');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle errors with status codes correctly', async () => {
      // Test specific status code patterns
      const statusCodeTests = [
        { statusCode: 429, expectedCategory: 'RATE_LIMIT' },
        { statusCode: 503, expectedCategory: 'RETRYABLE' },
        { statusCode: 504, expectedCategory: 'RETRYABLE' },
        { statusCode: 500, expectedCategory: 'EXCHANGE_ERROR' }
      ];

      for (const test of statusCodeTests) {
        const error = {
          code: 'GENERIC_ERROR',
          message: 'Some error message',
          exchangeId: 'binance',
          statusCode: test.statusCode
        };
        
        const category = ExchangeSafeguardService.categorizeError(error);
        expect(category).toBe(test.expectedCategory);
      }
    });
  });
});
