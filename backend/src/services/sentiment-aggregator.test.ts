/**
 * Property-Based Tests for Sentiment Aggregator Service
 * 
 * **Property 9: Sentiment Weighted Aggregation**
 * **Validates: Requirements 4.5**
 * 
 * Tests that:
 * - For any SentimentData aggregated from multiple sources, the overallScore SHALL equal
 *   the weighted average of individual source scores using the configured weights
 * - The sum of weights SHALL equal 1.0
 */

import * as fc from 'fast-check';
import { SentimentAggregator, SourceWeightConfig } from './sentiment-aggregator';
import { SentimentData } from '../types/sentiment';
import {
  sentimentDataArb,
  sentimentDataWithNormalizedWeightsArb,
  cryptoSymbolArb,
  isoDateStringArb
} from '../test/generators';

/**
 * Generator for multiple sentiment data with the same symbol
 */
const multipleSentimentDataArb = (symbol: string): fc.Arbitrary<SentimentData[]> =>
  fc.array(
    fc.record({
      sentimentId: fc.uuid(),
      symbol: fc.constant(symbol),
      timestamp: isoDateStringArb(),
      overallScore: fc.double({ min: -1, max: 1, noNaN: true }),
      mentionVolume: fc.integer({ min: 0, max: 1000000 }),
      changeRate24h: fc.double({ min: -100, max: 100, noNaN: true }),
      sources: fc.constant([]),
      aggregatedFrom: fc.array(fc.uuid(), { minLength: 1, maxLength: 1 }),
      qualityScore: fc.double({ min: 0.1, max: 1, noNaN: true })
    }),
    { minLength: 2, maxLength: 5 }
  );

/**
 * Generator for sentiment data list with same symbol
 */
const sentimentDataListArb = (): fc.Arbitrary<SentimentData[]> =>
  cryptoSymbolArb().chain(symbol => multipleSentimentDataArb(symbol));

/**
 * Generator for custom weights that sum to 1.0
 */
const normalizedWeightsArb = (count: number): fc.Arbitrary<number[]> =>
  fc.array(fc.double({ min: 0.1, max: 1, noNaN: true }), { minLength: count, maxLength: count })
    .map(weights => {
      const sum = weights.reduce((s, w) => s + w, 0);
      return weights.map(w => w / sum);
    });

describe('SentimentAggregator', () => {
  describe('Property 9: Sentiment Weighted Aggregation', () => {
    /**
     * Feature: market-data-ingestion, Property 9: Sentiment Weighted Aggregation
     * 
     * For any SentimentData aggregated from multiple sources, the overallScore 
     * SHALL equal the weighted average of individual source scores using the 
     * configured weights, AND the sum of weights SHALL equal 1.0.
     * 
     * **Validates: Requirements 4.5**
     */
    it('should produce overallScore equal to weighted average of source scores', () => {
      fc.assert(
        fc.property(sentimentDataListArb(), (dataList) => {
          const result = SentimentAggregator.aggregate(dataList);
          
          if (result.success && result.data) {
            // Calculate expected weighted average (equal weights)
            const equalWeight = 1 / dataList.length;
            const expectedScore = dataList.reduce(
              (sum, d) => sum + d.overallScore * equalWeight,
              0
            );
            
            // The aggregated score should equal the weighted average
            expect(result.data.overallScore).toBeCloseTo(expectedScore, 5);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should ensure weights sum to 1.0', () => {
      fc.assert(
        fc.property(sentimentDataListArb(), (dataList) => {
          const result = SentimentAggregator.aggregate(dataList);
          
          if (result.success && result.sourceContributions.length > 0) {
            // Sum of weights for included sources should equal 1.0
            const includedContributions = result.sourceContributions.filter(c => c.included);
            const weightSum = includedContributions.reduce((sum, c) => sum + c.weight, 0);
            
            expect(weightSum).toBeCloseTo(1.0, 5);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly apply custom weights', () => {
      fc.assert(
        fc.property(
          sentimentDataListArb().chain(dataList =>
            normalizedWeightsArb(dataList.length).map(weights => ({
              dataList,
              weights
            }))
          ),
          ({ dataList, weights }) => {
            // Create source weight config
            const sourceWeights: SourceWeightConfig[] = dataList.map((d, i) => ({
              sourceId: d.aggregatedFrom[0],
              weight: weights[i]
            }));

            const result = SentimentAggregator.aggregate(dataList, { sourceWeights });
            
            if (result.success && result.data) {
              // Calculate expected weighted average with custom weights
              const expectedScore = dataList.reduce(
                (sum, d, i) => sum + d.overallScore * weights[i],
                0
              );
              
              expect(result.data.overallScore).toBeCloseTo(expectedScore, 5);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should normalize weights when they do not sum to 1.0', () => {
      fc.assert(
        fc.property(
          sentimentDataListArb(),
          fc.array(fc.double({ min: 0.1, max: 10, noNaN: true }), { minLength: 2, maxLength: 5 }),
          (dataList, rawWeights) => {
            // Ensure we have matching number of weights
            const weights = rawWeights.slice(0, dataList.length);
            while (weights.length < dataList.length) {
              weights.push(1);
            }

            const sourceWeights: SourceWeightConfig[] = dataList.map((d, i) => ({
              sourceId: d.aggregatedFrom[0],
              weight: weights[i]
            }));

            const result = SentimentAggregator.aggregate(dataList, { 
              sourceWeights,
              normalizeWeights: true 
            });
            
            if (result.success && result.sourceContributions.length > 0) {
              // After normalization, weights should sum to 1.0
              const includedContributions = result.sourceContributions.filter(c => c.included);
              const weightSum = includedContributions.reduce((sum, c) => sum + c.weight, 0);
              
              expect(weightSum).toBeCloseTo(1.0, 5);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should keep aggregated score within -1 to 1 bounds', () => {
      fc.assert(
        fc.property(sentimentDataListArb(), (dataList) => {
          const result = SentimentAggregator.aggregate(dataList);
          
          if (result.success && result.data) {
            expect(result.data.overallScore).toBeGreaterThanOrEqual(-1);
            expect(result.data.overallScore).toBeLessThanOrEqual(1);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should track all source IDs in aggregatedFrom', () => {
      fc.assert(
        fc.property(sentimentDataListArb(), (dataList) => {
          const result = SentimentAggregator.aggregate(dataList);
          
          if (result.success && result.data) {
            // All source IDs should be in aggregatedFrom
            for (const data of dataList) {
              for (const sourceId of data.aggregatedFrom) {
                expect(result.data.aggregatedFrom).toContain(sourceId);
              }
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should sum mention volumes from all sources', () => {
      fc.assert(
        fc.property(sentimentDataListArb(), (dataList) => {
          const result = SentimentAggregator.aggregate(dataList);
          
          if (result.success && result.data) {
            const expectedVolume = dataList.reduce((sum, d) => sum + d.mentionVolume, 0);
            expect(result.data.mentionVolume).toBe(expectedVolume);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('validateWeightSum', () => {
    it('should return true when weights sum to 1.0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }).chain(count => normalizedWeightsArb(count)),
          (weights) => {
            expect(SentimentAggregator.validateWeightSum(weights)).toBe(true);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when weights do not sum to 1.0', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.1, max: 0.3, noNaN: true }), { minLength: 2, maxLength: 5 }),
          (weights) => {
            const sum = weights.reduce((s, w) => s + w, 0);
            // Only test when sum is clearly not 1.0
            if (Math.abs(sum - 1.0) > 0.0001) {
              expect(SentimentAggregator.validateWeightSum(weights)).toBe(false);
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateWeightedAverage', () => {
    it('should calculate correct weighted average', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }).chain(count =>
            fc.tuple(
              fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: count, maxLength: count }),
              normalizedWeightsArb(count)
            )
          ),
          ([scores, weights]) => {
            const result = SentimentAggregator.calculateWeightedAverage(scores, weights);
            
            // Calculate expected value manually
            const expected = scores.reduce((sum, s, i) => sum + s * weights[i], 0);
            
            expect(result).toBeCloseTo(expected, 10);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return value within score bounds when all scores are bounded', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }).chain(count =>
            fc.tuple(
              fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: count, maxLength: count }),
              normalizedWeightsArb(count)
            )
          ),
          ([scores, weights]) => {
            const result = SentimentAggregator.calculateWeightedAverage(scores, weights);
            
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);
            
            // Weighted average should be between min and max scores
            expect(result).toBeGreaterThanOrEqual(minScore - 0.0001);
            expect(result).toBeLessThanOrEqual(maxScore + 0.0001);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('normalizeWeights', () => {
    it('should normalize any positive weights to sum to 1.0', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              sourceId: fc.uuid(),
              weight: fc.double({ min: 0.1, max: 100, noNaN: true })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (weights) => {
            const normalized = SentimentAggregator.normalizeWeights(weights);
            const sum = normalized.reduce((s, w) => s + w.weight, 0);
            
            expect(sum).toBeCloseTo(1.0, 10);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve relative proportions after normalization', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              sourceId: fc.uuid(),
              weight: fc.double({ min: 0.1, max: 100, noNaN: true })
            }),
            { minLength: 2, maxLength: 10 }
          ),
          (weights) => {
            const normalized = SentimentAggregator.normalizeWeights(weights);
            
            // Check that ratios are preserved
            for (let i = 1; i < weights.length; i++) {
              const originalRatio = weights[i].weight / weights[0].weight;
              const normalizedRatio = normalized[i].weight / normalized[0].weight;
              
              expect(normalizedRatio).toBeCloseTo(originalRatio, 5);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
