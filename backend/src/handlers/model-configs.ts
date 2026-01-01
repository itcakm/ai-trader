import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ModelConfigRepository } from '../repositories/model-config';
import { ModelConfigService, CostLimitExceededError } from '../services/model-config';
import { ResourceNotFoundError } from '../db/access';
import { ValidationError } from '../types/validation';
import { ModelConfigurationInput, CostLimits, EncryptedCredentials } from '../types/model-config';
import { RateLimitConfig } from '../types/provider';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for creating a model configuration
 */
interface CreateModelConfigRequest {
  providerId: string;
  modelId: string;
  modelName: string;
  enabled?: boolean;
  credentials: EncryptedCredentials;
  costLimits: CostLimits;
  rateLimits: RateLimitConfig;
  priority?: number;
  apiKey?: string; // Optional API key for validation
}

/**
 * Request body for updating a model configuration
 */
interface UpdateModelConfigRequest {
  modelName?: string;
  enabled?: boolean;
  credentials?: EncryptedCredentials;
  costLimits?: CostLimits;
  rateLimits?: RateLimitConfig;
  priority?: number;
}

/**
 * Request body for validating credentials
 */
interface ValidateCredentialsRequest {
  apiKey: string;
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
 * Validate cost limits structure
 */
function validateCostLimits(costLimits: CostLimits): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof costLimits.maxDailyCostUsd !== 'number' || costLimits.maxDailyCostUsd < 0) {
    errors.push({ field: 'costLimits.maxDailyCostUsd', code: 'INVALID', message: 'maxDailyCostUsd must be a non-negative number' });
  }
  if (typeof costLimits.maxMonthlyCostUsd !== 'number' || costLimits.maxMonthlyCostUsd < 0) {
    errors.push({ field: 'costLimits.maxMonthlyCostUsd', code: 'INVALID', message: 'maxMonthlyCostUsd must be a non-negative number' });
  }
  if (typeof costLimits.currentDailyCostUsd !== 'number' || costLimits.currentDailyCostUsd < 0) {
    errors.push({ field: 'costLimits.currentDailyCostUsd', code: 'INVALID', message: 'currentDailyCostUsd must be a non-negative number' });
  }
  if (typeof costLimits.currentMonthlyCostUsd !== 'number' || costLimits.currentMonthlyCostUsd < 0) {
    errors.push({ field: 'costLimits.currentMonthlyCostUsd', code: 'INVALID', message: 'currentMonthlyCostUsd must be a non-negative number' });
  }
  if (!costLimits.lastResetDate) {
    errors.push({ field: 'costLimits.lastResetDate', code: 'REQUIRED', message: 'lastResetDate is required' });
  }

  return errors;
}

/**
 * Validate rate limits structure
 */
function validateRateLimits(rateLimits: RateLimitConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof rateLimits.requestsPerMinute !== 'number' || rateLimits.requestsPerMinute <= 0) {
    errors.push({ field: 'rateLimits.requestsPerMinute', code: 'INVALID', message: 'requestsPerMinute must be a positive number' });
  }
  if (typeof rateLimits.tokensPerMinute !== 'number' || rateLimits.tokensPerMinute <= 0) {
    errors.push({ field: 'rateLimits.tokensPerMinute', code: 'INVALID', message: 'tokensPerMinute must be a positive number' });
  }
  if (typeof rateLimits.requestsPerDay !== 'number' || rateLimits.requestsPerDay <= 0) {
    errors.push({ field: 'rateLimits.requestsPerDay', code: 'INVALID', message: 'requestsPerDay must be a positive number' });
  }

  return errors;
}

/**
 * Validate credentials structure
 */
function validateCredentials(credentials: EncryptedCredentials): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!credentials.encryptedApiKey) {
    errors.push({ field: 'credentials.encryptedApiKey', code: 'REQUIRED', message: 'encryptedApiKey is required' });
  }
  if (!credentials.keyId) {
    errors.push({ field: 'credentials.keyId', code: 'REQUIRED', message: 'keyId is required' });
  }

  return errors;
}

/**
 * GET /model-configs
 * 
 * List all model configurations for the tenant.
 * 
 * Requirements: 2.2
 */
export async function listModelConfigs(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const providerId = event.queryStringParameters?.providerId;
    const enabledStr = event.queryStringParameters?.enabled;
    const enabled = enabledStr === 'true' ? true : enabledStr === 'false' ? false : undefined;

    const result = await ModelConfigRepository.listConfigurations({
      tenantId,
      providerId,
      enabled
    });

    return successResponse({
      configurations: result.items,
      lastEvaluatedKey: result.lastEvaluatedKey
    });
  } catch (error) {
    console.error('Error listing model configurations:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /model-configs/available
 * 
 * List available models for the tenant (enabled + active provider).
 * 
 * Requirements: 2.2, 2.3
 */
export async function listAvailableModels(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const providerType = event.queryStringParameters?.providerType;
    const minPriorityStr = event.queryStringParameters?.minPriority;
    const minPriority = minPriorityStr ? parseInt(minPriorityStr, 10) : undefined;

    const availableModels = await ModelConfigService.listAvailableModels(tenantId, {
      providerType,
      minPriority
    });

    return successResponse({ models: availableModels });
  } catch (error) {
    console.error('Error listing available models:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /model-configs/{id}
 * 
 * Get a specific model configuration by ID.
 * 
 * Requirements: 2.2
 */
export async function getModelConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const configId = event.pathParameters?.id;
    if (!configId) {
      return errorResponse(400, 'Missing configuration ID', 'MISSING_PARAMETER');
    }

    const config = await ModelConfigRepository.getConfiguration(tenantId, configId);
    if (!config) {
      return errorResponse(404, `Model configuration not found: ${configId}`, 'NOT_FOUND');
    }

    return successResponse(config);
  } catch (error) {
    console.error('Error getting model configuration:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /model-configs
 * 
 * Create a new model configuration.
 * 
 * Requirements: 2.1
 */
export async function createModelConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<CreateModelConfigRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.providerId) {
      validationErrors.push({ field: 'providerId', code: 'REQUIRED', message: 'providerId is required' });
    }

    if (!body.modelId) {
      validationErrors.push({ field: 'modelId', code: 'REQUIRED', message: 'modelId is required' });
    }

    if (!body.modelName) {
      validationErrors.push({ field: 'modelName', code: 'REQUIRED', message: 'modelName is required' });
    }

    if (!body.credentials) {
      validationErrors.push({ field: 'credentials', code: 'REQUIRED', message: 'credentials is required' });
    } else {
      validationErrors.push(...validateCredentials(body.credentials));
    }

    if (!body.costLimits) {
      validationErrors.push({ field: 'costLimits', code: 'REQUIRED', message: 'costLimits is required' });
    } else {
      validationErrors.push(...validateCostLimits(body.costLimits));
    }

    if (!body.rateLimits) {
      validationErrors.push({ field: 'rateLimits', code: 'REQUIRED', message: 'rateLimits is required' });
    } else {
      validationErrors.push(...validateRateLimits(body.rateLimits));
    }

    if (body.priority !== undefined && (body.priority < 1 || body.priority > 10)) {
      validationErrors.push({ field: 'priority', code: 'INVALID', message: 'priority must be between 1 and 10' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const input: ModelConfigurationInput = {
      providerId: body.providerId,
      modelId: body.modelId,
      modelName: body.modelName,
      enabled: body.enabled,
      credentials: body.credentials,
      costLimits: body.costLimits,
      rateLimits: body.rateLimits,
      priority: body.priority
    };

    const config = await ModelConfigService.configureModel(tenantId, input, body.apiKey);

    return successResponse(config, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Credential validation failed')) {
      return errorResponse(400, error.message, 'CREDENTIAL_VALIDATION_FAILED');
    }
    console.error('Error creating model configuration:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PUT /model-configs/{id}
 * 
 * Update a model configuration.
 * 
 * Requirements: 2.1
 */
export async function updateModelConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const configId = event.pathParameters?.id;
    if (!configId) {
      return errorResponse(400, 'Missing configuration ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<UpdateModelConfigRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate optional fields if provided
    const validationErrors: ValidationError[] = [];

    if (body.credentials) {
      validationErrors.push(...validateCredentials(body.credentials));
    }

    if (body.costLimits) {
      validationErrors.push(...validateCostLimits(body.costLimits));
    }

    if (body.rateLimits) {
      validationErrors.push(...validateRateLimits(body.rateLimits));
    }

    if (body.priority !== undefined && (body.priority < 1 || body.priority > 10)) {
      validationErrors.push({ field: 'priority', code: 'INVALID', message: 'priority must be between 1 and 10' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const config = await ModelConfigRepository.updateConfiguration(tenantId, configId, body);

    return successResponse(config);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error updating model configuration:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /model-configs/{id}
 * 
 * Delete a model configuration.
 */
export async function deleteModelConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const configId = event.pathParameters?.id;
    if (!configId) {
      return errorResponse(400, 'Missing configuration ID', 'MISSING_PARAMETER');
    }

    await ModelConfigRepository.deleteConfiguration(tenantId, configId);

    return successResponse({ message: 'Model configuration deleted successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting model configuration:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /model-configs/{id}/enable
 * 
 * Enable a model configuration.
 * 
 * Requirements: 2.2
 */
export async function enableModelConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const configId = event.pathParameters?.id;
    if (!configId) {
      return errorResponse(400, 'Missing configuration ID', 'MISSING_PARAMETER');
    }

    const config = await ModelConfigService.enableModel(tenantId, configId);

    return successResponse(config);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error enabling model configuration:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /model-configs/{id}/disable
 * 
 * Disable a model configuration.
 * 
 * Requirements: 2.2
 */
export async function disableModelConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const configId = event.pathParameters?.id;
    if (!configId) {
      return errorResponse(400, 'Missing configuration ID', 'MISSING_PARAMETER');
    }

    const config = await ModelConfigService.disableModel(tenantId, configId);

    return successResponse(config);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error disabling model configuration:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /model-configs/{id}/validate-credentials
 * 
 * Validate credentials for a model configuration.
 * 
 * Requirements: 2.1
 */
export async function validateCredentialsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const configId = event.pathParameters?.id;
    if (!configId) {
      return errorResponse(400, 'Missing configuration ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<ValidateCredentialsRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.apiKey) {
      return errorResponse(400, 'Missing apiKey', 'MISSING_PARAMETER', [
        { field: 'apiKey', code: 'REQUIRED', message: 'apiKey is required' }
      ]);
    }

    const result = await ModelConfigService.validateCredentials(tenantId, configId, body.apiKey);

    return successResponse(result);
  } catch (error) {
    console.error('Error validating credentials:', error);
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

  // Route: POST /model-configs
  if (method === 'POST' && path === '/model-configs') {
    return createModelConfig(event);
  }

  // Route: GET /model-configs/available
  if (method === 'GET' && path === '/model-configs/available') {
    return listAvailableModels(event);
  }

  // Route: GET /model-configs
  if (method === 'GET' && path === '/model-configs') {
    return listModelConfigs(event);
  }

  // Route: POST /model-configs/{id}/validate-credentials
  if (method === 'POST' && path.match(/^\/model-configs\/[^/]+\/validate-credentials$/)) {
    return validateCredentialsHandler(event);
  }

  // Route: PATCH /model-configs/{id}/enable
  if (method === 'PATCH' && path.match(/^\/model-configs\/[^/]+\/enable$/)) {
    return enableModelConfig(event);
  }

  // Route: PATCH /model-configs/{id}/disable
  if (method === 'PATCH' && path.match(/^\/model-configs\/[^/]+\/disable$/)) {
    return disableModelConfig(event);
  }

  // Route: PUT /model-configs/{id}
  if (method === 'PUT' && path.match(/^\/model-configs\/[^/]+$/)) {
    return updateModelConfig(event);
  }

  // Route: GET /model-configs/{id}
  if (method === 'GET' && path.match(/^\/model-configs\/[^/]+$/)) {
    return getModelConfig(event);
  }

  // Route: DELETE /model-configs/{id}
  if (method === 'DELETE' && path.match(/^\/model-configs\/[^/]+$/)) {
    return deleteModelConfig(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
