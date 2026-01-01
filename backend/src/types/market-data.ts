/**
 * Market data types for AI analysis inputs.
 */

export interface PricePoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumePoint {
  timestamp: string;
  volume: number;
}

export interface MarketDataSnapshot {
  symbol: string;
  prices: PricePoint[];
  volume: VolumePoint[];
  timestamp: string;
}
