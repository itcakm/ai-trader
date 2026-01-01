/**
 * Property-based tests for Exchange Error Handler
 *
 * **Property 7: Error Categorization Completeness**
 * *For any* error returned by an exchange, the ErrorHandler SHALL categorize it as
 * exactly one of: RETRYABLE, RATE_LIMITED, INVALID_REQUEST, EXCHANGE_ERROR, or FATAL,
 * AND the categorization SHALL be consistent for the same error type.
 *
 * **Validates: Requirements 2.4, 10.1**
 *
 * **Property 38: Exchange Error Alerting**
 * *For any* error categorized as EXCHANGE_ERROR, the system SHALL log full error
 * details (code, message, request context) AND trigger an alert for investigation.
 *
 * **Validates: Requirements 10.5**
 */

import * as fc from 'fast-check';
import {
  ExchangeErrorHandler,
  DEFAULT_ERROR_RETRY_CONFIG,
} from './exchange-error-handler';
import { ErrorCategory, ExchangeError, RetryConfig } from '../types/exchange-error';
import { ExchangeId } from '../types/exchange';

// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for ErrorCategory
 */
const errorCategoryArb = (): fc.Arbitrary<ErrorCategory> =>
  fc.constantFrom('RETRYABLE', 'RATE_LIMITED', 'INVALID_REQUEST', 'EXCHANGE_ERROR', 'FATAL');

/**
 * Generator for HTTP status codes
 */
const httpStatusCodeArb = (): fc.Arbitrary<number> =>
  fc.oneof(
    fc.constantFrom(200, 201, 204), // Success
    fc.constantFrom(400, 401, 403, 404, 422), // Client errors
    fc.constantFrom(429), // Rate limited
    fc.constantFrom(500, 502, 503, 504) // Server errors
  );

/**
 * Generator for error codes
 */
const errorCodeArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    // Known Binance codes
    fc.constantFrom('-1000', '-1001', '-1002', '-1003', '-1006', '-1007', '-1015', '-1021', '-2010', '-2011', '-2013', '-2014', '-2015'),
    // Known Coinbase codes
    fc.constantFrom('invalid_request', 'invalid_scope', 'expired_token', 'revoked_token', 'invalid_token', 'rate_limit_exceeded', 'internal_server_error'),
    // Generic codes
    fc.constantFrom('TIMEOUT', 'NETWORK_ERROR', 'CONNECTION_RESET', 'DNS_ERROR', 'SSL_ERROR', 'INVALID_SIGNATURE', 'INSUFFICIENT_FUNDS', 'ORDER_NOT_FOUND', 'INVALID_SYMBOL', 'INVALID_QUANTITY', 'INVALID_PRICE'),
    // Unknown codes
    fc.string({ minLength: 1, maxLength: 20 })
  );

/**
 * Generator for error messages
 */
const errorMessageArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    // Messages that match patterns
    fc.constantFrom(
      'Request timeout',
      'Connection timed out',
      'Network error occurred',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'Socket hang up',
      'fetch failed',
      'Rate limit exceeded',
      'Too many requests',
      'Request throttled',
      'Unauthorized access',
      'Forbidden',
      'Invalid API key',
      'Authentication failed',
      'Invalid signature',
      'Invalid request format',
      'Bad request',
      'Validation error',
      'Resource not found',
      'Order does not exist'
    ),
    // Random messages
    fc.string({ minLength: 1, maxLength: 100 })
  );

/**
 * Generator for Error objects
 */
const errorObjectArb = (): fc.Arbitrary<Error> =>
  fc.record({
    message: errorMessageArb(),
    code: fc.option(errorCodeArb(), { nil: undefined }),
    status: fc.option(httpStatusCodeArb(), { nil: undefined }),
  }).map(({ message, code, status }) => {
    const error = new Error(message) as Error & { code?: string; status?: number };
    if (code !== undefined) error.code = code;
    if (status !== undefined) error.status = status;
    return error;
  });

/**
 * Generator for plain error objects (not Error instances)
 */
const plainErrorObjectArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    code: fc.option(errorCodeArb(), { nil: undefined }),
    errorCode: fc.option(errorCodeArb(), { nil: undefined }),
    message: fc.option(errorMessageArb(), { nil: undefined }),
    msg: fc.option(errorMessageArb(), { nil: undefined }),
    error: fc.option(errorMessageArb(), { nil: undefined }),
    status: fc.option(httpStatusCodeArb(), { nil: undefined }),
    retryAfter: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
  });

/**
 * Generator for any error type
 */
const anyErrorArb = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    errorObjectArb(),
    plainErrorObjectArb(),
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.constant(null),
    fc.constant(undefined)
  );

/**
 * Generator for RetryConfig
 */
const retryConfigArb = (): fc.Arbitrary<RetryConfig> =>
  fc.record({
    maxRetries: fc.integer({ min: 0, max: 10 }),
    initialDelayMs: fc.integer({ min: 100, max: 5000 }),
    maxDelayMs: fc.integer({ min: 5000, max: 120000 }),
    multiplier: fc.double({ min: 1.5, max: 3, noNaN: true }),
    retryableCategories: fc.constantFrom(
      ['RETRYABLE', 'RATE_LIMITED'] as ErrorCategory[],
      ['RETRYABLE'] as ErrorCategory[],
      ['RATE_LIMITED'] as ErrorCategory[],
      ['RETRYABLE', 'RATE_LIMITED', 'EXCHANGE_ERROR'] as ErrorCategory[]
    ),
  });

/**
 * Generator for ExchangeError
 */
const exchangeErrorArb = (): fc.Arbitrary<ExchangeError> =>
  fc.record({
    errorId: fc.uuid(),
    exchangeId: exchangeIdArb(),
    category: errorCategoryArb(),
    code: errorCodeArb(),
    message: errorMessageArb(),
    originalError: fc.option(anyErrorArb(), { nil: undefined }),
    retryable: fc.boolean(),
    retryAfterMs: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
    timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  });

// ============================================
// Valid Error Categories
// ============================================

const VALID_CATEGORIES: ErrorCategory[] = [
  'RETRYABLE',
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'EXCHANGE_ERROR',
  'FATAL',
];


// ============================================
// Property Tests
// ============================================

describe('Exchange Error Handler', () => {
  describe('Property 7: Error Categorization Completeness', () => {
    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error, the categorizeError method SHALL return an ExchangeError
     * with exactly one of the valid categories.
     */
    it('should categorize any error into exactly one valid category', () => {
      fc.assert(
        fc.property(
          anyErrorArb(),
          exchangeIdArb(),
          (error, exchangeId) => {
            const result = ExchangeErrorHandler.categorizeError(error, exchangeId);

            // Result should have exactly one category
            expect(VALID_CATEGORIES).toContain(result.category);

            // Category should be a string
            expect(typeof result.category).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error, the categorization SHALL be consistent - the same error
     * type should always produce the same category.
     */
    it('should produce consistent categorization for the same error', () => {
      fc.assert(
        fc.property(
          errorObjectArb(),
          exchangeIdArb(),
          (error, exchangeId) => {
            // Categorize the same error twice
            const result1 = ExchangeErrorHandler.categorizeError(error, exchangeId);
            const result2 = ExchangeErrorHandler.categorizeError(error, exchangeId);

            // Categories should be the same
            expect(result1.category).toBe(result2.category);

            // Retryable flag should be consistent
            expect(result1.retryable).toBe(result2.retryable);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error with HTTP status 429, the category SHALL be RATE_LIMITED.
     */
    it('should categorize HTTP 429 as RATE_LIMITED', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          errorMessageArb(),
          (exchangeId, message) => {
            const error = new Error(message) as Error & { status: number };
            error.status = 429;

            const result = ExchangeErrorHandler.categorizeError(error, exchangeId);

            expect(result.category).toBe('RATE_LIMITED');
            expect(result.retryable).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error with HTTP status 401 or 403, the category SHALL be FATAL.
     */
    it('should categorize HTTP 401/403 as FATAL', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          errorMessageArb(),
          fc.constantFrom(401, 403),
          (exchangeId, message, status) => {
            const error = new Error(message) as Error & { status: number };
            error.status = status;

            const result = ExchangeErrorHandler.categorizeError(error, exchangeId);

            expect(result.category).toBe('FATAL');
            expect(result.retryable).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error with HTTP status 5xx, the category SHALL be RETRYABLE.
     */
    it('should categorize HTTP 5xx as RETRYABLE', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          errorMessageArb(),
          fc.integer({ min: 500, max: 599 }),
          (exchangeId, message, status) => {
            const error = new Error(message) as Error & { status: number };
            error.status = status;

            const result = ExchangeErrorHandler.categorizeError(error, exchangeId);

            expect(result.category).toBe('RETRYABLE');
            expect(result.retryable).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error with HTTP status 4xx (except 401, 403, 429), the category
     * SHALL be INVALID_REQUEST.
     */
    it('should categorize HTTP 4xx (except 401, 403, 429) as INVALID_REQUEST', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          errorMessageArb(),
          fc.integer({ min: 400, max: 499 }).filter(s => s !== 401 && s !== 403 && s !== 429),
          (exchangeId, message, status) => {
            const error = new Error(message) as Error & { status: number };
            error.status = status;

            const result = ExchangeErrorHandler.categorizeError(error, exchangeId);

            expect(result.category).toBe('INVALID_REQUEST');
            expect(result.retryable).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any categorized error, the retryable flag SHALL be true if and only if
     * the category is RETRYABLE or RATE_LIMITED.
     */
    it('should set retryable flag correctly based on category', () => {
      fc.assert(
        fc.property(
          anyErrorArb(),
          exchangeIdArb(),
          (error, exchangeId) => {
            const result = ExchangeErrorHandler.categorizeError(error, exchangeId);

            const expectedRetryable =
              result.category === 'RETRYABLE' || result.category === 'RATE_LIMITED';

            expect(result.retryable).toBe(expectedRetryable);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any categorized error, the result SHALL contain all required fields.
     */
    it('should return ExchangeError with all required fields', () => {
      fc.assert(
        fc.property(
          anyErrorArb(),
          exchangeIdArb(),
          (error, exchangeId) => {
            const result = ExchangeErrorHandler.categorizeError(error, exchangeId);

            // Check all required fields are present
            expect(result.errorId).toBeDefined();
            expect(typeof result.errorId).toBe('string');
            expect(result.errorId.length).toBeGreaterThan(0);

            expect(result.exchangeId).toBe(exchangeId);

            expect(result.category).toBeDefined();
            expect(VALID_CATEGORIES).toContain(result.category);

            expect(result.code).toBeDefined();
            expect(typeof result.code).toBe('string');

            expect(result.message).toBeDefined();
            expect(typeof result.message).toBe('string');

            expect(typeof result.retryable).toBe('boolean');

            expect(result.timestamp).toBeDefined();
            expect(typeof result.timestamp).toBe('string');
            // Timestamp should be valid ISO date
            expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Retry Logic', () => {
    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error and retry config, shouldRetry SHALL return false when
     * attemptNumber >= maxRetries.
     */
    it('should not retry when max retries exceeded', () => {
      fc.assert(
        fc.property(
          exchangeErrorArb(),
          retryConfigArb(),
          fc.integer({ min: 0, max: 20 }),
          (error, config, attemptNumber) => {
            // Set attempt number to be >= maxRetries
            const attempt = config.maxRetries + attemptNumber;

            const shouldRetry = ExchangeErrorHandler.shouldRetry(error, attempt, config);

            expect(shouldRetry).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any error with a retryable category and attemptNumber < maxRetries,
     * shouldRetry SHALL return true.
     */
    it('should retry retryable errors when under max retries', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          retryConfigArb().filter(c => c.retryableCategories.length > 0 && c.maxRetries > 0),
          (exchangeId, config) => {
            // Pick a retryable category from the config
            const category = config.retryableCategories[0];
            const error = ExchangeErrorHandler.createError(
              exchangeId,
              category,
              'TEST',
              'Test error'
            );

            // Attempt number less than max retries (0 to maxRetries - 1)
            const attemptNumber = Math.floor(Math.random() * config.maxRetries);

            const shouldRetry = ExchangeErrorHandler.shouldRetry(error, attemptNumber, config);

            expect(shouldRetry).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any retry config, getRetryDelay SHALL follow exponential backoff formula:
     * delay = initialDelayMs * (multiplier ^ attemptNumber), capped at maxDelayMs.
     */
    it('should calculate delay using exponential backoff formula', () => {
      fc.assert(
        fc.property(
          retryConfigArb(),
          fc.integer({ min: 0, max: 10 }),
          (config, attemptNumber) => {
            const delay = ExchangeErrorHandler.getRetryDelay(attemptNumber, config);

            // Calculate expected delay
            const expectedDelay = config.initialDelayMs * Math.pow(config.multiplier, attemptNumber);
            const cappedExpectedDelay = Math.min(expectedDelay, config.maxDelayMs);

            expect(delay).toBe(cappedExpectedDelay);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 7: Error Categorization Completeness
     *
     * For any retry config, getRetryDelay SHALL never exceed maxDelayMs.
     */
    it('should cap delay at maxDelayMs', () => {
      fc.assert(
        fc.property(
          retryConfigArb(),
          fc.integer({ min: 0, max: 20 }),
          (config, attemptNumber) => {
            const delay = ExchangeErrorHandler.getRetryDelay(attemptNumber, config);

            expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 38: Exchange Error Alerting', () => {
    /**
     * Feature: exchange-integration, Property 38: Exchange Error Alerting
     *
     * For any error categorized as EXCHANGE_ERROR, alertOnError SHALL be called
     * and the alert callback SHALL receive the full error details.
     */
    it('should trigger alert for EXCHANGE_ERROR category', async () => {
      const alertedErrors: ExchangeError[] = [];
      const alertCallback = async (error: ExchangeError) => {
        alertedErrors.push(error);
      };

      ExchangeErrorHandler.setAlertCallback(alertCallback);

      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          errorCodeArb(),
          errorMessageArb(),
          async (exchangeId, code, message) => {
            alertedErrors.length = 0; // Reset

            const error = ExchangeErrorHandler.createError(
              exchangeId,
              'EXCHANGE_ERROR',
              code,
              message
            );

            await ExchangeErrorHandler.alertOnError(error);

            // Alert should have been triggered
            expect(alertedErrors.length).toBe(1);
            expect(alertedErrors[0].errorId).toBe(error.errorId);
            expect(alertedErrors[0].exchangeId).toBe(exchangeId);
            expect(alertedErrors[0].category).toBe('EXCHANGE_ERROR');
            expect(alertedErrors[0].code).toBe(code);
            expect(alertedErrors[0].message).toBe(message);
          }
        ),
        { numRuns: 100 }
      );

      ExchangeErrorHandler.setAlertCallback(null);
    });

    /**
     * Feature: exchange-integration, Property 38: Exchange Error Alerting
     *
     * For any error categorized as FATAL, alertOnError SHALL be called
     * and the alert callback SHALL receive the full error details.
     */
    it('should trigger alert for FATAL category', async () => {
      const alertedErrors: ExchangeError[] = [];
      const alertCallback = async (error: ExchangeError) => {
        alertedErrors.push(error);
      };

      ExchangeErrorHandler.setAlertCallback(alertCallback);

      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          errorCodeArb(),
          errorMessageArb(),
          async (exchangeId, code, message) => {
            alertedErrors.length = 0; // Reset

            const error = ExchangeErrorHandler.createError(
              exchangeId,
              'FATAL',
              code,
              message
            );

            await ExchangeErrorHandler.alertOnError(error);

            // Alert should have been triggered
            expect(alertedErrors.length).toBe(1);
            expect(alertedErrors[0].errorId).toBe(error.errorId);
            expect(alertedErrors[0].category).toBe('FATAL');
          }
        ),
        { numRuns: 100 }
      );

      ExchangeErrorHandler.setAlertCallback(null);
    });

    /**
     * Feature: exchange-integration, Property 38: Exchange Error Alerting
     *
     * For any error NOT categorized as EXCHANGE_ERROR or FATAL, alertOnError
     * SHALL NOT trigger the alert callback.
     */
    it('should not trigger alert for non-alertable categories', async () => {
      const alertedErrors: ExchangeError[] = [];
      const alertCallback = async (error: ExchangeError) => {
        alertedErrors.push(error);
      };

      ExchangeErrorHandler.setAlertCallback(alertCallback);

      const nonAlertableCategories: ErrorCategory[] = ['RETRYABLE', 'RATE_LIMITED', 'INVALID_REQUEST'];

      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          fc.constantFrom(...nonAlertableCategories),
          errorCodeArb(),
          errorMessageArb(),
          async (exchangeId, category, code, message) => {
            alertedErrors.length = 0; // Reset

            const error = ExchangeErrorHandler.createError(
              exchangeId,
              category,
              code,
              message
            );

            await ExchangeErrorHandler.alertOnError(error);

            // Alert should NOT have been triggered
            expect(alertedErrors.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );

      ExchangeErrorHandler.setAlertCallback(null);
    });

    /**
     * Feature: exchange-integration, Property 38: Exchange Error Alerting
     *
     * For any error, handleError SHALL log the error and trigger alerts
     * for EXCHANGE_ERROR and FATAL categories.
     */
    it('should log and alert appropriately via handleError', async () => {
      const loggedErrors: ExchangeError[] = [];
      const alertedErrors: ExchangeError[] = [];

      ExchangeErrorHandler.setLogCallback(async (error) => {
        loggedErrors.push(error);
      });
      ExchangeErrorHandler.setAlertCallback(async (error) => {
        alertedErrors.push(error);
      });

      await fc.assert(
        fc.asyncProperty(
          exchangeIdArb(),
          errorCategoryArb(),
          errorCodeArb(),
          errorMessageArb(),
          async (exchangeId, category, code, message) => {
            loggedErrors.length = 0;
            alertedErrors.length = 0;

            const error = ExchangeErrorHandler.createError(
              exchangeId,
              category,
              code,
              message
            );

            await ExchangeErrorHandler.handleError(error);

            // Error should always be logged
            expect(loggedErrors.length).toBe(1);
            expect(loggedErrors[0].errorId).toBe(error.errorId);

            // Alert should only be triggered for EXCHANGE_ERROR and FATAL
            if (category === 'EXCHANGE_ERROR' || category === 'FATAL') {
              expect(alertedErrors.length).toBe(1);
              expect(alertedErrors[0].errorId).toBe(error.errorId);
            } else {
              expect(alertedErrors.length).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );

      ExchangeErrorHandler.setLogCallback(null);
      ExchangeErrorHandler.setAlertCallback(null);
    });
  });

  describe('Error Creation', () => {
    /**
     * For any createError call, the result SHALL have all required fields
     * and the retryable flag SHALL match the category.
     */
    it('should create errors with correct fields and retryable flag', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          errorCategoryArb(),
          errorCodeArb(),
          errorMessageArb(),
          fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
          (exchangeId, category, code, message, retryAfterMs) => {
            const error = ExchangeErrorHandler.createError(
              exchangeId,
              category,
              code,
              message,
              { retryAfterMs }
            );

            expect(error.exchangeId).toBe(exchangeId);
            expect(error.category).toBe(category);
            expect(error.code).toBe(code);
            expect(error.message).toBe(message);
            expect(error.retryAfterMs).toBe(retryAfterMs);

            // Retryable should match category
            const expectedRetryable = category === 'RETRYABLE' || category === 'RATE_LIMITED';
            expect(error.retryable).toBe(expectedRetryable);

            // Should have valid errorId and timestamp
            expect(error.errorId).toBeDefined();
            expect(error.errorId.length).toBeGreaterThan(0);
            expect(error.timestamp).toBeDefined();
            expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Default Configuration', () => {
    it('should return default retry config', () => {
      const config = ExchangeErrorHandler.getDefaultRetryConfig();

      expect(config.maxRetries).toBe(DEFAULT_ERROR_RETRY_CONFIG.maxRetries);
      expect(config.initialDelayMs).toBe(DEFAULT_ERROR_RETRY_CONFIG.initialDelayMs);
      expect(config.maxDelayMs).toBe(DEFAULT_ERROR_RETRY_CONFIG.maxDelayMs);
      expect(config.multiplier).toBe(DEFAULT_ERROR_RETRY_CONFIG.multiplier);
      expect(config.retryableCategories).toEqual(DEFAULT_ERROR_RETRY_CONFIG.retryableCategories);
    });

    it('should correctly identify retryable categories', () => {
      fc.assert(
        fc.property(
          errorCategoryArb(),
          (category) => {
            const isRetryable = ExchangeErrorHandler.isRetryableCategory(category);

            const expectedRetryable =
              DEFAULT_ERROR_RETRY_CONFIG.retryableCategories.includes(category);

            expect(isRetryable).toBe(expectedRetryable);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
