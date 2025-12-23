/**
 * Price Data Types for Market Data Ingestion
 * Requirements: 2.2
 */

import { SourceAdapter, SubscriptionHandle } from './source-adapter';

export type PriceInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type PriceFeedStatus = 'ACTIVE' | 'PAUSED' | 'ERROR';

export interface PricePoint {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  trades?: number;
  sourceId: string;
  qualityScore: number;
}

export interface PriceFeed {
  feedId: string;
  symbol: string;
  exchange: string;
  interval: PriceInterval;
  status: PriceFeedStatus;
  lastUpdate: string;
  latencyMs: number;
}

export interface PriceAdapter extends SourceAdapter {
  subscribeToPrices(
    symbols: string[],
    interval: string,
    callback: (price: PricePoint) => void
  ): Promise<SubscriptionHandle>;

  getOHLCV(
    symbol: string,
    interval: string,
    startTime: string,
    endTime: string
  ): Promise<PricePoint[]>;

  getLatestPrice(symbol: string): Promise<PricePoint>;
}
