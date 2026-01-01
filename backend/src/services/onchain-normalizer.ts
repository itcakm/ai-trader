/**
 * On-Chain Normalizer Service - normalizes on-chain metric data to standard format
 * 
 * This service handles:
 * - Metric type normalization to standard enum values
 * - Value validation and normalization
 * - Network inference from symbols
 * - Quality score calculation
 * - Association with symbols and timestamps
 * 
 * Requirements: 5.2, 5.3, 5.4
 */

import { OnChainMetric, OnChainMetricType } from '../types/on-chain';
import { generateUUID } from '../utils/uuid';

/**
 * Raw on-chain metric input from various providers
 */
export interface RawOnChainInput {
  symbol: string;
  network?: string;
  metricType: string;
  value: number;
  timestamp?: string;
  change24h?: number;
  change7d?: number;
  movingAverage7d?: number;
  sourceId: string;
}

/**
 * Normalization result with validation status
 */
export interface OnChainNormalizationResult {
  success: boolean;
  data?: OnChainMetric;
  errors: string[];
  warnings: string[];
}

/**
 * Valid on-chain metric types
 */
export const VALID_METRIC_TYPES: OnChainMetricType[] = [
  'ACTIVE_ADDRESSES',
  'TRANSACTION_VOLUME',
  'EXCHANGE_INFLOW',
  'EXCHANGE_OUTFLOW',
  'WHALE_TRANSACTIONS',
  'NVT_RATIO',
  'MVRV_RATIO'
];

/**
 * Mapping of common metric type aliases to standard types
 */
export const METRIC_TYPE_ALIASES: Record<string, OnChainMetricType> = {
  // Standard types
  'ACTIVE_ADDRESSES': 'ACTIVE_ADDRESSES',
  'TRANSACTION_VOLUME': 'TRANSACTION_VOLUME',
  'EXCHANGE_INFLOW': 'EXCHANGE_INFLOW',
  'EXCHANGE_OUTFLOW': 'EXCHANGE_OUTFLOW',
  'WHALE_TRANSACTIONS': 'WHALE_TRANSACTIONS',
  'NVT_RATIO': 'NVT_RATIO',
  'MVRV_RATIO': 'MVRV_RATIO',
  // Snake case aliases
  'active_addresses': 'ACTIVE_ADDRESSES',
  'transaction_volume': 'TRANSACTION_VOLUME',
  'exchange_inflow': 'EXCHANGE_INFLOW',
  'exchange_outflow': 'EXCHANGE_OUTFLOW',
  'whale_transactions': 'WHALE_TRANSACTIONS',
  'nvt_ratio': 'NVT_RATIO',
  'mvrv_ratio': 'MVRV_RATIO',
  // Camel case aliases
  'activeAddresses': 'ACTIVE_ADDRESSES',
  'transactionVolume': 'TRANSACTION_VOLUME',
  'exchangeInflow': 'EXCHANGE_INFLOW',
  'exchangeOutflow': 'EXCHANGE_OUTFLOW',
  'whaleTransactions': 'WHALE_TRANSACTIONS',
  'nvtRatio': 'NVT_RATIO',
  'mvrvRatio': 'MVRV_RATIO',
  // Common abbreviations
  'tx_volume': 'TRANSACTION_VOLUME',
  'txVolume': 'TRANSACTION_VOLUME',
  'active_addr': 'ACTIVE_ADDRESSES',
  'activeAddr': 'ACTIVE_ADDRESSES',
  'whale_tx': 'WHALE_TRANSACTIONS',
  'whaleTx': 'WHALE_TRANSACTIONS'
};

/**
 * Network mapping for common symbols
 */
export const SYMBOL_NETWORK_MAP: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'ADA': 'cardano',
  'DOT': 'polkadot',
  'AVAX': 'avalanche',
  'MATIC': 'polygon',
  'LINK': 'ethereum',
  'UNI': 'ethereum',
  'AAVE': 'ethereum',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'ATOM': 'cosmos',
  'NEAR': 'near',
  'FTM': 'fantom',
  'ALGO': 'algorand'
};

/**
 * On-Chain Normalizer Service
 */
export const OnChainNormalizer = {
  /**
   * Normalize raw on-chain input to standard OnChainMetric format
   * 
   * Converts metric types from various formats to the standard enum.
   * Validates all required fields and calculates quality score.
   * 
   * Requirements: 5.2, 5.3
   * 
   * @param input - Raw on-chain input from a provider
   * @returns Normalization result with data or errors
   */
  normalize(input: RawOnChainInput): OnChainNormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!input.symbol || input.symbol.trim().length === 0) {
      errors.push('Symbol is required');
    }
    if (!input.metricType || input.metricType.trim().length === 0) {
      errors.push('Metric type is required');
    }
    if (input.value === undefined || input.value === null || isNaN(input.value)) {
      errors.push('Value is required and must be a valid number');
    }
    if (!input.sourceId || input.sourceId.trim().length === 0) {
      errors.push('Source ID is required');
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings };
    }

    // Normalize metric type
    const normalizedMetricType = this.normalizeMetricType(input.metricType);
    if (!normalizedMetricType) {
      errors.push(`Unknown metric type: ${input.metricType}`);
      return { success: false, errors, warnings };
    }

    // Infer network if not provided
    const network = input.network || this.inferNetwork(input.symbol);
    if (!input.network) {
      warnings.push(`Network inferred as '${network}' from symbol '${input.symbol}'`);
    }

    // Validate value based on metric type
    const valueValidation = this.validateValue(input.value, normalizedMetricType);
    if (!valueValidation.valid) {
      warnings.push(valueValidation.message!);
    }

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(input, normalizedMetricType);

    const onChainMetric: OnChainMetric = {
      metricId: generateUUID(),
      symbol: input.symbol.toUpperCase().trim(),
      network,
      metricType: normalizedMetricType,
      value: input.value,
      timestamp: input.timestamp || new Date().toISOString(),
      change24h: input.change24h,
      change7d: input.change7d,
      movingAverage7d: input.movingAverage7d,
      sourceId: input.sourceId,
      qualityScore
    };

    return { success: true, data: onChainMetric, errors, warnings };
  },

  /**
   * Normalize metric type string to valid OnChainMetricType enum
   * 
   * Requirements: 5.2
   * 
   * @param metricType - Raw metric type string from provider
   * @returns Normalized OnChainMetricType or null if not recognized
   */
  normalizeMetricType(metricType: string): OnChainMetricType | null {
    const trimmed = metricType.trim();
    
    // Check aliases first
    if (METRIC_TYPE_ALIASES[trimmed]) {
      return METRIC_TYPE_ALIASES[trimmed];
    }

    // Check if it's already a valid type (case-insensitive)
    const upperCase = trimmed.toUpperCase();
    if (VALID_METRIC_TYPES.includes(upperCase as OnChainMetricType)) {
      return upperCase as OnChainMetricType;
    }

    return null;
  },

  /**
   * Check if a metric type string is valid
   * 
   * @param metricType - Metric type string to validate
   * @returns True if valid
   */
  isValidMetricType(metricType: string): boolean {
    return this.normalizeMetricType(metricType) !== null;
  },

  /**
   * Infer the network from a symbol
   * 
   * Requirements: 5.4
   * 
   * @param symbol - The cryptocurrency symbol
   * @returns The inferred network name
   */
  inferNetwork(symbol: string): string {
    const upperSymbol = symbol.toUpperCase().trim();
    return SYMBOL_NETWORK_MAP[upperSymbol] || 'unknown';
  },

  /**
   * Validate value based on metric type
   * 
   * Requirements: 5.3
   * 
   * @param value - The metric value
   * @param metricType - The metric type
   * @returns Validation result
   */
  validateValue(value: number, metricType: OnChainMetricType): { valid: boolean; message?: string } {
    // Most metrics should be non-negative
    const nonNegativeMetrics: OnChainMetricType[] = [
      'ACTIVE_ADDRESSES',
      'TRANSACTION_VOLUME',
      'EXCHANGE_INFLOW',
      'EXCHANGE_OUTFLOW',
      'WHALE_TRANSACTIONS'
    ];

    if (nonNegativeMetrics.includes(metricType) && value < 0) {
      return {
        valid: false,
        message: `${metricType} should be non-negative, got ${value}`
      };
    }

    // Ratio metrics can be any value but typically have expected ranges
    if (metricType === 'NVT_RATIO' && (value < 0 || value > 1000)) {
      return {
        valid: true,
        message: `NVT_RATIO value ${value} is outside typical range (0-1000)`
      };
    }

    if (metricType === 'MVRV_RATIO' && (value < 0 || value > 10)) {
      return {
        valid: true,
        message: `MVRV_RATIO value ${value} is outside typical range (0-10)`
      };
    }

    return { valid: true };
  },

  /**
   * Calculate quality score for on-chain metric data
   * 
   * Quality is based on:
   * - Data completeness (required fields present)
   * - Value validity
   * - Network presence
   * - Derived metrics presence
   * 
   * Requirements: 5.4
   * 
   * @param input - Raw on-chain input
   * @param metricType - Normalized metric type
   * @returns Quality score between 0 and 1
   */
  calculateQualityScore(input: RawOnChainInput, metricType: OnChainMetricType): number {
    let score = 1.0;

    // Check required fields completeness
    if (!input.symbol || input.symbol.trim().length === 0) {
      score -= 0.3;
    }
    if (input.value === undefined || isNaN(input.value)) {
      score -= 0.3;
    }
    if (!input.timestamp) {
      score -= 0.05;
    }

    // Check value validity
    const valueValidation = this.validateValue(input.value, metricType);
    if (!valueValidation.valid) {
      score -= 0.1;
    }

    // Check network presence
    if (!input.network) {
      score -= 0.05;
    }

    // Bonus for having derived metrics
    if (input.change24h !== undefined && !isNaN(input.change24h)) {
      score += 0.03;
    }
    if (input.change7d !== undefined && !isNaN(input.change7d)) {
      score += 0.03;
    }
    if (input.movingAverage7d !== undefined && !isNaN(input.movingAverage7d)) {
      score += 0.04;
    }

    return Math.max(0, Math.min(1, score));
  },

  /**
   * Validate that on-chain metric data has all required fields and valid values
   * 
   * Requirements: 5.2, 5.3, 5.4
   * 
   * @param data - On-chain metric data to validate
   * @returns Validation result with any errors
   */
  validate(data: OnChainMetric): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required string fields
    if (!data.metricId || data.metricId.trim().length === 0) {
      errors.push('metricId is required');
    }
    if (!data.symbol || data.symbol.trim().length === 0) {
      errors.push('symbol is required');
    }
    if (!data.network || data.network.trim().length === 0) {
      errors.push('network is required');
    }
    if (!data.timestamp || data.timestamp.trim().length === 0) {
      errors.push('timestamp is required');
    }
    if (!data.sourceId || data.sourceId.trim().length === 0) {
      errors.push('sourceId is required');
    }

    // Check metricType is valid
    if (!VALID_METRIC_TYPES.includes(data.metricType)) {
      errors.push(`metricType must be one of: ${VALID_METRIC_TYPES.join(', ')}`);
    }

    // Check value
    if (typeof data.value !== 'number' || isNaN(data.value)) {
      errors.push('value must be a valid number');
    }

    // Check qualityScore bounds
    if (typeof data.qualityScore !== 'number' || isNaN(data.qualityScore)) {
      errors.push('qualityScore must be a valid number');
    } else if (data.qualityScore < 0 || data.qualityScore > 1) {
      errors.push('qualityScore must be between 0 and 1');
    }

    // Check optional derived metrics if present
    if (data.change24h !== undefined && (typeof data.change24h !== 'number' || isNaN(data.change24h))) {
      errors.push('change24h must be a valid number if provided');
    }
    if (data.change7d !== undefined && (typeof data.change7d !== 'number' || isNaN(data.change7d))) {
      errors.push('change7d must be a valid number if provided');
    }
    if (data.movingAverage7d !== undefined && (typeof data.movingAverage7d !== 'number' || isNaN(data.movingAverage7d))) {
      errors.push('movingAverage7d must be a valid number if provided');
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Batch normalize multiple on-chain inputs
   * 
   * @param inputs - Array of raw on-chain inputs
   * @returns Array of normalization results
   */
  batchNormalize(inputs: RawOnChainInput[]): OnChainNormalizationResult[] {
    return inputs.map(input => this.normalize(input));
  },

  /**
   * Get all supported metric types
   * 
   * Requirements: 5.3
   * 
   * @returns Array of all valid metric types
   */
  getSupportedMetricTypes(): OnChainMetricType[] {
    return [...VALID_METRIC_TYPES];
  },

  /**
   * Get all known networks
   * 
   * @returns Array of all known network names
   */
  getKnownNetworks(): string[] {
    return [...new Set(Object.values(SYMBOL_NETWORK_MAP))];
  }
};
