'use client';

import React from 'react';
import type { UseRetryState } from '@/hooks/useRetry';

interface RetryIndicatorProps {
  state: Pick<UseRetryState, 'isRetrying' | 'attempt' | 'maxAttempts' | 'nextRetryIn'>;
  className?: string;
}

/**
 * RetryIndicator component for showing retry progress
 * Validates: Requirements 12.4
 */
export function RetryIndicator({ state, className = '' }: RetryIndicatorProps) {
  const { isRetrying, attempt, maxAttempts, nextRetryIn } = state;

  if (!isRetrying) return null;

  const formatTime = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div
      className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
    >
      <svg
        className="animate-spin h-4 w-4 text-primary-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span>
        Retrying ({attempt}/{maxAttempts - 1})
        {nextRetryIn !== null && ` in ${formatTime(nextRetryIn)}`}
      </span>
    </div>
  );
}

/**
 * Compact retry indicator for inline use
 */
export function RetryIndicatorCompact({
  state,
  className = '',
}: RetryIndicatorProps) {
  const { isRetrying, attempt, maxAttempts, nextRetryIn } = state;

  if (!isRetrying) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
    >
      <svg
        className="animate-spin h-3 w-3"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {attempt}/{maxAttempts - 1}
      {nextRetryIn !== null && (
        <span className="tabular-nums">
          ({Math.ceil(nextRetryIn / 1000)}s)
        </span>
      )}
    </span>
  );
}

export default RetryIndicator;
