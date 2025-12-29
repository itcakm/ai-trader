import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AIAnalysisService } from '../services/ai-analysis';
import { CostLimitExceededError } from '../services/model-config';
import { ValidationError } from '../types/validation';
import {
  RegimeClassificationRequest,
  ExplanationRequest,
  StrategyAction,
  MarketRegime
} from '../types/analysis';
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
 * Request body for regime classification
 */
interface ClassifyRegimeRequestBody {
  modelConfigId: string;
  marketData: MarketDataSnapshot;
  timeframe: string;
  additionalContext?: string;
}

/**
 * Request body for explanation generation
 */
interface GenerateExplanationRequestBody {
  modelConfigId: string;
  strategyId: string;
  action: StrategyAction;
  marketContext: MarketDataSnapshot;
  strategyParameters: Record<string, unknown>;
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
 * Valid action types
 */
const VALID_ACTION_TYPES = ['ENTRY', 'EXIT', 'INCREASE', 'DECREASE', 'HOLD'] as const;

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
function validateMarketData(marketData: MarketDataSnapshot, fieldPrefix = 'marketData'): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!marketData.symbol) {
    errors.push({ field: `${fieldPrefix}.symbol`, code: 'REQUIRED', message: 'symbol is required' });
  }

  if (!marketData.timestamp) {
    errors.push({ field: `${fieldPrefix}.timestamp`, code: 'REQUIRED', message: 'timestamp is required' });
  }

  if (!Array.isArray(marketData.prices)) {
    errors.push({ field: `${fieldPrefix}.prices`, code: 'REQUIRED', message: 'prices array is required' });
  } else if (marketData.prices.length === 0) {
    errors.push({ field: `${fieldPrefix}.prices`, code: 'INVALID', message: 'prices array must not be empty' });
  } else {
    marketData.prices.forEach((point, index) => {
      errors.push(...validatePricePoint(point, index));
    });
  }

  if (!Array.isArray(marketData.volume)) {
    errors.push({ field: `${fieldPrefix}.volume`, code: 'REQUIRED', message: 'volume array is required' });
  } else {
    marketData.volume.forEach((point, index) => {
      errors.push(...validateVolumePoint(point, index));
    });
  }

  return errors;
}

/**
 * Validate strategy action structure
 */
function validateStrategyAction(action: StrategyAction): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!action.type) {
    errors.push({ field: 'action.type', code: 'REQUIRED', message: 'action type is required' });
  } else if (!VALID_ACTION_TYPES.includes(action.type)) {
    errors.push({ 
      field: 'action.type', 
      code: 'INVALID', 
      message: `action type must be one of: ${VALID_ACTION_TYPES.join(', ')}` 
    });
  }

  if (!action.symbol) {
    errors.push({ field: 'action.symbol', code: 'REQUIRED', message: 'action symbol is required' });
  }

  if (!action.reason) {
    errors.push({ field: 'action.reason', code: 'REQUIRED', message: 'action reason is required' });
  }

  if (action.quantity !== undefined && (typeof action.quantity !== 'number' || action.quantity < 0)) {
    errors.push({ field: 'action.quantity', code: 'INVALID', message: 'quantity must be a non-negative number' });
  }

  if (action.price !== undefined && (typeof action.price !== 'number' || action.price < 0)) {
    errors.push({ field: 'action.price', code: 'INVALID', message: 'price must be a non-negative number' });
  }

  return errors;
}

/**
 * POST /analysis/regime
 * 
 * Classify market regime using the configured AI model.
 * 
 * Requirements: 3.1
 */
export async function classifyRegime(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<ClassifyRegimeRequestBody>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.modelConfigId) {
      validationErrors.push({ field: 'modelConfigId', code: 'REQUIRED', message: 'modelConfigId is required' });
    }

    if (!body.timeframe) {
      validationErrors.push({ field: 'timeframe', code: 'REQUIRED', message: 'timeframe is required' });
    }

    if (!body.marketData) {
      validationErrors.push({ field: 'marketData', code: 'REQUIRED', message: 'marketData is required' });
    } else {
      validationErrors.push(...validateMarketData(body.marketData));
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const request: RegimeClassificationRequest = {
      tenantId,
      modelConfigId: body.modelConfigId,
      marketData: body.marketData,
      timeframe: body.timeframe,
      additionalContext: body.additionalContext
    };

    const response = await AIAnalysisService.classifyMarketRegime(request);

    return successResponse(response);
  } catch (error) {
    if (error instanceof CostLimitExceededError) {
      return errorResponse(402, error.message, 'COST_LIMIT_EXCEEDED', [
        { 
          field: 'costLimit', 
          code: 'EXCEEDED', 
          message: `${error.limitType} cost limit exceeded: ${error.currentCost}/${error.maxCost} USD` 
        }
      ]);
    }
    console.error('Error classifying market regime:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /analysis/explanation
 * 
 * Generate explanation for a strategy action using the configured AI model.
 * 
 * Requirements: 4.1
 */
export async function generateExplanation(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<GenerateExplanationRequestBody>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.modelConfigId) {
      validationErrors.push({ field: 'modelConfigId', code: 'REQUIRED', message: 'modelConfigId is required' });
    }

    if (!body.strategyId) {
      validationErrors.push({ field: 'strategyId', code: 'REQUIRED', message: 'strategyId is required' });
    }

    if (!body.action) {
      validationErrors.push({ field: 'action', code: 'REQUIRED', message: 'action is required' });
    } else {
      validationErrors.push(...validateStrategyAction(body.action));
    }

    if (!body.marketContext) {
      validationErrors.push({ field: 'marketContext', code: 'REQUIRED', message: 'marketContext is required' });
    } else {
      validationErrors.push(...validateMarketData(body.marketContext, 'marketContext'));
    }

    if (!body.strategyParameters || typeof body.strategyParameters !== 'object') {
      validationErrors.push({ field: 'strategyParameters', code: 'REQUIRED', message: 'strategyParameters object is required' });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const request: ExplanationRequest = {
      tenantId,
      modelConfigId: body.modelConfigId,
      strategyId: body.strategyId,
      action: body.action,
      marketContext: body.marketContext,
      strategyParameters: body.strategyParameters
    };

    const response = await AIAnalysisService.generateExplanation(request);

    return successResponse(response);
  } catch (error) {
    if (error instanceof CostLimitExceededError) {
      return errorResponse(402, error.message, 'COST_LIMIT_EXCEEDED', [
        { 
          field: 'costLimit', 
          code: 'EXCEEDED', 
          message: `${error.limitType} cost limit exceeded: ${error.currentCost}/${error.maxCost} USD` 
        }
      ]);
    }
    console.error('Error generating explanation:', error);
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

  // Route: POST /analysis/regime
  if (method === 'POST' && path === '/analysis/regime') {
    return classifyRegime(event);
  }

  // Route: POST /analysis/explanation
  if (method === 'POST' && path === '/analysis/explanation') {
    return generateExplanation(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
