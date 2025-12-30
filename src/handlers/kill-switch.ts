import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { KillSwitchService, AuthenticationRequiredError, KillSwitchStateError } from '../services/kill-switch';
import { TenantAccessDeniedError } from '../db/access';
import { KillSwitchScopeType } from '../types/kill-switch';

/**
 * Kill Switch API Handlers
 * 
 * Implements endpoints for kill switch management:
 * - POST /kill-switch/activate - Activate the kill switch
 * - POST /kill-switch/deactivate - Deactivate the kill switch
 * - GET /kill-switch - Get current kill switch state
 * 
 * Requirements: 4.1, 4.5
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


interface ActivateKillSwitchRequest {
  reason: string;
  scope?: {
    type: KillSwitchScopeType;
    id?: string;
  };
}

interface DeactivateKillSwitchRequest {
  authToken: string;
}

/**
 * GET /kill-switch
 * Get current kill switch state
 * 
 * Requirements: 4.1
 */
export async function getKillSwitchState(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const state = await KillSwitchService.getState(tenantId);
    return successResponse(state);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting kill switch state:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /kill-switch/active
 * Quick check if kill switch is active (optimized for pre-trade checks)
 * 
 * Requirements: 4.1
 */
export async function isKillSwitchActive(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const active = await KillSwitchService.isActive(tenantId);
    return successResponse({ active });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error checking kill switch status:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /kill-switch/activate
 * Activate the kill switch to halt all trading
 * 
 * Requirements: 4.1, 4.2
 */
export async function activateKillSwitch(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<ActivateKillSwitchRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.reason || body.reason.trim() === '') {
      return errorResponse(400, 'Missing reason', 'MISSING_PARAMETER', [
        { field: 'reason', message: 'reason is required for kill switch activation' }
      ]);
    }

    // Validate scope if provided
    if (body.scope) {
      if (!['TENANT', 'STRATEGY', 'ASSET'].includes(body.scope.type)) {
        return errorResponse(400, 'Invalid scope type', 'INVALID_PARAMETER', [
          { field: 'scope.type', message: 'scope.type must be TENANT, STRATEGY, or ASSET' }
        ]);
      }
      if ((body.scope.type === 'STRATEGY' || body.scope.type === 'ASSET') && !body.scope.id) {
        return errorResponse(400, 'Missing scope ID', 'MISSING_PARAMETER', [
          { field: 'scope.id', message: 'scope.id is required for STRATEGY or ASSET scope' }
        ]);
      }
    }

    // Get user from authorization header if available
    const activatedBy = event.headers['Authorization'] || event.headers['authorization'] || undefined;

    const result = await KillSwitchService.activate(
      tenantId,
      body.reason,
      body.scope,
      activatedBy,
      'MANUAL'
    );

    return successResponse({
      message: 'Kill switch activated',
      state: result.state,
      ordersCancelled: result.ordersCancelled
    });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error activating kill switch:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * POST /kill-switch/deactivate
 * Deactivate the kill switch to resume trading
 * 
 * Requires authentication token for security.
 * 
 * Requirements: 4.5
 */
export async function deactivateKillSwitch(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<DeactivateKillSwitchRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.authToken || body.authToken.trim() === '') {
      return errorResponse(400, 'Missing authToken', 'MISSING_PARAMETER', [
        { field: 'authToken', message: 'authToken is required for kill switch deactivation' }
      ]);
    }

    const state = await KillSwitchService.deactivate(tenantId, body.authToken);

    return successResponse({
      message: 'Kill switch deactivated',
      state
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return errorResponse(401, error.message, 'AUTHENTICATION_REQUIRED');
    }
    if (error instanceof KillSwitchStateError) {
      return errorResponse(400, error.message, 'INVALID_STATE');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error deactivating kill switch:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /kill-switch/config
 * Get kill switch configuration
 */
export async function getKillSwitchConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const config = await KillSwitchService.getConfig(tenantId);
    
    if (!config) {
      return errorResponse(404, 'Kill switch config not found', 'NOT_FOUND');
    }

    return successResponse(config);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting kill switch config:', error);
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

  // GET /kill-switch
  if (method === 'GET' && path === '/kill-switch') {
    return getKillSwitchState(event);
  }

  // GET /kill-switch/active
  if (method === 'GET' && path === '/kill-switch/active') {
    return isKillSwitchActive(event);
  }

  // GET /kill-switch/config
  if (method === 'GET' && path === '/kill-switch/config') {
    return getKillSwitchConfig(event);
  }

  // POST /kill-switch/activate
  if (method === 'POST' && path === '/kill-switch/activate') {
    return activateKillSwitch(event);
  }

  // POST /kill-switch/deactivate
  if (method === 'POST' && path === '/kill-switch/deactivate') {
    return deactivateKillSwitch(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
