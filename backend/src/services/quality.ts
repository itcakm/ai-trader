/**
 * Data Quality Service - calculates quality scores and detects anomalies
 * 
 * Provides:
 * - Quality score calculation based on completeness, freshness, consistency, and accuracy
 * - Anomaly detection for price spikes, data gaps, stale data
 * - Quality threshold alerting
 * - Quality logging for historical analysis
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { generateUUID } from '../utils/uuid';
import { DataSourceType } from '../types/data-source';
import {
  DataQualityScore,
  QualityComponents,
  DataAnomaly,
  AnomalyType,
  AnomalySeverity
} from '../types/quality';

/**
 * Configuration for quality calculation
 */
export interface QualityConfig {
  /** Weight for completeness component (default: 0.3) */
  completenessWeight: number;
  /** Weight for freshness component (default: 0.3) */
  freshnessWeight: number;
  /** Weight for consistency component (default: 0.2) */
  consistencyWeight: number;
  /** Weight for accuracy component (default: 0.2) */
  accuracyWeight: number;
  /** Maximum age in seconds for data to be considered fresh (default: 300) */
  maxFreshnessAgeSeconds: number;
  /** Threshold for price spike detection as percentage (default: 50) */
  priceSpikeThresholdPercent: number;
  /** Threshold for stale data in seconds (default: 600) */
  staleDataThresholdSeconds: number;
}

/**
 * Default quality configuration
 */
const DEFAULT_CONFIG: QualityConfig = {
  completenessWeight: 0.3,
  freshnessWeight: 0.3,
  consistencyWeight: 0.2,
  accuracyWeight: 0.2,
  maxFreshnessAgeSeconds: 300,
  priceSpikeThresholdPercent: 50,
  staleDataThresholdSeconds: 600
};

/**
 * Input data for quality calculation
 */
export interface QualityInput {
  /** Total expected data points */
  expectedDataPoints: number;
  /** Actual data points received */
  actualDataPoints: number;
  /** Timestamp of most recent data point */
  latestDataTimestamp?: string;
  /** Array of data values for consistency checking */
  dataValues?: number[];
  /** Reference values for accuracy comparison */
  referenceValues?: number[];
  /** Previous data values for spike detection */
  previousValues?: number[];
  /** Timestamps of data points for gap detection */
  timestamps?: string[];
  /** Expected interval between data points in seconds */
  expectedIntervalSeconds?: number;
}

/**
 * Quality alert
 */
export interface QualityAlert {
  alertId: string;
  sourceId: string;
  symbol: string;
  dataType: DataSourceType;
  score: number;
  threshold: number;
  triggeredAt: string;
  components: QualityComponents;
  anomalies: DataAnomaly[];
}

/**
 * Quality log entry
 */
export interface QualityLogEntry {
  logId: string;
  scoreId: string;
  sourceId: string;
  symbol: string;
  dataType: DataSourceType;
  overallScore: number;
  components: QualityComponents;
  anomalyCount: number;
  timestamp: string;
}

/** Quality thresholds per data type */
const qualityThresholds: Map<DataSourceType, number> = new Map([
  ['PRICE', 0.7],
  ['NEWS', 0.6],
  ['SENTIMENT', 0.6],
  ['ON_CHAIN', 0.65]
]);

/** Alert handlers */
type AlertHandler = (alert: QualityAlert) => void;
const alertHandlers: AlertHandler[] = [];

/** Quality log storage (in production, this would be persisted) */
const qualityLogs: QualityLogEntry[] = [];


/**
 * Data Quality Service
 */
export const QualityService = {
  /**
   * Calculate quality score for a data source
   * 
   * Calculates a weighted quality score based on:
   * - Completeness: percentage of expected data points present
   * - Freshness: based on data age
   * - Consistency: based on value ranges and patterns
   * - Accuracy: based on cross-source validation
   * 
   * @param sourceId - The data source identifier
   * @param symbol - The symbol being evaluated
   * @param dataType - The type of data
   * @param input - Quality input data
   * @param config - Optional configuration overrides
   * @returns The calculated quality score
   * 
   * Requirements: 10.1
   */
  calculateQualityScore(
    sourceId: string,
    symbol: string,
    dataType: DataSourceType,
    input: QualityInput,
    config: Partial<QualityConfig> = {}
  ): DataQualityScore {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const now = new Date().toISOString();

    // Calculate individual components
    const completeness = this.calculateCompleteness(input);
    const freshness = this.calculateFreshness(input, fullConfig);
    const consistency = this.calculateConsistency(input);
    const accuracy = this.calculateAccuracy(input);

    const components: QualityComponents = {
      completeness,
      freshness,
      consistency,
      accuracy
    };

    // Detect anomalies
    const anomalies = this.detectAnomalies(input, fullConfig);

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore(components, anomalies, fullConfig);

    const qualityScore: DataQualityScore = {
      scoreId: generateUUID(),
      sourceId,
      symbol,
      dataType,
      timestamp: now,
      overallScore,
      components,
      anomalies
    };

    return qualityScore;
  },

  /**
   * Calculate completeness component
   * 
   * @param input - Quality input data
   * @returns Completeness score (0-1)
   */
  calculateCompleteness(input: QualityInput): number {
    if (input.expectedDataPoints <= 0) {
      return 1.0; // No data expected, consider complete
    }
    const ratio = input.actualDataPoints / input.expectedDataPoints;
    return Math.min(1.0, Math.max(0, ratio));
  },

  /**
   * Calculate freshness component
   * 
   * @param input - Quality input data
   * @param config - Quality configuration
   * @returns Freshness score (0-1)
   */
  calculateFreshness(input: QualityInput, config: QualityConfig): number {
    if (!input.latestDataTimestamp) {
      return 0; // No data timestamp, consider stale
    }

    const latestTime = new Date(input.latestDataTimestamp).getTime();
    const now = Date.now();
    const ageSeconds = (now - latestTime) / 1000;

    if (ageSeconds <= 0) {
      return 1.0; // Data is from the future or now, consider fresh
    }

    if (ageSeconds >= config.maxFreshnessAgeSeconds) {
      return 0; // Data is too old
    }

    // Linear decay from 1 to 0 as age increases
    return 1.0 - (ageSeconds / config.maxFreshnessAgeSeconds);
  },

  /**
   * Calculate consistency component
   * 
   * Checks for value consistency by analyzing variance and detecting outliers
   * 
   * @param input - Quality input data
   * @returns Consistency score (0-1)
   */
  calculateConsistency(input: QualityInput): number {
    if (!input.dataValues || input.dataValues.length < 2) {
      return 1.0; // Not enough data to check consistency
    }

    const values = input.dataValues.filter(v => !isNaN(v) && isFinite(v));
    if (values.length < 2) {
      return 1.0;
    }

    // Calculate mean and standard deviation
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Count outliers (values more than 3 standard deviations from mean)
    const outlierCount = values.filter(v => Math.abs(v - mean) > 3 * stdDev).length;
    const outlierRatio = outlierCount / values.length;

    // Score decreases with more outliers
    return Math.max(0, 1.0 - outlierRatio * 2);
  },

  /**
   * Calculate accuracy component
   * 
   * Compares data values against reference values for accuracy
   * 
   * @param input - Quality input data
   * @returns Accuracy score (0-1)
   */
  calculateAccuracy(input: QualityInput): number {
    if (!input.dataValues || !input.referenceValues) {
      return 1.0; // No reference data, assume accurate
    }

    const minLength = Math.min(input.dataValues.length, input.referenceValues.length);
    if (minLength === 0) {
      return 1.0;
    }

    let totalError = 0;
    let validComparisons = 0;

    for (let i = 0; i < minLength; i++) {
      const actual = input.dataValues[i];
      const reference = input.referenceValues[i];

      if (isNaN(actual) || isNaN(reference) || reference === 0) {
        continue;
      }

      // Calculate percentage error
      const percentError = Math.abs(actual - reference) / Math.abs(reference);
      totalError += percentError;
      validComparisons++;
    }

    if (validComparisons === 0) {
      return 1.0;
    }

    const avgError = totalError / validComparisons;
    // Score decreases with higher error (cap at 100% error)
    return Math.max(0, 1.0 - Math.min(1.0, avgError));
  },

  /**
   * Calculate overall weighted score
   * 
   * @param components - Quality components
   * @param anomalies - Detected anomalies
   * @param config - Quality configuration
   * @returns Overall quality score (0-1)
   */
  calculateOverallScore(
    components: QualityComponents,
    anomalies: DataAnomaly[],
    config: QualityConfig
  ): number {
    // Weighted average of components
    let score = 
      components.completeness * config.completenessWeight +
      components.freshness * config.freshnessWeight +
      components.consistency * config.consistencyWeight +
      components.accuracy * config.accuracyWeight;

    // Deduct for anomalies
    for (const anomaly of anomalies) {
      switch (anomaly.severity) {
        case 'HIGH':
          score -= 0.15;
          break;
        case 'MEDIUM':
          score -= 0.08;
          break;
        case 'LOW':
          score -= 0.03;
          break;
      }
    }

    return Math.max(0, Math.min(1.0, score));
  },

  /**
   * Detect anomalies in data
   * 
   * Detects:
   * - Price spikes (sudden large changes)
   * - Data gaps (missing data points)
   * - Stale data (data that hasn't been updated)
   * 
   * @param input - Quality input data
   * @param config - Quality configuration
   * @returns Array of detected anomalies
   * 
   * Requirements: 10.3
   */
  detectAnomalies(input: QualityInput, config: QualityConfig): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];
    const now = new Date().toISOString();

    // Detect price spikes
    if (input.dataValues && input.previousValues) {
      const spikeAnomalies = this.detectPriceSpikes(
        input.dataValues,
        input.previousValues,
        config.priceSpikeThresholdPercent,
        now
      );
      anomalies.push(...spikeAnomalies);
    }

    // Detect data gaps
    if (input.timestamps && input.expectedIntervalSeconds) {
      const gapAnomalies = this.detectDataGaps(
        input.timestamps,
        input.expectedIntervalSeconds,
        now
      );
      anomalies.push(...gapAnomalies);
    }

    // Detect stale data
    if (input.latestDataTimestamp) {
      const staleAnomaly = this.detectStaleData(
        input.latestDataTimestamp,
        config.staleDataThresholdSeconds,
        now
      );
      if (staleAnomaly) {
        anomalies.push(staleAnomaly);
      }
    }

    return anomalies;
  },

  /**
   * Detect price spikes
   * 
   * @param currentValues - Current data values
   * @param previousValues - Previous data values
   * @param thresholdPercent - Spike threshold percentage
   * @param timestamp - Detection timestamp
   * @returns Array of price spike anomalies
   */
  detectPriceSpikes(
    currentValues: number[],
    previousValues: number[],
    thresholdPercent: number,
    timestamp: string
  ): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];
    const minLength = Math.min(currentValues.length, previousValues.length);

    for (let i = 0; i < minLength; i++) {
      const current = currentValues[i];
      const previous = previousValues[i];

      if (isNaN(current) || isNaN(previous) || previous === 0) {
        continue;
      }

      const changePercent = Math.abs((current - previous) / previous) * 100;

      if (changePercent > thresholdPercent) {
        const severity: AnomalySeverity = 
          changePercent > thresholdPercent * 2 ? 'HIGH' :
          changePercent > thresholdPercent * 1.5 ? 'MEDIUM' : 'LOW';

        anomalies.push({
          anomalyId: generateUUID(),
          type: 'PRICE_SPIKE',
          severity,
          description: `Price changed ${changePercent.toFixed(2)}% (threshold: ${thresholdPercent}%)`,
          detectedAt: timestamp,
          dataPoint: { current, previous, changePercent }
        });
      }
    }

    return anomalies;
  },

  /**
   * Detect data gaps
   * 
   * @param timestamps - Array of data timestamps
   * @param expectedIntervalSeconds - Expected interval between data points
   * @param detectionTimestamp - Detection timestamp
   * @returns Array of data gap anomalies
   */
  detectDataGaps(
    timestamps: string[],
    expectedIntervalSeconds: number,
    detectionTimestamp: string
  ): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];

    if (timestamps.length < 2) {
      return anomalies;
    }

    // Sort timestamps
    const sortedTimestamps = [...timestamps].sort();
    const expectedIntervalMs = expectedIntervalSeconds * 1000;

    for (let i = 1; i < sortedTimestamps.length; i++) {
      const prevTime = new Date(sortedTimestamps[i - 1]).getTime();
      const currTime = new Date(sortedTimestamps[i]).getTime();
      const gap = currTime - prevTime;

      // Gap is significant if it's more than 2x the expected interval
      if (gap > expectedIntervalMs * 2) {
        const missedPoints = Math.floor(gap / expectedIntervalMs) - 1;
        const severity: AnomalySeverity = 
          missedPoints > 10 ? 'HIGH' :
          missedPoints > 5 ? 'MEDIUM' : 'LOW';

        anomalies.push({
          anomalyId: generateUUID(),
          type: 'DATA_GAP',
          severity,
          description: `Data gap detected: ${missedPoints} missing data points between ${sortedTimestamps[i - 1]} and ${sortedTimestamps[i]}`,
          detectedAt: detectionTimestamp,
          dataPoint: {
            startTime: sortedTimestamps[i - 1],
            endTime: sortedTimestamps[i],
            gapMs: gap,
            missedPoints
          }
        });
      }
    }

    return anomalies;
  },

  /**
   * Detect stale data
   * 
   * @param latestTimestamp - Timestamp of most recent data
   * @param thresholdSeconds - Stale threshold in seconds
   * @param detectionTimestamp - Detection timestamp
   * @returns Stale data anomaly or null
   */
  detectStaleData(
    latestTimestamp: string,
    thresholdSeconds: number,
    detectionTimestamp: string
  ): DataAnomaly | null {
    const latestTime = new Date(latestTimestamp).getTime();
    const now = Date.now();
    const ageSeconds = (now - latestTime) / 1000;

    if (ageSeconds > thresholdSeconds) {
      const severity: AnomalySeverity = 
        ageSeconds > thresholdSeconds * 3 ? 'HIGH' :
        ageSeconds > thresholdSeconds * 2 ? 'MEDIUM' : 'LOW';

      return {
        anomalyId: generateUUID(),
        type: 'STALE_DATA',
        severity,
        description: `Data is ${Math.round(ageSeconds)} seconds old (threshold: ${thresholdSeconds}s)`,
        detectedAt: detectionTimestamp,
        dataPoint: { latestTimestamp, ageSeconds }
      };
    }

    return null;
  },

  /**
   * Set quality threshold for a data type
   * 
   * @param dataType - The data type
   * @param threshold - The quality threshold (0-1)
   * 
   * Requirements: 10.2
   */
  setQualityThreshold(dataType: DataSourceType, threshold: number): void {
    const clampedThreshold = Math.max(0, Math.min(1, threshold));
    qualityThresholds.set(dataType, clampedThreshold);
  },

  /**
   * Get quality threshold for a data type
   * 
   * @param dataType - The data type
   * @returns The quality threshold
   */
  getQualityThreshold(dataType: DataSourceType): number {
    return qualityThresholds.get(dataType) ?? 0.7;
  },

  /**
   * Check quality and trigger alert if below threshold
   * 
   * @param qualityScore - The quality score to check
   * @returns True if alert was triggered
   * 
   * Requirements: 10.2
   */
  checkAndAlert(qualityScore: DataQualityScore): boolean {
    const threshold = this.getQualityThreshold(qualityScore.dataType);

    if (qualityScore.overallScore < threshold) {
      const alert: QualityAlert = {
        alertId: generateUUID(),
        sourceId: qualityScore.sourceId,
        symbol: qualityScore.symbol,
        dataType: qualityScore.dataType,
        score: qualityScore.overallScore,
        threshold,
        triggeredAt: new Date().toISOString(),
        components: qualityScore.components,
        anomalies: qualityScore.anomalies
      };

      // Trigger all registered alert handlers
      for (const handler of alertHandlers) {
        try {
          handler(alert);
        } catch (error) {
          // Log error but continue with other handlers
          console.error('Alert handler error:', error);
        }
      }

      return true;
    }

    return false;
  },

  /**
   * Register an alert handler
   * 
   * @param handler - The alert handler function
   */
  registerAlertHandler(handler: AlertHandler): void {
    alertHandlers.push(handler);
  },

  /**
   * Clear all alert handlers (for testing)
   */
  clearAlertHandlers(): void {
    alertHandlers.length = 0;
  },

  /**
   * Log quality assessment for historical analysis
   * 
   * @param qualityScore - The quality score to log
   * @returns The log entry
   * 
   * Requirements: 10.5
   */
  logQualityAssessment(qualityScore: DataQualityScore): QualityLogEntry {
    const logEntry: QualityLogEntry = {
      logId: generateUUID(),
      scoreId: qualityScore.scoreId,
      sourceId: qualityScore.sourceId,
      symbol: qualityScore.symbol,
      dataType: qualityScore.dataType,
      overallScore: qualityScore.overallScore,
      components: qualityScore.components,
      anomalyCount: qualityScore.anomalies.length,
      timestamp: new Date().toISOString()
    };

    qualityLogs.push(logEntry);

    // Keep only last 10000 entries (in production, this would be persisted)
    if (qualityLogs.length > 10000) {
      qualityLogs.shift();
    }

    return logEntry;
  },

  /**
   * Get quality history for a source
   * 
   * @param sourceId - The source identifier
   * @param periodMinutes - The time period in minutes
   * @returns Array of quality log entries
   */
  getQualityHistory(sourceId: string, periodMinutes: number = 60): QualityLogEntry[] {
    const cutoff = new Date(Date.now() - periodMinutes * 60 * 1000).toISOString();
    return qualityLogs.filter(
      log => log.sourceId === sourceId && log.timestamp >= cutoff
    );
  },

  /**
   * Get all quality logs (for testing)
   */
  getAllLogs(): QualityLogEntry[] {
    return [...qualityLogs];
  },

  /**
   * Clear all quality logs (for testing)
   */
  clearLogs(): void {
    qualityLogs.length = 0;
  },

  /**
   * Get default configuration
   */
  getDefaultConfig(): QualityConfig {
    return { ...DEFAULT_CONFIG };
  }
};
