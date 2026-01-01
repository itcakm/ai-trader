/**
 * Property-Based Tests for Sentiment Normalizer Service
 * 
 * **Property 8: Sentiment Normalization**
 * **Validates: Requirements 4.2, 4.3, 4.4**
 * 
 * Tests that:
 * - For any SentimentData after normalization, the overallScore SHALL be between -1.0 and 1.0
 * - It SHALL contain symbol, timestamp, mentionVolume, and changeRate24h fields
 */

import * as fc from 'fast-check';
import { SentimentNormalizer } from './sentiment-normalizer';
import {
  rawSentimentInputArb,
  rawSentimentInput0To100Arb,
  rawSentimentInputNormalizedArb,
  cryptoSymbolArb,
  isoDateStringArb
} from '../test/generators';

describe('SentimentNormalizer', () => {
  describe('Property 8: Sentiment Normalization', () => {
    /**
     * Feature: market-data-ingestion, Property 8: Sentiment Normalization
     * 
     * For any SentimentData after normalization, the overallScore SHALL be 
     * between -1.0 and 1.0, AND it SHALL contain symbol, timestamp, 
     * mentionVolume, and changeRate24h fields.
     * 
     * **Validates: Requirements 4.2, 4.3, 4.4**
     */
    it('should normalize any valid sentiment input to have overallScore between -1 and 1', () => {
      fc.assert(
        fc.property(rawSentimentInputArb(), (input) => {
          const result = SentimentNormalizer.normalize(input);
          
          if (result.success && result.data) {
            // overallScore must be between -1 and 1
            expect(result.data.overallScore).toBeGreaterThanOrEqual(-1);
            expect(result.data.overallScore).toBeLessThanOrEqual(1);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should ensure normalized data contains all required fields', () => {
      fc.assert(
        fc.property(rawSentimentInputArb(), (input) => {
          const result = SentimentNormalizer.normalize(input);
          
          if (result.success && result.data) {
            // Must contain symbol
            expect(typeof result.data.symbol).toBe('string');
            expect(result.data.symbol.length).toBeGreaterThan(0);
            
            // Must contain timestamp
            expect(typeof result.data.timestamp).toBe('string');
            expect(result.data.timestamp.length).toBeGreaterThan(0);
            
            // Must contain mentionVolume
            expect(typeof result.data.mentionVolume).toBe('number');
            expect(isNaN(result.data.mentionVolume)).toBe(false);
            
            // Must contain changeRate24h
            expect(typeof result.data.changeRate24h).toBe('number');
            expect(isNaN(result.data.changeRate24h)).toBe(false);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should normalize 0-100 scale scores to -1 to +1 range', () => {
      fc.assert(
        fc.property(rawSentimentInput0To100Arb(), (input) => {
          const result = SentimentNormalizer.normalize(input);
          
          if (result.success && result.data) {
            // Score of 0 should map to -1
            // Score of 50 should map to 0
            // Score of 100 should map to 1
            expect(result.data.overallScore).toBeGreaterThanOrEqual(-1);
            expect(result.data.overallScore).toBeLessThanOrEqual(1);
            
            // Verify the transformation is correct
            const expectedScore = ((input.score / 100) * 2) - 1;
            expect(result.data.overallScore).toBeCloseTo(expectedScore, 5);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve already normalized -1 to +1 scores', () => {
      fc.assert(
        fc.property(rawSentimentInputNormalizedArb(), (input) => {
          const result = SentimentNormalizer.normalize(input);
          
          if (result.success && result.data) {
            // Already normalized scores should remain the same
            expect(result.data.overallScore).toBeGreaterThanOrEqual(-1);
            expect(result.data.overallScore).toBeLessThanOrEqual(1);
            expect(result.data.overallScore).toBeCloseTo(input.score, 5);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should have qualityScore between 0 and 1', () => {
      fc.assert(
        fc.property(rawSentimentInputArb(), (input) => {
          const result = SentimentNormalizer.normalize(input);
          
          if (result.success && result.data) {
            expect(result.data.qualityScore).toBeGreaterThanOrEqual(0);
            expect(result.data.qualityScore).toBeLessThanOrEqual(1);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should include sourceId in aggregatedFrom array', () => {
      fc.assert(
        fc.property(rawSentimentInputArb(), (input) => {
          const result = SentimentNormalizer.normalize(input);
          
          if (result.success && result.data) {
            expect(Array.isArray(result.data.aggregatedFrom)).toBe(true);
            expect(result.data.aggregatedFrom.length).toBeGreaterThan(0);
            expect(result.data.aggregatedFrom).toContain(input.sourceId);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should generate unique sentimentId for each normalization', () => {
      fc.assert(
        fc.property(rawSentimentInputArb(), (input) => {
          const result1 = SentimentNormalizer.normalize(input);
          const result2 = SentimentNormalizer.normalize(input);
          
          if (result1.success && result2.success && result1.data && result2.data) {
            // Each normalization should generate a unique ID
            expect(result1.data.sentimentId).not.toBe(result2.data.sentimentId);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('normalizeScore', () => {
    it('should correctly scale any value from custom min/max to -1 to +1', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1000, max: 0, noNaN: true }),
          fc.double({ min: 0, max: 1000, noNaN: true }),
          (value, min, max) => {
            // Ensure min < max
            if (min >= max) return true;
            
            // Clamp value to be within min/max for this test
            const clampedValue = Math.max(min, Math.min(max, value));
            
            const normalized = SentimentNormalizer.normalizeScore(clampedValue, min, max);
            
            expect(normalized).toBeGreaterThanOrEqual(-1);
            expect(normalized).toBeLessThanOrEqual(1);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should map min value to -1 and max value to +1', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1000, max: 0, noNaN: true }),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          (min, max) => {
            const normalizedMin = SentimentNormalizer.normalizeScore(min, min, max);
            const normalizedMax = SentimentNormalizer.normalizeScore(max, min, max);
            
            expect(normalizedMin).toBeCloseTo(-1, 5);
            expect(normalizedMax).toBeCloseTo(1, 5);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should map midpoint to 0', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1000, max: 0, noNaN: true }),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          (min, max) => {
            const midpoint = (min + max) / 2;
            const normalized = SentimentNormalizer.normalizeScore(midpoint, min, max);
            
            expect(normalized).toBeCloseTo(0, 5);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validate', () => {
    it('should validate correctly normalized sentiment data', () => {
      fc.assert(
        fc.property(rawSentimentInputArb(), (input) => {
          const result = SentimentNormalizer.normalize(input);
          
          if (result.success && result.data) {
            const validation = SentimentNormalizer.validate(result.data);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('batchNormalize', () => {
    it('should normalize all inputs in a batch', () => {
      fc.assert(
        fc.property(
          fc.array(rawSentimentInputArb(), { minLength: 1, maxLength: 10 }),
          (inputs) => {
            const results = SentimentNormalizer.batchNormalize(inputs);
            
            expect(results.length).toBe(inputs.length);
            
            for (const result of results) {
              if (result.success && result.data) {
                expect(result.data.overallScore).toBeGreaterThanOrEqual(-1);
                expect(result.data.overallScore).toBeLessThanOrEqual(1);
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
