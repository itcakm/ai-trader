import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StrategyService } from '../services/strategy';
import { ResourceNotFoundError } from '../db/access';
import { ValidationError } from '../types/validation';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for rollback operation
 */
interface RollbackRequest {
  targetVersion: number;
}

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
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
  code: string,
  details?: ValidationError[]
): APIGatewayProxyResult {
  const body: ErrorResponseBody = {
    error: message,
    code,
    ...(details && { details })
  };
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

/**
 * Extract tenant ID from request headers
 */
function getTenantId(event: APIGatewayProxyEvent): string | null {
  return event.headers['X-Tenant-Id'] || event.headers['x-tenant-id'] || null;
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
 * GET /strategies/{id}/versions
 * 
 * Get version history for a strategy.
 * 
 * Requirements: 3.3, 3.4
 */
export async function getVersionHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.pathParameters?.id;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    const versions = await StrategyService.getVersionHistory(tenantId, strategyId);

    return successResponse({ versions });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting version history:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /strategies/{id}/versions/{version}
 * 
 * Get a specific version of a strategy.
 * 
 * Requirements: 3.4
 */
export async function getVersion(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.pathParameters?.id;
    const versionStr = event.pathParameters?.version;

    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    if (!versionStr) {
      return errorResponse(400, 'Missing version number', 'MISSING_PARAMETER');
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version) || version < 1) {
      return errorResponse(400, 'Invalid version number', 'INVALID_PARAMETER');
    }

    const strategyVersion = await StrategyService.getVersion(
      tenantId,
      strategyId,
      version
    );

    return successResponse(strategyVersion);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting version:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /strategies/{id}/rollback
 * 
 * Rollback a strategy to a previous version.
 * 
 * Requirements: 3.5
 */
export async function rollbackToVersion(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.pathParameters?.id;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<RollbackRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (body.targetVersion === undefined || body.targetVersion === null) {
      return errorResponse(400, 'Missing targetVersion', 'MISSING_PARAMETER', [
        { field: 'targetVersion', code: 'REQUIRED', message: 'targetVersion is required' }
      ]);
    }

    if (typeof body.targetVersion !== 'number' || body.targetVersion < 1) {
      return errorResponse(400, 'Invalid targetVersion', 'INVALID_PARAMETER', [
        { field: 'targetVersion', code: 'INVALID', message: 'targetVersion must be a positive integer' }
      ]);
    }

    const strategy = await StrategyService.rollbackToVersion(
      tenantId,
      strategyId,
      body.targetVersion
    );

    return successResponse(strategy);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error rolling back version:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Main handler that routes requests based on HTTP method and path
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

  const path = event.path;
  const method = event.httpMethod;

  // Route: POST /strategies/{id}/rollback
  if (method === 'POST' && path.match(/^\/strategies\/[^/]+\/rollback$/)) {
    return rollbackToVersion(event);
  }

  // Route: GET /strategies/{id}/versions/{version}
  if (method === 'GET' && path.match(/^\/strategies\/[^/]+\/versions\/\d+$/)) {
    return getVersion(event);
  }

  // Route: GET /strategies/{id}/versions
  if (method === 'GET' && path.match(/^\/strategies\/[^/]+\/versions$/)) {
    return getVersionHistory(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
