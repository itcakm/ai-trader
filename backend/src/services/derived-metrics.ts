/**
 * Derived Metrics Service - calculates derived metrics from on-chain data
 * 
 * This service handles:
 * - 24-hour change percentage calculation
 * - 7-day change percentage calculation
 * - 7-day moving average calculation
 * 
 * Requirements: 5.5
 */

import { OnChainMetric } from '../types/on-chain';

/**
 * Historical data point for derived metric calculations
 */
export interface HistoricalDataPoint {
  value: number;
  timestamp: string;
}

/**
 * Result of derived metric calculations
 */
export interface DerivedMetricsResult {
  change24h: number | undefined;
  change7d: number | undefined;
  movingAverage7d: number | undefined;
}

/**
 * Configuration for derived metric calculations
 */
export interface DerivedMetricsConfig {
  /** Number of hours for 24h change calculation (default: 24) */
  hours24h?: number;
  /** Number of days for 7d change calculation (default: 7) */
  days7d?: number;
  /** Number of days for moving average calculation (default: 7) */
  movingAverageDays?: number;
}

const DEFAULT_CONFIG: Required<DerivedMetricsConfig> = {
  hours24h: 24,
  days7d: 7,
  movingAverageDays: 7
};

/**
 * Derived Metrics Service
 */
export const DerivedMetricsService = {
  /**
   * Calculate all derived metrics for a given current value and historical data
   * 
   * Requirements: 5.5
   * 
   * @param currentValue - The current metric value
   * @param history - Array of historical data points sorted by timestamp ascending
   * @param config - Optional configuration for calculations
   * @returns Derived metrics result
   */
  calculateDerivedMetrics(
    currentValue: number,
    history: HistoricalDataPoint[],
    config: DerivedMetricsConfig = {}
  ): DerivedMetricsResult {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    return {
      change24h: this.calculateChange24h(currentValue, history, mergedConfig.hours24h),
      change7d: this.calculateChange7d(currentValue, history, mergedConfig.days7d),
      movingAverage7d: this.calculateMovingAverage7d(history, mergedConfig.movingAverageDays)
    };
  },

  /**
   * Calculate 24-hour change percentage
   * 
   * Formula: ((current - value24hAgo) / value24hAgo) * 100
   * 
   * Requirements: 5.5
   * 
   * @param currentValue - The current metric value
   * @param history - Array of historical data points sorted by timestamp ascending
   * @param hours - Number of hours to look back (default: 24)
   * @returns Change percentage or undefined if insufficient data
   */
  calculateChange24h(
    currentValue: number,
    history: HistoricalDataPoint[],
    hours: number = 24
  ): number | undefined {
    if (history.length === 0) {
      return undefined;
    }

    const targetTime = new Date();
    targetTime.setHours(targetTime.getHours() - hours);

    const value24hAgo = this.findClosestValue(history, targetTime);
    if (value24hAgo === undefined || value24hAgo === 0) {
      return undefined;
    }

    return ((currentValue - value24hAgo) / value24hAgo) * 100;
  },

  /**
   * Calculate 7-day change percentage
   * 
   * Formula: ((current - value7dAgo) / value7dAgo) * 100
   * 
   * Requirements: 5.5
   * 
   * @param currentValue - The current metric value
   * @param history - Array of historical data points sorted by timestamp ascending
   * @param days - Number of days to look back (default: 7)
   * @returns Change percentage or undefined if insufficient data
   */
  calculateChange7d(
    currentValue: number,
    history: HistoricalDataPoint[],
    days: number = 7
  ): number | undefined {
    if (history.length === 0) {
      return undefined;
    }

    const targetTime = new Date();
    targetTime.setDate(targetTime.getDate() - days);

    const value7dAgo = this.findClosestValue(history, targetTime);
    if (value7dAgo === undefined || value7dAgo === 0) {
      return undefined;
    }

    return ((currentValue - value7dAgo) / value7dAgo) * 100;
  },

  /**
   * Calculate 7-day moving average
   * 
   * Formula: mean of the last N daily values
   * 
   * Requirements: 5.5
   * 
   * @param history - Array of historical data points sorted by timestamp ascending
   * @param days - Number of days for moving average (default: 7)
   * @returns Moving average or undefined if insufficient data
   */
  calculateMovingAverage7d(
    history: HistoricalDataPoint[],
    days: number = 7
  ): number | undefined {
    if (history.length === 0) {
      return undefined;
    }

    // Get daily values for the last N days
    const dailyValues = this.getDailyValues(history, days);
    
    if (dailyValues.length === 0) {
      return undefined;
    }

    // Calculate mean
    const sum = dailyValues.reduce((acc, val) => acc + val, 0);
    return sum / dailyValues.length;
  },

  /**
   * Find the closest value to a target time in historical data
   * 
   * @param history - Array of historical data points sorted by timestamp ascending
   * @param targetTime - The target time to find the closest value for
   * @returns The closest value or undefined if no suitable data found
   */
  findClosestValue(history: HistoricalDataPoint[], targetTime: Date): number | undefined {
    if (history.length === 0) {
      return undefined;
    }

    const targetMs = targetTime.getTime();
    let closestPoint: HistoricalDataPoint | undefined;
    let closestDiff = Infinity;

    for (const point of history) {
      const pointMs = new Date(point.timestamp).getTime();
      const diff = Math.abs(pointMs - targetMs);

      if (diff < closestDiff) {
        closestDiff = diff;
        closestPoint = point;
      }
    }

    // Only return if within reasonable tolerance (6 hours)
    const toleranceMs = 6 * 60 * 60 * 1000;
    if (closestPoint && closestDiff <= toleranceMs) {
      return closestPoint.value;
    }

    return undefined;
  },

  /**
   * Get daily values from historical data for the last N days
   * 
   * @param history - Array of historical data points sorted by timestamp ascending
   * @param days - Number of days to get values for
   * @returns Array of daily values
   */
  getDailyValues(history: HistoricalDataPoint[], days: number): number[] {
    if (history.length === 0) {
      return [];
    }

    const now = new Date();
    const dailyValues: number[] = [];
    const seenDays = new Set<string>();

    // Process history in reverse (most recent first)
    const sortedHistory = [...history].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    for (const point of sortedHistory) {
      const pointDate = new Date(point.timestamp);
      const dayKey = pointDate.toISOString().split('T')[0];

      // Check if this day is within our range
      const daysDiff = Math.floor((now.getTime() - pointDate.getTime()) / (24 * 60 * 60 * 1000));
      
      if (daysDiff < days && !seenDays.has(dayKey)) {
        seenDays.add(dayKey);
        dailyValues.push(point.value);

        if (dailyValues.length >= days) {
          break;
        }
      }
    }

    return dailyValues;
  },

  /**
   * Enrich an OnChainMetric with derived metrics
   * 
   * Requirements: 5.5
   * 
   * @param metric - The metric to enrich
   * @param history - Historical data for the metric
   * @param config - Optional configuration
   * @returns Enriched metric with derived values
   */
  enrichMetric(
    metric: OnChainMetric,
    history: HistoricalDataPoint[],
    config: DerivedMetricsConfig = {}
  ): OnChainMetric {
    const derived = this.calculateDerivedMetrics(metric.value, history, config);

    return {
      ...metric,
      change24h: derived.change24h,
      change7d: derived.change7d,
      movingAverage7d: derived.movingAverage7d
    };
  },

  /**
   * Calculate change percentage between two values
   * 
   * @param currentValue - Current value
   * @param previousValue - Previous value
   * @returns Change percentage or undefined if previous value is 0
   */
  calculateChangePercentage(currentValue: number, previousValue: number): number | undefined {
    if (previousValue === 0) {
      return undefined;
    }
    return ((currentValue - previousValue) / previousValue) * 100;
  },

  /**
   * Calculate simple moving average from an array of values
   * 
   * @param values - Array of numeric values
   * @returns Moving average or undefined if empty array
   */
  calculateSimpleMovingAverage(values: number[]): number | undefined {
    if (values.length === 0) {
      return undefined;
    }
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }
};
