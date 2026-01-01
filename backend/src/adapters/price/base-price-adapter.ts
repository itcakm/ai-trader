/**
 * Base Price Adapter - provides common price normalization logic for all price adapters
 * 
 * This abstract class implements the common functionality shared by all price adapters:
 * - Price normalization to common PricePoint format
 * - Quality score calculation
 * - Connection state management
 * - Subscription handling
 * 
 * Requirements: 2.2
 */

import { DataSourceType } from '../../types/data-source';
import { 
  SubscriptionHandle, 
  RawDataPoint, 
  DataCallback,
  HealthCheckResult 
} from '../../types/source-adapter';
import { PriceAdapter, PricePoint, PriceInterval } from '../../types/price';
import { generateUUID } from '../../utils/uuid';

/**
 * Raw OHLCV data from an exchange (before normalization)
 */
export interface RawOHLCV {
  symbol: string;
  timestamp: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
  quoteVolume?: number | string;
  trades?: number;
}

/**
 * Configuration for a price adapter
 */
export interface PriceAdapterConfig {
  sourceId: string;
  apiEndpoint: string;
  apiKey?: string;
  apiSecret?: string;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
}

/**
 * Abstract base class for price adapters
 */
export abstract class BasePriceAdapter implements PriceAdapter {
  readonly sourceType: DataSourceType = 'PRICE';
  
  protected config: PriceAdapterConfig;
  protected connected: boolean = false;
  protected subscriptions: Map<string, SubscriptionHandle> = new Map();

  constructor(config: PriceAdapterConfig) {
    this.config = config;
  }

  /**
   * Normalize raw OHLCV data to standard PricePoint format
   * 
   * Converts exchange-specific data formats to the common PricePoint interface.
   * Handles type coercion for numeric fields and calculates quality score.
   * 
   * @param raw - Raw OHLCV data from the exchange
   * @returns Normalized PricePoint
   */
  protected normalizePricePoint(raw: RawOHLCV): PricePoint {
    const timestamp = typeof raw.timestamp === 'number' 
      ? new Date(raw.timestamp).toISOString()
      : raw.timestamp;

    const open = this.toNumber(raw.open);
    const high = this.toNumber(raw.high);
    const low = this.toNumber(raw.low);
    const close = this.toNumber(raw.close);
    const volume = this.toNumber(raw.volume);
    const quoteVolume = raw.quoteVolume !== undefined 
      ? this.toNumber(raw.quoteVolume) 
      : undefined;

    const qualityScore = this.calculateQualityScore({ open, high, low, close, volume });

    return {
      symbol: raw.symbol,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume,
      trades: raw.trades,
      sourceId: this.config.sourceId,
      qualityScore
    };
  }

  /**
   * Convert a value to a number
   */
  protected toNumber(value: number | string): number {
    return typeof value === 'string' ? parseFloat(value) : value;
  }

  /**
   * Calculate quality score for a price point
   * 
   * Quality is based on:
   * - Data completeness (all fields present)
   * - Value validity (no NaN, no negative prices)
   * - OHLC consistency (high >= low, high >= open/close, low <= open/close)
   * 
   * @param data - The price data to evaluate
   * @returns Quality score between 0 and 1
   */
  protected calculateQualityScore(data: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }): number {
    let score = 1.0;

    // Check for NaN values
    if (isNaN(data.open) || isNaN(data.high) || isNaN(data.low) || 
        isNaN(data.close) || isNaN(data.volume)) {
      score -= 0.5;
    }

    // Check for negative values (invalid for prices)
    if (data.open < 0 || data.high < 0 || data.low < 0 || 
        data.close < 0 || data.volume < 0) {
      score -= 0.3;
    }

    // Check OHLC consistency
    if (data.high < data.low) {
      score -= 0.2;
    }
    if (data.high < data.open || data.high < data.close) {
      score -= 0.1;
    }
    if (data.low > data.open || data.low > data.close) {
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Validate that a price point has all required fields
   */
  protected validatePricePoint(price: PricePoint): boolean {
    return (
      typeof price.symbol === 'string' && price.symbol.length > 0 &&
      typeof price.timestamp === 'string' && price.timestamp.length > 0 &&
      typeof price.open === 'number' && !isNaN(price.open) &&
      typeof price.high === 'number' && !isNaN(price.high) &&
      typeof price.low === 'number' && !isNaN(price.low) &&
      typeof price.close === 'number' && !isNaN(price.close) &&
      typeof price.volume === 'number' && !isNaN(price.volume) &&
      typeof price.sourceId === 'string' && price.sourceId.length > 0 &&
      typeof price.qualityScore === 'number' && price.qualityScore >= 0 && price.qualityScore <= 1
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
  abstract subscribeToPrices(
    symbols: string[], 
    interval: string, 
    callback: (price: PricePoint) => void
  ): Promise<SubscriptionHandle>;
  abstract getOHLCV(
    symbol: string, 
    interval: string, 
    startTime: string, 
    endTime: string
  ): Promise<PricePoint[]>;
  abstract getLatestPrice(symbol: string): Promise<PricePoint>;

  isConnected(): boolean {
    return this.connected;
  }

  getSourceId(): string {
    return this.config.sourceId;
  }
}
