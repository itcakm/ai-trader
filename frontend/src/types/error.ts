/**
 * Error types for the AI-Assisted Crypto Trading System
 * Supports error categorization, tracking, and structured error responses
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */

/**
 * Error categories as defined in the design document
 * - user: Invalid input, permission denied, validation failure (fixable by user)
 * - system: Server error, service unavailable (requires support)
 * - transient: Network timeout, rate limit, temporary unavailability (retry may help)
 */
export type ErrorCategory = 'user' | 'system' | 'transient';

/**
 * Structured application error with all required fields
 * for comprehensive error handling and support
 */
export interface AppError {
  /** Machine-readable error code */
  code: string;
  /** User-friendly error message */
  message: string;
  /** Unique identifier for support/debugging */
  requestTrackingId: string;
  /** Error category for determining handling strategy */
  category: ErrorCategory;
  /** Additional context for debugging */
  details?: Record<string, unknown>;
  /** Steps user can take to resolve the issue */
  suggestedActions: string[];
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Timestamp when the error occurred */
  timestamp: Date;
  /** Seconds until retry (for rate limits) */
  retryAfter?: number;
  /** Original error for debugging */
  originalError?: unknown;
}

/**
 * Error codes for common error scenarios
 */
export const ErrorCodes = {
  // User errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  
  // System errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  
  // Transient errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  CONNECTION_LOST: 'CONNECTION_LOST',
  
  // Unknown
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
