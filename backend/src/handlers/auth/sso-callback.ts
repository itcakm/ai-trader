/**
 * SSO Callback Handler
 * 
 * Handles the callback from the identity provider after SSO authentication.
 * Validates state parameter, exchanges authorization code for tokens,
 * and provisions users if needed (JIT provisioning).
 * 
 * Requirements: 7.5, 7.7, 7.8, 7.9, 7.10
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSOService } from '../../services/sso';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { 
  SSOCallbackRequest,
  AUTH_ERROR_CODES,
  SSO_ERROR_CODES,
  AuthError
} from '../../types/auth';

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
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
 * Create an error response
 */
function errorResponse(
  statusCode: number,
  message: string,
  code: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      error: 'SSOError',
      code,
      message
    })
  };
}

/**
 * Create a redirect response with error
 */
function redirectWithError(
  baseUrl: string,
  error: string,
  errorDescription: string
): APIGatewayProxyResult {
  const url = new URL(baseUrl);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', errorDescription);
  
  return {
    statusCode: 302,
    headers: {
      ...CORS_HEADERS,
      'Location': url.toString()
    },
    body: ''
  };
}

/**
 * Create a redirect response with tokens
 */
function redirectWithTokens(
  baseUrl: string,
  tokens: { accessToken: string; refreshToken: string; idToken: string; expiresIn: number },
  isNewUser: boolean
): APIGatewayProxyResult {
  const url = new URL(baseUrl);
  // For security, we pass a temporary code that the frontend exchanges for tokens
  // In a real implementation, you'd store tokens server-side and pass a session ID
  url.searchParams.set('sso_success', 'true');
  url.searchParams.set('is_new_user', String(isNewUser));
  
  return {
    statusCode: 302,
    headers: {
      ...CORS_HEADERS,
      'Location': url.toString()
    },
    body: ''
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
 * Parse callback request from query parameters or body
 */
function parseCallbackRequest(event: APIGatewayProxyEvent): SSOCallbackRequest {
  // Try query parameters first (GET request)
  if (event.queryStringParameters) {
    return {
      code: event.queryStringParameters.code,
      state: event.queryStringParameters.state || '',
      error: event.queryStringParameters.error,
      error_description: event.queryStringParameters.error_description
    };
  }

  // Try body (POST request)
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      return {
        code: body.code,
        state: body.state || '',
        error: body.error,
        error_description: body.error_description
      };
    } catch {
      // Fall through to empty request
    }
  }

  return { state: '' };
}

/**
 * GET/POST /auth/sso/callback
 * 
 * Handles the callback from the identity provider.
 * Validates state, exchanges code for tokens, and provisions users.
 * 
 * Requirements: 7.5, 7.7, 7.8, 7.9, 7.10
 */
export async function ssoCallback(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  // Get frontend redirect URL from environment
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const loginRedirectUrl = `${frontendUrl}/login`;

  try {
    // Parse callback request
    const request = parseCallbackRequest(event);

    // Check for IdP error response
    // Requirements: 7.10
    if (request.error) {
      console.error('SSO IdP error:', request.error, request.error_description);

      await AuthAuditService.logAuthEvent({
        event: AUTH_EVENT_TYPES.SSO_LOGIN_FAILED,
        ip: clientIp,
        userAgent,
        success: false,
        reason: `IdP error: ${request.error}`,
        metadata: {
          error: request.error,
          errorDescription: request.error_description
        }
      });

      // Check if client wants JSON response
      const acceptHeader = event.headers['Accept'] || event.headers['accept'] || '';
      if (acceptHeader.includes('application/json')) {
        return errorResponse(
          400,
          request.error_description || 'SSO authentication failed',
          SSO_ERROR_CODES.CALLBACK_ERROR
        );
      }

      return redirectWithError(
        loginRedirectUrl,
        request.error,
        request.error_description || 'SSO authentication failed'
      );
    }

    // Validate state parameter
    // Requirements: 7.9 - CSRF protection
    if (!request.state) {
      return errorResponse(
        400,
        'Missing state parameter',
        SSO_ERROR_CODES.INVALID_STATE
      );
    }

    // Validate authorization code
    if (!request.code) {
      return errorResponse(
        400,
        'Missing authorization code',
        AUTH_ERROR_CODES.INVALID_REQUEST
      );
    }

    // Process the SSO callback
    // This validates state, exchanges code for tokens, and provisions user if needed
    // Requirements: 7.5, 7.7, 7.8
    const result = await SSOService.handleCallback({
      code: request.code,
      state: request.state
    });

    // Log successful SSO login
    if (result.user) {
      await AuthAuditService.logSSOLogin(
        result.user.id,
        result.user.email,
        result.user.tenantId,
        clientIp,
        userAgent,
        result.providerId || 'unknown',
        true
      );
    }

    // Check if client wants JSON response
    const acceptHeader = event.headers['Accept'] || event.headers['accept'] || '';
    if (acceptHeader.includes('application/json')) {
      return successResponse({
        accessToken: result.tokens?.accessToken,
        refreshToken: result.tokens?.refreshToken,
        idToken: result.tokens?.idToken,
        expiresIn: result.tokens?.expiresIn,
        user: result.user,
        isNewUser: result.isNewUser
      });
    }

    // Redirect to frontend with success
    if (result.tokens) {
      // In production, you'd typically:
      // 1. Store tokens in a server-side session
      // 2. Set an httpOnly cookie with session ID
      // 3. Redirect to frontend which reads the session
      // For this implementation, we redirect with a success flag
      // and the frontend can call /auth/me to get user info
      return redirectWithTokens(
        result.redirectUri || frontendUrl,
        result.tokens,
        result.isNewUser || false
      );
    }

    return errorResponse(
      500,
      'Failed to complete SSO authentication',
      SSO_ERROR_CODES.TOKEN_EXCHANGE_FAILED
    );

  } catch (error) {
    console.error('SSO callback error:', error);

    // Log failed SSO callback
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.SSO_LOGIN_FAILED,
      ip: clientIp,
      userAgent,
      success: false,
      reason: (error as Error).message
    });

    // Handle specific SSO errors
    if (error instanceof AuthError) {
      const acceptHeader = event.headers['Accept'] || event.headers['accept'] || '';
      if (acceptHeader.includes('application/json')) {
        return errorResponse(error.statusCode, error.message, error.code);
      }
      return redirectWithError(loginRedirectUrl, error.code, error.message);
    }

    // Check if client wants JSON response
    const acceptHeader = event.headers['Accept'] || event.headers['accept'] || '';
    if (acceptHeader.includes('application/json')) {
      return errorResponse(
        500,
        'SSO authentication failed',
        AUTH_ERROR_CODES.AUTH_ERROR
      );
    }

    return redirectWithError(
      loginRedirectUrl,
      'sso_error',
      'SSO authentication failed'
    );
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

  // SSO callbacks can be GET or POST depending on the IdP
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  return ssoCallback(event);
}
