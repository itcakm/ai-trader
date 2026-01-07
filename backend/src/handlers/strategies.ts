import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { StrategyService, ValidationFailedError, InvalidTemplateReferenceError } from '../services/strategy';
import { ResourceNotFoundError, TenantContext } from '../db/access';
import { ValidationError } from '../types/validation';
import { ParameterValue } from '../types/template';
import { 
  requireTenantIsolation, 
  TenantIsolatedEvent,
  createTenantScopedResponse 
} from '../middleware/tenant-isolation';
import { requirePermission } from '../middleware/require-role';
import { PERMISSIONS } from '../types/rbac';
import { AuthenticatedEvent } from '../middleware/require-auth';

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
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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
 * Extract tenant ID from JWT context (NOT from headers)
 * Requirements: 5.1, 5.4
 * 
 * @deprecated Use event.tenantContext.tenantId from TenantIsolatedEvent instead
 */
function getTenantId(event: APIGatewayProxyEvent): string | null {
  // Check if this is a tenant-isolated event with JWT context
  const isolatedEvent = event as TenantIsolatedEvent;
  if (isolatedEvent.tenantContext?.tenantId) {
    return isolatedEvent.tenantContext.tenantId;
  }
  
  // Fallback to header for backward compatibility (will be removed)
  // WARNING: This should not be trusted in production
  console.warn('SECURITY WARNING: Using X-Tenant-Id header instead of JWT. This is deprecated.');
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
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 2.1, 5.4, 5.6
 */
export async function createStrategy(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    // Requirements: 5.4 - Do not trust X-Tenant-Id header
    const tenantId = event.tenantContext.tenantId;

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

    // Requirements: 5.6 - Auto-set tenantId on resource creation
    const strategy = await StrategyService.createStrategy(
      tenantId,
      body.templateId,
      body.name
    );

    return createTenantScopedResponse(strategy, tenantId, 201);
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
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 2.6, 5.2
 */
export async function listStrategies(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

    const strategies = await StrategyService.listStrategies(tenantId);

    return createTenantScopedResponse({ strategies }, tenantId);
  } catch (error) {
    console.error('Error listing strategies:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /strategies/{id}
 * 
 * Get a specific strategy by ID.
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 2.6, 5.2, 5.3
 */
export async function getStrategy(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

    const strategyId = event.pathParameters?.id;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    const strategy = await StrategyService.getStrategy(tenantId, strategyId);

    return createTenantScopedResponse(strategy, tenantId);
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
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 2.4, 5.2, 5.3
 */
export async function updateParameters(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

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

    return createTenantScopedResponse(strategy, tenantId);
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
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 5.2, 5.3
 */
export async function deleteStrategy(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

    const strategyId = event.pathParameters?.id;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    // Import StrategyRepository for delete operation
    const { StrategyRepository } = await import('../repositories/strategy');
    await StrategyRepository.deleteStrategy(tenantId, strategyId);

    return createTenantScopedResponse({ message: 'Strategy deleted successfully' }, tenantId);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting strategy:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Internal handler that routes requests based on HTTP method and path
 * This is wrapped by requireTenantIsolation for authentication and tenant isolation
 */
async function routeRequest(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  // Route: POST /strategies - requires write:strategies permission
  if (method === 'POST' && path === '/strategies') {
    return createStrategy(event);
  }

  // Route: GET /strategies - requires read:strategies permission
  if (method === 'GET' && path === '/strategies') {
    return listStrategies(event);
  }

  // Route: PATCH /strategies/{id}/parameters - requires write:strategies permission
  if (method === 'PATCH' && path.match(/^\/strategies\/[^/]+\/parameters$/)) {
    return updateParameters(event);
  }

  // Route: GET /strategies/{id} - requires read:strategies permission
  if (method === 'GET' && path.match(/^\/strategies\/[^/]+$/)) {
    return getStrategy(event);
  }

  // Route: DELETE /strategies/{id} - requires delete:strategies permission
  if (method === 'DELETE' && path.match(/^\/strategies\/[^/]+$/)) {
    return deleteStrategy(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}

/**
 * Permission-protected route handlers
 * Requirements: 6.7, 6.8
 */

// Read operations require read:strategies permission
const readStrategiesHandler = requirePermission(
  [PERMISSIONS.STRATEGIES_READ],
  async (event: AuthenticatedEvent, context: Context) => {
    const isolatedHandler = requireTenantIsolation(async (isolatedEvent: TenantIsolatedEvent) => {
      const path = isolatedEvent.path;
      if (path === '/strategies') {
        return listStrategies(isolatedEvent);
      }
      return getStrategy(isolatedEvent);
    });
    return isolatedHandler(event, context);
  }
);

// Write operations require write:strategies permission
const writeStrategiesHandler = requirePermission(
  [PERMISSIONS.STRATEGIES_WRITE],
  async (event: AuthenticatedEvent, context: Context) => {
    const isolatedHandler = requireTenantIsolation(async (isolatedEvent: TenantIsolatedEvent) => {
      const path = isolatedEvent.path;
      if (path === '/strategies') {
        return createStrategy(isolatedEvent);
      }
      return updateParameters(isolatedEvent);
    });
    return isolatedHandler(event, context);
  }
);

// Delete operations require delete:strategies permission
const deleteStrategiesHandler = requirePermission(
  [PERMISSIONS.STRATEGIES_DELETE],
  async (event: AuthenticatedEvent, context: Context) => {
    const isolatedHandler = requireTenantIsolation(deleteStrategy);
    return isolatedHandler(event, context);
  }
);

/**
 * Main handler that routes requests based on HTTP method and path
 * Wrapped with requireTenantIsolation for JWT-based tenant isolation
 * 
 * Requirements: 5.1, 5.4, 6.7, 6.8
 * - Extract tenantId from JWT (not headers)
 * - Auto-set tenantId on resource creation
 * - Check permissions before executing operations
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle CORS preflight (no auth required)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  const path = event.path;
  const method = event.httpMethod;

  // Route to permission-protected handlers based on operation type
  // Requirements: 6.7, 6.8 - Check permissions before executing operations

  // Read operations (GET)
  if (method === 'GET') {
    return readStrategiesHandler(event, context);
  }

  // Write operations (POST, PATCH)
  if (method === 'POST' || method === 'PATCH') {
    return writeStrategiesHandler(event, context);
  }

  // Delete operations (DELETE)
  if (method === 'DELETE') {
    return deleteStrategiesHandler(event, context);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
