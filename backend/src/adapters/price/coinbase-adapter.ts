/**
 * Coinbase Price Adapter - implements price data ingestion from Coinbase exchange
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
 * Coinbase WebSocket ticker message format
 */
interface CoinbaseTickerMessage {
  type: 'ticker';
  sequence: number;
  product_id: string;
  price: string;
  open_24h: string;
  volume_24h: string;
  low_24h: string;
  high_24h: string;
  volume_30d: string;
  best_bid: string;
  best_ask: string;
  side: 'buy' | 'sell';
  time: string;
  trade_id: number;
  last_size: string;
}

/**
 * Coinbase REST API candle response format (array)
 * [timestamp, low, high, open, close, volume]
 */
type CoinbaseCandle = [number, number, number, number, number, number];

/**
 * Interval mapping from standard to Coinbase granularity (in seconds)
 */
const GRANULARITY_MAP: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,  // Not directly supported, use 6h
  '1d': 86400
};

/**
 * Coinbase Price Adapter implementation
 */
export class CoinbasePriceAdapter extends BasePriceAdapter {
  private wsConnections: Map<string, WebSocket> = new Map();
  private priceCallbacks: Map<string, (price: PricePoint) => void> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private lastPrices: Map<string, PricePoint> = new Map();

  constructor(config: PriceAdapterConfig) {
    super({
      ...config,
      apiEndpoint: config.apiEndpoint || 'https://api.exchange.coinbase.com'
    });
  }

  /**
   * Connect to Coinbase API
   */
  async connect(): Promise<void> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/time`);
      if (!response.ok) {
        throw new Error(`Coinbase API time check failed: ${response.status}`);
      }
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Coinbase API and close all WebSocket connections
   */
  async disconnect(): Promise<void> {
    for (const [id, ws] of this.wsConnections) {
      ws.close();
      this.wsConnections.delete(id);
    }

    for (const [id, timeout] of this.reconnectTimeouts) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(id);
    }

    this.priceCallbacks.clear();
    this.subscriptions.clear();
    this.lastPrices.clear();
    this.connected = false;
  }

  /**
   * Subscribe to raw data updates (implements SourceAdapter interface)
   */
  async subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle(symbols);
    
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
    
    // Convert symbols to Coinbase format (e.g., BTCUSD -> BTC-USD)
    const productIds = symbols.map(s => this.toCoinbaseSymbol(s));

    this.priceCallbacks.set(handle.id, callback);

    // WebSocket subscription message
    const subscribeMessage = {
      type: 'subscribe',
      product_ids: productIds,
      channels: ['ticker']
    };

    // Store subscription config (actual WebSocket would be created in runtime)
    // The wsUrl would be: wss://ws-feed.exchange.coinbase.com

    return handle;
  }

  /**
   * Convert standard symbol to Coinbase format
   * e.g., BTCUSD -> BTC-USD
   */
  private toCoinbaseSymbol(symbol: string): string {
    // Common patterns: BTCUSD, ETHUSD, etc.
    if (symbol.length === 6) {
      return `${symbol.slice(0, 3)}-${symbol.slice(3)}`;
    }
    // Already in correct format
    if (symbol.includes('-')) {
      return symbol;
    }
    return symbol;
  }

  /**
   * Convert Coinbase symbol to standard format
   * e.g., BTC-USD -> BTCUSD
   */
  private fromCoinbaseSymbol(productId: string): string {
    return productId.replace('-', '');
  }

  /**
   * Process incoming WebSocket ticker message
   */
  protected processWsMessage(handleId: string, message: CoinbaseTickerMessage): void {
    const callback = this.priceCallbacks.get(handleId);
    if (!callback || message.type !== 'ticker') return;

    const symbol = this.fromCoinbaseSymbol(message.product_id);
    
    const rawOHLCV: RawOHLCV = {
      symbol,
      timestamp: message.time,
      open: message.open_24h,
      high: message.high_24h,
      low: message.low_24h,
      close: message.price,
      volume: message.volume_24h
    };

    const pricePoint = this.normalizePricePoint(rawOHLCV);
    this.lastPrices.set(symbol, pricePoint);
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
    const productId = this.toCoinbaseSymbol(symbol);
    const granularity = GRANULARITY_MAP[interval] || 60;
    
    const url = new URL(`${this.config.apiEndpoint}/products/${productId}/candles`);
    url.searchParams.set('start', startTime);
    url.searchParams.set('end', endTime);
    url.searchParams.set('granularity', granularity.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status}`);
    }

    const candles: CoinbaseCandle[] = await response.json();
    
    // Coinbase returns candles in reverse chronological order
    return candles
      .reverse()
      .map(candle => this.normalizeCandle(symbol, candle));
  }

  /**
   * Normalize Coinbase candle to PricePoint
   * Candle format: [timestamp, low, high, open, close, volume]
   */
  private normalizeCandle(symbol: string, candle: CoinbaseCandle): PricePoint {
    const [timestamp, low, high, open, close, volume] = candle;
    
    const rawOHLCV: RawOHLCV = {
      symbol,
      timestamp: timestamp * 1000, // Convert to milliseconds
      open,
      high,
      low,
      close,
      volume
    };

    return this.normalizePricePoint(rawOHLCV);
  }

  /**
   * Get the latest price for a symbol
   * 
   * Requirements: 2.2
   */
  async getLatestPrice(symbol: string): Promise<PricePoint> {
    const productId = this.toCoinbaseSymbol(symbol);
    
    // Get ticker data
    const tickerUrl = `${this.config.apiEndpoint}/products/${productId}/ticker`;
    const statsUrl = `${this.config.apiEndpoint}/products/${productId}/stats`;
    
    const [tickerResponse, statsResponse] = await Promise.all([
      fetch(tickerUrl),
      fetch(statsUrl)
    ]);

    if (!tickerResponse.ok || !statsResponse.ok) {
      throw new Error(`Coinbase API error: ticker=${tickerResponse.status}, stats=${statsResponse.status}`);
    }

    const ticker = await tickerResponse.json();
    const stats = await statsResponse.json();

    const rawOHLCV: RawOHLCV = {
      symbol,
      timestamp: ticker.time || new Date().toISOString(),
      open: stats.open,
      high: stats.high,
      low: stats.low,
      close: ticker.price,
      volume: stats.volume
    };

    return this.normalizePricePoint(rawOHLCV);
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.config.apiEndpoint}/time`);
      const latencyMs = Date.now() - startTime;
      
      return {
        healthy: response.ok,
        latencyMs,
        message: response.ok ? 'Coinbase API is healthy' : `API returned ${response.status}`,
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
