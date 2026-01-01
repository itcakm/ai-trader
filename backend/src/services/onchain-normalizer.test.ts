/**
 * Property-Based Tests for On-Chain Normalizer Service
 * 
 * **Property 10: On-Chain Metric Normalization**
 * **Validates: Requirements 5.2, 5.3, 5.4**
 * 
 * For any OnChainMetric after normalization, it SHALL contain metricType (from valid enum),
 * value, symbol, network, and timestamp fields.
 */

import * as fc from 'fast-check';
import { OnChainNormalizer, VALID_METRIC_TYPES } from './onchain-normalizer';
import {
  rawOnChainInputArb,
  rawOnChainInputWithAliasArb,
  onChainMetricTypeArb,
  cryptoSymbolArb
} from '../test/generators';

describe('OnChainNormalizer', () => {
  describe('Property 10: On-Chain Metric Normalization', () => {
    /**
     * Feature: market-data-ingestion, Property 10: On-Chain Metric Normalization
     * 
     * For any OnChainMetric after normalization, it SHALL contain metricType (from valid enum),
     * value, symbol, network, and timestamp fields.
     * 
     * Validates: Requirements 5.2, 5.3, 5.4
     */
    it('should produce normalized metrics with all required fields for any valid input', () => {
      fc.assert(
        fc.property(rawOnChainInputArb(), (input) => {
          const result = OnChainNormalizer.normalize(input);

          // Normalization should succeed for valid inputs
          expect(result.success).toBe(true);
          expect(result.data).toBeDefined();

          const metric = result.data!;

          // Verify metricType is from valid enum (Requirement 5.2)
          expect(VALID_METRIC_TYPES).toContain(metric.metricType);

          // Verify value is present and is a number (Requirement 5.3)
          expect(typeof metric.value).toBe('number');
          expect(isNaN(metric.value)).toBe(false);

          // Verify symbol is present and uppercase (Requirement 5.4)
          expect(typeof metric.symbol).toBe('string');
          expect(metric.symbol.length).toBeGreaterThan(0);
          expect(metric.symbol).toBe(metric.symbol.toUpperCase());

          // Verify network is present (Requirement 5.4)
          expect(typeof metric.network).toBe('string');
          expect(metric.network.length).toBeGreaterThan(0);

          // Verify timestamp is present
          expect(typeof metric.timestamp).toBe('string');
          expect(metric.timestamp.length).toBeGreaterThan(0);

          // Verify metricId is generated
          expect(typeof metric.metricId).toBe('string');
          expect(metric.metricId.length).toBeGreaterThan(0);

          // Verify sourceId is preserved
          expect(metric.sourceId).toBe(input.sourceId);

          // Verify qualityScore is between 0 and 1
          expect(metric.qualityScore).toBeGreaterThanOrEqual(0);
          expect(metric.qualityScore).toBeLessThanOrEqual(1);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 10: Metric type alias normalization
     * 
     * For any metric type alias (snake_case, camelCase, abbreviations),
     * normalization should produce a valid standard metric type.
     * 
     * Validates: Requirements 5.2
     */
    it('should normalize metric type aliases to standard enum values', () => {
      fc.assert(
        fc.property(rawOnChainInputWithAliasArb(), (input) => {
          const result = OnChainNormalizer.normalize(input);

          expect(result.success).toBe(true);
          expect(result.data).toBeDefined();

          // Verify metricType is normalized to valid enum
          expect(VALID_METRIC_TYPES).toContain(result.data!.metricType);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 10: Network inference
     * 
     * For any symbol without explicit network, the normalizer should infer
     * a network from the symbol.
     * 
     * Validates: Requirements 5.4
     */
    it('should infer network from symbol when not provided', () => {
      fc.assert(
        fc.property(
          fc.record({
            symbol: cryptoSymbolArb(),
            metricType: onChainMetricTypeArb(),
            value: fc.double({ min: 0, max: 1000000, noNaN: true }),
            sourceId: fc.uuid()
          }),
          (input) => {
            const result = OnChainNormalizer.normalize(input);

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();

            // Network should be inferred
            expect(typeof result.data!.network).toBe('string');
            expect(result.data!.network.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 10: Quality score bounds
     * 
     * For any normalized metric, the quality score should be between 0 and 1.
     * 
     * Validates: Requirements 5.4
     */
    it('should produce quality scores between 0 and 1', () => {
      fc.assert(
        fc.property(rawOnChainInputArb(), (input) => {
          const result = OnChainNormalizer.normalize(input);

          if (result.success && result.data) {
            expect(result.data.qualityScore).toBeGreaterThanOrEqual(0);
            expect(result.data.qualityScore).toBeLessThanOrEqual(1);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 10: Derived metrics preservation
     * 
     * For any input with derived metrics (change24h, change7d, movingAverage7d),
     * these should be preserved in the normalized output.
     * 
     * Validates: Requirements 5.3
     */
    it('should preserve derived metrics when provided', () => {
      fc.assert(
        fc.property(
          fc.record({
            symbol: cryptoSymbolArb(),
            metricType: onChainMetricTypeArb(),
            value: fc.double({ min: 0, max: 1000000, noNaN: true }),
            timestamp: fc.date().map(d => d.toISOString()),
            change24h: fc.double({ min: -100, max: 100, noNaN: true }),
            change7d: fc.double({ min: -100, max: 100, noNaN: true }),
            movingAverage7d: fc.double({ min: 0, max: 1000000, noNaN: true }),
            sourceId: fc.uuid()
          }),
          (input) => {
            const result = OnChainNormalizer.normalize(input);

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();

            // Derived metrics should be preserved
            expect(result.data!.change24h).toBe(input.change24h);
            expect(result.data!.change7d).toBe(input.change7d);
            expect(result.data!.movingAverage7d).toBe(input.movingAverage7d);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 10: Validation consistency
     * 
     * For any successfully normalized metric, validation should pass.
     * 
     * Validates: Requirements 5.2, 5.3, 5.4
     */
    it('should produce metrics that pass validation', () => {
      fc.assert(
        fc.property(rawOnChainInputArb(), (input) => {
          const result = OnChainNormalizer.normalize(input);

          if (result.success && result.data) {
            const validation = OnChainNormalizer.validate(result.data);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should reject input with missing symbol', () => {
      const input = {
        symbol: '',
        metricType: 'ACTIVE_ADDRESSES',
        value: 1000,
        sourceId: 'test-source'
      };

      const result = OnChainNormalizer.normalize(input);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Symbol is required');
    });

    it('should reject input with invalid metric type', () => {
      const input = {
        symbol: 'BTC',
        metricType: 'INVALID_METRIC',
        value: 1000,
        sourceId: 'test-source'
      };

      const result = OnChainNormalizer.normalize(input);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Unknown metric type'))).toBe(true);
    });

    it('should reject input with NaN value', () => {
      const input = {
        symbol: 'BTC',
        metricType: 'ACTIVE_ADDRESSES',
        value: NaN,
        sourceId: 'test-source'
      };

      const result = OnChainNormalizer.normalize(input);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Value is required and must be a valid number');
    });

    it('should reject input with missing sourceId', () => {
      const input = {
        symbol: 'BTC',
        metricType: 'ACTIVE_ADDRESSES',
        value: 1000,
        sourceId: ''
      };

      const result = OnChainNormalizer.normalize(input);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Source ID is required');
    });
  });

  describe('Batch Normalization', () => {
    it('should normalize multiple inputs correctly', () => {
      fc.assert(
        fc.property(
          fc.array(rawOnChainInputArb(), { minLength: 1, maxLength: 10 }),
          (inputs) => {
            const results = OnChainNormalizer.batchNormalize(inputs);

            expect(results).toHaveLength(inputs.length);

            results.forEach((result, index) => {
              expect(result.success).toBe(true);
              expect(result.data).toBeDefined();
              expect(result.data!.sourceId).toBe(inputs[index].sourceId);
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
