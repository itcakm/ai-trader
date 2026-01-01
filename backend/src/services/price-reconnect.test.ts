/**
 * Price Reconnect Service Property Tests
 * 
 * Feature: market-data-ingestion
 * Property 4: Price Feed Reconnection
 * Validates: Requirements 2.6
 */

import * as fc from 'fast-check';
import { PriceReconnectService, ReconnectConfig } from './price-reconnect';
import { FailoverService } from './failover';
import { DataSourceRepository } from '../repositories/data-source';

// Mock dependencies
jest.mock('./failover');
jest.mock('../repositories/data-source');

const mockedFailoverService = FailoverService as jest.Mocked<typeof FailoverService>;
const mockedRepository = DataSourceRepository as jest.Mocked<typeof DataSourceRepository>;

/**
 * Generator for reconnect configuration
 */
const reconnectConfigArb = (): fc.Arbitrary<ReconnectConfig> =>
  fc.record({
    initialDelayMs: fc.integer({ min: 100, max: 5000 }),
    maxDelayMs: fc.integer({ min: 10000, max: 120000 }),
    backoffMultiplier: fc.double({ min: 1.5, max: 3, noNaN: true }),
    maxRetries: fc.integer({ min: 1, max: 10 }),
    jitterFactor: fc.double({ min: 0, max: 0.3, noNaN: true })
  }).filter(config => config.maxDelayMs > config.initialDelayMs);

describe('PriceReconnectService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PriceReconnectService.clearStates();

    // Default mock implementations
    mockedFailoverService.getActiveSource.mockResolvedValue({
      sourceId: 'fallback-source',
      type: 'PRICE',
      name: 'Fallback Source',
      apiEndpoint: 'https://api.fallback.com',
      authMethod: 'API_KEY',
      supportedSymbols: ['BTCUSD'],
      rateLimits: { requestsPerSecond: 10, requestsPerMinute: 100, requestsPerDay: 10000 },
      status: 'ACTIVE',
      priority: 200,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    mockedFailoverService.switchToFallback.mockResolvedValue({
      previousSourceId: 'test-source',
      newSourceId: 'fallback-source',
      reason: 'Reconnection failed',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Property 4: Price Feed Reconnection
   * 
   * For any Price_Feed that disconnects, the system SHALL attempt reconnection with 
   * exponential backoff (delays increasing by factor of 2), AND after max retries, 
   * SHALL switch to the configured fallback source.
   * 
   * **Validates: Requirements 2.6**
   */
  describe('Property 4: Price Feed Reconnection', () => {
    it('should calculate delays with exponential backoff pattern', async () => {
      await fc.assert(
        fc.asyncProperty(
          reconnectConfigArb(),
          fc.integer({ min: 1, max: 10 }),
          async (config: ReconnectConfig, attemptNumber: number) => {
            const delay = PriceReconnectService.calculateDelay(attemptNumber, config);

            // Delay should be positive
            expect(delay).toBeGreaterThan(0);

            // Delay should not exceed maxDelayMs (plus jitter)
            const maxWithJitter = config.maxDelayMs * (1 + config.jitterFactor);
            expect(delay).toBeLessThanOrEqual(maxWithJitter);

            // For first attempt, delay should be close to initialDelayMs
            if (attemptNumber === 1) {
              const maxFirstDelay = config.initialDelayMs * (1 + config.jitterFactor);
              expect(delay).toBeLessThanOrEqual(maxFirstDelay);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce increasing delays for consecutive attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          reconnectConfigArb(),
          async (config: ReconnectConfig) => {
            // Get delay sequence without jitter for predictable comparison
            const delays = PriceReconnectService.getDelaySequence(config);

            // Each delay should be >= previous (until hitting max)
            for (let i = 1; i < delays.length; i++) {
              expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
            }

            // Delays should follow exponential pattern until capped
            for (let i = 1; i < delays.length; i++) {
              if (delays[i] < config.maxDelayMs && delays[i - 1] < config.maxDelayMs) {
                const ratio = delays[i] / delays[i - 1];
                // Allow small tolerance for floating point
                expect(ratio).toBeCloseTo(config.backoffMultiplier, 1);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should cap delays at maxDelayMs', async () => {
      await fc.assert(
        fc.asyncProperty(
          reconnectConfigArb(),
          async (config: ReconnectConfig) => {
            const delays = PriceReconnectService.getDelaySequence(config);

            // All delays should be <= maxDelayMs
            for (const delay of delays) {
              expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should switch to fallback after max retries exhausted', async () => {
      const config: Partial<ReconnectConfig> = {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 3,
        jitterFactor: 0
      };

      // Connection always fails
      const connectFn = jest.fn().mockResolvedValue(false);

      const result = await PriceReconnectService.attemptReconnect(
        'test-source',
        connectFn,
        config
      );

      // Should have attempted maxRetries times
      expect(connectFn).toHaveBeenCalledTimes(3);

      // Should have switched to fallback
      expect(mockedFailoverService.switchToFallback).toHaveBeenCalledWith(
        'test-source',
        expect.any(String),
        'ERROR'
      );

      // Result should indicate fallback was used
      expect(result.usedFallback).toBe(true);
      expect(result.totalAttempts).toBe(3);
    });

    it('should return success without fallback when reconnection succeeds', async () => {
      const config: Partial<ReconnectConfig> = {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 5,
        jitterFactor: 0
      };

      // Connection succeeds on second attempt
      const connectFn = jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await PriceReconnectService.attemptReconnect(
        'test-source',
        connectFn,
        config
      );

      // Should have attempted twice
      expect(connectFn).toHaveBeenCalledTimes(2);

      // Should NOT have switched to fallback
      expect(mockedFailoverService.switchToFallback).not.toHaveBeenCalled();

      // Result should indicate success without fallback
      expect(result.success).toBe(true);
      expect(result.usedFallback).toBe(false);
      expect(result.totalAttempts).toBe(2);
    });

    it('should track reconnection state during attempts', async () => {
      const sourceId = 'state-test-source';
      const config: Partial<ReconnectConfig> = {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 2,
        jitterFactor: 0
      };

      let capturedAttemptNumber = 0;
      let capturedSourceId = '';
      const connectFn = jest.fn().mockImplementation(async () => {
        const state = PriceReconnectService.getReconnectState(sourceId);
        if (state) {
          capturedAttemptNumber = state.attemptNumber;
          capturedSourceId = state.sourceId;
        }
        return false;
      });

      await PriceReconnectService.attemptReconnect(sourceId, connectFn, config);

      // State should have been tracked during attempts
      expect(capturedSourceId).toBe(sourceId);
      expect(capturedAttemptNumber).toBeGreaterThan(0);
      
      // After completion, state should show not reconnecting
      const finalState = PriceReconnectService.getReconnectState(sourceId);
      expect(finalState).not.toBeNull();
      expect(finalState!.isReconnecting).toBe(false);
      expect(finalState!.maxRetriesExhausted).toBe(true);
    });

    it('should validate delay pattern follows exponential backoff', async () => {
      await fc.assert(
        fc.asyncProperty(
          reconnectConfigArb(),
          async (config: ReconnectConfig) => {
            const delays = PriceReconnectService.getDelaySequence(config);
            
            const isValid = PriceReconnectService.validateDelayPattern(delays, config);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle connection errors gracefully', async () => {
      const config: Partial<ReconnectConfig> = {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 2,
        jitterFactor: 0
      };

      // Connection throws error
      const connectFn = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await PriceReconnectService.attemptReconnect(
        'error-source',
        connectFn,
        config
      );

      // Should have attempted maxRetries times despite errors
      expect(connectFn).toHaveBeenCalledTimes(2);

      // Should have switched to fallback
      expect(result.usedFallback).toBe(true);
    });

    it('should return failure when no fallback available', async () => {
      mockedFailoverService.switchToFallback.mockResolvedValue(null);

      const config: Partial<ReconnectConfig> = {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 1,
        jitterFactor: 0
      };

      const connectFn = jest.fn().mockResolvedValue(false);

      const result = await PriceReconnectService.attemptReconnect(
        'no-fallback-source',
        connectFn,
        config
      );

      expect(result.success).toBe(false);
      expect(result.activeSource).toBeNull();
      expect(result.error).toBe('No fallback source available');
    });
  });

  describe('calculateDelay', () => {
    it('should return initialDelayMs for first attempt (without jitter)', () => {
      const config: Partial<ReconnectConfig> = {
        initialDelayMs: 1000,
        jitterFactor: 0
      };

      const delay = PriceReconnectService.calculateDelay(1, config);
      expect(delay).toBe(1000);
    });

    it('should double delay for each subsequent attempt with multiplier 2', () => {
      const config: Partial<ReconnectConfig> = {
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitterFactor: 0
      };

      expect(PriceReconnectService.calculateDelay(1, config)).toBe(1000);
      expect(PriceReconnectService.calculateDelay(2, config)).toBe(2000);
      expect(PriceReconnectService.calculateDelay(3, config)).toBe(4000);
      expect(PriceReconnectService.calculateDelay(4, config)).toBe(8000);
    });
  });

  describe('getDelaySequence', () => {
    it('should return correct number of delays', () => {
      const config: Partial<ReconnectConfig> = { maxRetries: 5 };
      const delays = PriceReconnectService.getDelaySequence(config);
      expect(delays.length).toBe(5);
    });
  });
});
