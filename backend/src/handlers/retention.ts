import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  RetentionManagerService, 
  getPolicies, 
  getPolicy,
  getRetrievalJob,
  getValidRecordTypes 
} from '../services/retention-manager';
import { RetentionPolicyInput } from '../types/retention';
import { ValidationError } from '../types/validation';

/**
 * Retention Management API Handlers
 * 
 * Implements endpoints for retention policy management:
 * - POST /audit/retention/policies - Create/update retention policy
 * - GET /audit/retention/policies - List policies
 * - GET /audit/retention/policies/{recordType} - Get policy for record type
 * - GET /audit/storage/usage - Get storage usage metrics
 * - POST /audit/retention/archive - Archive expired records
 * - POST /audit/retention/retrieve - Retrieve archived records
 * - GET /audit/retention/jobs/{jobId} - Get retrieval job status
 * - POST /audit/retention/validate-deletion - Validate deletion request
 * 
 * Requirements: 8.1, 8.5
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
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
  details?: ValidationError[]
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

function isValidISODate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}


const VALID_RECORD_TYPES = getValidRecordTypes();

/**
 * POST /audit/retention/policies
 * Create or update a retention policy
 * 
 * Requirements: 8.1
 */
export async function setRetentionPolicy(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<Omit<RetentionPolicyInput, 'tenantId'>>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    // Validate record type
    if (!body.recordType) {
      validationErrors.push({ field: 'recordType', code: 'REQUIRED', message: 'recordType is required' });
    } else if (!VALID_RECORD_TYPES.includes(body.recordType)) {
      validationErrors.push({ 
        field: 'recordType', 
        code: 'INVALID', 
        message: `recordType must be one of: ${VALID_RECORD_TYPES.join(', ')}` 
      });
    }

    // Validate retention days
    if (typeof body.retentionDays !== 'number' || body.retentionDays < 1) {
      validationErrors.push({ field: 'retentionDays', code: 'INVALID', message: 'retentionDays must be a positive number' });
    }

    // Validate archive days
    if (typeof body.archiveAfterDays !== 'number' || body.archiveAfterDays < 1) {
      validationErrors.push({ field: 'archiveAfterDays', code: 'INVALID', message: 'archiveAfterDays must be a positive number' });
    }

    // Validate archive < retention
    if (body.archiveAfterDays >= body.retentionDays) {
      validationErrors.push({ 
        field: 'archiveAfterDays', 
        code: 'INVALID', 
        message: 'archiveAfterDays must be less than retentionDays' 
      });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const input: RetentionPolicyInput = {
      ...body,
      tenantId
    };

    const policy = await RetentionManagerService.setPolicy(input);
    return successResponse(policy, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cannot be less than minimum')) {
      return errorResponse(400, error.message, 'VALIDATION_FAILED');
    }
    console.error('Error setting retention policy:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/retention/policies
 * List all retention policies for tenant
 */
export async function listRetentionPolicies(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const policies = await getPolicies(tenantId);

    return successResponse({
      policies,
      count: policies.length,
      validRecordTypes: VALID_RECORD_TYPES
    });
  } catch (error) {
    console.error('Error listing retention policies:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/retention/policies/{recordType}
 * Get retention policy for a specific record type
 */
export async function getRetentionPolicy(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const recordType = event.pathParameters?.recordType;
    if (!recordType) {
      return errorResponse(400, 'Missing record type', 'MISSING_PARAMETER');
    }

    if (!VALID_RECORD_TYPES.includes(recordType)) {
      return errorResponse(400, `Invalid record type. Must be one of: ${VALID_RECORD_TYPES.join(', ')}`, 'INVALID_PARAMETER');
    }

    const policy = await getPolicy(tenantId, recordType);

    if (!policy) {
      return errorResponse(404, 'Retention policy not found', 'NOT_FOUND');
    }

    return successResponse(policy);
  } catch (error) {
    console.error('Error getting retention policy:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/storage/usage
 * Get storage usage metrics
 * 
 * Requirements: 8.5
 */
export async function getStorageUsage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const usage = await RetentionManagerService.getStorageUsage(tenantId);

    return successResponse(usage);
  } catch (error) {
    console.error('Error getting storage usage:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/retention/archive
 * Archive expired records
 */
export async function archiveExpiredRecords(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const result = await RetentionManagerService.archiveExpiredRecords(tenantId);

    return successResponse(result);
  } catch (error) {
    console.error('Error archiving expired records:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/retention/retrieve
 * Retrieve archived records
 */
export async function retrieveArchivedRecords(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<{
      recordType: string;
      timeRange: { startDate: string; endDate: string };
    }>(event);

    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    if (!body.recordType) {
      validationErrors.push({ field: 'recordType', code: 'REQUIRED', message: 'recordType is required' });
    } else if (!VALID_RECORD_TYPES.includes(body.recordType)) {
      validationErrors.push({ 
        field: 'recordType', 
        code: 'INVALID', 
        message: `recordType must be one of: ${VALID_RECORD_TYPES.join(', ')}` 
      });
    }

    if (!body.timeRange) {
      validationErrors.push({ field: 'timeRange', code: 'REQUIRED', message: 'timeRange is required' });
    } else {
      if (!body.timeRange.startDate || !isValidISODate(body.timeRange.startDate)) {
        validationErrors.push({ field: 'timeRange.startDate', code: 'INVALID', message: 'startDate must be a valid ISO date' });
      }
      if (!body.timeRange.endDate || !isValidISODate(body.timeRange.endDate)) {
        validationErrors.push({ field: 'timeRange.endDate', code: 'INVALID', message: 'endDate must be a valid ISO date' });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const job = await RetentionManagerService.retrieveArchivedRecords(
      tenantId,
      body.recordType,
      body.timeRange
    );

    return successResponse(job, 202);
  } catch (error) {
    console.error('Error retrieving archived records:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/retention/jobs/{jobId}
 * Get retrieval job status
 */
export async function getRetrievalJobStatus(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      return errorResponse(400, 'Missing job ID', 'MISSING_PARAMETER');
    }

    const job = await getRetrievalJob(tenantId, jobId);

    if (!job) {
      return errorResponse(404, 'Retrieval job not found', 'NOT_FOUND');
    }

    return successResponse(job);
  } catch (error) {
    console.error('Error getting retrieval job status:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/retention/validate-deletion
 * Validate deletion request against retention policies
 */
export async function validateDeletion(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<{
      recordType: string;
      recordIds: string[];
    }>(event);

    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    if (!body.recordType) {
      validationErrors.push({ field: 'recordType', code: 'REQUIRED', message: 'recordType is required' });
    } else if (!VALID_RECORD_TYPES.includes(body.recordType)) {
      validationErrors.push({ 
        field: 'recordType', 
        code: 'INVALID', 
        message: `recordType must be one of: ${VALID_RECORD_TYPES.join(', ')}` 
      });
    }

    if (!Array.isArray(body.recordIds) || body.recordIds.length === 0) {
      validationErrors.push({ field: 'recordIds', code: 'REQUIRED', message: 'recordIds must be a non-empty array' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const validation = await RetentionManagerService.validateDeletion(
      tenantId,
      body.recordType,
      body.recordIds
    );

    return successResponse(validation);
  } catch (error) {
    console.error('Error validating deletion:', error);
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

  // POST /audit/retention/policies
  if (method === 'POST' && path === '/audit/retention/policies') {
    return setRetentionPolicy(event);
  }

  // GET /audit/retention/policies
  if (method === 'GET' && path === '/audit/retention/policies') {
    return listRetentionPolicies(event);
  }

  // GET /audit/retention/policies/{recordType}
  if (method === 'GET' && path.match(/^\/audit\/retention\/policies\/[^/]+$/)) {
    return getRetentionPolicy(event);
  }

  // GET /audit/storage/usage
  if (method === 'GET' && path === '/audit/storage/usage') {
    return getStorageUsage(event);
  }

  // POST /audit/retention/archive
  if (method === 'POST' && path === '/audit/retention/archive') {
    return archiveExpiredRecords(event);
  }

  // POST /audit/retention/retrieve
  if (method === 'POST' && path === '/audit/retention/retrieve') {
    return retrieveArchivedRecords(event);
  }

  // GET /audit/retention/jobs/{jobId}
  if (method === 'GET' && path.match(/^\/audit\/retention\/jobs\/[^/]+$/)) {
    return getRetrievalJobStatus(event);
  }

  // POST /audit/retention/validate-deletion
  if (method === 'POST' && path === '/audit/retention/validate-deletion') {
    return validateDeletion(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
