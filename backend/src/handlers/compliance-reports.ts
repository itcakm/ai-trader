import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  ComplianceReportService, 
  ComplianceReportServiceExtended 
} from '../services/compliance-report';
import { 
  ReportTemplate, 
  ReportFilters, 
  ReportSchedule 
} from '../types/compliance-report';
import { ValidationError } from '../types/validation';

/**
 * Compliance Report API Handlers
 * 
 * Implements endpoints for compliance report management:
 * - POST /audit/reports/templates - Create/update report template
 * - GET /audit/reports/templates - List templates
 * - GET /audit/reports/templates/{templateId} - Get template
 * - POST /audit/reports/generate - Generate a report
 * - GET /audit/reports/{reportId} - Get report
 * - GET /audit/reports - Get report history
 * - POST /audit/reports/schedules - Create schedule
 * - GET /audit/reports/schedules - List schedules
 * 
 * Requirements: 6.1, 6.2, 6.5
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


interface GenerateReportRequest {
  templateId: string;
  filters?: ReportFilters;
}

/**
 * POST /audit/reports/templates
 * Create or update a report template
 * 
 * Requirements: 6.1
 */
export async function saveTemplate(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const body = parseBody<ReportTemplate>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    if (!body.templateId) {
      validationErrors.push({ field: 'templateId', code: 'REQUIRED', message: 'templateId is required' });
    }

    if (!body.name) {
      validationErrors.push({ field: 'name', code: 'REQUIRED', message: 'name is required' });
    }

    if (!body.description) {
      validationErrors.push({ field: 'description', code: 'REQUIRED', message: 'description is required' });
    }

    if (!Array.isArray(body.sections)) {
      validationErrors.push({ field: 'sections', code: 'REQUIRED', message: 'sections must be an array' });
    } else {
      for (let i = 0; i < body.sections.length; i++) {
        const section = body.sections[i];
        if (!section.sectionId) {
          validationErrors.push({ field: `sections[${i}].sectionId`, code: 'REQUIRED', message: 'sectionId is required' });
        }
        if (!section.title) {
          validationErrors.push({ field: `sections[${i}].title`, code: 'REQUIRED', message: 'title is required' });
        }
        if (!section.type || !['SUMMARY', 'TABLE', 'CHART', 'TEXT'].includes(section.type)) {
          validationErrors.push({ field: `sections[${i}].type`, code: 'INVALID', message: 'type must be SUMMARY, TABLE, CHART, or TEXT' });
        }
        if (!section.dataQuery) {
          validationErrors.push({ field: `sections[${i}].dataQuery`, code: 'REQUIRED', message: 'dataQuery is required' });
        }
      }
    }

    if (!body.format || !['PDF', 'HTML', 'XLSX'].includes(body.format)) {
      validationErrors.push({ field: 'format', code: 'INVALID', message: 'format must be PDF, HTML, or XLSX' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const template = await ComplianceReportService.saveTemplate(body);
    return successResponse(template, 201);
  } catch (error) {
    console.error('Error saving template:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/reports/templates
 * List all templates
 */
export async function listTemplates(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const templates = await ComplianceReportServiceExtended.listTemplates();
    return successResponse({ templates, count: templates.length });
  } catch (error) {
    console.error('Error listing templates:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/reports/templates/{templateId}
 * Get a specific template
 */
export async function getTemplate(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const templateId = event.pathParameters?.templateId;
    if (!templateId) {
      return errorResponse(400, 'Missing template ID', 'MISSING_PARAMETER');
    }

    const template = await ComplianceReportServiceExtended.getTemplate(templateId);

    if (!template) {
      return errorResponse(404, 'Template not found', 'NOT_FOUND');
    }

    return successResponse(template);
  } catch (error) {
    console.error('Error getting template:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/reports/generate
 * Generate a compliance report
 * 
 * Requirements: 6.2
 */
export async function generateReport(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<GenerateReportRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    if (!body.templateId) {
      validationErrors.push({ field: 'templateId', code: 'REQUIRED', message: 'templateId is required' });
    }

    // Validate filters if provided
    if (body.filters?.dateRange) {
      if (body.filters.dateRange.startDate && !isValidISODate(body.filters.dateRange.startDate)) {
        validationErrors.push({ field: 'filters.dateRange.startDate', code: 'INVALID', message: 'startDate must be a valid ISO date' });
      }
      if (body.filters.dateRange.endDate && !isValidISODate(body.filters.dateRange.endDate)) {
        validationErrors.push({ field: 'filters.dateRange.endDate', code: 'INVALID', message: 'endDate must be a valid ISO date' });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const report = await ComplianceReportService.generateReport(
      tenantId,
      body.templateId,
      body.filters || {}
    );

    return successResponse(report, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Template not found')) {
      return errorResponse(404, 'Template not found', 'NOT_FOUND');
    }
    console.error('Error generating report:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/reports/{reportId}
 * Get a specific report
 * 
 * Requirements: 6.5
 */
export async function getReport(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const reportId = event.pathParameters?.reportId;
    if (!reportId) {
      return errorResponse(400, 'Missing report ID', 'MISSING_PARAMETER');
    }

    // Timestamp is required to construct the S3 key
    const generatedAt = event.queryStringParameters?.generatedAt;
    if (!generatedAt) {
      return errorResponse(400, 'Missing generatedAt', 'MISSING_PARAMETER', [
        { field: 'generatedAt', code: 'REQUIRED', message: 'generatedAt query parameter is required' }
      ]);
    }

    const report = await ComplianceReportServiceExtended.getReport(tenantId, reportId, generatedAt);

    if (!report) {
      return errorResponse(404, 'Report not found', 'NOT_FOUND');
    }

    return successResponse(report);
  } catch (error) {
    console.error('Error getting report:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/reports
 * Get report history
 * 
 * Requirements: 6.5
 */
export async function getReportHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const templateId = event.queryStringParameters?.templateId;

    const reports = await ComplianceReportService.getReportHistory(tenantId, templateId);

    return successResponse({
      reports,
      count: reports.length,
      ...(templateId && { templateId })
    });
  } catch (error) {
    console.error('Error getting report history:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/reports/schedules
 * Create a report schedule
 */
export async function createSchedule(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<Omit<ReportSchedule, 'tenantId'>>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    if (!body.templateId) {
      validationErrors.push({ field: 'templateId', code: 'REQUIRED', message: 'templateId is required' });
    }

    if (!body.frequency || !['DAILY', 'WEEKLY', 'MONTHLY'].includes(body.frequency)) {
      validationErrors.push({ field: 'frequency', code: 'INVALID', message: 'frequency must be DAILY, WEEKLY, or MONTHLY' });
    }

    if (!Array.isArray(body.deliveryChannels) || body.deliveryChannels.length === 0) {
      validationErrors.push({ field: 'deliveryChannels', code: 'REQUIRED', message: 'deliveryChannels must be a non-empty array' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const schedule: ReportSchedule = {
      ...body,
      tenantId,
      scheduleId: body.scheduleId || '',
      filters: body.filters || {},
      enabled: body.enabled ?? true,
      nextRunAt: body.nextRunAt || ''
    };

    const savedSchedule = await ComplianceReportService.scheduleReport(schedule);
    return successResponse(savedSchedule, 201);
  } catch (error) {
    console.error('Error creating schedule:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/reports/schedules
 * List schedules for tenant
 */
export async function listSchedules(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const schedules = await ComplianceReportServiceExtended.getSchedules(tenantId);

    return successResponse({ schedules, count: schedules.length });
  } catch (error) {
    console.error('Error listing schedules:', error);
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

  // POST /audit/reports/templates
  if (method === 'POST' && path === '/audit/reports/templates') {
    return saveTemplate(event);
  }

  // GET /audit/reports/templates
  if (method === 'GET' && path === '/audit/reports/templates') {
    return listTemplates(event);
  }

  // GET /audit/reports/templates/{templateId}
  if (method === 'GET' && path.match(/^\/audit\/reports\/templates\/[^/]+$/)) {
    return getTemplate(event);
  }

  // POST /audit/reports/generate
  if (method === 'POST' && path === '/audit/reports/generate') {
    return generateReport(event);
  }

  // POST /audit/reports/schedules
  if (method === 'POST' && path === '/audit/reports/schedules') {
    return createSchedule(event);
  }

  // GET /audit/reports/schedules
  if (method === 'GET' && path === '/audit/reports/schedules') {
    return listSchedules(event);
  }

  // GET /audit/reports/{reportId}
  if (method === 'GET' && path.match(/^\/audit\/reports\/[^/]+$/) && 
      !path.includes('/templates') && !path.includes('/schedules') && !path.includes('/generate')) {
    return getReport(event);
  }

  // GET /audit/reports
  if (method === 'GET' && path === '/audit/reports') {
    return getReportHistory(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
