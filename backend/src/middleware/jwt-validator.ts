/**
 * JWT Validation Middleware for API Gateway Lambda handlers.
 * Validates Cognito JWTs and extracts user context for protected endpoints.
 * 
 * Requirements: 4.1, 4.4, 4.5, 4.6, 4.7, 4.10
 * - Extract JWT from Authorization header (Bearer token format)
 * - Validate JWT signature using Cognito JWKS
 * - Validate token expiration (exp claim)
 * - Validate token issuer (iss claim) matches Cognito User Pool
 * - Validate token audience (aud/client_id claim) matches App Client
 * - Extract user claims (sub, email, tenant_id, roles) and attach to request context
 * - Support both access tokens (for API calls) and ID tokens (for user info)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';
import { getKeyCallback } from './jwks-client';
import { UserContext, TokenPayload, AUTH_ERROR_CODES, AuthErrorCode } from '../types/auth';

// Environment variables
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

/**
 * Result of JWT validation - either success with user context or failure with error details.
 */
export interface ValidationResult {
  success: boolean;
  user?: UserContext;
  error?: {
    code: AuthErrorCode;
    message: string;
  };
}

/**
 * Gets the expected issuer URL for the Cognito User Pool.
 */
export function getExpectedIssuer(
  region: string = AWS_REGION,
  userPoolId: string = COGNITO_USER_POOL_ID
): string {
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}

/**
 * Extracts the Bearer token from the Authorization header.
 * 
 * @param event - API Gateway event
 * @returns The token string or null if not present/invalid format
 */
export function extractBearerToken(event: APIGatewayProxyEvent): string | null {
  // Check both capitalized and lowercase header names
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  
  if (!authHeader) {
    return null;
  }

  // Must be Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Parses user context from validated token payload.
 * Handles both access tokens and ID tokens.
 * 
 * @param payload - Decoded JWT payload
 * @returns UserContext with extracted claims
 */
export function parseUserContext(payload: TokenPayload): UserContext {
  // Parse roles from custom attribute (stored as JSON string)
  let roles: string[] = [];
  if (payload['custom:roles']) {
    try {
      roles = JSON.parse(payload['custom:roles']);
      if (!Array.isArray(roles)) {
        roles = [];
      }
    } catch {
      // If parsing fails, treat as empty roles
      roles = [];
    }
  }

  return {
    userId: payload.sub,
    email: payload.email || '',
    tenantId: payload['custom:tenant_id'] || '',
    roles,
    emailVerified: payload.email_verified ?? false,
  };
}

/**
 * Validates a JWT token and extracts user context.
 * 
 * Performs the following validations:
 * 1. Signature verification using JWKS
 * 2. Expiration check (exp claim)
 * 3. Issuer validation (iss claim)
 * 4. Audience validation (aud/client_id claim)
 * 
 * @param token - The JWT token string
 * @param options - Optional validation configuration
 * @returns ValidationResult with user context on success or error details on failure
 */
export async function validateToken(
  token: string,
  options?: {
    expectedIssuer?: string;
    expectedAudience?: string;
    allowedTokenUse?: ('access' | 'id')[];
  }
): Promise<ValidationResult> {
  const expectedIssuer = options?.expectedIssuer || getExpectedIssuer();
  const expectedAudience = options?.expectedAudience || COGNITO_CLIENT_ID;
  const allowedTokenUse = options?.allowedTokenUse || ['access', 'id'];

  return new Promise((resolve) => {
    jwt.verify(
      token,
      getKeyCallback,
      {
        algorithms: ['RS256'],
        issuer: expectedIssuer,
        // Note: Cognito uses 'client_id' for access tokens and 'aud' for ID tokens
        // We validate this manually after decoding
      },
      (err, decoded) => {
        if (err) {
          // Handle specific JWT errors
          if (err.name === 'TokenExpiredError') {
            resolve({
              success: false,
              error: {
                code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                message: 'Token has expired',
              },
            });
            return;
          }

          if (err.name === 'JsonWebTokenError') {
            resolve({
              success: false,
              error: {
                code: AUTH_ERROR_CODES.INVALID_TOKEN,
                message: 'Invalid token',
              },
            });
            return;
          }

          if (err.name === 'NotBeforeError') {
            resolve({
              success: false,
              error: {
                code: AUTH_ERROR_CODES.INVALID_TOKEN,
                message: 'Token not yet valid',
              },
            });
            return;
          }

          // Generic error
          resolve({
            success: false,
            error: {
              code: AUTH_ERROR_CODES.INVALID_TOKEN,
              message: 'Token validation failed',
            },
          });
          return;
        }

        const payload = decoded as TokenPayload;

        // Validate token_use claim
        if (payload.token_use && !allowedTokenUse.includes(payload.token_use)) {
          resolve({
            success: false,
            error: {
              code: AUTH_ERROR_CODES.INVALID_TOKEN,
              message: `Invalid token type: ${payload.token_use}`,
            },
          });
          return;
        }

        // Validate audience/client_id
        // Access tokens use 'client_id', ID tokens use 'aud'
        const tokenAudience = payload.aud || (payload as any).client_id;
        if (expectedAudience && tokenAudience !== expectedAudience) {
          resolve({
            success: false,
            error: {
              code: AUTH_ERROR_CODES.INVALID_TOKEN,
              message: 'Invalid token audience',
            },
          });
          return;
        }

        // Extract user context
        const user = parseUserContext(payload);

        resolve({
          success: true,
          user,
        });
      }
    );
  });
}

/**
 * Validates the JWT from an API Gateway event and returns user context.
 * 
 * @param event - API Gateway proxy event
 * @returns ValidationResult with user context or error
 */
export async function validateRequest(event: APIGatewayProxyEvent): Promise<ValidationResult> {
  const token = extractBearerToken(event);

  if (!token) {
    return {
      success: false,
      error: {
        code: AUTH_ERROR_CODES.INVALID_TOKEN,
        message: 'Missing or invalid Authorization header',
      },
    };
  }

  return validateToken(token);
}

/**
 * Type guard to check if validation was successful.
 */
export function isValidationSuccess(result: ValidationResult): result is ValidationResult & { user: UserContext } {
  return result.success && result.user !== undefined;
}
