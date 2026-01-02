/**
 * Retry Service
 * 
 * Provides retry logic with exponential backoff for transient errors.
 * Validates: Requirements 12.4
 */

import type { AppError } from '@/types/error';
import { handleError, categorizeError } from './error-handler';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to add jitter to delays (default: true) */
  jitter?: boolean;
  /** Callback for retry attempts */
  onRetry?: (attempt: number, delay: number, error: AppError) => void;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

export interface RetryState {
  /** Current attempt number (1-based) */
  attempt: number;
  /** Total attempts allowed */
  maxAttempts: number;
  /** Whether currently retrying */
  isRetrying: boolean;
  /** Last error encountered */
  lastError: AppError | null;
  /** Time until next retry in milliseconds */
  nextRetryIn: number | null;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay for a given attempt with exponential backoff
 */
export function calculateDelay(
  attempt: number,
  options: Pick<RetryOptions, 'initialDelay' | 'maxDelay' | 'backoffMultiplier' | 'jitter'>
): number {
  const {
    initialDelay = DEFAULT_OPTIONS.initialDelay,
    maxDelay = DEFAULT_OPTIONS.maxDelay,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    jitter = DEFAULT_OPTIONS.jitter,
  } = options;

  // Calculate base delay with exponential backoff
  const baseDelay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
  
  // Cap at maxDelay
  const cappedDelay = Math.min(baseDelay, maxDelay);
  
  // Add jitter (±25% randomization) to prevent thundering herd
  if (jitter) {
    const jitterRange = cappedDelay * 0.25;
    const jitterValue = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, Math.round(cappedDelay + jitterValue));
  }
  
  return Math.round(cappedDelay);
}

/**
 * Default function to determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const category = categorizeError(error);
  return category === 'transient';
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 * 
 * @param operation - The async operation to retry
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws AppError if all retries are exhausted
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    initialDelay = DEFAULT_OPTIONS.initialDelay,
    maxDelay = DEFAULT_OPTIONS.maxDelay,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    jitter = DEFAULT_OPTIONS.jitter,
    onRetry,
    isRetryable = isRetryableError,
  } = options;

  let lastError: AppError | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const appError = handleError(error);
      lastError = appError;

      // Check if we should retry
      const shouldRetry = attempt <= maxRetries && isRetryable(error);

      if (!shouldRetry) {
        throw appError;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, {
        initialDelay,
        maxDelay,
        backoffMultiplier,
        jitter,
      });

      // Notify about retry
      if (onRetry) {
        onRetry(attempt, delay, appError);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? handleError(new Error('Retry failed'));
}
