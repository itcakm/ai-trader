/**
 * Price Normalizer Service - normalizes price data to common format and detects anomalies
 * 
 * Provides:
 * - Normalization of price data from different exchanges to common PricePoint format
 * - Validation of price data against expected ranges
 * - Anomaly detection for price spikes, invalid values, and OHLC inconsistencies
 * 
 * Requirements: 2.2, 2.3
 */

import { PricePoint } from '../types/price';
import { DataAnomaly } from '../types/quality';

/**
 * Configuration for price normalization and validation
 */
export interface PriceNormalizerConfig {
  /** Maximum allowed price spike percentage (default: 50%) */
  maxPriceSpikePercent: number;
  /** Maximum allowed volume spike multiplier (default: 10x) */
  maxVolumeSpikeMultiplier: number;
  /** Minimum valid price (default: 0) */
  minValidPrice: number;
  /** Maximum valid price (default: 1,000,000,000) */
  maxValidPrice: number;
  /** Historical average volume for spike detection */
  averageVolume?: number;
  /** Previous price for spike detection */
  previousPrice?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PriceNormalizerConfig = {
  maxPriceSpikePercent: 50,
  maxVolumeSpikeMultiplier: 10,
  minValidPrice: 0,
  maxValidPrice: 1_000_000_000
};

/**
 * Result of price normalization
 */
export interface NormalizationResult {
  /** The normalized price point */
  pricePoint: PricePoint;
  /** Whether the price point is valid */
  isValid: boolean;
  /** List of detected anomalies */
  anomalies: DataAnomaly[];
  /** Quality score (0-1) */
  qualityScore: number;
}

/**
 * Raw price data input (before normalization)
 */
export interface RawPriceInput {
  symbol: string;
  timestamp: string | number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
  quoteVolume?: string | number;
  trades?: number;
  sourceId: string;
}

/**
 * Price Normalizer Service
 */
export const PriceNormalizerService = {
  /**
   * Normalize raw price data to standard PricePoint format
   * 
   * Converts various input formats to the common PricePoint interface,
   * validates the data, and detects anomalies.
   * 
   * @param input - Raw price data from an exchange
   * @param config - Optional configuration for validation thresholds
   * @returns Normalization result with price point, validity, and anomalies
   * 
   * Requirements: 2.2, 2.3
   */
  normalize(
    input: RawPriceInput,
    config: Partial<PriceNormalizerConfig> = {}
  ): NormalizationResult {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const anomalies: DataAnomaly[] = [];

    // Convert timestamp
    const timestamp = this.normalizeTimestamp(input.timestamp);

    // Convert numeric values
    const open = this.toNumber(input.open);
    const high = this.toNumber(input.high);
    const low = this.toNumber(input.low);
    const close = this.toNumber(input.close);
    const volume = this.toNumber(input.volume);
    const quoteVolume = input.quoteVolume !== undefined 
      ? this.toNumber(input.quoteVolume) 
      : undefined;

    // Detect anomalies
    anomalies.push(...this.detectAnomalies(
      { open, high, low, close, volume },
      fullConfig
    ));

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(
      { open, high, low, close, volume },
      anomalies
    );

    const pricePoint: PricePoint = {
      symbol: input.symbol,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume,
      trades: input.trades,
      sourceId: input.sourceId,
      qualityScore
    };

    const isValid = this.validatePricePoint(pricePoint, anomalies);

    return {
      pricePoint,
      isValid,
      anomalies,
      qualityScore
    };
  },

  /**
   * Normalize timestamp to ISO string format
   */
  normalizeTimestamp(timestamp: string | number): string {
    if (typeof timestamp === 'number') {
      // Handle both seconds and milliseconds
      const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
      return new Date(ms).toISOString();
    }
    // Validate and return ISO string
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return new Date().toISOString();
    }
    return date.toISOString();
  },

  /**
   * Convert value to number
   */
  toNumber(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  },

  /**
   * Detect anomalies in price data
   * 
   * Checks for:
   * - Invalid values (NaN, negative prices)
   * - OHLC inconsistencies (high < low, etc.)
   * - Price spikes (if previous price provided)
   * - Volume spikes (if average volume provided)
   * 
   * @param data - The price data to check
   * @param config - Configuration with thresholds
   * @returns List of detected anomalies
   * 
   * Requirements: 2.3
   */
  detectAnomalies(
    data: { open: number; high: number; low: number; close: number; volume: number },
    config: PriceNormalizerConfig
  ): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];
    const now = new Date().toISOString();

    // Check for NaN values
    if (isNaN(data.open) || isNaN(data.high) || isNaN(data.low) || 
        isNaN(data.close) || isNaN(data.volume)) {
      anomalies.push({
        anomalyId: `nan-${Date.now()}`,
        type: 'OUTLIER',
        severity: 'HIGH',
        description: 'Price data contains NaN values',
        detectedAt: now,
        dataPoint: data
      });
    }

    // Check for negative prices
    if (data.open < 0 || data.high < 0 || data.low < 0 || data.close < 0) {
      anomalies.push({
        anomalyId: `negative-price-${Date.now()}`,
        type: 'OUTLIER',
        severity: 'HIGH',
        description: 'Price data contains negative values',
        detectedAt: now,
        dataPoint: data
      });
    }

    // Check for negative volume
    if (data.volume < 0) {
      anomalies.push({
        anomalyId: `negative-volume-${Date.now()}`,
        type: 'OUTLIER',
        severity: 'MEDIUM',
        description: 'Volume is negative',
        detectedAt: now,
        dataPoint: data
      });
    }

    // Check OHLC consistency: high should be >= low
    if (data.high < data.low) {
      anomalies.push({
        anomalyId: `ohlc-inconsistent-hl-${Date.now()}`,
        type: 'INCONSISTENCY',
        severity: 'HIGH',
        description: 'High price is less than low price',
        detectedAt: now,
        dataPoint: data
      });
    }

    // Check OHLC consistency: high should be >= open and close
    if (data.high < data.open || data.high < data.close) {
      anomalies.push({
        anomalyId: `ohlc-inconsistent-h-${Date.now()}`,
        type: 'INCONSISTENCY',
        severity: 'MEDIUM',
        description: 'High price is less than open or close',
        detectedAt: now,
        dataPoint: data
      });
    }

    // Check OHLC consistency: low should be <= open and close
    if (data.low > data.open || data.low > data.close) {
      anomalies.push({
        anomalyId: `ohlc-inconsistent-l-${Date.now()}`,
        type: 'INCONSISTENCY',
        severity: 'MEDIUM',
        description: 'Low price is greater than open or close',
        detectedAt: now,
        dataPoint: data
      });
    }

    // Check price range validity
    if (data.close < config.minValidPrice || data.close > config.maxValidPrice) {
      anomalies.push({
        anomalyId: `price-range-${Date.now()}`,
        type: 'OUTLIER',
        severity: 'MEDIUM',
        description: `Price ${data.close} is outside valid range [${config.minValidPrice}, ${config.maxValidPrice}]`,
        detectedAt: now,
        dataPoint: data
      });
    }

    // Check for price spike (if previous price available)
    if (config.previousPrice !== undefined && config.previousPrice > 0) {
      const priceChange = Math.abs(data.close - config.previousPrice) / config.previousPrice * 100;
      if (priceChange > config.maxPriceSpikePercent) {
        anomalies.push({
          anomalyId: `price-spike-${Date.now()}`,
          type: 'PRICE_SPIKE',
          severity: 'HIGH',
          description: `Price changed ${priceChange.toFixed(2)}% from previous (threshold: ${config.maxPriceSpikePercent}%)`,
          detectedAt: now,
          dataPoint: { ...data, previousPrice: config.previousPrice, priceChange }
        });
      }
    }

    // Check for volume spike (if average volume available)
    if (config.averageVolume !== undefined && config.averageVolume > 0) {
      const volumeMultiplier = data.volume / config.averageVolume;
      if (volumeMultiplier > config.maxVolumeSpikeMultiplier) {
        anomalies.push({
          anomalyId: `volume-spike-${Date.now()}`,
          type: 'OUTLIER',
          severity: 'MEDIUM',
          description: `Volume is ${volumeMultiplier.toFixed(2)}x average (threshold: ${config.maxVolumeSpikeMultiplier}x)`,
          detectedAt: now,
          dataPoint: { ...data, averageVolume: config.averageVolume, volumeMultiplier }
        });
      }
    }

    return anomalies;
  },

  /**
   * Calculate quality score based on data validity and anomalies
   * 
   * @param data - The price data
   * @param anomalies - List of detected anomalies
   * @returns Quality score between 0 and 1
   */
  calculateQualityScore(
    data: { open: number; high: number; low: number; close: number; volume: number },
    anomalies: DataAnomaly[]
  ): number {
    let score = 1.0;

    // Deduct for each anomaly based on severity
    for (const anomaly of anomalies) {
      switch (anomaly.severity) {
        case 'HIGH':
          score -= 0.3;
          break;
        case 'MEDIUM':
          score -= 0.15;
          break;
        case 'LOW':
          score -= 0.05;
          break;
      }
    }

    // Additional checks for data completeness
    if (data.volume === 0) {
      score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  },

  /**
   * Validate that a price point meets minimum requirements
   * 
   * @param price - The price point to validate
   * @param anomalies - List of detected anomalies
   * @returns True if the price point is valid
   */
  validatePricePoint(price: PricePoint, anomalies: DataAnomaly[]): boolean {
    // Check required fields
    if (!price.symbol || price.symbol.length === 0) return false;
    if (!price.timestamp || price.timestamp.length === 0) return false;
    if (!price.sourceId || price.sourceId.length === 0) return false;

    // Check for critical anomalies (HIGH severity)
    const hasCriticalAnomaly = anomalies.some(a => 
      a.severity === 'HIGH' && 
      (a.type === 'OUTLIER' || a.type === 'INCONSISTENCY')
    );

    // Price is invalid if it has NaN values or negative prices
    if (isNaN(price.open) || isNaN(price.high) || isNaN(price.low) || 
        isNaN(price.close) || isNaN(price.volume)) {
      return false;
    }

    if (price.open < 0 || price.high < 0 || price.low < 0 || price.close < 0) {
      return false;
    }

    // Price is valid but flagged if it has anomalies
    return !hasCriticalAnomaly || price.qualityScore > 0.5;
  },

  /**
   * Batch normalize multiple price points
   * 
   * @param inputs - Array of raw price inputs
   * @param config - Optional configuration
   * @returns Array of normalization results
   */
  normalizeBatch(
    inputs: RawPriceInput[],
    config: Partial<PriceNormalizerConfig> = {}
  ): NormalizationResult[] {
    const results: NormalizationResult[] = [];
    let previousPrice: number | undefined;

    for (const input of inputs) {
      const result = this.normalize(input, {
        ...config,
        previousPrice
      });
      results.push(result);
      
      // Update previous price for next iteration
      if (result.isValid) {
        previousPrice = result.pricePoint.close;
      }
    }

    return results;
  }
};
