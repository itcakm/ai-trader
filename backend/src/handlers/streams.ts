import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StreamService, StreamLimitExceededError, InvalidStreamStateError } from '../services/stream';
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
 * Request body for creating a stream
 */
interface CreateStreamRequest {
  sourceId: string;
  symbols: string[];
}

/**
 * POST /streams
 * 
 * Start a new data stream.
 * 
 * Requirements: 8.1
 */
export async function createStream(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<CreateStreamRequest>(event);
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

    if (!body.symbols || !Array.isArray(body.symbols) || body.symbols.length === 0) {
      validationErrors.push({
        field: 'symbols',
        code: 'REQUIRED',
        message: 'symbols must be a non-empty array'
      });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const stream = await StreamService.startStream(tenantId, body.sourceId, body.symbols);

    return successResponse(stream, 201);
  } catch (error) {
    if (error instanceof StreamLimitExceededError) {
      return errorResponse(429, error.message, 'STREAM_LIMIT_EXCEEDED');
    }
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error creating stream:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /streams
 * 
 * List all streams for the tenant.
 * 
 * Requirements: 8.1
 */
export async function listStreams(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const streams = await StreamService.listStreams(tenantId);

    return successResponse({
      streams,
      count: streams.length
    });
  } catch (error) {
    console.error('Error listing streams:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /streams/{id}
 * 
 * Get a specific stream by ID.
 * 
 * Requirements: 8.1
 */
export async function getStream(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const streamId = event.pathParameters?.id;
    if (!streamId) {
      return errorResponse(400, 'Missing stream ID', 'MISSING_PARAMETER');
    }

    const stream = await StreamService.getStreamStatus(tenantId, streamId);

    return successResponse(stream);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting stream:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /streams/{id}
 * 
 * Stop and delete a stream.
 * 
 * Requirements: 8.1
 */
export async function deleteStream(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const streamId = event.pathParameters?.id;
    if (!streamId) {
      return errorResponse(400, 'Missing stream ID', 'MISSING_PARAMETER');
    }

    await StreamService.stopStream(tenantId, streamId);

    return successResponse({ message: 'Stream stopped successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting stream:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /streams/{id}/pause
 * 
 * Pause a stream.
 * 
 * Requirements: 8.1
 */
export async function pauseStream(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const streamId = event.pathParameters?.id;
    if (!streamId) {
      return errorResponse(400, 'Missing stream ID', 'MISSING_PARAMETER');
    }

    await StreamService.pauseStream(tenantId, streamId);
    const stream = await StreamService.getStreamStatus(tenantId, streamId);

    return successResponse(stream);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof InvalidStreamStateError) {
      return errorResponse(400, error.message, 'INVALID_STREAM_STATE');
    }
    console.error('Error pausing stream:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /streams/{id}/resume
 * 
 * Resume a paused stream.
 * 
 * Requirements: 8.1
 */
export async function resumeStream(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const streamId = event.pathParameters?.id;
    if (!streamId) {
      return errorResponse(400, 'Missing stream ID', 'MISSING_PARAMETER');
    }

    await StreamService.resumeStream(tenantId, streamId);
    const stream = await StreamService.getStreamStatus(tenantId, streamId);

    return successResponse(stream);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof InvalidStreamStateError) {
      return errorResponse(400, error.message, 'INVALID_STREAM_STATE');
    }
    console.error('Error resuming stream:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /streams/{id}/health
 * 
 * Get stream health status.
 * 
 * Requirements: 8.2
 */
export async function getStreamHealth(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const streamId = event.pathParameters?.id;
    if (!streamId) {
      return errorResponse(400, 'Missing stream ID', 'MISSING_PARAMETER');
    }

    const health = await StreamService.checkHealth(tenantId, streamId);

    return successResponse({
      streamId,
      ...health
    });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting stream health:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /streams/{id}/metrics
 * 
 * Get stream metrics.
 * 
 * Requirements: 8.5
 */
export async function getStreamMetrics(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const streamId = event.pathParameters?.id;
    if (!streamId) {
      return errorResponse(400, 'Missing stream ID', 'MISSING_PARAMETER');
    }

    const metrics = await StreamService.getStreamMetrics(tenantId, streamId);

    return successResponse(metrics);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting stream metrics:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /streams/limits
 * 
 * Get tenant stream limits and current usage.
 * 
 * Requirements: 8.3
 */
export async function getStreamLimits(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const config = StreamService.getTenantConfig(tenantId);
    const activeCount = await StreamService.getActiveStreamCount(tenantId);
    const canStart = await StreamService.canStartStream(tenantId);

    return successResponse({
      tenantId,
      maxConcurrentStreams: config.maxConcurrentStreams,
      activeStreams: activeCount,
      canStartNewStream: canStart
    });
  } catch (error) {
    console.error('Error getting stream limits:', error);
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

  // Route: POST /streams
  if (method === 'POST' && path === '/streams') {
    return createStream(event);
  }

  // Route: GET /streams
  if (method === 'GET' && path === '/streams') {
    return listStreams(event);
  }

  // Route: GET /streams/limits
  if (method === 'GET' && path === '/streams/limits') {
    return getStreamLimits(event);
  }

  // Route: POST /streams/{id}/pause
  if (method === 'POST' && path.match(/^\/streams\/[^/]+\/pause$/)) {
    return pauseStream(event);
  }

  // Route: POST /streams/{id}/resume
  if (method === 'POST' && path.match(/^\/streams\/[^/]+\/resume$/)) {
    return resumeStream(event);
  }

  // Route: GET /streams/{id}/health
  if (method === 'GET' && path.match(/^\/streams\/[^/]+\/health$/)) {
    return getStreamHealth(event);
  }

  // Route: GET /streams/{id}/metrics
  if (method === 'GET' && path.match(/^\/streams\/[^/]+\/metrics$/)) {
    return getStreamMetrics(event);
  }

  // Route: GET /streams/{id}
  if (method === 'GET' && path.match(/^\/streams\/[^/]+$/)) {
    return getStream(event);
  }

  // Route: DELETE /streams/{id}
  if (method === 'DELETE' && path.match(/^\/streams\/[^/]+$/)) {
    return deleteStream(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
