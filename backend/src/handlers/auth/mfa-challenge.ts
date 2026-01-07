/**
 * MFA Challenge Handler
 * 
 * Handles MFA challenge response by proxying to Cognito RespondToAuthChallenge API.
 * Validates session and TOTP code, returns tokens on success.
 * 
 * Requirements: 3.11, 11.5
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { MFAChallengeRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

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
 * Validate MFA challenge request body
 */
function validateMFAChallengeRequest(body: MFAChallengeRequest | null): { valid: boolean; error?: string; code?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  if (!body.session) {
    return { valid: false, error: 'Session is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  if (!body.code) {
    return { valid: false, error: 'MFA code is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  // TOTP codes are typically 6 digits
  if (!/^\d{6}$/.test(body.code)) {
    return { valid: false, error: 'Invalid MFA code format', code: AUTH_ERROR_CODES.INVALID_MFA_CODE };
  }

  return { valid: true };
}

/**
 * POST /auth/mfa/challenge
 * 
 * Respond to MFA challenge during login.
 * 
 * Requirements: 3.11, 11.5
 */
export async function mfaChallenge(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Parse and validate request body
    const body = parseBody<MFAChallengeRequest>(event);
    const validation = validateMFAChallengeRequest(body);

    if (!validation.valid) {
      return errorResponse(400, validation.error!, validation.code!);
    }

    const request = body!;

    // Call Cognito RespondToAuthChallenge API
    const result = await CognitoClientService.respondToMFAChallenge(request);

    // Successful MFA verification - log success event
    if (result.tokens && result.user) {
      // Requirements: 11.5
      await AuthAuditService.logAuthEvent({
        event: AUTH_EVENT_TYPES.MFA_CHALLENGE_SUCCESS,
        userId: result.user.id,
        email: result.user.email,
        tenantId: result.user.tenantId,
        ip: clientIp,
        userAgent,
        success: true
      });

      // Also log successful login after MFA
      await AuthAuditService.logLoginSuccess(
        result.user.id,
        result.user.email,
        result.user.tenantId,
        clientIp,
        userAgent,
        {
          mfaVerified: true,
          roles: result.user.roles
        }
      );

      // Return tokens and user info
      return successResponse({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        idToken: result.tokens.idToken,
        expiresIn: result.tokens.expiresIn,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          tenantId: result.user.tenantId,
          roles: result.user.roles
        }
      });
    }

    // Unexpected response
    return errorResponse(500, 'MFA verification failed', AUTH_ERROR_CODES.AUTH_ERROR);

  } catch (error) {
    // Log failed MFA challenge attempt
    // Requirements: 11.5
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.MFA_CHALLENGE_FAILED,
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
    console.error('MFA challenge error:', error);
    return errorResponse(500, 'MFA verification failed', AUTH_ERROR_CODES.AUTH_ERROR);
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

  return mfaChallenge(event);
}
