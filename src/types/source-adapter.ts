/**
 * Source Adapter Interface for Market Data Ingestion
 * Requirements: 1.1, 1.3
 */

import { DataSourceType } from './data-source';

export interface RawDataPoint {
  sourceId: string;
  type: DataSourceType;
  symbol: string;
  timestamp: string;
  data: unknown;
}

export type DataCallback = (data: RawDataPoint) => void;

export interface SubscriptionHandle {
  id: string;
  symbols: string[];
  sourceId: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  message?: string;
  checkedAt: string;
}

export interface SourceAdapter {
  readonly sourceType: DataSourceType;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle>;
  unsubscribe(handle: SubscriptionHandle): Promise<void>;
  fetchHistorical(symbol: string, startTime: string, endTime: string): Promise<RawDataPoint[]>;

  healthCheck(): Promise<HealthCheckResult>;
}
