/**
 * Exchange Error Handler Service
 *
 * Provides error categorization, retry logic, logging, and alerting for
 * exchange-related errors. Implements consistent error handling across
 * all exchange adapters.
 *
 * Requirements: 2.4, 10.1, 10.5
 */

import {
  ErrorCategory,
  ExchangeError,
  RetryConfig,
} from '../types/exchange-error';
import { ExchangeId } from '../types/exchange';
import { generateUUID } from '../utils/uuid';

/**
 * Default retry configuration
 */
export const DEFAULT_ERROR_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  retryableCategories: ['RETRYABLE', 'RATE_LIMITED'],
};

/**
 * Alert callback type for error alerting
 */
export type AlertCallback = (error: ExchangeError) => Promise<void>;

/**
 * Log callback type for error logging
 */
export type LogCallback = (error: ExchangeError) => Promise<void>;

/**
 * HTTP status code ranges for error categorization
 */
const HTTP_STATUS_CATEGORIES: Record<string, ErrorCategory> = {
  '429': 'RATE_LIMITED',
  '401': 'FATAL',
  '403': 'FATAL',
};

/**
 * Known exchange error codes and their categories
 */
const EXCHANGE_ERROR_CODES: Record<string, ErrorCategory> = {
  // Binance error codes
  '-1000': 'EXCHANGE_ERROR', // Unknown error
  '-1001': 'RETRYABLE', // Disconnected
  '-1002': 'FATAL', // Unauthorized
  '-1003': 'RATE_LIMITED', // Too many requests
  '-1006': 'RETRYABLE', // Unexpected response
  '-1007': 'RETRYABLE', // Timeout
  '-1015': 'RATE_LIMITED', // Too many orders
  '-1021': 'RETRYABLE', // Timestamp outside recv window
  '-2010': 'INVALID_REQUEST', // New order rejected
  '-2011': 'INVALID_REQUEST', // Cancel rejected
  '-2013': 'INVALID_REQUEST', // Order does not exist
  '-2014': 'FATAL', // API key format invalid
  '-2015': 'FATAL', // Invalid API key, IP, or permissions

  // Coinbase error codes
  'invalid_request': 'INVALID_REQUEST',
  'invalid_scope': 'FATAL',
  'expired_token': 'FATAL',
  'revoked_token': 'FATAL',
  'invalid_token': 'FATAL',
  'rate_limit_exceeded': 'RATE_LIMITED',
  'internal_server_error': 'RETRYABLE',

  // Generic error codes
  'TIMEOUT': 'RETRYABLE',
  'NETWORK_ERROR': 'RETRYABLE',
  'CONNECTION_RESET': 'RETRYABLE',
  'DNS_ERROR': 'RETRYABLE',
  'SSL_ERROR': 'FATAL',
  'INVALID_SIGNATURE': 'FATAL',
  'INSUFFICIENT_FUNDS': 'INVALID_REQUEST',
  'ORDER_NOT_FOUND': 'INVALID_REQUEST',
  'INVALID_SYMBOL': 'INVALID_REQUEST',
  'INVALID_QUANTITY': 'INVALID_REQUEST',
  'INVALID_PRICE': 'INVALID_REQUEST',
};

/**
 * Error message patterns for categorization
 */
const ERROR_MESSAGE_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  { pattern: /timeout/i, category: 'RETRYABLE' },
  { pattern: /timed out/i, category: 'RETRYABLE' },
  { pattern: /network/i, category: 'RETRYABLE' },
  { pattern: /econnreset/i, category: 'RETRYABLE' },
  { pattern: /econnrefused/i, category: 'RETRYABLE' },
  { pattern: /enotfound/i, category: 'RETRYABLE' },
  { pattern: /socket hang up/i, category: 'RETRYABLE' },
  { pattern: /fetch failed/i, category: 'RETRYABLE' },
  { pattern: /rate limit/i, category: 'RATE_LIMITED' },
  { pattern: /too many requests/i, category: 'RATE_LIMITED' },
  { pattern: /throttl/i, category: 'RATE_LIMITED' },
  { pattern: /unauthorized/i, category: 'FATAL' },
  { pattern: /forbidden/i, category: 'FATAL' },
  { pattern: /invalid api key/i, category: 'FATAL' },
  { pattern: /authentication/i, category: 'FATAL' },
  { pattern: /invalid signature/i, category: 'FATAL' },
  { pattern: /invalid.*request/i, category: 'INVALID_REQUEST' },
  { pattern: /bad request/i, category: 'INVALID_REQUEST' },
  { pattern: /validation/i, category: 'INVALID_REQUEST' },
  { pattern: /not found/i, category: 'INVALID_REQUEST' },
  { pattern: /does not exist/i, category: 'INVALID_REQUEST' },
];


/**
 * Exchange Error Handler
 *
 * Provides methods for categorizing errors, determining retry behavior,
 * calculating retry delays, and handling error logging/alerting.
 */
export const ExchangeErrorHandler = {
  /**
   * Alert callback for error notifications
   */
  alertCallback: null as AlertCallback | null,

  /**
   * Log callback for error logging
   */
  logCallback: null as LogCallback | null,

  /**
   * Set the alert callback for error notifications
   *
   * @param callback - Function to call when an alert should be triggered
   */
  setAlertCallback(callback: AlertCallback | null): void {
    this.alertCallback = callback;
  },

  /**
   * Set the log callback for error logging
   *
   * @param callback - Function to call when an error should be logged
   */
  setLogCallback(callback: LogCallback | null): void {
    this.logCallback = callback;
  },

  /**
   * Categorize an error into one of the defined error categories
   *
   * Categories:
   * - RETRYABLE: Transient errors that may succeed on retry (5xx, timeout, network)
   * - RATE_LIMITED: Rate limit exceeded (429)
   * - INVALID_REQUEST: Client errors that won't succeed on retry (4xx except auth)
   * - EXCHANGE_ERROR: Exchange-specific errors requiring investigation
   * - FATAL: Authentication failures or unrecoverable errors
   *
   * @param error - The error to categorize
   * @param exchangeId - The exchange where the error occurred
   * @returns Structured ExchangeError with category
   *
   * Requirements: 2.4, 10.1
   */
  categorizeError(error: unknown, exchangeId: ExchangeId): ExchangeError {
    const errorId = generateUUID();
    const timestamp = new Date().toISOString();

    // Extract error details
    const { code, message, statusCode, retryAfterMs, originalError } =
      this.extractErrorDetails(error);

    // Determine category
    const category = this.determineCategory(code, message, statusCode);

    // Determine if retryable based on category
    const retryable = category === 'RETRYABLE' || category === 'RATE_LIMITED';

    return {
      errorId,
      exchangeId,
      category,
      code,
      message,
      originalError,
      retryable,
      retryAfterMs,
      timestamp,
    };
  },

  /**
   * Extract error details from various error types
   */
  extractErrorDetails(error: unknown): {
    code: string;
    message: string;
    statusCode?: number;
    retryAfterMs?: number;
    originalError: unknown;
  } {
    if (error instanceof Error) {
      // Check for HTTP status code in error
      const statusCode = this.extractStatusCode(error);
      const code = this.extractErrorCode(error);
      const retryAfterMs = this.extractRetryAfter(error);

      return {
        code,
        message: error.message,
        statusCode,
        retryAfterMs,
        originalError: error,
      };
    }

    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      return {
        code: String(errorObj.code ?? errorObj.errorCode ?? 'UNKNOWN'),
        message: String(errorObj.message ?? errorObj.msg ?? errorObj.error ?? 'Unknown error'),
        statusCode: typeof errorObj.status === 'number' ? errorObj.status : undefined,
        retryAfterMs: typeof errorObj.retryAfter === 'number' ? errorObj.retryAfter : undefined,
        originalError: error,
      };
    }

    return {
      code: 'UNKNOWN',
      message: String(error),
      originalError: error,
    };
  },

  /**
   * Extract HTTP status code from error
   */
  extractStatusCode(error: Error): number | undefined {
    const errorWithStatus = error as Error & {
      status?: number;
      statusCode?: number;
      response?: { status?: number };
    };

    return (
      errorWithStatus.status ??
      errorWithStatus.statusCode ??
      errorWithStatus.response?.status
    );
  },

  /**
   * Extract error code from error
   */
  extractErrorCode(error: Error): string {
    const errorWithCode = error as Error & {
      code?: string | number;
      errorCode?: string | number;
    };

    if (errorWithCode.code !== undefined) {
      return String(errorWithCode.code);
    }
    if (errorWithCode.errorCode !== undefined) {
      return String(errorWithCode.errorCode);
    }

    return 'UNKNOWN';
  },

  /**
   * Extract retry-after value from error
   */
  extractRetryAfter(error: Error): number | undefined {
    const errorWithRetry = error as Error & {
      retryAfter?: number;
      retryAfterMs?: number;
    };

    return errorWithRetry.retryAfterMs ?? errorWithRetry.retryAfter;
  },

  /**
   * Determine error category based on code, message, and status
   */
  determineCategory(
    code: string,
    message: string,
    statusCode?: number
  ): ErrorCategory {
    // Check HTTP status code first
    if (statusCode !== undefined) {
      const statusCategory = HTTP_STATUS_CATEGORIES[String(statusCode)];
      if (statusCategory) {
        return statusCategory;
      }

      // 4xx errors (except 429, 401, 403) are invalid requests
      if (statusCode >= 400 && statusCode < 500) {
        return 'INVALID_REQUEST';
      }

      // 5xx errors are retryable
      if (statusCode >= 500) {
        return 'RETRYABLE';
      }
    }

    // Check known error codes
    const codeCategory = EXCHANGE_ERROR_CODES[code];
    if (codeCategory) {
      return codeCategory;
    }

    // Check message patterns
    for (const { pattern, category } of ERROR_MESSAGE_PATTERNS) {
      if (pattern.test(message)) {
        return category;
      }
    }

    // Default to EXCHANGE_ERROR for unknown errors
    return 'EXCHANGE_ERROR';
  },

  /**
   * Determine if an error should be retried
   *
   * @param error - The categorized error
   * @param attemptNumber - Current attempt number (0-indexed)
   * @param config - Retry configuration
   * @returns True if the error should be retried
   *
   * Requirements: 10.2
   */
  shouldRetry(
    error: ExchangeError,
    attemptNumber: number,
    config: RetryConfig = DEFAULT_ERROR_RETRY_CONFIG
  ): boolean {
    // Don't retry if we've exceeded max retries
    if (attemptNumber >= config.maxRetries) {
      return false;
    }

    // Check if the error category is retryable
    return config.retryableCategories.includes(error.category);
  },

  /**
   * Calculate retry delay using exponential backoff
   *
   * Formula: delay = initialDelayMs * (multiplier ^ attemptNumber)
   * Capped at maxDelayMs
   *
   * @param attemptNumber - Current attempt number (0-indexed)
   * @param config - Retry configuration
   * @returns Delay in milliseconds
   *
   * Requirements: 10.2
   */
  getRetryDelay(
    attemptNumber: number,
    config: RetryConfig = DEFAULT_ERROR_RETRY_CONFIG
  ): number {
    const delay = config.initialDelayMs * Math.pow(config.multiplier, attemptNumber);
    return Math.min(delay, config.maxDelayMs);
  },

  /**
   * Log an error with full details
   *
   * For EXCHANGE_ERROR category, logs full error details for investigation.
   *
   * @param error - The error to log
   *
   * Requirements: 10.5
   */
  async logError(error: ExchangeError): Promise<void> {
    // Always log to console for debugging
    const logLevel = error.category === 'FATAL' ? 'error' : 'warn';
    console[logLevel]('[ExchangeError]', {
      errorId: error.errorId,
      exchangeId: error.exchangeId,
      category: error.category,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      timestamp: error.timestamp,
    });

    // Call custom log callback if set
    if (this.logCallback) {
      await this.logCallback(error);
    }
  },

  /**
   * Trigger an alert for an error
   *
   * Alerts are triggered for EXCHANGE_ERROR and FATAL categories
   * to notify operators of issues requiring investigation.
   *
   * @param error - The error to alert on
   *
   * Requirements: 10.5
   */
  async alertOnError(error: ExchangeError): Promise<void> {
    // Only alert on EXCHANGE_ERROR and FATAL categories
    if (error.category !== 'EXCHANGE_ERROR' && error.category !== 'FATAL') {
      return;
    }

    // Log full details for investigation
    console.error('[ExchangeAlert]', {
      errorId: error.errorId,
      exchangeId: error.exchangeId,
      category: error.category,
      code: error.code,
      message: error.message,
      originalError: error.originalError,
      timestamp: error.timestamp,
    });

    // Call custom alert callback if set
    if (this.alertCallback) {
      await this.alertCallback(error);
    }
  },

  /**
   * Handle an error with logging and alerting
   *
   * Combines logging and alerting based on error category.
   *
   * @param error - The error to handle
   *
   * Requirements: 10.5
   */
  async handleError(error: ExchangeError): Promise<void> {
    // Always log the error
    await this.logError(error);

    // Alert for EXCHANGE_ERROR and FATAL categories
    await this.alertOnError(error);
  },

  /**
   * Create an ExchangeError from raw error data
   *
   * Utility method for creating structured errors from various sources.
   *
   * @param exchangeId - The exchange where the error occurred
   * @param category - The error category
   * @param code - The error code
   * @param message - The error message
   * @param options - Additional options
   * @returns Structured ExchangeError
   */
  createError(
    exchangeId: ExchangeId,
    category: ErrorCategory,
    code: string,
    message: string,
    options?: {
      originalError?: unknown;
      retryAfterMs?: number;
    }
  ): ExchangeError {
    return {
      errorId: generateUUID(),
      exchangeId,
      category,
      code,
      message,
      originalError: options?.originalError,
      retryable: category === 'RETRYABLE' || category === 'RATE_LIMITED',
      retryAfterMs: options?.retryAfterMs,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Check if an error category is retryable
   *
   * @param category - The error category to check
   * @param config - Retry configuration
   * @returns True if the category is retryable
   */
  isRetryableCategory(
    category: ErrorCategory,
    config: RetryConfig = DEFAULT_ERROR_RETRY_CONFIG
  ): boolean {
    return config.retryableCategories.includes(category);
  },

  /**
   * Get the default retry configuration
   *
   * @returns Default retry configuration
   */
  getDefaultRetryConfig(): RetryConfig {
    return { ...DEFAULT_ERROR_RETRY_CONFIG };
  },
};
