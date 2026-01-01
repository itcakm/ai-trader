import * as fc from 'fast-check';
import {
  AuditAccessControlService,
  roleHasPermission,
  getRolePermissions,
  getRequiredPermission,
  applyMask,
  shouldMaskField,
  DEFAULT_MASKING_CONFIGS
} from './audit-access-control';
import { AccessLogRepository } from '../repositories/access-log';
import {
  AuditRole,
  ROLE_PERMISSIONS,
  AccessLogEntry,
  AccessLogInput,
  MaskingConfig
} from '../types/audit-access';
import {
  auditRoleArb,
  accessLogInputArb,
  sensitiveDataArb,
  crossTenantAccessArb,
  sameTenantAccessArb,
  actionTypeArb,
  resourceTypeArb,
  isoDateStringArb
} from '../test/generators';

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockS3 = {
    putObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve() }),
    getObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Body: Buffer.from('{}') }) }),
    listObjectsV2: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Contents: [], KeyCount: 0 }) }),
    headObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve() }),
    deleteObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve() })
  };
  return {
    S3: jest.fn(() => mockS3)
  };
});

// Mock the repository
jest.mock('../repositories/access-log');

const mockAccessLogRepo = AccessLogRepository as jest.Mocked<typeof AccessLogRepository>;

describe('Audit Access Control Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditAccessControlService.clearAllRoles();
    AuditAccessControlService.clearAllMaskingConfigs();
    
    // Set up default mock implementations
    mockAccessLogRepo.putAccessLog.mockImplementation(async (input) => ({
      logId: 'test-log-id',
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      timestamp: new Date().toISOString(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      success: input.success,
      failureReason: input.failureReason
    }));
  });

  describe('roleHasPermission', () => {
    it('should return true for VIEWER with READ permission', () => {
      expect(roleHasPermission('VIEWER', 'READ')).toBe(true);
    });

    it('should return false for VIEWER with QUERY permission', () => {
      expect(roleHasPermission('VIEWER', 'QUERY')).toBe(false);
    });

    it('should return true for ANALYST with EXPORT permission', () => {
      expect(roleHasPermission('ANALYST', 'EXPORT')).toBe(true);
    });

    it('should return true for ADMIN with DELETE permission', () => {
      expect(roleHasPermission('ADMIN', 'DELETE')).toBe(true);
    });
  });

  describe('getRolePermissions', () => {
    it('should return correct permissions for each role', () => {
      expect(getRolePermissions('VIEWER')).toEqual(['READ']);
      expect(getRolePermissions('ANALYST')).toEqual(['READ', 'QUERY', 'EXPORT']);
      expect(getRolePermissions('ADMIN')).toEqual(['READ', 'QUERY', 'EXPORT', 'CONFIGURE', 'DELETE']);
    });
  });

  describe('getRequiredPermission', () => {
    it('should map VIEW to READ', () => {
      expect(getRequiredPermission('VIEW')).toBe('READ');
    });

    it('should map SEARCH to QUERY', () => {
      expect(getRequiredPermission('SEARCH')).toBe('QUERY');
    });

    it('should map DOWNLOAD to EXPORT', () => {
      expect(getRequiredPermission('DOWNLOAD')).toBe('EXPORT');
    });

    it('should map UPDATE to CONFIGURE', () => {
      expect(getRequiredPermission('UPDATE')).toBe('CONFIGURE');
    });

    it('should default to READ for unknown actions', () => {
      expect(getRequiredPermission('UNKNOWN')).toBe('READ');
    });
  });

  describe('applyMask', () => {
    it('should fully mask with FULL type', () => {
      expect(applyMask('sensitive-data', 'FULL')).toBe('********');
    });

    it('should partially mask with PARTIAL type', () => {
      const result = applyMask('192.168.1.100', 'PARTIAL');
      expect(result).toMatch(/^19.*00$/);
      expect(result).toContain('*');
    });

    it('should hash with HASH type', () => {
      const result = applyMask('api-key-12345', 'HASH');
      expect(typeof result).toBe('string');
      expect((result as string).length).toBe(16);
    });

    it('should handle null and undefined', () => {
      expect(applyMask(null, 'FULL')).toBeNull();
      expect(applyMask(undefined, 'FULL')).toBeUndefined();
    });
  });

  describe('verifyTenantIsolation', () => {
    it('should return true for same tenant', () => {
      expect(AuditAccessControlService.verifyTenantIsolation('tenant-1', 'tenant-1')).toBe(true);
    });

    it('should return false for different tenants', () => {
      expect(AuditAccessControlService.verifyTenantIsolation('tenant-1', 'tenant-2')).toBe(false);
    });
  });

  describe('getUserRole', () => {
    it('should return VIEWER as default role', async () => {
      const role = await AuditAccessControlService.getUserRole('tenant-1', 'user-1');
      expect(role).toBe('VIEWER');
    });

    it('should return set role', async () => {
      await AuditAccessControlService.setUserRole('tenant-1', 'user-1', 'ADMIN');
      const role = await AuditAccessControlService.getUserRole('tenant-1', 'user-1');
      expect(role).toBe('ADMIN');
    });
  });

  describe('verifyAccess', () => {
    it('should allow VIEWER to READ', async () => {
      const result = await AuditAccessControlService.verifyAccess(
        'tenant-1',
        'user-1',
        'TRADE_EVENT',
        'READ'
      );
      expect(result).toBe(true);
    });

    it('should deny VIEWER to EXPORT', async () => {
      const result = await AuditAccessControlService.verifyAccess(
        'tenant-1',
        'user-1',
        'TRADE_EVENT',
        'EXPORT'
      );
      expect(result).toBe(false);
    });

    it('should allow ADMIN to DELETE', async () => {
      await AuditAccessControlService.setUserRole('tenant-1', 'user-1', 'ADMIN');
      const result = await AuditAccessControlService.verifyAccess(
        'tenant-1',
        'user-1',
        'TRADE_EVENT',
        'DELETE'
      );
      expect(result).toBe(true);
    });
  });

  describe('applyMasking', () => {
    it('should not mask data for ADMIN role', () => {
      const data = {
        id: '123',
        ipAddress: '192.168.1.100',
        apiKey: 'secret-key-12345'
      };
      const result = AuditAccessControlService.applyMasking(data, 'ADMIN');
      expect(result).toEqual(data);
    });

    it('should mask ipAddress for VIEWER role', () => {
      const data = {
        id: '123',
        ipAddress: '192.168.1.100',
        publicData: 'visible'
      };
      const result = AuditAccessControlService.applyMasking(data, 'VIEWER');
      expect(result.id).toBe('123');
      expect(result.ipAddress).not.toBe('192.168.1.100');
      expect(result.publicData).toBe('visible');
    });

    it('should mask apiKey for ANALYST role', () => {
      const data = {
        id: '123',
        apiKey: 'secret-api-key-12345'
      };
      const result = AuditAccessControlService.applyMasking(data, 'ANALYST');
      expect(result.id).toBe('123');
      expect(result.apiKey).not.toBe('secret-api-key-12345');
    });
  });
});


/**
 * Property-Based Tests for Access Control
 * Feature: reporting-audit
 */
describe('Access Control Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditAccessControlService.clearAllRoles();
    AuditAccessControlService.clearAllMaskingConfigs();
    
    mockAccessLogRepo.putAccessLog.mockImplementation(async (input) => ({
      logId: 'test-log-id-' + Date.now(),
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      timestamp: new Date().toISOString(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      success: input.success,
      failureReason: input.failureReason
    }));
  });

  /**
   * Property 27: Tenant Isolation
   * 
   * *For any* audit record belonging to tenant A, queries from tenant B SHALL never
   * return that record, regardless of query parameters.
   * 
   * **Validates: Requirements 9.1**
   */
  describe('Property 27: Tenant Isolation', () => {
    it('should always deny cross-tenant access', async () => {
      await fc.assert(
        fc.asyncProperty(
          crossTenantAccessArb(),
          async ({ requestingTenantId, resourceTenantId }) => {
            // Verify tenant isolation check
            const isAllowed = AuditAccessControlService.verifyTenantIsolation(
              requestingTenantId,
              resourceTenantId
            );
            
            // Cross-tenant access should ALWAYS be denied
            expect(isAllowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always allow same-tenant access check', async () => {
      await fc.assert(
        fc.asyncProperty(
          sameTenantAccessArb(),
          async ({ tenantId }) => {
            // Verify tenant isolation check for same tenant
            const isAllowed = AuditAccessControlService.verifyTenantIsolation(
              tenantId,
              tenantId
            );
            
            // Same-tenant access should ALWAYS pass isolation check
            expect(isAllowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain tenant isolation regardless of user role', async () => {
      await fc.assert(
        fc.asyncProperty(
          crossTenantAccessArb(),
          auditRoleArb(),
          async ({ requestingTenantId, resourceTenantId, userId }, role) => {
            // Set user as ADMIN (highest privilege)
            await AuditAccessControlService.setUserRole(requestingTenantId, userId, role);
            
            // Even with highest privileges, cross-tenant access should be denied
            const isAllowed = AuditAccessControlService.verifyTenantIsolation(
              requestingTenantId,
              resourceTenantId
            );
            
            expect(isAllowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 28: Role-Based Access Control
   * 
   * *For any* user with a specific role (VIEWER, ANALYST, ADMIN), the user SHALL only
   * be able to perform actions permitted by that role, and all other actions SHALL be denied.
   * 
   * **Validates: Requirements 9.2, 9.3**
   */
  describe('Property 28: Role-Based Access Control', () => {
    it('should enforce role permissions correctly for all roles and actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.uuid(), // userId
          auditRoleArb(),
          actionTypeArb(),
          resourceTypeArb(),
          async (tenantId, userId, role, action, resourceType) => {
            // Set user role
            await AuditAccessControlService.setUserRole(tenantId, userId, role);
            
            // Get required permission for the action
            const requiredPermission = getRequiredPermission(action);
            
            // Check if role has the permission
            const rolePermissions = ROLE_PERMISSIONS[role];
            const shouldHaveAccess = rolePermissions.includes(requiredPermission);
            
            // Verify access
            const hasAccess = await AuditAccessControlService.verifyAccess(
              tenantId,
              userId,
              resourceType,
              action
            );
            
            // Access should match role permissions
            expect(hasAccess).toBe(shouldHaveAccess);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure VIEWER can only READ', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.uuid(), // userId
          actionTypeArb(),
          resourceTypeArb(),
          async (tenantId, userId, action, resourceType) => {
            // Set user as VIEWER
            await AuditAccessControlService.setUserRole(tenantId, userId, 'VIEWER');
            
            const requiredPermission = getRequiredPermission(action);
            const hasAccess = await AuditAccessControlService.verifyAccess(
              tenantId,
              userId,
              resourceType,
              action
            );
            
            // VIEWER should only have access if permission is READ
            if (requiredPermission === 'READ') {
              expect(hasAccess).toBe(true);
            } else {
              expect(hasAccess).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure ADMIN has all permissions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.uuid(), // userId
          actionTypeArb(),
          resourceTypeArb(),
          async (tenantId, userId, action, resourceType) => {
            // Set user as ADMIN
            await AuditAccessControlService.setUserRole(tenantId, userId, 'ADMIN');
            
            const hasAccess = await AuditAccessControlService.verifyAccess(
              tenantId,
              userId,
              resourceType,
              action
            );
            
            // ADMIN should have access to all actions
            expect(hasAccess).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure role hierarchy is respected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.uuid(), // userId
          actionTypeArb(),
          async (tenantId, userId, action) => {
            const requiredPermission = getRequiredPermission(action);
            
            // Check access for each role
            const results: Record<AuditRole, boolean> = {
              VIEWER: false,
              ANALYST: false,
              ADMIN: false
            };
            
            for (const role of ['VIEWER', 'ANALYST', 'ADMIN'] as AuditRole[]) {
              await AuditAccessControlService.setUserRole(tenantId, userId, role);
              results[role] = await AuditAccessControlService.verifyAccess(
                tenantId,
                userId,
                'TRADE_EVENT',
                action
              );
            }
            
            // If VIEWER has access, ANALYST and ADMIN should too
            if (results.VIEWER) {
              expect(results.ANALYST).toBe(true);
              expect(results.ADMIN).toBe(true);
            }
            
            // If ANALYST has access, ADMIN should too
            if (results.ANALYST) {
              expect(results.ADMIN).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 29: Access Logging Completeness
   * 
   * *For any* access to sensitive audit data, the system SHALL create an access log
   * entry containing: user ID, timestamp, resource accessed, and action performed.
   * 
   * **Validates: Requirements 9.4**
   */
  describe('Property 29: Access Logging Completeness', () => {
    it('should log all access attempts with required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.uuid(), // userId
          actionTypeArb(),
          resourceTypeArb(),
          auditRoleArb(),
          async (tenantId, userId, action, resourceType, role) => {
            // Set user role
            await AuditAccessControlService.setUserRole(tenantId, userId, role);
            
            // Perform access verification (which logs the attempt)
            await AuditAccessControlService.verifyAccess(
              tenantId,
              userId,
              resourceType,
              action
            );
            
            // Verify that putAccessLog was called
            expect(mockAccessLogRepo.putAccessLog).toHaveBeenCalled();
            
            // Get the logged entry
            const loggedInput = mockAccessLogRepo.putAccessLog.mock.calls[
              mockAccessLogRepo.putAccessLog.mock.calls.length - 1
            ][0] as AccessLogInput;
            
            // Verify required fields are present
            expect(loggedInput.tenantId).toBe(tenantId);
            expect(loggedInput.userId).toBe(userId);
            expect(loggedInput.action).toBe(action);
            expect(loggedInput.resourceType).toBe(resourceType);
            expect(typeof loggedInput.success).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should log failure reason when access is denied', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.uuid(), // userId
          resourceTypeArb(),
          async (tenantId, userId, resourceType) => {
            // Set user as VIEWER (limited permissions)
            await AuditAccessControlService.setUserRole(tenantId, userId, 'VIEWER');
            
            // Try to DELETE (which VIEWER cannot do)
            await AuditAccessControlService.verifyAccess(
              tenantId,
              userId,
              resourceType,
              'DELETE'
            );
            
            // Get the logged entry
            const loggedInput = mockAccessLogRepo.putAccessLog.mock.calls[
              mockAccessLogRepo.putAccessLog.mock.calls.length - 1
            ][0] as AccessLogInput;
            
            // Verify failure is logged with reason
            expect(loggedInput.success).toBe(false);
            expect(loggedInput.failureReason).toBeDefined();
            expect(loggedInput.failureReason).toContain('Insufficient permissions');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should log successful access without failure reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.uuid(), // userId
          resourceTypeArb(),
          async (tenantId, userId, resourceType) => {
            // Set user as ADMIN (full permissions)
            await AuditAccessControlService.setUserRole(tenantId, userId, 'ADMIN');
            
            // Perform any action
            await AuditAccessControlService.verifyAccess(
              tenantId,
              userId,
              resourceType,
              'DELETE'
            );
            
            // Get the logged entry
            const loggedInput = mockAccessLogRepo.putAccessLog.mock.calls[
              mockAccessLogRepo.putAccessLog.mock.calls.length - 1
            ][0] as AccessLogInput;
            
            // Verify success is logged without failure reason
            expect(loggedInput.success).toBe(true);
            expect(loggedInput.failureReason).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 30: Data Masking by Role
   * 
   * *For any* audit record containing sensitive fields accessed by a lower-privilege
   * role, the sensitive fields SHALL be masked according to the masking configuration.
   * 
   * **Validates: Requirements 9.5**
   */
  describe('Property 30: Data Masking by Role', () => {
    it('should never mask data for ADMIN role', async () => {
      await fc.assert(
        fc.asyncProperty(
          sensitiveDataArb(),
          async (data) => {
            const maskedData = AuditAccessControlService.applyMasking(data, 'ADMIN');
            
            // ADMIN should see all data unmasked
            expect(maskedData).toEqual(data);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mask sensitive fields for VIEWER role', async () => {
      await fc.assert(
        fc.asyncProperty(
          sensitiveDataArb(),
          async (data) => {
            const maskedData = AuditAccessControlService.applyMasking(data, 'VIEWER');
            
            // Check that sensitive fields are masked
            // ipAddress should be partially masked for VIEWER
            if (data.ipAddress) {
              expect(maskedData.ipAddress).not.toBe(data.ipAddress);
            }
            
            // userAgent should be fully masked for VIEWER
            if (data.userAgent) {
              expect(maskedData.userAgent).toBe('********');
            }
            
            // apiKey should be hashed for VIEWER
            if (data.apiKey) {
              expect(maskedData.apiKey).not.toBe(data.apiKey);
              expect((maskedData.apiKey as string).length).toBe(16); // Hash length
            }
            
            // Non-sensitive fields should remain unchanged
            expect(maskedData.id).toBe(data.id);
            expect(maskedData.name).toBe(data.name);
            expect(maskedData.publicData).toBe(data.publicData);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mask apiKey for ANALYST role but not ipAddress', async () => {
      await fc.assert(
        fc.asyncProperty(
          sensitiveDataArb(),
          async (data) => {
            const maskedData = AuditAccessControlService.applyMasking(data, 'ANALYST');
            
            // apiKey should be hashed for ANALYST
            if (data.apiKey) {
              expect(maskedData.apiKey).not.toBe(data.apiKey);
            }
            
            // ipAddress should NOT be masked for ANALYST (only for VIEWER)
            expect(maskedData.ipAddress).toBe(data.ipAddress);
            
            // Non-sensitive fields should remain unchanged
            expect(maskedData.id).toBe(data.id);
            expect(maskedData.name).toBe(data.name);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply masking consistently for the same data and role', async () => {
      await fc.assert(
        fc.asyncProperty(
          sensitiveDataArb(),
          auditRoleArb(),
          async (data, role) => {
            // Apply masking twice
            const maskedData1 = AuditAccessControlService.applyMasking(data, role);
            const maskedData2 = AuditAccessControlService.applyMasking(data, role);
            
            // Results should be identical (deterministic masking)
            expect(maskedData1).toEqual(maskedData2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle nested objects in masking', async () => {
      await fc.assert(
        fc.asyncProperty(
          sensitiveDataArb(),
          async (data) => {
            const maskedData = AuditAccessControlService.applyMasking(data, 'VIEWER');
            
            // Nested credentials.password should be masked
            if (data.credentials && (data.credentials as any).password) {
              expect((maskedData.credentials as any).password).toBe('********');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve data structure after masking', async () => {
      await fc.assert(
        fc.asyncProperty(
          sensitiveDataArb(),
          auditRoleArb(),
          async (data, role) => {
            const maskedData = AuditAccessControlService.applyMasking(data, role);
            
            // All keys should be preserved
            expect(Object.keys(maskedData).sort()).toEqual(Object.keys(data).sort());
            
            // Nested structure should be preserved
            if (data.credentials) {
              expect(maskedData.credentials).toBeDefined();
              expect(Object.keys(maskedData.credentials as object).sort())
                .toEqual(Object.keys(data.credentials as object).sort());
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
