import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DrawdownService, AuthenticationRequiredError } from '../services/drawdown';
import { TenantAccessDeniedError } from '../db/access';

/**
 * Drawdown API Handlers
 * 
 * Implements endpoints for drawdown management:
 * - GET /drawdown - Get drawdown state
 * - POST /drawdown/reset - Reset drawdown calculation
 * - POST /drawdown/resume - Resume a paused strategy
 * 
 * Requirements: 2.1, 2.5, 2.6
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

interface ErrorResponseBody {
  error: string;
  code: string;
  details?: { field: string; message: string }[];
}

function successResponse<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  };
}

function errorResponse(
  statusCode: number,
  message: string,
  code: string,
  details?: { field: string; message: string }[]
): APIGatewayProxyResult {
  const body: ErrorResponseBody = { error: message, code };
  if (details) body.details = details;
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

function getTenantId(event: APIGatewayProxyEvent): string | null {
  return event.headers['X-Tenant-Id'] || event.headers['x-tenant-id'] || null;
}

function parseBody<T>(event: APIGatewayProxyEvent): T | null {
  try {
    if (!event.body) return null;
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
}


interface ResetDrawdownRequest {
  strategyId?: string;
}

interface ResumeStrategyRequest {
  strategyId: string;
  authToken: string;
}

/**
 * GET /drawdown
 * Get drawdown state for the tenant, optionally filtered by strategy
 * 
 * Query parameters:
 * - strategyId: Optional strategy ID to get strategy-specific drawdown
 * 
 * Requirements: 2.1
 */
export async function getDrawdown(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.queryStringParameters?.strategyId;
    
    // Get drawdown state
    const state = await DrawdownService.getDrawdownState(tenantId, strategyId);
    
    if (!state) {
      return errorResponse(404, 'Drawdown state not found', 'NOT_FOUND');
    }

    // Also get the check result for additional context
    const checkResult = await DrawdownService.checkDrawdown(tenantId, strategyId);

    return successResponse({
      state,
      check: checkResult
    });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting drawdown:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /drawdown/check
 * Check current drawdown status without full state
 * 
 * Query parameters:
 * - strategyId: Optional strategy ID
 * 
 * Requirements: 2.1
 */
export async function checkDrawdown(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.queryStringParameters?.strategyId;
    const checkResult = await DrawdownService.checkDrawdown(tenantId, strategyId);

    return successResponse(checkResult);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error checking drawdown:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /drawdown/reset
 * Reset drawdown calculation (sets peak to current value)
 * 
 * Requirements: 2.6
 */
export async function resetDrawdown(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<ResetDrawdownRequest>(event);
    const strategyId = body?.strategyId;

    const state = await DrawdownService.resetDrawdown(tenantId, strategyId);

    return successResponse({
      message: 'Drawdown reset successfully',
      state
    });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    if (error instanceof Error && error.message.includes('No drawdown state found')) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error resetting drawdown:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * POST /drawdown/resume
 * Resume a strategy that was paused due to drawdown breach
 * 
 * Requires authentication token for security.
 * 
 * Requirements: 2.5
 */
export async function resumeStrategy(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<ResumeStrategyRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.strategyId) {
      return errorResponse(400, 'Missing strategyId', 'MISSING_PARAMETER', [
        { field: 'strategyId', message: 'strategyId is required' }
      ]);
    }

    if (!body.authToken) {
      return errorResponse(400, 'Missing authToken', 'MISSING_PARAMETER', [
        { field: 'authToken', message: 'authToken is required for resume operation' }
      ]);
    }

    await DrawdownService.resumeStrategy(tenantId, body.strategyId, body.authToken);

    // Get updated state
    const state = await DrawdownService.getDrawdownState(tenantId, body.strategyId);

    return successResponse({
      message: 'Strategy resumed successfully',
      state
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return errorResponse(401, error.message, 'AUTHENTICATION_REQUIRED');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    if (error instanceof Error) {
      if (error.message.includes('No drawdown state found')) {
        return errorResponse(404, error.message, 'NOT_FOUND');
      }
      if (error.message.includes('is not paused')) {
        return errorResponse(400, error.message, 'INVALID_STATE');
      }
    }
    console.error('Error resuming strategy:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /drawdown/paused
 * Get all paused strategies for the tenant
 * 
 * Requirements: 2.5
 */
export async function getPausedStrategies(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const pausedStrategies = await DrawdownService.getPausedStrategies(tenantId);

    return successResponse({ pausedStrategies });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting paused strategies:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Main handler that routes requests based on HTTP method and path
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const path = event.path;
  const method = event.httpMethod;

  // GET /drawdown
  if (method === 'GET' && path === '/drawdown') {
    return getDrawdown(event);
  }

  // GET /drawdown/check
  if (method === 'GET' && path === '/drawdown/check') {
    return checkDrawdown(event);
  }

  // GET /drawdown/paused
  if (method === 'GET' && path === '/drawdown/paused') {
    return getPausedStrategies(event);
  }

  // POST /drawdown/reset
  if (method === 'POST' && path === '/drawdown/reset') {
    return resetDrawdown(event);
  }

  // POST /drawdown/resume
  if (method === 'POST' && path === '/drawdown/resume') {
    return resumeStrategy(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
