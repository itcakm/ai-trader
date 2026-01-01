/**
 * AI Adapter Factory - creates appropriate adapter instances based on provider type
 * 
 * This factory implements the Factory pattern to create AI provider adapters
 * based on the provider type. It abstracts the creation logic and ensures
 * consistent adapter instantiation.
 * 
 * Requirements: 1.3
 */

import { ProviderType } from '../../types/provider';
import { AIProviderAdapter } from '../../types/adapter';
import { GeminiAdapter, GeminiAdapterConfig } from './gemini-adapter';
import { OpenAIAdapter, OpenAIAdapterConfig } from './openai-adapter';
import { DeepSeekAdapter, DeepSeekAdapterConfig } from './deepseek-adapter';
import { AIAdapterConfig } from './base-ai-adapter';

/**
 * Configuration for creating an adapter
 */
export type AdapterFactoryConfig = 
  | (GeminiAdapterConfig & { providerType: 'GEMINI' })
  | (OpenAIAdapterConfig & { providerType: 'OPENAI' })
  | (DeepSeekAdapterConfig & { providerType: 'DEEPSEEK' })
  | (AIAdapterConfig & { providerType: 'ANTHROPIC' | 'CUSTOM' });

/**
 * Error thrown when adapter creation fails
 */
export class AdapterFactoryError extends Error {
  constructor(
    message: string,
    public readonly providerType: ProviderType
  ) {
    super(message);
    this.name = 'AdapterFactoryError';
  }
}

/**
 * Default API endpoints for each provider
 */
const DEFAULT_ENDPOINTS: Record<ProviderType, string> = {
  GEMINI: 'https://generativelanguage.googleapis.com',
  OPENAI: 'https://api.openai.com',
  DEEPSEEK: 'https://api.deepseek.com',
  ANTHROPIC: 'https://api.anthropic.com',
  CUSTOM: '',
};

/**
 * Default model IDs for each provider
 */
const DEFAULT_MODELS: Record<ProviderType, string> = {
  GEMINI: 'gemini-1.5-pro',
  OPENAI: 'gpt-4-turbo',
  DEEPSEEK: 'deepseek-chat',
  ANTHROPIC: 'claude-3-opus',
  CUSTOM: '',
};

/**
 * AI Adapter Factory
 * 
 * Creates AI provider adapters based on provider type and configuration.
 */
export class AIAdapterFactory {
  private static adapters: Map<string, AIProviderAdapter> = new Map();

  /**
   * Get an adapter for the specified provider type
   * 
   * @param config - Configuration for the adapter
   * @returns The appropriate AIProviderAdapter instance
   * @throws AdapterFactoryError if the provider type is not supported
   */
  static getAdapter(config: AdapterFactoryConfig): AIProviderAdapter {
    const cacheKey = this.getCacheKey(config);
    
    // Return cached adapter if available
    const cached = this.adapters.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Create new adapter
    const adapter = this.createAdapter(config);
    this.adapters.set(cacheKey, adapter);
    
    return adapter;
  }

  /**
   * Create a new adapter instance (without caching)
   * 
   * @param config - Configuration for the adapter
   * @returns A new AIProviderAdapter instance
   */
  static createAdapter(config: AdapterFactoryConfig): AIProviderAdapter {
    const { providerType, apiEndpoint, modelId, ...restConfig } = config;

    // Apply defaults only if not provided
    const configWithDefaults = {
      apiEndpoint: apiEndpoint ?? DEFAULT_ENDPOINTS[providerType],
      modelId: modelId ?? DEFAULT_MODELS[providerType],
      ...restConfig,
    };

    switch (providerType) {
      case 'GEMINI':
        return new GeminiAdapter(configWithDefaults as GeminiAdapterConfig);
      
      case 'OPENAI':
        return new OpenAIAdapter(configWithDefaults as OpenAIAdapterConfig);
      
      case 'DEEPSEEK':
        return new DeepSeekAdapter(configWithDefaults as DeepSeekAdapterConfig);
      
      case 'ANTHROPIC':
        throw new AdapterFactoryError(
          'Anthropic adapter is not yet implemented',
          providerType
        );
      
      case 'CUSTOM':
        throw new AdapterFactoryError(
          'Custom adapters must be registered separately',
          providerType
        );
      
      default:
        throw new AdapterFactoryError(
          `Unsupported provider type: ${providerType}`,
          providerType
        );
    }
  }

  /**
   * Check if a provider type is supported
   * 
   * @param providerType - The provider type to check
   * @returns true if the provider type is supported
   */
  static isSupported(providerType: ProviderType): boolean {
    return ['GEMINI', 'OPENAI', 'DEEPSEEK'].includes(providerType);
  }

  /**
   * Get list of supported provider types
   * 
   * @returns Array of supported provider types
   */
  static getSupportedProviders(): ProviderType[] {
    return ['GEMINI', 'OPENAI', 'DEEPSEEK'];
  }

  /**
   * Get default endpoint for a provider type
   * 
   * @param providerType - The provider type
   * @returns The default API endpoint
   */
  static getDefaultEndpoint(providerType: ProviderType): string {
    return DEFAULT_ENDPOINTS[providerType];
  }

  /**
   * Get default model ID for a provider type
   * 
   * @param providerType - The provider type
   * @returns The default model ID
   */
  static getDefaultModel(providerType: ProviderType): string {
    return DEFAULT_MODELS[providerType];
  }

  /**
   * Clear the adapter cache
   */
  static clearCache(): void {
    this.adapters.clear();
  }

  /**
   * Remove a specific adapter from cache
   * 
   * @param config - Configuration identifying the adapter to remove
   */
  static removeFromCache(config: AdapterFactoryConfig): void {
    const cacheKey = this.getCacheKey(config);
    this.adapters.delete(cacheKey);
  }

  /**
   * Generate a cache key for an adapter configuration
   */
  private static getCacheKey(config: AdapterFactoryConfig): string {
    return `${config.providerType}:${config.apiKey}:${config.modelId ?? DEFAULT_MODELS[config.providerType]}`;
  }
}

/**
 * Convenience function to get an adapter
 * 
 * @param providerType - The provider type
 * @param apiKey - The API key
 * @param options - Additional options
 * @returns The appropriate AIProviderAdapter instance
 */
export function getAdapter(
  providerType: ProviderType,
  apiKey: string,
  options?: Partial<Omit<AdapterFactoryConfig, 'providerType' | 'apiKey'>>
): AIProviderAdapter {
  const { apiEndpoint, modelId, ...restOptions } = options ?? {};
  return AIAdapterFactory.getAdapter({
    providerType,
    apiKey,
    apiEndpoint: apiEndpoint ?? DEFAULT_ENDPOINTS[providerType],
    modelId: modelId ?? DEFAULT_MODELS[providerType],
    ...restOptions,
  } as AdapterFactoryConfig);
}
