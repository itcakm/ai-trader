import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RiskProfileService } from '../services/risk-profile';
import { TenantAccessDeniedError, ResourceNotFoundError } from '../db/access';
import { RiskProfileInput } from '../types/risk-profile';

/**
 * Risk Profile API Handlers
 * 
 * Implements CRUD and assignment endpoints for risk profiles.
 * 
 * Requirements: 8.1, 8.2
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


interface AssignProfileRequest {
  strategyId: string;
  profileId: string;
}

/**
 * POST /risk-profiles
 * Create a new risk profile
 * 
 * Requirements: 8.1
 */
export async function createRiskProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<RiskProfileInput>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate the profile first
    const validation = RiskProfileService.validateProfile(body);
    if (!validation.valid) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', 
        validation.errors.map(e => ({ field: 'profile', message: e }))
      );
    }

    const profile = await RiskProfileService.createProfile(tenantId, body);
    return successResponse(profile, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid risk profile')) {
      return errorResponse(400, error.message, 'VALIDATION_FAILED');
    }
    console.error('Error creating risk profile:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /risk-profiles
 * List all risk profiles for the tenant
 * 
 * Requirements: 8.1
 */
export async function listRiskProfiles(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const profiles = await RiskProfileService.listProfiles(tenantId);
    return successResponse({ profiles });
  } catch (error) {
    console.error('Error listing risk profiles:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /risk-profiles/{id}
 * Get a specific risk profile by ID
 * 
 * Requirements: 8.1
 */
export async function getRiskProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const profileId = event.pathParameters?.id;
    if (!profileId) {
      return errorResponse(400, 'Missing profile ID', 'MISSING_PARAMETER');
    }

    const profile = await RiskProfileService.getProfile(tenantId, profileId);
    if (!profile) {
      return errorResponse(404, 'Risk profile not found', 'NOT_FOUND');
    }

    return successResponse(profile);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting risk profile:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PUT /risk-profiles/{id}
 * Update a risk profile (creates a new version)
 * 
 * Requirements: 8.1, 8.6
 */
export async function updateRiskProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const profileId = event.pathParameters?.id;
    if (!profileId) {
      return errorResponse(400, 'Missing profile ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<Partial<RiskProfileInput>>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const profile = await RiskProfileService.updateProfile(tenantId, profileId, body);
    return successResponse(profile);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return errorResponse(404, error.message, 'NOT_FOUND');
      }
      if (error.message.includes('Invalid risk profile')) {
        return errorResponse(400, error.message, 'VALIDATION_FAILED');
      }
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error updating risk profile:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * GET /risk-profiles/{id}/history
 * Get version history of a risk profile
 * 
 * Requirements: 8.6
 */
export async function getRiskProfileHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const profileId = event.pathParameters?.id;
    if (!profileId) {
      return errorResponse(400, 'Missing profile ID', 'MISSING_PARAMETER');
    }

    const history = await RiskProfileService.getProfileHistory(tenantId, profileId);
    return successResponse({ history });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting risk profile history:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /risk-profiles/assign
 * Assign a risk profile to a strategy
 * 
 * Requirements: 8.2
 */
export async function assignRiskProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<AssignProfileRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.strategyId) {
      return errorResponse(400, 'Missing strategyId', 'MISSING_PARAMETER', [
        { field: 'strategyId', message: 'strategyId is required' }
      ]);
    }

    if (!body.profileId) {
      return errorResponse(400, 'Missing profileId', 'MISSING_PARAMETER', [
        { field: 'profileId', message: 'profileId is required' }
      ]);
    }

    await RiskProfileService.assignToStrategy(tenantId, body.strategyId, body.profileId);

    return successResponse({
      message: 'Risk profile assigned successfully',
      strategyId: body.strategyId,
      profileId: body.profileId
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error assigning risk profile:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /risk-profiles/strategy/{strategyId}
 * Get the applied risk profile for a strategy
 * 
 * Requirements: 8.2, 8.3
 */
export async function getStrategyRiskProfile(
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

    const appliedProfile = await RiskProfileService.getAppliedProfile(tenantId, strategyId);
    
    if (!appliedProfile) {
      return errorResponse(404, 'No risk profile assigned to strategy', 'NOT_FOUND');
    }

    return successResponse(appliedProfile);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting strategy risk profile:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /risk-profiles/validate
 * Validate a risk profile configuration without creating it
 * 
 * Requirements: 8.5
 */
export async function validateRiskProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<RiskProfileInput>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validation = RiskProfileService.validateProfile(body);
    return successResponse(validation);
  } catch (error) {
    console.error('Error validating risk profile:', error);
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

  // POST /risk-profiles
  if (method === 'POST' && path === '/risk-profiles') {
    return createRiskProfile(event);
  }

  // GET /risk-profiles
  if (method === 'GET' && path === '/risk-profiles') {
    return listRiskProfiles(event);
  }

  // POST /risk-profiles/assign
  if (method === 'POST' && path === '/risk-profiles/assign') {
    return assignRiskProfile(event);
  }

  // POST /risk-profiles/validate
  if (method === 'POST' && path === '/risk-profiles/validate') {
    return validateRiskProfile(event);
  }

  // GET /risk-profiles/strategy/{strategyId}
  if (method === 'GET' && path.match(/^\/risk-profiles\/strategy\/[^/]+$/)) {
    return getStrategyRiskProfile(event);
  }

  // GET /risk-profiles/{id}/history
  if (method === 'GET' && path.match(/^\/risk-profiles\/[^/]+\/history$/)) {
    return getRiskProfileHistory(event);
  }

  // GET /risk-profiles/{id}
  if (method === 'GET' && path.match(/^\/risk-profiles\/[^/]+$/)) {
    return getRiskProfile(event);
  }

  // PUT /risk-profiles/{id}
  if (method === 'PUT' && path.match(/^\/risk-profiles\/[^/]+$/)) {
    return updateRiskProfile(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
