import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  AuditPackageService, 
  getPackageByIdWithTenant, 
  verifyIntegrityWithTenant,
  getDownloadUrlWithTenant 
} from '../services/audit-package';
import { AuditPackageScope, ExportFormat } from '../types/audit-package';
import { ValidationError } from '../types/validation';

/**
 * Audit Package API Handlers
 * 
 * Implements endpoints for audit package generation and retrieval:
 * - POST /audit/packages - Generate an audit package
 * - GET /audit/packages/{packageId} - Get package metadata
 * - GET /audit/packages/{packageId}/download - Get download URL
 * - GET /audit/packages/{packageId}/verify - Verify package integrity
 * 
 * Requirements: 5.1, 5.6
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


const VALID_EXPORT_FORMATS: ExportFormat[] = ['JSON', 'CSV', 'PDF'];

interface GeneratePackageRequest {
  scope: AuditPackageScope;
  format: ExportFormat;
}

/**
 * POST /audit/packages
 * Generate an audit package
 * 
 * Requirements: 5.1
 */
export async function generatePackage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<GeneratePackageRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    // Validate scope
    if (!body.scope) {
      validationErrors.push({ field: 'scope', code: 'REQUIRED', message: 'scope is required' });
    } else {
      if (!body.scope.timeRange) {
        validationErrors.push({ field: 'scope.timeRange', code: 'REQUIRED', message: 'scope.timeRange is required' });
      } else {
        if (!body.scope.timeRange.startDate) {
          validationErrors.push({ field: 'scope.timeRange.startDate', code: 'REQUIRED', message: 'scope.timeRange.startDate is required' });
        } else if (!isValidISODate(body.scope.timeRange.startDate)) {
          validationErrors.push({ field: 'scope.timeRange.startDate', code: 'INVALID', message: 'scope.timeRange.startDate must be a valid ISO date' });
        }

        if (!body.scope.timeRange.endDate) {
          validationErrors.push({ field: 'scope.timeRange.endDate', code: 'REQUIRED', message: 'scope.timeRange.endDate is required' });
        } else if (!isValidISODate(body.scope.timeRange.endDate)) {
          validationErrors.push({ field: 'scope.timeRange.endDate', code: 'INVALID', message: 'scope.timeRange.endDate must be a valid ISO date' });
        }

        // Validate date range
        if (body.scope.timeRange.startDate && body.scope.timeRange.endDate &&
            isValidISODate(body.scope.timeRange.startDate) && isValidISODate(body.scope.timeRange.endDate)) {
          const startDate = new Date(body.scope.timeRange.startDate);
          const endDate = new Date(body.scope.timeRange.endDate);
          if (startDate > endDate) {
            validationErrors.push({ field: 'scope.timeRange', code: 'INVALID', message: 'startDate must be before endDate' });
          }
          // Limit to 90 days
          const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
          if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
            validationErrors.push({ field: 'scope.timeRange', code: 'INVALID', message: 'date range cannot exceed 90 days' });
          }
        }
      }
    }

    // Validate format
    if (!body.format) {
      validationErrors.push({ field: 'format', code: 'REQUIRED', message: 'format is required' });
    } else if (!VALID_EXPORT_FORMATS.includes(body.format)) {
      validationErrors.push({ 
        field: 'format', 
        code: 'INVALID', 
        message: `format must be one of: ${VALID_EXPORT_FORMATS.join(', ')}` 
      });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const auditPackage = await AuditPackageService.generatePackage(
      tenantId,
      body.scope,
      body.format
    );

    return successResponse(auditPackage, 201);
  } catch (error) {
    console.error('Error generating audit package:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/packages/{packageId}
 * Get package metadata
 */
export async function getPackage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const packageId = event.pathParameters?.packageId;
    if (!packageId) {
      return errorResponse(400, 'Missing package ID', 'MISSING_PARAMETER');
    }

    const auditPackage = await getPackageByIdWithTenant(tenantId, packageId);

    if (!auditPackage) {
      return errorResponse(404, 'Audit package not found', 'NOT_FOUND');
    }

    return successResponse(auditPackage);
  } catch (error) {
    console.error('Error getting audit package:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/packages/{packageId}/download
 * Get download URL for a package
 * 
 * Requirements: 5.6
 */
export async function getPackageDownloadUrl(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const packageId = event.pathParameters?.packageId;
    if (!packageId) {
      return errorResponse(400, 'Missing package ID', 'MISSING_PARAMETER');
    }

    const downloadUrl = await getDownloadUrlWithTenant(tenantId, packageId);

    return successResponse({
      packageId,
      downloadUrl,
      expiresIn: '1 hour',
      message: 'Download URL is valid for 1 hour'
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'Audit package not found', 'NOT_FOUND');
    }
    console.error('Error getting download URL:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/packages/{packageId}/verify
 * Verify package integrity
 */
export async function verifyPackageIntegrity(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const packageId = event.pathParameters?.packageId;
    if (!packageId) {
      return errorResponse(400, 'Missing package ID', 'MISSING_PARAMETER');
    }

    const isValid = await verifyIntegrityWithTenant(tenantId, packageId);

    return successResponse({
      packageId,
      integrityValid: isValid,
      verifiedAt: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'Audit package not found', 'NOT_FOUND');
    }
    console.error('Error verifying package integrity:', error);
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

  // POST /audit/packages
  if (method === 'POST' && path === '/audit/packages') {
    return generatePackage(event);
  }

  // GET /audit/packages/{packageId}/download
  if (method === 'GET' && path.match(/^\/audit\/packages\/[^/]+\/download$/)) {
    return getPackageDownloadUrl(event);
  }

  // GET /audit/packages/{packageId}/verify
  if (method === 'GET' && path.match(/^\/audit\/packages\/[^/]+\/verify$/)) {
    return verifyPackageIntegrity(event);
  }

  // GET /audit/packages/{packageId}
  if (method === 'GET' && path.match(/^\/audit\/packages\/[^/]+$/)) {
    return getPackage(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
