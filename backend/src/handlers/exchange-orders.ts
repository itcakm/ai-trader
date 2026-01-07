import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  ExchangeOrderManager,
  OrderNotFoundError,
  OrderValidationError,
  OrderSubmissionError,
  OrderCancellationError,
  OrderModificationError,
  ExchangeNotSupportedError,
  DuplicateOrderError,
} from '../services/exchange-order-manager';
import {
  OrderRequest,
  OrderModification,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce,
  OrderFilters,
} from '../types/exchange-order';
import { ExchangeId } from '../types/exchange';
import { generateUUID } from '../utils/uuid';
import { requirePermission } from '../middleware/require-role';
import { PERMISSIONS } from '../types/rbac';
import { AuthenticatedEvent } from '../middleware/require-auth';

/**
 * Exchange Order API Handlers
 *
 * Implements API endpoints for order submission, cancellation, modification, and query.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.7, 6.8
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

function getTenantId(event: APIGatewayProxyEvent | AuthenticatedEvent): string | null {
  // Check if this is an authenticated event with user context
  const authEvent = event as AuthenticatedEvent;
  if (authEvent.user?.tenantId) {
    return authEvent.user.tenantId;
  }
  
  // Fallback to header for backward compatibility (deprecated)
  console.warn('SECURITY WARNING: Using X-Tenant-Id header instead of JWT. This is deprecated.');
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
 * Request body for submitting an order
 */
interface SubmitOrderRequest {
  strategyId: string;
  assetId: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  trailingDelta?: number;
  timeInForce: TimeInForce;
  expiresAt?: string;
  exchangeId?: ExchangeId;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request body for modifying an order
 */
interface ModifyOrderRequest {
  newPrice?: number;
  newQuantity?: number;
  newStopPrice?: number;
}

const VALID_ORDER_TYPES: OrderType[] = [
  'MARKET',
  'LIMIT',
  'STOP_LIMIT',
  'STOP_MARKET',
  'TRAILING_STOP',
];

const VALID_ORDER_SIDES: OrderSide[] = ['BUY', 'SELL'];

const VALID_TIME_IN_FORCE: TimeInForce[] = ['GTC', 'IOC', 'FOK', 'GTD'];

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'OPEN',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
];

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

function validateSubmitOrderRequest(
  body: SubmitOrderRequest
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  if (!body.strategyId || body.strategyId.trim() === '') {
    errors.push({ field: 'strategyId', message: 'strategyId is required' });
  }

  if (!body.assetId || body.assetId.trim() === '') {
    errors.push({ field: 'assetId', message: 'assetId is required' });
  }

  if (!body.side || !VALID_ORDER_SIDES.includes(body.side)) {
    errors.push({
      field: 'side',
      message: `side must be one of: ${VALID_ORDER_SIDES.join(', ')}`,
    });
  }

  if (!body.orderType || !VALID_ORDER_TYPES.includes(body.orderType)) {
    errors.push({
      field: 'orderType',
      message: `orderType must be one of: ${VALID_ORDER_TYPES.join(', ')}`,
    });
  }

  if (body.quantity === undefined || body.quantity <= 0) {
    errors.push({ field: 'quantity', message: 'quantity must be a positive number' });
  }

  if (!body.timeInForce || !VALID_TIME_IN_FORCE.includes(body.timeInForce)) {
    errors.push({
      field: 'timeInForce',
      message: `timeInForce must be one of: ${VALID_TIME_IN_FORCE.join(', ')}`,
    });
  }

  // Order type specific validations
  if (body.orderType === 'LIMIT' && (body.price === undefined || body.price <= 0)) {
    errors.push({ field: 'price', message: 'LIMIT orders require a positive price' });
  }

  if (body.orderType === 'STOP_LIMIT') {
    if (body.price === undefined || body.price <= 0) {
      errors.push({ field: 'price', message: 'STOP_LIMIT orders require a positive price' });
    }
    if (body.stopPrice === undefined || body.stopPrice <= 0) {
      errors.push({ field: 'stopPrice', message: 'STOP_LIMIT orders require a positive stopPrice' });
    }
  }

  if (body.orderType === 'STOP_MARKET') {
    if (body.stopPrice === undefined || body.stopPrice <= 0) {
      errors.push({ field: 'stopPrice', message: 'STOP_MARKET orders require a positive stopPrice' });
    }
  }

  if (body.orderType === 'TRAILING_STOP') {
    if (body.trailingDelta === undefined || body.trailingDelta <= 0) {
      errors.push({
        field: 'trailingDelta',
        message: 'TRAILING_STOP orders require a positive trailingDelta',
      });
    }
  }

  // Time-in-force specific validations
  if (body.timeInForce === 'GTD' && !body.expiresAt) {
    errors.push({ field: 'expiresAt', message: 'GTD orders require expiresAt timestamp' });
  }

  if (body.exchangeId && !VALID_EXCHANGE_IDS.includes(body.exchangeId)) {
    errors.push({
      field: 'exchangeId',
      message: `exchangeId must be one of: ${VALID_EXCHANGE_IDS.join(', ')}`,
    });
  }

  return errors;
}


/**
 * POST /orders
 * Submit a new order
 *
 * Requirements: 5.1, 5.2
 */
export async function submitOrder(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<SubmitOrderRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors = validateSubmitOrderRequest(body);
    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const orderId = generateUUID();
    const idempotencyKey = body.idempotencyKey || generateUUID();

    const orderRequest: OrderRequest = {
      orderId,
      tenantId,
      strategyId: body.strategyId,
      assetId: body.assetId,
      side: body.side,
      orderType: body.orderType,
      quantity: body.quantity,
      price: body.price,
      stopPrice: body.stopPrice,
      trailingDelta: body.trailingDelta,
      timeInForce: body.timeInForce,
      expiresAt: body.expiresAt,
      exchangeId: body.exchangeId,
      idempotencyKey,
      metadata: body.metadata,
      timestamp: new Date().toISOString(),
    };

    const response = await ExchangeOrderManager.submitOrder(orderRequest);
    return successResponse(response, 201);
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return errorResponse(400, error.message, 'VALIDATION_FAILED', [
        { field: error.field || 'unknown', message: error.message },
      ]);
    }
    if (error instanceof DuplicateOrderError) {
      return errorResponse(409, error.message, 'DUPLICATE_ORDER', [
        { field: 'idempotencyKey', message: `Existing order: ${error.existingOrderId}` },
      ]);
    }
    if (error instanceof OrderSubmissionError) {
      return errorResponse(400, error.message, 'SUBMISSION_FAILED');
    }
    console.error('Error submitting order:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /orders
 * List orders with optional filters
 *
 * Requirements: 5.2
 */
export async function listOrders(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const queryParams = event.queryStringParameters || {};

    // Build filters from query parameters
    const filters: OrderFilters = {};

    if (queryParams.strategyId) {
      filters.strategyId = queryParams.strategyId;
    }

    if (queryParams.exchangeId) {
      const exchangeId = queryParams.exchangeId as ExchangeId;
      if (!VALID_EXCHANGE_IDS.includes(exchangeId)) {
        return errorResponse(400, 'Invalid exchangeId parameter', 'INVALID_PARAMETER');
      }
      filters.exchangeId = exchangeId;
    }

    if (queryParams.assetId) {
      filters.assetId = queryParams.assetId;
    }

    if (queryParams.status) {
      const statuses = queryParams.status.split(',') as OrderStatus[];
      for (const status of statuses) {
        if (!VALID_ORDER_STATUSES.includes(status)) {
          return errorResponse(400, `Invalid status: ${status}`, 'INVALID_PARAMETER');
        }
      }
      filters.status = statuses;
    }

    if (queryParams.side) {
      const side = queryParams.side as OrderSide;
      if (!VALID_ORDER_SIDES.includes(side)) {
        return errorResponse(400, 'Invalid side parameter', 'INVALID_PARAMETER');
      }
      filters.side = side;
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
      filters.limit = limit;
    }

    const orders = await ExchangeOrderManager.listOrders(tenantId, filters);
    return successResponse({ orders });
  } catch (error) {
    console.error('Error listing orders:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /orders/{orderId}
 * Get a specific order by ID
 *
 * Requirements: 5.2
 */
export async function getOrder(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const orderId = event.pathParameters?.orderId;
    if (!orderId) {
      return errorResponse(400, 'Missing order ID', 'MISSING_PARAMETER');
    }

    const order = await ExchangeOrderManager.getOrder(tenantId, orderId);
    return successResponse(order);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    console.error('Error getting order:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}


/**
 * DELETE /orders/{orderId}
 * Cancel an order
 *
 * Requirements: 5.4
 */
export async function cancelOrder(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const orderId = event.pathParameters?.orderId;
    if (!orderId) {
      return errorResponse(400, 'Missing order ID', 'MISSING_PARAMETER');
    }

    const response = await ExchangeOrderManager.cancelOrder(tenantId, orderId);
    return successResponse({
      message: 'Order cancellation requested',
      ...response,
    });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof OrderCancellationError) {
      return errorResponse(400, error.message, 'CANCELLATION_FAILED', [
        { field: 'orderId', message: error.reason || error.message },
      ]);
    }
    console.error('Error cancelling order:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /orders/{orderId}
 * Modify an existing order
 *
 * Requirements: 5.3
 */
export async function modifyOrder(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const orderId = event.pathParameters?.orderId;
    if (!orderId) {
      return errorResponse(400, 'Missing order ID', 'MISSING_PARAMETER');
    }

    const body = parseBody<ModifyOrderRequest>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    // Validate at least one modification is provided
    if (
      body.newPrice === undefined &&
      body.newQuantity === undefined &&
      body.newStopPrice === undefined
    ) {
      return errorResponse(400, 'At least one modification is required', 'VALIDATION_FAILED', [
        { field: 'body', message: 'Provide newPrice, newQuantity, or newStopPrice' },
      ]);
    }

    // Validate modification values
    const errors: { field: string; message: string }[] = [];

    if (body.newPrice !== undefined && body.newPrice <= 0) {
      errors.push({ field: 'newPrice', message: 'newPrice must be positive' });
    }

    if (body.newQuantity !== undefined && body.newQuantity <= 0) {
      errors.push({ field: 'newQuantity', message: 'newQuantity must be positive' });
    }

    if (body.newStopPrice !== undefined && body.newStopPrice <= 0) {
      errors.push({ field: 'newStopPrice', message: 'newStopPrice must be positive' });
    }

    if (errors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', errors);
    }

    const modifications: OrderModification = {
      newPrice: body.newPrice,
      newQuantity: body.newQuantity,
      newStopPrice: body.newStopPrice,
    };

    const response = await ExchangeOrderManager.modifyOrder(tenantId, orderId, modifications);
    return successResponse({
      message: 'Order modified successfully',
      ...response,
    });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    if (error instanceof OrderModificationError) {
      return errorResponse(400, error.message, 'MODIFICATION_FAILED', [
        { field: 'orderId', message: error.reason || error.message },
      ]);
    }
    if (error instanceof ExchangeNotSupportedError) {
      return errorResponse(400, error.message, 'NOT_SUPPORTED');
    }
    console.error('Error modifying order:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /orders/open
 * Get all open orders for the tenant
 *
 * Requirements: 5.2
 */
export async function getOpenOrders(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const strategyId = event.queryStringParameters?.strategyId;

    const orders = await ExchangeOrderManager.getOpenOrders(tenantId, strategyId);
    return successResponse({ orders });
  } catch (error) {
    console.error('Error getting open orders:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Permission-protected route handlers
 * Requirements: 6.7, 6.8
 */

// Read operations require read:orders permission
const readOrdersHandler = requirePermission(
  [PERMISSIONS.ORDERS_READ],
  async (event: AuthenticatedEvent, context: Context) => {
    const path = event.path;
    
    if (path === '/orders') {
      return listOrders(event);
    }
    if (path === '/orders/open') {
      return getOpenOrders(event);
    }
    return getOrder(event);
  }
);

// Execute operations require execute:orders permission
const executeOrdersHandler = requirePermission(
  [PERMISSIONS.ORDERS_EXECUTE],
  async (event: AuthenticatedEvent, context: Context) => {
    return submitOrder(event);
  }
);

// Cancel operations require cancel:orders permission
const cancelOrdersHandler = requirePermission(
  [PERMISSIONS.ORDERS_CANCEL],
  async (event: AuthenticatedEvent, context: Context) => {
    return cancelOrder(event);
  }
);

// Modify operations require execute:orders permission (same as submit)
const modifyOrdersHandler = requirePermission(
  [PERMISSIONS.ORDERS_EXECUTE],
  async (event: AuthenticatedEvent, context: Context) => {
    return modifyOrder(event);
  }
);

/**
 * Main handler that routes requests based on HTTP method and path
 * 
 * Requirements: 6.7, 6.8 - Check permissions before executing operations
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const path = event.path;
  const method = event.httpMethod;

  // POST /orders - requires execute:orders permission
  if (method === 'POST' && path === '/orders') {
    return executeOrdersHandler(event, context);
  }

  // GET /orders, GET /orders/open, GET /orders/{orderId} - requires read:orders permission
  if (method === 'GET') {
    return readOrdersHandler(event, context);
  }

  // DELETE /orders/{orderId} - requires cancel:orders permission
  if (method === 'DELETE' && path.match(/^\/orders\/[^/]+$/)) {
    return cancelOrdersHandler(event, context);
  }

  // PATCH /orders/{orderId} - requires execute:orders permission
  if (method === 'PATCH' && path.match(/^\/orders\/[^/]+$/)) {
    return modifyOrdersHandler(event, context);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
