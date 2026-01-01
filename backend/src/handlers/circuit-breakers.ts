import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CircuitBreakerService, AuthenticationRequiredError, CircuitBreakerError } from '../services/circuit-breaker';
import { TenantAccessDeniedError, ResourceNotFoundError } from '../db/access';
import { CircuitBreakerInput, CircuitBreakerCondition, CircuitBreakerScope } from '../types/circuit-breaker';

/**
 * Circuit Breaker API Handlers
 * 
 * Implements CRUD and reset endpoints for circuit breakers.
 * 
 * Requirements: 5.1, 5.6
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


interface CreateCircuitBreakerRequest {
  name: string;
  condition: CircuitBreakerCondition;
  scope: CircuitBreakerScope;
  scopeId?: string;
  cooldownMinutes: number;
  autoResetEnabled: boolean;
}

interface UpdateCircuitBreakerRequest {
  name?: string;
  condition?: CircuitBreakerCondition;
  scope?: CircuitBreakerScope;
  scopeId?: string;
  cooldownMinutes?: number;
  autoResetEnabled?: boolean;
}

interface ResetCircuitBreakerRequest {
  authToken: string;
}

function validateCondition(condition: CircuitBreakerCondition): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  
  if (!condition || !condition.type) {
    errors.push({ field: 'condition.type', message: 'condition.type is required' });
    return errors;
  }

  switch (condition.type) {
    case 'LOSS_RATE':
      if (condition.lossPercent === undefined || condition.lossPercent < 0) {
        errors.push({ field: 'condition.lossPercent', message: 'lossPercent must be a non-negative number' });
      }
      if (condition.timeWindowMinutes === undefined || condition.timeWindowMinutes <= 0) {
        errors.push({ field: 'condition.timeWindowMinutes', message: 'timeWindowMinutes must be a positive number' });
      }
      break;
    case 'CONSECUTIVE_FAILURES':
      if (condition.count === undefined || condition.count <= 0) {
        errors.push({ field: 'condition.count', message: 'count must be a positive number' });
      }
      break;
    case 'PRICE_DEVIATION':
      if (condition.deviationPercent === undefined || condition.deviationPercent < 0) {
        errors.push({ field: 'condition.deviationPercent', message: 'deviationPercent must be a non-negative number' });
      }
      if (condition.timeWindowMinutes === undefined || condition.timeWindowMinutes <= 0) {
        errors.push({ field: 'condition.timeWindowMinutes', message: 'timeWindowMinutes must be a positive number' });
      }
      break;
    case 'ERROR_RATE':
      if (condition.errorPercent === undefined || condition.errorPercent < 0) {
        errors.push({ field: 'condition.errorPercent', message: 'errorPercent must be a non-negative number' });
      }
      if (condition.sampleSize === undefined || condition.sampleSize <= 0) {
        errors.push({ field: 'condition.sampleSize', message: 'sampleSize must be a positive number' });
      }
      break;
    default:
      errors.push({ field: 'condition.type', message: 'Invalid condition type' });
  }

  return errors;
}

function validateCreateRequest(body: CreateCircuitBreakerRequest): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  
  if (!body.name || body.name.trim() === '') {
    errors.push({ field: 'name', message: 'name is required' });
  }
  
  if (!body.scope || !['STRATEGY', 'ASSET', 'PORTFOLIO'].includes(body.scope)) {
    errors.push({ field: 'scope', message: 'scope must be STRATEGY, ASSET, or PORTFOLIO' });
  }
  
  if ((body.scope === 'STRATEGY' || body.scope === 'ASSET') && !body.scopeId) {
    errors.push({ field: 'scopeId', message: 'scopeId is required for STRATEGY or ASSET scope' });
  }
  
  if (body.cooldownMinutes === undefined || body.cooldownMinutes < 0) {
    errors.push({ field: 'cooldownMinutes', message: 'cooldownMinutes must be a non-negative number' });
  }
  
  if (body.autoResetEnabled === undefined) {
    errors.push({ field: 'autoResetEnabled', message: 'autoResetEnabled is required' });
  }

  errors.push(...validateCondition(body.condition));
  
  return errors;
}


/**
 * POST /circuit-breakers
 * Create a new circuit breaker
 * 
 * Requirements: 5.1
 */
export async function createCircuitBreaker(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<CreateCircuitBreakerRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors = validateCreateRequest(body);
    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const input: CircuitBreakerInput = {
      name: body.name,
      condition: body.condition,
      scope: body.scope,
      scopeId: body.scopeId,
      cooldownMinutes: body.cooldownMinutes,
      autoResetEnabled: body.autoResetEnabled
    };

    const breaker = await CircuitBreakerService.createBreaker(tenantId, input);
    return successResponse(breaker, 201);
  } catch (error) {
    console.error('Error creating circuit breaker:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /circuit-breakers
 * List all circuit breakers for the tenant
 * 
 * Requirements: 5.1
 */
export async function listCircuitBreakers(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const breakers = await CircuitBreakerService.listBreakers(tenantId);
    return successResponse({ breakers });
  } catch (error) {
    console.error('Error listing circuit breakers:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /circuit-breakers/{id}
 * Get a specific circuit breaker by ID
 * 
 * Requirements: 5.1
 */
export async function getCircuitBreaker(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const breakerId = event.pathParameters?.id;
    if (!breakerId) {
      return errorResponse(400, 'Missing breaker ID', 'MISSING_PARAMETER');
    }

    const breaker = await CircuitBreakerService.getBreaker(tenantId, breakerId);
    if (!breaker) {
      return errorResponse(404, 'Circuit breaker not found', 'NOT_FOUND');
    }

    return successResponse(breaker);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting circuit breaker:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PUT /circuit-breakers/{id}
 * Update a circuit breaker
 * 
 * Requirements: 5.1
 */
export async function updateCircuitBreaker(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const breakerId = event.pathParameters?.id;
    if (!breakerId) {
      return errorResponse(400, 'Missing breaker ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<UpdateCircuitBreakerRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate condition if provided
    if (body.condition) {
      const conditionErrors = validateCondition(body.condition);
      if (conditionErrors.length > 0) {
        return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', conditionErrors);
      }
    }

    const breaker = await CircuitBreakerService.updateBreaker(tenantId, breakerId, body);
    return successResponse(breaker);
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error updating circuit breaker:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * DELETE /circuit-breakers/{id}
 * Delete a circuit breaker
 * 
 * Requirements: 5.1
 */
export async function deleteCircuitBreaker(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const breakerId = event.pathParameters?.id;
    if (!breakerId) {
      return errorResponse(400, 'Missing breaker ID', 'MISSING_PARAMETER');
    }

    await CircuitBreakerService.deleteBreaker(tenantId, breakerId);
    return successResponse({ message: 'Circuit breaker deleted successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error deleting circuit breaker:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /circuit-breakers/{id}/reset
 * Reset a circuit breaker to CLOSED state
 * 
 * Requires authentication token for security.
 * 
 * Requirements: 5.6
 */
export async function resetCircuitBreaker(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const breakerId = event.pathParameters?.id;
    if (!breakerId) {
      return errorResponse(400, 'Missing breaker ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<ResetCircuitBreakerRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.authToken || body.authToken.trim() === '') {
      return errorResponse(400, 'Missing authToken', 'MISSING_PARAMETER', [
        { field: 'authToken', message: 'authToken is required for circuit breaker reset' }
      ]);
    }

    const breaker = await CircuitBreakerService.resetBreaker(tenantId, breakerId, body.authToken);

    return successResponse({
      message: 'Circuit breaker reset successfully',
      breaker
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return errorResponse(401, error.message, 'AUTHENTICATION_REQUIRED');
    }
    if (error instanceof CircuitBreakerError) {
      if (error.message.includes('not found')) {
        return errorResponse(404, error.message, 'NOT_FOUND');
      }
      return errorResponse(400, error.message, 'INVALID_STATE');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error resetting circuit breaker:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /circuit-breakers/{id}/trip
 * Manually trip a circuit breaker (for testing or emergency)
 * 
 * Requirements: 5.2
 */
export async function tripCircuitBreaker(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const breakerId = event.pathParameters?.id;
    if (!breakerId) {
      return errorResponse(400, 'Missing breaker ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<{ reason: string }>(event);
    const reason = body?.reason || 'Manual trip';

    const breaker = await CircuitBreakerService.tripBreaker(tenantId, breakerId, reason);

    return successResponse({
      message: 'Circuit breaker tripped',
      breaker
    });
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      if (error.message.includes('not found')) {
        return errorResponse(404, error.message, 'NOT_FOUND');
      }
      return errorResponse(400, error.message, 'INVALID_STATE');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error tripping circuit breaker:', error);
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

  // POST /circuit-breakers
  if (method === 'POST' && path === '/circuit-breakers') {
    return createCircuitBreaker(event);
  }

  // GET /circuit-breakers
  if (method === 'GET' && path === '/circuit-breakers') {
    return listCircuitBreakers(event);
  }

  // GET /circuit-breakers/{id}
  if (method === 'GET' && path.match(/^\/circuit-breakers\/[^/]+$/)) {
    return getCircuitBreaker(event);
  }

  // PUT /circuit-breakers/{id}
  if (method === 'PUT' && path.match(/^\/circuit-breakers\/[^/]+$/)) {
    return updateCircuitBreaker(event);
  }

  // DELETE /circuit-breakers/{id}
  if (method === 'DELETE' && path.match(/^\/circuit-breakers\/[^/]+$/)) {
    return deleteCircuitBreaker(event);
  }

  // POST /circuit-breakers/{id}/reset
  if (method === 'POST' && path.match(/^\/circuit-breakers\/[^/]+\/reset$/)) {
    return resetCircuitBreaker(event);
  }

  // POST /circuit-breakers/{id}/trip
  if (method === 'POST' && path.match(/^\/circuit-breakers\/[^/]+\/trip$/)) {
    return tripCircuitBreaker(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
