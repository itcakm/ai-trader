/**
 * Auth Router Handler
 * 
 * Main entry point for all authentication endpoints.
 * Routes requests to appropriate handlers based on path and method.
 * Handles OPTIONS for CORS preflight.
 * 
 * Requirements: 3.1-3.12, 7.3-7.5
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { signup } from './auth/signup';
import { login } from './auth/login';
import { logout } from './auth/logout';
import { refresh } from './auth/refresh';
import { verifyEmail } from './auth/verify-email';
import { resendVerification } from './auth/resend-verification';
import { forgotPassword } from './auth/forgot-password';
import { resetPassword } from './auth/reset-password';
import { mfaSetup } from './auth/mfa-setup';
import { mfaVerify } from './auth/mfa-verify';
import { mfaChallenge } from './auth/mfa-challenge';
import { me } from './auth/me';
import { changePassword } from './auth/change-password';
import { ssoProviders } from './auth/sso-providers';
import { ssoInitiate } from './auth/sso-initiate';
import { ssoCallback } from './auth/sso-callback';
import { exportAuditLogs } from './auth/audit-export';

/**
 * Common CORS headers for all responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

/**
 * Create an error response
 */
function errorResponse(
  statusCode: number,
  message: string,
  code: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      error: 'AuthError',
      code,
      message
    })
  };
}

/**
 * Normalize path by removing trailing slashes and converting to lowercase
 */
function normalizePath(path: string): string {
  return path.replace(/\/+$/, '').toLowerCase();
}

/**
 * Main auth router handler
 * 
 * Routes:
 * - POST /auth/signup - Register new user (Requirement 3.1)
 * - POST /auth/login - Authenticate user (Requirement 3.2)
 * - POST /auth/logout - Sign out user (Requirement 3.3)
 * - POST /auth/refresh - Refresh access token (Requirement 3.4)
 * - POST /auth/verify-email - Verify email with code (Requirement 3.5)
 * - POST /auth/resend-verification - Resend verification code (Requirement 3.6)
 * - POST /auth/forgot-password - Request password reset (Requirement 3.7)
 * - POST /auth/reset-password - Complete password reset (Requirement 3.8)
 * - POST /auth/change-password - Change password with current password (Requirement 12.5)
 * - POST /auth/mfa/setup - Start MFA setup (Requirement 3.9)
 * - POST /auth/mfa/verify - Verify MFA setup (Requirement 3.10)
 * - POST /auth/mfa/challenge - Respond to MFA challenge (Requirement 3.11)
 * - GET /auth/me - Get current user profile (Requirement 3.12)
 * - GET /auth/sso/providers - List SSO providers (Requirement 7.3)
 * - GET /auth/sso/initiate/:providerId - Start SSO flow (Requirement 7.4)
 * - GET/POST /auth/sso/callback - Handle SSO callback (Requirement 7.5)
 * - GET /auth/audit/export - Export audit logs for compliance (Requirement 11.10)
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = normalizePath(event.path);

  // Handle CORS preflight for all routes
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Route: POST /auth/signup
  if (method === 'POST' && path === '/auth/signup') {
    return signup(event);
  }

  // Route: POST /auth/login
  if (method === 'POST' && path === '/auth/login') {
    return login(event);
  }

  // Route: POST /auth/logout
  if (method === 'POST' && path === '/auth/logout') {
    return logout(event);
  }

  // Route: POST /auth/refresh
  if (method === 'POST' && path === '/auth/refresh') {
    return refresh(event);
  }

  // Route: POST /auth/verify-email
  if (method === 'POST' && path === '/auth/verify-email') {
    return verifyEmail(event);
  }

  // Route: POST /auth/resend-verification
  if (method === 'POST' && path === '/auth/resend-verification') {
    return resendVerification(event);
  }

  // Route: POST /auth/forgot-password
  if (method === 'POST' && path === '/auth/forgot-password') {
    return forgotPassword(event);
  }

  // Route: POST /auth/reset-password
  if (method === 'POST' && path === '/auth/reset-password') {
    return resetPassword(event);
  }

  // Route: POST /auth/change-password (Requirement 12.5)
  if (method === 'POST' && path === '/auth/change-password') {
    return changePassword(event);
  }

  // Route: POST /auth/mfa/setup
  if (method === 'POST' && path === '/auth/mfa/setup') {
    return mfaSetup(event);
  }

  // Route: POST /auth/mfa/verify
  if (method === 'POST' && path === '/auth/mfa/verify') {
    return mfaVerify(event);
  }

  // Route: POST /auth/mfa/challenge
  if (method === 'POST' && path === '/auth/mfa/challenge') {
    return mfaChallenge(event);
  }

  // Route: GET /auth/me
  if (method === 'GET' && path === '/auth/me') {
    return me(event);
  }

  // SSO Routes (Requirements: 7.3, 7.4, 7.5)
  
  // Route: GET /auth/sso/providers - List SSO providers
  if (method === 'GET' && path === '/auth/sso/providers') {
    return ssoProviders(event);
  }

  // Route: GET /auth/sso/initiate/:providerId - Start SSO flow
  if (method === 'GET' && path.startsWith('/auth/sso/initiate/')) {
    // Extract provider ID from path
    const providerId = path.replace('/auth/sso/initiate/', '');
    event.pathParameters = { ...event.pathParameters, providerId };
    return ssoInitiate(event);
  }

  // Route: GET/POST /auth/sso/callback - Handle SSO callback
  if ((method === 'GET' || method === 'POST') && path === '/auth/sso/callback') {
    return ssoCallback(event);
  }

  // Audit Export Route (Requirement: 11.10)
  
  // Route: GET /auth/audit/export - Export audit logs for compliance
  if (method === 'GET' && path === '/auth/audit/export') {
    return exportAuditLogs(event);
  }

  // Route not found
  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
