/**
 * Signup Handler
 * 
 * Handles user registration by proxying to Cognito SignUp API.
 * Validates request body, calls Cognito, logs signup event, and returns sanitized response.
 * 
 * Requirements: 3.1, 3.13, 3.14
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { SignupRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
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
 * Create an error response with sanitized message
 * Requirements: 3.14
 */
function errorResponse(
  statusCode: number,
  message: string,
  code: string,
  retryAfter?: number
): APIGatewayProxyResult {
  const body: Record<string, unknown> = {
    error: 'AuthError',
    code,
    message
  };
  
  if (retryAfter) {
    body.retryAfter = retryAfter;
  }

  const headers = { ...CORS_HEADERS };
  if (retryAfter) {
    (headers as Record<string, string>)['Retry-After'] = String(retryAfter);
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
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
 * Extract client IP from request
 */
function getClientIp(event: APIGatewayProxyEvent): string {
  return event.requestContext?.identity?.sourceIp || 
         event.headers['X-Forwarded-For']?.split(',')[0]?.trim() || 
         'unknown';
}

/**
 * Extract user agent from request
 */
function getUserAgent(event: APIGatewayProxyEvent): string {
  return event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown';
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate signup request body
 * Requirements: 3.13
 */
function validateSignupRequest(body: SignupRequest | null): { valid: boolean; error?: string; code?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  if (!body.email) {
    return { valid: false, error: 'Email is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  if (!isValidEmail(body.email)) {
    return { valid: false, error: 'Invalid email format', code: AUTH_ERROR_CODES.INVALID_EMAIL_FORMAT };
  }

  if (!body.password) {
    return { valid: false, error: 'Password is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  if (!body.name) {
    return { valid: false, error: 'Name is required', code: AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD };
  }

  if (body.name.length < 1 || body.name.length > 256) {
    return { valid: false, error: 'Name must be between 1 and 256 characters', code: AUTH_ERROR_CODES.INVALID_REQUEST };
  }

  return { valid: true };
}

/**
 * POST /auth/signup
 * 
 * Register a new user account.
 * 
 * Requirements: 3.1, 3.13, 3.14
 */
export async function signup(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  try {
    // Parse and validate request body
    const body = parseBody<SignupRequest>(event);
    const validation = validateSignupRequest(body);

    if (!validation.valid) {
      return errorResponse(400, validation.error!, validation.code!);
    }

    const request = body!;

    // Call Cognito SignUp API
    const result = await CognitoClientService.signUp(request);

    // Log signup event
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.SIGNUP,
      userId: result.userId,
      email: request.email,
      ip: clientIp,
      userAgent,
      success: true,
      metadata: {
        userConfirmed: result.userConfirmed,
        codeDeliveryDestination: result.codeDeliveryDetails?.destination
      }
    });

    // Return sanitized response
    return successResponse({
      userId: result.userId,
      userConfirmed: result.userConfirmed,
      message: result.userConfirmed 
        ? 'Account created successfully' 
        : 'Account created. Please check your email for verification code.',
      codeDeliveryDetails: result.codeDeliveryDetails ? {
        destination: result.codeDeliveryDetails.destination,
        deliveryMedium: result.codeDeliveryDetails.deliveryMedium
      } : undefined
    }, 201);

  } catch (error) {
    // Log failed signup attempt
    const body = parseBody<SignupRequest>(event);
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.SIGNUP,
      email: body?.email,
      ip: clientIp,
      userAgent,
      success: false,
      reason: error instanceof AuthError ? error.code : 'UNKNOWN_ERROR'
    });

    // Handle known auth errors
    if (error instanceof AuthError) {
      return errorResponse(
        error.statusCode,
        error.message,
        error.code,
        error.retryAfter
      );
    }

    // Log unexpected errors
    console.error('Signup error:', error);
    return errorResponse(500, 'Registration failed', AUTH_ERROR_CODES.AUTH_ERROR);
  }
}

/**
 * Handler for Lambda invocation
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

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  return signup(event);
}
