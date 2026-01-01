import * as fc from 'fast-check';
import { ModelConfigService, CostLimitExceededError } from './model-config';
import { ModelConfigRepository } from '../repositories/model-config';
import { ProviderRepository } from '../repositories/provider';
import { ModelConfiguration, CostLimits } from '../types/model-config';
import { AIProvider } from '../types/provider';
import {
  modelConfigurationArb,
  enabledModelConfigurationArb,
  disabledModelConfigurationArb,
  aiProviderArb,
  activeAiProviderArb,
  inactiveAiProviderArb,
  costLimitsBelowLimitArb,
  costLimitsExceededDailyArb
} from '../test/generators';

// Mock the repositories
jest.mock('../repositories/model-config');
jest.mock('../repositories/provider');

const mockModelConfigRepo = ModelConfigRepository as jest.Mocked<typeof ModelConfigRepository>;
const mockProviderRepo = ProviderRepository as jest.Mocked<typeof ProviderRepository>;

describe('ModelConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 4: Available Models Filtering
   * 
   * For any Tenant requesting available models, the returned list SHALL contain
   * only models where: (a) the model is enabled for the Tenant, AND (b) the
   * model's AI_Provider has status ACTIVE.
   * 
   * **Feature: ai-assisted-intelligence, Property 4: Available Models Filtering**
   * **Validates: Requirements 2.3**
   */
  describe('Property 4: Available Models Filtering', () => {
    it('should return only enabled models with active providers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          fc.array(modelConfigurationArb(), { minLength: 0, maxLength: 10 }),
          fc.array(aiProviderArb(), { minLength: 0, maxLength: 5 }),
          async (tenantId, configs, providers) => {
            // Assign tenant to all configs
            const tenantConfigs = configs.map(c => ({ ...c, tenantId }));
            
            // Create provider map
            const providerMap = new Map(providers.map(p => [p.providerId, p]));
            
            // Assign some configs to existing providers
            const configsWithProviders = tenantConfigs.map((config, index) => {
              if (providers.length > 0 && index % 2 === 0) {
                const provider = providers[index % providers.length];
                return { ...config, providerId: provider.providerId };
              }
              return config;
            });

            // Get enabled configs
            const enabledConfigs = configsWithProviders.filter(c => c.enabled);
            
            // Get active providers
            const activeProviders = providers.filter(p => p.status === 'ACTIVE');

            // Mock repository calls
            mockModelConfigRepo.getEnabledConfigurations.mockResolvedValue(enabledConfigs);
            mockProviderRepo.getActiveProviders.mockResolvedValue(activeProviders);

            // Call the service
            const result = await ModelConfigService.listAvailableModels(tenantId);

            // Verify all returned models are enabled
            for (const model of result) {
              const config = enabledConfigs.find(c => c.configId === model.configId);
              expect(config).toBeDefined();
              expect(config!.enabled).toBe(true);
            }

            // Verify all returned models have active providers
            const activeProviderIds = new Set(activeProviders.map(p => p.providerId));
            for (const model of result) {
              expect(activeProviderIds.has(model.providerId)).toBe(true);
            }

            // Verify no disabled models are returned
            const disabledConfigIds = configsWithProviders
              .filter(c => !c.enabled)
              .map(c => c.configId);
            for (const model of result) {
              expect(disabledConfigIds).not.toContain(model.configId);
            }

            // Verify no models with inactive providers are returned
            const inactiveProviderIds = new Set(
              providers.filter(p => p.status !== 'ACTIVE').map(p => p.providerId)
            );
            for (const model of result) {
              expect(inactiveProviderIds.has(model.providerId)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty list when no models are enabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(disabledModelConfigurationArb(), { minLength: 1, maxLength: 5 }),
          fc.array(activeAiProviderArb(), { minLength: 1, maxLength: 3 }),
          async (tenantId, disabledConfigs, activeProviders) => {
            // All configs are disabled, so getEnabledConfigurations returns empty
            mockModelConfigRepo.getEnabledConfigurations.mockResolvedValue([]);
            mockProviderRepo.getActiveProviders.mockResolvedValue(activeProviders);

            const result = await ModelConfigService.listAvailableModels(tenantId);

            expect(result).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty list when no providers are active', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(enabledModelConfigurationArb(), { minLength: 1, maxLength: 5 }),
          fc.array(inactiveAiProviderArb(), { minLength: 1, maxLength: 3 }),
          async (tenantId, enabledConfigs, inactiveProviders) => {
            // Assign configs to inactive providers
            const configsWithProviders = enabledConfigs.map((config, index) => ({
              ...config,
              tenantId,
              providerId: inactiveProviders[index % inactiveProviders.length].providerId
            }));

            mockModelConfigRepo.getEnabledConfigurations.mockResolvedValue(configsWithProviders);
            // No active providers
            mockProviderRepo.getActiveProviders.mockResolvedValue([]);

            const result = await ModelConfigService.listAvailableModels(tenantId);

            expect(result).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return models sorted by priority (highest first)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(enabledModelConfigurationArb(), { minLength: 2, maxLength: 10 }),
          async (tenantId, enabledConfigs) => {
            // Create a single active provider for all configs
            const provider: AIProvider = {
              providerId: 'test-provider',
              type: 'OPENAI',
              name: 'Test Provider',
              apiEndpoint: 'https://api.test.com',
              authMethod: 'API_KEY',
              supportedModels: ['gpt-4'],
              status: 'ACTIVE',
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            const configsWithProvider = enabledConfigs.map(c => ({
              ...c,
              tenantId,
              providerId: provider.providerId
            }));

            mockModelConfigRepo.getEnabledConfigurations.mockResolvedValue(configsWithProvider);
            mockProviderRepo.getActiveProviders.mockResolvedValue([provider]);

            const result = await ModelConfigService.listAvailableModels(tenantId);

            // Verify sorted by priority descending
            for (let i = 1; i < result.length; i++) {
              expect(result[i - 1].priority).toBeGreaterThanOrEqual(result[i].priority);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Cost Limit Enforcement
   * 
   * For any Tenant whose currentDailyCostUsd exceeds maxDailyCostUsd for a
   * ModelConfiguration, subsequent analysis requests using that model SHALL
   * be rejected until the cost resets.
   * 
   * **Feature: ai-assisted-intelligence, Property 5: Cost Limit Enforcement**
   * **Validates: Requirements 2.5**
   */
  describe('Property 5: Cost Limit Enforcement', () => {
    it('should reject requests when daily cost limit is exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          costLimitsExceededDailyArb(),
          async (tenantId, configId, exceededCostLimits) => {
            const config: ModelConfiguration = {
              configId,
              tenantId,
              providerId: 'provider-1',
              modelId: 'gpt-4',
              modelName: 'GPT-4',
              enabled: true,
              credentials: { encryptedApiKey: 'encrypted', keyId: 'key-1' },
              costLimits: exceededCostLimits,
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            mockModelConfigRepo.getConfiguration.mockResolvedValue(config);

            // Verify checkCostLimit throws
            await expect(
              ModelConfigService.checkCostLimit(tenantId, configId)
            ).rejects.toThrow(CostLimitExceededError);

            // Verify the error details
            try {
              await ModelConfigService.checkCostLimit(tenantId, configId);
            } catch (error) {
              expect(error).toBeInstanceOf(CostLimitExceededError);
              const costError = error as CostLimitExceededError;
              expect(costError.limitType).toBe('daily');
              expect(costError.currentCost).toBe(exceededCostLimits.currentDailyCostUsd);
              expect(costError.maxCost).toBe(exceededCostLimits.maxDailyCostUsd);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow requests when cost is below limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          costLimitsBelowLimitArb(),
          async (tenantId, configId, belowLimitCosts) => {
            const config: ModelConfiguration = {
              configId,
              tenantId,
              providerId: 'provider-1',
              modelId: 'gpt-4',
              modelName: 'GPT-4',
              enabled: true,
              credentials: { encryptedApiKey: 'encrypted', keyId: 'key-1' },
              costLimits: belowLimitCosts,
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            mockModelConfigRepo.getConfiguration.mockResolvedValue(config);

            // Should not throw
            await expect(
              ModelConfigService.checkCostLimit(tenantId, configId)
            ).resolves.toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify when cost limit is exceeded', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            maxDailyCostUsd: fc.double({ min: 10, max: 1000, noNaN: true }),
            maxMonthlyCostUsd: fc.double({ min: 100, max: 10000, noNaN: true }),
            currentDailyCostUsd: fc.double({ min: 0, max: 2000, noNaN: true }),
            currentMonthlyCostUsd: fc.double({ min: 0, max: 20000, noNaN: true }),
            lastResetDate: fc.constant(new Date().toISOString())
          }),
          (costLimits) => {
            const isExceeded = ModelConfigService.isCostLimitExceeded(costLimits);
            
            const dailyExceeded = costLimits.currentDailyCostUsd >= costLimits.maxDailyCostUsd;
            const monthlyExceeded = costLimits.currentMonthlyCostUsd >= costLimits.maxMonthlyCostUsd;
            
            expect(isExceeded).toBe(dailyExceeded || monthlyExceeded);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accumulate costs correctly when recording', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          costLimitsBelowLimitArb(),
          fc.double({ min: 0.01, max: 10, noNaN: true }),
          async (tenantId, configId, initialCostLimits, newCost) => {
            const config: ModelConfiguration = {
              configId,
              tenantId,
              providerId: 'provider-1',
              modelId: 'gpt-4',
              modelName: 'GPT-4',
              enabled: true,
              credentials: { encryptedApiKey: 'encrypted', keyId: 'key-1' },
              costLimits: {
                ...initialCostLimits,
                lastResetDate: new Date().toISOString() // Same day
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            mockModelConfigRepo.getConfiguration.mockResolvedValue(config);
            
            let updatedCostLimits: CostLimits | null = null;
            mockModelConfigRepo.updateCostLimits.mockImplementation(
              async (tid, cid, costs) => {
                updatedCostLimits = costs;
                return { ...config, costLimits: costs };
              }
            );

            await ModelConfigService.recordCost({ tenantId, configId, costUsd: newCost });

            expect(updatedCostLimits).not.toBeNull();
            // Cost should be accumulated (same day)
            expect(updatedCostLimits!.currentDailyCostUsd).toBeCloseTo(
              initialCostLimits.currentDailyCostUsd + newCost,
              5
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isModelAvailable', () => {
    it('should return false for disabled models', async () => {
      const config: ModelConfiguration = {
        configId: 'config-1',
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        enabled: false,
        credentials: { encryptedApiKey: 'encrypted', keyId: 'key-1' },
        costLimits: {
          maxDailyCostUsd: 100,
          maxMonthlyCostUsd: 1000,
          currentDailyCostUsd: 0,
          currentMonthlyCostUsd: 0,
          lastResetDate: new Date().toISOString()
        },
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        priority: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockModelConfigRepo.getConfiguration.mockResolvedValue(config);

      const result = await ModelConfigService.isModelAvailable('tenant-1', 'config-1');
      expect(result).toBe(false);
    });

    it('should return false for models with inactive providers', async () => {
      const config: ModelConfiguration = {
        configId: 'config-1',
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        enabled: true,
        credentials: { encryptedApiKey: 'encrypted', keyId: 'key-1' },
        costLimits: {
          maxDailyCostUsd: 100,
          maxMonthlyCostUsd: 1000,
          currentDailyCostUsd: 0,
          currentMonthlyCostUsd: 0,
          lastResetDate: new Date().toISOString()
        },
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        priority: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const provider: AIProvider = {
        providerId: 'provider-1',
        type: 'OPENAI',
        name: 'OpenAI',
        apiEndpoint: 'https://api.openai.com',
        authMethod: 'API_KEY',
        supportedModels: ['gpt-4'],
        status: 'INACTIVE',
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockModelConfigRepo.getConfiguration.mockResolvedValue(config);
      mockProviderRepo.getProvider.mockResolvedValue(provider);

      const result = await ModelConfigService.isModelAvailable('tenant-1', 'config-1');
      expect(result).toBe(false);
    });

    it('should return true for enabled models with active providers and below cost limits', async () => {
      const config: ModelConfiguration = {
        configId: 'config-1',
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        enabled: true,
        credentials: { encryptedApiKey: 'encrypted', keyId: 'key-1' },
        costLimits: {
          maxDailyCostUsd: 100,
          maxMonthlyCostUsd: 1000,
          currentDailyCostUsd: 10,
          currentMonthlyCostUsd: 50,
          lastResetDate: new Date().toISOString()
        },
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        priority: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const provider: AIProvider = {
        providerId: 'provider-1',
        type: 'OPENAI',
        name: 'OpenAI',
        apiEndpoint: 'https://api.openai.com',
        authMethod: 'API_KEY',
        supportedModels: ['gpt-4'],
        status: 'ACTIVE',
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockModelConfigRepo.getConfiguration.mockResolvedValue(config);
      mockProviderRepo.getProvider.mockResolvedValue(provider);

      const result = await ModelConfigService.isModelAvailable('tenant-1', 'config-1');
      expect(result).toBe(true);
    });
  });
});
