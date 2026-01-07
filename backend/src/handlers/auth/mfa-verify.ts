/**
 * MFA Verify Handler
 * 
 * Handles MFA setup verification by proxying to Cognito VerifySoftwareToken API.
 * Validates access token and TOTP code, completes MFA setup.
 * 
 * Requirements: 3.10, 11.5
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { MFAVerifyRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

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
 * Request body for MFA verify
 */
interface MFAVerifyBody {
  code: string;
  friendlyDeviceName?: string;
}

/**
 * Validate MFA verify request body
 */
function validateMFAVerifyRequest(body: MFAVerifyBody | null): { valid: boolean; error?: string; code?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  if (!body.code) {
    return { valid: false, error: 'Verification code is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  // TOTP codes are typically 6 digits
  if (!/^\d{6}$/.test(body.code)) {
    return { valid: false, error: 'Invalid verification code format', code: AUTH_ERROR_CODES.INVALID_MFA_CODE };
  }

  return { valid: true };
}

/**
 * POST /auth/mfa/verify
 * 
 * Verify MFA setup with TOTP code from authenticator app.
 * 
 * Requirements: 3.10, 11.5
 */
export async function mfaVerify(
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

    // Parse and validate request body
    const body = parseBody<MFAVerifyBody>(event);
    const validation = validateMFAVerifyRequest(body);

    if (!validation.valid) {
      return errorResponse(400, validation.error!, validation.code!);
    }

    const request = body!;

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

    // Call Cognito VerifySoftwareToken API
    const result = await CognitoClientService.verifyMFASetup(
      accessToken,
      request.code,
      request.friendlyDeviceName
    );

    if (result.status === 'SUCCESS') {
      // Log MFA setup completion event
      // Requirements: 11.5
      await AuthAuditService.logMFAEnabled(
        userInfo?.id || 'unknown',
        userInfo?.email || 'unknown',
        userInfo?.tenantId || 'unknown',
        clientIp,
        userAgent
      );

      return successResponse({
        status: 'SUCCESS',
        message: 'MFA has been enabled successfully.'
      });
    } else {
      // Log failed MFA verification
      await AuthAuditService.logAuthEvent({
        event: AUTH_EVENT_TYPES.MFA_VERIFIED,
        userId: userInfo?.id,
        email: userInfo?.email,
        tenantId: userInfo?.tenantId,
        ip: clientIp,
        userAgent,
        success: false,
        reason: 'VERIFICATION_FAILED'
      });

      return errorResponse(400, 'MFA verification failed', AUTH_ERROR_CODES.INVALID_MFA_CODE);
    }

  } catch (error) {
    // Log failed MFA verification attempt
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.MFA_VERIFIED,
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
    console.error('MFA verify error:', error);
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

  return mfaVerify(event);
}
