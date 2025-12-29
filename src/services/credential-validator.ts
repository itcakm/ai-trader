/**
 * Credential Validator Service - validates AI provider API credentials
 * 
 * This service validates API credentials before saving model configurations.
 * It uses the provider adapters to perform health checks and verify that
 * the credentials are valid and the provider is accessible.
 * 
 * Requirements: 2.1
 */

import { ProviderType } from '../types/provider';
import { ValidationResult, EncryptedCredentials } from '../types/model-config';
import { AIAdapterFactory, AdapterFactoryConfig } from '../adapters/ai/adapter-factory';
import { ProviderRepository } from '../repositories/provider';

/**
 * Input for credential validation
 */
export interface CredentialValidationInput {
  providerId: string;
  apiKey: string;
  modelId?: string;
}

/**
 * Extended validation result with additional details
 */
export interface CredentialValidationResult extends ValidationResult {
  latencyMs?: number;
  quotaRemaining?: number;
  providerType?: ProviderType;
}

/**
 * Error thrown when credential validation fails
 */
export class CredentialValidationError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly providerType?: ProviderType
  ) {
    super(message);
    this.name = 'CredentialValidationError';
  }
}

/**
 * Credential Validator Service
 * 
 * Validates API credentials by:
 * 1. Looking up the provider configuration
 * 2. Creating an adapter with the provided credentials
 * 3. Performing a health check to verify connectivity
 * 4. Optionally checking remaining quota
 */
export const CredentialValidator = {
  /**
   * Validate API credentials for a provider
   * 
   * @param input - The credential validation input
   * @returns Validation result with details
   */
  async validateCredentials(input: CredentialValidationInput): Promise<CredentialValidationResult> {
    const { providerId, apiKey, modelId } = input;

    // Look up the provider
    const provider = await ProviderRepository.getProvider(providerId);
    if (!provider) {
      return {
        valid: false,
        errorMessage: `Provider not found: ${providerId}`
      };
    }

    // Check if provider type is supported
    if (!AIAdapterFactory.isSupported(provider.type)) {
      return {
        valid: false,
        errorMessage: `Provider type not supported: ${provider.type}`,
        providerType: provider.type
      };
    }

    // Check if provider is active
    if (provider.status !== 'ACTIVE') {
      return {
        valid: false,
        errorMessage: `Provider is not active: ${provider.status}`,
        providerType: provider.type
      };
    }

    // Validate model ID if provided
    if (modelId && !provider.supportedModels.includes(modelId)) {
      return {
        valid: false,
        errorMessage: `Model not supported by provider: ${modelId}`,
        providerType: provider.type
      };
    }

    try {
      // Create adapter with the provided credentials
      const adapter = AIAdapterFactory.createAdapter({
        providerType: provider.type,
        apiKey,
        apiEndpoint: provider.apiEndpoint,
        modelId: modelId || provider.supportedModels[0]
      } as AdapterFactoryConfig);

      // Perform health check
      const healthResult = await adapter.healthCheck();

      if (!healthResult.healthy) {
        return {
          valid: false,
          errorMessage: healthResult.errorMessage || 'Health check failed',
          latencyMs: healthResult.latencyMs,
          providerType: provider.type
        };
      }

      // Get remaining quota
      let quotaRemaining: number | undefined;
      try {
        const quotaStatus = await adapter.getRemainingQuota();
        quotaRemaining = quotaStatus.requestsRemaining;
      } catch {
        // Quota check is optional, don't fail validation
      }

      return {
        valid: true,
        latencyMs: healthResult.latencyMs,
        quotaRemaining,
        providerType: provider.type
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during validation';
      return {
        valid: false,
        errorMessage: `Credential validation failed: ${errorMessage}`,
        providerType: provider.type
      };
    }
  },

  /**
   * Validate credentials format without making API calls
   * 
   * This performs basic format validation on the API key without
   * actually calling the provider's API.
   * 
   * @param apiKey - The API key to validate
   * @param providerType - The provider type
   * @returns Validation result
   */
  validateCredentialFormat(apiKey: string, providerType: ProviderType): ValidationResult {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        valid: false,
        errorMessage: 'API key cannot be empty'
      };
    }

    // Provider-specific format validation
    switch (providerType) {
      case 'OPENAI':
        // OpenAI keys start with 'sk-'
        if (!apiKey.startsWith('sk-')) {
          return {
            valid: false,
            errorMessage: 'OpenAI API key should start with "sk-"'
          };
        }
        if (apiKey.length < 20) {
          return {
            valid: false,
            errorMessage: 'OpenAI API key appears to be too short'
          };
        }
        break;

      case 'GEMINI':
        // Gemini keys are typically 39 characters
        if (apiKey.length < 30) {
          return {
            valid: false,
            errorMessage: 'Gemini API key appears to be too short'
          };
        }
        break;

      case 'DEEPSEEK':
        // DeepSeek keys start with 'sk-'
        if (!apiKey.startsWith('sk-')) {
          return {
            valid: false,
            errorMessage: 'DeepSeek API key should start with "sk-"'
          };
        }
        break;

      case 'ANTHROPIC':
        // Anthropic keys start with 'sk-ant-'
        if (!apiKey.startsWith('sk-ant-')) {
          return {
            valid: false,
            errorMessage: 'Anthropic API key should start with "sk-ant-"'
          };
        }
        break;

      case 'CUSTOM':
        // No specific format validation for custom providers
        break;
    }

    return { valid: true };
  },

  /**
   * Validate encrypted credentials
   * 
   * Validates that encrypted credentials have the required structure.
   * 
   * @param credentials - The encrypted credentials to validate
   * @returns Validation result
   */
  validateEncryptedCredentials(credentials: EncryptedCredentials): ValidationResult {
    if (!credentials) {
      return {
        valid: false,
        errorMessage: 'Credentials are required'
      };
    }

    if (!credentials.encryptedApiKey || credentials.encryptedApiKey.trim().length === 0) {
      return {
        valid: false,
        errorMessage: 'Encrypted API key is required'
      };
    }

    if (!credentials.keyId || credentials.keyId.trim().length === 0) {
      return {
        valid: false,
        errorMessage: 'KMS key ID is required'
      };
    }

    // Validate keyId format (should be a UUID or ARN)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const arnRegex = /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]+$/i;
    
    if (!uuidRegex.test(credentials.keyId) && !arnRegex.test(credentials.keyId)) {
      return {
        valid: false,
        errorMessage: 'KMS key ID must be a valid UUID or ARN'
      };
    }

    return { valid: true };
  },

  /**
   * Check if a provider supports a specific model
   * 
   * @param providerId - The provider ID
   * @param modelId - The model ID to check
   * @returns True if the model is supported
   */
  async isModelSupported(providerId: string, modelId: string): Promise<boolean> {
    const provider = await ProviderRepository.getProvider(providerId);
    if (!provider) {
      return false;
    }
    return provider.supportedModels.includes(modelId);
  }
};
