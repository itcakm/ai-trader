/**
 * Logout Handler
 * 
 * Handles user logout by proxying to Cognito GlobalSignOut API.
 * Validates access token, invalidates all user sessions, logs logout event.
 * 
 * Requirements: 3.3, 11.3
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { AuthError, AUTH_ERROR_CODES, UserContext } from '../../types/auth';

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
 * Extract access token from Authorization header
 */
function getAccessToken(event: APIGatewayProxyEvent): string | null {
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7);
}

/**
 * POST /auth/logout
 * 
 * Sign out user globally (invalidate all tokens).
 * 
 * Requirements: 3.3, 11.3
 */
export async function logout(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Extract access token from Authorization header
    const accessToken = getAccessToken(event);

    if (!accessToken) {
      return errorResponse(
        401, 
        'Authorization header with Bearer token is required', 
        AUTH_ERROR_CODES.INVALID_TOKEN
      );
    }

    // Get user info before logout for audit logging
    let userInfo: { id: string; email: string; tenantId: string } | null = null;
    try {
      const user = await CognitoClientService.getCurrentUser(accessToken);
      userInfo = {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId
      };
    } catch {
      // If we can't get user info, continue with logout anyway
      // The token might be partially valid
    }

    // Call Cognito GlobalSignOut API
    await CognitoClientService.logout(accessToken);

    // Log logout event
    // Requirements: 11.3
    await AuthAuditService.logLogout(
      userInfo?.id || 'unknown',
      userInfo?.email || 'unknown',
      userInfo?.tenantId || 'unknown',
      clientIp,
      userAgent
    );

    return successResponse({
      message: 'Logged out successfully'
    });

  } catch (error) {
    // Log failed logout attempt
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.LOGOUT,
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
    console.error('Logout error:', error);
    return errorResponse(500, 'Logout failed', AUTH_ERROR_CODES.AUTH_ERROR);
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

  return logout(event);
}
