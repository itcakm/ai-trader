import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PositionLimitService } from '../services/position-limit';
import { PositionLimitRepository } from '../repositories/position-limit';
import { ResourceNotFoundError, TenantAccessDeniedError } from '../db/access';
import { PositionLimitInput, LimitScope, LimitType } from '../types/position-limit';

/**
 * Position Limit API Handlers
 * 
 * Implements CRUD endpoints for position limits.
 * Requirements: 1.1
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
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


interface CreatePositionLimitRequest {
  scope: LimitScope;
  assetId?: string;
  strategyId?: string;
  limitType: LimitType;
  maxValue: number;
}

interface UpdatePositionLimitRequest {
  maxValue?: number;
  currentValue?: number;
}

function validateCreateRequest(body: CreatePositionLimitRequest): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  
  if (!body.scope || !['ASSET', 'STRATEGY', 'PORTFOLIO'].includes(body.scope)) {
    errors.push({ field: 'scope', message: 'scope must be ASSET, STRATEGY, or PORTFOLIO' });
  }
  
  if (!body.limitType || !['ABSOLUTE', 'PERCENTAGE'].includes(body.limitType)) {
    errors.push({ field: 'limitType', message: 'limitType must be ABSOLUTE or PERCENTAGE' });
  }
  
  if (body.maxValue === undefined || body.maxValue < 0) {
    errors.push({ field: 'maxValue', message: 'maxValue must be a non-negative number' });
  }
  
  if (body.scope === 'ASSET' && !body.assetId) {
    errors.push({ field: 'assetId', message: 'assetId is required for ASSET scope' });
  }
  
  if (body.scope === 'STRATEGY' && !body.strategyId) {
    errors.push({ field: 'strategyId', message: 'strategyId is required for STRATEGY scope' });
  }
  
  if (body.limitType === 'PERCENTAGE' && body.maxValue > 100) {
    errors.push({ field: 'maxValue', message: 'maxValue cannot exceed 100 for PERCENTAGE type' });
  }
  
  return errors;
}

/**
 * POST /position-limits
 * Create a new position limit
 */
export async function createPositionLimit(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<CreatePositionLimitRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors = validateCreateRequest(body);
    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const input: PositionLimitInput = {
      scope: body.scope,
      assetId: body.assetId,
      strategyId: body.strategyId,
      limitType: body.limitType,
      maxValue: body.maxValue
    };

    const limit = await PositionLimitService.setLimit(tenantId, input);
    return successResponse(limit, 201);
  } catch (error) {
    console.error('Error creating position limit:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /position-limits
 * List all position limits for the tenant
 */
export async function listPositionLimits(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const scope = event.queryStringParameters?.scope as LimitScope | undefined;
    if (scope && !['ASSET', 'STRATEGY', 'PORTFOLIO'].includes(scope)) {
      return errorResponse(400, 'Invalid scope parameter', 'INVALID_PARAMETER');
    }

    const limits = await PositionLimitService.listLimits(tenantId, scope);
    return successResponse({ limits });
  } catch (error) {
    console.error('Error listing position limits:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * GET /position-limits/{id}
 * Get a specific position limit by ID
 */
export async function getPositionLimit(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const limitId = event.pathParameters?.id;
    if (!limitId) {
      return errorResponse(400, 'Missing limit ID', 'MISSING_PARAMETER');
    }

    const limit = await PositionLimitService.getLimit(tenantId, limitId);
    if (!limit) {
      return errorResponse(404, 'Position limit not found', 'NOT_FOUND');
    }

    return successResponse(limit);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting position limit:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PUT /position-limits/{id}
 * Update a position limit
 */
export async function updatePositionLimit(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const limitId = event.pathParameters?.id;
    if (!limitId) {
      return errorResponse(400, 'Missing limit ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<UpdatePositionLimitRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const existing = await PositionLimitService.getLimit(tenantId, limitId);
    if (!existing) {
      return errorResponse(404, 'Position limit not found', 'NOT_FOUND');
    }

    // Update current value if provided
    if (body.currentValue !== undefined) {
      await PositionLimitService.updateCurrentValue(tenantId, limitId, body.currentValue);
    }

    // If maxValue is being updated, we need to update the full limit
    if (body.maxValue !== undefined) {
      const updatedLimit = {
        ...existing,
        maxValue: body.maxValue,
        updatedAt: new Date().toISOString()
      };
      await PositionLimitRepository.putLimit(tenantId, updatedLimit);
      return successResponse(updatedLimit);
    }

    // Return the updated limit
    const updatedLimit = await PositionLimitService.getLimit(tenantId, limitId);
    return successResponse(updatedLimit);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error updating position limit:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /position-limits/{id}
 * Delete a position limit
 */
export async function deletePositionLimit(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const limitId = event.pathParameters?.id;
    if (!limitId) {
      return errorResponse(400, 'Missing limit ID', 'MISSING_PARAMETER');
    }

    await PositionLimitRepository.deleteLimit(tenantId, limitId);
    return successResponse({ message: 'Position limit deleted successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error deleting position limit:', error);
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

  // POST /position-limits
  if (method === 'POST' && path === '/position-limits') {
    return createPositionLimit(event);
  }

  // GET /position-limits
  if (method === 'GET' && path === '/position-limits') {
    return listPositionLimits(event);
  }

  // GET /position-limits/{id}
  if (method === 'GET' && path.match(/^\/position-limits\/[^/]+$/)) {
    return getPositionLimit(event);
  }

  // PUT /position-limits/{id}
  if (method === 'PUT' && path.match(/^\/position-limits\/[^/]+$/)) {
    return updatePositionLimit(event);
  }

  // DELETE /position-limits/{id}
  if (method === 'DELETE' && path.match(/^\/position-limits\/[^/]+$/)) {
    return deletePositionLimit(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
