import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AllocationService, AllocationValidationError } from '../services/allocation';
import { AllocationRepository } from '../repositories/allocation';
import { ResourceNotFoundError } from '../db/access';
import { ValidationError } from '../types/validation';
import { ModelAllocation, AllocationValidation } from '../types/allocation';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for creating an allocation
 */
interface CreateAllocationRequest {
  strategyId: string;
  allocations: ModelAllocation[];
  ensembleMode?: boolean;
}

/**
 * Request body for updating an allocation
 */
interface UpdateAllocationRequest {
  allocations: ModelAllocation[];
  ensembleMode?: boolean;
}

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id,X-User-Id',
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
 * Extract user ID from request headers
 */
function getUserId(event: APIGatewayProxyEvent): string {
  return event.headers['X-User-Id'] || event.headers['x-user-id'] || 'system';
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
 * Validate model allocation structure
 */
function validateModelAllocation(allocation: ModelAllocation, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `allocations[${index}]`;

  if (!allocation.modelConfigId) {
    errors.push({ field: `${prefix}.modelConfigId`, code: 'REQUIRED', message: 'modelConfigId is required' });
  }

  if (typeof allocation.percentage !== 'number') {
    errors.push({ field: `${prefix}.percentage`, code: 'INVALID', message: 'percentage must be a number' });
  } else if (allocation.percentage < AllocationValidation.minPercentagePerModel) {
    errors.push({ 
      field: `${prefix}.percentage`, 
      code: 'INVALID', 
      message: `percentage must be at least ${AllocationValidation.minPercentagePerModel}%` 
    });
  } else if (allocation.percentage > 100) {
    errors.push({ field: `${prefix}.percentage`, code: 'INVALID', message: 'percentage cannot exceed 100%' });
  }

  if (typeof allocation.priority !== 'number') {
    errors.push({ field: `${prefix}.priority`, code: 'INVALID', message: 'priority must be a number' });
  }

  return errors;
}

/**
 * Validate allocations array
 */
function validateAllocations(allocations: ModelAllocation[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(allocations)) {
    errors.push({ field: 'allocations', code: 'INVALID', message: 'allocations must be an array' });
    return errors;
  }

  if (allocations.length < AllocationValidation.minModels) {
    errors.push({ 
      field: 'allocations', 
      code: 'INVALID', 
      message: `allocations must include at least ${AllocationValidation.minModels} model(s)` 
    });
  }

  if (allocations.length > AllocationValidation.maxModels) {
    errors.push({ 
      field: 'allocations', 
      code: 'INVALID', 
      message: `allocations cannot include more than ${AllocationValidation.maxModels} models` 
    });
  }

  // Validate each allocation
  allocations.forEach((allocation, index) => {
    errors.push(...validateModelAllocation(allocation, index));
  });

  // Check total percentage
  const totalPercentage = allocations.reduce((sum, a) => sum + (a.percentage || 0), 0);
  if (totalPercentage !== AllocationValidation.totalPercentage) {
    errors.push({ 
      field: 'allocations', 
      code: 'INVALID', 
      message: `total allocation must equal ${AllocationValidation.totalPercentage}%, got ${totalPercentage}%` 
    });
  }

  // Check for duplicate model config IDs
  const modelConfigIds = allocations.map(a => a.modelConfigId).filter(Boolean);
  const uniqueIds = new Set(modelConfigIds);
  if (uniqueIds.size !== modelConfigIds.length) {
    errors.push({ field: 'allocations', code: 'INVALID', message: 'duplicate model configuration IDs found' });
  }

  return errors;
}

/**
 * GET /allocations
 * 
 * List all allocations for the tenant.
 * 
 * Requirements: 5.3
 */
export async function listAllocations(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.queryStringParameters?.strategyId;

    const result = await AllocationRepository.listAllocations({
      tenantId,
      strategyId
    });

    return successResponse({
      allocations: result.items,
      lastEvaluatedKey: result.lastEvaluatedKey
    });
  } catch (error) {
    console.error('Error listing allocations:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /allocations/{strategyId}
 * 
 * Get the current allocation for a strategy.
 * 
 * Requirements: 5.3
 */
export async function getAllocation(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.pathParameters?.strategyId;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    const allocation = await AllocationService.getAllocation(tenantId, strategyId);
    if (!allocation) {
      return errorResponse(404, `Allocation not found for strategy: ${strategyId}`, 'NOT_FOUND');
    }

    return successResponse(allocation);
  } catch (error) {
    console.error('Error getting allocation:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /allocations/{strategyId}/history
 * 
 * Get the allocation history for a strategy.
 * 
 * Requirements: 5.3
 */
export async function getAllocationHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.pathParameters?.strategyId;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    const history = await AllocationService.getAllocationHistory(tenantId, strategyId);

    return successResponse({ history });
  } catch (error) {
    console.error('Error getting allocation history:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /allocations/{strategyId}/versions/{version}
 * 
 * Get a specific version of an allocation.
 * 
 * Requirements: 5.3
 */
export async function getAllocationVersion(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.pathParameters?.strategyId;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    const versionStr = event.pathParameters?.version;
    if (!versionStr) {
      return errorResponse(400, 'Missing version', 'MISSING_PARAMETER');
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version) || version < 1) {
      return errorResponse(400, 'Invalid version number', 'INVALID_PARAMETER', [
        { field: 'version', code: 'INVALID', message: 'version must be a positive integer' }
      ]);
    }

    const allocation = await AllocationService.getAllocationVersion(tenantId, strategyId, version);
    if (!allocation) {
      return errorResponse(404, `Allocation version ${version} not found for strategy: ${strategyId}`, 'NOT_FOUND');
    }

    return successResponse(allocation);
  } catch (error) {
    console.error('Error getting allocation version:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /allocations
 * 
 * Create a new allocation for a strategy.
 * 
 * Requirements: 5.1
 */
export async function createAllocation(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const userId = getUserId(event);

    const body = parseBody<CreateAllocationRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.strategyId) {
      validationErrors.push({ field: 'strategyId', code: 'REQUIRED', message: 'strategyId is required' });
    }

    if (!body.allocations) {
      validationErrors.push({ field: 'allocations', code: 'REQUIRED', message: 'allocations is required' });
    } else {
      validationErrors.push(...validateAllocations(body.allocations));
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const allocation = await AllocationService.createAllocation(
      tenantId,
      body.strategyId,
      {
        allocations: body.allocations,
        ensembleMode: body.ensembleMode
      },
      userId
    );

    return successResponse(allocation, 201);
  } catch (error) {
    if (error instanceof AllocationValidationError) {
      const details: ValidationError[] = error.errors.map(e => ({
        field: 'allocations',
        code: 'INVALID',
        message: e
      }));
      return errorResponse(400, error.message, 'ALLOCATION_VALIDATION_FAILED', details);
    }
    console.error('Error creating allocation:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PUT /allocations/{strategyId}
 * 
 * Update an allocation by creating a new version.
 * 
 * Requirements: 5.1, 5.3
 */
export async function updateAllocation(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const userId = getUserId(event);

    const strategyId = event.pathParameters?.strategyId;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<UpdateAllocationRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate allocations
    const validationErrors: ValidationError[] = [];

    if (!body.allocations) {
      validationErrors.push({ field: 'allocations', code: 'REQUIRED', message: 'allocations is required' });
    } else {
      validationErrors.push(...validateAllocations(body.allocations));
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const allocation = await AllocationService.updateAllocation(
      tenantId,
      strategyId,
      {
        allocations: body.allocations,
        ensembleMode: body.ensembleMode
      },
      userId
    );

    return successResponse(allocation);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof AllocationValidationError) {
      const details: ValidationError[] = error.errors.map(e => ({
        field: 'allocations',
        code: 'INVALID',
        message: e
      }));
      return errorResponse(400, error.message, 'ALLOCATION_VALIDATION_FAILED', details);
    }
    console.error('Error updating allocation:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /allocations/{strategyId}
 * 
 * Delete all versions of an allocation for a strategy.
 */
export async function deleteAllocation(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.pathParameters?.strategyId;
    if (!strategyId) {
      return errorResponse(400, 'Missing strategy ID', 'MISSING_PARAMETER');
    }

    await AllocationService.deleteAllocation(tenantId, strategyId);

    return successResponse({ message: 'Allocation deleted successfully' });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting allocation:', error);
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

  // Route: POST /allocations
  if (method === 'POST' && path === '/allocations') {
    return createAllocation(event);
  }

  // Route: GET /allocations
  if (method === 'GET' && path === '/allocations') {
    return listAllocations(event);
  }

  // Route: GET /allocations/{strategyId}/history
  if (method === 'GET' && path.match(/^\/allocations\/[^/]+\/history$/)) {
    return getAllocationHistory(event);
  }

  // Route: GET /allocations/{strategyId}/versions/{version}
  if (method === 'GET' && path.match(/^\/allocations\/[^/]+\/versions\/[^/]+$/)) {
    return getAllocationVersion(event);
  }

  // Route: PUT /allocations/{strategyId}
  if (method === 'PUT' && path.match(/^\/allocations\/[^/]+$/)) {
    return updateAllocation(event);
  }

  // Route: GET /allocations/{strategyId}
  if (method === 'GET' && path.match(/^\/allocations\/[^/]+$/)) {
    return getAllocation(event);
  }

  // Route: DELETE /allocations/{strategyId}
  if (method === 'DELETE' && path.match(/^\/allocations\/[^/]+$/)) {
    return deleteAllocation(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
