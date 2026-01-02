'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { AppError } from '@/types/error';
import { handleError, logErrorToBackend } from '@/services/error-handler';
import { ErrorDisplay } from './ErrorDisplay';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: AppError, reset: () => void) => ReactNode);
  onError?: (error: AppError) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  appError: AppError | null;
}

/**
 * ErrorBoundary component that catches JavaScript errors in child components
 * Validates: Requirements 12.1, 12.2
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, appError: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const appError = handleError(error);
    return { hasError: true, appError };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const appError = this.state.appError ?? handleError(error);
    
    // Add component stack to details
    if (appError.details) {
      appError.details.componentStack = errorInfo.componentStack;
    } else {
      appError.details = { componentStack: errorInfo.componentStack };
    }

    // Log error to backend
    logErrorToBackend(appError);

    // Call onError callback if provided
    if (this.props.onError) {
      this.props.onError(appError);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, appError: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.appError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.appError, this.handleReset);
        }
        return this.props.fallback;
      }

      // Default error display
      return (
        <ErrorDisplay
          error={this.state.appError}
          onRetry={this.handleReset}
          variant="page"
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
