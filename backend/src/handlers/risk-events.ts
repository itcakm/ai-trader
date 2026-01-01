import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RiskEventService } from '../services/risk-event';
import { TenantAccessDeniedError } from '../db/access';
import { RiskEventFilters, RiskEventType, RiskEventSeverity } from '../types/risk-event';

/**
 * Risk Event API Handlers
 * 
 * Implements endpoints for risk event querying:
 * - GET /risk-events - Get risk events with filters
 * - GET /risk-events/stats - Get event statistics
 * - GET /risk-events/aggregated - Get aggregated event data
 * 
 * Requirements: 10.1
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

const VALID_EVENT_TYPES: RiskEventType[] = [
  'LIMIT_BREACH', 'LIMIT_WARNING', 'DRAWDOWN_WARNING', 'DRAWDOWN_BREACH',
  'VOLATILITY_THROTTLE', 'CIRCUIT_BREAKER_TRIP', 'CIRCUIT_BREAKER_RESET',
  'KILL_SWITCH_ACTIVATED', 'KILL_SWITCH_DEACTIVATED', 'ORDER_REJECTED', 'EXCHANGE_ERROR'
];

const VALID_SEVERITIES: RiskEventSeverity[] = ['INFO', 'WARNING', 'CRITICAL', 'EMERGENCY'];


/**
 * GET /risk-events
 * Get risk events with optional filters
 * 
 * Query parameters:
 * - eventTypes: Comma-separated list of event types
 * - severities: Comma-separated list of severities
 * - strategyId: Filter by strategy
 * - assetId: Filter by asset
 * - startTime: ISO timestamp for start of range
 * - endTime: ISO timestamp for end of range
 * - limit: Maximum number of events to return
 * 
 * Requirements: 10.1
 */
export async function getRiskEvents(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const queryParams = event.queryStringParameters || {};
    
    // Parse filters from query parameters
    const filters: RiskEventFilters = {};

    // Parse event types
    if (queryParams.eventTypes) {
      const types = queryParams.eventTypes.split(',').map(t => t.trim()) as RiskEventType[];
      const invalidTypes = types.filter(t => !VALID_EVENT_TYPES.includes(t));
      if (invalidTypes.length > 0) {
        return errorResponse(400, `Invalid event types: ${invalidTypes.join(', ')}`, 'INVALID_PARAMETER');
      }
      filters.eventTypes = types;
    }

    // Parse severities
    if (queryParams.severities) {
      const severities = queryParams.severities.split(',').map(s => s.trim()) as RiskEventSeverity[];
      const invalidSeverities = severities.filter(s => !VALID_SEVERITIES.includes(s));
      if (invalidSeverities.length > 0) {
        return errorResponse(400, `Invalid severities: ${invalidSeverities.join(', ')}`, 'INVALID_PARAMETER');
      }
      filters.severities = severities;
    }

    // Parse other filters
    if (queryParams.strategyId) {
      filters.strategyId = queryParams.strategyId;
    }

    if (queryParams.assetId) {
      filters.assetId = queryParams.assetId;
    }

    if (queryParams.startTime) {
      filters.startTime = queryParams.startTime;
    }

    if (queryParams.endTime) {
      filters.endTime = queryParams.endTime;
    }

    if (queryParams.limit) {
      const limit = parseInt(queryParams.limit, 10);
      if (isNaN(limit) || limit <= 0) {
        return errorResponse(400, 'Invalid limit parameter', 'INVALID_PARAMETER');
      }
      filters.limit = Math.min(limit, 1000); // Cap at 1000
    }

    const events = await RiskEventService.getEvents(tenantId, filters);
    return successResponse({ events, count: events.length });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting risk events:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /risk-events/stats
 * Get event statistics for a period
 * 
 * Query parameters:
 * - period: Period string (e.g., '24h', '7d', '30d')
 * 
 * Requirements: 10.6
 */
export async function getRiskEventStats(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const period = event.queryStringParameters?.period || '24h';
    
    // Validate period format
    if (!period.match(/^\d+[hdwm]$/)) {
      return errorResponse(400, 'Invalid period format. Use format like 24h, 7d, 4w, 1m', 'INVALID_PARAMETER');
    }

    const stats = await RiskEventService.getEventStats(tenantId, period);
    return successResponse(stats);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting risk event stats:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * GET /risk-events/aggregated
 * Get aggregated event data for trend analysis
 * 
 * Query parameters:
 * - period: Period string (e.g., '24h', '7d', '30d')
 * - groupBy: Field to group by ('eventType', 'severity', 'hour', 'day')
 * 
 * Requirements: 10.6
 */
export async function getAggregatedEvents(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const queryParams = event.queryStringParameters || {};
    const period = queryParams.period || '24h';
    const groupBy = queryParams.groupBy || 'eventType';

    // Validate period format
    if (!period.match(/^\d+[hdwm]$/)) {
      return errorResponse(400, 'Invalid period format. Use format like 24h, 7d, 4w, 1m', 'INVALID_PARAMETER');
    }

    // Validate groupBy
    const validGroupBy = ['eventType', 'severity', 'hour', 'day'];
    if (!validGroupBy.includes(groupBy)) {
      return errorResponse(400, `Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`, 'INVALID_PARAMETER');
    }

    const aggregated = await RiskEventService.getAggregatedEvents(
      tenantId,
      period,
      groupBy as 'eventType' | 'severity' | 'hour' | 'day'
    );

    return successResponse({ aggregated, period, groupBy });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting aggregated events:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /risk-events/trend/{eventType}
 * Get trend data for a specific event type
 * 
 * Query parameters:
 * - period: Period string (e.g., '24h', '7d', '30d')
 * 
 * Requirements: 10.6
 */
export async function getEventTrend(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const eventType = event.pathParameters?.eventType as RiskEventType;
    if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
      return errorResponse(400, `Invalid event type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`, 'INVALID_PARAMETER');
    }

    const period = event.queryStringParameters?.period || '24h';

    // Validate period format
    if (!period.match(/^\d+[hdwm]$/)) {
      return errorResponse(400, 'Invalid period format. Use format like 24h, 7d, 4w, 1m', 'INVALID_PARAMETER');
    }

    const trend = await RiskEventService.getEventTrend(tenantId, eventType, period);

    return successResponse({ eventType, period, trend });
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting event trend:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /risk-events/{id}
 * Get a specific risk event by ID
 * 
 * Requirements: 10.1
 */
export async function getRiskEvent(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const eventId = event.pathParameters?.id;
    if (!eventId) {
      return errorResponse(400, 'Missing event ID', 'MISSING_PARAMETER');
    }

    // Get events and find the specific one
    const events = await RiskEventService.getEvents(tenantId, { limit: 10000 });
    const riskEvent = events.find(e => e.eventId === eventId);

    if (!riskEvent) {
      return errorResponse(404, 'Risk event not found', 'NOT_FOUND');
    }

    return successResponse(riskEvent);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }
    console.error('Error getting risk event:', error);
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

  // GET /risk-events
  if (method === 'GET' && path === '/risk-events') {
    return getRiskEvents(event);
  }

  // GET /risk-events/stats
  if (method === 'GET' && path === '/risk-events/stats') {
    return getRiskEventStats(event);
  }

  // GET /risk-events/aggregated
  if (method === 'GET' && path === '/risk-events/aggregated') {
    return getAggregatedEvents(event);
  }

  // GET /risk-events/trend/{eventType}
  if (method === 'GET' && path.match(/^\/risk-events\/trend\/[^/]+$/)) {
    return getEventTrend(event);
  }

  // GET /risk-events/{id}
  if (method === 'GET' && path.match(/^\/risk-events\/[^/]+$/)) {
    return getRiskEvent(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
