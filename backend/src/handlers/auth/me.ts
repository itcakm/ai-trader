/**
 * User Profile Handler
 * 
 * Handles getting current user profile from validated JWT.
 * Extracts user info from access token and returns profile.
 * 
 * Requirements: 3.12
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthError, AUTH_ERROR_CODES } from '../../types/auth';

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
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
 * GET /auth/me
 * 
 * Get current user profile from access token.
 * 
 * Requirements: 3.12
 */
export async function me(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Extract access token from Authorization header
    const accessToken = getAccessToken(event);

    if (!accessToken) {
      return {
        statusCode: 401,
        headers: {
          ...CORS_HEADERS,
          'WWW-Authenticate': 'Bearer realm="api"'
        },
        body: JSON.stringify({
          error: 'AuthError',
          code: AUTH_ERROR_CODES.INVALID_TOKEN,
          message: 'Authorization header with Bearer token is required'
        })
      };
    }

    // Get user info from Cognito using access token
    const user = await CognitoClientService.getCurrentUser(accessToken);

    // Return user profile
    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        roles: user.roles,
        emailVerified: user.emailVerified
      }
    });

  } catch (error) {
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
    console.error('Get user profile error:', error);
    return errorResponse(500, 'Failed to get user profile', AUTH_ERROR_CODES.AUTH_ERROR);
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

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  return me(event);
}
