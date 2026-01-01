import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StrategyService, ValidationFailedError, InvalidTemplateReferenceError } from '../services/strategy';
import { ResourceNotFoundError } from '../db/access';
import { ValidationError } from '../types/validation';
import { ParameterValue } from '../types/template';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for creating a strategy
 */
interface CreateStrategyRequest {
  templateId: string;
  name: string;
}

/**
 * Request body for updating strategy parameters
 */
interface UpdateParametersRequest {
  parameters: Record<string, ParameterValue>;
  changeDescription?: string;
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
 * POST /strategies
 * 
 * Create a new strategy from a template.
 * 
 * Requirements: 2.1
 */
export async function createStrategy(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<CreateStrategyRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.templateId) {
      return errorResponse(400, 'Missing templateId', 'MISSING_PARAMETER', [
        { field: 'templateId', code: 'REQUIRED', message: 'templateId is required' }
      ]);
    }

    if (!body.name) {
      return errorResponse(400, 'Missing name', 'MISSING_PARAMETER', [
        { field: 'name', code: 'REQUIRED', message: 'name is required' }
      ]);
    }

    const strategy = await StrategyService.createStrategy(
      tenantId,
      body.templateId,
      body.name
    );

    return successResponse(strategy, 201);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error creating strategy:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /strategies
 * 
 * List all strategies for the tenant.
 * 
 * Requirements: 2.6
 */
export async function listStrategies(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategies = await StrategyService.listStrategies(tenantId);

    return successResponse({ strategies });
  } catch (error) {
    console.error('Error listing strategies:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /strategies/{id}
 * 
 * Get a specific strategy by ID.
 * 
 * Requirements: 2.6
 */
export async function getStrategy(
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

    const strategy = await StrategyService.getStrategy(tenantId, strategyId);

    return successResponse(strategy);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting strategy:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /strategies/{id}/parameters
 * 
 * Update strategy parameters.
 * 
 * Requirements: 2.4
 */
export async function updateParameters(
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

    const body = parseBody<UpdateParametersRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.parameters || typeof body.parameters !== 'object') {
      return errorResponse(400, 'Missing or invalid parameters', 'MISSING_PARAMETER', [
        { field: 'parameters', code: 'REQUIRED', message: 'parameters object is required' }
      ]);
    }

    const strategy = await StrategyService.updateParameters(
      tenantId,
      strategyId,
      body.parameters,
      body.changeDescription
    );

    return successResponse(strategy);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof ValidationFailedError) {
      return errorResponse(
        400,
        error.message,
        'VALIDATION_FAILED',
        error.validationResult.errors
      );
    }
    if (error instanceof InvalidTemplateReferenceError) {
      return errorResponse(400, error.message, 'INVALID_TEMPLATE_REFERENCE');
    }
    console.error('Error updating parameters:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /strategies/{id}
 * 
 * Delete a strategy.
 */
export async function deleteStrategy(
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

    // Import StrategyRepository for delete operation
    const { StrategyRepository } = await import('../repositories/strategy');
    await StrategyRepository.deleteStrategy(tenantId, strategyId);

    return successResponse({ message: 'Strategy deleted successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting strategy:', error);
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

  // Route: POST /strategies
  if (method === 'POST' && path === '/strategies') {
    return createStrategy(event);
  }

  // Route: GET /strategies
  if (method === 'GET' && path === '/strategies') {
    return listStrategies(event);
  }

  // Route: PATCH /strategies/{id}/parameters
  if (method === 'PATCH' && path.match(/^\/strategies\/[^/]+\/parameters$/)) {
    return updateParameters(event);
  }

  // Route: GET /strategies/{id}
  if (method === 'GET' && path.match(/^\/strategies\/[^/]+$/)) {
    return getStrategy(event);
  }

  // Route: DELETE /strategies/{id}
  if (method === 'DELETE' && path.match(/^\/strategies\/[^/]+$/)) {
    return deleteStrategy(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
