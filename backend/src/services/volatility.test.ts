import * as fc from 'fast-check';
import { VolatilityService, PriceDataPoint } from './volatility';
import { VolatilityRepository } from '../repositories/volatility';
import { VolatilityState, VolatilityConfig, VolatilityLevel } from '../types/volatility';
import {
  volatilityConfigArb,
  volatilityStateArb,
  lowVolatilityStateArb,
  normalVolatilityStateArb,
  highVolatilityStateArb,
  extremeVolatilityStateArb,
  priceDataSequenceArb,
  volatilityThresholdCrossingArb,
  throttleApplicationArb,
  cooldownScenarioArb,
  volatilityIndexTypeArb,
  cryptoSymbolArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/volatility');

const mockedRepository = VolatilityRepository as jest.Mocked<typeof VolatilityRepository>;

describe('VolatilityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any cooldown states between tests
  });

  describe('calculateATR', () => {
    it('should return 0 for insufficient data', () => {
      const result = VolatilityService.calculateATR([]);
      expect(result).toBe(0);

      const singlePoint: PriceDataPoint[] = [
        { timestamp: '2024-01-01T00:00:00Z', high: 100, low: 90, close: 95 }
      ];
      expect(VolatilityService.calculateATR(singlePoint)).toBe(0);
    });

    it('should calculate ATR correctly for simple data', () => {
      const priceData: PriceDataPoint[] = [
        { timestamp: '2024-01-01T00:00:00Z', high: 100, low: 90, close: 95 },
        { timestamp: '2024-01-02T00:00:00Z', high: 105, low: 92, close: 100 },
        { timestamp: '2024-01-03T00:00:00Z', high: 110, low: 98, close: 105 }
      ];

      const atr = VolatilityService.calculateATR(priceData);
      expect(atr).toBeGreaterThan(0);
    });
  });

  describe('calculateStdDev', () => {
    it('should return 0 for insufficient data', () => {
      expect(VolatilityService.calculateStdDev([])).toBe(0);
      expect(VolatilityService.calculateStdDev([100])).toBe(0);
    });

    it('should calculate standard deviation correctly', () => {
      const prices = [100, 102, 98, 101, 99];
      const stdDev = VolatilityService.calculateStdDev(prices);
      expect(stdDev).toBeGreaterThan(0);
      expect(stdDev).toBeLessThan(10); // Should be small for this data
    });

    it('should return 0 for constant prices', () => {
      const prices = [100, 100, 100, 100, 100];
      const stdDev = VolatilityService.calculateStdDev(prices);
      expect(stdDev).toBe(0);
    });
  });

  describe('calculateRealizedVol', () => {
    it('should return 0 for insufficient data', () => {
      expect(VolatilityService.calculateRealizedVol([])).toBe(0);
      expect(VolatilityService.calculateRealizedVol([0.01])).toBe(0);
    });

    it('should calculate realized volatility correctly', () => {
      const returns = [0.01, -0.02, 0.015, -0.01, 0.02];
      const realizedVol = VolatilityService.calculateRealizedVol(returns);
      expect(realizedVol).toBeGreaterThan(0);
    });
  });

  describe('calculateVolatilityIndex', () => {
    it('should calculate ATR index', () => {
      const priceData: PriceDataPoint[] = [
        { timestamp: '2024-01-01T00:00:00Z', high: 100, low: 90, close: 95 },
        { timestamp: '2024-01-02T00:00:00Z', high: 105, low: 92, close: 100 },
        { timestamp: '2024-01-03T00:00:00Z', high: 110, low: 98, close: 105 }
      ];

      const result = VolatilityService.calculateVolatilityIndex('ATR', priceData);
      expect(result.indexType).toBe('ATR');
      expect(result.indexValue).toBeGreaterThan(0);
      expect(result.dataPoints).toBe(3);
    });

    it('should calculate STD_DEV index', () => {
      const priceData: PriceDataPoint[] = [
        { timestamp: '2024-01-01T00:00:00Z', high: 100, low: 90, close: 95 },
        { timestamp: '2024-01-02T00:00:00Z', high: 105, low: 92, close: 100 },
        { timestamp: '2024-01-03T00:00:00Z', high: 110, low: 98, close: 105 }
      ];

      const result = VolatilityService.calculateVolatilityIndex('STD_DEV', priceData);
      expect(result.indexType).toBe('STD_DEV');
      expect(result.indexValue).toBeGreaterThan(0);
    });

    it('should calculate REALIZED_VOL index', () => {
      const priceData: PriceDataPoint[] = [
        { timestamp: '2024-01-01T00:00:00Z', high: 100, low: 90, close: 100 },
        { timestamp: '2024-01-02T00:00:00Z', high: 105, low: 92, close: 102 },
        { timestamp: '2024-01-03T00:00:00Z', high: 110, low: 98, close: 105 }
      ];

      const result = VolatilityService.calculateVolatilityIndex('REALIZED_VOL', priceData);
      expect(result.indexType).toBe('REALIZED_VOL');
      expect(result.indexValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('determineLevel', () => {
    it('should return LOW for index below normal threshold', () => {
      const level = VolatilityService.determineLevel(10, 20, 50, 80);
      expect(level).toBe('LOW');
    });

    it('should return NORMAL for index between normal and high threshold', () => {
      const level = VolatilityService.determineLevel(35, 20, 50, 80);
      expect(level).toBe('NORMAL');
    });

    it('should return HIGH for index between high and extreme threshold', () => {
      const level = VolatilityService.determineLevel(65, 20, 50, 80);
      expect(level).toBe('HIGH');
    });

    it('should return EXTREME for index above extreme threshold', () => {
      const level = VolatilityService.determineLevel(90, 20, 50, 80);
      expect(level).toBe('EXTREME');
    });
  });

  describe('getThrottlePercent', () => {
    it('should return 0 for LOW level', () => {
      expect(VolatilityService.getThrottlePercent('LOW')).toBe(0);
    });

    it('should return 0 for NORMAL level', () => {
      expect(VolatilityService.getThrottlePercent('NORMAL')).toBe(0);
    });

    it('should return highThrottlePercent for HIGH level', () => {
      expect(VolatilityService.getThrottlePercent('HIGH', 50, 100)).toBe(50);
    });

    it('should return extremeThrottlePercent for EXTREME level', () => {
      expect(VolatilityService.getThrottlePercent('EXTREME', 50, 100)).toBe(100);
    });
  });

  describe('allowNewEntries', () => {
    it('should allow entries for LOW level', () => {
      expect(VolatilityService.allowNewEntries('LOW')).toBe(true);
    });

    it('should allow entries for NORMAL level', () => {
      expect(VolatilityService.allowNewEntries('NORMAL')).toBe(true);
    });

    it('should allow entries for HIGH level', () => {
      expect(VolatilityService.allowNewEntries('HIGH')).toBe(true);
    });

    it('should block entries for EXTREME level', () => {
      expect(VolatilityService.allowNewEntries('EXTREME')).toBe(false);
    });
  });

  describe('applyThrottle', () => {
    it('should not reduce quantity when throttle is 0', () => {
      expect(VolatilityService.applyThrottle(100, 0)).toBe(100);
    });

    it('should reduce quantity by throttle percent', () => {
      expect(VolatilityService.applyThrottle(100, 50)).toBe(50);
    });

    it('should return 0 when throttle is 100', () => {
      expect(VolatilityService.applyThrottle(100, 100)).toBe(0);
    });
  });

  describe('isLowerLevel', () => {
    it('should correctly compare levels', () => {
      expect(VolatilityService.isLowerLevel('LOW', 'NORMAL')).toBe(true);
      expect(VolatilityService.isLowerLevel('NORMAL', 'HIGH')).toBe(true);
      expect(VolatilityService.isLowerLevel('HIGH', 'EXTREME')).toBe(true);
      expect(VolatilityService.isLowerLevel('EXTREME', 'HIGH')).toBe(false);
      expect(VolatilityService.isLowerLevel('HIGH', 'HIGH')).toBe(false);
    });
  });

  describe('shouldStartCooldown', () => {
    it('should start cooldown when transitioning from HIGH to lower', () => {
      expect(VolatilityService.shouldStartCooldown('HIGH', 'NORMAL')).toBe(true);
      expect(VolatilityService.shouldStartCooldown('HIGH', 'LOW')).toBe(true);
    });

    it('should start cooldown when transitioning from EXTREME to lower', () => {
      expect(VolatilityService.shouldStartCooldown('EXTREME', 'HIGH')).toBe(true);
      expect(VolatilityService.shouldStartCooldown('EXTREME', 'NORMAL')).toBe(true);
      expect(VolatilityService.shouldStartCooldown('EXTREME', 'LOW')).toBe(true);
    });

    it('should not start cooldown when transitioning from LOW or NORMAL', () => {
      expect(VolatilityService.shouldStartCooldown('LOW', 'NORMAL')).toBe(false);
      expect(VolatilityService.shouldStartCooldown('NORMAL', 'HIGH')).toBe(false);
    });
  });


  describe('checkThrottle', () => {
    it('should return normal state when no volatility state exists', async () => {
      mockedRepository.getStateByAsset.mockResolvedValue(null);

      const result = await VolatilityService.checkThrottle('tenant-1', 'BTC');

      expect(result.level).toBe('NORMAL');
      expect(result.throttlePercent).toBe(0);
      expect(result.allowNewEntries).toBe(true);
    });

    it('should return state values when volatility state exists', async () => {
      const state: VolatilityState = {
        stateId: 'state-1',
        assetId: 'BTC',
        currentIndex: 75,
        indexType: 'ATR',
        level: 'HIGH',
        throttlePercent: 50,
        allowNewEntries: true,
        updatedAt: new Date().toISOString()
      };
      mockedRepository.getStateByAsset.mockResolvedValue(state);

      const result = await VolatilityService.checkThrottle('tenant-1', 'BTC');

      expect(result.level).toBe('HIGH');
      expect(result.throttlePercent).toBe(50);
      expect(result.allowNewEntries).toBe(true);
    });
  });

  describe('isTradingAllowed', () => {
    it('should always allow exits', async () => {
      const extremeState: VolatilityState = {
        stateId: 'state-1',
        assetId: 'BTC',
        currentIndex: 90,
        indexType: 'ATR',
        level: 'EXTREME',
        throttlePercent: 100,
        allowNewEntries: false,
        updatedAt: new Date().toISOString()
      };
      mockedRepository.getStateByAsset.mockResolvedValue(extremeState);

      const result = await VolatilityService.isTradingAllowed('tenant-1', 'BTC', false);
      expect(result).toBe(true);
    });

    it('should block entries at EXTREME level', async () => {
      const extremeState: VolatilityState = {
        stateId: 'state-1',
        assetId: 'BTC',
        currentIndex: 90,
        indexType: 'ATR',
        level: 'EXTREME',
        throttlePercent: 100,
        allowNewEntries: false,
        updatedAt: new Date().toISOString()
      };
      mockedRepository.getStateByAsset.mockResolvedValue(extremeState);

      const result = await VolatilityService.isTradingAllowed('tenant-1', 'BTC', true);
      expect(result).toBe(false);
    });

    it('should allow entries at HIGH level', async () => {
      const highState: VolatilityState = {
        stateId: 'state-1',
        assetId: 'BTC',
        currentIndex: 65,
        indexType: 'ATR',
        level: 'HIGH',
        throttlePercent: 50,
        allowNewEntries: true,
        updatedAt: new Date().toISOString()
      };
      mockedRepository.getStateByAsset.mockResolvedValue(highState);

      const result = await VolatilityService.isTradingAllowed('tenant-1', 'BTC', true);
      expect(result).toBe(true);
    });
  });

  // Property-Based Tests

  describe('Property 7: Volatility Throttling', () => {
    /**
     * Property 7: Volatility Throttling
     * For any asset with volatility index exceeding highThreshold, maximum position sizes 
     * SHALL be reduced by highThrottlePercent, AND when exceeding extremeThreshold, 
     * new entries SHALL be blocked while exits remain allowed.
     * 
     * Validates: Requirements 3.1, 3.2, 3.3, 3.4
     */
    it('should correctly determine level and throttle based on thresholds', () => {
      fc.assert(
        fc.property(
          volatilityThresholdCrossingArb(),
          ({ normalThreshold, highThreshold, extremeThreshold, indexSequence, expectedLevels }) => {
            for (let i = 0; i < indexSequence.length; i++) {
              const level = VolatilityService.determineLevel(
                indexSequence[i],
                normalThreshold,
                highThreshold,
                extremeThreshold
              );
              expect(level).toBe(expectedLevels[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reduce position sizes at HIGH level by throttle percent', () => {
      fc.assert(
        fc.property(
          throttleApplicationArb(),
          ({ orderQuantity, throttlePercent, expectedQuantity }) => {
            const result = VolatilityService.applyThrottle(orderQuantity, throttlePercent);
            expect(result).toBeCloseTo(expectedQuantity, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should block new entries at EXTREME level while allowing exits', () => {
      fc.assert(
        fc.property(
          extremeVolatilityStateArb(),
          (state) => {
            // At EXTREME level, new entries should be blocked
            expect(VolatilityService.allowNewEntries('EXTREME')).toBe(false);
            // But exits are always allowed (tested via isTradingAllowed with isEntry=false)
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply correct throttle percent based on volatility level', () => {
      fc.assert(
        fc.property(
          volatilityConfigArb(),
          fc.double({ min: 0, max: 100, noNaN: true }),
          (config, indexValue) => {
            const level = VolatilityService.determineLevel(
              indexValue,
              config.normalThreshold,
              config.highThreshold,
              config.extremeThreshold
            );

            const throttle = VolatilityService.getThrottlePercent(
              level,
              config.highThrottlePercent,
              config.extremeThrottlePercent
            );

            if (level === 'LOW' || level === 'NORMAL') {
              expect(throttle).toBe(0);
            } else if (level === 'HIGH') {
              expect(throttle).toBe(config.highThrottlePercent);
            } else if (level === 'EXTREME') {
              expect(throttle).toBe(config.extremeThrottlePercent);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8: Volatility Cooldown Restoration', () => {
    /**
     * Property 8: Volatility Cooldown Restoration
     * For any asset where volatility returns below normalThreshold, normal trading 
     * parameters SHALL be restored only after the configured cooldownMinutes have 
     * elapsed, not immediately.
     * 
     * Validates: Requirements 3.5
     */
    it('should start cooldown when transitioning from HIGH/EXTREME to lower level', () => {
      fc.assert(
        fc.property(
          cooldownScenarioArb(),
          ({ previousLevel, newLevel, shouldApplyCooldown }) => {
            const result = VolatilityService.shouldStartCooldown(previousLevel, newLevel);
            expect(result).toBe(shouldApplyCooldown);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not start cooldown when transitioning to higher level', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('LOW', 'NORMAL') as fc.Arbitrary<VolatilityLevel>,
          fc.constantFrom('HIGH', 'EXTREME') as fc.Arbitrary<VolatilityLevel>,
          (previousLevel, newLevel) => {
            const result = VolatilityService.shouldStartCooldown(previousLevel, newLevel);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track cooldown state correctly', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.constantFrom('HIGH', 'EXTREME') as fc.Arbitrary<VolatilityLevel>,
          fc.integer({ min: 1, max: 60 }),
          (assetId, previousLevel, cooldownMinutes) => {
            // Clear any existing cooldown
            VolatilityService.clearCooldown(assetId);

            // Start cooldown
            VolatilityService.startCooldown(assetId, previousLevel, cooldownMinutes);

            // Should have remaining cooldown
            const remaining = VolatilityService.getCooldownRemaining(assetId);
            expect(remaining).toBeGreaterThan(0);
            expect(remaining).toBeLessThanOrEqual(cooldownMinutes * 60 * 1000);

            // Clean up
            VolatilityService.clearCooldown(assetId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify when in cooldown period', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.constantFrom('HIGH', 'EXTREME') as fc.Arbitrary<VolatilityLevel>,
          fc.constantFrom('LOW', 'NORMAL') as fc.Arbitrary<VolatilityLevel>,
          fc.integer({ min: 5, max: 60 }),
          (assetId, previousLevel, newLevel, cooldownMinutes) => {
            // Clear any existing cooldown
            VolatilityService.clearCooldown(assetId);

            // Start cooldown
            VolatilityService.startCooldown(assetId, previousLevel, cooldownMinutes);

            // Should be in cooldown when trying to restore to lower level
            const inCooldown = VolatilityService.isInCooldown(
              assetId,
              newLevel,
              previousLevel,
              cooldownMinutes
            );
            expect(inCooldown).toBe(true);

            // Clean up
            VolatilityService.clearCooldown(assetId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Volatility Calculation Properties', () => {
    it('should calculate non-negative ATR for any valid price data', () => {
      fc.assert(
        fc.property(
          priceDataSequenceArb(20),
          (priceData) => {
            const atr = VolatilityService.calculateATR(priceData);
            expect(atr).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate non-negative standard deviation for any prices', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 1, max: 100000, noNaN: true }), { minLength: 2, maxLength: 50 }),
          (prices) => {
            const stdDev = VolatilityService.calculateStdDev(prices);
            expect(stdDev).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate volatility index for any index type', () => {
      fc.assert(
        fc.property(
          volatilityIndexTypeArb(),
          priceDataSequenceArb(20),
          (indexType, priceData) => {
            const result = VolatilityService.calculateVolatilityIndex(indexType, priceData);
            expect(result.indexType).toBe(indexType);
            expect(result.indexValue).toBeGreaterThanOrEqual(0);
            expect(result.dataPoints).toBe(priceData.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
