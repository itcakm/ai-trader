import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSnapshotService, DataProviders } from '../services/snapshot';
import { createInMemoryCache, SnapshotCache } from '../services/snapshot-cache';
import { SnapshotOptions, MarketDataSnapshot } from '../types/snapshot';
import { ValidationError } from '../types/validation';

// Create a singleton cache instance
const snapshotCache: SnapshotCache = createInMemoryCache();

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
 * Default data providers (stub implementation)
 * In production, these would connect to actual data repositories
 */
const defaultDataProviders: DataProviders = {
  async getPrices(symbol: string, timeframe: string) {
    // In production, this would fetch from Timestream
    return [];
  },
  async getLatestPrice(symbol: string) {
    // In production, this would fetch from Timestream
    return null;
  },
  async getNews(symbol: string, startTime: string, endTime: string) {
    // In production, this would fetch from DynamoDB
    return [];
  },
  async getSentiment(symbol: string) {
    // In production, this would fetch from DynamoDB
    return null;
  },
  async getOnChainMetrics(symbol: string) {
    // In production, this would fetch from DynamoDB
    return [];
  }
};

/**
 * Parse boolean query parameter
 */
function parseBooleanParam(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
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
 * GET /snapshots/{symbol}
 * 
 * Get a market data snapshot for a symbol.
 * 
 * Query parameters:
 * - timeframe: The timeframe for the snapshot (default: '1h')
 * - includePrices: Include price data (default: true)
 * - includeNews: Include news context (default: true)
 * - includeSentiment: Include sentiment data (default: true)
 * - includeOnChain: Include on-chain metrics (default: true)
 * - newsTimeWindowHours: Time window for news in hours (default: 24)
 * - maxNewsEvents: Maximum news events to include (default: 10)
 * - useCache: Whether to use cached snapshot if available (default: true)
 * 
 * Requirements: 6.1
 */
export async function getSnapshot(
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
    
    const timeframe = queryParams.timeframe || '1h';
    const useCache = parseBooleanParam(queryParams.useCache, true);

    // Build snapshot options from query parameters
    const options: Partial<SnapshotOptions> = {
      includePrices: parseBooleanParam(queryParams.includePrices, true),
      includeNews: parseBooleanParam(queryParams.includeNews, true),
      includeSentiment: parseBooleanParam(queryParams.includeSentiment, true),
      includeOnChain: parseBooleanParam(queryParams.includeOnChain, true),
      newsTimeWindowHours: parseIntParam(queryParams.newsTimeWindowHours, 24),
      maxNewsEvents: parseIntParam(queryParams.maxNewsEvents, 10)
    };

    // Validate newsTimeWindowHours
    if (options.newsTimeWindowHours !== undefined && (options.newsTimeWindowHours < 1 || options.newsTimeWindowHours > 168)) {
      return errorResponse(400, 'newsTimeWindowHours must be between 1 and 168', 'INVALID_PARAMETER');
    }

    // Validate maxNewsEvents
    if (options.maxNewsEvents !== undefined && (options.maxNewsEvents < 1 || options.maxNewsEvents > 10)) {
      return errorResponse(400, 'maxNewsEvents must be between 1 and 10', 'INVALID_PARAMETER');
    }

    // Try to get cached snapshot first
    if (useCache) {
      const cachedSnapshot = await snapshotCache.get(symbol, timeframe);
      if (cachedSnapshot) {
        return successResponse({
          ...cachedSnapshot,
          fromCache: true
        });
      }
    }

    // Assemble fresh snapshot
    const snapshotService = createSnapshotService(defaultDataProviders);
    const snapshot = await snapshotService.assembleSnapshot(symbol, timeframe, options);

    // Cache the snapshot
    await snapshotCache.set(snapshot);

    return successResponse({
      ...snapshot,
      fromCache: false
    });
  } catch (error) {
    console.error('Error getting snapshot:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /snapshots/{symbol}/cache
 * 
 * Invalidate cached snapshot for a symbol.
 * 
 * Requirements: 6.4
 */
export async function invalidateSnapshotCache(
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

    await snapshotCache.invalidate(symbol);

    return successResponse({ message: `Cache invalidated for symbol: ${symbol}` });
  } catch (error) {
    console.error('Error invalidating snapshot cache:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /snapshots/{symbol}/quality
 * 
 * Get quality information for a snapshot.
 * 
 * Requirements: 6.2
 */
export async function getSnapshotQuality(
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
    const timeframe = queryParams.timeframe || '1h';

    // Get cached snapshot or assemble new one
    let snapshot: MarketDataSnapshot | null = await snapshotCache.get(symbol, timeframe);
    
    if (!snapshot) {
      const snapshotService = createSnapshotService(defaultDataProviders);
      snapshot = await snapshotService.assembleSnapshot(symbol, timeframe);
    }

    return successResponse({
      symbol,
      timeframe,
      qualityScore: snapshot.qualityScore,
      dataCompleteness: snapshot.dataCompleteness,
      assembledAt: snapshot.assembledAt
    });
  } catch (error) {
    console.error('Error getting snapshot quality:', error);
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

  // Route: DELETE /snapshots/{symbol}/cache
  if (method === 'DELETE' && path.match(/^\/snapshots\/[^/]+\/cache$/)) {
    return invalidateSnapshotCache(event);
  }

  // Route: GET /snapshots/{symbol}/quality
  if (method === 'GET' && path.match(/^\/snapshots\/[^/]+\/quality$/)) {
    return getSnapshotQuality(event);
  }

  // Route: GET /snapshots/{symbol}
  if (method === 'GET' && path.match(/^\/snapshots\/[^/]+$/)) {
    return getSnapshot(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
