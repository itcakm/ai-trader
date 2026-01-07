/**
 * SSO Initiate Handler
 * 
 * Initiates SSO authentication flow by redirecting to the identity provider.
 * Generates and stores a state parameter for CSRF protection.
 * 
 * Requirements: 7.4, 7.9
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSOService } from '../../services/sso';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { 
  SSOInitiateRequest, 
  AUTH_ERROR_CODES,
  SSO_ERROR_CODES 
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
 * Create a redirect response
 */
function redirectResponse(url: string): APIGatewayProxyResult {
  return {
    statusCode: 302,
    headers: {
      ...CORS_HEADERS,
      'Location': url
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
 * GET /auth/sso/initiate/:providerId
 * 
 * Initiates SSO authentication flow.
 * Generates a state parameter for CSRF protection and redirects to the IdP.
 * 
 * Requirements: 7.4, 7.9
 */
export async function ssoInitiate(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Get provider ID from path parameters
    const providerId = event.pathParameters?.providerId;
    
    if (!providerId) {
      return errorResponse(
        400,
        'Provider ID is required',
        AUTH_ERROR_CODES.INVALID_REQUEST
      );
    }

    // Get redirect URI from query parameters (optional, defaults to configured callback)
    const redirectUri = event.queryStringParameters?.redirect_uri;

    // Validate provider exists and is enabled
    const provider = await SSOService.getProvider(providerId);
    
    if (!provider) {
      return errorResponse(
        404,
        'SSO provider not found',
        SSO_ERROR_CODES.PROVIDER_NOT_FOUND
      );
    }

    if (!provider.enabled) {
      return errorResponse(
        403,
        'SSO provider is disabled',
        SSO_ERROR_CODES.PROVIDER_DISABLED
      );
    }

    // Generate authorization URL with state parameter
    // Requirements: 7.9 - CSRF protection via state parameter
    const { authorizationUrl, state } = await SSOService.initiateAuth({
      providerId,
      redirectUri
    });

    // Log SSO initiation event
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.SSO_LOGIN_INITIATED,
      ip: clientIp,
      userAgent,
      success: true,
      metadata: {
        providerId,
        providerType: provider.type
      }
    });

    // Check if client wants JSON response or redirect
    const acceptHeader = event.headers['Accept'] || event.headers['accept'] || '';
    const wantsJson = acceptHeader.includes('application/json');

    if (wantsJson) {
      // Return JSON with authorization URL for frontend to handle redirect
      return successResponse({
        authorizationUrl,
        state,
        providerId,
        providerType: provider.type
      });
    }

    // Redirect directly to IdP
    return redirectResponse(authorizationUrl);

  } catch (error) {
    console.error('SSO initiation error:', error);

    // Log failed SSO initiation
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.SSO_LOGIN_FAILED,
      ip: clientIp,
      userAgent,
      success: false,
      reason: (error as Error).message,
      metadata: {
        providerId: event.pathParameters?.providerId
      }
    });

    return errorResponse(
      500,
      'Failed to initiate SSO authentication',
      AUTH_ERROR_CODES.AUTH_ERROR
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

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  return ssoInitiate(event);
}
