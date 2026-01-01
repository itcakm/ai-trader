/**
 * Property-based tests for AI Adapter Factory and Interface Compliance
 * 
 * **Property 1: Provider Adapter Interface Compliance**
 * *For any* registered AI_Provider, the system SHALL have a corresponding Provider_Adapter
 * that implements all methods of the AIProviderAdapter interface (classifyMarketRegime,
 * generateExplanation, suggestParameters, healthCheck, getRemainingQuota).
 * 
 * **Validates: Requirements 1.3**
 */

import * as fc from 'fast-check';
import { ProviderType } from '../../types/provider';
import { AIProviderAdapter } from '../../types/adapter';
import { AIAdapterFactory, getAdapter } from './adapter-factory';
import { GeminiAdapter } from './gemini-adapter';
import { OpenAIAdapter } from './openai-adapter';
import { DeepSeekAdapter } from './deepseek-adapter';

/**
 * Generator for supported provider types
 */
const supportedProviderTypeArb = (): fc.Arbitrary<ProviderType> =>
  fc.constantFrom('GEMINI', 'OPENAI', 'DEEPSEEK');

/**
 * Generator for API keys
 */
const apiKeyArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length >= 10);

/**
 * Generator for model IDs
 */
const modelIdArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-3.5-turbo',
    'deepseek-chat',
    'deepseek-coder'
  );

/**
 * Generator for API endpoints
 */
const apiEndpointArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'https://generativelanguage.googleapis.com',
    'https://api.openai.com',
    'https://api.deepseek.com',
    'https://custom-api.example.com'
  );

describe('AI Adapter Factory', () => {
  beforeEach(() => {
    AIAdapterFactory.clearCache();
  });

  describe('Property 1: Provider Adapter Interface Compliance', () => {
    /**
     * Feature: ai-assisted-intelligence, Property 1: Provider Adapter Interface Compliance
     * 
     * For any supported provider type, the factory SHALL create an adapter that
     * implements all required methods of the AIProviderAdapter interface.
     */
    it('should create adapters that implement all AIProviderAdapter methods for any supported provider', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          apiKeyArb(),
          (providerType, apiKey) => {
            const adapter = AIAdapterFactory.createAdapter({
              providerType,
              apiKey,
              apiEndpoint: AIAdapterFactory.getDefaultEndpoint(providerType),
              modelId: AIAdapterFactory.getDefaultModel(providerType),
            });

            // Verify adapter is created
            expect(adapter).toBeDefined();

            // Verify all required interface methods exist and are functions
            expect(typeof adapter.classifyMarketRegime).toBe('function');
            expect(typeof adapter.generateExplanation).toBe('function');
            expect(typeof adapter.suggestParameters).toBe('function');
            expect(typeof adapter.healthCheck).toBe('function');
            expect(typeof adapter.getRemainingQuota).toBe('function');

            // Verify providerType property
            expect(adapter.providerType).toBe(providerType);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: ai-assisted-intelligence, Property 1: Provider Adapter Interface Compliance
     * 
     * For any supported provider type, the created adapter SHALL be an instance
     * of the correct adapter class.
     */
    it('should create the correct adapter class for each provider type', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          apiKeyArb(),
          (providerType, apiKey) => {
            const adapter = AIAdapterFactory.createAdapter({
              providerType,
              apiKey,
              apiEndpoint: AIAdapterFactory.getDefaultEndpoint(providerType),
              modelId: AIAdapterFactory.getDefaultModel(providerType),
            });

            switch (providerType) {
              case 'GEMINI':
                expect(adapter).toBeInstanceOf(GeminiAdapter);
                break;
              case 'OPENAI':
                expect(adapter).toBeInstanceOf(OpenAIAdapter);
                break;
              case 'DEEPSEEK':
                expect(adapter).toBeInstanceOf(DeepSeekAdapter);
                break;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: ai-assisted-intelligence, Property 1: Provider Adapter Interface Compliance
     * 
     * For any adapter configuration, the adapter SHALL preserve the configured
     * provider type in its providerType property.
     */
    it('should preserve provider type in created adapters', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          apiKeyArb(),
          modelIdArb(),
          apiEndpointArb(),
          (providerType, apiKey, modelId, apiEndpoint) => {
            const adapter = AIAdapterFactory.createAdapter({
              providerType,
              apiKey,
              apiEndpoint,
              modelId,
            });

            expect(adapter.providerType).toBe(providerType);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Factory Behavior', () => {
    it('should cache adapters with the same configuration', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          apiKeyArb(),
          (providerType, apiKey) => {
            const config = {
              providerType,
              apiKey,
              apiEndpoint: AIAdapterFactory.getDefaultEndpoint(providerType),
              modelId: AIAdapterFactory.getDefaultModel(providerType),
            };

            const adapter1 = AIAdapterFactory.getAdapter(config);
            const adapter2 = AIAdapterFactory.getAdapter(config);

            // Same configuration should return the same cached instance
            expect(adapter1).toBe(adapter2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create different adapters for different configurations', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          apiKeyArb(),
          apiKeyArb(),
          (providerType, apiKey1, apiKey2) => {
            // Skip if keys are the same
            fc.pre(apiKey1 !== apiKey2);

            const adapter1 = AIAdapterFactory.createAdapter({
              providerType,
              apiKey: apiKey1,
              apiEndpoint: AIAdapterFactory.getDefaultEndpoint(providerType),
              modelId: AIAdapterFactory.getDefaultModel(providerType),
            });

            const adapter2 = AIAdapterFactory.createAdapter({
              providerType,
              apiKey: apiKey2,
              apiEndpoint: AIAdapterFactory.getDefaultEndpoint(providerType),
              modelId: AIAdapterFactory.getDefaultModel(providerType),
            });

            // Different configurations should create different instances
            expect(adapter1).not.toBe(adapter2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly report supported providers', () => {
      const supportedProviders = AIAdapterFactory.getSupportedProviders();
      
      expect(supportedProviders).toContain('GEMINI');
      expect(supportedProviders).toContain('OPENAI');
      expect(supportedProviders).toContain('DEEPSEEK');
      expect(supportedProviders).not.toContain('ANTHROPIC');
      expect(supportedProviders).not.toContain('CUSTOM');
    });

    it('should throw for unsupported provider types', () => {
      const unsupportedTypes: ProviderType[] = ['ANTHROPIC', 'CUSTOM'];
      
      for (const providerType of unsupportedTypes) {
        expect(() => {
          AIAdapterFactory.createAdapter({
            providerType,
            apiKey: 'test-key',
            apiEndpoint: 'https://api.example.com',
            modelId: 'test-model',
          });
        }).toThrow();
      }
    });
  });

  describe('Convenience Function', () => {
    it('should create adapters using the getAdapter convenience function', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          apiKeyArb(),
          (providerType, apiKey) => {
            const adapter = getAdapter(providerType, apiKey);

            expect(adapter).toBeDefined();
            expect(adapter.providerType).toBe(providerType);
            expect(typeof adapter.classifyMarketRegime).toBe('function');
            expect(typeof adapter.generateExplanation).toBe('function');
            expect(typeof adapter.suggestParameters).toBe('function');
            expect(typeof adapter.healthCheck).toBe('function');
            expect(typeof adapter.getRemainingQuota).toBe('function');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Default Values', () => {
    it('should provide correct default endpoints for all supported providers', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          (providerType) => {
            const endpoint = AIAdapterFactory.getDefaultEndpoint(providerType);
            
            expect(endpoint).toBeDefined();
            expect(endpoint.length).toBeGreaterThan(0);
            expect(endpoint.startsWith('https://')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide correct default models for all supported providers', () => {
      fc.assert(
        fc.property(
          supportedProviderTypeArb(),
          (providerType) => {
            const model = AIAdapterFactory.getDefaultModel(providerType);
            
            expect(model).toBeDefined();
            expect(model.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
