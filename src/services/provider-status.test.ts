/**
 * Property-based tests for Provider Status Management Service
 * Feature: ai-assisted-intelligence, Property 2: Provider Status Management
 * Validates: Requirements 1.4
 */

import * as fc from 'fast-check';
import { ProviderStatusService } from './provider-status';
import { ProviderRepository } from '../repositories/provider';
import { AIProvider, ProviderStatus, RateLimitConfig } from '../types/provider';
import {
  providerTypeArb,
  aiProviderNameArb,
  aiApiEndpointArb,
  aiAuthMethodArb,
  supportedModelsArb,
  aiRateLimitConfigArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/provider');

const mockedProviderRepository = ProviderRepository as jest.Mocked<typeof ProviderRepository>;

// Generator for provider ID
const providerIdArb = (): fc.Arbitrary<string> => fc.uuid();

// Generator for AIProvider with specific status
const aiProviderWithStatusArb = (status: ProviderStatus): fc.Arbitrary<AIProvider> =>
  fc.record({
    providerId: fc.uuid(),
    type: providerTypeArb(),
    name: aiProviderNameArb(),
    apiEndpoint: aiApiEndpointArb(),
    authMethod: aiAuthMethodArb(),
    supportedModels: supportedModelsArb(),
    status: fc.constant(status),
    rateLimits: aiRateLimitConfigArb(),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });

// Generator for AIProvider with any status
const aiProviderArb = (): fc.Arbitrary<AIProvider> =>
  fc.record({
    providerId: fc.uuid(),
    type: providerTypeArb(),
    name: aiProviderNameArb(),
    apiEndpoint: aiApiEndpointArb(),
    authMethod: aiAuthMethodArb(),
    supportedModels: supportedModelsArb(),
    status: fc.constantFrom('ACTIVE', 'INACTIVE', 'RATE_LIMITED', 'ERROR') as fc.Arbitrary<ProviderStatus>,
    rateLimits: aiRateLimitConfigArb(),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });

describe('ProviderStatusService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ProviderStatusService.clearAllTrackers();
  });

  describe('Property 2: Provider Status Management', () => {
    /**
     * Property 2: Provider Status Management
     * For any AI_Provider marked as INACTIVE, all requests to that provider
     * SHALL be rejected with an appropriate error, and no API calls SHALL
     * be made to the provider's endpoint.
     * Validates: Requirements 1.4
     */

    it('should reject requests for INACTIVE providers', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderWithStatusArb('INACTIVE'),
          async (provider) => {
            mockedProviderRepository.getProvider.mockResolvedValue(provider);

            const result = await ProviderStatusService.canAcceptRequest(provider.providerId);

            expect(result.canAccept).toBe(false);
            expect(result.reason).toBe('Provider is inactive');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests for ERROR status providers', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderWithStatusArb('ERROR'),
          async (provider) => {
            mockedProviderRepository.getProvider.mockResolvedValue(provider);

            const result = await ProviderStatusService.canAcceptRequest(provider.providerId);

            expect(result.canAccept).toBe(false);
            expect(result.reason).toBe('Provider is in error state');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests for RATE_LIMITED providers', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderWithStatusArb('RATE_LIMITED'),
          async (provider) => {
            mockedProviderRepository.getProvider.mockResolvedValue(provider);

            const result = await ProviderStatusService.canAcceptRequest(provider.providerId);

            expect(result.canAccept).toBe(false);
            expect(result.reason).toBe('Provider is rate limited');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept requests for ACTIVE providers within rate limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderWithStatusArb('ACTIVE'),
          async (provider) => {
            mockedProviderRepository.getProvider.mockResolvedValue(provider);
            // Reset tracker to ensure we're within limits
            ProviderStatusService.resetRateLimitTracker(provider.providerId);

            const result = await ProviderStatusService.canAcceptRequest(provider.providerId);

            expect(result.canAccept).toBe(true);
            expect(result.reason).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for isActive when provider is INACTIVE', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderWithStatusArb('INACTIVE'),
          async (provider) => {
            mockedProviderRepository.getProvider.mockResolvedValue(provider);

            const isActive = await ProviderStatusService.isActive(provider.providerId);

            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true for isActive when provider is ACTIVE', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderWithStatusArb('ACTIVE'),
          async (provider) => {
            mockedProviderRepository.getProvider.mockResolvedValue(provider);

            const isActive = await ProviderStatusService.isActive(provider.providerId);

            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for isActive when provider does not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerIdArb(),
          async (providerId) => {
            mockedProviderRepository.getProvider.mockResolvedValue(null);

            const isActive = await ProviderStatusService.isActive(providerId);

            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests for non-existent providers', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerIdArb(),
          async (providerId) => {
            mockedProviderRepository.getProvider.mockResolvedValue(null);

            const result = await ProviderStatusService.canAcceptRequest(providerId);

            expect(result.canAccept).toBe(false);
            expect(result.reason).toBe('Provider not found');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Rate Limit Tracking', () => {
    it('should accurately track requests per minute', () => {
      fc.assert(
        fc.property(
          providerIdArb(),
          fc.integer({ min: 1, max: 50 }),
          (providerId, requestCount) => {
            ProviderStatusService.resetRateLimitTracker(providerId);

            for (let i = 0; i < requestCount; i++) {
              ProviderStatusService.recordRequest(providerId, 0);
            }

            const tracker = ProviderStatusService.getRateLimitTracker(providerId);
            expect(tracker.requestsThisMinute).toBe(requestCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accurately track tokens per minute', () => {
      fc.assert(
        fc.property(
          providerIdArb(),
          fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 20 }),
          (providerId, tokenCounts) => {
            ProviderStatusService.resetRateLimitTracker(providerId);

            let totalTokens = 0;
            for (const tokens of tokenCounts) {
              ProviderStatusService.recordRequest(providerId, tokens);
              totalTokens += tokens;
            }

            const tracker = ProviderStatusService.getRateLimitTracker(providerId);
            expect(tracker.tokensThisMinute).toBe(totalTokens);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accurately track daily requests', () => {
      fc.assert(
        fc.property(
          providerIdArb(),
          fc.integer({ min: 1, max: 100 }),
          (providerId, requestCount) => {
            ProviderStatusService.resetRateLimitTracker(providerId);

            for (let i = 0; i < requestCount; i++) {
              ProviderStatusService.recordRequest(providerId, 0);
            }

            const tracker = ProviderStatusService.getRateLimitTracker(providerId);
            expect(tracker.requestsToday).toBe(requestCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect when rate limits are exceeded', () => {
      fc.assert(
        fc.property(
          providerIdArb(),
          aiRateLimitConfigArb(),
          (providerId, rateLimits) => {
            ProviderStatusService.resetRateLimitTracker(providerId);

            // Should be within limits initially
            expect(ProviderStatusService.isWithinRateLimits(providerId, rateLimits)).toBe(true);

            // Record requests up to the limit
            for (let i = 0; i < rateLimits.requestsPerMinute; i++) {
              ProviderStatusService.recordRequest(providerId, 0);
            }

            // Should now be at or over the limit
            expect(ProviderStatusService.isWithinRateLimits(providerId, rateLimits)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track rate limits independently per provider', () => {
      fc.assert(
        fc.property(
          fc.array(providerIdArb(), { minLength: 2, maxLength: 5 }),
          fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 5 }),
          (providerIds, requestCounts) => {
            const uniqueProviderIds = [...new Set(providerIds)];
            if (uniqueProviderIds.length < 2) return;

            // Clear all trackers
            ProviderStatusService.clearAllTrackers();

            // Record different request counts for each provider
            uniqueProviderIds.forEach((providerId, index) => {
              const count = requestCounts[index % requestCounts.length];
              for (let i = 0; i < count; i++) {
                ProviderStatusService.recordRequest(providerId, 0);
              }
            });

            // Verify each provider has correct count
            uniqueProviderIds.forEach((providerId, index) => {
              const expectedCount = requestCounts[index % requestCounts.length];
              const tracker = ProviderStatusService.getRateLimitTracker(providerId);
              expect(tracker.requestsThisMinute).toBe(expectedCount);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Status Transitions', () => {
    it('should correctly update provider status to INACTIVE', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderArb(),
          async (provider) => {
            const updatedProvider = { ...provider, status: 'INACTIVE' as ProviderStatus };
            mockedProviderRepository.updateProviderStatus.mockResolvedValue(updatedProvider);

            const result = await ProviderStatusService.markInactive(provider.providerId);

            expect(mockedProviderRepository.updateProviderStatus).toHaveBeenCalledWith(
              provider.providerId,
              'INACTIVE'
            );
            expect(result.status).toBe('INACTIVE');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly update provider status to ACTIVE', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderArb(),
          async (provider) => {
            const updatedProvider = { ...provider, status: 'ACTIVE' as ProviderStatus };
            mockedProviderRepository.updateProviderStatus.mockResolvedValue(updatedProvider);

            const result = await ProviderStatusService.markActive(provider.providerId);

            expect(mockedProviderRepository.updateProviderStatus).toHaveBeenCalledWith(
              provider.providerId,
              'ACTIVE'
            );
            expect(result.status).toBe('ACTIVE');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly update provider status to RATE_LIMITED', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderArb(),
          async (provider) => {
            const updatedProvider = { ...provider, status: 'RATE_LIMITED' as ProviderStatus };
            mockedProviderRepository.updateProviderStatus.mockResolvedValue(updatedProvider);

            const result = await ProviderStatusService.markRateLimited(provider.providerId);

            expect(mockedProviderRepository.updateProviderStatus).toHaveBeenCalledWith(
              provider.providerId,
              'RATE_LIMITED'
            );
            expect(result.status).toBe('RATE_LIMITED');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly update provider status to ERROR', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderArb(),
          async (provider) => {
            const updatedProvider = { ...provider, status: 'ERROR' as ProviderStatus };
            mockedProviderRepository.updateProviderStatus.mockResolvedValue(updatedProvider);

            const result = await ProviderStatusService.markError(provider.providerId);

            expect(mockedProviderRepository.updateProviderStatus).toHaveBeenCalledWith(
              provider.providerId,
              'ERROR'
            );
            expect(result.status).toBe('ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Remaining Quota', () => {
    it('should correctly calculate remaining quota', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiProviderWithStatusArb('ACTIVE'),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 10000 }),
          async (provider, requestsMade, tokensMade) => {
            mockedProviderRepository.getProvider.mockResolvedValue(provider);
            ProviderStatusService.resetRateLimitTracker(provider.providerId);

            // Record some requests
            for (let i = 0; i < requestsMade; i++) {
              ProviderStatusService.recordRequest(provider.providerId, Math.floor(tokensMade / Math.max(requestsMade, 1)));
            }

            const quota = await ProviderStatusService.getRemainingQuota(provider.providerId);

            expect(quota).not.toBeNull();
            if (quota) {
              const tracker = ProviderStatusService.getRateLimitTracker(provider.providerId);
              expect(quota.requestsRemainingPerMinute).toBe(
                Math.max(0, provider.rateLimits.requestsPerMinute - tracker.requestsThisMinute)
              );
              expect(quota.tokensRemainingPerMinute).toBe(
                Math.max(0, provider.rateLimits.tokensPerMinute - tracker.tokensThisMinute)
              );
              expect(quota.requestsRemainingToday).toBe(
                Math.max(0, provider.rateLimits.requestsPerDay - tracker.requestsToday)
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for non-existent provider quota', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerIdArb(),
          async (providerId) => {
            mockedProviderRepository.getProvider.mockResolvedValue(null);

            const quota = await ProviderStatusService.getRemainingQuota(providerId);

            expect(quota).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
