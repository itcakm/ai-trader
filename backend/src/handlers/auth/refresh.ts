/**
 * Token Refresh Handler
 * 
 * Handles token refresh by proxying to Cognito InitiateAuth API with REFRESH_TOKEN flow.
 * Validates refresh token, returns new access token, logs refresh event.
 * 
 * Requirements: 3.4, 11.7
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { RefreshTokenRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

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
 * Validate refresh token request body
 */
function validateRefreshRequest(body: RefreshTokenRequest | null): { valid: boolean; error?: string; code?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  if (!body.refreshToken) {
    return { valid: false, error: 'Refresh token is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  return { valid: true };
}

/**
 * POST /auth/refresh
 * 
 * Refresh access token using refresh token.
 * 
 * Requirements: 3.4, 11.7
 */
export async function refresh(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Parse and validate request body
    const body = parseBody<RefreshTokenRequest>(event);
    const validation = validateRefreshRequest(body);

    if (!validation.valid) {
      return errorResponse(400, validation.error!, validation.code!);
    }

    const request = body!;

    // Call Cognito InitiateAuth API with REFRESH_TOKEN flow
    const result = await CognitoClientService.refreshToken(request);

    // Parse the new ID token to get user info for audit logging
    let userId = 'unknown';
    let tenantId = 'unknown';
    try {
      const userInfo = CognitoClientService.parseIdToken(result.idToken);
      userId = userInfo.id;
      tenantId = userInfo.tenantId;
    } catch {
      // Continue even if we can't parse the token
    }

    // Log token refresh event
    // Requirements: 11.7
    await AuthAuditService.logTokenRefresh(
      userId,
      tenantId,
      clientIp,
      userAgent,
      true
    );

    // Return new tokens
    return successResponse({
      accessToken: result.accessToken,
      idToken: result.idToken,
      expiresIn: result.expiresIn
    });

  } catch (error) {
    // Log failed refresh attempt
    // Requirements: 11.7
    await AuthAuditService.logTokenRefresh(
      'unknown',
      'unknown',
      clientIp,
      userAgent,
      false,
      error instanceof AuthError ? error.code : 'UNKNOWN_ERROR'
    );

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
    console.error('Token refresh error:', error);
    return errorResponse(401, 'Failed to refresh token', AUTH_ERROR_CODES.TOKEN_REFRESH_FAILED);
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

  return refresh(event);
}
