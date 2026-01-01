/**
 * Exchange Rate Limiter Service
 *
 * Tracks API usage against each exchange's rate limits and provides
 * rate limit checking, consumption, and status reporting.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { ExchangeId } from '../types/exchange';
import {
  RateLimitCategory,
  RateLimitState,
  RateLimitConfig,
  CategoryLimit,
  RateLimitCheckResult,
  QueuedRequest,
  QueueStatus,
  RequestPriority,
} from '../types/exchange-rate-limit';
import { generateUUID } from '../utils/uuid';

/**
 * In-memory store for rate limit state per exchange per category
 * Key format: `${exchangeId}:${category}`
 */
const rateLimitStore = new Map<string, RateLimitState>();

/**
 * In-memory store for rate limit configurations per exchange
 */
const configStore = new Map<ExchangeId, RateLimitConfig>();

/**
 * Request queue per exchange
 */
const requestQueues = new Map<ExchangeId, QueuedRequest[]>();

/**
 * Retry-after delays per exchange (set when rate limited by exchange)
 */
const retryAfterDelays = new Map<ExchangeId, { delayUntil: string; delayMs: number }>();

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: Omit<RateLimitConfig, 'exchangeId'> = {
  limits: [
    { category: 'ORDERS', requestsPerSecond: 10, requestsPerMinute: 600 },
    { category: 'QUERIES', requestsPerSecond: 20, requestsPerMinute: 1200 },
    { category: 'WEBSOCKET', requestsPerSecond: 5, requestsPerMinute: 300 },
    { category: 'WEIGHT', requestsPerSecond: 100, requestsPerMinute: 6000, weight: 1 },
  ],
  criticalReservationPercent: 10,
  warningThresholdPercent: 80,
  burstAllowed: true,
};

/**
 * Get the store key for a rate limit state
 */
function getStoreKey(exchangeId: ExchangeId, category: RateLimitCategory): string {
  return `${exchangeId}:${category}`;
}

/**
 * Get or create rate limit state for an exchange/category
 */
function getOrCreateState(
  exchangeId: ExchangeId,
  tenantId: string,
  category: RateLimitCategory
): RateLimitState {
  const key = getStoreKey(exchangeId, category);
  let state = rateLimitStore.get(key);

  if (!state) {
    const config = configStore.get(exchangeId);
    const categoryLimit = config?.limits.find((l) => l.category === category);
    const limit = categoryLimit?.requestsPerMinute ?? 600;
    const criticalPercent = config?.criticalReservationPercent ?? DEFAULT_CONFIG.criticalReservationPercent;
    const reservedForCritical = Math.floor(limit * (criticalPercent / 100));

    state = {
      exchangeId,
      tenantId,
      category,
      limit,
      used: 0,
      remaining: limit,
      resetsAt: getNextResetTime(),
      reservedForCritical,
    };
    rateLimitStore.set(key, state);
  }

  return state;
}

/**
 * Get the next reset time (1 minute from now)
 */
function getNextResetTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  now.setSeconds(0);
  now.setMilliseconds(0);
  return now.toISOString();
}

/**
 * Check if the rate limit window has reset and update state if needed
 */
function checkAndResetWindow(state: RateLimitState): void {
  const now = new Date();
  const resetTime = new Date(state.resetsAt);

  if (now >= resetTime) {
    state.used = 0;
    state.remaining = state.limit;
    state.resetsAt = getNextResetTime();
  }
}

/**
 * Parse retry-after header value to milliseconds
 *
 * Supports:
 * - Numeric seconds: "120" -> 120000ms
 * - HTTP date: "Wed, 21 Oct 2015 07:28:00 GMT" -> calculated ms
 *
 * @param retryAfterValue - The retry-after header value
 * @returns The delay in milliseconds
 *
 * Requirements: 9.4
 */
export function parseRetryAfterHeader(retryAfterValue: string): number {
  // Try parsing as a number (seconds)
  const seconds = parseInt(retryAfterValue, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as an HTTP date
  const date = new Date(retryAfterValue);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return Math.max(0, delayMs);
  }

  // Default to 1 second if parsing fails
  return 1000;
}


/**
 * Exchange Rate Limiter Service
 */
export const ExchangeRateLimiter = {
  /**
   * Configure rate limits for an exchange
   *
   * @param config - The rate limit configuration
   *
   * Requirements: 9.1, 9.3
   */
  configure(config: RateLimitConfig): void {
    configStore.set(config.exchangeId, config);

    // Reset states for this exchange to apply new config
    for (const limit of config.limits) {
      const key = getStoreKey(config.exchangeId, limit.category);
      rateLimitStore.delete(key);
    }
  },

  /**
   * Get the configuration for an exchange
   *
   * @param exchangeId - The exchange identifier
   * @returns The rate limit configuration or undefined
   */
  getConfig(exchangeId: ExchangeId): RateLimitConfig | undefined {
    return configStore.get(exchangeId);
  },

  /**
   * Check if a request is allowed under rate limits
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @param category - The rate limit category
   * @param priority - The request priority (for critical reservation)
   * @returns The rate limit check result
   *
   * Requirements: 9.1, 9.5
   */
  checkLimit(
    exchangeId: ExchangeId,
    tenantId: string,
    category: RateLimitCategory,
    priority: RequestPriority = 'NORMAL'
  ): RateLimitCheckResult {
    const state = getOrCreateState(exchangeId, tenantId, category);
    checkAndResetWindow(state);

    // Check for retry-after delay
    const retryAfter = retryAfterDelays.get(exchangeId);
    if (retryAfter) {
      const delayUntil = new Date(retryAfter.delayUntil);
      const now = new Date();
      if (now < delayUntil) {
        const waitMs = delayUntil.getTime() - now.getTime();
        return {
          allowed: false,
          remaining: state.remaining,
          waitMs,
          category,
        };
      } else {
        // Delay has passed, remove it
        retryAfterDelays.delete(exchangeId);
      }
    }

    // Calculate available capacity
    const availableForNonCritical = state.remaining - state.reservedForCritical;

    // Critical requests can use reserved capacity
    if (priority === 'CRITICAL') {
      if (state.remaining > 0) {
        return {
          allowed: true,
          remaining: state.remaining,
          category,
        };
      }
    } else {
      // Non-critical requests cannot use reserved capacity
      if (availableForNonCritical > 0) {
        return {
          allowed: true,
          remaining: availableForNonCritical,
          category,
        };
      }
    }

    // Calculate wait time until reset
    const resetTime = new Date(state.resetsAt);
    const now = new Date();
    const waitMs = Math.max(0, resetTime.getTime() - now.getTime());

    return {
      allowed: false,
      remaining: priority === 'CRITICAL' ? state.remaining : availableForNonCritical,
      waitMs,
      category,
    };
  },

  /**
   * Consume rate limit capacity
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @param category - The rate limit category
   * @param weight - The weight to consume (default 1)
   *
   * Requirements: 9.1, 9.3
   */
  consumeLimit(
    exchangeId: ExchangeId,
    tenantId: string,
    category: RateLimitCategory,
    weight: number = 1
  ): void {
    const state = getOrCreateState(exchangeId, tenantId, category);
    checkAndResetWindow(state);

    state.used += weight;
    state.remaining = Math.max(0, state.limit - state.used);

    // Update the store
    const key = getStoreKey(exchangeId, category);
    rateLimitStore.set(key, state);
  },

  /**
   * Get the current rate limit status for an exchange
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @returns Array of rate limit states for all categories
   *
   * Requirements: 9.6
   */
  getRateLimitStatus(exchangeId: ExchangeId, tenantId: string): RateLimitState[] {
    const categories: RateLimitCategory[] = ['ORDERS', 'QUERIES', 'WEBSOCKET', 'WEIGHT'];
    const states: RateLimitState[] = [];

    for (const category of categories) {
      const state = getOrCreateState(exchangeId, tenantId, category);
      checkAndResetWindow(state);
      states.push({ ...state });
    }

    return states;
  },

  /**
   * Get rate limit state for a specific category
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @param category - The rate limit category
   * @returns The rate limit state
   *
   * Requirements: 9.3, 9.6
   */
  getCategoryStatus(
    exchangeId: ExchangeId,
    tenantId: string,
    category: RateLimitCategory
  ): RateLimitState {
    const state = getOrCreateState(exchangeId, tenantId, category);
    checkAndResetWindow(state);
    return { ...state };
  },

  /**
   * Handle rate limit response from exchange (retry-after)
   *
   * @param exchangeId - The exchange identifier
   * @param retryAfterMs - The delay in milliseconds before retrying
   *
   * Requirements: 9.4
   */
  handleRateLimitResponse(exchangeId: ExchangeId, retryAfterMs: number): void {
    const delayUntil = new Date(Date.now() + retryAfterMs).toISOString();
    retryAfterDelays.set(exchangeId, { delayUntil, delayMs: retryAfterMs });
  },

  /**
   * Handle rate limit response from exchange using retry-after header value
   *
   * @param exchangeId - The exchange identifier
   * @param retryAfterHeader - The retry-after header value (seconds or HTTP date)
   *
   * Requirements: 9.4
   */
  handleRetryAfterHeader(exchangeId: ExchangeId, retryAfterHeader: string): void {
    const retryAfterMs = parseRetryAfterHeader(retryAfterHeader);
    this.handleRateLimitResponse(exchangeId, retryAfterMs);
  },

  /**
   * Get the current retry-after delay for an exchange
   *
   * @param exchangeId - The exchange identifier
   * @returns The remaining delay in milliseconds, or 0 if no delay
   *
   * Requirements: 9.4
   */
  getRetryAfterDelay(exchangeId: ExchangeId): number {
    const retryAfter = retryAfterDelays.get(exchangeId);
    if (!retryAfter) {
      return 0;
    }

    const delayUntil = new Date(retryAfter.delayUntil);
    const now = new Date();
    const remainingMs = delayUntil.getTime() - now.getTime();

    if (remainingMs <= 0) {
      retryAfterDelays.delete(exchangeId);
      return 0;
    }

    return remainingMs;
  },

  /**
   * Queue a request for later execution when rate limited
   *
   * @param exchangeId - The exchange identifier
   * @param request - The queued request
   * @returns The request ID
   *
   * Requirements: 9.2
   */
  queueRequest(exchangeId: ExchangeId, request: Omit<QueuedRequest, 'requestId'>): string {
    const requestId = generateUUID();
    const queuedRequest: QueuedRequest = {
      ...request,
      requestId,
    };

    let queue = requestQueues.get(exchangeId);
    if (!queue) {
      queue = [];
      requestQueues.set(exchangeId, queue);
    }

    // Insert based on priority (CRITICAL first, then HIGH, NORMAL, LOW)
    const priorityOrder: Record<RequestPriority, number> = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
    };

    const insertIndex = queue.findIndex(
      (r) => priorityOrder[r.priority] > priorityOrder[queuedRequest.priority]
    );

    if (insertIndex === -1) {
      queue.push(queuedRequest);
    } else {
      queue.splice(insertIndex, 0, queuedRequest);
    }

    return requestId;
  },

  /**
   * Get the next request from the queue
   *
   * @param exchangeId - The exchange identifier
   * @returns The next queued request or undefined
   *
   * Requirements: 9.2
   */
  dequeueRequest(exchangeId: ExchangeId): QueuedRequest | undefined {
    const queue = requestQueues.get(exchangeId);
    if (!queue || queue.length === 0) {
      return undefined;
    }
    return queue.shift();
  },

  /**
   * Get the status of the request queue for an exchange
   *
   * @param exchangeId - The exchange identifier
   * @returns The queue status
   *
   * Requirements: 9.2
   */
  getQueueStatus(exchangeId: ExchangeId): QueueStatus {
    const queue = requestQueues.get(exchangeId) ?? [];
    const criticalRequests = queue.filter((r) => r.priority === 'CRITICAL').length;

    let oldestRequestAge = 0;
    if (queue.length > 0) {
      const oldestRequest = queue[queue.length - 1]; // Last in queue is oldest (FIFO within priority)
      const queuedAt = new Date(oldestRequest.queuedAt);
      oldestRequestAge = Date.now() - queuedAt.getTime();
    }

    // Estimate clear time based on rate limits
    const config = configStore.get(exchangeId);
    const ordersPerSecond = config?.limits.find((l) => l.category === 'ORDERS')?.requestsPerSecond ?? 10;
    const estimatedClearTimeMs = Math.ceil((queue.length / ordersPerSecond) * 1000);

    return {
      exchangeId,
      queuedRequests: queue.length,
      criticalRequests,
      estimatedClearTimeMs,
      oldestRequestAge,
    };
  },

  /**
   * Reserve capacity for critical operations
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @param category - The rate limit category
   * @param amount - The amount to reserve
   * @returns True if reservation was successful
   *
   * Requirements: 9.5
   */
  reserveCapacity(
    exchangeId: ExchangeId,
    tenantId: string,
    category: RateLimitCategory,
    amount: number
  ): boolean {
    const state = getOrCreateState(exchangeId, tenantId, category);
    checkAndResetWindow(state);

    // Check if we have enough capacity to reserve
    const maxReservable = Math.floor(state.limit * 0.5); // Max 50% can be reserved
    const newReserved = state.reservedForCritical + amount;

    if (newReserved > maxReservable) {
      return false;
    }

    state.reservedForCritical = newReserved;
    const key = getStoreKey(exchangeId, category);
    rateLimitStore.set(key, state);

    return true;
  },

  /**
   * Check if approaching rate limits (warning threshold)
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @param category - The rate limit category
   * @returns True if usage is above warning threshold
   *
   * Requirements: 9.2
   */
  isApproachingLimit(
    exchangeId: ExchangeId,
    tenantId: string,
    category: RateLimitCategory
  ): boolean {
    const state = getOrCreateState(exchangeId, tenantId, category);
    checkAndResetWindow(state);

    const config = configStore.get(exchangeId);
    const warningThreshold = config?.warningThresholdPercent ?? DEFAULT_CONFIG.warningThresholdPercent;
    const usagePercent = (state.used / state.limit) * 100;

    return usagePercent >= warningThreshold;
  },

  /**
   * Reset rate limit state for an exchange (for testing)
   *
   * @param exchangeId - The exchange identifier
   */
  reset(exchangeId: ExchangeId): void {
    const categories: RateLimitCategory[] = ['ORDERS', 'QUERIES', 'WEBSOCKET', 'WEIGHT'];
    for (const category of categories) {
      const key = getStoreKey(exchangeId, category);
      rateLimitStore.delete(key);
    }
    requestQueues.delete(exchangeId);
    retryAfterDelays.delete(exchangeId);
  },

  /**
   * Reset all rate limit state (for testing)
   */
  resetAll(): void {
    rateLimitStore.clear();
    configStore.clear();
    requestQueues.clear();
    retryAfterDelays.clear();
  },

  /**
   * Process queued requests when capacity is available
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @param maxToProcess - Maximum number of requests to process
   * @returns Array of results from processed requests
   *
   * Requirements: 9.2
   */
  async processQueue(
    exchangeId: ExchangeId,
    tenantId: string,
    maxToProcess: number = 10
  ): Promise<{ requestId: string; result?: unknown; error?: Error }[]> {
    const results: { requestId: string; result?: unknown; error?: Error }[] = [];
    let processed = 0;

    while (processed < maxToProcess) {
      const queue = requestQueues.get(exchangeId);
      if (!queue || queue.length === 0) {
        break;
      }

      // Peek at the next request to check its category
      const nextRequest = queue[0];
      const checkResult = this.checkLimit(
        exchangeId,
        tenantId,
        nextRequest.category,
        nextRequest.priority
      );

      if (!checkResult.allowed) {
        // Can't process more requests, stop
        break;
      }

      // Dequeue and execute
      const request = this.dequeueRequest(exchangeId);
      if (!request) {
        break;
      }

      try {
        // Consume the rate limit
        this.consumeLimit(exchangeId, tenantId, request.category);

        // Execute the request
        const result = await request.request();
        results.push({ requestId: request.requestId, result });
      } catch (error) {
        results.push({
          requestId: request.requestId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }

      processed++;
    }

    return results;
  },

  /**
   * Execute a request with rate limiting, queuing if necessary
   *
   * @param exchangeId - The exchange identifier
   * @param tenantId - The tenant identifier
   * @param category - The rate limit category
   * @param priority - The request priority
   * @param request - The request function to execute
   * @returns The result of the request or a queued request ID
   *
   * Requirements: 2.5, 9.2, 9.5
   */
  async executeWithRateLimit<T>(
    exchangeId: ExchangeId,
    tenantId: string,
    category: RateLimitCategory,
    priority: RequestPriority,
    request: () => Promise<T>
  ): Promise<{ executed: true; result: T } | { executed: false; requestId: string; waitMs: number }> {
    const checkResult = this.checkLimit(exchangeId, tenantId, category, priority);

    if (checkResult.allowed) {
      // Execute immediately
      this.consumeLimit(exchangeId, tenantId, category);
      const result = await request();
      return { executed: true, result };
    }

    // Queue the request
    const requestId = this.queueRequest(exchangeId, {
      category,
      priority,
      request,
      queuedAt: new Date().toISOString(),
    });

    return {
      executed: false,
      requestId,
      waitMs: checkResult.waitMs ?? 0,
    };
  },

  /**
   * Check if there are queued critical requests
   *
   * @param exchangeId - The exchange identifier
   * @returns True if there are critical requests in the queue
   *
   * Requirements: 9.5
   */
  hasCriticalRequestsQueued(exchangeId: ExchangeId): boolean {
    const queue = requestQueues.get(exchangeId);
    if (!queue) {
      return false;
    }
    return queue.some((r) => r.priority === 'CRITICAL');
  },

  /**
   * Get the number of requests in the queue by priority
   *
   * @param exchangeId - The exchange identifier
   * @returns Object with counts by priority
   *
   * Requirements: 9.2
   */
  getQueuedRequestsByPriority(exchangeId: ExchangeId): Record<RequestPriority, number> {
    const queue = requestQueues.get(exchangeId) ?? [];
    return {
      CRITICAL: queue.filter((r) => r.priority === 'CRITICAL').length,
      HIGH: queue.filter((r) => r.priority === 'HIGH').length,
      NORMAL: queue.filter((r) => r.priority === 'NORMAL').length,
      LOW: queue.filter((r) => r.priority === 'LOW').length,
    };
  },
};
