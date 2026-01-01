import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ExchangeConnectionManager,
  ConnectionManagerError,
  connectionManager,
} from '../services/exchange-connection-manager';
import { ExchangeId } from '../types/exchange';
import { ConnectionType } from '../types/exchange-connection';

/**
 * Exchange Connection API Handlers
 *
 * Implements API endpoints for connection health and metrics.
 *
 * Requirements: 8.3, 8.6
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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

function parseBody<T>(event: APIGatewayProxyEvent): T | null {
  try {
    if (!event.body) return null;
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
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

const VALID_CONNECTION_TYPES: ConnectionType[] = ['REST', 'WEBSOCKET', 'FIX'];


/**
 * GET /connections/{exchangeId}
 * Get connection pool for a specific exchange
 *
 * Requirements: 8.1
 */
export async function getConnectionPool(
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

    const pool = await connectionManager.getConnectionPool(tenantId, exchangeId);
    return successResponse(pool);
  } catch (error) {
    if (error instanceof ConnectionManagerError) {
      return errorResponse(400, error.message, error.code);
    }
    console.error('Error getting connection pool:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /connections/{exchangeId}/health
 * Get health report for connections to a specific exchange
 *
 * Requirements: 8.3, 8.6
 */
export async function getConnectionHealth(
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

    const healthReport = await connectionManager.monitorHealth(tenantId, exchangeId);
    return successResponse(healthReport);
  } catch (error) {
    if (error instanceof ConnectionManagerError) {
      return errorResponse(400, error.message, error.code);
    }
    console.error('Error getting connection health:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /connections/{exchangeId}/metrics/{connectionId}
 * Get metrics for a specific connection
 *
 * Requirements: 8.3, 8.6
 */
export async function getConnectionMetrics(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const connectionId = event.pathParameters?.connectionId;
    if (!connectionId) {
      return errorResponse(400, 'Missing connection ID', 'MISSING_PARAMETER');
    }

    const metrics = await connectionManager.getConnectionMetrics(connectionId);
    return successResponse(metrics);
  } catch (error) {
    if (error instanceof ConnectionManagerError) {
      if (error.code === 'CONNECTION_NOT_FOUND') {
        return errorResponse(404, error.message, 'NOT_FOUND');
      }
      return errorResponse(400, error.message, error.code);
    }
    console.error('Error getting connection metrics:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * Request body for creating a connection
 */
interface CreateConnectionRequest {
  type: ConnectionType;
  endpoint?: string;
}

/**
 * POST /connections/{exchangeId}
 * Create a new connection to an exchange
 *
 * Requirements: 8.1
 */
export async function createConnection(
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

    const body = parseBody<CreateConnectionRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.type || !VALID_CONNECTION_TYPES.includes(body.type)) {
      return errorResponse(400, 'Invalid connection type', 'VALIDATION_FAILED', [
        {
          field: 'type',
          message: `type must be one of: ${VALID_CONNECTION_TYPES.join(', ')}`,
        },
      ]);
    }

    const connection = await connectionManager.createConnection(
      tenantId,
      exchangeId,
      body.type,
      body.endpoint
    );

    return successResponse(connection, 201);
  } catch (error) {
    if (error instanceof ConnectionManagerError) {
      if (error.code === 'POOL_EXHAUSTED') {
        return errorResponse(429, error.message, 'POOL_EXHAUSTED');
      }
      if (error.code === 'SHUTDOWN_IN_PROGRESS') {
        return errorResponse(503, error.message, 'SERVICE_UNAVAILABLE');
      }
      return errorResponse(400, error.message, error.code);
    }
    console.error('Error creating connection:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /connections/{exchangeId}/{connectionId}
 * Close a specific connection
 *
 * Requirements: 8.1
 */
export async function closeConnection(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const connectionId = event.pathParameters?.connectionId;
    if (!connectionId) {
      return errorResponse(400, 'Missing connection ID', 'MISSING_PARAMETER');
    }

    await connectionManager.closeConnection(connectionId);
    return successResponse({ message: 'Connection closed successfully' });
  } catch (error) {
    if (error instanceof ConnectionManagerError) {
      return errorResponse(400, error.message, error.code);
    }
    console.error('Error closing connection:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /connections/{exchangeId}/shutdown
 * Gracefully shutdown all connections to an exchange
 *
 * Requirements: 8.5
 */
export async function gracefulShutdown(
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

    // Parse optional timeout from body
    let timeoutMs = 30000; // Default 30 seconds
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.timeoutMs && typeof body.timeoutMs === 'number' && body.timeoutMs > 0) {
          timeoutMs = body.timeoutMs;
        }
      } catch {
        // Ignore parse errors, use default timeout
      }
    }

    const result = await connectionManager.gracefulShutdown(tenantId, exchangeId, timeoutMs);
    return successResponse({
      message: 'Graceful shutdown completed',
      ...result,
    });
  } catch (error) {
    if (error instanceof ConnectionManagerError) {
      return errorResponse(400, error.message, error.code);
    }
    console.error('Error during graceful shutdown:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * GET /connections
 * List all connections for the tenant
 *
 * Requirements: 8.6
 */
export async function listConnections(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const connections = connectionManager.getAllConnections(tenantId);
    return successResponse({ connections });
  } catch (error) {
    console.error('Error listing connections:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /connections/{exchangeId}/resume-trading
 * Resume trading for an exchange after it was paused due to connection issues
 *
 * Requirements: 8.4
 */
export async function resumeTrading(
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

    const wasPaused = connectionManager.isTradingPaused(tenantId, exchangeId);
    connectionManager.resumeTrading(tenantId, exchangeId);

    return successResponse({
      message: wasPaused ? 'Trading resumed' : 'Trading was not paused',
      exchangeId,
      tradingPaused: false,
    });
  } catch (error) {
    console.error('Error resuming trading:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /connections/{exchangeId}/trading-status
 * Check if trading is paused for an exchange
 *
 * Requirements: 8.4
 */
export async function getTradingStatus(
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

    const isPaused = connectionManager.isTradingPaused(tenantId, exchangeId);

    return successResponse({
      exchangeId,
      tradingPaused: isPaused,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting trading status:', error);
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

  // GET /connections
  if (method === 'GET' && path === '/connections') {
    return listConnections(event);
  }

  // POST /connections/{exchangeId}/shutdown
  if (method === 'POST' && path.match(/^\/connections\/[^/]+\/shutdown$/)) {
    return gracefulShutdown(event);
  }

  // POST /connections/{exchangeId}/resume-trading
  if (method === 'POST' && path.match(/^\/connections\/[^/]+\/resume-trading$/)) {
    return resumeTrading(event);
  }

  // GET /connections/{exchangeId}/trading-status
  if (method === 'GET' && path.match(/^\/connections\/[^/]+\/trading-status$/)) {
    return getTradingStatus(event);
  }

  // GET /connections/{exchangeId}/health
  if (method === 'GET' && path.match(/^\/connections\/[^/]+\/health$/)) {
    return getConnectionHealth(event);
  }

  // GET /connections/{exchangeId}/metrics/{connectionId}
  if (method === 'GET' && path.match(/^\/connections\/[^/]+\/metrics\/[^/]+$/)) {
    return getConnectionMetrics(event);
  }

  // POST /connections/{exchangeId}
  if (method === 'POST' && path.match(/^\/connections\/[^/]+$/)) {
    return createConnection(event);
  }

  // GET /connections/{exchangeId}
  if (method === 'GET' && path.match(/^\/connections\/[^/]+$/)) {
    return getConnectionPool(event);
  }

  // DELETE /connections/{exchangeId}/{connectionId}
  if (method === 'DELETE' && path.match(/^\/connections\/[^/]+\/[^/]+$/)) {
    return closeConnection(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
