/**
 * LunarCrush Sentiment Adapter - implements sentiment data ingestion from LunarCrush
 * 
 * LunarCrush provides social sentiment data aggregated from multiple platforms
 * including Twitter, Reddit, and news sources. Scores are on a 0-100 scale.
 * 
 * Requirements: 4.1
 */

import {
  SubscriptionHandle,
  RawDataPoint,
  DataCallback,
  HealthCheckResult
} from '../../types/source-adapter';
import { SentimentData } from '../../types/sentiment';
import {
  BaseSentimentAdapter,
  SentimentAdapterConfig,
  RawSentimentData,
  RawSentimentSource
} from './base-sentiment-adapter';

/**
 * LunarCrush API response format for asset metrics
 */
interface LunarCrushAssetMetrics {
  id: number;
  symbol: string;
  name: string;
  galaxy_score: number;        // 0-100 overall score
  alt_rank: number;
  social_score: number;        // 0-100 social sentiment
  social_volume: number;       // Total social mentions
  social_volume_change_24h: number;
  twitter_volume: number;
  twitter_sentiment: number;   // 0-100
  reddit_volume: number;
  reddit_sentiment: number;    // 0-100
  news_volume: number;
  news_sentiment: number;      // 0-100
  average_sentiment: number;   // 0-100
  sentiment_change_24h: number;
  time: number;                // Unix timestamp
}

/**
 * LunarCrush API response wrapper
 */
interface LunarCrushResponse {
  data: LunarCrushAssetMetrics[];
}

/**
 * LunarCrush historical data point
 */
interface LunarCrushHistoricalPoint {
  time: number;
  galaxy_score: number;
  social_score: number;
  social_volume: number;
  average_sentiment: number;
  twitter_sentiment: number;
  reddit_sentiment: number;
  news_sentiment: number;
}

/**
 * LunarCrush Sentiment Adapter implementation
 */
export class LunarCrushSentimentAdapter extends BaseSentimentAdapter {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private sentimentCallbacks: Map<string, (sentiment: SentimentData) => void> = new Map();

  constructor(config: SentimentAdapterConfig) {
    super({
      ...config,
      apiEndpoint: config.apiEndpoint || 'https://lunarcrush.com/api3'
    });
  }

  /**
   * Connect to LunarCrush API
   */
  async connect(): Promise<void> {
    try {
      // Verify API connectivity
      const response = await fetch(`${this.config.apiEndpoint}/coins/list`, {
        headers: this.getHeaders()
      });
      if (!response.ok) {
        throw new Error(`LunarCrush API connection failed: ${response.status}`);
      }
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from LunarCrush API
   */
  async disconnect(): Promise<void> {
    // Clear all polling intervals
    for (const [id, interval] of this.pollingIntervals) {
      clearInterval(interval);
      this.pollingIntervals.delete(id);
    }

    this.sentimentCallbacks.clear();
    this.subscriptions.clear();
    this.connected = false;
  }

  /**
   * Get API request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  /**
   * Subscribe to raw data updates (implements SourceAdapter interface)
   */
  async subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle(symbols);

    // Set up polling for sentiment updates (LunarCrush doesn't have WebSocket)
    const pollInterval = setInterval(async () => {
      for (const symbol of symbols) {
        try {
          const sentiment = await this.getSentiment(symbol);
          const rawDataPoint: RawDataPoint = {
            sourceId: this.config.sourceId,
            type: 'SENTIMENT',
            symbol: sentiment.symbol,
            timestamp: sentiment.timestamp,
            data: sentiment
          };
          callback(rawDataPoint);
        } catch (error) {
          // Log error but continue polling
          console.error(`Error fetching sentiment for ${symbol}:`, error);
        }
      }
    }, 60000); // Poll every minute

    this.pollingIntervals.set(handle.id, pollInterval);
    return handle;
  }

  /**
   * Unsubscribe from data updates
   */
  async unsubscribe(handle: SubscriptionHandle): Promise<void> {
    const interval = this.pollingIntervals.get(handle.id);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(handle.id);
    }
    this.sentimentCallbacks.delete(handle.id);
    this.subscriptions.delete(handle.id);
  }

  /**
   * Fetch historical sentiment data
   */
  async fetchHistorical(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<RawDataPoint[]> {
    const sentimentData = await this.getSentimentHistory(symbol, startTime, endTime);

    return sentimentData.map(sentiment => ({
      sourceId: this.config.sourceId,
      type: 'SENTIMENT' as const,
      symbol: sentiment.symbol,
      timestamp: sentiment.timestamp,
      data: sentiment
    }));
  }

  /**
   * Get current sentiment for a symbol
   * 
   * Requirements: 4.1
   */
  async getSentiment(symbol: string): Promise<SentimentData> {
    const url = `${this.config.apiEndpoint}/coins/${symbol}`;

    const response = await fetch(url, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`LunarCrush API error: ${response.status}`);
    }

    const data = await response.json() as LunarCrushResponse;
    if (!data.data || data.data.length === 0) {
      throw new Error(`No sentiment data found for ${symbol}`);
    }

    return this.normalizeLunarCrushData(data.data[0]);
  }

  /**
   * Get historical sentiment data
   * 
   * Requirements: 4.1
   */
  async getSentimentHistory(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<SentimentData[]> {
    const startTs = Math.floor(new Date(startTime).getTime() / 1000);
    const endTs = Math.floor(new Date(endTime).getTime() / 1000);

    const url = new URL(`${this.config.apiEndpoint}/coins/${symbol}/time-series`);
    url.searchParams.set('start', startTs.toString());
    url.searchParams.set('end', endTs.toString());
    url.searchParams.set('interval', 'day');

    const response = await fetch(url.toString(), {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`LunarCrush API error: ${response.status}`);
    }

    const data = await response.json() as { data: LunarCrushHistoricalPoint[] };

    return (data.data || []).map(point =>
      this.normalizeHistoricalPoint(symbol, point)
    );
  }

  /**
   * Normalize LunarCrush asset metrics to SentimentData
   */
  private normalizeLunarCrushData(metrics: LunarCrushAssetMetrics): SentimentData {
    const sources: RawSentimentSource[] = [
      {
        platform: 'TWITTER',
        score: metrics.twitter_sentiment,
        volume: metrics.twitter_volume,
        weight: 0.4
      },
      {
        platform: 'REDDIT',
        score: metrics.reddit_sentiment,
        volume: metrics.reddit_volume,
        weight: 0.3
      },
      {
        platform: 'NEWS',
        score: metrics.news_sentiment,
        volume: metrics.news_volume,
        weight: 0.3
      }
    ];

    const rawData: RawSentimentData = {
      symbol: metrics.symbol,
      timestamp: metrics.time * 1000, // Convert to milliseconds
      score: metrics.average_sentiment,
      scoreMin: 0,
      scoreMax: 100,
      mentionVolume: metrics.social_volume,
      changeRate24h: metrics.sentiment_change_24h,
      sources
    };

    return this.normalizeSentimentData(rawData);
  }

  /**
   * Normalize historical data point to SentimentData
   */
  private normalizeHistoricalPoint(
    symbol: string,
    point: LunarCrushHistoricalPoint
  ): SentimentData {
    const sources: RawSentimentSource[] = [
      {
        platform: 'TWITTER',
        score: point.twitter_sentiment,
        volume: 0,
        weight: 0.4
      },
      {
        platform: 'REDDIT',
        score: point.reddit_sentiment,
        volume: 0,
        weight: 0.3
      },
      {
        platform: 'NEWS',
        score: point.news_sentiment,
        volume: 0,
        weight: 0.3
      }
    ];

    const rawData: RawSentimentData = {
      symbol,
      timestamp: point.time * 1000,
      score: point.average_sentiment,
      scoreMin: 0,
      scoreMax: 100,
      mentionVolume: point.social_volume,
      changeRate24h: 0,
      sources
    };

    return this.normalizeSentimentData(rawData);
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.apiEndpoint}/coins/list`, {
        headers: this.getHeaders()
      });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: response.ok,
        latencyMs,
        message: response.ok ? 'LunarCrush API is healthy' : `API returned ${response.status}`,
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
