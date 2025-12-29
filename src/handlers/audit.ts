import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AuditService, TenantAccessDeniedError, AuditRecordNotFoundError } from '../services/audit';
import { ValidationError } from '../types/validation';
import { AuditFilters, DateRange } from '../types/audit';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for exporting audit records
 */
interface ExportAuditRequestBody {
  startDate: string;
  endDate: string;
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
 * Validate ISO date string
 */
function isValidISODate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * GET /audit
 * 
 * Get audit records for the tenant with optional filters.
 * 
 * Requirements: 10.4
 */
export async function getAuditRecords(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const validationErrors: ValidationError[] = [];

    // Build filters from query params
    const filters: AuditFilters = {};

    if (queryParams.modelConfigId) {
      filters.modelConfigId = queryParams.modelConfigId;
    }

    if (queryParams.analysisType) {
      filters.analysisType = queryParams.analysisType;
    }

    if (queryParams.startDate) {
      if (!isValidISODate(queryParams.startDate)) {
        validationErrors.push({ field: 'startDate', code: 'INVALID', message: 'startDate must be a valid ISO date string' });
      } else {
        filters.startDate = queryParams.startDate;
      }
    }

    if (queryParams.endDate) {
      if (!isValidISODate(queryParams.endDate)) {
        validationErrors.push({ field: 'endDate', code: 'INVALID', message: 'endDate must be a valid ISO date string' });
      } else {
        filters.endDate = queryParams.endDate;
      }
    }

    if (queryParams.limit) {
      const limit = parseInt(queryParams.limit, 10);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        validationErrors.push({ field: 'limit', code: 'INVALID', message: 'limit must be between 1 and 1000' });
      } else {
        filters.limit = limit;
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const records = await AuditService.getAuditRecords(tenantId, filters);

    return successResponse({
      records,
      count: records.length,
      filters
    });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, error.message, 'ACCESS_DENIED');
    }
    console.error('Error getting audit records:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/{auditId}
 * 
 * Get a specific audit record by ID.
 * 
 * Requirements: 10.4
 */
export async function getAuditRecord(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const auditId = event.pathParameters?.auditId;
    if (!auditId) {
      return errorResponse(400, 'Missing audit ID', 'MISSING_PARAMETER');
    }

    // Timestamp is required to construct the S3 key
    const timestamp = event.queryStringParameters?.timestamp;
    if (!timestamp) {
      return errorResponse(400, 'Missing timestamp', 'MISSING_PARAMETER', [
        { field: 'timestamp', code: 'REQUIRED', message: 'timestamp query parameter is required' }
      ]);
    }

    if (!isValidISODate(timestamp)) {
      return errorResponse(400, 'Invalid timestamp', 'INVALID_PARAMETER', [
        { field: 'timestamp', code: 'INVALID', message: 'timestamp must be a valid ISO date string' }
      ]);
    }

    const record = await AuditService.getAuditRecord(tenantId, auditId, timestamp);

    return successResponse(record);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, error.message, 'ACCESS_DENIED');
    }
    if (error instanceof AuditRecordNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting audit record:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/count
 * 
 * Get count of audit records for the tenant.
 */
export async function getAuditCount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    // Parse optional date range
    const queryParams = event.queryStringParameters || {};
    const validationErrors: ValidationError[] = [];
    let dateRange: DateRange | undefined;

    if (queryParams.startDate || queryParams.endDate) {
      if (queryParams.startDate && !isValidISODate(queryParams.startDate)) {
        validationErrors.push({ field: 'startDate', code: 'INVALID', message: 'startDate must be a valid ISO date string' });
      }
      if (queryParams.endDate && !isValidISODate(queryParams.endDate)) {
        validationErrors.push({ field: 'endDate', code: 'INVALID', message: 'endDate must be a valid ISO date string' });
      }

      if (validationErrors.length === 0 && queryParams.startDate && queryParams.endDate) {
        dateRange = {
          startDate: queryParams.startDate,
          endDate: queryParams.endDate
        };
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const count = await AuditService.countAuditRecords(tenantId, dateRange);

    return successResponse({ count, dateRange });
  } catch (error) {
    console.error('Error counting audit records:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/export
 * 
 * Export audit records for a date range.
 * 
 * Requirements: 10.5
 */
export async function exportAuditRecords(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<ExportAuditRequestBody>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.startDate) {
      validationErrors.push({ field: 'startDate', code: 'REQUIRED', message: 'startDate is required' });
    } else if (!isValidISODate(body.startDate)) {
      validationErrors.push({ field: 'startDate', code: 'INVALID', message: 'startDate must be a valid ISO date string' });
    }

    if (!body.endDate) {
      validationErrors.push({ field: 'endDate', code: 'REQUIRED', message: 'endDate is required' });
    } else if (!isValidISODate(body.endDate)) {
      validationErrors.push({ field: 'endDate', code: 'INVALID', message: 'endDate must be a valid ISO date string' });
    }

    // Validate date range
    if (body.startDate && body.endDate && isValidISODate(body.startDate) && isValidISODate(body.endDate)) {
      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);
      
      if (startDate > endDate) {
        validationErrors.push({ field: 'dateRange', code: 'INVALID', message: 'startDate must be before endDate' });
      }

      // Limit export range to 90 days
      const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
      if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
        validationErrors.push({ field: 'dateRange', code: 'INVALID', message: 'date range cannot exceed 90 days' });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const dateRange: DateRange = {
      startDate: body.startDate,
      endDate: body.endDate
    };

    const exportUrl = await AuditService.exportAuditPackage(tenantId, dateRange);

    return successResponse({
      exportUrl,
      dateRange,
      expiresIn: '1 hour',
      message: 'Export package created successfully. Download URL is valid for 1 hour.'
    });
  } catch (error) {
    console.error('Error exporting audit records:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/model/{modelConfigId}
 * 
 * Get audit records for a specific model configuration.
 */
export async function getAuditRecordsByModel(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const modelConfigId = event.pathParameters?.modelConfigId;
    if (!modelConfigId) {
      return errorResponse(400, 'Missing model configuration ID', 'MISSING_PARAMETER');
    }

    // Get limit from query params
    const limitStr = event.queryStringParameters?.limit;
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return errorResponse(400, 'Invalid limit', 'INVALID_PARAMETER', [
        { field: 'limit', code: 'INVALID', message: 'limit must be between 1 and 1000' }
      ]);
    }

    const records = await AuditService.getAuditRecordsByModel(tenantId, modelConfigId, limit);

    return successResponse({
      records,
      count: records.length,
      modelConfigId
    });
  } catch (error) {
    console.error('Error getting audit records by model:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/type/{analysisType}
 * 
 * Get audit records for a specific analysis type.
 */
export async function getAuditRecordsByType(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const analysisType = event.pathParameters?.analysisType;
    if (!analysisType) {
      return errorResponse(400, 'Missing analysis type', 'MISSING_PARAMETER');
    }

    // Get limit from query params
    const limitStr = event.queryStringParameters?.limit;
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return errorResponse(400, 'Invalid limit', 'INVALID_PARAMETER', [
        { field: 'limit', code: 'INVALID', message: 'limit must be between 1 and 1000' }
      ]);
    }

    const records = await AuditService.getAuditRecordsByType(tenantId, analysisType, limit);

    return successResponse({
      records,
      count: records.length,
      analysisType
    });
  } catch (error) {
    console.error('Error getting audit records by type:', error);
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

  // Route: POST /audit/export
  if (method === 'POST' && path === '/audit/export') {
    return exportAuditRecords(event);
  }

  // Route: GET /audit/count
  if (method === 'GET' && path === '/audit/count') {
    return getAuditCount(event);
  }

  // Route: GET /audit/model/{modelConfigId}
  if (method === 'GET' && path.match(/^\/audit\/model\/[^/]+$/)) {
    return getAuditRecordsByModel(event);
  }

  // Route: GET /audit/type/{analysisType}
  if (method === 'GET' && path.match(/^\/audit\/type\/[^/]+$/)) {
    return getAuditRecordsByType(event);
  }

  // Route: GET /audit/{auditId}
  if (method === 'GET' && path.match(/^\/audit\/[^/]+$/) && !path.includes('/model/') && !path.includes('/type/') && !path.includes('/count') && !path.includes('/export')) {
    return getAuditRecord(event);
  }

  // Route: GET /audit
  if (method === 'GET' && path === '/audit') {
    return getAuditRecords(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
