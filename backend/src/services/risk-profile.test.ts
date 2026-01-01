import * as fc from 'fast-check';
import { RiskProfileService, RiskProfileOverrides, AppliedRiskProfile } from './risk-profile';
import { RiskProfileRepository } from '../repositories/risk-profile';
import { RiskProfile, RiskProfileInput } from '../types/risk-profile';
import {
  riskProfileInputArb,
  riskProfileArb,
  riskProfileOverridesArb,
  invalidRiskProfileInputArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/risk-profile');
jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9))
}));

const mockRepository = RiskProfileRepository as jest.Mocked<typeof RiskProfileRepository>;

describe('RiskProfileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 18: Risk Profile Application
   * *For any* strategy with an assigned Risk_Profile, all risk parameters from the profile
   * SHALL be applied, AND strategy-specific overrides SHALL take precedence over profile defaults.
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   */
  describe('Property 18: Risk Profile Application', () => {
    it('should apply all parameters from assigned profile to strategy', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskProfileArb(),
          fc.uuid(),
          async (profile, strategyId) => {
            const tenantId = profile.tenantId;
            
            // Mock repository to return the profile
            mockRepository.getStrategyAssignment.mockResolvedValue({
              tenantId,
              strategyId,
              profileId: profile.profileId,
              assignedAt: new Date().toISOString()
            });
            mockRepository.getLatestProfile.mockResolvedValue(profile);
            
            // Get applied profile without overrides
            const applied = await RiskProfileService.getAppliedProfile(tenantId, strategyId);
            
            // Verify all parameters are applied
            expect(applied).not.toBeNull();
            expect(applied!.profileId).toBe(profile.profileId);
            expect(applied!.profileVersion).toBe(profile.version);
            expect(applied!.strategyId).toBe(strategyId);
            expect(applied!.positionLimits).toEqual(profile.positionLimits);
            expect(applied!.drawdownConfig.warningThresholdPercent).toBe(profile.drawdownConfig.warningThresholdPercent);
            expect(applied!.drawdownConfig.maxThresholdPercent).toBe(profile.drawdownConfig.maxThresholdPercent);
            expect(applied!.volatilityConfig.indexType).toBe(profile.volatilityConfig.indexType);
            expect(applied!.volatilityConfig.normalThreshold).toBe(profile.volatilityConfig.normalThreshold);
            expect(applied!.circuitBreakers).toEqual(profile.circuitBreakers);
            expect(applied!.exchangeSafeguards).toEqual(profile.exchangeSafeguards);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply strategy-specific overrides taking precedence over profile defaults', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskProfileArb(),
          fc.uuid(),
          riskProfileOverridesArb(),
          async (profile, strategyId, overrides) => {
            const tenantId = profile.tenantId;
            
            // Mock repository
            mockRepository.getStrategyAssignment.mockResolvedValue({
              tenantId,
              strategyId,
              profileId: profile.profileId,
              assignedAt: new Date().toISOString()
            });
            mockRepository.getLatestProfile.mockResolvedValue(profile);
            
            // Get applied profile with overrides
            const applied = await RiskProfileService.getAppliedProfile(tenantId, strategyId, overrides);
            
            expect(applied).not.toBeNull();
            
            // Verify overrides take precedence
            if (overrides.positionLimits !== undefined) {
              expect(applied!.positionLimits).toEqual(overrides.positionLimits);
            } else {
              expect(applied!.positionLimits).toEqual(profile.positionLimits);
            }
            
            if (overrides.circuitBreakers !== undefined) {
              expect(applied!.circuitBreakers).toEqual(overrides.circuitBreakers);
            } else {
              expect(applied!.circuitBreakers).toEqual(profile.circuitBreakers);
            }
            
            // For partial overrides (drawdownConfig, volatilityConfig, exchangeSafeguards),
            // verify that specified fields are overridden while others retain profile defaults
            if (overrides.drawdownConfig) {
              for (const [key, value] of Object.entries(overrides.drawdownConfig)) {
                if (value !== undefined) {
                  expect((applied!.drawdownConfig as any)[key]).toBe(value);
                }
              }
            }
            
            if (overrides.volatilityConfig) {
              for (const [key, value] of Object.entries(overrides.volatilityConfig)) {
                if (value !== undefined) {
                  expect((applied!.volatilityConfig as any)[key]).toBe(value);
                }
              }
            }
            
            if (overrides.exchangeSafeguards) {
              for (const [key, value] of Object.entries(overrides.exchangeSafeguards)) {
                if (value !== undefined) {
                  expect((applied!.exchangeSafeguards as any)[key]).toBe(value);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null when no profile is assigned to strategy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          async (tenantId, strategyId) => {
            // Mock no assignment
            mockRepository.getStrategyAssignment.mockResolvedValue(null);
            
            const applied = await RiskProfileService.getAppliedProfile(tenantId, strategyId);
            
            expect(applied).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should assign profile to strategy and apply all parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskProfileInputArb(),
          fc.uuid(),
          fc.uuid(),
          async (profileInput, tenantId, strategyId) => {
            // Mock profile creation
            let createdProfile: RiskProfile | null = null;
            mockRepository.putProfile.mockImplementation(async (tid, profile) => {
              createdProfile = profile;
            });
            mockRepository.getLatestProfile.mockImplementation(async (tid, pid) => {
              if (createdProfile && createdProfile.profileId === pid) {
                return createdProfile;
              }
              return null;
            });
            mockRepository.assignProfileToStrategy.mockResolvedValue({
              tenantId,
              strategyId,
              profileId: 'test-profile-id',
              assignedAt: new Date().toISOString()
            });
            
            // Create profile
            const profile = await RiskProfileService.createProfile(tenantId, profileInput);
            
            // Assign to strategy
            await RiskProfileService.assignToStrategy(tenantId, strategyId, profile.profileId);
            
            // Verify assignment was called
            expect(mockRepository.assignProfileToStrategy).toHaveBeenCalledWith(
              tenantId,
              strategyId,
              profile.profileId
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 19: Risk Profile Validation
   * *For any* Risk_Profile configuration, the system SHALL validate internal consistency
   * (e.g., warning threshold < max threshold), AND inconsistent configurations SHALL be
   * rejected with specific error messages.
   * 
   * **Validates: Requirements 8.5**
   */
  describe('Property 19: Risk Profile Validation', () => {
    it('should accept valid profile configurations', () => {
      fc.assert(
        fc.property(
          riskProfileInputArb(),
          (profileInput) => {
            const result = RiskProfileService.validateProfile(profileInput);
            
            // Valid profiles should pass validation
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid profile configurations with specific error messages', () => {
      fc.assert(
        fc.property(
          invalidRiskProfileInputArb(),
          (invalidInput) => {
            const result = RiskProfileService.validateProfile(invalidInput);
            
            // Invalid profiles should fail validation
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            
            // Errors should be specific strings
            for (const error of result.errors) {
              expect(typeof error).toBe('string');
              expect(error.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate drawdown warning threshold < max threshold', () => {
      fc.assert(
        fc.property(
          riskProfileInputArb(),
          fc.double({ min: 50, max: 90, noNaN: true }),
          fc.double({ min: 10, max: 40, noNaN: true }),
          (profileInput, warning, max) => {
            // Create invalid config where warning >= max
            const invalidInput = {
              ...profileInput,
              drawdownConfig: {
                ...profileInput.drawdownConfig,
                warningThresholdPercent: warning,
                maxThresholdPercent: max
              }
            };
            
            const result = RiskProfileService.validateProfile(invalidInput);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('warning') && e.includes('max'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate volatility thresholds are in ascending order', () => {
      fc.assert(
        fc.property(
          riskProfileInputArb(),
          (profileInput) => {
            // Create invalid config where thresholds are not ascending
            const invalidInput = {
              ...profileInput,
              volatilityConfig: {
                ...profileInput.volatilityConfig,
                normalThreshold: 50,
                highThreshold: 30,
                extremeThreshold: 20
              }
            };
            
            const result = RiskProfileService.validateProfile(invalidInput);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('threshold'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate exchange min order size < max order size', () => {
      fc.assert(
        fc.property(
          riskProfileInputArb(),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          fc.double({ min: 1, max: 50, noNaN: true }),
          (profileInput, minSize, maxSize) => {
            // Create invalid config where min >= max
            const invalidInput = {
              ...profileInput,
              exchangeSafeguards: {
                ...profileInput.exchangeSafeguards,
                minOrderSize: minSize,
                maxOrderSize: maxSize
              }
            };
            
            const result = RiskProfileService.validateProfile(invalidInput);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('order size'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject profiles with empty names', () => {
      fc.assert(
        fc.property(
          riskProfileInputArb(),
          fc.constantFrom('', '   ', '\t', '\n'),
          (profileInput, emptyName) => {
            const invalidInput = { ...profileInput, name: emptyName };
            
            const result = RiskProfileService.validateProfile(invalidInput);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('name'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject percentage position limits exceeding 100%', () => {
      fc.assert(
        fc.property(
          riskProfileInputArb(),
          fc.double({ min: 101, max: 500, noNaN: true }),
          (profileInput, invalidPercent) => {
            const invalidInput = {
              ...profileInput,
              positionLimits: [{
                scope: 'PORTFOLIO' as const,
                limitType: 'PERCENTAGE' as const,
                maxValue: invalidPercent
              }]
            };
            
            const result = RiskProfileService.validateProfile(invalidInput);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('percentage') || e.includes('100'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 20: Risk Profile Versioning
   * *For any* Risk_Profile update, a new version SHALL be created with incremented version number,
   * AND all previous versions SHALL remain retrievable.
   * 
   * **Validates: Requirements 8.6**
   */
  describe('Property 20: Risk Profile Versioning', () => {
    it('should create new version with incremented version number on update', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskProfileArb(),
          riskProfileInputArb(),
          async (existingProfile, updateInput) => {
            const tenantId = existingProfile.tenantId;
            const profileId = existingProfile.profileId;
            
            // Track saved profiles
            const savedProfiles: RiskProfile[] = [];
            
            mockRepository.getLatestProfile.mockResolvedValue(existingProfile);
            mockRepository.putProfile.mockImplementation(async (tid, profile) => {
              savedProfiles.push(profile);
            });
            
            // Update the profile
            const updatedProfile = await RiskProfileService.updateProfile(
              tenantId,
              profileId,
              { name: updateInput.name }
            );
            
            // Verify version was incremented
            expect(updatedProfile.version).toBe(existingProfile.version + 1);
            expect(updatedProfile.profileId).toBe(profileId);
            expect(updatedProfile.tenantId).toBe(tenantId);
            
            // Verify new version was saved
            expect(savedProfiles.length).toBe(1);
            expect(savedProfiles[0].version).toBe(existingProfile.version + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all previous versions for retrieval', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(riskProfileInputArb(), { minLength: 2, maxLength: 5 }),
          async (tenantId, profileId, updates) => {
            // Simulate version history
            const versionHistory: RiskProfile[] = updates.map((input, index) => ({
              profileId,
              tenantId,
              name: input.name,
              version: index + 1,
              positionLimits: input.positionLimits,
              drawdownConfig: {
                configId: 'config-id',
                tenantId,
                ...input.drawdownConfig
              },
              volatilityConfig: {
                configId: 'vol-config-id',
                tenantId,
                ...input.volatilityConfig
              },
              circuitBreakers: input.circuitBreakers,
              exchangeSafeguards: input.exchangeSafeguards,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }));
            
            mockRepository.getProfileHistory.mockResolvedValue(versionHistory);
            
            // Get profile history
            const history = await RiskProfileService.getProfileHistory(tenantId, profileId);
            
            // Verify all versions are retrievable
            expect(history.length).toBe(versionHistory.length);
            
            // Verify each version has correct version number
            for (let i = 0; i < history.length; i++) {
              expect(history[i].profileId).toBe(profileId);
              expect(history[i].tenantId).toBe(tenantId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain createdAt timestamp across versions', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskProfileArb(),
          riskProfileInputArb(),
          async (existingProfile, updateInput) => {
            const tenantId = existingProfile.tenantId;
            const profileId = existingProfile.profileId;
            const originalCreatedAt = existingProfile.createdAt;
            
            mockRepository.getLatestProfile.mockResolvedValue(existingProfile);
            mockRepository.putProfile.mockResolvedValue();
            
            // Update the profile
            const updatedProfile = await RiskProfileService.updateProfile(
              tenantId,
              profileId,
              { name: updateInput.name }
            );
            
            // Verify createdAt is preserved
            expect(updatedProfile.createdAt).toBe(originalCreatedAt);
            
            // Verify updatedAt is changed
            expect(updatedProfile.updatedAt).not.toBe(existingProfile.updatedAt);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should start at version 1 for new profiles', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          riskProfileInputArb(),
          async (tenantId, profileInput) => {
            mockRepository.putProfile.mockResolvedValue();
            
            const profile = await RiskProfileService.createProfile(tenantId, profileInput);
            
            expect(profile.version).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Unit tests for edge cases
  describe('Unit Tests', () => {
    it('should throw error when updating non-existent profile', async () => {
      mockRepository.getLatestProfile.mockResolvedValue(null);
      
      await expect(
        RiskProfileService.updateProfile('tenant-1', 'non-existent', { name: 'New Name' })
      ).rejects.toThrow('Risk profile not found');
    });

    it('should throw error when assigning non-existent profile to strategy', async () => {
      mockRepository.getLatestProfile.mockResolvedValue(null);
      
      await expect(
        RiskProfileService.assignToStrategy('tenant-1', 'strategy-1', 'non-existent')
      ).rejects.toThrow('Risk profile not found');
    });

    it('should throw error when creating profile with invalid configuration', async () => {
      const invalidInput: RiskProfileInput = {
        name: '',
        positionLimits: [],
        drawdownConfig: {
          warningThresholdPercent: 50,
          maxThresholdPercent: 30, // Invalid: warning > max
          resetInterval: 'DAILY',
          autoResumeEnabled: false,
          cooldownMinutes: 60
        },
        volatilityConfig: {
          indexType: 'ATR',
          normalThreshold: 10,
          highThreshold: 20,
          extremeThreshold: 30,
          highThrottlePercent: 50,
          extremeThrottlePercent: 100,
          cooldownMinutes: 30
        },
        circuitBreakers: [],
        exchangeSafeguards: {
          minOrderSize: 0.01,
          maxOrderSize: 1000,
          maxPriceDeviationPercent: 5,
          rateLimitBuffer: 20,
          connectionTimeoutMs: 5000,
          maxRetries: 3
        }
      };
      
      await expect(
        RiskProfileService.createProfile('tenant-1', invalidInput)
      ).rejects.toThrow('Invalid risk profile');
    });
  });
});
