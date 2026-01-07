/**
 * Authentication wrapper functions for Lambda handlers.
 * Provides higher-order functions to protect endpoints with JWT validation.
 * 
 * Requirements: 4.1-4.9
 * - Create higher-order function for protected handlers
 * - Validate token before invoking handler
 * - Pass user context to handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { validateRequest, isValidationSuccess, ValidationResult } from './jwt-validator';
import { createMissingTokenResponse, createInvalidTokenResponse } from './auth-errors';
import { UserContext, AUTH_ERROR_CODES } from '../types/auth';

/**
 * Extended API Gateway event with user context attached.
 */
export interface AuthenticatedEvent extends APIGatewayProxyEvent {
  user: UserContext;
}

/**
 * Handler function type for authenticated endpoints.
 */
export type AuthenticatedHandler = (
  event: AuthenticatedEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

/**
 * Handler function type for standard Lambda handlers.
 */
export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

/**
 * Options for the requireAuth wrapper.
 */
export interface RequireAuthOptions {
  /**
   * Allowed token types. Defaults to both 'access' and 'id'.
   */
  allowedTokenUse?: ('access' | 'id')[];
  
  /**
   * Custom error handler for authentication failures.
   */
  onAuthError?: (result: ValidationResult, event: APIGatewayProxyEvent) => APIGatewayProxyResult;
}

/**
 * Higher-order function that wraps a handler to require authentication.
 * 
 * Validates the JWT token from the Authorization header before invoking
 * the wrapped handler. If validation fails, returns an appropriate error response.
 * 
 * @param handler - The handler function to wrap
 * @param options - Optional configuration
 * @returns A wrapped handler that validates authentication first
 * 
 * @example
 * ```typescript
 * // Basic usage
 * export const handler = requireAuth(async (event, context) => {
 *   const { userId, tenantId } = event.user;
 *   // Handler logic here
 *   return { statusCode: 200, body: JSON.stringify({ userId }) };
 * });
 * 
 * // With options
 * export const handler = requireAuth(
 *   async (event, context) => { ... },
 *   { allowedTokenUse: ['access'] }
 * );
 * ```
 */
export function requireAuth(
  handler: AuthenticatedHandler,
  options?: RequireAuthOptions
): LambdaHandler {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    // Check for Authorization header first
    const authHeader = event.headers['Authorization'] || event.headers['authorization'];
    if (!authHeader) {
      return createMissingTokenResponse();
    }

    // Validate the token
    const validationResult = await validateRequest(event);

    if (!isValidationSuccess(validationResult)) {
      // Use custom error handler if provided
      if (options?.onAuthError) {
        return options.onAuthError(validationResult, event);
      }

      // Return appropriate error response
      const errorCode = validationResult.error?.code || AUTH_ERROR_CODES.INVALID_TOKEN;
      return createInvalidTokenResponse(errorCode, validationResult.error?.message);
    }

    // Attach user context to event
    const authenticatedEvent: AuthenticatedEvent = {
      ...event,
      user: validationResult.user,
    };

    // Invoke the wrapped handler
    return handler(authenticatedEvent, context);
  };
}

/**
 * Extracts user context from an authenticated event.
 * Throws an error if the event is not authenticated.
 * 
 * @param event - The API Gateway event (should be authenticated)
 * @returns The user context
 * @throws Error if user context is not present
 */
export function getUserContext(event: APIGatewayProxyEvent): UserContext {
  const user = (event as AuthenticatedEvent).user;
  if (!user) {
    throw new Error('User context not found. Ensure the handler is wrapped with requireAuth.');
  }
  return user;
}

/**
 * Safely gets user context from an event, returning undefined if not present.
 * Useful for handlers that support both authenticated and unauthenticated access.
 * 
 * @param event - The API Gateway event
 * @returns The user context or undefined
 */
export function getOptionalUserContext(event: APIGatewayProxyEvent): UserContext | undefined {
  return (event as AuthenticatedEvent).user;
}

/**
 * Type guard to check if an event has user context attached.
 */
export function isAuthenticatedEvent(event: APIGatewayProxyEvent): event is AuthenticatedEvent {
  return 'user' in event && (event as AuthenticatedEvent).user !== undefined;
}
