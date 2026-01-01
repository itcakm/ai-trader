import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ExchangePositionManager,
  PositionNotFoundError,
} from '../services/exchange-position-manager';
import { ExchangeId } from '../types/exchange';

/**
 * Exchange Position API Handlers
 *
 * Implements API endpoints for position queries and reconciliation.
 *
 * Requirements: 7.1, 7.3
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
    body: JSON.stringify(data),
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
    body: JSON.stringify(body),
  };
}

function getTenantId(event: APIGatewayProxyEvent): string | null {
  return event.headers['X-Tenant-Id'] || event.headers['x-tenant-id'] || null;
}

const VALID_EXCHANGE_IDS: ExchangeId[] = [
  'BINANCE',
  'COINBASE',
  'KRAKEN',
  'OKX',
  'BSDEX',
  'BISON',
  'FINOA',
  'BYBIT',
];


/**
 * GET /positions
 * List all positions for the tenant, optionally filtered by exchange
 *
 * Requirements: 7.1
 */
export async function listPositions(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const exchangeId = event.queryStringParameters?.exchangeId as ExchangeId | undefined;

    if (exchangeId && !VALID_EXCHANGE_IDS.includes(exchangeId)) {
      return errorResponse(400, 'Invalid exchangeId parameter', 'INVALID_PARAMETER');
    }

    const positions = await ExchangePositionManager.listPositions(tenantId, exchangeId);
    return successResponse({ positions });
  } catch (error) {
    console.error('Error listing positions:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /positions/{assetId}
 * Get aggregated position for a specific asset across all exchanges
 *
 * Requirements: 7.1
 */
export async function getAggregatedPosition(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const assetId = event.pathParameters?.assetId;
    if (!assetId) {
      return errorResponse(400, 'Missing asset ID', 'MISSING_PARAMETER');
    }

    const position = await ExchangePositionManager.getAggregatedPosition(tenantId, assetId);
    return successResponse(position);
  } catch (error) {
    if (error instanceof PositionNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting aggregated position:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /positions/{assetId}/{exchangeId}
 * Get position for a specific asset on a specific exchange
 *
 * Requirements: 7.1
 */
export async function getPosition(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const assetId = event.pathParameters?.assetId;
    const exchangeId = event.pathParameters?.exchangeId as ExchangeId;

    if (!assetId) {
      return errorResponse(400, 'Missing asset ID', 'MISSING_PARAMETER');
    }

    if (!exchangeId) {
      return errorResponse(400, 'Missing exchange ID', 'MISSING_PARAMETER');
    }

    if (!VALID_EXCHANGE_IDS.includes(exchangeId)) {
      return errorResponse(400, 'Invalid exchange ID', 'INVALID_PARAMETER');
    }

    const position = await ExchangePositionManager.getPosition(tenantId, assetId, exchangeId);
    if (!position) {
      return errorResponse(404, `Position for '${assetId}' on ${exchangeId} not found`, 'NOT_FOUND');
    }

    return successResponse(position);
  } catch (error) {
    if (error instanceof PositionNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting position:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * POST /positions/reconcile/{exchangeId}
 * Trigger position reconciliation for a specific exchange
 *
 * Requirements: 7.3
 */
export async function reconcilePositions(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const exchangeId = event.pathParameters?.exchangeId as ExchangeId;
    if (!exchangeId) {
      return errorResponse(400, 'Missing exchange ID', 'MISSING_PARAMETER');
    }

    if (!VALID_EXCHANGE_IDS.includes(exchangeId)) {
      return errorResponse(400, 'Invalid exchange ID', 'INVALID_PARAMETER');
    }

    const result = await ExchangePositionManager.reconcilePositions(tenantId, exchangeId);
    return successResponse({
      message: 'Position reconciliation completed',
      ...result,
    });
  } catch (error) {
    console.error('Error reconciling positions:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /positions/{assetId}/history
 * Get position history for a specific asset
 *
 * Requirements: 7.6
 */
export async function getPositionHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const assetId = event.pathParameters?.assetId;
    if (!assetId) {
      return errorResponse(400, 'Missing asset ID', 'MISSING_PARAMETER');
    }

    const queryParams = event.queryStringParameters || {};

    // Default to last 24 hours if not specified
    const now = new Date();
    const defaultStartTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const defaultEndTime = now.toISOString();

    const startTime = queryParams.startTime || defaultStartTime;
    const endTime = queryParams.endTime || defaultEndTime;

    // Validate date formats
    if (isNaN(Date.parse(startTime))) {
      return errorResponse(400, 'Invalid startTime format', 'INVALID_PARAMETER');
    }

    if (isNaN(Date.parse(endTime))) {
      return errorResponse(400, 'Invalid endTime format', 'INVALID_PARAMETER');
    }

    const history = await ExchangePositionManager.getPositionHistory(
      tenantId,
      assetId,
      startTime,
      endTime
    );

    return successResponse({ history });
  } catch (error) {
    console.error('Error getting position history:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /positions/{assetId}/pnl
 * Calculate unrealized P&L for a specific asset with current price
 *
 * Requirements: 7.5
 */
export async function calculatePnL(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const assetId = event.pathParameters?.assetId;
    if (!assetId) {
      return errorResponse(400, 'Missing asset ID', 'MISSING_PARAMETER');
    }

    let body: { currentPrice: number } | null = null;
    try {
      if (event.body) {
        body = JSON.parse(event.body);
      }
    } catch {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body || body.currentPrice === undefined || body.currentPrice <= 0) {
      return errorResponse(400, 'currentPrice is required and must be positive', 'VALIDATION_FAILED', [
        { field: 'currentPrice', message: 'currentPrice must be a positive number' },
      ]);
    }

    const unrealizedPnL = await ExchangePositionManager.calculateUnrealizedPnL(
      tenantId,
      assetId,
      body.currentPrice
    );

    return successResponse({
      assetId,
      currentPrice: body.currentPrice,
      unrealizedPnL,
      calculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error calculating P&L:', error);
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

  // GET /positions
  if (method === 'GET' && path === '/positions') {
    return listPositions(event);
  }

  // POST /positions/reconcile/{exchangeId}
  if (method === 'POST' && path.match(/^\/positions\/reconcile\/[^/]+$/)) {
    return reconcilePositions(event);
  }

  // GET /positions/{assetId}/history
  if (method === 'GET' && path.match(/^\/positions\/[^/]+\/history$/)) {
    return getPositionHistory(event);
  }

  // POST /positions/{assetId}/pnl
  if (method === 'POST' && path.match(/^\/positions\/[^/]+\/pnl$/)) {
    return calculatePnL(event);
  }

  // GET /positions/{assetId}/{exchangeId}
  if (method === 'GET' && path.match(/^\/positions\/[^/]+\/[^/]+$/)) {
    return getPosition(event);
  }

  // GET /positions/{assetId}
  if (method === 'GET' && path.match(/^\/positions\/[^/]+$/)) {
    return getAggregatedPosition(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
