import * as fc from 'fast-check';
import { 
  AuditService, 
  validateAuditRecordCompleteness,
  CreateAuditRecordInput,
  TenantAccessDeniedError,
  AuditRecordNotFoundError
} from './audit';
import { AuditRepository } from '../repositories/audit';
import { AuditRecord, AuditRequest, AuditResponse, TokenUsage } from '../types/audit';

// Mock the repository
jest.mock('../repositories/audit');

const mockAuditRepo = AuditRepository as jest.Mocked<typeof AuditRepository>;

/**
 * Generators for audit-related types
 */

/**
 * Generator for TokenUsage
 */
const tokenUsageArb = (): fc.Arbitrary<TokenUsage> =>
  fc.record({
    promptTokens: fc.integer({ min: 0, max: 100000 }),
    completionTokens: fc.integer({ min: 0, max: 100000 }),
    totalTokens: fc.integer({ min: 0, max: 200000 })
  });

/**
 * Generator for AuditRequest
 */
const auditRequestArb = (): fc.Arbitrary<AuditRequest> =>
  fc.record({
    promptTemplateId: fc.uuid(),
    promptVersion: fc.integer({ min: 1, max: 1000 }),
    renderedPrompt: fc.string({ minLength: 10, maxLength: 1000 }),
    marketDataHash: fc.hexaString({ minLength: 64, maxLength: 64 })
  });

/**
 * Generator for AuditResponse
 */
const auditResponseArb = (): fc.Arbitrary<AuditResponse> =>
  fc.record({
    rawOutput: fc.string({ minLength: 10, maxLength: 5000 }),
    validatedOutput: fc.oneof(
      fc.constant(null),
      fc.record({
        regime: fc.constantFrom('TRENDING_UP', 'TRENDING_DOWN', 'RANGING'),
        confidence: fc.double({ min: 0, max: 1, noNaN: true })
      })
    ),
    validationPassed: fc.boolean(),
    processingTimeMs: fc.integer({ min: 0, max: 60000 }),
    tokenUsage: tokenUsageArb(),
    costUsd: fc.double({ min: 0, max: 100, noNaN: true })
  });

/**
 * Generator for CreateAuditRecordInput
 */
const createAuditRecordInputArb = (): fc.Arbitrary<CreateAuditRecordInput> =>
  fc.record({
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    analysisType: fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION', 'PARAMETER_SUGGESTION'),
    request: auditRequestArb(),
    response: auditResponseArb(),
    retentionDays: fc.option(fc.integer({ min: 1, max: 365 }), { nil: undefined })
  });

/**
 * Generator for ISO date strings
 */
const isoDateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Generator for complete AuditRecord
 */
const auditRecordArb = (): fc.Arbitrary<AuditRecord> =>
  fc.record({
    auditId: fc.uuid(),
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    analysisType: fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION', 'PARAMETER_SUGGESTION'),
    request: auditRequestArb(),
    response: auditResponseArb(),
    timestamp: isoDateStringArb(),
    retentionExpiresAt: isoDateStringArb()
  });

describe('AuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditService.resetConfig();
  });

  /**
   * Property 20: Audit Record Completeness
   * 
   * For any AI_Analysis, the AuditRecord SHALL contain: promptTemplateId, promptVersion,
   * renderedPrompt, rawOutput, validatedOutput, validationPassed, processingTimeMs,
   * tokenUsage, and costUsd.
   * 
   * **Feature: ai-assisted-intelligence, Property 20: Audit Record Completeness**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   */
  describe('Property 20: Audit Record Completeness', () => {
    it('should create audit records with all required fields', async () => {
      await fc.assert(
        fc.property(
          createAuditRecordInputArb(),
          (input) => {
            const record = AuditService.createAuditRecord(input);
            
            // Verify all top-level required fields are present
            expect(record.auditId).toBeDefined();
            expect(typeof record.auditId).toBe('string');
            expect(record.auditId.length).toBeGreaterThan(0);
            
            expect(record.tenantId).toBe(input.tenantId);
            expect(record.modelConfigId).toBe(input.modelConfigId);
            expect(record.analysisType).toBe(input.analysisType);
            expect(record.timestamp).toBeDefined();
            expect(record.retentionExpiresAt).toBeDefined();
            
            // Verify request fields (Requirements: 10.1)
            expect(record.request).toBeDefined();
            expect(record.request.promptTemplateId).toBe(input.request.promptTemplateId);
            expect(record.request.promptVersion).toBe(input.request.promptVersion);
            expect(record.request.renderedPrompt).toBe(input.request.renderedPrompt);
            expect(record.request.marketDataHash).toBe(input.request.marketDataHash);
            
            // Verify response fields (Requirements: 10.2)
            expect(record.response).toBeDefined();
            expect(record.response.rawOutput).toBe(input.response.rawOutput);
            expect(record.response.validationPassed).toBe(input.response.validationPassed);
            expect(record.response.processingTimeMs).toBe(input.response.processingTimeMs);
            expect(record.response.costUsd).toBeDefined();
            expect(typeof record.response.costUsd).toBe('number');
            
            // Verify token usage (Requirements: 10.3)
            expect(record.response.tokenUsage).toBeDefined();
            expect(typeof record.response.tokenUsage.promptTokens).toBe('number');
            expect(typeof record.response.tokenUsage.completionTokens).toBe('number');
            expect(typeof record.response.tokenUsage.totalTokens).toBe('number');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should pass completeness validation for all created records', async () => {
      await fc.assert(
        fc.property(
          createAuditRecordInputArb(),
          (input) => {
            const record = AuditService.createAuditRecord(input);
            const validation = validateAuditRecordCompleteness(record);
            
            expect(validation.valid).toBe(true);
            expect(validation.missingFields).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect missing fields in incomplete records', async () => {
      await fc.assert(
        fc.property(
          auditRecordArb(),
          fc.constantFrom(
            'auditId', 'tenantId', 'modelConfigId', 'analysisType', 
            'timestamp', 'retentionExpiresAt', 'request', 'response'
          ),
          (record, fieldToRemove) => {
            // Create a copy with the field removed
            const incompleteRecord = { ...record } as any;
            delete incompleteRecord[fieldToRemove];
            
            const validation = validateAuditRecordCompleteness(incompleteRecord);
            
            expect(validation.valid).toBe(false);
            expect(validation.missingFields).toContain(fieldToRemove);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect missing nested request fields', async () => {
      await fc.assert(
        fc.property(
          auditRecordArb(),
          fc.constantFrom('promptTemplateId', 'promptVersion', 'renderedPrompt', 'marketDataHash'),
          (record, fieldToRemove) => {
            // Create a copy with the nested field removed
            const incompleteRecord = {
              ...record,
              request: { ...record.request } as any
            };
            delete incompleteRecord.request[fieldToRemove];
            
            const validation = validateAuditRecordCompleteness(incompleteRecord);
            
            expect(validation.valid).toBe(false);
            expect(validation.missingFields).toContain(`request.${fieldToRemove}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect missing nested response fields', async () => {
      await fc.assert(
        fc.property(
          auditRecordArb(),
          fc.constantFrom('rawOutput', 'validationPassed', 'processingTimeMs', 'costUsd', 'tokenUsage'),
          (record, fieldToRemove) => {
            // Create a copy with the nested field removed
            const incompleteRecord = {
              ...record,
              response: { ...record.response } as any
            };
            delete incompleteRecord.response[fieldToRemove];
            
            const validation = validateAuditRecordCompleteness(incompleteRecord);
            
            expect(validation.valid).toBe(false);
            expect(validation.missingFields).toContain(`response.${fieldToRemove}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect missing token usage fields', async () => {
      await fc.assert(
        fc.property(
          auditRecordArb(),
          fc.constantFrom('promptTokens', 'completionTokens', 'totalTokens'),
          (record, fieldToRemove) => {
            // Create a copy with the token usage field removed
            const incompleteRecord = {
              ...record,
              response: {
                ...record.response,
                tokenUsage: { ...record.response.tokenUsage } as any
              }
            };
            delete incompleteRecord.response.tokenUsage[fieldToRemove];
            
            const validation = validateAuditRecordCompleteness(incompleteRecord);
            
            expect(validation.valid).toBe(false);
            expect(validation.missingFields).toContain(`response.tokenUsage.${fieldToRemove}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure retention expiration is set correctly', async () => {
      await fc.assert(
        fc.property(
          createAuditRecordInputArb(),
          (input) => {
            const record = AuditService.createAuditRecord(input);
            
            const timestamp = new Date(record.timestamp);
            const expiresAt = new Date(record.retentionExpiresAt);
            
            // Expiration should be after timestamp
            expect(expiresAt.getTime()).toBeGreaterThan(timestamp.getTime());
            
            // Calculate expected retention days
            const expectedDays = input.retentionDays ?? 90;
            const actualDays = (expiresAt.getTime() - timestamp.getTime()) / (24 * 60 * 60 * 1000);
            
            // Allow small tolerance for timing
            expect(actualDays).toBeCloseTo(expectedDays, 0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle default values for optional fields', async () => {
      await fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION'),
          auditRequestArb(),
          fc.string({ minLength: 10, maxLength: 1000 }),
          fc.boolean(),
          fc.integer({ min: 0, max: 60000 }),
          (tenantId, modelConfigId, analysisType, request, rawOutput, validationPassed, processingTimeMs) => {
            // Create input with minimal response (no tokenUsage or costUsd)
            const input: CreateAuditRecordInput = {
              tenantId,
              modelConfigId,
              analysisType,
              request,
              response: {
                rawOutput,
                validatedOutput: null,
                validationPassed,
                processingTimeMs,
                tokenUsage: undefined as any,
                costUsd: undefined as any
              }
            };
            
            const record = AuditService.createAuditRecord(input);
            
            // Should have default values for token usage
            expect(record.response.tokenUsage).toBeDefined();
            expect(record.response.tokenUsage.promptTokens).toBe(0);
            expect(record.response.tokenUsage.completionTokens).toBe(0);
            expect(record.response.tokenUsage.totalTokens).toBe(0);
            
            // Should have default value for costUsd
            expect(record.response.costUsd).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 21: Audit Tenant Isolation
   * 
   * For any Tenant, querying audit records SHALL return only records where
   * the record's tenantId matches the requesting Tenant's ID.
   * 
   * **Feature: ai-assisted-intelligence, Property 21: Audit Tenant Isolation**
   * **Validates: Requirements 10.4**
   */
  describe('Property 21: Audit Tenant Isolation', () => {
    it('should only return records belonging to the requesting tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(auditRecordArb(), { minLength: 1, maxLength: 10 }),
          async (requestingTenantId, allRecords) => {
            // Assign some records to the requesting tenant, others to different tenants
            const recordsWithTenants = allRecords.map((record, index) => ({
              ...record,
              tenantId: index % 2 === 0 ? requestingTenantId : `other-tenant-${index}`
            }));
            
            // Filter to only records belonging to requesting tenant
            const expectedRecords = recordsWithTenants.filter(
              r => r.tenantId === requestingTenantId
            );
            
            mockAuditRepo.listAuditRecords.mockResolvedValue(expectedRecords);
            
            const result = await AuditService.getAuditRecords(requestingTenantId);
            
            // All returned records should belong to the requesting tenant
            for (const record of result) {
              expect(record.tenantId).toBe(requestingTenantId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw TenantAccessDeniedError when repository returns record with different tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          auditRecordArb(),
          async (requestingTenantId, otherTenantId, record) => {
            // Ensure tenants are different
            fc.pre(requestingTenantId !== otherTenantId);
            
            // Simulate repository returning a record that belongs to a different tenant
            // This tests the defense-in-depth check in the service
            const otherTenantRecord = {
              ...record,
              tenantId: otherTenantId
            };
            
            // Mock repository to return the other tenant's record (simulating a bug or attack)
            mockAuditRepo.getAuditRecord.mockResolvedValue(otherTenantRecord);
            
            // Call service and expect error
            let thrownError: Error | null = null;
            try {
              await AuditService.getAuditRecord(
                requestingTenantId,
                record.auditId,
                record.timestamp
              );
            } catch (error) {
              thrownError = error as Error;
            }
            
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(TenantAccessDeniedError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow access to own tenant records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          auditRecordArb(),
          async (tenantId, record) => {
            // Record belongs to requesting tenant
            const ownRecord = {
              ...record,
              tenantId
            };
            
            mockAuditRepo.getAuditRecord.mockResolvedValue(ownRecord);
            
            const result = await AuditService.getAuditRecord(
              tenantId,
              record.auditId,
              record.timestamp
            );
            
            expect(result.tenantId).toBe(tenantId);
            expect(result.auditId).toBe(record.auditId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw AuditRecordNotFoundError for non-existent records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          isoDateStringArb(),
          async (tenantId, auditId, timestamp) => {
            // Mock repository to return null (record not found)
            mockAuditRepo.getAuditRecord.mockResolvedValue(null);
            
            // Call service and expect error
            let thrownError: Error | null = null;
            try {
              await AuditService.getAuditRecord(tenantId, auditId, timestamp);
            } catch (error) {
              thrownError = error as Error;
            }
            
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(AuditRecordNotFoundError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should filter by tenant when listing by model config', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(auditRecordArb(), { minLength: 0, maxLength: 5 }),
          async (tenantId, modelConfigId, records) => {
            const tenantRecords = records.map(r => ({
              ...r,
              tenantId,
              modelConfigId
            }));
            
            mockAuditRepo.listAuditRecords.mockResolvedValue(tenantRecords);
            
            const result = await AuditService.getAuditRecordsByModel(
              tenantId,
              modelConfigId
            );
            
            // All returned records should belong to the tenant
            for (const record of result) {
              expect(record.tenantId).toBe(tenantId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should filter by tenant when listing by analysis type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION'),
          fc.array(auditRecordArb(), { minLength: 0, maxLength: 5 }),
          async (tenantId, analysisType, records) => {
            const tenantRecords = records.map(r => ({
              ...r,
              tenantId,
              analysisType
            }));
            
            mockAuditRepo.listAuditRecords.mockResolvedValue(tenantRecords);
            
            const result = await AuditService.getAuditRecordsByType(
              tenantId,
              analysisType
            );
            
            // All returned records should belong to the tenant
            for (const record of result) {
              expect(record.tenantId).toBe(tenantId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should export only tenant-owned records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.tuple(isoDateStringArb(), isoDateStringArb()).filter(([a, b]) => a < b),
          async (tenantId, [startDate, endDate]) => {
            const mockUrl = `https://s3.amazonaws.com/audit-logs/exports/${tenantId}/export.json`;
            mockAuditRepo.exportAuditPackage.mockResolvedValue(mockUrl);
            
            const result = await AuditService.exportAuditPackage(tenantId, {
              startDate,
              endDate
            });
            
            // Verify the export was called with the correct tenant
            expect(mockAuditRepo.exportAuditPackage).toHaveBeenCalledWith(
              tenantId,
              { startDate, endDate }
            );
            
            expect(result).toBe(mockUrl);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('logAnalysis', () => {
    it('should store audit records via repository', async () => {
      await fc.assert(
        fc.asyncProperty(
          auditRecordArb(),
          async (record) => {
            mockAuditRepo.putAuditRecord.mockResolvedValue(undefined);
            
            await AuditService.logAnalysis(record);
            
            expect(mockAuditRepo.putAuditRecord).toHaveBeenCalledWith(record);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('createAndLogAnalysis', () => {
    it('should create and store audit record in one operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          createAuditRecordInputArb(),
          async (input) => {
            mockAuditRepo.putAuditRecord.mockResolvedValue(undefined);
            
            const result = await AuditService.createAndLogAnalysis(input);
            
            // Verify record was created with correct data
            expect(result.tenantId).toBe(input.tenantId);
            expect(result.modelConfigId).toBe(input.modelConfigId);
            expect(result.analysisType).toBe(input.analysisType);
            
            // Verify record was stored
            expect(mockAuditRepo.putAuditRecord).toHaveBeenCalledWith(result);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('configuration', () => {
    it('should respect configured retention days', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 365 }),
          createAuditRecordInputArb(),
          (retentionDays, input) => {
            AuditService.configure({ defaultRetentionDays: retentionDays });
            
            // Remove custom retention from input to use default
            const inputWithoutRetention = { ...input, retentionDays: undefined };
            const record = AuditService.createAuditRecord(inputWithoutRetention);
            
            const timestamp = new Date(record.timestamp);
            const expiresAt = new Date(record.retentionExpiresAt);
            const actualDays = (expiresAt.getTime() - timestamp.getTime()) / (24 * 60 * 60 * 1000);
            
            expect(actualDays).toBeCloseTo(retentionDays, 0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect configured query limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 500 }),
          fc.uuid(),
          fc.integer({ min: 1, max: 10000 }),
          async (maxLimit, tenantId, requestedLimit) => {
            // Clear mocks before each iteration
            mockAuditRepo.listAuditRecords.mockClear();
            
            AuditService.configure({ maxQueryLimit: maxLimit });
            
            mockAuditRepo.listAuditRecords.mockResolvedValue([]);
            
            await AuditService.getAuditRecords(tenantId, { limit: requestedLimit });
            
            // Verify the effective limit is capped
            const calledFilters = mockAuditRepo.listAuditRecords.mock.calls[0][1];
            expect(calledFilters?.limit).toBeLessThanOrEqual(maxLimit);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('countAuditRecords', () => {
    it('should return count from repository', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 0, max: 10000 }),
          async (tenantId, expectedCount) => {
            mockAuditRepo.countAuditRecords.mockResolvedValue(expectedCount);
            
            const result = await AuditService.countAuditRecords(tenantId);
            
            expect(result).toBe(expectedCount);
            expect(mockAuditRepo.countAuditRecords).toHaveBeenCalledWith(tenantId, undefined);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('auditRecordExists', () => {
    it('should check existence via repository', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          isoDateStringArb(),
          fc.boolean(),
          async (tenantId, auditId, timestamp, exists) => {
            mockAuditRepo.auditRecordExists.mockResolvedValue(exists);
            
            const result = await AuditService.auditRecordExists(tenantId, auditId, timestamp);
            
            expect(result).toBe(exists);
            expect(mockAuditRepo.auditRecordExists).toHaveBeenCalledWith(tenantId, auditId, timestamp);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
