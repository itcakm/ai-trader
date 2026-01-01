import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AuditStreamerService } from '../services/audit-streamer';
import { 
  StreamFilters, 
  NotificationConfigInput,
  NotificationChannelType 
} from '../types/audit-stream';
import { ValidationError } from '../types/validation';

/**
 * Audit Stream API Handlers
 * 
 * Implements endpoints for real-time audit event streaming:
 * - POST /audit/stream/subscribe - Subscribe to audit events
 * - DELETE /audit/stream/subscriptions/{subscriptionId} - Unsubscribe
 * - GET /audit/stream/subscriptions - List subscriptions
 * - GET /audit/stream/subscriptions/{subscriptionId} - Get subscription
 * - GET /audit/stream/subscriptions/{subscriptionId}/events - Get buffered events
 * - POST /audit/stream/notifications - Configure notifications
 * - GET /audit/stream/notifications - Get notification config
 * 
 * Note: WebSocket connections are handled separately via API Gateway WebSocket API.
 * These REST endpoints manage subscription state and configuration.
 * 
 * Requirements: 10.1, 10.2
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id,X-User-Id',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
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

function getUserId(event: APIGatewayProxyEvent): string | null {
  return event.headers['X-User-Id'] || event.headers['x-user-id'] || null;
}

function parseBody<T>(event: APIGatewayProxyEvent): T | null {
  try {
    if (!event.body) return null;
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
}

function isValidISODate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}


const VALID_NOTIFICATION_TYPES: NotificationChannelType[] = ['EMAIL', 'SMS', 'SLACK', 'WEBHOOK'];
const VALID_SEVERITY_THRESHOLDS = ['CRITICAL', 'EMERGENCY'];

/**
 * POST /audit/stream/subscribe
 * Subscribe to audit event stream
 * 
 * Requirements: 10.1, 10.2
 */
export async function subscribe(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const userId = getUserId(event);
    if (!userId) {
      return errorResponse(401, 'Missing user ID', 'UNAUTHORIZED');
    }

    const body = parseBody<{ filters?: StreamFilters }>(event);
    const filters = body?.filters;

    const subscription = await AuditStreamerService.subscribe(tenantId, userId, filters);

    return successResponse(subscription, 201);
  } catch (error) {
    console.error('Error creating subscription:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /audit/stream/subscriptions/{subscriptionId}
 * Unsubscribe from audit event stream
 */
export async function unsubscribe(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const subscriptionId = event.pathParameters?.subscriptionId;
    if (!subscriptionId) {
      return errorResponse(400, 'Missing subscription ID', 'MISSING_PARAMETER');
    }

    // Verify subscription belongs to tenant
    const subscription = await AuditStreamerService.getSubscription(subscriptionId);
    if (!subscription) {
      return errorResponse(404, 'Subscription not found', 'NOT_FOUND');
    }
    if (subscription.tenantId !== tenantId) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }

    await AuditStreamerService.unsubscribe(subscriptionId);

    return successResponse({ message: 'Unsubscribed successfully', subscriptionId });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/stream/subscriptions
 * List all subscriptions for tenant
 * 
 * Requirements: 10.5
 */
export async function listSubscriptions(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const subscriptions = await AuditStreamerService.listSubscriptions(tenantId);

    return successResponse({
      subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/stream/subscriptions/{subscriptionId}
 * Get a specific subscription
 */
export async function getSubscription(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const subscriptionId = event.pathParameters?.subscriptionId;
    if (!subscriptionId) {
      return errorResponse(400, 'Missing subscription ID', 'MISSING_PARAMETER');
    }

    const subscription = await AuditStreamerService.getSubscription(subscriptionId);

    if (!subscription) {
      return errorResponse(404, 'Subscription not found', 'NOT_FOUND');
    }

    if (subscription.tenantId !== tenantId) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }

    return successResponse(subscription);
  } catch (error) {
    console.error('Error getting subscription:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/stream/subscriptions/{subscriptionId}/events
 * Get buffered events for reconnection replay
 * 
 * Requirements: 10.6
 */
export async function getBufferedEvents(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const subscriptionId = event.pathParameters?.subscriptionId;
    if (!subscriptionId) {
      return errorResponse(400, 'Missing subscription ID', 'MISSING_PARAMETER');
    }

    // Verify subscription belongs to tenant
    const subscription = await AuditStreamerService.getSubscription(subscriptionId);
    if (!subscription) {
      return errorResponse(404, 'Subscription not found', 'NOT_FOUND');
    }
    if (subscription.tenantId !== tenantId) {
      return errorResponse(403, 'Access denied', 'FORBIDDEN');
    }

    // Get 'since' parameter
    const since = event.queryStringParameters?.since;
    if (!since) {
      return errorResponse(400, 'Missing since parameter', 'MISSING_PARAMETER', [
        { field: 'since', code: 'REQUIRED', message: 'since query parameter is required (ISO timestamp)' }
      ]);
    }

    if (!isValidISODate(since)) {
      return errorResponse(400, 'Invalid since parameter', 'INVALID_PARAMETER', [
        { field: 'since', code: 'INVALID', message: 'since must be a valid ISO timestamp' }
      ]);
    }

    const events = await AuditStreamerService.getBufferedEvents(subscriptionId, since);

    return successResponse({
      subscriptionId,
      since,
      events,
      count: events.length
    });
  } catch (error) {
    console.error('Error getting buffered events:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * POST /audit/stream/notifications
 * Configure push notifications for critical events
 * 
 * Requirements: 10.4
 */
export async function configureNotifications(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<Omit<NotificationConfigInput, 'tenantId'>>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    // Validate channels
    if (!Array.isArray(body.channels) || body.channels.length === 0) {
      validationErrors.push({ field: 'channels', code: 'REQUIRED', message: 'channels must be a non-empty array' });
    } else {
      for (let i = 0; i < body.channels.length; i++) {
        const channel = body.channels[i];
        if (!channel.type || !VALID_NOTIFICATION_TYPES.includes(channel.type)) {
          validationErrors.push({ 
            field: `channels[${i}].type`, 
            code: 'INVALID', 
            message: `type must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}` 
          });
        }
        if (!channel.destination) {
          validationErrors.push({ field: `channels[${i}].destination`, code: 'REQUIRED', message: 'destination is required' });
        }
        if (typeof channel.enabled !== 'boolean') {
          validationErrors.push({ field: `channels[${i}].enabled`, code: 'REQUIRED', message: 'enabled must be a boolean' });
        }
      }
    }

    // Validate severity threshold
    if (!body.severityThreshold || !VALID_SEVERITY_THRESHOLDS.includes(body.severityThreshold)) {
      validationErrors.push({ 
        field: 'severityThreshold', 
        code: 'INVALID', 
        message: `severityThreshold must be one of: ${VALID_SEVERITY_THRESHOLDS.join(', ')}` 
      });
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    const config: NotificationConfigInput = {
      ...body,
      tenantId
    };

    const savedConfig = await AuditStreamerService.configureNotifications(config);

    return successResponse(savedConfig, 201);
  } catch (error) {
    console.error('Error configuring notifications:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/stream/notifications
 * Get notification configuration for tenant
 */
export async function getNotificationConfig(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const config = await AuditStreamerService.getNotificationConfig(tenantId);

    if (!config) {
      return errorResponse(404, 'Notification configuration not found', 'NOT_FOUND');
    }

    return successResponse(config);
  } catch (error) {
    console.error('Error getting notification config:', error);
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

  // POST /audit/stream/subscribe
  if (method === 'POST' && path === '/audit/stream/subscribe') {
    return subscribe(event);
  }

  // DELETE /audit/stream/subscriptions/{subscriptionId}
  if (method === 'DELETE' && path.match(/^\/audit\/stream\/subscriptions\/[^/]+$/)) {
    return unsubscribe(event);
  }

  // GET /audit/stream/subscriptions/{subscriptionId}/events
  if (method === 'GET' && path.match(/^\/audit\/stream\/subscriptions\/[^/]+\/events$/)) {
    return getBufferedEvents(event);
  }

  // GET /audit/stream/subscriptions/{subscriptionId}
  if (method === 'GET' && path.match(/^\/audit\/stream\/subscriptions\/[^/]+$/)) {
    return getSubscription(event);
  }

  // GET /audit/stream/subscriptions
  if (method === 'GET' && path === '/audit/stream/subscriptions') {
    return listSubscriptions(event);
  }

  // POST /audit/stream/notifications
  if (method === 'POST' && path === '/audit/stream/notifications') {
    return configureNotifications(event);
  }

  // GET /audit/stream/notifications
  if (method === 'GET' && path === '/audit/stream/notifications') {
    return getNotificationConfig(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
