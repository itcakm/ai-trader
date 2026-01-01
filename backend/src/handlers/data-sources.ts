import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DataSourceService, RegisterDataSourceInput } from '../services/data-source';
import { DataSourceRepository } from '../repositories/data-source';
import { ResourceNotFoundError } from '../db/access';
import { DataSourceType, DataSourceStatus } from '../types/data-source';
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
 * Validate data source status
 */
function isValidDataSourceStatus(status: string): status is DataSourceStatus {
  return ['ACTIVE', 'INACTIVE', 'RATE_LIMITED', 'ERROR'].includes(status);
}

/**
 * POST /data-sources
 * 
 * Register a new data source.
 * 
 * Requirements: 1.1, 1.2
 */
export async function createDataSource(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<RegisterDataSourceInput>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.type || !isValidDataSourceType(body.type)) {
      validationErrors.push({
        field: 'type',
        code: 'INVALID',
        message: 'type must be one of: PRICE, NEWS, SENTIMENT, ON_CHAIN'
      });
    }

    if (!body.name) {
      validationErrors.push({
        field: 'name',
        code: 'REQUIRED',
        message: 'name is required'
      });
    }

    if (!body.apiEndpoint) {
      validationErrors.push({
        field: 'apiEndpoint',
        code: 'REQUIRED',
        message: 'apiEndpoint is required'
      });
    }

    if (!body.authMethod || !['API_KEY', 'OAUTH', 'HMAC'].includes(body.authMethod)) {
      validationErrors.push({
        field: 'authMethod',
        code: 'INVALID',
        message: 'authMethod must be one of: API_KEY, OAUTH, HMAC'
      });
    }

    if (!body.supportedSymbols || !Array.isArray(body.supportedSymbols) || body.supportedSymbols.length === 0) {
      validationErrors.push({
        field: 'supportedSymbols',
        code: 'REQUIRED',
        message: 'supportedSymbols must be a non-empty array'
      });
    }

    if (!body.rateLimits) {
      validationErrors.push({
        field: 'rateLimits',
        code: 'REQUIRED',
        message: 'rateLimits is required'
      });
    } else {
      if (typeof body.rateLimits.requestsPerSecond !== 'number' || body.rateLimits.requestsPerSecond < 0) {
        validationErrors.push({
          field: 'rateLimits.requestsPerSecond',
          code: 'INVALID',
          message: 'requestsPerSecond must be a non-negative number'
        });
      }
      if (typeof body.rateLimits.requestsPerMinute !== 'number' || body.rateLimits.requestsPerMinute < 0) {
        validationErrors.push({
          field: 'rateLimits.requestsPerMinute',
          code: 'INVALID',
          message: 'requestsPerMinute must be a non-negative number'
        });
      }
      if (typeof body.rateLimits.requestsPerDay !== 'number' || body.rateLimits.requestsPerDay < 0) {
        validationErrors.push({
          field: 'rateLimits.requestsPerDay',
          code: 'INVALID',
          message: 'requestsPerDay must be a non-negative number'
        });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const dataSource = await DataSourceService.registerSource(body);

    return successResponse(dataSource, 201);
  } catch (error) {
    console.error('Error creating data source:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /data-sources
 * 
 * List all data sources with optional filtering.
 * 
 * Requirements: 1.1
 */
export async function listDataSources(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const queryParams = event.queryStringParameters || {};
    const type = queryParams.type as DataSourceType | undefined;
    const status = queryParams.status as DataSourceStatus | undefined;

    // Validate type if provided
    if (type && !isValidDataSourceType(type)) {
      return errorResponse(400, 'Invalid type parameter', 'INVALID_PARAMETER', [
        { field: 'type', code: 'INVALID', message: 'type must be one of: PRICE, NEWS, SENTIMENT, ON_CHAIN' }
      ]);
    }

    // Validate status if provided
    if (status && !isValidDataSourceStatus(status)) {
      return errorResponse(400, 'Invalid status parameter', 'INVALID_PARAMETER', [
        { field: 'status', code: 'INVALID', message: 'status must be one of: ACTIVE, INACTIVE, RATE_LIMITED, ERROR' }
      ]);
    }

    const result = await DataSourceRepository.listDataSources({ type, status });

    return successResponse({
      dataSources: result.items,
      ...(result.lastEvaluatedKey && { nextToken: JSON.stringify(result.lastEvaluatedKey) })
    });
  } catch (error) {
    console.error('Error listing data sources:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /data-sources/{id}
 * 
 * Get a specific data source by ID.
 * 
 * Requirements: 1.1
 */
export async function getDataSource(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.id;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    const dataSource = await DataSourceService.getSource(sourceId);

    if (!dataSource) {
      return errorResponse(404, `Data source not found: ${sourceId}`, 'NOT_FOUND');
    }

    return successResponse(dataSource);
  } catch (error) {
    console.error('Error getting data source:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /data-sources/{id}
 * 
 * Update a data source.
 * 
 * Requirements: 1.2
 */
export async function updateDataSource(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.id;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<Partial<RegisterDataSourceInput> & { status?: DataSourceStatus }>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate type if provided
    if (body.type && !isValidDataSourceType(body.type)) {
      return errorResponse(400, 'Invalid type', 'INVALID_PARAMETER', [
        { field: 'type', code: 'INVALID', message: 'type must be one of: PRICE, NEWS, SENTIMENT, ON_CHAIN' }
      ]);
    }

    // Validate status if provided
    if (body.status && !isValidDataSourceStatus(body.status)) {
      return errorResponse(400, 'Invalid status', 'INVALID_PARAMETER', [
        { field: 'status', code: 'INVALID', message: 'status must be one of: ACTIVE, INACTIVE, RATE_LIMITED, ERROR' }
      ]);
    }

    const dataSource = await DataSourceRepository.updateDataSource(sourceId, body);

    return successResponse(dataSource);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error updating data source:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /data-sources/{id}/status
 * 
 * Update data source status.
 * 
 * Requirements: 1.2
 */
export async function updateDataSourceStatus(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.id;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<{ status: DataSourceStatus }>(event);
    if (!body || !body.status) {
      return errorResponse(400, 'Missing status in request body', 'INVALID_BODY');
    }

    if (!isValidDataSourceStatus(body.status)) {
      return errorResponse(400, 'Invalid status', 'INVALID_PARAMETER', [
        { field: 'status', code: 'INVALID', message: 'status must be one of: ACTIVE, INACTIVE, RATE_LIMITED, ERROR' }
      ]);
    }

    const dataSource = await DataSourceService.updateStatus(sourceId, body.status);

    return successResponse(dataSource);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error updating data source status:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /data-sources/{id}
 * 
 * Delete a data source.
 * 
 * Requirements: 1.1
 */
export async function deleteDataSource(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.id;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    await DataSourceService.deleteSource(sourceId);

    return successResponse({ message: 'Data source deleted successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting data source:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /data-sources/{id}/usage
 * 
 * Get usage statistics for a data source.
 * 
 * Requirements: 1.5
 */
export async function getDataSourceUsage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.id;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    const queryParams = event.queryStringParameters || {};
    const periodMinutes = queryParams.periodMinutes ? parseInt(queryParams.periodMinutes, 10) : 60;

    if (isNaN(periodMinutes) || periodMinutes < 1) {
      return errorResponse(400, 'Invalid periodMinutes parameter', 'INVALID_PARAMETER');
    }

    // Verify source exists
    const dataSource = await DataSourceService.getSource(sourceId);
    if (!dataSource) {
      return errorResponse(404, `Data source not found: ${sourceId}`, 'NOT_FOUND');
    }

    const usage = await DataSourceService.getUsageStats(sourceId, periodMinutes);

    return successResponse({
      sourceId,
      periodMinutes,
      ...usage
    });
  } catch (error) {
    console.error('Error getting data source usage:', error);
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

  // Route: POST /data-sources
  if (method === 'POST' && path === '/data-sources') {
    return createDataSource(event);
  }

  // Route: GET /data-sources
  if (method === 'GET' && path === '/data-sources') {
    return listDataSources(event);
  }

  // Route: GET /data-sources/{id}/usage
  if (method === 'GET' && path.match(/^\/data-sources\/[^/]+\/usage$/)) {
    return getDataSourceUsage(event);
  }

  // Route: PATCH /data-sources/{id}/status
  if (method === 'PATCH' && path.match(/^\/data-sources\/[^/]+\/status$/)) {
    return updateDataSourceStatus(event);
  }

  // Route: GET /data-sources/{id}
  if (method === 'GET' && path.match(/^\/data-sources\/[^/]+$/)) {
    return getDataSource(event);
  }

  // Route: PATCH /data-sources/{id}
  if (method === 'PATCH' && path.match(/^\/data-sources\/[^/]+$/)) {
    return updateDataSource(event);
  }

  // Route: DELETE /data-sources/{id}
  if (method === 'DELETE' && path.match(/^\/data-sources\/[^/]+$/)) {
    return deleteDataSource(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
