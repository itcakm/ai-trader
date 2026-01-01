import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
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
 * POST /deployments
 * 
 * Create a new deployment for a strategy.
 * 
 * Requirements: 4.1, 4.5
 */
export async function createDeployment(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

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

    return successResponse(deployment, 201);
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
 */
export async function listDeployments(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    // Optional filter by strategyId
    const strategyId = event.queryStringParameters?.strategyId;

    const deployments = await DeploymentService.listDeployments(tenantId, strategyId);

    return successResponse({ deployments });
  } catch (error) {
    console.error('Error listing deployments:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /deployments/{id}
 * 
 * Get a specific deployment by ID.
 */
export async function getDeployment(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const deploymentId = event.pathParameters?.id;
    if (!deploymentId) {
      return errorResponse(400, 'Missing deployment ID', 'MISSING_PARAMETER');
    }

    const deployment = await DeploymentService.getDeployment(tenantId, deploymentId);

    return successResponse(deployment);
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
 * 
 * Requirements: 4.6, 4.7
 */
export async function updateDeploymentState(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

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

    return successResponse(deployment);
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
