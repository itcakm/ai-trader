/**
 * Audit Log Export Handler
 * 
 * Handles exporting authentication audit logs for compliance reporting.
 * Supports date range filtering and CSV/JSON output formats.
 * 
 * Requirements: 11.10
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AuthAuditService, AuthAuditEntry } from '../../services/auth-audit';
import { validateRequest, isValidationSuccess } from '../../middleware/jwt-validator';
import { hasPermission } from '../../services/rbac';
import { AuthError, AUTH_ERROR_CODES, UserContext } from '../../types/auth';

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

/**
 * Export format types
 */
type ExportFormat = 'json' | 'csv';

/**
 * Export request query parameters
 */
interface ExportQueryParams {
  startDate: string;
  endDate: string;
  format?: ExportFormat;
  userId?: string;
  eventType?: string;
}

/**
 * Create a success response
 */
function successResponse<T>(
  data: T, 
  statusCode = 200,
  contentType = 'application/json'
): APIGatewayProxyResult {
  const headers = { ...CORS_HEADERS, 'Content-Type': contentType };
  
  return {
    statusCode,
    headers,
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

/**
 * Create an error response with sanitized message
 */
function errorResponse(
  statusCode: number,
  message: string,
  code: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      error: 'AuthError',
      code,
      message
    })
  };
}

/**
 * Validate ISO date string format
 */
function isValidISODate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && dateStr.match(/^\d{4}-\d{2}-\d{2}/) !== null;
}

/**
 * Parse and validate query parameters
 */
function parseQueryParams(event: APIGatewayProxyEvent): ExportQueryParams | null {
  const params = event.queryStringParameters || {};
  
  const startDate = params.startDate;
  const endDate = params.endDate;
  const format = (params.format || 'json') as ExportFormat;
  const userId = params.userId;
  const eventType = params.eventType;

  if (!startDate || !endDate) {
    return null;
  }

  if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
    return null;
  }

  if (format !== 'json' && format !== 'csv') {
    return null;
  }

  return { startDate, endDate, format, userId, eventType };
}

/**
 * Convert audit entries to CSV format
 */
function convertToCSV(entries: AuthAuditEntry[]): string {
  if (entries.length === 0) {
    return 'entryId,timestamp,event,userId,email,tenantId,ip,userAgent,success,reason\n';
  }

  const headers = [
    'entryId',
    'timestamp',
    'event',
    'userId',
    'email',
    'tenantId',
    'ip',
    'userAgent',
    'success',
    'reason'
  ];

  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = entries.map(entry => 
    headers.map(header => escapeCSV(entry[header as keyof AuthAuditEntry])).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * GET /auth/audit/export
 * 
 * Export audit logs for compliance reporting.
 * Requires ADMIN or ANALYST role.
 * 
 * Query Parameters:
 * - startDate: ISO date string (required)
 * - endDate: ISO date string (required)
 * - format: 'json' or 'csv' (default: 'json')
 * - userId: Filter by specific user (optional)
 * - eventType: Filter by event type (optional)
 * 
 * Requirements: 11.10
 */
export async function exportAuditLogs(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Validate JWT and get user context
    const validationResult = await validateRequest(event);
    
    if (!isValidationSuccess(validationResult)) {
      return {
        statusCode: 401,
        headers: {
          ...CORS_HEADERS,
          'WWW-Authenticate': 'Bearer realm="api"'
        },
        body: JSON.stringify({
          error: 'AuthError',
          code: AUTH_ERROR_CODES.INVALID_TOKEN,
          message: validationResult.error || 'Invalid or missing authentication token'
        })
      };
    }

    const user = validationResult.user as UserContext;

    // Check permissions - require read:audit-logs permission
    if (!hasPermission(user, 'read:audit-logs')) {
      return errorResponse(
        403,
        'Insufficient permissions to export audit logs',
        AUTH_ERROR_CODES.INSUFFICIENT_PERMISSIONS
      );
    }

    // Parse and validate query parameters
    const params = parseQueryParams(event);
    
    if (!params) {
      return errorResponse(
        400,
        'Invalid query parameters. Required: startDate, endDate (ISO format). Optional: format (json|csv), userId, eventType',
        AUTH_ERROR_CODES.INVALID_REQUEST
      );
    }

    const { startDate, endDate, format, userId, eventType } = params;

    // Validate date range (max 90 days)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 90) {
      return errorResponse(
        400,
        'Date range cannot exceed 90 days',
        AUTH_ERROR_CODES.INVALID_REQUEST
      );
    }

    if (start > end) {
      return errorResponse(
        400,
        'startDate must be before endDate',
        AUTH_ERROR_CODES.INVALID_REQUEST
      );
    }

    // Export audit logs
    // Non-super-admins can only export their own tenant's logs
    const tenantId = user.roles.includes('SUPER_ADMIN') 
      ? (event.queryStringParameters?.tenantId || user.tenantId)
      : user.tenantId;

    let entries = await AuthAuditService.exportAuditLogs(
      tenantId,
      startDate,
      endDate
    );

    // Apply additional filters if provided
    if (userId) {
      entries = entries.filter(e => e.userId === userId);
    }

    if (eventType) {
      entries = entries.filter(e => e.event === eventType);
    }

    // Log the export action for audit purposes
    console.log(JSON.stringify({
      type: 'AUDIT_EXPORT',
      userId: user.userId,
      tenantId: user.tenantId,
      exportTenantId: tenantId,
      startDate,
      endDate,
      format,
      recordCount: entries.length,
      timestamp: new Date().toISOString()
    }));

    // Return in requested format
    if (format === 'csv') {
      const csv = convertToCSV(entries);
      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-export-${startDate}-${endDate}.csv"`
        },
        body: csv
      };
    }

    // Default JSON format
    return successResponse({
      tenantId,
      startDate,
      endDate,
      recordCount: entries.length,
      entries
    });

  } catch (error) {
    // Handle known auth errors
    if (error instanceof AuthError) {
      return errorResponse(
        error.statusCode,
        error.message,
        error.code
      );
    }

    // Log unexpected errors
    console.error('Audit export error:', error);
    return errorResponse(500, 'Failed to export audit logs', AUTH_ERROR_CODES.AUTH_ERROR);
  }
}

/**
 * Handler for Lambda invocation
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

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  return exportAuditLogs(event);
}
