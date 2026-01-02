/**
 * Error Handler Service
 * 
 * Provides error categorization, tracking ID generation, and error logging.
 * Validates: Requirements 12.3, 12.5
 */

import type { AppError, ErrorCategory, ErrorCode } from '@/types/error';
import { ErrorCodes } from '@/types/error';

/**
 * Generate a unique request tracking ID
 * Format: req-{timestamp}-{random}
 */
export function generateRequestTrackingId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `req-${timestamp}-${random}`;
}

/**
 * Categorize an error based on its characteristics
 */
export function categorizeError(error: unknown): ErrorCategory {
  // Check for network/fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'transient';
  }

  // Check for AbortError (timeout)
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'transient';
  }

  // Check for HTTP status codes if available
  if (isHttpError(error)) {
    const status = getHttpStatus(error);
    
    // 4xx errors are user errors
    if (status >= 400 && status < 500) {
      // Except 408 (timeout) and 429 (rate limit) which are transient
      if (status === 408 || status === 429) {
        return 'transient';
      }
      return 'user';
    }
    
    // 5xx errors are system errors
    if (status >= 500) {
      // 502, 503, 504 are often transient
      if (status === 502 || status === 503 || status === 504) {
        return 'transient';
      }
      return 'system';
    }
  }

  // Check for specific error types
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network-related errors are transient
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return 'transient';
    }
    
    // Permission/auth errors are user errors
    if (
      message.includes('permission') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('authentication')
    ) {
      return 'user';
    }
    
    // Validation errors are user errors
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return 'user';
    }
  }

  // Default to system error for unknown errors
  return 'system';
}

/**
 * Determine the error code based on the error
 */
export function determineErrorCode(error: unknown): ErrorCode {
  if (isHttpError(error)) {
    const status = getHttpStatus(error);
    
    switch (status) {
      case 400: return ErrorCodes.VALIDATION_ERROR;
      case 401: return ErrorCodes.AUTHENTICATION_REQUIRED;
      case 403: return ErrorCodes.PERMISSION_DENIED;
      case 404: return ErrorCodes.RESOURCE_NOT_FOUND;
      case 408: return ErrorCodes.TIMEOUT;
      case 409: return ErrorCodes.CONFLICT;
      case 429: return ErrorCodes.RATE_LIMITED;
      case 500: return ErrorCodes.INTERNAL_ERROR;
      case 502:
      case 503:
      case 504: return ErrorCodes.SERVICE_UNAVAILABLE;
      default:
        if (status >= 400 && status < 500) return ErrorCodes.INVALID_INPUT;
        if (status >= 500) return ErrorCodes.INTERNAL_ERROR;
    }
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return ErrorCodes.NETWORK_ERROR;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return ErrorCodes.TIMEOUT;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('network')) return ErrorCodes.NETWORK_ERROR;
    if (message.includes('timeout')) return ErrorCodes.TIMEOUT;
    if (message.includes('permission') || message.includes('forbidden')) {
      return ErrorCodes.PERMISSION_DENIED;
    }
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return ErrorCodes.AUTHENTICATION_REQUIRED;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCodes.VALIDATION_ERROR;
    }
    if (message.includes('not found')) return ErrorCodes.RESOURCE_NOT_FOUND;
  }

  return ErrorCodes.UNKNOWN_ERROR;
}


/**
 * Get suggested actions based on error category and code
 */
export function getSuggestedActions(
  category: ErrorCategory,
  code: ErrorCode
): string[] {
  const actions: string[] = [];

  switch (category) {
    case 'user':
      switch (code) {
        case ErrorCodes.VALIDATION_ERROR:
        case ErrorCodes.INVALID_INPUT:
          actions.push('Check your input and try again');
          actions.push('Ensure all required fields are filled correctly');
          break;
        case ErrorCodes.PERMISSION_DENIED:
          actions.push('Contact your administrator to request access');
          actions.push('Verify you are logged in with the correct account');
          break;
        case ErrorCodes.AUTHENTICATION_REQUIRED:
          actions.push('Please log in to continue');
          actions.push('Your session may have expired');
          break;
        case ErrorCodes.RESOURCE_NOT_FOUND:
          actions.push('The requested item may have been deleted or moved');
          actions.push('Check the URL and try again');
          break;
        case ErrorCodes.CONFLICT:
          actions.push('The resource was modified by another user');
          actions.push('Refresh the page and try again');
          break;
        default:
          actions.push('Please check your input and try again');
      }
      break;

    case 'transient':
      actions.push('Please wait a moment and try again');
      if (code === ErrorCodes.RATE_LIMITED) {
        actions.push('You have made too many requests. Please wait before trying again');
      }
      if (code === ErrorCodes.NETWORK_ERROR || code === ErrorCodes.CONNECTION_LOST) {
        actions.push('Check your internet connection');
      }
      break;

    case 'system':
      actions.push('Our team has been notified of this issue');
      actions.push('Please try again later');
      actions.push('If the problem persists, contact support with the tracking ID');
      break;
  }

  return actions;
}

/**
 * Get a user-friendly message for an error
 */
export function getUserFriendlyMessage(
  error: unknown,
  code: ErrorCode,
  category: ErrorCategory
): string {
  // If the error has a message property, use it if it's user-friendly
  if (error instanceof Error && error.message && !isInternalMessage(error.message)) {
    return error.message;
  }

  // Generate a user-friendly message based on code and category
  switch (code) {
    case ErrorCodes.VALIDATION_ERROR:
      return 'The provided data is invalid. Please check your input.';
    case ErrorCodes.INVALID_INPUT:
      return 'Invalid input provided. Please verify your data.';
    case ErrorCodes.PERMISSION_DENIED:
      return 'You do not have permission to perform this action.';
    case ErrorCodes.AUTHENTICATION_REQUIRED:
      return 'Please log in to continue.';
    case ErrorCodes.RESOURCE_NOT_FOUND:
      return 'The requested resource was not found.';
    case ErrorCodes.CONFLICT:
      return 'A conflict occurred. The resource may have been modified.';
    case ErrorCodes.NETWORK_ERROR:
      return 'Unable to connect to the server. Please check your connection.';
    case ErrorCodes.TIMEOUT:
      return 'The request timed out. Please try again.';
    case ErrorCodes.RATE_LIMITED:
      return 'Too many requests. Please wait before trying again.';
    case ErrorCodes.CONNECTION_LOST:
      return 'Connection lost. Please check your internet connection.';
    case ErrorCodes.SERVICE_UNAVAILABLE:
      return 'The service is temporarily unavailable. Please try again later.';
    case ErrorCodes.INTERNAL_ERROR:
    case ErrorCodes.DATABASE_ERROR:
    case ErrorCodes.EXTERNAL_SERVICE_ERROR:
      return 'An unexpected error occurred. Our team has been notified.';
    default:
      return category === 'user'
        ? 'An error occurred. Please check your input and try again.'
        : 'An unexpected error occurred. Please try again later.';
  }
}

/**
 * Check if a message appears to be an internal/technical message
 */
function isInternalMessage(message: string): boolean {
  const internalPatterns = [
    /^[A-Z_]+$/,  // All caps with underscores (error codes)
    /stack trace/i,
    /at \w+\.\w+/,  // Stack trace patterns
    /undefined is not/i,
    /cannot read property/i,
    /null reference/i,
  ];

  return internalPatterns.some(pattern => pattern.test(message));
}

/**
 * Check if an error is an HTTP error with a status code
 */
function isHttpError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  
  // Check for Response object
  if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
    return true;
  }
  
  // Check for error with status property
  if ('response' in error) {
    const response = (error as { response: unknown }).response;
    if (response && typeof response === 'object' && 'status' in response) {
      return true;
    }
  }

  return false;
}

/**
 * Extract HTTP status from an error
 */
function getHttpStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  
  if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
    return (error as { status: number }).status;
  }
  
  if ('response' in error) {
    const response = (error as { response: unknown }).response;
    if (response && typeof response === 'object' && 'status' in response) {
      return (response as { status: number }).status;
    }
  }

  return 0;
}

/**
 * Extract retry-after value from an error (for rate limiting)
 */
function getRetryAfter(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  
  // Check for retryAfter property
  if ('retryAfter' in error && typeof (error as { retryAfter: unknown }).retryAfter === 'number') {
    return (error as { retryAfter: number }).retryAfter;
  }
  
  // Check response headers
  if ('headers' in error) {
    const headers = (error as { headers: unknown }).headers;
    if (headers && typeof headers === 'object') {
      const retryAfter = (headers as Record<string, unknown>)['retry-after'];
      if (typeof retryAfter === 'string') {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed)) return parsed;
      }
      if (typeof retryAfter === 'number') return retryAfter;
    }
  }

  return undefined;
}

/**
 * Extract additional details from an error
 */
function extractErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object') return undefined;
  
  const details: Record<string, unknown> = {};
  
  // Extract common properties
  if ('code' in error) details.originalCode = (error as { code: unknown }).code;
  if ('name' in error) details.errorName = (error as { name: unknown }).name;
  
  // Extract HTTP-specific details
  if (isHttpError(error)) {
    details.httpStatus = getHttpStatus(error);
  }
  
  // Extract validation errors if present
  if ('errors' in error && Array.isArray((error as { errors: unknown }).errors)) {
    details.validationErrors = (error as { errors: unknown[] }).errors;
  }
  
  return Object.keys(details).length > 0 ? details : undefined;
}


/**
 * Main error handler function - converts any error into a structured AppError
 */
export function handleError(
  error: unknown,
  requestTrackingId?: string
): AppError {
  const trackingId = requestTrackingId ?? generateRequestTrackingId();
  const category = categorizeError(error);
  const code = determineErrorCode(error);
  const message = getUserFriendlyMessage(error, code, category);
  const suggestedActions = getSuggestedActions(category, code);
  const retryAfter = getRetryAfter(error);
  const details = extractErrorDetails(error);

  const appError: AppError = {
    code,
    message,
    requestTrackingId: trackingId,
    category,
    suggestedActions,
    retryable: category === 'transient',
    timestamp: new Date(),
    originalError: error,
  };

  if (details) {
    appError.details = details;
  }

  if (retryAfter !== undefined) {
    appError.retryAfter = retryAfter;
  }

  return appError;
}

/**
 * Log error to backend for analysis
 * Validates: Requirements 12.5
 */
export async function logErrorToBackend(appError: AppError): Promise<void> {
  try {
    // Prepare error payload (exclude originalError as it may not be serializable)
    const payload = {
      code: appError.code,
      message: appError.message,
      requestTrackingId: appError.requestTrackingId,
      category: appError.category,
      details: appError.details,
      timestamp: appError.timestamp.toISOString(),
      retryAfter: appError.retryAfter,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };

    // In production, this would send to the backend
    // For now, we log to console and could integrate with a logging service
    if (process.env.NODE_ENV === 'development') {
      console.error('[Error Logged]', payload);
    }

    // TODO: Replace with actual API call
    // await fetch('/api/errors', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    // });
  } catch (loggingError) {
    // Silently fail logging - don't throw errors from error handling
    console.error('[Error Logging Failed]', loggingError);
  }
}

/**
 * Report an issue with pre-populated context
 * Validates: Requirements 12.6
 */
export interface IssueReport {
  requestTrackingId: string;
  errorCode: string;
  errorMessage: string;
  userComment?: string;
  timestamp: Date;
  url?: string;
  userAgent?: string;
}

export function createIssueReport(
  appError: AppError,
  userComment?: string
): IssueReport {
  return {
    requestTrackingId: appError.requestTrackingId,
    errorCode: appError.code,
    errorMessage: appError.message,
    userComment,
    timestamp: appError.timestamp,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
}

export async function submitIssueReport(report: IssueReport): Promise<void> {
  // In production, this would send to the backend
  if (process.env.NODE_ENV === 'development') {
    console.log('[Issue Report Submitted]', report);
  }

  // TODO: Replace with actual API call
  // await fetch('/api/issues', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(report),
  // });
}

/**
 * Validate that an AppError has all required fields
 * Used for property-based testing
 */
export function validateAppError(error: AppError): {
  valid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  if (!error.code) missingFields.push('code');
  if (!error.message) missingFields.push('message');
  if (!error.requestTrackingId) missingFields.push('requestTrackingId');
  if (!error.category) missingFields.push('category');
  if (!error.suggestedActions || error.suggestedActions.length === 0) {
    missingFields.push('suggestedActions');
  }
  if (typeof error.retryable !== 'boolean') missingFields.push('retryable');
  if (!error.timestamp) missingFields.push('timestamp');

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}
