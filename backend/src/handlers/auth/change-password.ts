/**
 * Change Password Handler
 * 
 * Handles password change requests with current password validation.
 * Invalidates all tokens and sends notification email on success.
 * 
 * Requirements: 12.5, 8.7, 12.3, 12.8
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoClientService } from '../../services/cognito-client';
import { AuthAuditService, AUTH_EVENT_TYPES } from '../../services/auth-audit';
import { PasswordHistoryService } from '../../services/password-history';
import { validateRequest, isValidationSuccess } from '../../middleware/jwt-validator';
import { ChangePasswordRequest, AuthError, AUTH_ERROR_CODES } from '../../types/auth';

/**
 * Validate change password request body
 */
function validateRequestBody(body: any): ChangePasswordRequest {
  if (!body) {
    throw new AuthError(AUTH_ERROR_CODES.INVALID_REQUEST, 'Request body is required', 400);
  }

  const { previousPassword, proposedPassword } = body;

  if (!previousPassword || typeof previousPassword !== 'string') {
    throw new AuthError(AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD, 'Current password is required', 400);
  }

  if (!proposedPassword || typeof proposedPassword !== 'string') {
    throw new AuthError(AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD, 'New password is required', 400);
  }

  // Validate password strength (basic validation - Cognito will do full validation)
  if (proposedPassword.length < 12) {
    throw new AuthError(AUTH_ERROR_CODES.WEAK_PASSWORD, 'Password must be at least 12 characters', 400);
  }

  if (previousPassword === proposedPassword) {
    throw new AuthError(AUTH_ERROR_CODES.WEAK_PASSWORD, 'New password must be different from current password', 400);
  }

  return {
    accessToken: '', // Will be extracted from header
    previousPassword,
    proposedPassword,
  };
}

/**
 * Extract access token from Authorization header
 */
function extractAccessToken(event: APIGatewayProxyEvent): string {
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError(AUTH_ERROR_CODES.INVALID_TOKEN, 'Authorization header is required', 401);
  }

  return authHeader.substring(7);
}

/**
 * Send password change notification email
 * Requirements: 12.3
 */
async function sendPasswordChangeNotification(
  email: string,
  name: string,
  ip: string
): Promise<void> {
  // In production, this would use SES to send a notification email
  console.log('Password change notification would be sent', {
    email,
    name,
    ip,
    timestamp: new Date().toISOString(),
  });

  // TODO: Implement SES email sending
  // const ses = new SESClient({ region: process.env.AWS_REGION });
  // await ses.send(new SendEmailCommand({
  //   Destination: { ToAddresses: [email] },
  //   Message: {
  //     Subject: { Data: 'Your password has been changed' },
  //     Body: {
  //       Html: { Data: `<p>Your password was changed on ${new Date().toISOString()}...</p>` },
  //       Text: { Data: `Your password was changed on ${new Date().toISOString()}...` },
  //     },
  //   },
  //   Source: process.env.SES_FROM_EMAIL,
  // }));
}

/**
 * Change Password Handler
 * 
 * POST /auth/change-password
 * 
 * Request body:
 * {
 *   "previousPassword": "current-password",
 *   "proposedPassword": "new-password"
 * }
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 */
export async function changePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const clientIp = event.requestContext.identity?.sourceIp || 'unknown';
  const userAgent = event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown';

  try {
    // Validate the JWT token first
    const validationResult = await validateRequest(event);
    if (!isValidationSuccess(validationResult)) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="api"',
        },
        body: JSON.stringify({
          error: 'Unauthorized',
          code: validationResult.error?.code || AUTH_ERROR_CODES.INVALID_TOKEN,
          message: validationResult.error?.message || 'Valid access token is required',
        }),
      };
    }

    const user = validationResult.user;

    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const request = validateRequestBody(body);

    // Check password history - Requirements: 12.8
    const historyError = await PasswordHistoryService.validateNewPassword(
      user.userId,
      request.proposedPassword
    );
    if (historyError) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          code: AUTH_ERROR_CODES.WEAK_PASSWORD,
          message: historyError,
        }),
      };
    }

    // Extract access token from header
    const accessToken = extractAccessToken(event);

    // Change password using Cognito
    // This validates the current password and updates to the new one
    await CognitoClientService.changePassword(
      accessToken,
      request.previousPassword,
      request.proposedPassword
    );

    // Add the new password to history - Requirements: 12.8
    await PasswordHistoryService.addPasswordToHistory(user.userId, request.proposedPassword);

    // Invalidate all tokens by performing a global sign out
    // Requirements: 8.7 - Invalidate all tokens when password is changed
    try {
      await CognitoClientService.logout(accessToken);
    } catch (logoutError) {
      // Log but don't fail - password was already changed
      console.warn('Failed to invalidate tokens after password change', {
        userId: user.userId,
        error: (logoutError as Error).message,
      });
    }

    // Log the password change event
    await AuthAuditService.logAuthEvent({
      event: AUTH_EVENT_TYPES.PASSWORD_CHANGED,
      userId: user.userId,
      email: user.email,
      tenantId: user.tenantId,
      ip: clientIp,
      userAgent,
      success: true,
    });

    // Send notification email
    // Requirements: 12.3 - Send email notification on password change
    await sendPasswordChangeNotification(user.email, '', clientIp);

    console.log('Password changed successfully', {
      userId: user.userId,
      email: user.email,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Password changed successfully. Please log in again with your new password.',
        requiresReauth: true,
      }),
    };

  } catch (error) {
    console.error('Password change failed', {
      error: (error as Error).message,
      ip: clientIp,
    });

    // Log failed attempt
    try {
      const validationResult = await validateRequest(event);
      if (isValidationSuccess(validationResult)) {
        const user = validationResult.user;
        await AuthAuditService.logAuthEvent({
          event: AUTH_EVENT_TYPES.PASSWORD_CHANGED,
          userId: user.userId,
          email: user.email,
          tenantId: user.tenantId,
          ip: clientIp,
          userAgent,
          success: false,
          reason: (error as Error).message,
        });
      }
    } catch {
      // Ignore audit logging errors
    }

    if (error instanceof AuthError) {
      return {
        statusCode: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error.toResponse()),
      };
    }

    // Handle Cognito-specific errors
    const errorName = (error as any).name || '';
    if (errorName === 'NotAuthorizedException') {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized',
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Current password is incorrect',
        }),
      };
    }

    if (errorName === 'InvalidPasswordException') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          code: AUTH_ERROR_CODES.WEAK_PASSWORD,
          message: 'New password does not meet requirements',
        }),
      };
    }

    if (errorName === 'LimitExceededException') {
      return {
        statusCode: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
        body: JSON.stringify({
          error: 'Too Many Requests',
          code: AUTH_ERROR_CODES.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Please try again later.',
          retryAfter: 60,
        }),
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        code: AUTH_ERROR_CODES.AUTH_ERROR,
        message: 'Failed to change password',
      }),
    };
  }
}

/**
 * Lambda handler
 */
export const handler = changePassword;

export default handler;
