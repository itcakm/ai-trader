/**
 * Model Configuration Service - manages AI model configurations for tenants
 * 
 * This service provides business logic for managing model configurations,
 * including filtering available models based on provider status and tenant
 * enablement, validating credentials, and enforcing cost limits.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.5
 */

import { ModelConfiguration, ModelConfigurationInput, ValidationResult, CostLimits } from '../types/model-config';
import { AIProvider, ProviderStatus } from '../types/provider';
import { ModelConfigRepository } from '../repositories/model-config';
import { ProviderRepository } from '../repositories/provider';
import { CredentialValidator, CredentialValidationInput, CredentialValidationResult } from './credential-validator';

/**
 * Available model information returned to clients
 */
export interface AvailableModel {
  configId: string;
  providerId: string;
  providerName: string;
  providerType: string;
  modelId: string;
  modelName: string;
  priority: number;
  costLimits: CostLimits;
}

/**
 * Options for listing available models
 */
export interface ListAvailableModelsOptions {
  providerType?: string;
  minPriority?: number;
}

/**
 * Cost recording input
 */
export interface RecordCostInput {
  tenantId: string;
  configId: string;
  costUsd: number;
}

/**
 * Error thrown when cost limit is exceeded
 */
export class CostLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly tenantId: string,
    public readonly configId: string,
    public readonly limitType: 'daily' | 'monthly',
    public readonly currentCost: number,
    public readonly maxCost: number
  ) {
    super(message);
    this.name = 'CostLimitExceededError';
  }
}

/**
 * Model Configuration Service
 */
export const ModelConfigService = {
  /**
   * Configure a new AI model for a tenant
   * 
   * Validates credentials before saving the configuration.
   * 
   * @param tenantId - The tenant identifier
   * @param input - The model configuration input
   * @param apiKey - The API key for validation (not stored)
   * @returns The created model configuration
   * 
   * Requirements: 2.1
   */
  async configureModel(
    tenantId: string,
    input: ModelConfigurationInput,
    apiKey?: string
  ): Promise<ModelConfiguration> {
    // Validate credentials if API key provided
    if (apiKey) {
      const validationResult = await CredentialValidator.validateCredentials({
        providerId: input.providerId,
        apiKey,
        modelId: input.modelId
      });

      if (!validationResult.valid) {
        throw new Error(`Credential validation failed: ${validationResult.errorMessage}`);
      }
    }

    // Validate encrypted credentials structure
    const credentialResult = CredentialValidator.validateEncryptedCredentials(input.credentials);
    if (!credentialResult.valid) {
      throw new Error(`Invalid credentials: ${credentialResult.errorMessage}`);
    }

    // Create the configuration
    return ModelConfigRepository.createConfiguration(tenantId, input);
  },

  /**
   * Get a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The model configuration or null
   */
  async getConfiguration(tenantId: string, configId: string): Promise<ModelConfiguration | null> {
    return ModelConfigRepository.getConfiguration(tenantId, configId);
  },

  /**
   * List all model configurations for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns List of model configurations
   */
  async listConfigurations(tenantId: string): Promise<ModelConfiguration[]> {
    const result = await ModelConfigRepository.listConfigurations({ tenantId });
    return result.items;
  },

  /**
   * Enable a model for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The updated model configuration
   * 
   * Requirements: 2.2
   */
  async enableModel(tenantId: string, configId: string): Promise<ModelConfiguration> {
    return ModelConfigRepository.enableConfiguration(tenantId, configId);
  },

  /**
   * Disable a model for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The updated model configuration
   * 
   * Requirements: 2.2
   */
  async disableModel(tenantId: string, configId: string): Promise<ModelConfiguration> {
    return ModelConfigRepository.disableConfiguration(tenantId, configId);
  },

  /**
   * Validate credentials for a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @param apiKey - The API key to validate
   * @returns Validation result
   * 
   * Requirements: 2.1
   */
  async validateCredentials(
    tenantId: string,
    configId: string,
    apiKey: string
  ): Promise<CredentialValidationResult> {
    const config = await ModelConfigRepository.getConfiguration(tenantId, configId);
    if (!config) {
      return {
        valid: false,
        errorMessage: `Configuration not found: ${configId}`
      };
    }

    return CredentialValidator.validateCredentials({
      providerId: config.providerId,
      apiKey,
      modelId: config.modelId
    });
  },

  /**
   * List available models for a tenant
   * 
   * Returns only models where:
   * - The model is enabled for the tenant
   * - The model's provider has status ACTIVE
   * 
   * @param tenantId - The tenant identifier
   * @param options - Optional filtering options
   * @returns List of available models
   * 
   * Requirements: 2.2, 2.3
   */
  async listAvailableModels(
    tenantId: string,
    options?: ListAvailableModelsOptions
  ): Promise<AvailableModel[]> {
    // Get all enabled configurations for the tenant
    const enabledConfigs = await ModelConfigRepository.getEnabledConfigurations(tenantId);

    // Get all active providers
    const activeProviders = await ProviderRepository.getActiveProviders();
    const activeProviderMap = new Map<string, AIProvider>(
      activeProviders.map(p => [p.providerId, p])
    );

    // Filter configurations to only those with active providers
    const availableModels: AvailableModel[] = [];

    for (const config of enabledConfigs) {
      const provider = activeProviderMap.get(config.providerId);
      
      // Skip if provider is not active
      if (!provider) {
        continue;
      }

      // Apply optional filters
      if (options?.providerType && provider.type !== options.providerType) {
        continue;
      }

      if (options?.minPriority && config.priority < options.minPriority) {
        continue;
      }

      availableModels.push({
        configId: config.configId,
        providerId: config.providerId,
        providerName: provider.name,
        providerType: provider.type,
        modelId: config.modelId,
        modelName: config.modelName,
        priority: config.priority,
        costLimits: config.costLimits
      });
    }

    // Sort by priority (higher first)
    return availableModels.sort((a, b) => b.priority - a.priority);
  },

  /**
   * Check if a model is available for use
   * 
   * A model is available if:
   * - It exists and is enabled for the tenant
   * - Its provider is active
   * - It hasn't exceeded cost limits
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns True if the model is available
   */
  async isModelAvailable(tenantId: string, configId: string): Promise<boolean> {
    const config = await ModelConfigRepository.getConfiguration(tenantId, configId);
    if (!config || !config.enabled) {
      return false;
    }

    // Check provider status
    const provider = await ProviderRepository.getProvider(config.providerId);
    if (!provider || provider.status !== 'ACTIVE') {
      return false;
    }

    // Check cost limits
    if (this.isCostLimitExceeded(config.costLimits)) {
      return false;
    }

    return true;
  },

  /**
   * Check if cost limit is exceeded
   * 
   * @param costLimits - The cost limits to check
   * @returns True if any cost limit is exceeded
   * 
   * Requirements: 2.5
   */
  isCostLimitExceeded(costLimits: CostLimits): boolean {
    return (
      costLimits.currentDailyCostUsd >= costLimits.maxDailyCostUsd ||
      costLimits.currentMonthlyCostUsd >= costLimits.maxMonthlyCostUsd
    );
  },

  /**
   * Check cost limit before making a request
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @throws CostLimitExceededError if limit is exceeded
   * 
   * Requirements: 2.5
   */
  async checkCostLimit(tenantId: string, configId: string): Promise<void> {
    const config = await ModelConfigRepository.getConfiguration(tenantId, configId);
    if (!config) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    const { costLimits } = config;

    if (costLimits.currentDailyCostUsd >= costLimits.maxDailyCostUsd) {
      throw new CostLimitExceededError(
        `Daily cost limit exceeded for model ${config.modelName}`,
        tenantId,
        configId,
        'daily',
        costLimits.currentDailyCostUsd,
        costLimits.maxDailyCostUsd
      );
    }

    if (costLimits.currentMonthlyCostUsd >= costLimits.maxMonthlyCostUsd) {
      throw new CostLimitExceededError(
        `Monthly cost limit exceeded for model ${config.modelName}`,
        tenantId,
        configId,
        'monthly',
        costLimits.currentMonthlyCostUsd,
        costLimits.maxMonthlyCostUsd
      );
    }
  },

  /**
   * Record cost for a model usage
   * 
   * @param input - The cost recording input
   * @returns The updated model configuration
   * 
   * Requirements: 2.5
   */
  async recordCost(input: RecordCostInput): Promise<ModelConfiguration> {
    const { tenantId, configId, costUsd } = input;

    const config = await ModelConfigRepository.getConfiguration(tenantId, configId);
    if (!config) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    // Check if we need to reset daily cost
    const now = new Date();
    const lastReset = new Date(config.costLimits.lastResetDate);
    const shouldResetDaily = !this.isSameDay(now, lastReset);
    const shouldResetMonthly = !this.isSameMonth(now, lastReset);

    const updatedCostLimits: CostLimits = {
      ...config.costLimits,
      currentDailyCostUsd: shouldResetDaily 
        ? costUsd 
        : config.costLimits.currentDailyCostUsd + costUsd,
      currentMonthlyCostUsd: shouldResetMonthly 
        ? costUsd 
        : config.costLimits.currentMonthlyCostUsd + costUsd,
      lastResetDate: shouldResetDaily ? now.toISOString() : config.costLimits.lastResetDate
    };

    return ModelConfigRepository.updateCostLimits(tenantId, configId, updatedCostLimits);
  },

  /**
   * Reset daily cost for a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The updated model configuration
   * 
   * Requirements: 2.5
   */
  async resetDailyCost(tenantId: string, configId: string): Promise<ModelConfiguration> {
    const config = await ModelConfigRepository.getConfiguration(tenantId, configId);
    if (!config) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    const updatedCostLimits: CostLimits = {
      ...config.costLimits,
      currentDailyCostUsd: 0,
      lastResetDate: new Date().toISOString()
    };

    return ModelConfigRepository.updateCostLimits(tenantId, configId, updatedCostLimits);
  },

  /**
   * Reset monthly cost for a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The updated model configuration
   */
  async resetMonthlyCost(tenantId: string, configId: string): Promise<ModelConfiguration> {
    const config = await ModelConfigRepository.getConfiguration(tenantId, configId);
    if (!config) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    const updatedCostLimits: CostLimits = {
      ...config.costLimits,
      currentDailyCostUsd: 0,
      currentMonthlyCostUsd: 0,
      lastResetDate: new Date().toISOString()
    };

    return ModelConfigRepository.updateCostLimits(tenantId, configId, updatedCostLimits);
  },

  /**
   * Check if two dates are on the same day
   */
  isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  },

  /**
   * Check if two dates are in the same month
   */
  isSameMonth(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth()
    );
  }
};
