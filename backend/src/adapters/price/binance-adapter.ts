/**
 * Binance Price Adapter - implements price data ingestion from Binance exchange
 * 
 * Provides:
 * - WebSocket subscription for real-time price updates
 * - REST API for historical OHLCV data
 * - Price normalization to common format
 * 
 * Requirements: 2.2, 2.5
 */

import { 
  SubscriptionHandle, 
  RawDataPoint, 
  DataCallback,
  HealthCheckResult 
} from '../../types/source-adapter';
import { PricePoint } from '../../types/price';
import { BasePriceAdapter, PriceAdapterConfig, RawOHLCV } from './base-price-adapter';

/**
 * Binance kline/candlestick data format
 */
interface BinanceKline {
  t: number;  // Open time
  T: number;  // Close time
  s: string;  // Symbol
  i: string;  // Interval
  o: string;  // Open price
  c: string;  // Close price
  h: string;  // High price
  l: string;  // Low price
  v: string;  // Base asset volume
  q: string;  // Quote asset volume
  n: number;  // Number of trades
}

/**
 * Binance WebSocket message format
 */
interface BinanceWsMessage {
  e: string;  // Event type
  E: number;  // Event time
  s: string;  // Symbol
  k: BinanceKline;
}

/**
 * Binance REST API kline response format (array)
 */
type BinanceRestKline = [
  number,  // 0: Open time
  string,  // 1: Open
  string,  // 2: High
  string,  // 3: Low
  string,  // 4: Close
  string,  // 5: Volume
  number,  // 6: Close time
  string,  // 7: Quote asset volume
  number,  // 8: Number of trades
  string,  // 9: Taker buy base asset volume
  string,  // 10: Taker buy quote asset volume
  string   // 11: Ignore
];

/**
 * Interval mapping from standard to Binance format
 */
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
};

/**
 * Binance Price Adapter implementation
 */
export class BinancePriceAdapter extends BasePriceAdapter {
  private wsConnections: Map<string, WebSocket> = new Map();
  private priceCallbacks: Map<string, (price: PricePoint) => void> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: PriceAdapterConfig) {
    super({
      ...config,
      apiEndpoint: config.apiEndpoint || 'https://api.binance.com'
    });
  }

  /**
   * Connect to Binance API
   */
  async connect(): Promise<void> {
    // Verify API connectivity with a simple request
    try {
      const response = await fetch(`${this.config.apiEndpoint}/api/v3/ping`);
      if (!response.ok) {
        throw new Error(`Binance API ping failed: ${response.status}`);
      }
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Binance API and close all WebSocket connections
   */
  async disconnect(): Promise<void> {
    // Close all WebSocket connections
    for (const [id, ws] of this.wsConnections) {
      ws.close();
      this.wsConnections.delete(id);
    }

    // Clear all reconnect timeouts
    for (const [id, timeout] of this.reconnectTimeouts) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(id);
    }

    this.priceCallbacks.clear();
    this.subscriptions.clear();
    this.connected = false;
  }

  /**
   * Subscribe to raw data updates (implements SourceAdapter interface)
   */
  async subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle(symbols);
    
    // Convert to price callback wrapper
    const priceCallback = (price: PricePoint) => {
      const rawDataPoint: RawDataPoint = {
        sourceId: this.config.sourceId,
        type: 'PRICE',
        symbol: price.symbol,
        timestamp: price.timestamp,
        data: price
      };
      callback(rawDataPoint);
    };

    await this.subscribeToPrices(symbols, '1m', priceCallback);
    return handle;
  }

  /**
   * Unsubscribe from data updates
   */
  async unsubscribe(handle: SubscriptionHandle): Promise<void> {
    const ws = this.wsConnections.get(handle.id);
    if (ws) {
      ws.close();
      this.wsConnections.delete(handle.id);
    }
    this.priceCallbacks.delete(handle.id);
    this.subscriptions.delete(handle.id);

    const timeout = this.reconnectTimeouts.get(handle.id);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(handle.id);
    }
  }

  /**
   * Subscribe to real-time price updates via WebSocket
   * 
   * Requirements: 2.2
   */
  async subscribeToPrices(
    symbols: string[],
    interval: string,
    callback: (price: PricePoint) => void
  ): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle(symbols);
    const binanceInterval = INTERVAL_MAP[interval] || '1m';

    // Build WebSocket stream URL
    const streams = symbols
      .map(s => `${s.toLowerCase()}@kline_${binanceInterval}`)
      .join('/');
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    this.priceCallbacks.set(handle.id, callback);

    // Create WebSocket connection (in real implementation)
    // For now, we store the configuration for the connection
    // The actual WebSocket would be created in a browser/Node environment with ws library

    return handle;
  }

  /**
   * Process incoming WebSocket message
   */
  protected processWsMessage(handleId: string, message: BinanceWsMessage): void {
    const callback = this.priceCallbacks.get(handleId);
    if (!callback || message.e !== 'kline') return;

    const kline = message.k;
    const rawOHLCV: RawOHLCV = {
      symbol: kline.s,
      timestamp: kline.t,
      open: kline.o,
      high: kline.h,
      low: kline.l,
      close: kline.c,
      volume: kline.v,
      quoteVolume: kline.q,
      trades: kline.n
    };

    const pricePoint = this.normalizePricePoint(rawOHLCV);
    callback(pricePoint);
  }

  /**
   * Fetch historical OHLCV data via REST API
   * 
   * Requirements: 2.5
   */
  async fetchHistorical(
    symbol: string, 
    startTime: string, 
    endTime: string
  ): Promise<RawDataPoint[]> {
    const pricePoints = await this.getOHLCV(symbol, '1m', startTime, endTime);
    
    return pricePoints.map(price => ({
      sourceId: this.config.sourceId,
      type: 'PRICE' as const,
      symbol: price.symbol,
      timestamp: price.timestamp,
      data: price
    }));
  }

  /**
   * Get historical OHLCV data
   * 
   * Requirements: 2.2, 2.5
   */
  async getOHLCV(
    symbol: string,
    interval: string,
    startTime: string,
    endTime: string
  ): Promise<PricePoint[]> {
    const binanceInterval = INTERVAL_MAP[interval] || '1m';
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();

    const url = new URL(`${this.config.apiEndpoint}/api/v3/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', binanceInterval);
    url.searchParams.set('startTime', startMs.toString());
    url.searchParams.set('endTime', endMs.toString());
    url.searchParams.set('limit', '1000');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines = await response.json() as BinanceRestKline[];
    
    return klines.map(kline => this.normalizeRestKline(symbol, kline));
  }

  /**
   * Normalize REST API kline response to PricePoint
   */
  private normalizeRestKline(symbol: string, kline: BinanceRestKline): PricePoint {
    const rawOHLCV: RawOHLCV = {
      symbol,
      timestamp: kline[0],
      open: kline[1],
      high: kline[2],
      low: kline[3],
      close: kline[4],
      volume: kline[5],
      quoteVolume: kline[7],
      trades: kline[8]
    };

    return this.normalizePricePoint(rawOHLCV);
  }

  /**
   * Get the latest price for a symbol
   * 
   * Requirements: 2.2
   */
  async getLatestPrice(symbol: string): Promise<PricePoint> {
    const url = `${this.config.apiEndpoint}/api/v3/ticker/24hr?symbol=${symbol}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const ticker = await response.json() as {
      openPrice: string;
      highPrice: string;
      lowPrice: string;
      lastPrice: string;
      volume: string;
      quoteVolume: string;
      count: number;
    };
    const now = new Date().toISOString();

    const rawOHLCV: RawOHLCV = {
      symbol,
      timestamp: now,
      open: ticker.openPrice,
      high: ticker.highPrice,
      low: ticker.lowPrice,
      close: ticker.lastPrice,
      volume: ticker.volume,
      quoteVolume: ticker.quoteVolume,
      trades: ticker.count
    };

    return this.normalizePricePoint(rawOHLCV);
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.config.apiEndpoint}/api/v3/ping`);
      const latencyMs = Date.now() - startTime;
      
      return {
        healthy: response.ok,
        latencyMs,
        message: response.ok ? 'Binance API is healthy' : `API returned ${response.status}`,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        checkedAt: new Date().toISOString()
      };
    }
  }
}
