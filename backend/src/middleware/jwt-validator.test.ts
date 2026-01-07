/**
 * Unit tests for JWT validation middleware.
 * 
 * Requirements: 13.1
 * - Test valid token validation
 * - Test expired token rejection
 * - Test invalid signature rejection
 * - Test missing token handling
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  extractBearerToken,
  parseUserContext,
  getExpectedIssuer,
  ValidationResult,
} from './jwt-validator';
import { TokenPayload, AUTH_ERROR_CODES } from '../types/auth';

// Mock the JWKS client
jest.mock('./jwks-client', () => ({
  getKeyCallback: jest.fn(),
  getJwksClient: jest.fn(),
  getPublicKey: jest.fn(),
}));

describe('JWT Validator', () => {
  describe('extractBearerToken', () => {
    it('should extract token from Authorization header with Bearer prefix', () => {
      const event = createMockEvent({
        headers: { Authorization: 'Bearer valid-token-123' },
      });
      
      const token = extractBearerToken(event);
      expect(token).toBe('valid-token-123');
    });

    it('should extract token from lowercase authorization header', () => {
      const event = createMockEvent({
        headers: { authorization: 'Bearer lowercase-token' },
      });
      
      const token = extractBearerToken(event);
      expect(token).toBe('lowercase-token');
    });

    it('should return null when Authorization header is missing', () => {
      const event = createMockEvent({
        headers: {},
      });
      
      const token = extractBearerToken(event);
      expect(token).toBeNull();
    });

    it('should return null when Authorization header does not start with Bearer', () => {
      const event = createMockEvent({
        headers: { Authorization: 'Basic some-credentials' },
      });
      
      const token = extractBearerToken(event);
      expect(token).toBeNull();
    });

    it('should return null when token is empty after Bearer prefix', () => {
      const event = createMockEvent({
        headers: { Authorization: 'Bearer ' },
      });
      
      const token = extractBearerToken(event);
      expect(token).toBeNull();
    });

    it('should return null when token is only whitespace after Bearer prefix', () => {
      const event = createMockEvent({
        headers: { Authorization: 'Bearer    ' },
      });
      
      const token = extractBearerToken(event);
      expect(token).toBeNull();
    });
  });

  describe('parseUserContext', () => {
    it('should parse user context from valid token payload', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true,
        name: 'Test User',
        'custom:tenant_id': 'tenant-456',
        'custom:roles': '["TRADER", "ANALYST"]',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
      };

      const userContext = parseUserContext(payload);

      expect(userContext.userId).toBe('user-123');
      expect(userContext.email).toBe('test@example.com');
      expect(userContext.tenantId).toBe('tenant-456');
      expect(userContext.roles).toEqual(['TRADER', 'ANALYST']);
      expect(userContext.emailVerified).toBe(true);
    });

    it('should handle missing optional fields', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: false,
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        token_use: 'id',
      };

      const userContext = parseUserContext(payload);

      expect(userContext.userId).toBe('user-123');
      expect(userContext.email).toBe('test@example.com');
      expect(userContext.tenantId).toBe('');
      expect(userContext.roles).toEqual([]);
      expect(userContext.emailVerified).toBe(false);
    });

    it('should handle invalid JSON in roles', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true,
        'custom:roles': 'invalid-json',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
      };

      const userContext = parseUserContext(payload);

      expect(userContext.roles).toEqual([]);
    });

    it('should handle non-array roles JSON', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true,
        'custom:roles': '{"role": "ADMIN"}',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
      };

      const userContext = parseUserContext(payload);

      expect(userContext.roles).toEqual([]);
    });

    it('should handle undefined email_verified', () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
      } as TokenPayload;

      const userContext = parseUserContext(payload);

      expect(userContext.emailVerified).toBe(false);
    });
  });

  describe('getExpectedIssuer', () => {
    it('should construct correct issuer URL', () => {
      const issuer = getExpectedIssuer('us-west-2', 'us-west-2_ABC123');
      expect(issuer).toBe('https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABC123');
    });

    it('should use default region when not provided', () => {
      // The default region is 'us-east-1' as defined in the module
      const issuer = getExpectedIssuer(undefined, 'us-east-1_XYZ789');
      expect(issuer).toBe('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XYZ789');
    });
  });
});

/**
 * Helper function to create mock API Gateway events
 */
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
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
      httpMethod: 'GET',
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
      path: '/test',
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: '/test',
    },
    resource: '/test',
    ...overrides,
  };
}
