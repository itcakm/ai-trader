/**
 * Verify Email Handler
 * 
 * Handles email verification by proxying to Cognito ConfirmSignUp API.
 * Validates request body, confirms user signup, logs verification event.
 * 
 * Requirements: 3.5
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { VerifyEmailRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

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
 * Validate verify email request body
 */
function validateVerifyEmailRequest(body: VerifyEmailRequest | null): { valid: boolean; error?: string; code?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  if (!body.email) {
    return { valid: false, error: 'Email is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  if (!isValidEmail(body.email)) {
    return { valid: false, error: 'Invalid email format', code: AUTH_ERROR_CODES.INVALID_EMAIL_FORMAT };
  }

  if (!body.code) {
    return { valid: false, error: 'Verification code is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  return { valid: true };
}

/**
 * POST /auth/verify-email
 * 
 * Verify user email with confirmation code.
 * 
 * Requirements: 3.5
 */
export async function verifyEmail(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Parse and validate request body
    const body = parseBody<VerifyEmailRequest>(event);
    const validation = validateVerifyEmailRequest(body);

    if (!validation.valid) {
      return errorResponse(400, validation.error!, validation.code!);
    }

    const request = body!;

    // Call Cognito ConfirmSignUp API
    await CognitoClientService.confirmSignUp(request.email, request.code);

    // Log email verification event
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.EMAIL_VERIFIED,
      email: request.email,
      ip: clientIp,
      userAgent,
      success: true
    });

    return successResponse({
      message: 'Email verified successfully. You can now log in.'
    });

  } catch (error) {
    // Log failed verification attempt
    const body = parseBody<VerifyEmailRequest>(event);
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.EMAIL_VERIFICATION_FAILED,
      email: body?.email,
      ip: clientIp,
      userAgent,
      success: false,
      reason: error instanceof AuthError ? error.code : 'UNKNOWN_ERROR'
    });

    // Handle known auth errors
    if (error instanceof AuthError) {
      return errorResponse(
        error.statusCode,
        error.message,
        error.code,
        error.retryAfter
      );
    }

    // Log unexpected errors
    console.error('Email verification error:', error);
    return errorResponse(500, 'Email verification failed', AUTH_ERROR_CODES.AUTH_ERROR);
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

  return verifyEmail(event);
}
