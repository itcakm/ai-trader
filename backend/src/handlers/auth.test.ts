/**
 * Integration tests for auth endpoints.
 * 
 * Requirements: 13.3
 * - Test signup flow
 * - Test login flow
 * - Test MFA flow
 * - Test password reset flow
 * - Test token refresh flow
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler } from './auth';
import { AUTH_ERROR_CODES } from '../types/auth';

// Mock Cognito client service
jest.mock('../services/cognito-client', () => ({
  CognitoClientService: {
    signUp: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    refreshToken: jest.fn(),
    confirmSignUp: jest.fn(),
    resendConfirmationCode: jest.fn(),
    forgotPassword: jest.fn(),
    confirmForgotPassword: jest.fn(),
    associateSoftwareToken: jest.fn(),
    verifySoftwareToken: jest.fn(),
    respondToMFAChallenge: jest.fn(),
    parseIdToken: jest.fn(),
    changePassword: jest.fn(),
  },
}));

// Mock auth audit service
jest.mock('../services/auth-audit', () => ({
  AuthAuditService: {
    logAuthEvent: jest.fn().mockResolvedValue(undefined),
    logLoginSuccess: jest.fn().mockResolvedValue(undefined),
    logLoginFailed: jest.fn().mockResolvedValue(undefined),
    logTokenRefresh: jest.fn().mockResolvedValue(undefined),
  },
  AUTH_EVENT_TYPES: {
    SIGNUP: 'SIGNUP',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGIN_MFA_REQUIRED: 'LOGIN_MFA_REQUIRED',
    LOGOUT: 'LOGOUT',
    EMAIL_VERIFIED: 'EMAIL_VERIFIED',
    PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
    PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
    MFA_CHALLENGE_SUCCESS: 'MFA_CHALLENGE_SUCCESS',
    MFA_CHALLENGE_FAILED: 'MFA_CHALLENGE_FAILED',
    TOKEN_REFRESHED: 'TOKEN_REFRESHED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  },
}));

// Mock SSO service
jest.mock('../services/sso', () => ({
  SSOService: {
    getProviders: jest.fn().mockResolvedValue([]),
    initiateSSO: jest.fn(),
    handleCallback: jest.fn(),
  },
}));

// Mock JWT validator
jest.mock('../middleware/jwt-validator', () => ({
  validateRequest: jest.fn(),
  isValidationSuccess: jest.fn(),
}));

import { CognitoClientService } from '../services/cognito-client';

const mockCognitoClient = CognitoClientService as jest.Mocked<typeof CognitoClientService>;

describe('Auth Handler Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/signup', () => {
    it('should successfully register a new user', async () => {
      mockCognitoClient.signUp.mockResolvedValue({
        userId: 'user-123',
        userConfirmed: false,
        codeDeliveryDetails: {
          destination: 't***@example.com',
          deliveryMedium: 'EMAIL',
          attributeName: 'email',
        },
      });

      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/signup',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: 'Test User',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.userId).toBe('user-123');
      expect(body.userConfirmed).toBe(false);
    });

    it('should return 400 for missing email', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/signup',
        body: JSON.stringify({
          password: 'SecurePassword123!',
          name: 'Test User',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.code).toBe(AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD);
    });

    it('should return 400 for invalid email format', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/signup',
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'SecurePassword123!',
          name: 'Test User',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.code).toBe(AUTH_ERROR_CODES.INVALID_EMAIL_FORMAT);
    });
  });

  describe('POST /auth/login', () => {
    it('should successfully authenticate a user', async () => {
      mockCognitoClient.login.mockResolvedValue({
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          idToken: 'id-token',
          expiresIn: 3600,
        },
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          tenantId: 'tenant-456',
          roles: ['TRADER'],
          emailVerified: true,
        },
      });

      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/login',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePassword123!',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.accessToken).toBe('access-token');
      expect(body.user.email).toBe('test@example.com');
    });

    it('should return MFA challenge when MFA is required', async () => {
      mockCognitoClient.login.mockResolvedValue({
        challengeType: 'MFA',
        session: 'mfa-session-token',
      });

      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/login',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePassword123!',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.challengeType).toBe('MFA');
      expect(body.session).toBe('mfa-session-token');
    });

    it('should return 400 for missing credentials', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/login',
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.code).toBe(AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD);
    });
  });

  describe('POST /auth/mfa/challenge', () => {
    it('should successfully verify MFA code', async () => {
      mockCognitoClient.respondToMFAChallenge.mockResolvedValue({
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          idToken: 'id-token',
          expiresIn: 3600,
        },
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          tenantId: 'tenant-456',
          roles: ['TRADER'],
          emailVerified: true,
        },
      });

      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/mfa/challenge',
        body: JSON.stringify({
          session: 'mfa-session-token',
          code: '123456',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.accessToken).toBe('access-token');
    });

    it('should return 400 for invalid MFA code format', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/mfa/challenge',
        body: JSON.stringify({
          session: 'mfa-session-token',
          code: 'invalid',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.code).toBe(AUTH_ERROR_CODES.INVALID_MFA_CODE);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should successfully refresh tokens', async () => {
      mockCognitoClient.refreshToken.mockResolvedValue({
        accessToken: 'new-access-token',
        idToken: 'new-id-token',
        expiresIn: 3600,
      });
      mockCognitoClient.parseIdToken.mockReturnValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        tenantId: 'tenant-456',
        roles: ['TRADER'],
        emailVerified: true,
      });

      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/refresh',
        body: JSON.stringify({
          refreshToken: 'valid-refresh-token',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.accessToken).toBe('new-access-token');
    });

    it('should return 400 for missing refresh token', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/refresh',
        body: JSON.stringify({}),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.code).toBe(AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should initiate password reset', async () => {
      mockCognitoClient.forgotPassword.mockResolvedValue(undefined);

      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/forgot-password',
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('password reset');
    });

    it('should return 400 for invalid email', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/forgot-password',
        body: JSON.stringify({
          email: 'invalid-email',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.code).toBe(AUTH_ERROR_CODES.INVALID_EMAIL_FORMAT);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should complete password reset', async () => {
      mockCognitoClient.confirmForgotPassword.mockResolvedValue(undefined);

      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/reset-password',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '123456',
          newPassword: 'NewSecurePassword123!',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Password reset successfully');
    });

    it('should return 400 for missing code', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/reset-password',
        body: JSON.stringify({
          email: 'test@example.com',
          newPassword: 'NewSecurePassword123!',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.code).toBe(AUTH_ERROR_CODES.MISSING_REQUIRED_FIELD);
    });
  });

  describe('OPTIONS requests (CORS)', () => {
    it('should return 200 for OPTIONS preflight', async () => {
      const event = createMockEvent({
        httpMethod: 'OPTIONS',
        path: '/auth/login',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('Route not found', () => {
    it('should return 404 for unknown routes', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/auth/unknown',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.code).toBe('NOT_FOUND');
    });
  });
});

/**
 * Helper function to create mock API Gateway events
 */
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {
      'Content-Type': 'application/json',
    },
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/test',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: overrides.httpMethod || 'GET',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
      path: overrides.path || '/test',
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: overrides.path || '/test',
    },
    resource: overrides.path || '/test',
    ...overrides,
  };
}
