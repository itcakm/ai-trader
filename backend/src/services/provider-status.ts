import { ProviderRepository } from '../repositories/provider';
import { AIProvider, ProviderStatus, RateLimitConfig } from '../types/provider';
import { ResourceNotFoundError } from '../db/access';

/**
 * Rate limit tracking for a provider
 */
export interface RateLimitTracker {
  providerId: string;
  requestsThisMinute: number;
  tokensThisMinute: number;
  requestsToday: number;
  minuteResetAt: number;
  dayResetAt: number;
}

/**
 * In-memory rate limit trackers (in production, use Redis or similar)
 */
const rateLimitTrackers = new Map<string, RateLimitTracker>();

/**
 * Provider Status Service - manages provider availability and rate limits
 * 
 * Handles marking providers as inactive, checking active status,
 * and tracking rate limits per provider.
 * 
 * Requirements: 1.4, 1.5
 */
export const ProviderStatusService = {
  /**
   * Mark a provider as inactive
   * Prevents new requests to this provider
   * 
   * @param providerId - The unique identifier of the provider
   * @returns The updated provider
   * @throws ResourceNotFoundError if provider doesn't exist
   */
  async markInactive(providerId: string): Promise<AIProvider> {
    return ProviderRepository.updateProviderStatus(providerId, 'INACTIVE');
  },

  /**
   * Mark a provider as active
   * Allows requests to this provider
   * 
   * @param providerId - The unique identifier of the provider
   * @returns The updated provider
   * @throws ResourceNotFoundError if provider doesn't exist
   */
  async markActive(providerId: string): Promise<AIProvider> {
    return ProviderRepository.updateProviderStatus(providerId, 'ACTIVE');
  },

  /**
   * Mark a provider as rate limited
   * 
   * @param providerId - The unique identifier of the provider
   * @returns The updated provider
   * @throws ResourceNotFoundError if provider doesn't exist
   */
  async markRateLimited(providerId: string): Promise<AIProvider> {
    return ProviderRepository.updateProviderStatus(providerId, 'RATE_LIMITED');
  },

  /**
   * Mark a provider as having an error
   * 
   * @param providerId - The unique identifier of the provider
   * @returns The updated provider
   * @throws ResourceNotFoundError if provider doesn't exist
   */
  async markError(providerId: string): Promise<AIProvider> {
    return ProviderRepository.updateProviderStatus(providerId, 'ERROR');
  },

  /**
   * Check if a provider is active
   * 
   * @param providerId - The unique identifier of the provider
   * @returns True if the provider is active, false otherwise
   */
  async isActive(providerId: string): Promise<boolean> {
    const provider = await ProviderRepository.getProvider(providerId);
    if (!provider) {
      return false;
    }
    return provider.status === 'ACTIVE';
  },

  /**
   * Get the current status of a provider
   * 
   * @param providerId - The unique identifier of the provider
   * @returns The provider status, or null if provider doesn't exist
   */
  async getStatus(providerId: string): Promise<ProviderStatus | null> {
    const provider = await ProviderRepository.getProvider(providerId);
    if (!provider) {
      return null;
    }
    return provider.status;
  },

  /**
   * Initialize or get rate limit tracker for a provider
   */
  getRateLimitTracker(providerId: string): RateLimitTracker {
    const now = Date.now();
    const minuteFromNow = now + 60 * 1000;
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const dayResetAt = endOfDay.getTime();

    let tracker = rateLimitTrackers.get(providerId);
    
    if (!tracker) {
      tracker = {
        providerId,
        requestsThisMinute: 0,
        tokensThisMinute: 0,
        requestsToday: 0,
        minuteResetAt: minuteFromNow,
        dayResetAt
      };
      rateLimitTrackers.set(providerId, tracker);
    }

    // Reset minute counters if needed
    if (now >= tracker.minuteResetAt) {
      tracker.requestsThisMinute = 0;
      tracker.tokensThisMinute = 0;
      tracker.minuteResetAt = minuteFromNow;
    }

    // Reset daily counters if needed
    if (now >= tracker.dayResetAt) {
      tracker.requestsToday = 0;
      const newEndOfDay = new Date();
      newEndOfDay.setHours(23, 59, 59, 999);
      tracker.dayResetAt = newEndOfDay.getTime();
    }

    return tracker;
  },

  /**
   * Record a request to a provider for rate limiting
   * 
   * @param providerId - The unique identifier of the provider
   * @param tokensUsed - Number of tokens used in the request
   */
  recordRequest(providerId: string, tokensUsed: number = 0): void {
    const tracker = this.getRateLimitTracker(providerId);
    tracker.requestsThisMinute++;
    tracker.tokensThisMinute += tokensUsed;
    tracker.requestsToday++;
  },

  /**
   * Check if a provider is within rate limits
   * 
   * @param providerId - The unique identifier of the provider
   * @param rateLimits - The rate limit configuration
   * @returns True if within limits, false if rate limited
   */
  isWithinRateLimits(providerId: string, rateLimits: RateLimitConfig): boolean {
    const tracker = this.getRateLimitTracker(providerId);
    
    if (tracker.requestsThisMinute >= rateLimits.requestsPerMinute) {
      return false;
    }
    
    if (tracker.tokensThisMinute >= rateLimits.tokensPerMinute) {
      return false;
    }
    
    if (tracker.requestsToday >= rateLimits.requestsPerDay) {
      return false;
    }
    
    return true;
  },

  /**
   * Check if a provider can accept a request
   * Combines status check and rate limit check
   * 
   * @param providerId - The unique identifier of the provider
   * @returns Object with canAccept boolean and reason if rejected
   */
  async canAcceptRequest(providerId: string): Promise<{ canAccept: boolean; reason?: string }> {
    const provider = await ProviderRepository.getProvider(providerId);
    
    if (!provider) {
      return { canAccept: false, reason: 'Provider not found' };
    }

    if (provider.status === 'INACTIVE') {
      return { canAccept: false, reason: 'Provider is inactive' };
    }

    if (provider.status === 'ERROR') {
      return { canAccept: false, reason: 'Provider is in error state' };
    }

    if (provider.status === 'RATE_LIMITED') {
      return { canAccept: false, reason: 'Provider is rate limited' };
    }

    if (!this.isWithinRateLimits(providerId, provider.rateLimits)) {
      // Auto-update status to rate limited
      await this.markRateLimited(providerId);
      return { canAccept: false, reason: 'Rate limit exceeded' };
    }

    return { canAccept: true };
  },

  /**
   * Get remaining quota for a provider
   * 
   * @param providerId - The unique identifier of the provider
   * @returns Remaining requests and tokens, or null if provider doesn't exist
   */
  async getRemainingQuota(providerId: string): Promise<{
    requestsRemainingPerMinute: number;
    tokensRemainingPerMinute: number;
    requestsRemainingToday: number;
    minuteResetsAt: string;
    dayResetsAt: string;
  } | null> {
    const provider = await ProviderRepository.getProvider(providerId);
    
    if (!provider) {
      return null;
    }

    const tracker = this.getRateLimitTracker(providerId);
    const { rateLimits } = provider;

    return {
      requestsRemainingPerMinute: Math.max(0, rateLimits.requestsPerMinute - tracker.requestsThisMinute),
      tokensRemainingPerMinute: Math.max(0, rateLimits.tokensPerMinute - tracker.tokensThisMinute),
      requestsRemainingToday: Math.max(0, rateLimits.requestsPerDay - tracker.requestsToday),
      minuteResetsAt: new Date(tracker.minuteResetAt).toISOString(),
      dayResetsAt: new Date(tracker.dayResetAt).toISOString()
    };
  },

  /**
   * Reset rate limit tracker for a provider
   * Useful for testing or manual intervention
   * 
   * @param providerId - The unique identifier of the provider
   */
  resetRateLimitTracker(providerId: string): void {
    rateLimitTrackers.delete(providerId);
  },

  /**
   * Clear all rate limit trackers
   * Useful for testing
   */
  clearAllTrackers(): void {
    rateLimitTrackers.clear();
  }
};
