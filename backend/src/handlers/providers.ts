import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ProviderRepository, CreateProviderInput } from '../repositories/provider';
import { ProviderStatusService } from '../services/provider-status';
import { ResourceNotFoundError } from '../db/access';
import { ValidationError } from '../types/validation';
import { ProviderType, ProviderStatus } from '../types/provider';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for creating a provider
 */
interface CreateProviderRequest {
  providerId: string;
  type: ProviderType;
  name: string;
  apiEndpoint: string;
  authMethod: 'API_KEY' | 'OAUTH' | 'IAM';
  supportedModels: string[];
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay: number;
  };
}

/**
 * Request body for updating provider status
 */
interface UpdateStatusRequest {
  status: ProviderStatus;
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
 * Valid provider types
 */
const VALID_PROVIDER_TYPES: ProviderType[] = ['GEMINI', 'OPENAI', 'DEEPSEEK', 'ANTHROPIC', 'CUSTOM'];

/**
 * Valid provider statuses
 */
const VALID_PROVIDER_STATUSES: ProviderStatus[] = ['ACTIVE', 'INACTIVE', 'RATE_LIMITED', 'ERROR'];

/**
 * Valid auth methods
 */
const VALID_AUTH_METHODS = ['API_KEY', 'OAUTH', 'IAM'] as const;

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
 * GET /providers
 * 
 * List all AI providers with optional filtering by type or status.
 * 
 * Requirements: 1.1
 */
export async function listProviders(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const type = event.queryStringParameters?.type as ProviderType | undefined;
    const status = event.queryStringParameters?.status as ProviderStatus | undefined;
    const limitStr = event.queryStringParameters?.limit;
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    // Validate type if provided
    if (type && !VALID_PROVIDER_TYPES.includes(type)) {
      return errorResponse(400, 'Invalid provider type', 'INVALID_PARAMETER', [
        { field: 'type', code: 'INVALID', message: `type must be one of: ${VALID_PROVIDER_TYPES.join(', ')}` }
      ]);
    }

    // Validate status if provided
    if (status && !VALID_PROVIDER_STATUSES.includes(status)) {
      return errorResponse(400, 'Invalid provider status', 'INVALID_PARAMETER', [
        { field: 'status', code: 'INVALID', message: `status must be one of: ${VALID_PROVIDER_STATUSES.join(', ')}` }
      ]);
    }

    const result = await ProviderRepository.listProviders({ type, status, limit });

    return successResponse({
      providers: result.items,
      lastEvaluatedKey: result.lastEvaluatedKey
    });
  } catch (error) {
    console.error('Error listing providers:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /providers/{id}
 * 
 * Get a specific provider by ID.
 * 
 * Requirements: 1.1
 */
export async function getProvider(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const providerId = event.pathParameters?.id;
    if (!providerId) {
      return errorResponse(400, 'Missing provider ID', 'MISSING_PARAMETER');
    }

    const provider = await ProviderRepository.getProvider(providerId);
    if (!provider) {
      return errorResponse(404, `Provider not found: ${providerId}`, 'NOT_FOUND');
    }

    return successResponse(provider);
  } catch (error) {
    console.error('Error getting provider:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /providers
 * 
 * Register a new AI provider.
 * 
 * Requirements: 1.1, 1.2
 */
export async function createProvider(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const body = parseBody<CreateProviderRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.providerId) {
      validationErrors.push({ field: 'providerId', code: 'REQUIRED', message: 'providerId is required' });
    }

    if (!body.type) {
      validationErrors.push({ field: 'type', code: 'REQUIRED', message: 'type is required' });
    } else if (!VALID_PROVIDER_TYPES.includes(body.type)) {
      validationErrors.push({ 
        field: 'type', 
        code: 'INVALID', 
        message: `type must be one of: ${VALID_PROVIDER_TYPES.join(', ')}` 
      });
    }

    if (!body.name) {
      validationErrors.push({ field: 'name', code: 'REQUIRED', message: 'name is required' });
    }

    if (!body.apiEndpoint) {
      validationErrors.push({ field: 'apiEndpoint', code: 'REQUIRED', message: 'apiEndpoint is required' });
    }

    if (!body.authMethod) {
      validationErrors.push({ field: 'authMethod', code: 'REQUIRED', message: 'authMethod is required' });
    } else if (!VALID_AUTH_METHODS.includes(body.authMethod)) {
      validationErrors.push({ 
        field: 'authMethod', 
        code: 'INVALID', 
        message: `authMethod must be one of: ${VALID_AUTH_METHODS.join(', ')}` 
      });
    }

    if (!body.supportedModels || !Array.isArray(body.supportedModels)) {
      validationErrors.push({ field: 'supportedModels', code: 'REQUIRED', message: 'supportedModels array is required' });
    } else if (body.supportedModels.length === 0) {
      validationErrors.push({ field: 'supportedModels', code: 'INVALID', message: 'supportedModels must contain at least one model' });
    }

    if (!body.rateLimits) {
      validationErrors.push({ field: 'rateLimits', code: 'REQUIRED', message: 'rateLimits is required' });
    } else {
      if (typeof body.rateLimits.requestsPerMinute !== 'number' || body.rateLimits.requestsPerMinute <= 0) {
        validationErrors.push({ field: 'rateLimits.requestsPerMinute', code: 'INVALID', message: 'requestsPerMinute must be a positive number' });
      }
      if (typeof body.rateLimits.tokensPerMinute !== 'number' || body.rateLimits.tokensPerMinute <= 0) {
        validationErrors.push({ field: 'rateLimits.tokensPerMinute', code: 'INVALID', message: 'tokensPerMinute must be a positive number' });
      }
      if (typeof body.rateLimits.requestsPerDay !== 'number' || body.rateLimits.requestsPerDay <= 0) {
        validationErrors.push({ field: 'rateLimits.requestsPerDay', code: 'INVALID', message: 'requestsPerDay must be a positive number' });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const input: CreateProviderInput = {
      providerId: body.providerId,
      type: body.type,
      name: body.name,
      apiEndpoint: body.apiEndpoint,
      authMethod: body.authMethod,
      supportedModels: body.supportedModels,
      rateLimits: body.rateLimits
    };

    const provider = await ProviderRepository.createProvider(input);

    return successResponse(provider, 201);
  } catch (error) {
    // Handle duplicate provider ID
    if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
      return errorResponse(409, 'Provider with this ID already exists', 'CONFLICT');
    }
    console.error('Error creating provider:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /providers/{id}/status
 * 
 * Update the status of a provider.
 * 
 * Requirements: 1.4
 */
export async function updateProviderStatus(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const providerId = event.pathParameters?.id;
    if (!providerId) {
      return errorResponse(400, 'Missing provider ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<UpdateStatusRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.status) {
      return errorResponse(400, 'Missing status', 'MISSING_PARAMETER', [
        { field: 'status', code: 'REQUIRED', message: 'status is required' }
      ]);
    }

    if (!VALID_PROVIDER_STATUSES.includes(body.status)) {
      return errorResponse(400, 'Invalid status', 'INVALID_PARAMETER', [
        { field: 'status', code: 'INVALID', message: `status must be one of: ${VALID_PROVIDER_STATUSES.join(', ')}` }
      ]);
    }

    let provider;
    switch (body.status) {
      case 'ACTIVE':
        provider = await ProviderStatusService.markActive(providerId);
        break;
      case 'INACTIVE':
        provider = await ProviderStatusService.markInactive(providerId);
        break;
      case 'RATE_LIMITED':
        provider = await ProviderStatusService.markRateLimited(providerId);
        break;
      case 'ERROR':
        provider = await ProviderStatusService.markError(providerId);
        break;
      default:
        provider = await ProviderRepository.updateProviderStatus(providerId, body.status);
    }

    return successResponse(provider);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error updating provider status:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /providers/{id}
 * 
 * Delete a provider.
 */
export async function deleteProvider(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const providerId = event.pathParameters?.id;
    if (!providerId) {
      return errorResponse(400, 'Missing provider ID', 'MISSING_PARAMETER');
    }

    await ProviderRepository.deleteProvider(providerId);

    return successResponse({ message: 'Provider deleted successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting provider:', error);
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

  // Route: POST /providers
  if (method === 'POST' && path === '/providers') {
    return createProvider(event);
  }

  // Route: GET /providers
  if (method === 'GET' && path === '/providers') {
    return listProviders(event);
  }

  // Route: PATCH /providers/{id}/status
  if (method === 'PATCH' && path.match(/^\/providers\/[^/]+\/status$/)) {
    return updateProviderStatus(event);
  }

  // Route: GET /providers/{id}
  if (method === 'GET' && path.match(/^\/providers\/[^/]+$/)) {
    return getProvider(event);
  }

  // Route: DELETE /providers/{id}
  if (method === 'DELETE' && path.match(/^\/providers\/[^/]+$/)) {
    return deleteProvider(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
