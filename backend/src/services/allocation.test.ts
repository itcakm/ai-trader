import * as fc from 'fast-check';
import { AllocationService, AllocationValidationError } from './allocation';
import { AllocationRepository } from '../repositories/allocation';
import { FundAllocation, ModelAllocation, AllocationValidation } from '../types/allocation';
import {
  validModelAllocationsArb,
  invalidSumAllocationsArb,
  tooManyModelsAllocationsArb,
  belowMinPercentageAllocationsArb,
  emptyAllocationsArb,
  fundAllocationArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/allocation');

const mockAllocationRepo = AllocationRepository as jest.Mocked<typeof AllocationRepository>;

describe('AllocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 9: Allocation Validation Rules
   * 
   * For any FundAllocation, the sum of all allocation percentages SHALL equal
   * exactly 100, the number of ModelAllocations SHALL be between 1 and 5 inclusive,
   * AND each individual allocation percentage SHALL be at least 10.
   * 
   * **Feature: ai-assisted-intelligence, Property 9: Allocation Validation Rules**
   * **Validates: Requirements 5.1, 5.2, 5.4**
   */
  describe('Property 9: Allocation Validation Rules', () => {
    it('should accept valid allocations (sum=100%, count 1-5, min 10% each)', async () => {
      await fc.assert(
        fc.property(
          validModelAllocationsArb(),
          (allocations) => {
            const result = AllocationService.validateAllocations(allocations);
            
            // Verify the allocation is valid
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            
            // Double-check the constraints are met
            const sum = allocations.reduce((s, a) => s + a.percentage, 0);
            expect(sum).toBe(100);
            expect(allocations.length).toBeGreaterThanOrEqual(1);
            expect(allocations.length).toBeLessThanOrEqual(5);
            for (const allocation of allocations) {
              expect(allocation.percentage).toBeGreaterThanOrEqual(10);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject allocations where sum != 100%', async () => {
      await fc.assert(
        fc.property(
          invalidSumAllocationsArb(),
          (allocations) => {
            const result = AllocationService.validateAllocations(allocations);
            
            const sum = allocations.reduce((s, a) => s + a.percentage, 0);
            
            // If sum is not 100, validation should fail
            if (sum !== 100) {
              expect(result.valid).toBe(false);
              expect(result.errors.some(e => e.includes('100%'))).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject allocations with more than 5 models', async () => {
      await fc.assert(
        fc.property(
          tooManyModelsAllocationsArb(),
          (allocations) => {
            const result = AllocationService.validateAllocations(allocations);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => 
              e.includes('more than') && e.includes('5')
            )).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject allocations with percentage below 10%', async () => {
      await fc.assert(
        fc.property(
          belowMinPercentageAllocationsArb(),
          (allocations) => {
            const result = AllocationService.validateAllocations(allocations);
            
            // Find allocations below minimum
            const belowMin = allocations.filter(
              a => a.percentage < AllocationValidation.minPercentagePerModel
            );
            
            if (belowMin.length > 0) {
              expect(result.valid).toBe(false);
              expect(result.errors.some(e => 
                e.includes('minimum') && e.includes('10%')
              )).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject empty allocations (count < 1)', async () => {
      await fc.assert(
        fc.property(
          emptyAllocationsArb(),
          (allocations) => {
            const result = AllocationService.validateAllocations(allocations);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => 
              e.includes('at least') && e.includes('1')
            )).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject allocations with duplicate model config IDs', async () => {
      await fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          (modelConfigId, priority1, priority2) => {
            const allocations: ModelAllocation[] = [
              { modelConfigId, percentage: 50, priority: priority1 },
              { modelConfigId, percentage: 50, priority: priority2 }
            ];
            
            const result = AllocationService.validateAllocations(allocations);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => 
              e.toLowerCase().includes('duplicate')
            )).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate all constraints simultaneously', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.record({
              modelConfigId: fc.uuid(),
              percentage: fc.integer({ min: 1, max: 100 }),
              priority: fc.integer({ min: 1, max: 10 })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          (allocations) => {
            const result = AllocationService.validateAllocations(allocations);
            
            // Calculate expected validity
            const sum = allocations.reduce((s, a) => s + a.percentage, 0);
            const count = allocations.length;
            const allAboveMin = allocations.every(
              a => a.percentage >= AllocationValidation.minPercentagePerModel
            );
            const uniqueIds = new Set(allocations.map(a => a.modelConfigId));
            const noDuplicates = uniqueIds.size === allocations.length;
            
            const shouldBeValid = 
              sum === 100 &&
              count >= AllocationValidation.minModels &&
              count <= AllocationValidation.maxModels &&
              allAboveMin &&
              noDuplicates;
            
            expect(result.valid).toBe(shouldBeValid);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('createAllocation', () => {
    it('should throw AllocationValidationError for invalid allocations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          invalidSumAllocationsArb(),
          async (tenantId, strategyId, createdBy, invalidAllocations) => {
            mockAllocationRepo.getLatestAllocation.mockResolvedValue(null);
            
            await expect(
              AllocationService.createAllocation(
                tenantId,
                strategyId,
                { allocations: invalidAllocations },
                createdBy
              )
            ).rejects.toThrow(AllocationValidationError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create allocation for valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          validModelAllocationsArb(),
          async (tenantId, strategyId, createdBy, validAllocations) => {
            mockAllocationRepo.getLatestAllocation.mockResolvedValue(null);
            mockAllocationRepo.createAllocation.mockImplementation(
              async (tid, input) => ({
                allocationId: 'new-allocation-id',
                tenantId: tid,
                strategyId: input.strategyId,
                version: 1,
                allocations: input.allocations,
                ensembleMode: input.ensembleMode,
                createdAt: new Date().toISOString(),
                createdBy: input.createdBy
              })
            );
            
            const result = await AllocationService.createAllocation(
              tenantId,
              strategyId,
              { allocations: validAllocations },
              createdBy
            );
            
            expect(result.tenantId).toBe(tenantId);
            expect(result.strategyId).toBe(strategyId);
            expect(result.version).toBe(1);
            expect(result.allocations).toEqual(validAllocations);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateWeights', () => {
    it('should convert percentages to weights (0-1)', async () => {
      await fc.assert(
        fc.property(
          validModelAllocationsArb(),
          (allocations) => {
            const weights = AllocationService.calculateWeights(allocations);
            
            // Verify each weight is percentage / 100
            for (const allocation of allocations) {
              const weight = weights.get(allocation.modelConfigId);
              expect(weight).toBeDefined();
              expect(weight).toBeCloseTo(allocation.percentage / 100, 10);
            }
            
            // Verify weights sum to 1
            let totalWeight = 0;
            weights.forEach(w => { totalWeight += w; });
            expect(totalWeight).toBeCloseTo(1, 10);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Allocation Versioning
   * 
   * For any FundAllocation update, a new version SHALL be created with an
   * incremented version number, AND all previous versions SHALL remain retrievable.
   * 
   * **Feature: ai-assisted-intelligence, Property 10: Allocation Versioning**
   * **Validates: Requirements 5.3**
   */
  describe('Property 10: Allocation Versioning', () => {
    it('should create new version with incremented version number on update', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fundAllocationArb(),
          validModelAllocationsArb(),
          async (tenantId, strategyId, createdBy, existingAllocation, newAllocations) => {
            // Setup existing allocation
            const existing: FundAllocation = {
              ...existingAllocation,
              tenantId,
              strategyId
            };
            
            mockAllocationRepo.getLatestAllocation.mockResolvedValue(existing);
            
            const expectedNewVersion = existing.version + 1;
            mockAllocationRepo.createNewVersion.mockImplementation(
              async (tid, sid, allocs, ensembleMode, creator) => ({
                allocationId: 'new-allocation-id',
                tenantId: tid,
                strategyId: sid,
                version: expectedNewVersion,
                allocations: allocs,
                ensembleMode,
                createdAt: new Date().toISOString(),
                createdBy: creator
              })
            );
            
            const result = await AllocationService.updateAllocation(
              tenantId,
              strategyId,
              { allocations: newAllocations },
              createdBy
            );
            
            // Verify version is incremented
            expect(result.version).toBe(expectedNewVersion);
            expect(result.version).toBe(existing.version + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all previous versions when retrieving history', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 10 }),
          async (tenantId, strategyId, numVersions) => {
            // Create mock history with sequential versions
            const history: FundAllocation[] = [];
            for (let i = 1; i <= numVersions; i++) {
              history.push({
                allocationId: `allocation-${i}`,
                tenantId,
                strategyId,
                version: i,
                allocations: [
                  { modelConfigId: `model-${i}`, percentage: 100, priority: 1 }
                ],
                ensembleMode: false,
                createdAt: new Date(Date.now() - (numVersions - i) * 86400000).toISOString(),
                createdBy: 'test-user'
              });
            }
            
            mockAllocationRepo.getAllocationHistory.mockResolvedValue(history);
            
            const result = await AllocationService.getAllocationHistory(tenantId, strategyId);
            
            // Verify all versions are present
            expect(result).toHaveLength(numVersions);
            
            // Verify versions are sequential starting from 1
            for (let i = 0; i < result.length; i++) {
              expect(result[i].version).toBe(i + 1);
            }
            
            // Verify all versions have correct tenant and strategy
            for (const allocation of result) {
              expect(allocation.tenantId).toBe(tenantId);
              expect(allocation.strategyId).toBe(strategyId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain version ordering in history (ascending)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(fundAllocationArb(), { minLength: 2, maxLength: 10 }),
          async (tenantId, strategyId, allocations) => {
            // Assign sequential versions and same tenant/strategy
            const history = allocations.map((alloc, index) => ({
              ...alloc,
              tenantId,
              strategyId,
              version: index + 1
            }));
            
            mockAllocationRepo.getAllocationHistory.mockResolvedValue(history);
            
            const result = await AllocationService.getAllocationHistory(tenantId, strategyId);
            
            // Verify versions are in ascending order
            for (let i = 1; i < result.length; i++) {
              expect(result[i].version).toBeGreaterThan(result[i - 1].version);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow retrieval of specific version', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fundAllocationArb(),
          fc.integer({ min: 1, max: 100 }),
          async (tenantId, strategyId, allocation, version) => {
            const specificVersion: FundAllocation = {
              ...allocation,
              tenantId,
              strategyId,
              version
            };
            
            mockAllocationRepo.getAllocation.mockResolvedValue(specificVersion);
            
            const result = await AllocationService.getAllocationVersion(
              tenantId,
              strategyId,
              version
            );
            
            expect(result).not.toBeNull();
            expect(result!.version).toBe(version);
            expect(result!.tenantId).toBe(tenantId);
            expect(result!.strategyId).toBe(strategyId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for non-existent version', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 1000 }),
          async (tenantId, strategyId, version) => {
            mockAllocationRepo.getAllocation.mockResolvedValue(null);
            
            const result = await AllocationService.getAllocationVersion(
              tenantId,
              strategyId,
              version
            );
            
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
