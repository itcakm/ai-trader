import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  createNewsContextService,
  NewsProvider,
  trackContextUsage,
  getContextUsageByAnalysis,
  getContextUsageByContextId
} from '../services/news-context';
import { generateUUID } from '../utils/uuid';
import { ValidationError } from '../types/validation';

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
 * Parse integer query parameter
 */
function parseIntParam(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Default news provider (stub implementation)
 * In production, this would connect to actual news repository
 */
const defaultNewsProvider: NewsProvider = {
  async getNews(symbol: string, startTime: string, endTime: string) {
    // In production, this would fetch from DynamoDB
    return [];
  }
};

/**
 * GET /news-context/{symbol}
 * 
 * Generate news context for a symbol.
 * 
 * Query parameters:
 * - timeWindowHours: Time window for news in hours (default: 24, max: 168)
 * - maxEvents: Maximum news events to include (default: 10, max: 10)
 * 
 * Requirements: 7.1
 */
export async function getNewsContext(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const symbol = event.pathParameters?.symbol;
    if (!symbol) {
      return errorResponse(400, 'Missing symbol', 'MISSING_PARAMETER');
    }

    const queryParams = event.queryStringParameters || {};
    
    const timeWindowHours = parseIntParam(queryParams.timeWindowHours, 24);
    const maxEvents = parseIntParam(queryParams.maxEvents, 10);

    // Validate timeWindowHours
    if (timeWindowHours < 1 || timeWindowHours > 168) {
      return errorResponse(400, 'timeWindowHours must be between 1 and 168', 'INVALID_PARAMETER');
    }

    // Validate maxEvents (capped at 10 per Requirements 7.2)
    if (maxEvents < 1 || maxEvents > 10) {
      return errorResponse(400, 'maxEvents must be between 1 and 10', 'INVALID_PARAMETER');
    }

    const newsContextService = createNewsContextService(defaultNewsProvider);
    const newsContext = await newsContextService.generateNewsContext(symbol, timeWindowHours, maxEvents);

    // Generate a context ID for tracking
    const contextId = generateUUID();

    return successResponse({
      contextId,
      ...newsContext
    });
  } catch (error) {
    console.error('Error getting news context:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Request body for tracking context usage
 */
interface TrackContextUsageRequest {
  contextId: string;
  analysisId: string;
}

/**
 * POST /news-context/{symbol}/track
 * 
 * Track news context usage for auditability.
 * 
 * Requirements: 7.5
 */
export async function trackNewsContextUsage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const symbol = event.pathParameters?.symbol;
    if (!symbol) {
      return errorResponse(400, 'Missing symbol', 'MISSING_PARAMETER');
    }

    const body = parseBody<TrackContextUsageRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.contextId) {
      return errorResponse(400, 'Missing contextId', 'MISSING_PARAMETER', [
        { field: 'contextId', code: 'REQUIRED', message: 'contextId is required' }
      ]);
    }

    if (!body.analysisId) {
      return errorResponse(400, 'Missing analysisId', 'MISSING_PARAMETER', [
        { field: 'analysisId', code: 'REQUIRED', message: 'analysisId is required' }
      ]);
    }

    // Generate news context to get event IDs for tracking
    const newsContextService = createNewsContextService(defaultNewsProvider);
    const newsContext = await newsContextService.generateNewsContext(symbol, 24, 10);

    // Track the usage
    const trackingRecord = trackContextUsage(body.contextId, body.analysisId, newsContext);

    return successResponse(trackingRecord, 201);
  } catch (error) {
    console.error('Error tracking news context usage:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /news-context/tracking/analysis/{analysisId}
 * 
 * Get context usage records by analysis ID.
 * 
 * Requirements: 7.5
 */
export async function getContextUsageByAnalysisId(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const analysisId = event.pathParameters?.analysisId;
    if (!analysisId) {
      return errorResponse(400, 'Missing analysisId', 'MISSING_PARAMETER');
    }

    const records = getContextUsageByAnalysis(analysisId);

    return successResponse({
      analysisId,
      records,
      count: records.length
    });
  } catch (error) {
    console.error('Error getting context usage by analysis:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /news-context/tracking/context/{contextId}
 * 
 * Get context usage records by context ID.
 * 
 * Requirements: 7.5
 */
export async function getContextUsageByContext(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const contextId = event.pathParameters?.contextId;
    if (!contextId) {
      return errorResponse(400, 'Missing contextId', 'MISSING_PARAMETER');
    }

    const records = getContextUsageByContextId(contextId);

    return successResponse({
      contextId,
      records,
      count: records.length
    });
  } catch (error) {
    console.error('Error getting context usage by context:', error);
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

  // Route: GET /news-context/tracking/analysis/{analysisId}
  if (method === 'GET' && path.match(/^\/news-context\/tracking\/analysis\/[^/]+$/)) {
    return getContextUsageByAnalysisId(event);
  }

  // Route: GET /news-context/tracking/context/{contextId}
  if (method === 'GET' && path.match(/^\/news-context\/tracking\/context\/[^/]+$/)) {
    return getContextUsageByContext(event);
  }

  // Route: POST /news-context/{symbol}/track
  if (method === 'POST' && path.match(/^\/news-context\/[^/]+\/track$/)) {
    return trackNewsContextUsage(event);
  }

  // Route: GET /news-context/{symbol}
  if (method === 'GET' && path.match(/^\/news-context\/[^/]+$/)) {
    return getNewsContext(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
