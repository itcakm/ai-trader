import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  BackfillService,
  InvalidBackfillRequestError,
  BackfillAlreadyInProgressError,
  BackfillCannotBeCancelledError
} from '../services/backfill';
import { ResourceNotFoundError, TenantAccessDeniedError } from '../db/access';
import { BackfillRequestInput } from '../types/backfill';
import { DataSourceType } from '../types/data-source';
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
 * Validate data source type
 */
function isValidDataSourceType(type: string): type is DataSourceType {
  return ['PRICE', 'NEWS', 'SENTIMENT', 'ON_CHAIN'].includes(type);
}

/**
 * Validate ISO date string
 */
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * POST /backfills
 * 
 * Request a new backfill.
 * 
 * Requirements: 9.1
 */
export async function createBackfill(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<BackfillRequestInput>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.sourceId) {
      validationErrors.push({
        field: 'sourceId',
        code: 'REQUIRED',
        message: 'sourceId is required'
      });
    }

    if (!body.symbol) {
      validationErrors.push({
        field: 'symbol',
        code: 'REQUIRED',
        message: 'symbol is required'
      });
    }

    if (!body.dataType || !isValidDataSourceType(body.dataType)) {
      validationErrors.push({
        field: 'dataType',
        code: 'INVALID',
        message: 'dataType must be one of: PRICE, NEWS, SENTIMENT, ON_CHAIN'
      });
    }

    if (!body.startTime) {
      validationErrors.push({
        field: 'startTime',
        code: 'REQUIRED',
        message: 'startTime is required'
      });
    } else if (!isValidISODate(body.startTime)) {
      validationErrors.push({
        field: 'startTime',
        code: 'INVALID',
        message: 'startTime must be a valid ISO date string'
      });
    }

    if (!body.endTime) {
      validationErrors.push({
        field: 'endTime',
        code: 'REQUIRED',
        message: 'endTime is required'
      });
    } else if (!isValidISODate(body.endTime)) {
      validationErrors.push({
        field: 'endTime',
        code: 'INVALID',
        message: 'endTime must be a valid ISO date string'
      });
    }

    // Validate date range
    if (body.startTime && body.endTime && isValidISODate(body.startTime) && isValidISODate(body.endTime)) {
      const startDate = new Date(body.startTime);
      const endDate = new Date(body.endTime);
      if (startDate >= endDate) {
        validationErrors.push({
          field: 'startTime',
          code: 'INVALID',
          message: 'startTime must be before endTime'
        });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const backfill = await BackfillService.requestBackfill(tenantId, body);

    return successResponse(backfill, 201);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof InvalidBackfillRequestError) {
      return errorResponse(400, error.message, 'INVALID_REQUEST');
    }
    console.error('Error creating backfill:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /backfills
 * 
 * List all backfill requests for the tenant.
 * 
 * Requirements: 9.1
 */
export async function listBackfills(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const backfills = await BackfillService.listBackfills(tenantId);

    return successResponse({
      backfills,
      count: backfills.length
    });
  } catch (error) {
    console.error('Error listing backfills:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /backfills/{id}
 * 
 * Get a specific backfill request by ID.
 * 
 * Requirements: 9.1
 */
export async function getBackfill(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return errorResponse(400, 'Missing backfill ID', 'MISSING_PARAMETER');
    }

    const backfill = await BackfillService.getBackfillStatus(tenantId, requestId);

    return successResponse(backfill);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, error.message, 'FORBIDDEN');
    }
    console.error('Error getting backfill:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /backfills/{id}
 * 
 * Cancel a backfill request.
 * 
 * Requirements: 9.1
 */
export async function cancelBackfill(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return errorResponse(400, 'Missing backfill ID', 'MISSING_PARAMETER');
    }

    await BackfillService.cancelBackfill(tenantId, requestId);

    return successResponse({ message: 'Backfill cancelled successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, error.message, 'FORBIDDEN');
    }
    if (error instanceof BackfillCannotBeCancelledError) {
      return errorResponse(400, error.message, 'CANNOT_CANCEL');
    }
    console.error('Error cancelling backfill:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /backfills/{id}/progress
 * 
 * Get backfill progress details.
 * 
 * Requirements: 9.4
 */
export async function getBackfillProgress(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return errorResponse(400, 'Missing backfill ID', 'MISSING_PARAMETER');
    }

    const backfill = await BackfillService.getBackfillStatus(tenantId, requestId);

    return successResponse({
      requestId: backfill.requestId,
      status: backfill.status,
      progress: backfill.progress,
      createdAt: backfill.createdAt,
      completedAt: backfill.completedAt
    });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, error.message, 'FORBIDDEN');
    }
    console.error('Error getting backfill progress:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /backfills/{id}/process
 * 
 * Start processing a queued backfill request.
 * 
 * Requirements: 9.1, 9.2
 */
export async function processBackfill(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return errorResponse(400, 'Missing backfill ID', 'MISSING_PARAMETER');
    }

    const backfill = await BackfillService.processBackfill(tenantId, requestId);

    return successResponse(backfill);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, error.message, 'FORBIDDEN');
    }
    if (error instanceof BackfillAlreadyInProgressError) {
      return errorResponse(409, error.message, 'ALREADY_IN_PROGRESS');
    }
    if (error instanceof InvalidBackfillRequestError) {
      return errorResponse(400, error.message, 'INVALID_REQUEST');
    }
    console.error('Error processing backfill:', error);
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

  // Route: POST /backfills
  if (method === 'POST' && path === '/backfills') {
    return createBackfill(event);
  }

  // Route: GET /backfills
  if (method === 'GET' && path === '/backfills') {
    return listBackfills(event);
  }

  // Route: POST /backfills/{id}/process
  if (method === 'POST' && path.match(/^\/backfills\/[^/]+\/process$/)) {
    return processBackfill(event);
  }

  // Route: GET /backfills/{id}/progress
  if (method === 'GET' && path.match(/^\/backfills\/[^/]+\/progress$/)) {
    return getBackfillProgress(event);
  }

  // Route: GET /backfills/{id}
  if (method === 'GET' && path.match(/^\/backfills\/[^/]+$/)) {
    return getBackfill(event);
  }

  // Route: DELETE /backfills/{id}
  if (method === 'DELETE' && path.match(/^\/backfills\/[^/]+$/)) {
    return cancelBackfill(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
