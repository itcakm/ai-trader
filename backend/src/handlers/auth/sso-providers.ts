/**
 * SSO Providers Handler
 * 
 * Returns a list of enabled SSO providers for the login page.
 * 
 * Requirements: 7.3
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSOService } from '../../services/sso';
import { AUTH_ERROR_CODES } from '../../types/auth';

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
 * GET /auth/sso/providers
 * 
 * Returns a list of enabled SSO providers.
 * This endpoint is public and used to display SSO options on the login page.
 * 
 * Requirements: 7.3
 */
export async function ssoProviders(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get optional tenant ID from query parameters
    const tenantId = event.queryStringParameters?.tenantId;

    // Get enabled SSO providers
    const providers = await SSOService.getEnabledProviders(tenantId);

    // Return sanitized provider list (no sensitive data)
    const sanitizedProviders = providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      displayName: provider.displayName,
      type: provider.type,
      logoUrl: provider.logoUrl
    }));

    return successResponse({
      providers: sanitizedProviders,
      count: sanitizedProviders.length
    });

  } catch (error) {
    console.error('Error fetching SSO providers:', error);
    return errorResponse(
      500,
      'Failed to fetch SSO providers',
      AUTH_ERROR_CODES.SERVICE_UNAVAILABLE
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

  return ssoProviders(event);
}
