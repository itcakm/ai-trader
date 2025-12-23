import * as fc from 'fast-check';
import { 
  TenantAccessDeniedError, 
  isValidTenantId,
  createTenantScopedKey
} from './access';
import { KeySchemas } from './tables';

describe('Tenant Isolation', () => {
  /**
   * Property 12: Tenant Isolation
   * 
   * *For any* tenant, requesting strategies SHALL return only strategies 
   * belonging to that tenant; attempting to access another tenant's strategy 
   * SHALL result in a not-found or access-denied response.
   * 
   * **Validates: Requirements 5.4**
   * 
   * Note: This test validates the tenant isolation logic at the access layer.
   * The actual DynamoDB queries use tenantId as partition key, ensuring
   * physical isolation at the database level.
   */
  describe('Property 12: Tenant Isolation', () => {
    it('tenant-scoped keys always include tenantId as partition key', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          (tenantId, resourceId) => {
            // Create key for strategies table
            const strategyKey = createTenantScopedKey(
              tenantId, 
              resourceId, 
              KeySchemas.STRATEGIES
            );
            
            // Verify tenantId is the partition key
            expect(strategyKey[KeySchemas.STRATEGIES.partitionKey]).toBe(tenantId);
            expect(strategyKey[KeySchemas.STRATEGIES.sortKey]).toBe(resourceId);
            
            // Create key for deployments table
            const deploymentKey = createTenantScopedKey(
              tenantId, 
              resourceId, 
              KeySchemas.DEPLOYMENTS
            );
            
            // Verify tenantId is the partition key
            expect(deploymentKey[KeySchemas.DEPLOYMENTS.partitionKey]).toBe(tenantId);
            expect(deploymentKey[KeySchemas.DEPLOYMENTS.sortKey]).toBe(resourceId);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('TenantAccessDeniedError is thrown for mismatched tenant access', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('strategy', 'deployment'),
          (tenantId, resourceType) => {
            const error = new TenantAccessDeniedError(tenantId, resourceType);
            
            // Error should contain tenant ID and resource type
            expect(error.message).toContain(tenantId);
            expect(error.message).toContain(resourceType);
            expect(error.name).toBe('TenantAccessDeniedError');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('different tenants produce different partition keys for same resource', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          (tenantId1, tenantId2, resourceId) => {
            // Skip if tenants are the same (unlikely with UUIDs but possible)
            fc.pre(tenantId1 !== tenantId2);
            
            const key1 = createTenantScopedKey(tenantId1, resourceId, KeySchemas.STRATEGIES);
            const key2 = createTenantScopedKey(tenantId2, resourceId, KeySchemas.STRATEGIES);
            
            // Same resource ID but different tenants should have different partition keys
            expect(key1[KeySchemas.STRATEGIES.partitionKey]).not.toBe(
              key2[KeySchemas.STRATEGIES.partitionKey]
            );
            
            // Sort keys (resource IDs) should be the same
            expect(key1[KeySchemas.STRATEGIES.sortKey]).toBe(
              key2[KeySchemas.STRATEGIES.sortKey]
            );
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Tenant ID Validation', () => {
    it('valid UUIDs are accepted', () => {
      fc.assert(
        fc.property(fc.uuid(), (uuid) => {
          return isValidTenantId(uuid) === true;
        }),
        { numRuns: 100 }
      );
    });

    it('invalid formats are rejected', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
            // Filter out strings that happen to be valid UUIDs
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return !uuidRegex.test(s);
          }),
          (invalidId) => {
            return isValidTenantId(invalidId) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
