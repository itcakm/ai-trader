import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { 
  DeploymentService, 
  DeploymentValidationError, 
  InvalidTemplateReferenceError,
  InvalidStateTransitionError,
  RiskControls
} from '../services/deployment';
import { ResourceNotFoundError } from '../db/access';
import { ValidationError } from '../types/validation';
import { DeploymentConfig, DeploymentState } from '../types/deployment';
import { 
  requireTenantIsolation, 
  TenantIsolatedEvent,
  createTenantScopedResponse 
} from '../middleware/tenant-isolation';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for creating a deployment
 */
interface CreateDeploymentRequest {
  config: DeploymentConfig;
  riskControls?: RiskControls;
}

/**
 * Request body for updating deployment state
 */
interface UpdateStateRequest {
  state: DeploymentState;
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
 * Valid deployment states
 */
const VALID_DEPLOYMENT_STATES: DeploymentState[] = [
  'PENDING', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'ERROR'
];

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
 * POST /deployments
 * 
 * Create a new deployment for a strategy.
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 4.1, 4.5, 5.4, 5.6
 */
export async function createDeployment(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

    const body = parseBody<CreateDeploymentRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.config) {
      return errorResponse(400, 'Missing config', 'MISSING_PARAMETER', [
        { field: 'config', code: 'REQUIRED', message: 'config is required' }
      ]);
    }

    if (!body.config.strategyId) {
      return errorResponse(400, 'Missing strategyId', 'MISSING_PARAMETER', [
        { field: 'config.strategyId', code: 'REQUIRED', message: 'strategyId is required' }
      ]);
    }

    if (!body.config.mode) {
      return errorResponse(400, 'Missing mode', 'MISSING_PARAMETER', [
        { field: 'config.mode', code: 'REQUIRED', message: 'mode is required' }
      ]);
    }

    const validModes = ['BACKTEST', 'PAPER', 'LIVE'];
    if (!validModes.includes(body.config.mode)) {
      return errorResponse(400, 'Invalid deployment mode', 'INVALID_PARAMETER', [
        { 
          field: 'config.mode', 
          code: 'INVALID', 
          message: `mode must be one of: ${validModes.join(', ')}` 
        }
      ]);
    }

    const deployment = await DeploymentService.deploy(
      tenantId,
      body.config,
      body.riskControls
    );

    return createTenantScopedResponse(deployment, tenantId, 201);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof DeploymentValidationError) {
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
    console.error('Error creating deployment:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /deployments
 * 
 * List all deployments for the tenant.
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 5.2
 */
export async function listDeployments(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

    // Optional filter by strategyId
    const strategyId = event.queryStringParameters?.strategyId;

    const deployments = await DeploymentService.listDeployments(tenantId, strategyId);

    return createTenantScopedResponse({ deployments }, tenantId);
  } catch (error) {
    console.error('Error listing deployments:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /deployments/{id}
 * 
 * Get a specific deployment by ID.
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 5.2, 5.3
 */
export async function getDeployment(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

    const deploymentId = event.pathParameters?.id;
    if (!deploymentId) {
      return errorResponse(400, 'Missing deployment ID', 'MISSING_PARAMETER');
    }

    const deployment = await DeploymentService.getDeployment(tenantId, deploymentId);

    return createTenantScopedResponse(deployment, tenantId);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting deployment:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /deployments/{id}/state
 * 
 * Update deployment state.
 * Tenant ID is automatically extracted from JWT.
 * 
 * Requirements: 4.6, 4.7, 5.2, 5.3
 */
export async function updateDeploymentState(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Get tenant ID from JWT context (not headers)
    const tenantId = event.tenantContext.tenantId;

    const deploymentId = event.pathParameters?.id;
    if (!deploymentId) {
      return errorResponse(400, 'Missing deployment ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<UpdateStateRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.state) {
      return errorResponse(400, 'Missing state', 'MISSING_PARAMETER', [
        { field: 'state', code: 'REQUIRED', message: 'state is required' }
      ]);
    }

    if (!VALID_DEPLOYMENT_STATES.includes(body.state)) {
      return errorResponse(400, 'Invalid state', 'INVALID_PARAMETER', [
        { 
          field: 'state', 
          code: 'INVALID', 
          message: `state must be one of: ${VALID_DEPLOYMENT_STATES.join(', ')}` 
        }
      ]);
    }

    const deployment = await DeploymentService.updateState(
      tenantId,
      deploymentId,
      body.state
    );

    return createTenantScopedResponse(deployment, tenantId);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof InvalidStateTransitionError) {
      return errorResponse(409, error.message, 'INVALID_STATE_TRANSITION');
    }
    console.error('Error updating deployment state:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Internal handler that routes requests based on HTTP method and path
 */
async function routeRequest(
  event: TenantIsolatedEvent
): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  // Route: POST /deployments
  if (method === 'POST' && path === '/deployments') {
    return createDeployment(event);
  }

  // Route: GET /deployments
  if (method === 'GET' && path === '/deployments') {
    return listDeployments(event);
  }

  // Route: PATCH /deployments/{id}/state
  if (method === 'PATCH' && path.match(/^\/deployments\/[^/]+\/state$/)) {
    return updateDeploymentState(event);
  }

  // Route: GET /deployments/{id}
  if (method === 'GET' && path.match(/^\/deployments\/[^/]+$/)) {
    return getDeployment(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}

/**
 * Main handler that routes requests based on HTTP method and path
 * Wrapped with requireTenantIsolation for JWT-based tenant isolation
 * 
 * Requirements: 5.1, 5.4
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

  // Apply tenant isolation middleware
  const isolatedHandler = requireTenantIsolation(routeRequest);
  return isolatedHandler(event, context);
}
