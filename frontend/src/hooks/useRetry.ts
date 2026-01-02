'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppError } from '@/types/error';
import { retry, calculateDelay, isRetryableError, type RetryOptions } from '@/services/retry';
import { handleError } from '@/services/error-handler';

export interface UseRetryState {
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Whether currently in a retry attempt */
  isRetrying: boolean;
  /** Current attempt number (0 if not started) */
  attempt: number;
  /** Maximum attempts allowed */
  maxAttempts: number;
  /** Last error encountered */
  error: AppError | null;
  /** Time until next retry in milliseconds */
  nextRetryIn: number | null;
  /** Whether the operation can be manually retried */
  canRetry: boolean;
}

export interface UseRetryActions<T> {
  /** Execute the operation with retry logic */
  execute: () => Promise<T | undefined>;
  /** Manually retry the operation */
  retry: () => Promise<T | undefined>;
  /** Reset the retry state */
  reset: () => void;
  /** Cancel any pending retry */
  cancel: () => void;
}

export type UseRetryResult<T> = UseRetryState & UseRetryActions<T>;

/**
 * React hook for executing operations with automatic retry and UI feedback
 * Validates: Requirements 12.4
 */
export function useRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): UseRetryResult<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    onRetry,
    isRetryable = isRetryableError,
  } = options;

  const [state, setState] = useState<UseRetryState>({
    isLoading: false,
    isRetrying: false,
    attempt: 0,
    maxAttempts: maxRetries + 1,
    error: null,
    nextRetryIn: null,
    canRetry: false,
  });

  const cancelRef = useRef(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback((delay: number) => {
    clearCountdown();
    let remaining = delay;
    
    setState(prev => ({ ...prev, nextRetryIn: remaining }));
    
    countdownRef.current = setInterval(() => {
      remaining -= 100;
      if (remaining <= 0) {
        clearCountdown();
        setState(prev => ({ ...prev, nextRetryIn: null }));
      } else {
        setState(prev => ({ ...prev, nextRetryIn: remaining }));
      }
    }, 100);
  }, [clearCountdown]);

  const execute = useCallback(async (): Promise<T | undefined> => {
    cancelRef.current = false;
    clearCountdown();

    setState(prev => ({
      ...prev,
      isLoading: true,
      isRetrying: false,
      attempt: 0,
      error: null,
      nextRetryIn: null,
      canRetry: false,
    }));

    try {
      const result = await retry(operation, {
        maxRetries,
        initialDelay,
        maxDelay,
        backoffMultiplier,
        jitter,
        isRetryable,
        onRetry: (attempt, delay, error) => {
          if (cancelRef.current) return;
          
          setState(prev => ({
            ...prev,
            isRetrying: true,
            attempt,
            error,
            canRetry: false,
          }));
          
          startCountdown(delay);
          onRetry?.(attempt, delay, error);
        },
      });

      if (!cancelRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isRetrying: false,
          error: null,
          nextRetryIn: null,
        }));
      }

      return result;
    } catch (error) {
      if (!cancelRef.current) {
        const appError = error as AppError;
        setState(prev => ({
          ...prev,
          isLoading: false,
          isRetrying: false,
          error: appError,
          nextRetryIn: null,
          canRetry: isRetryable(appError.originalError ?? appError),
        }));
      }
      return undefined;
    }
  }, [
    operation,
    maxRetries,
    initialDelay,
    maxDelay,
    backoffMultiplier,
    jitter,
    isRetryable,
    onRetry,
    clearCountdown,
    startCountdown,
  ]);

  const manualRetry = useCallback(async (): Promise<T | undefined> => {
    if (!state.canRetry) return undefined;
    return execute();
  }, [state.canRetry, execute]);

  const reset = useCallback(() => {
    cancelRef.current = true;
    clearCountdown();
    setState({
      isLoading: false,
      isRetrying: false,
      attempt: 0,
      maxAttempts: maxRetries + 1,
      error: null,
      nextRetryIn: null,
      canRetry: false,
    });
  }, [maxRetries, clearCountdown]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    clearCountdown();
    setState(prev => ({
      ...prev,
      isLoading: false,
      isRetrying: false,
      nextRetryIn: null,
    }));
  }, [clearCountdown]);

  return {
    ...state,
    execute,
    retry: manualRetry,
    reset,
    cancel,
  };
}

export default useRetry;
