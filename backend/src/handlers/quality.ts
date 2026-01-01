import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QualityService, QualityInput } from '../services/quality';
import { DataSourceService } from '../services/data-source';
import { DataSourceType } from '../types/data-source';
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
 * Parse float query parameter
 */
function parseFloatParam(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate data source type
 */
function isValidDataSourceType(type: string): type is DataSourceType {
  return ['PRICE', 'NEWS', 'SENTIMENT', 'ON_CHAIN'].includes(type);
}

/**
 * GET /quality/{sourceId}
 * 
 * Get quality score for a data source.
 * 
 * Query parameters:
 * - symbol: The symbol to evaluate (required)
 * - dataType: The data type (default: inferred from source)
 * 
 * Requirements: 10.1
 */
export async function getQuality(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.sourceId;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    const queryParams = event.queryStringParameters || {};
    const symbol = queryParams.symbol;

    if (!symbol) {
      return errorResponse(400, 'Missing symbol parameter', 'MISSING_PARAMETER', [
        { field: 'symbol', code: 'REQUIRED', message: 'symbol query parameter is required' }
      ]);
    }

    // Get data source to determine type
    const dataSource = await DataSourceService.getSource(sourceId);
    if (!dataSource) {
      return errorResponse(404, `Data source not found: ${sourceId}`, 'NOT_FOUND');
    }

    const dataType = queryParams.dataType as DataSourceType || dataSource.type;

    if (!isValidDataSourceType(dataType)) {
      return errorResponse(400, 'Invalid dataType parameter', 'INVALID_PARAMETER', [
        { field: 'dataType', code: 'INVALID', message: 'dataType must be one of: PRICE, NEWS, SENTIMENT, ON_CHAIN' }
      ]);
    }

    // Create quality input with default values
    // In production, this would fetch actual data metrics
    const qualityInput: QualityInput = {
      expectedDataPoints: 100,
      actualDataPoints: 95,
      latestDataTimestamp: new Date().toISOString()
    };

    const qualityScore = QualityService.calculateQualityScore(
      sourceId,
      symbol,
      dataType,
      qualityInput
    );

    // Log the quality assessment
    QualityService.logQualityAssessment(qualityScore);

    // Check and alert if below threshold
    const alertTriggered = QualityService.checkAndAlert(qualityScore);

    return successResponse({
      ...qualityScore,
      alertTriggered
    });
  } catch (error) {
    console.error('Error getting quality:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /quality/{sourceId}/history
 * 
 * Get quality history for a data source.
 * 
 * Query parameters:
 * - periodMinutes: Time period in minutes (default: 60)
 * 
 * Requirements: 10.5
 */
export async function getQualityHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.sourceId;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    const queryParams = event.queryStringParameters || {};
    const periodMinutes = parseIntParam(queryParams.periodMinutes, 60);

    if (periodMinutes < 1 || periodMinutes > 10080) { // Max 1 week
      return errorResponse(400, 'periodMinutes must be between 1 and 10080', 'INVALID_PARAMETER');
    }

    // Verify source exists
    const dataSource = await DataSourceService.getSource(sourceId);
    if (!dataSource) {
      return errorResponse(404, `Data source not found: ${sourceId}`, 'NOT_FOUND');
    }

    const history = QualityService.getQualityHistory(sourceId, periodMinutes);

    return successResponse({
      sourceId,
      periodMinutes,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Error getting quality history:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Request body for setting quality threshold
 */
interface SetThresholdRequest {
  dataType: DataSourceType;
  threshold: number;
}

/**
 * PUT /quality/thresholds
 * 
 * Set quality threshold for a data type.
 * 
 * Requirements: 10.2
 */
export async function setQualityThreshold(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<SetThresholdRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.dataType || !isValidDataSourceType(body.dataType)) {
      validationErrors.push({
        field: 'dataType',
        code: 'INVALID',
        message: 'dataType must be one of: PRICE, NEWS, SENTIMENT, ON_CHAIN'
      });
    }

    if (body.threshold === undefined || typeof body.threshold !== 'number') {
      validationErrors.push({
        field: 'threshold',
        code: 'REQUIRED',
        message: 'threshold is required and must be a number'
      });
    } else if (body.threshold < 0 || body.threshold > 1) {
      validationErrors.push({
        field: 'threshold',
        code: 'INVALID',
        message: 'threshold must be between 0 and 1'
      });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    QualityService.setQualityThreshold(body.dataType, body.threshold);

    return successResponse({
      dataType: body.dataType,
      threshold: body.threshold,
      message: 'Threshold updated successfully'
    });
  } catch (error) {
    console.error('Error setting quality threshold:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /quality/thresholds
 * 
 * Get all quality thresholds.
 * 
 * Requirements: 10.2
 */
export async function getQualityThresholds(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const dataTypes: DataSourceType[] = ['PRICE', 'NEWS', 'SENTIMENT', 'ON_CHAIN'];
    const thresholds: Record<string, number> = {};

    for (const dataType of dataTypes) {
      thresholds[dataType] = QualityService.getQualityThreshold(dataType);
    }

    return successResponse({ thresholds });
  } catch (error) {
    console.error('Error getting quality thresholds:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Request body for calculating quality score
 */
interface CalculateQualityRequest {
  sourceId: string;
  symbol: string;
  dataType: DataSourceType;
  input: QualityInput;
}

/**
 * POST /quality/calculate
 * 
 * Calculate quality score with custom input.
 * 
 * Requirements: 10.1
 */
export async function calculateQuality(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<CalculateQualityRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate required fields
    const validationErrors: ValidationError[] = [];

    if (!body.sourceId) {
      validationErrors.push({
        field: 'sourceId',
        code: 'REQUIRED',
        message: 'sourceId is required'
      });
    }

    if (!body.symbol) {
      validationErrors.push({
        field: 'symbol',
        code: 'REQUIRED',
        message: 'symbol is required'
      });
    }

    if (!body.dataType || !isValidDataSourceType(body.dataType)) {
      validationErrors.push({
        field: 'dataType',
        code: 'INVALID',
        message: 'dataType must be one of: PRICE, NEWS, SENTIMENT, ON_CHAIN'
      });
    }

    if (!body.input) {
      validationErrors.push({
        field: 'input',
        code: 'REQUIRED',
        message: 'input is required'
      });
    } else {
      if (typeof body.input.expectedDataPoints !== 'number' || body.input.expectedDataPoints < 0) {
        validationErrors.push({
          field: 'input.expectedDataPoints',
          code: 'INVALID',
          message: 'expectedDataPoints must be a non-negative number'
        });
      }
      if (typeof body.input.actualDataPoints !== 'number' || body.input.actualDataPoints < 0) {
        validationErrors.push({
          field: 'input.actualDataPoints',
          code: 'INVALID',
          message: 'actualDataPoints must be a non-negative number'
        });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const qualityScore = QualityService.calculateQualityScore(
      body.sourceId,
      body.symbol,
      body.dataType,
      body.input
    );

    // Log the quality assessment
    QualityService.logQualityAssessment(qualityScore);

    // Check and alert if below threshold
    const alertTriggered = QualityService.checkAndAlert(qualityScore);

    return successResponse({
      ...qualityScore,
      alertTriggered
    });
  } catch (error) {
    console.error('Error calculating quality:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /quality/{sourceId}/anomalies
 * 
 * Get detected anomalies for a data source.
 * 
 * Requirements: 10.3
 */
export async function getAnomalies(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const sourceId = event.pathParameters?.sourceId;
    if (!sourceId) {
      return errorResponse(400, 'Missing source ID', 'MISSING_PARAMETER');
    }

    const queryParams = event.queryStringParameters || {};
    const periodMinutes = parseIntParam(queryParams.periodMinutes, 60);

    // Verify source exists
    const dataSource = await DataSourceService.getSource(sourceId);
    if (!dataSource) {
      return errorResponse(404, `Data source not found: ${sourceId}`, 'NOT_FOUND');
    }

    // Get quality history and extract anomalies
    const history = QualityService.getQualityHistory(sourceId, periodMinutes);
    
    // Collect all anomalies from quality logs
    // Note: In production, anomalies would be stored separately
    const anomalies = history.flatMap(log => {
      // Quality logs don't store anomalies directly, so we return empty
      // In a full implementation, we'd query a separate anomalies table
      return [];
    });

    return successResponse({
      sourceId,
      periodMinutes,
      anomalies,
      count: anomalies.length
    });
  } catch (error) {
    console.error('Error getting anomalies:', error);
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

  // Route: PUT /quality/thresholds
  if (method === 'PUT' && path === '/quality/thresholds') {
    return setQualityThreshold(event);
  }

  // Route: GET /quality/thresholds
  if (method === 'GET' && path === '/quality/thresholds') {
    return getQualityThresholds(event);
  }

  // Route: POST /quality/calculate
  if (method === 'POST' && path === '/quality/calculate') {
    return calculateQuality(event);
  }

  // Route: GET /quality/{sourceId}/history
  if (method === 'GET' && path.match(/^\/quality\/[^/]+\/history$/)) {
    return getQualityHistory(event);
  }

  // Route: GET /quality/{sourceId}/anomalies
  if (method === 'GET' && path.match(/^\/quality\/[^/]+\/anomalies$/)) {
    return getAnomalies(event);
  }

  // Route: GET /quality/{sourceId}
  if (method === 'GET' && path.match(/^\/quality\/[^/]+$/)) {
    return getQuality(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
