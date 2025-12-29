import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PerformanceService } from '../services/performance';
import { ValidationError } from '../types/validation';
import { PerformancePeriod } from '../types/performance';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for comparing models
 */
interface CompareModelsRequestBody {
  modelConfigIds: string[];
  period?: PerformancePeriod;
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
 * Valid performance periods
 */
const VALID_PERIODS: PerformancePeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

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
 * GET /performance/{modelId}
 * 
 * Get performance metrics for a specific model.
 * 
 * Requirements: 6.4
 */
export async function getModelPerformance(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const modelId = event.pathParameters?.modelId;
    if (!modelId) {
      return errorResponse(400, 'Missing model ID', 'MISSING_PARAMETER');
    }

    // Get period from query params, default to DAILY
    const periodParam = event.queryStringParameters?.period as PerformancePeriod | undefined;
    const period: PerformancePeriod = periodParam && VALID_PERIODS.includes(periodParam) 
      ? periodParam 
      : 'DAILY';

    const performance = await PerformanceService.getPerformance(tenantId, modelId, period);
    
    if (!performance) {
      return errorResponse(404, `Performance data not found for model: ${modelId}`, 'NOT_FOUND');
    }

    return successResponse(performance);
  } catch (error) {
    console.error('Error getting model performance:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /performance/{modelId}/history
 * 
 * Get performance history for a specific model.
 * 
 * Requirements: 6.4, 6.5
 */
export async function getModelPerformanceHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const modelId = event.pathParameters?.modelId;
    if (!modelId) {
      return errorResponse(400, 'Missing model ID', 'MISSING_PARAMETER');
    }

    // Get period from query params, default to DAILY
    const periodParam = event.queryStringParameters?.period as PerformancePeriod | undefined;
    const period: PerformancePeriod = periodParam && VALID_PERIODS.includes(periodParam) 
      ? periodParam 
      : 'DAILY';

    // Get limit from query params, default to 30
    const limitStr = event.queryStringParameters?.limit;
    const limit = limitStr ? parseInt(limitStr, 10) : 30;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return errorResponse(400, 'Invalid limit', 'INVALID_PARAMETER', [
        { field: 'limit', code: 'INVALID', message: 'limit must be between 1 and 100' }
      ]);
    }

    const history = await PerformanceService.getPerformanceHistory(tenantId, modelId, period, limit);

    return successResponse({ history });
  } catch (error) {
    console.error('Error getting model performance history:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /performance/compare
 * 
 * Compare performance across multiple models.
 * 
 * Requirements: 6.4, 6.5
 */
export async function compareModelsGet(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    // Get model IDs from query params (comma-separated)
    const modelIdsParam = event.queryStringParameters?.modelIds;
    if (!modelIdsParam) {
      return errorResponse(400, 'Missing modelIds', 'MISSING_PARAMETER', [
        { field: 'modelIds', code: 'REQUIRED', message: 'modelIds query parameter is required (comma-separated)' }
      ]);
    }

    const modelConfigIds = modelIdsParam.split(',').map(id => id.trim()).filter(Boolean);
    if (modelConfigIds.length === 0) {
      return errorResponse(400, 'Invalid modelIds', 'INVALID_PARAMETER', [
        { field: 'modelIds', code: 'INVALID', message: 'at least one model ID is required' }
      ]);
    }

    if (modelConfigIds.length > 10) {
      return errorResponse(400, 'Too many models', 'INVALID_PARAMETER', [
        { field: 'modelIds', code: 'INVALID', message: 'cannot compare more than 10 models at once' }
      ]);
    }

    // Get period from query params, default to DAILY
    const periodParam = event.queryStringParameters?.period as PerformancePeriod | undefined;
    const period: PerformancePeriod = periodParam && VALID_PERIODS.includes(periodParam) 
      ? periodParam 
      : 'DAILY';

    const comparison = await PerformanceService.compareModels(tenantId, modelConfigIds, period);

    return successResponse({ 
      comparison,
      period,
      modelCount: comparison.length
    });
  } catch (error) {
    console.error('Error comparing models:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /performance/compare
 * 
 * Compare performance across multiple models (POST version for larger requests).
 * 
 * Requirements: 6.4, 6.5
 */
export async function compareModelsPost(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<CompareModelsRequestBody>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate model IDs
    const validationErrors: ValidationError[] = [];

    if (!body.modelConfigIds || !Array.isArray(body.modelConfigIds)) {
      validationErrors.push({ field: 'modelConfigIds', code: 'REQUIRED', message: 'modelConfigIds array is required' });
    } else if (body.modelConfigIds.length === 0) {
      validationErrors.push({ field: 'modelConfigIds', code: 'INVALID', message: 'at least one model ID is required' });
    } else if (body.modelConfigIds.length > 10) {
      validationErrors.push({ field: 'modelConfigIds', code: 'INVALID', message: 'cannot compare more than 10 models at once' });
    }

    if (body.period && !VALID_PERIODS.includes(body.period)) {
      validationErrors.push({ 
        field: 'period', 
        code: 'INVALID', 
        message: `period must be one of: ${VALID_PERIODS.join(', ')}` 
      });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const period: PerformancePeriod = body.period ?? 'DAILY';
    const comparison = await PerformanceService.compareModels(tenantId, body.modelConfigIds, period);

    return successResponse({ 
      comparison,
      period,
      modelCount: comparison.length
    });
  } catch (error) {
    console.error('Error comparing models:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /performance/{modelId}/predictions
 * 
 * Get unvalidated predictions for a model.
 */
export async function getUnvalidatedPredictions(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const modelId = event.pathParameters?.modelId;
    if (!modelId) {
      return errorResponse(400, 'Missing model ID', 'MISSING_PARAMETER');
    }

    // Get limit from query params, default to 100
    const limitStr = event.queryStringParameters?.limit;
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    if (isNaN(limit) || limit < 1 || limit > 500) {
      return errorResponse(400, 'Invalid limit', 'INVALID_PARAMETER', [
        { field: 'limit', code: 'INVALID', message: 'limit must be between 1 and 500' }
      ]);
    }

    const predictions = await PerformanceService.getUnvalidatedPredictions(tenantId, modelId, limit);

    return successResponse({ predictions });
  } catch (error) {
    console.error('Error getting unvalidated predictions:', error);
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

  // Route: GET /performance/compare
  if (method === 'GET' && path === '/performance/compare') {
    return compareModelsGet(event);
  }

  // Route: POST /performance/compare
  if (method === 'POST' && path === '/performance/compare') {
    return compareModelsPost(event);
  }

  // Route: GET /performance/{modelId}/history
  if (method === 'GET' && path.match(/^\/performance\/[^/]+\/history$/)) {
    return getModelPerformanceHistory(event);
  }

  // Route: GET /performance/{modelId}/predictions
  if (method === 'GET' && path.match(/^\/performance\/[^/]+\/predictions$/)) {
    return getUnvalidatedPredictions(event);
  }

  // Route: GET /performance/{modelId}
  if (method === 'GET' && path.match(/^\/performance\/[^/]+$/)) {
    return getModelPerformance(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
