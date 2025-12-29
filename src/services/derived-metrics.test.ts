/**
 * Property-Based Tests for Derived Metrics Service
 * 
 * **Property 11: Derived Metric Calculation**
 * **Validates: Requirements 5.5**
 * 
 * For any OnChainMetric with historical data:
 * - change24h SHALL equal ((current - value24hAgo) / value24hAgo) * 100
 * - movingAverage7d SHALL equal the mean of the last 7 daily values
 */

import * as fc from 'fast-check';
import { DerivedMetricsService, HistoricalDataPoint } from './derived-metrics';

/**
 * Generator for historical data points with controlled timestamps
 */
const historicalDataPointArb = (baseDate: Date, daysAgo: number): fc.Arbitrary<HistoricalDataPoint> =>
  fc.double({ min: 0.01, max: 1000000000, noNaN: true }).map(value => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - daysAgo);
    return {
      value,
      timestamp: date.toISOString()
    };
  });

/**
 * Generator for a sequence of daily historical data points
 */
const dailyHistoryArb = (days: number): fc.Arbitrary<HistoricalDataPoint[]> =>
  fc.array(
    fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
    { minLength: days, maxLength: days }
  ).map(values => {
    const now = new Date();
    return values.map((value, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (days - 1 - index));
      return {
        value,
        timestamp: date.toISOString()
      };
    });
  });

/**
 * Generator for hourly historical data points (for 24h calculations)
 */
const hourlyHistoryArb = (hours: number): fc.Arbitrary<HistoricalDataPoint[]> =>
  fc.array(
    fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
    { minLength: hours, maxLength: hours }
  ).map(values => {
    const now = new Date();
    return values.map((value, index) => {
      const date = new Date(now);
      date.setHours(date.getHours() - (hours - 1 - index));
      return {
        value,
        timestamp: date.toISOString()
      };
    });
  });

describe('DerivedMetricsService', () => {
  describe('Property 11: Derived Metric Calculation', () => {
    /**
     * Feature: market-data-ingestion, Property 11: 24h Change Calculation
     * 
     * For any OnChainMetric with historical data, the change24h SHALL equal
     * ((current - value24hAgo) / value24hAgo) * 100
     * 
     * Validates: Requirements 5.5
     */
    it('should calculate change24h as ((current - value24hAgo) / value24hAgo) * 100', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
          fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
          (currentValue, value24hAgo) => {
            // Create history with a point exactly 24 hours ago
            const now = new Date();
            const date24hAgo = new Date(now);
            date24hAgo.setHours(date24hAgo.getHours() - 24);

            const history: HistoricalDataPoint[] = [
              { value: value24hAgo, timestamp: date24hAgo.toISOString() }
            ];

            const change24h = DerivedMetricsService.calculateChange24h(currentValue, history);

            // Expected formula: ((current - value24hAgo) / value24hAgo) * 100
            const expected = ((currentValue - value24hAgo) / value24hAgo) * 100;

            expect(change24h).toBeDefined();
            expect(change24h).toBeCloseTo(expected, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 11: 7d Change Calculation
     * 
     * For any OnChainMetric with historical data, the change7d SHALL equal
     * ((current - value7dAgo) / value7dAgo) * 100
     * 
     * Validates: Requirements 5.5
     */
    it('should calculate change7d as ((current - value7dAgo) / value7dAgo) * 100', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
          fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
          (currentValue, value7dAgo) => {
            // Create history with a point exactly 7 days ago
            const now = new Date();
            const date7dAgo = new Date(now);
            date7dAgo.setDate(date7dAgo.getDate() - 7);

            const history: HistoricalDataPoint[] = [
              { value: value7dAgo, timestamp: date7dAgo.toISOString() }
            ];

            const change7d = DerivedMetricsService.calculateChange7d(currentValue, history);

            // Expected formula: ((current - value7dAgo) / value7dAgo) * 100
            const expected = ((currentValue - value7dAgo) / value7dAgo) * 100;

            expect(change7d).toBeDefined();
            expect(change7d).toBeCloseTo(expected, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 11: 7d Moving Average Calculation
     * 
     * For any OnChainMetric with historical data, the movingAverage7d SHALL equal
     * the mean of the last 7 daily values.
     * 
     * Validates: Requirements 5.5
     */
    it('should calculate movingAverage7d as the mean of the last 7 daily values', () => {
      fc.assert(
        fc.property(
          dailyHistoryArb(7),
          (history) => {
            const movingAverage = DerivedMetricsService.calculateMovingAverage7d(history);

            // Expected: mean of all values
            const expectedMean = history.reduce((sum, p) => sum + p.value, 0) / history.length;

            expect(movingAverage).toBeDefined();
            expect(movingAverage).toBeCloseTo(expectedMean, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 11: Change percentage formula consistency
     * 
     * For any two positive values, the change percentage should follow the formula.
     * 
     * Validates: Requirements 5.5
     */
    it('should calculate change percentage correctly for any two positive values', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
          fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
          (current, previous) => {
            const change = DerivedMetricsService.calculateChangePercentage(current, previous);

            const expected = ((current - previous) / previous) * 100;

            expect(change).toBeDefined();
            expect(change).toBeCloseTo(expected, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 11: Simple moving average formula
     * 
     * For any array of values, the simple moving average should equal the arithmetic mean.
     * 
     * Validates: Requirements 5.5
     */
    it('should calculate simple moving average as arithmetic mean', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.01, max: 1000000000, noNaN: true }), { minLength: 1, maxLength: 30 }),
          (values) => {
            const sma = DerivedMetricsService.calculateSimpleMovingAverage(values);

            const expectedMean = values.reduce((sum, v) => sum + v, 0) / values.length;

            expect(sma).toBeDefined();
            expect(sma).toBeCloseTo(expectedMean, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: market-data-ingestion, Property 11: Derived metrics consistency
     * 
     * For any metric with sufficient history, all derived metrics should be calculated.
     * 
     * Validates: Requirements 5.5
     */
    it('should calculate all derived metrics when sufficient history is available', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
          fc.array(
            fc.double({ min: 0.01, max: 1000000000, noNaN: true }),
            { minLength: 7, maxLength: 14 }
          ),
          (currentValue, values) => {
            // Create history spanning 7+ days with hourly granularity
            const now = new Date();
            const history: HistoricalDataPoint[] = values.map((value, index) => {
              const date = new Date(now);
              date.setDate(date.getDate() - index);
              return { value, timestamp: date.toISOString() };
            });

            const result = DerivedMetricsService.calculateDerivedMetrics(currentValue, history);

            // With 7+ days of data, we should have all metrics
            expect(result.movingAverage7d).toBeDefined();
            expect(typeof result.movingAverage7d).toBe('number');
            expect(isNaN(result.movingAverage7d!)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should return undefined for change24h with empty history', () => {
      const result = DerivedMetricsService.calculateChange24h(100, []);
      expect(result).toBeUndefined();
    });

    it('should return undefined for change7d with empty history', () => {
      const result = DerivedMetricsService.calculateChange7d(100, []);
      expect(result).toBeUndefined();
    });

    it('should return undefined for movingAverage7d with empty history', () => {
      const result = DerivedMetricsService.calculateMovingAverage7d([]);
      expect(result).toBeUndefined();
    });

    it('should return undefined for change percentage when previous value is 0', () => {
      const result = DerivedMetricsService.calculateChangePercentage(100, 0);
      expect(result).toBeUndefined();
    });

    it('should return undefined for simple moving average with empty array', () => {
      const result = DerivedMetricsService.calculateSimpleMovingAverage([]);
      expect(result).toBeUndefined();
    });

    it('should handle single value in history for moving average', () => {
      const now = new Date();
      const history: HistoricalDataPoint[] = [
        { value: 100, timestamp: now.toISOString() }
      ];

      const result = DerivedMetricsService.calculateMovingAverage7d(history);
      expect(result).toBe(100);
    });
  });

  describe('Metric Enrichment', () => {
    it('should enrich metric with derived values', () => {
      const now = new Date();
      const metric = {
        metricId: 'test-id',
        symbol: 'BTC',
        network: 'bitcoin',
        metricType: 'ACTIVE_ADDRESSES' as const,
        value: 1000000,
        timestamp: now.toISOString(),
        sourceId: 'test-source',
        qualityScore: 0.9
      };

      // Create history with values for the past 7 days
      const history: HistoricalDataPoint[] = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        history.push({
          value: 900000 + i * 10000,
          timestamp: date.toISOString()
        });
      }

      const enriched = DerivedMetricsService.enrichMetric(metric, history);

      expect(enriched.metricId).toBe(metric.metricId);
      expect(enriched.symbol).toBe(metric.symbol);
      expect(enriched.value).toBe(metric.value);
      expect(enriched.movingAverage7d).toBeDefined();
    });
  });
});
