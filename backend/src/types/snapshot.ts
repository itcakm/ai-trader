/**
 * MarketDataSnapshot Types for Market Data Ingestion
 * Requirements: 6.1
 */

import { DataSourceType } from './data-source';
import { NewsContext } from './news-context';
import { OnChainMetric } from './on-chain';
import { PricePoint } from './price';
import { SentimentData } from './sentiment';

export interface DataCompleteness {
  hasPrices: boolean;
  hasNews: boolean;
  hasSentiment: boolean;
  hasOnChain: boolean;
  missingTypes: DataSourceType[];
}

export interface MarketDataSnapshot {
  snapshotId: string;
  symbol: string;
  timestamp: string;
  timeframe: string;
  prices: PricePoint[];
  latestPrice: PricePoint;
  newsContext: NewsContext;
  sentiment: SentimentData | null;
  onChainMetrics: OnChainMetric[];
  qualityScore: number;
  dataCompleteness: DataCompleteness;
  assembledAt: string;
  cachedUntil?: string;
}

export interface SnapshotOptions {
  includePrices: boolean;
  includeNews: boolean;
  includeSentiment: boolean;
  includeOnChain: boolean;
  newsTimeWindowHours: number;
  maxNewsEvents: number;
}

export interface SnapshotService {
  assembleSnapshot(
    symbol: string,
    timeframe: string,
    options?: SnapshotOptions
  ): Promise<MarketDataSnapshot>;

  getCachedSnapshot(
    symbol: string,
    timeframe: string
  ): Promise<MarketDataSnapshot | null>;

  invalidateCache(symbol: string): Promise<void>;
}
