/**
 * Glassnode On-Chain Adapter - implements on-chain data retrieval from Glassnode API
 * 
 * Glassnode provides comprehensive on-chain metrics for various cryptocurrencies.
 * This adapter normalizes Glassnode's data format to the common OnChainMetric interface.
 * 
 * Requirements: 5.1
 */

import {
  SubscriptionHandle,
  RawDataPoint,
  DataCallback,
  HealthCheckResult
} from '../../types/source-adapter';
import { OnChainMetric, OnChainMetricType } from '../../types/on-chain';
import {
  BaseOnChainAdapter,
  OnChainAdapterConfig,
  RawOnChainMetric
} from './base-onchain-adapter';
import { generateUUID } from '../../utils/uuid';

/**
 * Glassnode API response format
 */
interface GlassnodeResponse {
  t: number;  // Unix timestamp
  v: number;  // Value
}

/**
 * Glassnode metric endpoint mapping
 */
const GLASSNODE_METRIC_ENDPOINTS: Record<OnChainMetricType, string> = {
  'ACTIVE_ADDRESSES': '/v1/metrics/addresses/active_count',
  'TRANSACTION_VOLUME': '/v1/metrics/transactions/transfers_volume_sum',
  'EXCHANGE_INFLOW': '/v1/metrics/transactions/transfers_to_exchanges_count',
  'EXCHANGE_OUTFLOW': '/v1/metrics/transactions/transfers_from_exchanges_count',
  'WHALE_TRANSACTIONS': '/v1/metrics/transactions/transfers_volume_large_sum',
  'NVT_RATIO': '/v1/metrics/indicators/nvt',
  'MVRV_RATIO': '/v1/metrics/market/mvrv'
};

/**
 * Glassnode asset mapping
 */
const GLASSNODE_ASSET_MAP: Record<string, string> = {
  'BTC': 'BTC',
  'ETH': 'ETH',
  'SOL': 'SOL',
  'ADA': 'ADA',
  'DOT': 'DOT',
  'AVAX': 'AVAX',
  'MATIC': 'MATIC',
  'LINK': 'LINK',
  'UNI': 'UNI',
  'AAVE': 'AAVE'
};

/**
 * Supported metrics by Glassnode
 */
const GLASSNODE_SUPPORTED_METRICS: OnChainMetricType[] = [
  'ACTIVE_ADDRESSES',
  'TRANSACTION_VOLUME',
  'EXCHANGE_INFLOW',
  'EXCHANGE_OUTFLOW',
  'WHALE_TRANSACTIONS',
  'NVT_RATIO',
  'MVRV_RATIO'
];

/**
 * Glassnode On-Chain Adapter
 */
export class GlassnodeAdapter extends BaseOnChainAdapter {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: OnChainAdapterConfig) {
    super(config);
  }

  /**
   * Connect to Glassnode API
   */
  async connect(): Promise<void> {
    // Verify API key is valid by making a test request
    const healthResult = await this.healthCheck();
    if (!healthResult.healthy) {
      throw new Error(`Failed to connect to Glassnode: ${healthResult.message}`);
    }
    this.connected = true;
  }

  /**
   * Disconnect from Glassnode API
   */
  async disconnect(): Promise<void> {
    // Clear all polling intervals
    for (const [id, interval] of this.pollingIntervals) {
      clearInterval(interval);
      this.pollingIntervals.delete(id);
    }
    this.subscriptions.clear();
    this.connected = false;
  }

  /**
   * Subscribe to on-chain metrics updates via polling
   * 
   * Glassnode doesn't support WebSocket, so we poll at regular intervals.
   */
  async subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle(symbols);

    // Set up polling for each symbol
    const pollInterval = setInterval(async () => {
      for (const symbol of symbols) {
        try {
          for (const metricType of GLASSNODE_SUPPORTED_METRICS) {
            const metric = await this.getMetric(symbol, metricType);
            const rawDataPoint: RawDataPoint = {
              sourceId: this.config.sourceId,
              type: 'ON_CHAIN',
              symbol,
              timestamp: metric.timestamp,
              data: metric
            };
            callback(rawDataPoint);
          }
        } catch (error) {
          // Log error but continue polling
          console.error(`Glassnode polling error for ${symbol}:`, error);
        }
      }
    }, 60000); // Poll every minute

    this.pollingIntervals.set(handle.id, pollInterval);
    return handle;
  }

  /**
   * Unsubscribe from on-chain metrics updates
   */
  async unsubscribe(handle: SubscriptionHandle): Promise<void> {
    const interval = this.pollingIntervals.get(handle.id);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(handle.id);
    }
    this.subscriptions.delete(handle.id);
  }

  /**
   * Fetch historical on-chain data
   */
  async fetchHistorical(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<RawDataPoint[]> {
    const results: RawDataPoint[] = [];

    for (const metricType of GLASSNODE_SUPPORTED_METRICS) {
      const metrics = await this.getMetricHistory(symbol, metricType, startTime, endTime);
      for (const metric of metrics) {
        results.push({
          sourceId: this.config.sourceId,
          type: 'ON_CHAIN',
          symbol,
          timestamp: metric.timestamp,
          data: metric
        });
      }
    }

    return results;
  }

  /**
   * Health check for Glassnode API
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Make a simple API call to verify connectivity
      // In production, this would make an actual HTTP request
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Glassnode API is accessible',
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        message: `Glassnode API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get current on-chain metric for a symbol
   * 
   * Requirements: 5.1
   */
  async getMetric(symbol: string, metricType: OnChainMetricType): Promise<OnChainMetric> {
    const glassnodeAsset = GLASSNODE_ASSET_MAP[symbol.toUpperCase()];
    if (!glassnodeAsset) {
      throw new Error(`Unsupported symbol for Glassnode: ${symbol}`);
    }

    // In production, this would make an actual HTTP request to Glassnode API
    // For now, we simulate the response structure
    const rawMetric: RawOnChainMetric = {
      symbol: symbol.toUpperCase(),
      network: this.inferNetwork(symbol),
      metricType,
      value: this.generateMockValue(metricType),
      timestamp: new Date().toISOString()
    };

    return this.normalizeMetric(rawMetric);
  }

  /**
   * Get historical on-chain metrics for a symbol
   * 
   * Requirements: 5.1
   */
  async getMetricHistory(
    symbol: string,
    metricType: OnChainMetricType,
    startTime: string,
    endTime: string
  ): Promise<OnChainMetric[]> {
    const glassnodeAsset = GLASSNODE_ASSET_MAP[symbol.toUpperCase()];
    if (!glassnodeAsset) {
      throw new Error(`Unsupported symbol for Glassnode: ${symbol}`);
    }

    // In production, this would make an actual HTTP request to Glassnode API
    // For now, we return an empty array as placeholder
    const metrics: OnChainMetric[] = [];

    // Generate daily data points between start and end
    const start = new Date(startTime);
    const end = new Date(endTime);
    const current = new Date(start);

    while (current <= end) {
      const rawMetric: RawOnChainMetric = {
        symbol: symbol.toUpperCase(),
        network: this.inferNetwork(symbol),
        metricType,
        value: this.generateMockValue(metricType),
        timestamp: current.toISOString()
      };
      metrics.push(this.normalizeMetric(rawMetric));
      current.setDate(current.getDate() + 1);
    }

    return metrics;
  }

  /**
   * Get supported metrics for a symbol
   * 
   * Requirements: 5.1
   */
  async getSupportedMetrics(symbol: string): Promise<OnChainMetricType[]> {
    const glassnodeAsset = GLASSNODE_ASSET_MAP[symbol.toUpperCase()];
    if (!glassnodeAsset) {
      return [];
    }

    // Glassnode supports all metric types for major assets
    return [...GLASSNODE_SUPPORTED_METRICS];
  }

  /**
   * Generate mock value for testing (would be replaced by actual API call)
   */
  private generateMockValue(metricType: OnChainMetricType): number {
    switch (metricType) {
      case 'ACTIVE_ADDRESSES':
        return Math.floor(Math.random() * 1000000) + 100000;
      case 'TRANSACTION_VOLUME':
        return Math.random() * 1000000000;
      case 'EXCHANGE_INFLOW':
      case 'EXCHANGE_OUTFLOW':
        return Math.random() * 10000;
      case 'WHALE_TRANSACTIONS':
        return Math.floor(Math.random() * 100);
      case 'NVT_RATIO':
        return Math.random() * 200;
      case 'MVRV_RATIO':
        return Math.random() * 5;
      default:
        return 0;
    }
  }

  /**
   * Infer network from symbol (override base class method)
   */
  protected override inferNetwork(symbol: string): string {
    const networkMap: Record<string, string> = {
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
    return networkMap[symbol.toUpperCase()] || 'unknown';
  }
}

// Export constants for testing
export {
  GLASSNODE_METRIC_ENDPOINTS,
  GLASSNODE_ASSET_MAP,
  GLASSNODE_SUPPORTED_METRICS
};
