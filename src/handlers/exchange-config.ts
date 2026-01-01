import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ExchangeService,
  ExchangeValidationError,
  ExchangeNotFoundError,
} from '../services/exchange';
import {
  ExchangeId,
  ExchangeStatus,
  ExchangeMode,
  ExchangeConfigInput,
  AuthMethod,
  ExchangeFeatures,
  ExchangeRateLimits,
  EncryptedCredentials,
} from '../types/exchange';

/**
 * Exchange Configuration API Handlers
 *
 * Implements API endpoints for exchange registration, update, list, and status management.
 *
 * Requirements: 1.2, 1.4, 1.5
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
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


/**
 * Request body for registering an exchange
 */
interface RegisterExchangeRequest {
  exchangeId: ExchangeId;
  name: string;
  mode: ExchangeMode;
  restEndpoint: string;
  wsEndpoint?: string;
  fixEndpoint?: string;
  authMethod: AuthMethod;
  credentials: EncryptedCredentials;
  supportedFeatures: ExchangeFeatures;
  rateLimits: ExchangeRateLimits;
  priority?: number;
}

/**
 * Request body for updating an exchange
 */
interface UpdateExchangeRequest {
  name?: string;
  mode?: ExchangeMode;
  restEndpoint?: string;
  wsEndpoint?: string;
  fixEndpoint?: string;
  authMethod?: AuthMethod;
  credentials?: EncryptedCredentials;
  supportedFeatures?: ExchangeFeatures;
  rateLimits?: ExchangeRateLimits;
  priority?: number;
}

/**
 * Request body for setting exchange status
 */
interface SetStatusRequest {
  status: ExchangeStatus;
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

const VALID_STATUSES: ExchangeStatus[] = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR'];
const VALID_MODES: ExchangeMode[] = ['PRODUCTION', 'SANDBOX'];
const VALID_AUTH_METHODS: AuthMethod[] = ['API_KEY', 'HMAC', 'OAUTH', 'FIX_CREDENTIALS'];

function validateRegisterRequest(
  body: RegisterExchangeRequest
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  if (!body.exchangeId || !VALID_EXCHANGE_IDS.includes(body.exchangeId)) {
    errors.push({
      field: 'exchangeId',
      message: `exchangeId must be one of: ${VALID_EXCHANGE_IDS.join(', ')}`,
    });
  }

  if (!body.name || body.name.trim() === '') {
    errors.push({ field: 'name', message: 'name is required' });
  }

  if (!body.mode || !VALID_MODES.includes(body.mode)) {
    errors.push({
      field: 'mode',
      message: `mode must be one of: ${VALID_MODES.join(', ')}`,
    });
  }

  if (!body.restEndpoint || body.restEndpoint.trim() === '') {
    errors.push({ field: 'restEndpoint', message: 'restEndpoint is required' });
  }

  if (!body.authMethod || !VALID_AUTH_METHODS.includes(body.authMethod)) {
    errors.push({
      field: 'authMethod',
      message: `authMethod must be one of: ${VALID_AUTH_METHODS.join(', ')}`,
    });
  }

  if (!body.credentials) {
    errors.push({ field: 'credentials', message: 'credentials is required' });
  } else {
    if (!body.credentials.apiKey) {
      errors.push({ field: 'credentials.apiKey', message: 'apiKey is required' });
    }
    if (!body.credentials.apiSecret) {
      errors.push({ field: 'credentials.apiSecret', message: 'apiSecret is required' });
    }
  }

  if (!body.supportedFeatures) {
    errors.push({ field: 'supportedFeatures', message: 'supportedFeatures is required' });
  }

  if (!body.rateLimits) {
    errors.push({ field: 'rateLimits', message: 'rateLimits is required' });
  }

  return errors;
}


/**
 * POST /exchanges
 * Register a new exchange configuration
 *
 * Requirements: 1.2, 1.5
 */
export async function registerExchange(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<RegisterExchangeRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors = validateRegisterRequest(body);
    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const config: ExchangeConfigInput = {
      exchangeId: body.exchangeId,
      name: body.name,
      mode: body.mode,
      restEndpoint: body.restEndpoint,
      wsEndpoint: body.wsEndpoint,
      fixEndpoint: body.fixEndpoint,
      authMethod: body.authMethod,
      credentials: body.credentials,
      supportedFeatures: body.supportedFeatures,
      rateLimits: body.rateLimits,
      priority: body.priority,
    };

    const exchange = await ExchangeService.registerExchange(tenantId, config);
    return successResponse(exchange, 201);
  } catch (error) {
    if (error instanceof ExchangeValidationError) {
      return errorResponse(400, error.message, 'VALIDATION_FAILED');
    }
    console.error('Error registering exchange:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /exchanges
 * List all exchanges for the tenant
 *
 * Requirements: 1.2
 */
export async function listExchanges(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const status = event.queryStringParameters?.status as ExchangeStatus | undefined;
    const mode = event.queryStringParameters?.mode as ExchangeMode | undefined;

    if (status && !VALID_STATUSES.includes(status)) {
      return errorResponse(400, 'Invalid status parameter', 'INVALID_PARAMETER');
    }

    if (mode && !VALID_MODES.includes(mode)) {
      return errorResponse(400, 'Invalid mode parameter', 'INVALID_PARAMETER');
    }

    const exchanges = await ExchangeService.listExchanges(tenantId, { status, mode });
    return successResponse({ exchanges });
  } catch (error) {
    console.error('Error listing exchanges:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /exchanges/{exchangeId}
 * Get a specific exchange by ID
 *
 * Requirements: 1.2
 */
export async function getExchange(
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

    const exchange = await ExchangeService.getExchange(tenantId, exchangeId);
    return successResponse(exchange);
  } catch (error) {
    if (error instanceof ExchangeNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting exchange:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * PUT /exchanges/{exchangeId}
 * Update an exchange configuration
 *
 * Requirements: 1.2, 1.5
 */
export async function updateExchange(
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

    const body = parseBody<UpdateExchangeRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate optional fields if provided
    const errors: { field: string; message: string }[] = [];

    if (body.mode !== undefined && !VALID_MODES.includes(body.mode)) {
      errors.push({
        field: 'mode',
        message: `mode must be one of: ${VALID_MODES.join(', ')}`,
      });
    }

    if (body.authMethod !== undefined && !VALID_AUTH_METHODS.includes(body.authMethod)) {
      errors.push({
        field: 'authMethod',
        message: `authMethod must be one of: ${VALID_AUTH_METHODS.join(', ')}`,
      });
    }

    if (errors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', errors);
    }

    const updates: Partial<ExchangeConfigInput> = {
      name: body.name,
      mode: body.mode,
      restEndpoint: body.restEndpoint,
      wsEndpoint: body.wsEndpoint,
      fixEndpoint: body.fixEndpoint,
      authMethod: body.authMethod,
      credentials: body.credentials,
      supportedFeatures: body.supportedFeatures,
      rateLimits: body.rateLimits,
      priority: body.priority,
    };

    // Remove undefined values
    Object.keys(updates).forEach((key) => {
      if (updates[key as keyof typeof updates] === undefined) {
        delete updates[key as keyof typeof updates];
      }
    });

    const exchange = await ExchangeService.updateExchange(tenantId, exchangeId, updates);
    return successResponse(exchange);
  } catch (error) {
    if (error instanceof ExchangeNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof ExchangeValidationError) {
      return errorResponse(400, error.message, 'VALIDATION_FAILED');
    }
    console.error('Error updating exchange:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /exchanges/{exchangeId}/status
 * Set the status of an exchange
 *
 * Requirements: 1.4
 */
export async function setExchangeStatus(
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

    const body = parseBody<SetStatusRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return errorResponse(400, 'Invalid status', 'VALIDATION_FAILED', [
        {
          field: 'status',
          message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
        },
      ]);
    }

    const exchange = await ExchangeService.setExchangeStatus(tenantId, exchangeId, body.status);
    return successResponse({
      message: `Exchange status updated to ${body.status}`,
      exchange,
    });
  } catch (error) {
    if (error instanceof ExchangeNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error setting exchange status:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /exchanges/{exchangeId}
 * Delete an exchange configuration
 *
 * Requirements: 1.2
 */
export async function deleteExchange(
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

    await ExchangeService.deleteExchange(tenantId, exchangeId);
    return successResponse({ message: 'Exchange deleted successfully' });
  } catch (error) {
    if (error instanceof ExchangeNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error deleting exchange:', error);
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

  // POST /exchanges
  if (method === 'POST' && path === '/exchanges') {
    return registerExchange(event);
  }

  // GET /exchanges
  if (method === 'GET' && path === '/exchanges') {
    return listExchanges(event);
  }

  // GET /exchanges/{exchangeId}
  if (method === 'GET' && path.match(/^\/exchanges\/[^/]+$/)) {
    return getExchange(event);
  }

  // PUT /exchanges/{exchangeId}
  if (method === 'PUT' && path.match(/^\/exchanges\/[^/]+$/)) {
    return updateExchange(event);
  }

  // PATCH /exchanges/{exchangeId}/status
  if (method === 'PATCH' && path.match(/^\/exchanges\/[^/]+\/status$/)) {
    return setExchangeStatus(event);
  }

  // DELETE /exchanges/{exchangeId}
  if (method === 'DELETE' && path.match(/^\/exchanges\/[^/]+$/)) {
    return deleteExchange(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
