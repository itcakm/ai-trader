/**
 * Login Handler
 * 
 * Handles user authentication by proxying to Cognito InitiateAuth API.
 * Validates request body, handles MFA challenges, logs login events.
 * 
 * Requirements: 3.2, 3.13, 3.14, 11.1, 11.2
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { LoginRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

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
 * Requirements: 3.14
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
 * Validate login request body
 * Requirements: 3.13
 */
function validateLoginRequest(body: LoginRequest | null): { valid: boolean; error?: string; code?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  if (!body.email) {
    return { valid: false, error: 'Email is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  if (!isValidEmail(body.email)) {
    return { valid: false, error: 'Invalid email format', code: AUTH_ERROR_CODES.INVALID_EMAIL_FORMAT };
  }

  if (!body.password) {
    return { valid: false, error: 'Password is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  return { valid: true };
}

/**
 * POST /auth/login
 * 
 * Authenticate a user with email and password.
 * Returns tokens on success, or MFA challenge if MFA is enabled.
 * 
 * Requirements: 3.2, 3.13, 3.14, 11.1, 11.2
 */
export async function login(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Parse and validate request body
    const body = parseBody<LoginRequest>(event);
    const validation = validateLoginRequest(body);

    if (!validation.valid) {
      return errorResponse(400, validation.error!, validation.code!);
    }

    const request = body!;

    // Call Cognito InitiateAuth API with USER_PASSWORD_AUTH flow
    const result = await CognitoClientService.login(request);

    // Handle MFA challenge
    if (result.challengeType === 'MFA') {
      // Log MFA required event
      await AuthAuditService.logAuthEvent({
        event: AUTH_EVENT_TYPES.LOGIN_MFA_REQUIRED,
        email: request.email,
        ip: clientIp,
        userAgent,
        success: true
      });

      return successResponse({
        challengeType: 'MFA',
        session: result.session,
        message: 'MFA verification required'
      });
    }

    // Handle new password required challenge
    if (result.challengeType === 'NEW_PASSWORD_REQUIRED') {
      return successResponse({
        challengeType: 'NEW_PASSWORD_REQUIRED',
        session: result.session,
        message: 'New password required'
      });
    }

    // Successful authentication - log success event
    // Requirements: 11.1
    if (result.tokens && result.user) {
      await AuthAuditService.logLoginSuccess(
        result.user.id,
        result.user.email,
        result.user.tenantId,
        clientIp,
        userAgent,
        {
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
    return errorResponse(500, 'Authentication failed', AUTH_ERROR_CODES.AUTH_ERROR);

  } catch (error) {
    // Log failed login attempt
    // Requirements: 11.2
    const body = parseBody<LoginRequest>(event);
    await AuthAuditService.logLoginFailed(
      body?.email || 'unknown',
      clientIp,
      userAgent,
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
    console.error('Login error:', error);
    return errorResponse(500, 'Authentication failed', AUTH_ERROR_CODES.AUTH_ERROR);
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

  return login(event);
}
