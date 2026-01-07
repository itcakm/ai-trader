/**
 * MFA Setup Handler
 * 
 * Handles MFA setup initiation by proxying to Cognito AssociateSoftwareToken API.
 * Validates access token, returns secret code for authenticator app setup.
 * 
 * Requirements: 3.9, 11.5
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { AuthError, AUTH_ERROR_CODES } from '../../types/auth';

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
 * POST /auth/mfa/setup
 * 
 * Initiate MFA setup by getting secret code for authenticator app.
 * 
 * Requirements: 3.9, 11.5
 */
export async function mfaSetup(
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

    // Get user info for audit logging
    let userInfo: { id: string; email: string; tenantId: string } | null = null;
    try {
      const user = await CognitoClientService.getCurrentUser(accessToken);
      userInfo = {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId
      };
    } catch {
      // Continue even if we can't get user info
    }

    // Call Cognito AssociateSoftwareToken API
    const result = await CognitoClientService.setupMFA(accessToken);

    // Log MFA setup initiation event
    // Requirements: 11.5
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.MFA_ENABLED, // Using MFA_ENABLED for setup initiation
      userId: userInfo?.id,
      email: userInfo?.email,
      tenantId: userInfo?.tenantId,
      ip: clientIp,
      userAgent,
      success: true,
      metadata: {
        action: 'setup_initiated'
      }
    });

    // Return secret code for authenticator app
    // The frontend will use this to generate a QR code
    return successResponse({
      secretCode: result.secretCode,
      session: result.session,
      message: 'Scan the QR code with your authenticator app, then verify with a code.'
    });

  } catch (error) {
    // Log failed MFA setup attempt
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.MFA_ENABLED,
      ip: clientIp,
      userAgent,
      success: false,
      reason: error instanceof AuthError ? error.code : 'UNKNOWN_ERROR',
      metadata: {
        action: 'setup_initiated'
      }
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
    console.error('MFA setup error:', error);
    return errorResponse(500, 'MFA setup failed', AUTH_ERROR_CODES.AUTH_ERROR);
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

  return mfaSetup(event);
}
