/**
 * Base On-Chain Adapter - provides common metric normalization logic for all on-chain adapters
 * 
 * This abstract class implements the common functionality shared by all on-chain adapters:
 * - Metric normalization to common format
 * - Quality score calculation
 * - Connection state management
 * - Subscription handling
 * 
 * Requirements: 5.1, 5.2
 */

import { DataSourceType } from '../../types/data-source';
import {
  SubscriptionHandle,
  RawDataPoint,
  DataCallback,
  HealthCheckResult
} from '../../types/source-adapter';
import { OnChainAdapter, OnChainMetric, OnChainMetricType } from '../../types/on-chain';
import { generateUUID } from '../../utils/uuid';

/**
 * Raw on-chain metric data from a provider (before normalization)
 */
export interface RawOnChainMetric {
  symbol: string;
  network?: string;
  metricType: string;
  value: number;
  timestamp: string | number;
  change24h?: number;
  change7d?: number;
  movingAverage7d?: number;
}

/**
 * Configuration for an on-chain adapter
 */
export interface OnChainAdapterConfig {
  sourceId: string;
  apiEndpoint: string;
  apiKey?: string;
  apiSecret?: string;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
}

/**
 * Mapping of common metric type aliases to standard types
 */
const METRIC_TYPE_ALIASES: Record<string, OnChainMetricType> = {
  'ACTIVE_ADDRESSES': 'ACTIVE_ADDRESSES',
  'active_addresses': 'ACTIVE_ADDRESSES',
  'activeAddresses': 'ACTIVE_ADDRESSES',
  'TRANSACTION_VOLUME': 'TRANSACTION_VOLUME',
  'transaction_volume': 'TRANSACTION_VOLUME',
  'transactionVolume': 'TRANSACTION_VOLUME',
  'tx_volume': 'TRANSACTION_VOLUME',
  'EXCHANGE_INFLOW': 'EXCHANGE_INFLOW',
  'exchange_inflow': 'EXCHANGE_INFLOW',
  'exchangeInflow': 'EXCHANGE_INFLOW',
  'EXCHANGE_OUTFLOW': 'EXCHANGE_OUTFLOW',
  'exchange_outflow': 'EXCHANGE_OUTFLOW',
  'exchangeOutflow': 'EXCHANGE_OUTFLOW',
  'WHALE_TRANSACTIONS': 'WHALE_TRANSACTIONS',
  'whale_transactions': 'WHALE_TRANSACTIONS',
  'whaleTransactions': 'WHALE_TRANSACTIONS',
  'NVT_RATIO': 'NVT_RATIO',
  'nvt_ratio': 'NVT_RATIO',
  'nvtRatio': 'NVT_RATIO',
  'MVRV_RATIO': 'MVRV_RATIO',
  'mvrv_ratio': 'MVRV_RATIO',
  'mvrvRatio': 'MVRV_RATIO'
};

/**
 * Valid on-chain metric types
 */
const VALID_METRIC_TYPES: OnChainMetricType[] = [
  'ACTIVE_ADDRESSES',
  'TRANSACTION_VOLUME',
  'EXCHANGE_INFLOW',
  'EXCHANGE_OUTFLOW',
  'WHALE_TRANSACTIONS',
  'NVT_RATIO',
  'MVRV_RATIO'
];

/**
 * Network mapping for common symbols
 */
const SYMBOL_NETWORK_MAP: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'ADA': 'cardano',
  'DOT': 'polkadot',
  'AVAX': 'avalanche',
  'MATIC': 'polygon',
  'LINK': 'ethereum',
  'UNI': 'ethereum',
  'AAVE': 'ethereum'
};

/**
 * Abstract base class for on-chain adapters
 */
export abstract class BaseOnChainAdapter implements OnChainAdapter {
  readonly sourceType: DataSourceType = 'ON_CHAIN';

  protected config: OnChainAdapterConfig;
  protected connected: boolean = false;
  protected subscriptions: Map<string, SubscriptionHandle> = new Map();

  constructor(config: OnChainAdapterConfig) {
    this.config = config;
  }

  /**
   * Normalize raw on-chain metric data to standard OnChainMetric format
   * 
   * Converts provider-specific data formats to the common OnChainMetric interface.
   * Normalizes metric types and calculates quality score.
   * 
   * Requirements: 5.2
   * 
   * @param raw - Raw on-chain metric data from the provider
   * @returns Normalized OnChainMetric
   */
  protected normalizeMetric(raw: RawOnChainMetric): OnChainMetric {
    const timestamp = typeof raw.timestamp === 'number'
      ? new Date(raw.timestamp).toISOString()
      : raw.timestamp;

    const metricType = this.normalizeMetricType(raw.metricType);
    const network = raw.network || this.inferNetwork(raw.symbol);
    const qualityScore = this.calculateQualityScore(raw);

    return {
      metricId: generateUUID(),
      symbol: raw.symbol.toUpperCase(),
      network,
      metricType,
      value: raw.value,
      timestamp,
      change24h: raw.change24h,
      change7d: raw.change7d,
      movingAverage7d: raw.movingAverage7d,
      sourceId: this.config.sourceId,
      qualityScore
    };
  }

  /**
   * Normalize metric type string to valid OnChainMetricType enum
   * 
   * @param metricType - Raw metric type string from provider
   * @returns Normalized OnChainMetricType
   * @throws Error if metric type is not recognized
   */
  protected normalizeMetricType(metricType: string): OnChainMetricType {
    const normalized = METRIC_TYPE_ALIASES[metricType];
    if (normalized) {
      return normalized;
    }

    // Check if it's already a valid type
    if (VALID_METRIC_TYPES.includes(metricType as OnChainMetricType)) {
      return metricType as OnChainMetricType;
    }

    throw new Error(`Unknown metric type: ${metricType}`);
  }

  /**
   * Check if a metric type string is valid
   * 
   * @param metricType - Metric type string to validate
   * @returns True if valid
   */
  protected isValidMetricType(metricType: string): boolean {
    return METRIC_TYPE_ALIASES[metricType] !== undefined ||
      VALID_METRIC_TYPES.includes(metricType as OnChainMetricType);
  }

  /**
   * Infer the network from a symbol
   * 
   * @param symbol - The cryptocurrency symbol
   * @returns The inferred network name
   */
  protected inferNetwork(symbol: string): string {
    const upperSymbol = symbol.toUpperCase();
    return SYMBOL_NETWORK_MAP[upperSymbol] || 'unknown';
  }

  /**
   * Calculate quality score for on-chain metric data
   * 
   * Quality is based on:
   * - Data completeness (required fields present)
   * - Value validity (non-negative for most metrics)
   * - Timestamp validity
   * - Derived metrics presence
   * 
   * @param data - The raw on-chain metric data to evaluate
   * @returns Quality score between 0 and 1
   */
  protected calculateQualityScore(data: RawOnChainMetric): number {
    let score = 1.0;

    // Check required fields
    if (!data.symbol || data.symbol.trim().length === 0) {
      score -= 0.3;
    }
    if (data.value === undefined || isNaN(data.value)) {
      score -= 0.3;
    }
    if (!data.timestamp) {
      score -= 0.1;
    }
    if (!data.metricType || !this.isValidMetricType(data.metricType)) {
      score -= 0.2;
    }

    // Check value validity (most metrics should be non-negative)
    if (data.value < 0 && !this.isRatioMetric(data.metricType)) {
      score -= 0.1;
    }

    // Bonus for having derived metrics
    if (data.change24h !== undefined) {
      score += 0.05;
    }
    if (data.change7d !== undefined) {
      score += 0.05;
    }
    if (data.movingAverage7d !== undefined) {
      score += 0.05;
    }

    // Check network presence
    if (!data.network) {
      score -= 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if a metric type is a ratio (can be negative)
   */
  protected isRatioMetric(metricType: string): boolean {
    const normalized = METRIC_TYPE_ALIASES[metricType] || metricType;
    return normalized === 'NVT_RATIO' || normalized === 'MVRV_RATIO';
  }

  /**
   * Validate that on-chain metric data has all required fields
   */
  protected validateMetric(data: OnChainMetric): boolean {
    return (
      typeof data.metricId === 'string' && data.metricId.length > 0 &&
      typeof data.symbol === 'string' && data.symbol.length > 0 &&
      typeof data.network === 'string' && data.network.length > 0 &&
      VALID_METRIC_TYPES.includes(data.metricType) &&
      typeof data.value === 'number' && !isNaN(data.value) &&
      typeof data.timestamp === 'string' && data.timestamp.length > 0 &&
      typeof data.sourceId === 'string' && data.sourceId.length > 0 &&
      typeof data.qualityScore === 'number' &&
      data.qualityScore >= 0 && data.qualityScore <= 1
    );
  }

  /**
   * Generate a unique subscription handle
   */
  protected createSubscriptionHandle(symbols: string[]): SubscriptionHandle {
    const handle: SubscriptionHandle = {
      id: generateUUID(),
      symbols,
      sourceId: this.config.sourceId
    };
    this.subscriptions.set(handle.id, handle);
    return handle;
  }

  // Abstract methods to be implemented by specific adapters
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle>;
  abstract unsubscribe(handle: SubscriptionHandle): Promise<void>;
  abstract fetchHistorical(symbol: string, startTime: string, endTime: string): Promise<RawDataPoint[]>;
  abstract healthCheck(): Promise<HealthCheckResult>;
  abstract getMetric(symbol: string, metricType: OnChainMetricType): Promise<OnChainMetric>;
  abstract getMetricHistory(
    symbol: string,
    metricType: OnChainMetricType,
    startTime: string,
    endTime: string
  ): Promise<OnChainMetric[]>;
  abstract getSupportedMetrics(symbol: string): Promise<OnChainMetricType[]>;

  isConnected(): boolean {
    return this.connected;
  }

  getSourceId(): string {
    return this.config.sourceId;
  }
}

// Export helper functions for testing
export {
  METRIC_TYPE_ALIASES,
  VALID_METRIC_TYPES,
  SYMBOL_NETWORK_MAP
};
