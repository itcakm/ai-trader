import { 
  ExchangeLimitsRepository, 
  ExchangeLimits, 
  ExchangeHealth, 
  RateLimitState 
} from '../repositories/exchange-limits';
import { OrderRequest } from '../types/order';
import { ValidationResult } from '../types/risk-profile';

/**
 * Exchange Safeguard Service
 * 
 * Provides exchange-specific safeguards including:
 * - Order validation against exchange limits
 * - Rate limit tracking and throttling
 * - Exchange health monitoring
 * - Error categorization
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.6
 */

export type ErrorCategory = 'RETRYABLE' | 'RATE_LIMIT' | 'INVALID_ORDER' | 'EXCHANGE_ERROR' | 'FATAL';

export interface ExchangeError {
  code: string;
  message: string;
  exchangeId: string;
  statusCode?: number;
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: string;
  shouldWait: boolean;
  waitMs?: number;
}

export interface OrderValidationResult extends ValidationResult {
  limitViolations: LimitViolation[];
}

export interface LimitViolation {
  limitType: 'MIN_ORDER_SIZE' | 'MAX_ORDER_SIZE' | 'MIN_PRICE' | 'MAX_PRICE' | 'PRICE_DEVIATION' | 'TICK_SIZE' | 'LOT_SIZE';
  currentValue: number;
  limitValue: number;
  message: string;
}

/**
 * Default rate limit buffer percentage (reserve this % of rate limit)
 */
const DEFAULT_RATE_LIMIT_BUFFER = 10;

/**
 * Error code patterns for categorization
 */
const ERROR_PATTERNS = {
  RETRYABLE: [
    'TIMEOUT', 'CONNECTION_RESET', 'ECONNRESET', 'ETIMEDOUT', 
    'NETWORK_ERROR', 'SERVICE_UNAVAILABLE', '503', '504'
  ],
  RATE_LIMIT: [
    'RATE_LIMIT', 'TOO_MANY_REQUESTS', '429', 'THROTTLED', 
    'REQUEST_LIMIT_EXCEEDED', 'IP_BANNED'
  ],
  INVALID_ORDER: [
    'INVALID_ORDER', 'INVALID_QUANTITY', 'INVALID_PRICE', 
    'MIN_NOTIONAL', 'LOT_SIZE', 'PRICE_FILTER', 'INSUFFICIENT_BALANCE',
    'INVALID_SYMBOL', 'MARKET_CLOSED'
  ],
  EXCHANGE_ERROR: [
    'EXCHANGE_ERROR', 'INTERNAL_ERROR', '500', 'SYSTEM_ERROR',
    'MAINTENANCE', 'ORDER_REJECTED'
  ]
};

export const ExchangeSafeguardService = {
  /**
   * Validate an order against exchange-specific limits
   * 
   * Requirements: 9.1, 9.2
   * 
   * @param order - The order to validate
   * @param limits - Exchange limits for the asset
   * @param currentPrice - Current market price (optional, for price deviation check)
   * @returns Validation result with any limit violations
   */
  validateOrder(
    order: OrderRequest, 
    limits: ExchangeLimits,
    currentPrice?: number
  ): OrderValidationResult {
    const violations: LimitViolation[] = [];
    const errors: string[] = [];

    // Check minimum order size
    if (order.quantity < limits.minOrderSize) {
      violations.push({
        limitType: 'MIN_ORDER_SIZE',
        currentValue: order.quantity,
        limitValue: limits.minOrderSize,
        message: `Order quantity ${order.quantity} is below minimum ${limits.minOrderSize}`
      });
      errors.push(`Order quantity ${order.quantity} is below minimum order size ${limits.minOrderSize}`);
    }

    // Check maximum order size
    if (order.quantity > limits.maxOrderSize) {
      violations.push({
        limitType: 'MAX_ORDER_SIZE',
        currentValue: order.quantity,
        limitValue: limits.maxOrderSize,
        message: `Order quantity ${order.quantity} exceeds maximum ${limits.maxOrderSize}`
      });
      errors.push(`Order quantity ${order.quantity} exceeds maximum order size ${limits.maxOrderSize}`);
    }

    // Check lot size (quantity must be multiple of lot size)
    if (limits.lotSize > 0) {
      // Use relative tolerance for floating point comparison
      const quotient = order.quantity / limits.lotSize;
      const roundedQuotient = Math.round(quotient);
      const tolerance = 1e-6; // Increased tolerance for floating point precision
      const isMultiple = Math.abs(quotient - roundedQuotient) < tolerance;
      
      if (!isMultiple) {
        violations.push({
          limitType: 'LOT_SIZE',
          currentValue: order.quantity,
          limitValue: limits.lotSize,
          message: `Order quantity ${order.quantity} is not a multiple of lot size ${limits.lotSize}`
        });
        errors.push(`Order quantity must be a multiple of lot size ${limits.lotSize}`);
      }
    }

    // Check price limits for limit orders
    if (order.price !== undefined && order.orderType === 'LIMIT') {
      // Check minimum price
      if (order.price < limits.minPrice) {
        violations.push({
          limitType: 'MIN_PRICE',
          currentValue: order.price,
          limitValue: limits.minPrice,
          message: `Order price ${order.price} is below minimum ${limits.minPrice}`
        });
        errors.push(`Order price ${order.price} is below minimum price ${limits.minPrice}`);
      }

      // Check maximum price
      if (order.price > limits.maxPrice) {
        violations.push({
          limitType: 'MAX_PRICE',
          currentValue: order.price,
          limitValue: limits.maxPrice,
          message: `Order price ${order.price} exceeds maximum ${limits.maxPrice}`
        });
        errors.push(`Order price ${order.price} exceeds maximum price ${limits.maxPrice}`);
      }

      // Check tick size (price must be multiple of tick size)
      if (limits.tickSize > 0) {
        // Use relative tolerance for floating point comparison
        const priceQuotient = order.price / limits.tickSize;
        const roundedPriceQuotient = Math.round(priceQuotient);
        const priceTolerance = 1e-6; // Increased tolerance for floating point precision
        const isPriceMultiple = Math.abs(priceQuotient - roundedPriceQuotient) < priceTolerance;
        
        if (!isPriceMultiple) {
          violations.push({
            limitType: 'TICK_SIZE',
            currentValue: order.price,
            limitValue: limits.tickSize,
            message: `Order price ${order.price} is not a multiple of tick size ${limits.tickSize}`
          });
          errors.push(`Order price must be a multiple of tick size ${limits.tickSize}`);
        }
      }

      // Check price deviation from current market price
      if (currentPrice !== undefined && currentPrice > 0) {
        const deviationPercent = Math.abs((order.price - currentPrice) / currentPrice) * 100;
        if (deviationPercent > limits.maxPriceDeviationPercent) {
          violations.push({
            limitType: 'PRICE_DEVIATION',
            currentValue: deviationPercent,
            limitValue: limits.maxPriceDeviationPercent,
            message: `Price deviation ${deviationPercent.toFixed(2)}% exceeds maximum ${limits.maxPriceDeviationPercent}%`
          });
          errors.push(`Price deviation ${deviationPercent.toFixed(2)}% exceeds maximum allowed ${limits.maxPriceDeviationPercent}%`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      errors,
      limitViolations: violations
    };
  },

  /**
   * Check exchange health status
   * 
   * @param exchangeId - The exchange identifier
   * @returns Exchange health status
   */
  async checkExchangeHealth(exchangeId: string): Promise<ExchangeHealth> {
    const health = await ExchangeLimitsRepository.getHealth(exchangeId);
    
    if (!health) {
      // Return default healthy status if no health record exists
      return {
        exchangeId,
        status: 'HEALTHY',
        latencyMs: 0,
        errorRate: 0,
        rateLimitRemaining: 1000,
        rateLimitResetAt: new Date(Date.now() + 60000).toISOString(),
        lastCheckedAt: new Date().toISOString()
      };
    }

    return health;
  },

  /**
   * Update exchange health status
   * 
   * @param health - The health status to update
   */
  async updateExchangeHealth(health: ExchangeHealth): Promise<void> {
    await ExchangeLimitsRepository.putHealth(health);
  },

  /**
   * Track rate limit usage and determine if throttling is needed
   * 
   * Requirements: 9.3
   * 
   * @param exchangeId - The exchange identifier
   * @param requestCount - Number of requests to track
   * @param bufferPercent - Percentage of rate limit to reserve as buffer
   * @returns Rate limit status with throttling recommendation
   */
  async trackRateLimit(
    exchangeId: string, 
    requestCount: number = 1,
    bufferPercent: number = DEFAULT_RATE_LIMIT_BUFFER
  ): Promise<RateLimitStatus> {
    // Get current rate limit state
    let state = await ExchangeLimitsRepository.getRateLimitState(exchangeId);
    const now = new Date();

    if (!state) {
      // Initialize rate limit state with defaults
      state = {
        exchangeId,
        remaining: 1000,
        limit: 1000,
        resetAt: new Date(now.getTime() + 60000).toISOString(),
        windowStart: now.toISOString(),
        requestCount: 0,
        updatedAt: now.toISOString()
      };
      await ExchangeLimitsRepository.putRateLimitState(state);
    }

    // Check if we need to reset the window
    const resetTime = new Date(state.resetAt);
    if (now >= resetTime) {
      // Reset the window
      state = {
        ...state,
        remaining: state.limit,
        resetAt: new Date(now.getTime() + 60000).toISOString(),
        windowStart: now.toISOString(),
        requestCount: 0,
        updatedAt: now.toISOString()
      };
      await ExchangeLimitsRepository.putRateLimitState(state);
    }

    // Calculate effective limit with buffer
    const effectiveLimit = state.limit * (1 - bufferPercent / 100);
    const usedRequests = state.requestCount + requestCount;
    const remaining = Math.max(0, state.limit - usedRequests);

    // Determine if we should wait
    const shouldWait = usedRequests >= effectiveLimit;
    let waitMs: number | undefined;

    if (shouldWait) {
      // Calculate wait time until reset
      waitMs = Math.max(0, resetTime.getTime() - now.getTime());
    }

    // Update request count
    await ExchangeLimitsRepository.incrementRequestCount(exchangeId, requestCount);

    return {
      remaining,
      limit: state.limit,
      resetAt: state.resetAt,
      shouldWait,
      waitMs
    };
  },

  /**
   * Check if requests should be throttled for an exchange
   * 
   * Requirements: 9.3
   * 
   * @param exchangeId - The exchange identifier
   * @param bufferPercent - Percentage of rate limit to reserve as buffer
   * @returns True if requests should be throttled
   */
  async shouldThrottle(
    exchangeId: string,
    bufferPercent: number = DEFAULT_RATE_LIMIT_BUFFER
  ): Promise<boolean> {
    const state = await ExchangeLimitsRepository.getRateLimitState(exchangeId);
    
    if (!state) {
      return false;
    }

    const now = new Date();
    const resetTime = new Date(state.resetAt);

    // If past reset time, no throttling needed
    if (now >= resetTime) {
      return false;
    }

    // Calculate effective limit with buffer
    const effectiveLimit = state.limit * (1 - bufferPercent / 100);
    
    return state.requestCount >= effectiveLimit;
  },

  /**
   * Categorize an exchange error for appropriate handling
   * 
   * Requirements: 9.6
   * 
   * @param error - The exchange error to categorize
   * @returns Error category for handling
   */
  categorizeError(error: ExchangeError): ErrorCategory {
    const errorCode = error.code.toUpperCase();
    const errorMessage = error.message.toUpperCase();
    const statusCodeStr = error.statusCode ? String(error.statusCode) : '';

    // First, check the error code directly for explicit categorization
    // This takes priority over pattern matching in the message
    for (const pattern of ERROR_PATTERNS.RATE_LIMIT) {
      if (errorCode.includes(pattern)) {
        return 'RATE_LIMIT';
      }
    }

    for (const pattern of ERROR_PATTERNS.INVALID_ORDER) {
      if (errorCode.includes(pattern)) {
        return 'INVALID_ORDER';
      }
    }

    for (const pattern of ERROR_PATTERNS.EXCHANGE_ERROR) {
      if (errorCode.includes(pattern)) {
        return 'EXCHANGE_ERROR';
      }
    }

    for (const pattern of ERROR_PATTERNS.RETRYABLE) {
      if (errorCode.includes(pattern)) {
        return 'RETRYABLE';
      }
    }

    // Then check status code for HTTP-based categorization
    if (statusCodeStr === '429') {
      return 'RATE_LIMIT';
    }
    if (statusCodeStr === '500') {
      return 'EXCHANGE_ERROR';
    }
    if (statusCodeStr === '503' || statusCodeStr === '504') {
      return 'RETRYABLE';
    }

    // Finally, check the message for pattern matching
    const errorString = `${errorCode} ${errorMessage} ${statusCodeStr}`;

    // Check for rate limit errors first (highest priority)
    for (const pattern of ERROR_PATTERNS.RATE_LIMIT) {
      if (errorString.includes(pattern)) {
        return 'RATE_LIMIT';
      }
    }

    // Check for invalid order errors
    for (const pattern of ERROR_PATTERNS.INVALID_ORDER) {
      if (errorString.includes(pattern)) {
        return 'INVALID_ORDER';
      }
    }

    // Check for exchange errors before retryable
    // (exchange errors are more specific than retryable)
    for (const pattern of ERROR_PATTERNS.EXCHANGE_ERROR) {
      if (errorString.includes(pattern)) {
        return 'EXCHANGE_ERROR';
      }
    }

    // Check for retryable errors
    for (const pattern of ERROR_PATTERNS.RETRYABLE) {
      if (errorString.includes(pattern)) {
        return 'RETRYABLE';
      }
    }

    // Default to FATAL for unknown errors
    return 'FATAL';
  },

  /**
   * Get exchange limits for an asset
   * 
   * @param exchangeId - The exchange identifier
   * @param assetId - The asset identifier
   * @returns Exchange limits or null if not found
   */
  async getExchangeLimits(exchangeId: string, assetId: string): Promise<ExchangeLimits | null> {
    return ExchangeLimitsRepository.getLimits(exchangeId, assetId);
  },

  /**
   * Set exchange limits for an asset
   * 
   * @param limits - The exchange limits to set
   */
  async setExchangeLimits(limits: ExchangeLimits): Promise<void> {
    const now = new Date().toISOString();
    await ExchangeLimitsRepository.putLimits({
      ...limits,
      createdAt: limits.createdAt || now,
      updatedAt: now
    });
  },

  /**
   * Initialize rate limit state for an exchange
   * 
   * @param exchangeId - The exchange identifier
   * @param limit - The rate limit (requests per window)
   * @param windowMs - The window duration in milliseconds (default 60000 = 1 minute)
   */
  async initializeRateLimitState(
    exchangeId: string, 
    limit: number,
    windowMs: number = 60000
  ): Promise<void> {
    const now = new Date();
    const state: RateLimitState = {
      exchangeId,
      remaining: limit,
      limit,
      resetAt: new Date(now.getTime() + windowMs).toISOString(),
      windowStart: now.toISOString(),
      requestCount: 0,
      updatedAt: now.toISOString()
    };
    await ExchangeLimitsRepository.putRateLimitState(state);
  }
};
