'use client';

import React, { useEffect, useState } from 'react';
import type { AppError } from '@/types/error';

interface ErrorToastProps {
  error: AppError;
  duration?: number;
  onDismiss: () => void;
  onRetry?: () => void;
}

/**
 * ErrorToast component for showing transient error notifications
 * Auto-dismisses after duration (default 5 seconds)
 */
export function ErrorToast({
  error,
  duration = 5000,
  onDismiss,
  onRetry,
}: ErrorToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 300);
  };

  if (!isVisible) return null;

  const categoryColors = {
    user: 'bg-yellow-600',
    system: 'bg-red-600',
    transient: 'bg-blue-600',
  };

  return (
    <div
      className={`
        fixed bottom-4 right-4 max-w-sm w-full bg-background border border-border
        rounded-lg shadow-lg overflow-hidden z-50
        transform transition-all duration-300
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
      role="alert"
      aria-live="assertive"
    >
      <div className={`h-1 ${categoryColors[error.category]}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{error.message}</p>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              ID: {error.requestTrackingId}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {error.retryable && onRetry && (
          <button
            onClick={() => {
              handleDismiss();
              onRetry();
            }}
            className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorToast;
