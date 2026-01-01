/**
 * On-Chain Metrics Types for Market Data Ingestion
 * Requirements: 5.2, 5.3
 */

import { SourceAdapter } from './source-adapter';

export type OnChainMetricType =
  | 'ACTIVE_ADDRESSES'
  | 'TRANSACTION_VOLUME'
  | 'EXCHANGE_INFLOW'
  | 'EXCHANGE_OUTFLOW'
  | 'WHALE_TRANSACTIONS'
  | 'NVT_RATIO'
  | 'MVRV_RATIO';

export interface OnChainMetric {
  metricId: string;
  symbol: string;
  network: string;
  metricType: OnChainMetricType;
  value: number;
  timestamp: string;
  change24h?: number;
  change7d?: number;
  movingAverage7d?: number;
  sourceId: string;
  qualityScore: number;
}

export interface OnChainAdapter extends SourceAdapter {
  getMetric(symbol: string, metricType: OnChainMetricType): Promise<OnChainMetric>;

  getMetricHistory(
    symbol: string,
    metricType: OnChainMetricType,
    startTime: string,
    endTime: string
  ): Promise<OnChainMetric[]>;

  getSupportedMetrics(symbol: string): Promise<OnChainMetricType[]>;
}
