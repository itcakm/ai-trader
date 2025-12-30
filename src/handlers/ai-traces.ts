import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AITraceService, AITraceServiceExtended, validateAITraceInput } from '../services/ai-trace';
import { AITraceInput, AIAnalysisType } from '../types/ai-trace';
import { ValidationError } from '../types/validation';

/**
 * AI Trace API Handlers
 * 
 * Implements endpoints for AI trace logging and retrieval:
 * - POST /audit/ai-traces - Log an AI trace
 * - GET /audit/ai-traces/{traceId} - Get AI trace by ID
 * - GET /audit/ai-traces/correlation/{correlationId} - Get traces by correlation ID
 * - POST /audit/ai-traces/{traceId}/link - Link trace to decision
 * 
 * Requirements: 2.1, 2.3
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


const VALID_ANALYSIS_TYPES: AIAnalysisType[] = [
  'REGIME_CLASSIFICATION', 'STRATEGY_EXPLANATION', 'PARAMETER_SUGGESTION',
  'RISK_ASSESSMENT', 'MARKET_ANALYSIS'
];

/**
 * POST /audit/ai-traces
 * Log an AI trace
 * 
 * Requirements: 2.1
 */
export async function logAITrace(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<Omit<AITraceInput, 'tenantId'>>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    // Validate required fields
    if (!body.analysisType) {
      validationErrors.push({ field: 'analysisType', code: 'REQUIRED', message: 'analysisType is required' });
    } else if (!VALID_ANALYSIS_TYPES.includes(body.analysisType)) {
      validationErrors.push({ 
        field: 'analysisType', 
        code: 'INVALID', 
        message: `analysisType must be one of: ${VALID_ANALYSIS_TYPES.join(', ')}` 
      });
    }

    if (!body.promptTemplateId) {
      validationErrors.push({ field: 'promptTemplateId', code: 'REQUIRED', message: 'promptTemplateId is required' });
    }

    if (typeof body.promptVersion !== 'number' || body.promptVersion < 1) {
      validationErrors.push({ field: 'promptVersion', code: 'INVALID', message: 'promptVersion must be a positive number' });
    }

    if (!body.renderedPrompt) {
      validationErrors.push({ field: 'renderedPrompt', code: 'REQUIRED', message: 'renderedPrompt is required' });
    }

    if (!body.inputSnapshot) {
      validationErrors.push({ field: 'inputSnapshot', code: 'REQUIRED', message: 'inputSnapshot is required' });
    } else {
      if (!body.inputSnapshot.marketDataHash) {
        validationErrors.push({ field: 'inputSnapshot.marketDataHash', code: 'REQUIRED', message: 'inputSnapshot.marketDataHash is required' });
      }
      if (!body.inputSnapshot.marketDataSnapshot) {
        validationErrors.push({ field: 'inputSnapshot.marketDataSnapshot', code: 'REQUIRED', message: 'inputSnapshot.marketDataSnapshot is required' });
      }
    }

    if (body.rawOutput === undefined || body.rawOutput === null) {
      validationErrors.push({ field: 'rawOutput', code: 'REQUIRED', message: 'rawOutput is required' });
    }

    if (!body.modelId) {
      validationErrors.push({ field: 'modelId', code: 'REQUIRED', message: 'modelId is required' });
    }

    if (!body.modelVersion) {
      validationErrors.push({ field: 'modelVersion', code: 'REQUIRED', message: 'modelVersion is required' });
    }

    if (typeof body.processingTimeMs !== 'number' || body.processingTimeMs < 0) {
      validationErrors.push({ field: 'processingTimeMs', code: 'INVALID', message: 'processingTimeMs must be a non-negative number' });
    }

    if (!body.tokenUsage) {
      validationErrors.push({ field: 'tokenUsage', code: 'REQUIRED', message: 'tokenUsage is required' });
    }

    if (typeof body.costUsd !== 'number' || body.costUsd < 0) {
      validationErrors.push({ field: 'costUsd', code: 'INVALID', message: 'costUsd must be a non-negative number' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const input: AITraceInput = {
      ...body,
      tenantId
    };

    const trace = await AITraceService.logAITrace(input);
    return successResponse(trace, 201);
  } catch (error) {
    console.error('Error logging AI trace:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/ai-traces/{traceId}
 * Get AI trace by ID
 * 
 * Requirements: 2.3
 */
export async function getAITrace(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const traceId = event.pathParameters?.traceId;
    if (!traceId) {
      return errorResponse(400, 'Missing trace ID', 'MISSING_PARAMETER');
    }

    // Timestamp is required to construct the S3 key
    const timestamp = event.queryStringParameters?.timestamp;
    if (!timestamp) {
      return errorResponse(400, 'Missing timestamp', 'MISSING_PARAMETER', [
        { field: 'timestamp', code: 'REQUIRED', message: 'timestamp query parameter is required' }
      ]);
    }

    const trace = await AITraceServiceExtended.getTrace(tenantId, timestamp, traceId);

    if (!trace) {
      return errorResponse(404, 'AI trace not found', 'NOT_FOUND');
    }

    return successResponse(trace);
  } catch (error) {
    console.error('Error getting AI trace:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/ai-traces/correlation/{correlationId}
 * Get AI traces by correlation ID
 * 
 * Requirements: 2.3
 */
export async function getAITracesByCorrelation(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const correlationId = event.pathParameters?.correlationId;
    if (!correlationId) {
      return errorResponse(400, 'Missing correlation ID', 'MISSING_PARAMETER');
    }

    // Optional date range filters
    const startDate = event.queryStringParameters?.startDate 
      ? new Date(event.queryStringParameters.startDate) 
      : undefined;
    const endDate = event.queryStringParameters?.endDate 
      ? new Date(event.queryStringParameters.endDate) 
      : undefined;

    const traces = await AITraceServiceExtended.getTracesByCorrelationId(
      tenantId,
      correlationId,
      startDate,
      endDate
    );

    return successResponse({
      correlationId,
      traces,
      count: traces.length
    });
  } catch (error) {
    console.error('Error getting AI traces by correlation:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/ai-traces/{traceId}/link
 * Link an AI trace to a trade decision
 * 
 * Requirements: 2.3
 */
export async function linkTraceToDecision(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const traceId = event.pathParameters?.traceId;
    if (!traceId) {
      return errorResponse(400, 'Missing trace ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<{ correlationId: string; timestamp: string }>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.correlationId) {
      return errorResponse(400, 'Missing correlationId', 'MISSING_PARAMETER', [
        { field: 'correlationId', code: 'REQUIRED', message: 'correlationId is required' }
      ]);
    }

    if (!body.timestamp) {
      return errorResponse(400, 'Missing timestamp', 'MISSING_PARAMETER', [
        { field: 'timestamp', code: 'REQUIRED', message: 'timestamp is required' }
      ]);
    }

    await AITraceServiceExtended.linkToDecision(tenantId, body.timestamp, traceId, body.correlationId);

    return successResponse({ 
      message: 'Trace linked to decision successfully',
      traceId,
      correlationId: body.correlationId
    });
  } catch (error) {
    console.error('Error linking trace to decision:', error);
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

  // POST /audit/ai-traces
  if (method === 'POST' && path === '/audit/ai-traces') {
    return logAITrace(event);
  }

  // POST /audit/ai-traces/{traceId}/link
  if (method === 'POST' && path.match(/^\/audit\/ai-traces\/[^/]+\/link$/)) {
    return linkTraceToDecision(event);
  }

  // GET /audit/ai-traces/correlation/{correlationId}
  if (method === 'GET' && path.match(/^\/audit\/ai-traces\/correlation\/[^/]+$/)) {
    return getAITracesByCorrelation(event);
  }

  // GET /audit/ai-traces/{traceId}
  if (method === 'GET' && path.match(/^\/audit\/ai-traces\/[^/]+$/)) {
    return getAITrace(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
