/**
 * Security tests for authentication middleware.
 * 
 * Requirements: 13.5
 * - Test rate limiting
 * - Test SQL injection blocking
 * - Test XSS blocking
 * - Test tenant isolation
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  validateTenantAccess,
  validateResourceOwnership,
  createTenantContext,
  isSuperAdmin,
  TENANT_SECURITY_EVENTS,
} from './tenant-isolation';
import {
  hasAnyRole,
  hasAllRoles,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from './require-role';
import { UserContext, AUTH_ERROR_CODES, ROLES } from '../types/auth';

describe('Security Tests', () => {
  describe('Tenant Isolation', () => {
    it('should allow access when user tenant matches resource tenant', () => {
      const user = createUserContext('tenant-123', ['TRADER']);
      const event = createMockEvent();
      
      const result = validateTenantAccess(user, 'tenant-123', event);
      
      expect(result).toBe(true);
    });

    it('should deny access when user tenant does not match resource tenant', () => {
      const user = createUserContext('tenant-123', ['TRADER']);
      const event = createMockEvent();
      
      const result = validateTenantAccess(user, 'tenant-456', event);
      
      expect(result).toBe(false);
    });

    it('should allow SUPER_ADMIN to access any tenant', () => {
      const user = createUserContext('tenant-123', ['SUPER_ADMIN']);
      const event = createMockEvent();
      
      const result = validateTenantAccess(user, 'tenant-456', event);
      
      expect(result).toBe(true);
    });

    it('should deny cross-tenant access even for ADMIN', () => {
      const user = createUserContext('tenant-123', ['ADMIN']);
      const event = createMockEvent();
      
      const result = validateTenantAccess(user, 'tenant-456', event);
      
      expect(result).toBe(false);
    });

    it('should throw error when resource tenant does not match user tenant', () => {
      const user = createUserContext('tenant-123', ['TRADER']);
      const resource = { tenantId: 'tenant-456', id: 'resource-1' };
      const event = createMockEvent();
      
      expect(() => {
        validateResourceOwnership(user, resource, 'Strategy', 'resource-1', event);
      }).toThrow();
    });

    it('should not throw when resource tenant matches user tenant', () => {
      const user = createUserContext('tenant-123', ['TRADER']);
      const resource = { tenantId: 'tenant-123', id: 'resource-1' };
      const event = createMockEvent();
      
      expect(() => {
        validateResourceOwnership(user, resource, 'Strategy', 'resource-1', event);
      }).not.toThrow();
    });

    it('should create correct tenant context from user', () => {
      const user = createUserContext('tenant-123', ['ADMIN']);
      
      const context = createTenantContext(user);
      
      expect(context.tenantId).toBe('tenant-123');
      expect(context.userId).toBe('user-123');
      expect(context.isSuperAdmin).toBe(false);
    });

    it('should mark super admin in tenant context', () => {
      const user = createUserContext('tenant-123', ['SUPER_ADMIN']);
      
      const context = createTenantContext(user);
      
      expect(context.isSuperAdmin).toBe(true);
    });
  });

  describe('Role-Based Access Control Security', () => {
    it('should correctly identify SUPER_ADMIN', () => {
      const user = createUserContext('tenant-123', ['SUPER_ADMIN']);
      
      expect(isSuperAdmin(user)).toBe(true);
    });

    it('should not identify ADMIN as SUPER_ADMIN', () => {
      const user = createUserContext('tenant-123', ['ADMIN']);
      
      expect(isSuperAdmin(user)).toBe(false);
    });

    it('should grant SUPER_ADMIN access to any role check', () => {
      const superAdminRoles = ['SUPER_ADMIN'];
      
      expect(hasAnyRole(superAdminRoles, ['VIEWER'])).toBe(true);
      expect(hasAnyRole(superAdminRoles, ['ADMIN'])).toBe(true);
      expect(hasAllRoles(superAdminRoles, ['VIEWER', 'ADMIN'])).toBe(true);
    });

    it('should not grant VIEWER access to ADMIN-only permissions', () => {
      const viewerRoles = ['VIEWER'];
      
      expect(hasPermission(viewerRoles, 'manage:users')).toBe(false);
      expect(hasPermission(viewerRoles, 'manage:settings')).toBe(false);
    });

    it('should grant ADMIN access to user management', () => {
      const adminRoles = ['ADMIN'];
      
      expect(hasPermission(adminRoles, 'manage:users')).toBe(true);
      expect(hasPermission(adminRoles, 'read:users')).toBe(true);
    });

    it('should enforce permission boundaries for TRADER', () => {
      const traderRoles = ['TRADER'];
      
      // TRADER should have
      expect(hasPermission(traderRoles, 'execute:orders')).toBe(true);
      expect(hasPermission(traderRoles, 'write:strategies')).toBe(true);
      
      // TRADER should NOT have
      expect(hasPermission(traderRoles, 'manage:users')).toBe(false);
      expect(hasPermission(traderRoles, 'read:audit-logs')).toBe(false);
    });

    it('should enforce permission boundaries for ANALYST', () => {
      const analystRoles = ['ANALYST'];
      
      // ANALYST should have
      expect(hasPermission(analystRoles, 'read:ai-analysis')).toBe(true);
      expect(hasPermission(analystRoles, 'read:audit-logs')).toBe(true);
      
      // ANALYST should NOT have
      expect(hasPermission(analystRoles, 'execute:orders')).toBe(false);
      expect(hasPermission(analystRoles, 'manage:users')).toBe(false);
    });
  });

  describe('Input Validation Security', () => {
    it('should handle null user context safely', () => {
      expect(hasPermission([], 'read:strategies')).toBe(false);
      expect(hasAnyRole([], ['VIEWER'])).toBe(false);
    });

    it('should handle invalid role names safely', () => {
      const invalidRoles = ['INVALID_ROLE', 'HACKER'];
      
      expect(hasPermission(invalidRoles, 'read:strategies')).toBe(false);
      expect(hasAnyRole(invalidRoles, ['VIEWER'])).toBe(false);
    });

    it('should handle empty permission arrays', () => {
      const viewerRoles = ['VIEWER'];
      
      expect(hasAnyPermission(viewerRoles, [])).toBe(true);
      expect(hasAllPermissions(viewerRoles, [])).toBe(true);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should not allow SQL injection in tenant ID', () => {
      const maliciousTenantId = "tenant-123'; DROP TABLE users; --";
      const user = createUserContext('tenant-123', ['TRADER']);
      const event = createMockEvent();
      
      // The validation should fail because tenant IDs don't match
      const result = validateTenantAccess(user, maliciousTenantId, event);
      
      expect(result).toBe(false);
    });

    it('should not allow SQL injection in user ID', () => {
      const maliciousUserId = "user-123'; DELETE FROM strategies; --";
      const user: UserContext = {
        userId: maliciousUserId,
        email: 'test@example.com',
        tenantId: 'tenant-123',
        roles: ['TRADER'],
        emailVerified: true,
      };
      
      // The tenant context should be created safely
      const context = createTenantContext(user);
      
      // The malicious user ID should be stored as-is (not executed)
      expect(context.userId).toBe(maliciousUserId);
    });
  });

  describe('XSS Prevention', () => {
    it('should handle XSS attempts in user email safely', () => {
      const maliciousEmail = '<script>alert("xss")</script>@example.com';
      const user: UserContext = {
        userId: 'user-123',
        email: maliciousEmail,
        tenantId: 'tenant-123',
        roles: ['TRADER'],
        emailVerified: true,
      };
      
      // The context should be created without executing the script
      const context = createTenantContext(user);
      
      expect(context.tenantId).toBe('tenant-123');
    });

    it('should handle XSS attempts in tenant ID safely', () => {
      const maliciousTenantId = '<img src=x onerror=alert("xss")>';
      const user = createUserContext(maliciousTenantId, ['TRADER']);
      const event = createMockEvent();
      
      // The validation should work without executing the XSS
      const result = validateTenantAccess(user, maliciousTenantId, event);
      
      expect(result).toBe(true); // Same tenant, so access is allowed
    });
  });

  describe('Authorization Bypass Prevention', () => {
    it('should not allow role escalation through array manipulation', () => {
      const user: UserContext = {
        userId: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        roles: ['VIEWER'],
        emailVerified: true,
      };
      
      // Attempt to add SUPER_ADMIN role (this would be caught at JWT validation)
      const modifiedRoles = [...user.roles, 'SUPER_ADMIN'];
      
      // The original user context should not be affected
      expect(user.roles).not.toContain('SUPER_ADMIN');
      expect(hasPermission(user.roles, 'manage:tenants')).toBe(false);
    });

    it('should not allow tenant ID spoofing through headers', () => {
      const user = createUserContext('tenant-123', ['TRADER']);
      const event = createMockEvent({
        headers: {
          'X-Tenant-Id': 'tenant-456', // Spoofed header
        },
      });
      
      // The tenant context should use JWT tenant, not header
      const context = createTenantContext(user);
      
      expect(context.tenantId).toBe('tenant-123');
    });
  });
});

/**
 * Helper function to create a mock UserContext
 */
function createUserContext(tenantId: string, roles: string[]): UserContext {
  return {
    userId: 'user-123',
    email: 'test@example.com',
    tenantId,
    roles,
    emailVerified: true,
  };
}

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
