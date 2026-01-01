import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EnsembleService } from '../services/ensemble';
import { ValidationError } from '../types/validation';
import { EnsembleRequest, EnsembleAnalysisType } from '../types/ensemble';
import { MarketDataSnapshot, PricePoint, VolumePoint } from '../types/market-data';

/**
 * Error response body structure
 */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

/**
 * Request body for ensemble analysis
 */
interface EnsembleAnalyzeRequestBody {
  strategyId: string;
  analysisType: EnsembleAnalysisType;
  marketData: MarketDataSnapshot;
  timeoutMs?: number;
  additionalContext?: string;
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
 * Valid analysis types
 */
const VALID_ANALYSIS_TYPES: EnsembleAnalysisType[] = ['REGIME', 'EXPLANATION', 'PARAMETERS'];

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum timeout in milliseconds
 */
const MAX_TIMEOUT_MS = 120000;

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
 * Validate price point structure
 */
function validatePricePoint(point: PricePoint, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `marketData.prices[${index}]`;

  if (!point.timestamp) {
    errors.push({ field: `${prefix}.timestamp`, code: 'REQUIRED', message: 'timestamp is required' });
  }
  if (typeof point.open !== 'number') {
    errors.push({ field: `${prefix}.open`, code: 'INVALID', message: 'open must be a number' });
  }
  if (typeof point.high !== 'number') {
    errors.push({ field: `${prefix}.high`, code: 'INVALID', message: 'high must be a number' });
  }
  if (typeof point.low !== 'number') {
    errors.push({ field: `${prefix}.low`, code: 'INVALID', message: 'low must be a number' });
  }
  if (typeof point.close !== 'number') {
    errors.push({ field: `${prefix}.close`, code: 'INVALID', message: 'close must be a number' });
  }

  return errors;
}

/**
 * Validate volume point structure
 */
function validateVolumePoint(point: VolumePoint, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `marketData.volume[${index}]`;

  if (!point.timestamp) {
    errors.push({ field: `${prefix}.timestamp`, code: 'REQUIRED', message: 'timestamp is required' });
  }
  if (typeof point.volume !== 'number' || point.volume < 0) {
    errors.push({ field: `${prefix}.volume`, code: 'INVALID', message: 'volume must be a non-negative number' });
  }

  return errors;
}

/**
 * Validate market data snapshot structure
 */
function validateMarketData(marketData: MarketDataSnapshot): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!marketData.symbol) {
    errors.push({ field: 'marketData.symbol', code: 'REQUIRED', message: 'symbol is required' });
  }

  if (!marketData.timestamp) {
    errors.push({ field: 'marketData.timestamp', code: 'REQUIRED', message: 'timestamp is required' });
  }

  if (!Array.isArray(marketData.prices)) {
    errors.push({ field: 'marketData.prices', code: 'REQUIRED', message: 'prices array is required' });
  } else if (marketData.prices.length === 0) {
    errors.push({ field: 'marketData.prices', code: 'INVALID', message: 'prices array must not be empty' });
  } else {
    marketData.prices.forEach((point, index) => {
      errors.push(...validatePricePoint(point, index));
    });
  }

  if (!Array.isArray(marketData.volume)) {
    errors.push({ field: 'marketData.volume', code: 'REQUIRED', message: 'volume array is required' });
  } else {
    marketData.volume.forEach((point, index) => {
      errors.push(...validateVolumePoint(point, index));
    });
  }

  return errors;
}

/**
 * POST /ensemble/analyze
 * 
 * Perform ensemble analysis using multiple AI models in parallel.
 * 
 * Requirements: 7.1
 */
export async function analyzeWithEnsemble(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<EnsembleAnalyzeRequestBody>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.strategyId) {
      validationErrors.push({ field: 'strategyId', code: 'REQUIRED', message: 'strategyId is required' });
    }

    if (!body.analysisType) {
      validationErrors.push({ field: 'analysisType', code: 'REQUIRED', message: 'analysisType is required' });
    } else if (!VALID_ANALYSIS_TYPES.includes(body.analysisType)) {
      validationErrors.push({ 
        field: 'analysisType', 
        code: 'INVALID', 
        message: `analysisType must be one of: ${VALID_ANALYSIS_TYPES.join(', ')}` 
      });
    }

    if (!body.marketData) {
      validationErrors.push({ field: 'marketData', code: 'REQUIRED', message: 'marketData is required' });
    } else {
      validationErrors.push(...validateMarketData(body.marketData));
    }

    // Validate timeout if provided
    if (body.timeoutMs !== undefined) {
      if (typeof body.timeoutMs !== 'number' || body.timeoutMs <= 0) {
        validationErrors.push({ field: 'timeoutMs', code: 'INVALID', message: 'timeoutMs must be a positive number' });
      } else if (body.timeoutMs > MAX_TIMEOUT_MS) {
        validationErrors.push({ 
          field: 'timeoutMs', 
          code: 'INVALID', 
          message: `timeoutMs cannot exceed ${MAX_TIMEOUT_MS}ms` 
        });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const request: EnsembleRequest = {
      tenantId,
      strategyId: body.strategyId,
      analysisType: body.analysisType,
      marketData: body.marketData,
      timeoutMs: body.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      additionalContext: body.additionalContext
    };

    const response = await EnsembleService.analyzeWithEnsemble(request);

    return successResponse(response);
  } catch (error) {
    console.error('Error performing ensemble analysis:', error);
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

  // Route: POST /ensemble/analyze
  if (method === 'POST' && path === '/ensemble/analyze') {
    return analyzeWithEnsemble(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
