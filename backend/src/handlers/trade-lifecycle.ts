import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TradeLifecycleService, validateTradeEventInput } from '../services/trade-lifecycle';
import { TradeEventInput, TradeEventType } from '../types/trade-lifecycle';
import { ValidationError } from '../types/validation';

/**
 * Trade Lifecycle API Handlers
 * 
 * Implements endpoints for trade lifecycle logging:
 * - POST /audit/trade-events - Log a trade event
 * - GET /audit/trade-events/{correlationId} - Get trade lifecycle by correlation ID
 * - GET /audit/trade-events/{correlationId}/latency - Get latency metrics
 * 
 * Requirements: 1.1, 1.3
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


const VALID_EVENT_TYPES: TradeEventType[] = [
  'SIGNAL_GENERATED', 'ORDER_CREATED', 'ORDER_SUBMITTED', 'ORDER_ACKNOWLEDGED',
  'PARTIAL_FILL', 'COMPLETE_FILL', 'ORDER_CANCELLED', 'ORDER_REJECTED', 'ORDER_EXPIRED'
];

/**
 * POST /audit/trade-events
 * Log a trade event
 * 
 * Requirements: 1.1
 */
export async function logTradeEvent(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<Omit<TradeEventInput, 'tenantId'>>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    // Validate required fields
    if (!body.tradeCorrelationId) {
      validationErrors.push({ field: 'tradeCorrelationId', code: 'REQUIRED', message: 'tradeCorrelationId is required' });
    }

    if (!body.eventType) {
      validationErrors.push({ field: 'eventType', code: 'REQUIRED', message: 'eventType is required' });
    } else if (!VALID_EVENT_TYPES.includes(body.eventType)) {
      validationErrors.push({ 
        field: 'eventType', 
        code: 'INVALID', 
        message: `eventType must be one of: ${VALID_EVENT_TYPES.join(', ')}` 
      });
    }

    if (!body.orderDetails) {
      validationErrors.push({ field: 'orderDetails', code: 'REQUIRED', message: 'orderDetails is required' });
    } else {
      if (!body.orderDetails.orderId) {
        validationErrors.push({ field: 'orderDetails.orderId', code: 'REQUIRED', message: 'orderDetails.orderId is required' });
      }
      if (!body.orderDetails.symbol) {
        validationErrors.push({ field: 'orderDetails.symbol', code: 'REQUIRED', message: 'orderDetails.symbol is required' });
      }
      if (!body.orderDetails.side || !['BUY', 'SELL'].includes(body.orderDetails.side)) {
        validationErrors.push({ field: 'orderDetails.side', code: 'INVALID', message: 'orderDetails.side must be BUY or SELL' });
      }
      if (!body.orderDetails.orderType || !['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'].includes(body.orderDetails.orderType)) {
        validationErrors.push({ field: 'orderDetails.orderType', code: 'INVALID', message: 'orderDetails.orderType must be MARKET, LIMIT, STOP, or STOP_LIMIT' });
      }
    }

    if (!body.strategyId) {
      validationErrors.push({ field: 'strategyId', code: 'REQUIRED', message: 'strategyId is required' });
    }

    if (!Array.isArray(body.triggerConditions)) {
      validationErrors.push({ field: 'triggerConditions', code: 'REQUIRED', message: 'triggerConditions must be an array' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const input: TradeEventInput = {
      ...body,
      tenantId
    };

    const tradeEvent = await TradeLifecycleService.logTradeEvent(input);
    return successResponse(tradeEvent, 201);
  } catch (error) {
    console.error('Error logging trade event:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/trade-events/{correlationId}
 * Get trade lifecycle by correlation ID
 * 
 * Requirements: 1.3
 */
export async function getTradeLifecycle(
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

    const events = await TradeLifecycleService.getTradeLifecycle(tenantId, correlationId);

    if (events.length === 0) {
      return errorResponse(404, 'Trade lifecycle not found', 'NOT_FOUND');
    }

    return successResponse({
      tradeCorrelationId: correlationId,
      events,
      eventCount: events.length
    });
  } catch (error) {
    console.error('Error getting trade lifecycle:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/trade-events/{correlationId}/latency
 * Get latency metrics for a trade lifecycle
 * 
 * Requirements: 1.6
 */
export async function getTradeLatencyMetrics(
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

    const metrics = await TradeLifecycleService.getLatencyMetrics(tenantId, correlationId);

    if (metrics.stageLatencies.length === 0) {
      return errorResponse(404, 'Trade lifecycle not found or has no latency data', 'NOT_FOUND');
    }

    return successResponse(metrics);
  } catch (error) {
    console.error('Error getting latency metrics:', error);
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

  // POST /audit/trade-events
  if (method === 'POST' && path === '/audit/trade-events') {
    return logTradeEvent(event);
  }

  // GET /audit/trade-events/{correlationId}/latency
  if (method === 'GET' && path.match(/^\/audit\/trade-events\/[^/]+\/latency$/)) {
    return getTradeLatencyMetrics(event);
  }

  // GET /audit/trade-events/{correlationId}
  if (method === 'GET' && path.match(/^\/audit\/trade-events\/[^/]+$/)) {
    return getTradeLifecycle(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
