import * as fc from 'fast-check';
import { ModelConfigRepository } from './model-config';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { ModelConfiguration, ModelConfigurationInput } from '../types/model-config';
import { modelConfigurationInputArb, modelConfigurationArb } from '../test/generators';

// Mock the DynamoDB document client
jest.mock('../db/client', () => ({
  documentClient: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
    scan: jest.fn()
  }
}));

// Mock the UUID generator
jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'test-config-id')
}));

const mockDocumentClient = documentClient as jest.Mocked<typeof documentClient>;

describe('ModelConfigRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfiguration', () => {
    it('should return null when configuration does not exist', async () => {
      mockDocumentClient.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Item: undefined })
      } as any);

      const result = await ModelConfigRepository.getConfiguration('tenant-1', 'config-1');
      expect(result).toBeNull();
    });

    it('should return configuration when it exists', async () => {
      const mockConfig: ModelConfiguration = {
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
          lastResetDate: '2024-01-01T00:00:00.000Z'
        },
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        priority: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      mockDocumentClient.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Item: mockConfig })
      } as any);

      const result = await ModelConfigRepository.getConfiguration('tenant-1', 'config-1');
      expect(result).toEqual(mockConfig);
    });
  });

  describe('createConfiguration', () => {
    it('should create a new configuration', async () => {
      mockDocumentClient.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);

      const input: ModelConfigurationInput = {
        providerId: 'provider-1',
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        credentials: { encryptedApiKey: 'encrypted', keyId: 'key-1' },
        costLimits: {
          maxDailyCostUsd: 100,
          maxMonthlyCostUsd: 1000,
          currentDailyCostUsd: 0,
          currentMonthlyCostUsd: 0,
          lastResetDate: '2024-01-01T00:00:00.000Z'
        },
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 }
      };

      const result = await ModelConfigRepository.createConfiguration('tenant-1', input);

      expect(result.configId).toBe('test-config-id');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.providerId).toBe('provider-1');
      expect(result.enabled).toBe(true); // Default value
      expect(result.priority).toBe(5); // Default value
      expect(mockDocumentClient.put).toHaveBeenCalled();
    });
  });

  /**
   * Property 3: Model Configuration Persistence Round-Trip
   * 
   * For any valid ModelConfiguration object, serializing to JSON, persisting to storage,
   * retrieving, and deserializing SHALL produce an equivalent ModelConfiguration with
   * all fields preserved (excluding encrypted credentials which should decrypt to original values).
   * 
   * **Feature: ai-assisted-intelligence, Property 3: Model Configuration Persistence Round-Trip**
   * **Validates: Requirements 2.4**
   */
  describe('Property 3: Model Configuration Persistence Round-Trip', () => {
    it('should preserve all fields when persisting and retrieving a model configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          modelConfigurationInputArb(),
          fc.uuid(),
          async (input, tenantId) => {
            // Track what was stored
            let storedItem: ModelConfiguration | null = null;

            mockDocumentClient.put.mockReturnValue({
              promise: jest.fn().mockImplementation(async () => {
                // Capture the stored item from the put call
                const putCall = mockDocumentClient.put.mock.calls[mockDocumentClient.put.mock.calls.length - 1][0];
                storedItem = putCall.Item as ModelConfiguration;
                return {};
              })
            } as any);

            mockDocumentClient.get.mockReturnValue({
              promise: jest.fn().mockImplementation(async () => {
                return { Item: storedItem };
              })
            } as any);

            // Create the configuration
            const created = await ModelConfigRepository.createConfiguration(tenantId, input);

            // Retrieve the configuration
            const retrieved = await ModelConfigRepository.getConfiguration(tenantId, created.configId);

            // Verify round-trip preserves all fields
            expect(retrieved).not.toBeNull();
            expect(retrieved!.configId).toBe(created.configId);
            expect(retrieved!.tenantId).toBe(tenantId);
            expect(retrieved!.providerId).toBe(input.providerId);
            expect(retrieved!.modelId).toBe(input.modelId);
            expect(retrieved!.modelName).toBe(input.modelName);
            expect(retrieved!.enabled).toBe(input.enabled ?? true);
            expect(retrieved!.credentials).toEqual(input.credentials);
            expect(retrieved!.costLimits).toEqual(input.costLimits);
            expect(retrieved!.rateLimits).toEqual(input.rateLimits);
            expect(retrieved!.priority).toBe(input.priority ?? 5);
            expect(retrieved!.createdAt).toBe(created.createdAt);
            expect(retrieved!.updatedAt).toBe(created.updatedAt);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all fields when updating a model configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          modelConfigurationArb(),
          fc.record({
            modelName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            enabled: fc.option(fc.boolean(), { nil: undefined }),
            priority: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined })
          }),
          async (originalConfig, updates) => {
            let storedItem: ModelConfiguration = { ...originalConfig };

            mockDocumentClient.get.mockReturnValue({
              promise: jest.fn().mockImplementation(async () => {
                return { Item: storedItem };
              })
            } as any);

            mockDocumentClient.put.mockReturnValue({
              promise: jest.fn().mockImplementation(async () => {
                const putCall = mockDocumentClient.put.mock.calls[mockDocumentClient.put.mock.calls.length - 1][0];
                storedItem = putCall.Item as ModelConfiguration;
                return {};
              })
            } as any);

            // Apply only defined updates
            const definedUpdates: Partial<ModelConfiguration> = {};
            if (updates.modelName !== undefined) definedUpdates.modelName = updates.modelName;
            if (updates.enabled !== undefined) definedUpdates.enabled = updates.enabled;
            if (updates.priority !== undefined) definedUpdates.priority = updates.priority;

            // Update the configuration
            const updated = await ModelConfigRepository.updateConfiguration(
              originalConfig.tenantId,
              originalConfig.configId,
              definedUpdates
            );

            // Retrieve the configuration
            const retrieved = await ModelConfigRepository.getConfiguration(
              originalConfig.tenantId,
              originalConfig.configId
            );

            // Verify unchanged fields are preserved
            expect(retrieved).not.toBeNull();
            expect(retrieved!.configId).toBe(originalConfig.configId);
            expect(retrieved!.tenantId).toBe(originalConfig.tenantId);
            expect(retrieved!.providerId).toBe(originalConfig.providerId);
            expect(retrieved!.modelId).toBe(originalConfig.modelId);
            expect(retrieved!.credentials).toEqual(originalConfig.credentials);
            expect(retrieved!.costLimits).toEqual(originalConfig.costLimits);
            expect(retrieved!.rateLimits).toEqual(originalConfig.rateLimits);
            expect(retrieved!.createdAt).toBe(originalConfig.createdAt);

            // Verify updated fields
            if (updates.modelName !== undefined) {
              expect(retrieved!.modelName).toBe(updates.modelName);
            } else {
              expect(retrieved!.modelName).toBe(originalConfig.modelName);
            }
            if (updates.enabled !== undefined) {
              expect(retrieved!.enabled).toBe(updates.enabled);
            } else {
              expect(retrieved!.enabled).toBe(originalConfig.enabled);
            }
            if (updates.priority !== undefined) {
              expect(retrieved!.priority).toBe(updates.priority);
            } else {
              expect(retrieved!.priority).toBe(originalConfig.priority);
            }

            // Verify updatedAt changed
            expect(retrieved!.updatedAt).not.toBe(originalConfig.updatedAt);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('listConfigurations', () => {
    it('should list configurations for a tenant', async () => {
      const mockConfigs: ModelConfiguration[] = [
        {
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
            lastResetDate: '2024-01-01T00:00:00.000Z'
          },
          rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
          priority: 5,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ];

      mockDocumentClient.query.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Items: mockConfigs })
      } as any);

      const result = await ModelConfigRepository.listConfigurations({ tenantId: 'tenant-1' });
      expect(result.items).toEqual(mockConfigs);
    });
  });

  describe('enableConfiguration / disableConfiguration', () => {
    it('should enable a configuration', async () => {
      const mockConfig: ModelConfiguration = {
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
          currentDailyCostUsd: 10,
          currentMonthlyCostUsd: 50,
          lastResetDate: '2024-01-01T00:00:00.000Z'
        },
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        priority: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      mockDocumentClient.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Item: mockConfig })
      } as any);

      mockDocumentClient.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);

      const result = await ModelConfigRepository.enableConfiguration('tenant-1', 'config-1');
      expect(result.enabled).toBe(true);
    });

    it('should disable a configuration', async () => {
      const mockConfig: ModelConfiguration = {
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
          lastResetDate: '2024-01-01T00:00:00.000Z'
        },
        rateLimits: { requestsPerMinute: 60, tokensPerMinute: 10000, requestsPerDay: 1000 },
        priority: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      mockDocumentClient.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Item: mockConfig })
      } as any);

      mockDocumentClient.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);

      const result = await ModelConfigRepository.disableConfiguration('tenant-1', 'config-1');
      expect(result.enabled).toBe(false);
    });
  });
});
