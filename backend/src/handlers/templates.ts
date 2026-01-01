import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TemplateRepository } from '../repositories/template';
import { ValidationError } from '../types/validation';

/**
 * Standard API response structure
 */
interface ApiResponse<T = unknown> {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
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
 * GET /templates
 * 
 * List all available strategy templates.
 * 
 * Requirements: 1.1
 */
export async function listTemplates(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const result = await TemplateRepository.listTemplates();
    
    return successResponse({
      templates: result.items,
      ...(result.lastEvaluatedKey && { nextToken: JSON.stringify(result.lastEvaluatedKey) })
    });
  } catch (error) {
    console.error('Error listing templates:', error);
    return errorResponse(
      500,
      'Internal server error',
      'INTERNAL_ERROR'
    );
  }
}

/**
 * GET /templates/{id}
 * 
 * Get a specific template by ID (latest version).
 * 
 * Requirements: 1.2
 */
export async function getTemplate(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const templateId = event.pathParameters?.id;
    if (!templateId) {
      return errorResponse(400, 'Missing template ID', 'MISSING_PARAMETER');
    }

    const template = await TemplateRepository.getTemplate(templateId);
    
    if (!template) {
      return errorResponse(404, `Template not found: ${templateId}`, 'NOT_FOUND');
    }

    return successResponse(template);
  } catch (error) {
    console.error('Error getting template:', error);
    return errorResponse(
      500,
      'Internal server error',
      'INTERNAL_ERROR'
    );
  }
}

/**
 * GET /templates/{id}/versions/{version}
 * 
 * Get a specific version of a template.
 * 
 * Requirements: 1.2
 */
export async function getTemplateVersion(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const templateId = event.pathParameters?.id;
    const versionStr = event.pathParameters?.version;

    if (!templateId) {
      return errorResponse(400, 'Missing template ID', 'MISSING_PARAMETER');
    }

    if (!versionStr) {
      return errorResponse(400, 'Missing version number', 'MISSING_PARAMETER');
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version) || version < 1) {
      return errorResponse(400, 'Invalid version number', 'INVALID_PARAMETER');
    }

    const template = await TemplateRepository.getTemplateVersion(templateId, version);
    
    if (!template) {
      return errorResponse(
        404,
        `Template version not found: ${templateId} v${version}`,
        'NOT_FOUND'
      );
    }

    return successResponse(template);
  } catch (error) {
    console.error('Error getting template version:', error);
    return errorResponse(
      500,
      'Internal server error',
      'INTERNAL_ERROR'
    );
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

  // Route: GET /templates
  if (method === 'GET' && path === '/templates') {
    return listTemplates(event);
  }

  // Route: GET /templates/{id}/versions/{version}
  if (method === 'GET' && path.match(/^\/templates\/[^/]+\/versions\/\d+$/)) {
    return getTemplateVersion(event);
  }

  // Route: GET /templates/{id}
  if (method === 'GET' && path.match(/^\/templates\/[^/]+$/)) {
    return getTemplate(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
