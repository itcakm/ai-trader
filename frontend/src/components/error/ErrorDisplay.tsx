'use client';

import React, { useState } from 'react';
import type { AppError } from '@/types/error';
import { Button } from '@/components/ui/Button';

export type ErrorDisplayVariant = 'toast' | 'modal' | 'inline' | 'page';

interface ErrorDisplayProps {
  error: AppError;
  variant?: ErrorDisplayVariant;
  onRetry?: () => void;
  onDismiss?: () => void;
  onReportIssue?: (error: AppError) => void;
  showTrackingId?: boolean;
  showSuggestedActions?: boolean;
}

/**
 * ErrorDisplay component for showing errors to users
 * Validates: Requirements 12.1, 12.2, 12.6
 */
export function ErrorDisplay({
  error,
  variant = 'inline',
  onRetry,
  onDismiss,
  onReportIssue,
  showTrackingId = true,
  showSuggestedActions = true,
}: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  const categoryStyles = {
    user: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: 'text-yellow-600 dark:text-yellow-400',
      title: 'text-yellow-800 dark:text-yellow-200',
    },
    system: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      icon: 'text-red-600 dark:text-red-400',
      title: 'text-red-800 dark:text-red-200',
    },
    transient: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      icon: 'text-blue-600 dark:text-blue-400',
      title: 'text-blue-800 dark:text-blue-200',
    },
  };

  const styles = categoryStyles[error.category];

  const variantClasses = {
    toast: 'fixed bottom-4 right-4 max-w-md shadow-lg rounded-lg z-50',
    modal: 'fixed inset-0 flex items-center justify-center z-50',
    inline: 'w-full rounded-lg',
    page: 'min-h-[400px] flex items-center justify-center',
  };

  const renderIcon = () => {
    switch (error.category) {
      case 'user':
        return (
          <svg className={`w-6 h-6 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'system':
        return (
          <svg className={`w-6 h-6 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'transient':
        return (
          <svg className={`w-6 h-6 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
    }
  };

  const content = (
    <div className={`${styles.bg} ${styles.border} border p-4 ${variant === 'page' ? 'max-w-lg w-full' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">{renderIcon()}</div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium ${styles.title}`}>
            {error.category === 'user' && 'Action Required'}
            {error.category === 'system' && 'System Error'}
            {error.category === 'transient' && 'Temporary Issue'}
          </h3>
          <p className="mt-1 text-sm text-foreground/80">{error.message}</p>
          
          {showTrackingId && (
            <p className="mt-2 text-xs text-muted-foreground font-mono">
              Tracking ID: {error.requestTrackingId}
            </p>
          )}

          {showSuggestedActions && error.suggestedActions.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showDetails ? 'Hide suggestions' : 'Show suggestions'}
              </button>
              {showDetails && (
                <ul className="mt-2 text-sm text-foreground/70 list-disc list-inside space-y-1">
                  {error.suggestedActions.map((action, index) => (
                    <li key={index}>{action}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {error.retryable && onRetry && (
              <Button variant="primary" size="sm" onClick={onRetry}>
                Try Again
              </Button>
            )}
            {onReportIssue && (
              <Button variant="outline" size="sm" onClick={() => onReportIssue(error)}>
                Report Issue
              </Button>
            )}
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </div>
        </div>
        
        {onDismiss && variant === 'toast' && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  if (variant === 'modal') {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onDismiss} />
        <div className={variantClasses[variant]}>
          <div className="bg-background rounded-lg shadow-xl max-w-md w-full mx-4">
            {content}
          </div>
        </div>
      </>
    );
  }

  return <div className={variantClasses[variant]}>{content}</div>;
}

export default ErrorDisplay;
