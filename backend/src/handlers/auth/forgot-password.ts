/**
 * Forgot Password Handler
 * 
 * Handles password reset initiation by proxying to Cognito ForgotPassword API.
 * Validates request body, initiates password reset, logs event.
 * 
 * Requirements: 3.7, 11.4
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { ForgotPasswordRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

/**
 * Create a success response
 */
function successResponse<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  };
}

/**
 * Create an error response with sanitized message
 */
function errorResponse(
  statusCode: number,
  message: string,
  code: string,
  retryAfter?: number
): APIGatewayProxyResult {
  const body: Record<string, unknown> = {
    error: 'AuthError',
    code,
    message
  };
  
  if (retryAfter) {
    body.retryAfter = retryAfter;
  }

  const headers = { ...CORS_HEADERS };
  if (retryAfter) {
    (headers as Record<string, string>)['Retry-After'] = String(retryAfter);
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}

/**
 * Parse JSON body safely
 */
function parseBody<T>(event: APIGatewayProxyEvent): T | null {
  try {
    if (!event.body) return null;
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
}

/**
 * Extract client IP from request
 */
function getClientIp(event: APIGatewayProxyEvent): string {
  return event.requestContext?.identity?.sourceIp || 
         event.headers['X-Forwarded-For']?.split(',')[0]?.trim() || 
         'unknown';
}

/**
 * Extract user agent from request
 */
function getUserAgent(event: APIGatewayProxyEvent): string {
  return event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown';
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate forgot password request body
 */
function validateForgotPasswordRequest(body: ForgotPasswordRequest | null): { valid: boolean; error?: string; code?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  if (!body.email) {
    return { valid: false, error: 'Email is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  if (!isValidEmail(body.email)) {
    return { valid: false, error: 'Invalid email format', code: AUTH_ERROR_CODES.INVALID_EMAIL_FORMAT };
  }

  return { valid: true };
}

/**
 * POST /auth/forgot-password
 * 
 * Initiate password reset flow.
 * 
 * Requirements: 3.7, 11.4
 */
export async function forgotPassword(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Parse and validate request body
    const body = parseBody<ForgotPasswordRequest>(event);
    const validation = validateForgotPasswordRequest(body);

    if (!validation.valid) {
      return errorResponse(400, validation.error!, validation.code!);
    }

    const request = body!;

    // Call Cognito ForgotPassword API
    // Note: CognitoClientService.forgotPassword silently succeeds for non-existent users
    await CognitoClientService.forgotPassword(request.email);

    // Log password reset request event
    // Requirements: 11.4
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      email: request.email,
      ip: clientIp,
      userAgent,
      success: true
    });

    // Always return success to prevent email enumeration
    return successResponse({
      message: 'If an account exists with this email, a password reset code has been sent.'
    });

  } catch (error) {
    // Log failed password reset request
    const body = parseBody<ForgotPasswordRequest>(event);
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      email: body?.email,
      ip: clientIp,
      userAgent,
      success: false,
      reason: error instanceof AuthError ? error.code : 'UNKNOWN_ERROR'
    });

    // Handle known auth errors - but don't reveal user existence
    if (error instanceof AuthError) {
      // For rate limiting, return the actual error
      if (error.code === AUTH_ERROR_CODES.TOO_MANY_REQUESTS) {
        return errorResponse(
          error.statusCode,
          error.message,
          error.code,
          error.retryAfter
        );
      }

      // For other errors, return generic success to prevent enumeration
      return successResponse({
        message: 'If an account exists with this email, a password reset code has been sent.'
      });
    }

    // Log unexpected errors
    console.error('Forgot password error:', error);
    return errorResponse(500, 'Failed to initiate password reset', AUTH_ERROR_CODES.AUTH_ERROR);
  }
}

/**
 * Handler for Lambda invocation
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  return forgotPassword(event);
}
