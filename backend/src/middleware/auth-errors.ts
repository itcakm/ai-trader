/**
 * Auth Error Response utilities for JWT validation middleware.
 * Provides standardized error responses with proper HTTP status codes and headers.
 * 
 * Requirements: 4.8, 4.9
 * - Return 401 for invalid/expired tokens
 * - Return 401 with WWW-Authenticate header for missing tokens
 * - Sanitize error messages to prevent information leakage
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { AuthErrorCode, AUTH_ERROR_CODES } from '../types/auth';

/**
 * Standard CORS headers for auth responses.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Creates a standardized error response body.
 * Messages are sanitized to prevent information leakage.
 */
interface ErrorResponseBody {
  error: string;
  code: AuthErrorCode;
  message: string;
}

/**
 * Maps internal error codes to user-safe messages.
 * This prevents leaking sensitive information about the system.
 */
const SANITIZED_MESSAGES: Record<AuthErrorCode, string> = {
  [AUTH_ERROR_CODES.INVALID_REQUEST]: 'Invalid request',
  [AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Missing required field',
  [AUTH_ERROR_CODES.INVALID_EMAIL_FORMAT]: 'Invalid email format',
  [AUTH_ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid credentials',
  [AUTH_ERROR_CODES.INVALID_TOKEN]: 'Invalid or malformed token',
  [AUTH_ERROR_CODES.TOKEN_EXPIRED]: 'Token has expired',
  [AUTH_ERROR_CODES.TOKEN_REFRESH_FAILED]: 'Unable to refresh token',
  [AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED]: 'Email verification required',
  [AUTH_ERROR_CODES.ACCOUNT_LOCKED]: 'Account is locked',
  [AUTH_ERROR_CODES.ACCOUNT_DISABLED]: 'Account is disabled',
  [AUTH_ERROR_CODES.USER_NOT_FOUND]: 'Invalid credentials', // Don't reveal user existence
  [AUTH_ERROR_CODES.USER_EXISTS]: 'Unable to create account',
  [AUTH_ERROR_CODES.MFA_REQUIRED]: 'Multi-factor authentication required',
  [AUTH_ERROR_CODES.INVALID_MFA_CODE]: 'Invalid verification code',
  [AUTH_ERROR_CODES.MFA_NOT_CONFIGURED]: 'MFA not configured',
  [AUTH_ERROR_CODES.WEAK_PASSWORD]: 'Password does not meet requirements',
  [AUTH_ERROR_CODES.PASSWORD_RESET_REQUIRED]: 'Password reset required',
  [AUTH_ERROR_CODES.INVALID_PASSWORD_RESET_CODE]: 'Invalid or expired reset code',
  [AUTH_ERROR_CODES.CODE_EXPIRED]: 'Verification code has expired',
  [AUTH_ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions',
  [AUTH_ERROR_CODES.TENANT_MISMATCH]: 'Access denied',
  [AUTH_ERROR_CODES.TOO_MANY_REQUESTS]: 'Too many requests, please try again later',
  [AUTH_ERROR_CODES.AUTH_ERROR]: 'Authentication error',
  [AUTH_ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
};

/**
 * Gets a sanitized error message for the given error code.
 * Falls back to a generic message if the code is unknown.
 */
export function getSanitizedMessage(code: AuthErrorCode): string {
  return SANITIZED_MESSAGES[code] || 'An error occurred';
}

/**
 * Creates a 401 Unauthorized response for missing tokens.
 * Includes WWW-Authenticate header as per RFC 7235.
 */
export function createMissingTokenResponse(): APIGatewayProxyResult {
  const body: ErrorResponseBody = {
    error: 'Unauthorized',
    code: AUTH_ERROR_CODES.INVALID_TOKEN,
    message: 'Authorization header is required',
  };

  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="api", error="missing_token", error_description="No authorization token provided"',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Creates a 401 Unauthorized response for invalid tokens.
 * Includes WWW-Authenticate header with error details.
 */
export function createInvalidTokenResponse(
  code: AuthErrorCode = AUTH_ERROR_CODES.INVALID_TOKEN,
  internalMessage?: string
): APIGatewayProxyResult {
  // Log internal message for debugging but don't expose to client
  if (internalMessage) {
    console.error(`Token validation failed: ${internalMessage}`);
  }

  const sanitizedMessage = getSanitizedMessage(code);
  const body: ErrorResponseBody = {
    error: 'Unauthorized',
    code,
    message: sanitizedMessage,
  };

  // Determine WWW-Authenticate error type
  let wwwAuthError = 'invalid_token';
  if (code === AUTH_ERROR_CODES.TOKEN_EXPIRED) {
    wwwAuthError = 'invalid_token';
  }

  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer realm="api", error="${wwwAuthError}", error_description="${sanitizedMessage}"`,
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Creates a 403 Forbidden response for insufficient permissions.
 */
export function createForbiddenResponse(
  code: AuthErrorCode = AUTH_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
  requiredRoles?: string[]
): APIGatewayProxyResult {
  const sanitizedMessage = getSanitizedMessage(code);
  const body: ErrorResponseBody & { requiredRoles?: string[] } = {
    error: 'Forbidden',
    code,
    message: sanitizedMessage,
  };

  // Only include required roles in non-production for debugging
  if (requiredRoles && process.env.NODE_ENV !== 'production') {
    body.requiredRoles = requiredRoles;
  }

  return {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Creates a 429 Too Many Requests response for rate limiting.
 */
export function createRateLimitResponse(retryAfterSeconds: number = 60): APIGatewayProxyResult {
  const body: ErrorResponseBody = {
    error: 'Too Many Requests',
    code: AUTH_ERROR_CODES.TOO_MANY_REQUESTS,
    message: getSanitizedMessage(AUTH_ERROR_CODES.TOO_MANY_REQUESTS),
  };

  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': retryAfterSeconds.toString(),
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Creates a success response with JSON body.
 */
export function createSuccessResponse<T>(data: T, statusCode: number = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Creates an error response with the appropriate status code.
 * Automatically sanitizes error messages.
 */
export function createErrorResponse(
  statusCode: number,
  code: AuthErrorCode,
  internalMessage?: string
): APIGatewayProxyResult {
  // Log internal message for debugging
  if (internalMessage) {
    console.error(`Auth error [${code}]: ${internalMessage}`);
  }

  const sanitizedMessage = getSanitizedMessage(code);
  const body: ErrorResponseBody = {
    error: statusCode === 401 ? 'Unauthorized' : statusCode === 403 ? 'Forbidden' : 'Error',
    code,
    message: sanitizedMessage,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
  };

  // Add WWW-Authenticate header for 401 responses
  if (statusCode === 401) {
    headers['WWW-Authenticate'] = `Bearer realm="api", error="invalid_token", error_description="${sanitizedMessage}"`;
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}
