/**
 * Price Normalizer Service Property Tests
 * 
 * Feature: market-data-ingestion
 * Property 3: Price Data Normalization and Validation
 * Validates: Requirements 2.2, 2.3
 */

import * as fc from 'fast-check';
import { PriceNormalizerService, RawPriceInput } from './price-normalizer';
import { PricePoint } from '../types/price';

/**
 * Generator for valid raw price input
 */
const validRawPriceInputArb = (): fc.Arbitrary<RawPriceInput> =>
  fc.record({
    symbol: fc.stringOf(fc.constantFrom('B', 'T', 'C', 'E', 'H', 'U', 'S', 'D'), { minLength: 3, maxLength: 10 }),
    timestamp: fc.oneof(
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
      fc.integer({ min: 1577836800000, max: 1893456000000 }) // 2020-2030 in ms
    ),
    open: fc.double({ min: 0.0001, max: 1000000, noNaN: true }),
    high: fc.double({ min: 0.0001, max: 1000000, noNaN: true }),
    low: fc.double({ min: 0.0001, max: 1000000, noNaN: true }),
    close: fc.double({ min: 0.0001, max: 1000000, noNaN: true }),
    volume: fc.double({ min: 0, max: 1000000000, noNaN: true }),
    quoteVolume: fc.option(fc.double({ min: 0, max: 1000000000, noNaN: true }), { nil: undefined }),
    trades: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
    sourceId: fc.uuid()
  }).map(input => {
    // Ensure OHLC consistency: high >= max(open, close, low), low <= min(open, close, high)
    const prices = [input.open as number, input.close as number];
    const high = Math.max(...prices, input.high as number);
    const low = Math.min(...prices, input.low as number);
    return {
      ...input,
      high,
      low
    };
  });

/**
 * Generator for raw price input with string values (simulating exchange API responses)
 */
const stringValuedRawPriceInputArb = (): fc.Arbitrary<RawPriceInput> =>
  validRawPriceInputArb().map(input => ({
    ...input,
    open: String(input.open),
    high: String(input.high),
    low: String(input.low),
    close: String(input.close),
    volume: String(input.volume),
    quoteVolume: input.quoteVolume !== undefined ? String(input.quoteVolume) : undefined
  }));

/**
 * Generator for invalid raw price input (with anomalies)
 */
const invalidRawPriceInputArb = (): fc.Arbitrary<RawPriceInput> =>
  fc.oneof(
    // Negative prices
    fc.record({
      symbol: fc.constant('BTCUSD'),
      timestamp: fc.date().map(d => d.toISOString()),
      open: fc.double({ min: -1000, max: -0.01, noNaN: true }),
      high: fc.double({ min: 0.01, max: 100, noNaN: true }),
      low: fc.double({ min: 0.01, max: 100, noNaN: true }),
      close: fc.double({ min: 0.01, max: 100, noNaN: true }),
      volume: fc.double({ min: 0, max: 1000, noNaN: true }),
      sourceId: fc.uuid()
    }),
    // High < Low (OHLC inconsistency)
    fc.record({
      symbol: fc.constant('BTCUSD'),
      timestamp: fc.date().map(d => d.toISOString()),
      open: fc.constant(100),
      high: fc.constant(50),  // High is less than low
      low: fc.constant(80),
      close: fc.constant(90),
      volume: fc.double({ min: 0, max: 1000, noNaN: true }),
      sourceId: fc.uuid()
    })
  );

describe('PriceNormalizerService', () => {
  /**
   * Property 3: Price Data Normalization and Validation
   * 
   * For any PricePoint after normalization, it SHALL contain symbol, timestamp, open, 
   * high, low, close, and volume fields, AND if any value is outside expected ranges 
   * (e.g., negative prices, volume > 10x average), an anomaly flag SHALL be set.
   * 
   * **Validates: Requirements 2.2, 2.3**
   */
  describe('Property 3: Price Data Normalization and Validation', () => {
    it('should normalize price data to contain all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRawPriceInputArb(),
          async (input: RawPriceInput) => {
            // Act
            const result = PriceNormalizerService.normalize(input);
            const price = result.pricePoint;

            // Assert: All required fields are present
            expect(typeof price.symbol).toBe('string');
            expect(price.symbol.length).toBeGreaterThan(0);

            expect(typeof price.timestamp).toBe('string');
            expect(price.timestamp.length).toBeGreaterThan(0);
            // Timestamp should be valid ISO string
            expect(new Date(price.timestamp).toISOString()).toBe(price.timestamp);

            expect(typeof price.open).toBe('number');
            expect(isNaN(price.open)).toBe(false);

            expect(typeof price.high).toBe('number');
            expect(isNaN(price.high)).toBe(false);

            expect(typeof price.low).toBe('number');
            expect(isNaN(price.low)).toBe(false);

            expect(typeof price.close).toBe('number');
            expect(isNaN(price.close)).toBe(false);

            expect(typeof price.volume).toBe('number');
            expect(isNaN(price.volume)).toBe(false);

            expect(typeof price.sourceId).toBe('string');
            expect(price.sourceId.length).toBeGreaterThan(0);

            expect(typeof price.qualityScore).toBe('number');
            expect(price.qualityScore).toBeGreaterThanOrEqual(0);
            expect(price.qualityScore).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle string-valued inputs from exchange APIs', async () => {
      await fc.assert(
        fc.asyncProperty(
          stringValuedRawPriceInputArb(),
          async (input: RawPriceInput) => {
            // Act
            const result = PriceNormalizerService.normalize(input);
            const price = result.pricePoint;

            // Assert: Numeric fields are properly converted
            expect(typeof price.open).toBe('number');
            expect(typeof price.high).toBe('number');
            expect(typeof price.low).toBe('number');
            expect(typeof price.close).toBe('number');
            expect(typeof price.volume).toBe('number');

            // Values should match the original (within floating point tolerance)
            expect(price.open).toBeCloseTo(parseFloat(String(input.open)), 5);
            expect(price.high).toBeCloseTo(parseFloat(String(input.high)), 5);
            expect(price.low).toBeCloseTo(parseFloat(String(input.low)), 5);
            expect(price.close).toBeCloseTo(parseFloat(String(input.close)), 5);
            expect(price.volume).toBeCloseTo(parseFloat(String(input.volume)), 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should flag anomalies for invalid price data', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidRawPriceInputArb(),
          async (input: RawPriceInput) => {
            // Act
            const result = PriceNormalizerService.normalize(input);

            // Assert: Anomalies should be detected
            expect(result.anomalies.length).toBeGreaterThan(0);

            // Assert: Quality score should be reduced
            expect(result.qualityScore).toBeLessThan(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect negative price anomalies', async () => {
      const input: RawPriceInput = {
        symbol: 'BTCUSD',
        timestamp: new Date().toISOString(),
        open: -100,
        high: 100,
        low: 50,
        close: 75,
        volume: 1000,
        sourceId: 'test-source'
      };

      const result = PriceNormalizerService.normalize(input);

      expect(result.anomalies.some(a => 
        a.description.includes('negative')
      )).toBe(true);
      expect(result.qualityScore).toBeLessThan(1);
    });

    it('should detect OHLC inconsistency when high < low', async () => {
      const input: RawPriceInput = {
        symbol: 'BTCUSD',
        timestamp: new Date().toISOString(),
        open: 100,
        high: 50,  // Invalid: high < low
        low: 80,
        close: 90,
        volume: 1000,
        sourceId: 'test-source'
      };

      const result = PriceNormalizerService.normalize(input);

      expect(result.anomalies.some(a => 
        a.type === 'INCONSISTENCY' && a.description.includes('High price is less than low')
      )).toBe(true);
    });

    it('should detect price spikes when previous price is provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 100, max: 1000, noNaN: true }),
          async (previousPrice: number) => {
            // Create a price that spikes more than 50%
            const spikedPrice = previousPrice * 2; // 100% increase

            const input: RawPriceInput = {
              symbol: 'BTCUSD',
              timestamp: new Date().toISOString(),
              open: spikedPrice,
              high: spikedPrice * 1.1,
              low: spikedPrice * 0.9,
              close: spikedPrice,
              volume: 1000,
              sourceId: 'test-source'
            };

            const result = PriceNormalizerService.normalize(input, { previousPrice });

            // Assert: Price spike should be detected
            expect(result.anomalies.some(a => a.type === 'PRICE_SPIKE')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect volume spikes when average volume is provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 100, max: 10000, noNaN: true }),
          async (averageVolume: number) => {
            // Create a volume that spikes more than 10x
            const spikedVolume = averageVolume * 15;

            const input: RawPriceInput = {
              symbol: 'BTCUSD',
              timestamp: new Date().toISOString(),
              open: 100,
              high: 110,
              low: 90,
              close: 105,
              volume: spikedVolume,
              sourceId: 'test-source'
            };

            const result = PriceNormalizerService.normalize(input, { averageVolume });

            // Assert: Volume spike should be detected
            expect(result.anomalies.some(a => 
              a.description.includes('Volume') && a.description.includes('average')
            )).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve symbol and sourceId through normalization', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRawPriceInputArb(),
          async (input: RawPriceInput) => {
            const result = PriceNormalizerService.normalize(input);

            expect(result.pricePoint.symbol).toBe(input.symbol);
            expect(result.pricePoint.sourceId).toBe(input.sourceId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have high quality score for valid OHLC-consistent data', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRawPriceInputArb(),
          async (input: RawPriceInput) => {
            const result = PriceNormalizerService.normalize(input);

            // Valid data should have high quality score
            expect(result.qualityScore).toBeGreaterThanOrEqual(0.7);
            expect(result.isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('normalizeBatch', () => {
    it('should normalize multiple price points and track previous prices', async () => {
      const inputs: RawPriceInput[] = [
        {
          symbol: 'BTCUSD',
          timestamp: '2024-01-01T00:00:00Z',
          open: 100, high: 110, low: 90, close: 105,
          volume: 1000,
          sourceId: 'test'
        },
        {
          symbol: 'BTCUSD',
          timestamp: '2024-01-01T00:01:00Z',
          open: 105, high: 115, low: 100, close: 110,
          volume: 1200,
          sourceId: 'test'
        }
      ];

      const results = PriceNormalizerService.normalizeBatch(inputs);

      expect(results.length).toBe(2);
      expect(results[0].pricePoint.close).toBe(105);
      expect(results[1].pricePoint.close).toBe(110);
    });
  });
});
