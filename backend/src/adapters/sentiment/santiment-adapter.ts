/**
 * Santiment Sentiment Adapter - implements sentiment data ingestion from Santiment
 * 
 * Santiment provides on-chain and social sentiment data with scores typically
 * on a -1 to +1 scale or percentage-based metrics.
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
 * Santiment API response format for social data
 */
interface SantimentSocialData {
  datetime: string;
  value: number;
}

/**
 * Santiment sentiment metrics response
 */
interface SantimentSentimentMetrics {
  slug: string;
  ticker: string;
  sentiment_balance: number;      // -1 to +1
  sentiment_volume_consumed: number;
  social_volume_total: number;
  social_dominance: number;       // 0-100 percentage
  twitter_followers: number;
  reddit_activity: number;
  telegram_activity: number;
  discord_activity: number;
}

/**
 * Santiment GraphQL response wrapper
 */
interface SantimentGraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

/**
 * Santiment historical data response
 */
interface SantimentHistoricalResponse {
  getMetric: {
    timeseriesData: SantimentSocialData[];
  };
}

/**
 * Santiment Sentiment Adapter implementation
 */
export class SantimentSentimentAdapter extends BaseSentimentAdapter {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private sentimentCallbacks: Map<string, (sentiment: SentimentData) => void> = new Map();

  constructor(config: SentimentAdapterConfig) {
    super({
      ...config,
      apiEndpoint: config.apiEndpoint || 'https://api.santiment.net/graphql'
    });
  }

  /**
   * Connect to Santiment API
   */
  async connect(): Promise<void> {
    try {
      // Verify API connectivity with a simple query
      const query = `{ currentUser { id } }`;
      const response = await this.executeGraphQL(query);
      this.connected = true;
    } catch (error) {
      // Even if auth fails, we might still be able to use public endpoints
      this.connected = true;
    }
  }

  /**
   * Disconnect from Santiment API
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
   * Execute a GraphQL query against Santiment API
   */
  private async executeGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Apikey ${this.config.apiKey}`;
    }

    const response = await fetch(this.config.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Santiment API error: ${response.status}`);
    }

    const result = await response.json() as SantimentGraphQLResponse<T>;
    if (result.errors && result.errors.length > 0) {
      throw new Error(`Santiment GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  /**
   * Subscribe to raw data updates (implements SourceAdapter interface)
   */
  async subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle> {
    const handle = this.createSubscriptionHandle(symbols);

    // Set up polling for sentiment updates (Santiment uses GraphQL, no WebSocket)
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
    const slug = this.symbolToSlug(symbol);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const query = `
      query GetSentiment($slug: String!, $from: DateTime!, $to: DateTime!) {
        sentimentBalance: getMetric(metric: "sentiment_balance") {
          timeseriesData(slug: $slug, from: $from, to: $to, interval: "1h") {
            datetime
            value
          }
        }
        socialVolume: getMetric(metric: "social_volume_total") {
          timeseriesData(slug: $slug, from: $from, to: $to, interval: "1h") {
            datetime
            value
          }
        }
        twitterVolume: getMetric(metric: "social_volume_twitter") {
          timeseriesData(slug: $slug, from: $from, to: $to, interval: "1h") {
            datetime
            value
          }
        }
        redditActivity: getMetric(metric: "social_volume_reddit") {
          timeseriesData(slug: $slug, from: $from, to: $to, interval: "1h") {
            datetime
            value
          }
        }
        telegramActivity: getMetric(metric: "social_volume_telegram") {
          timeseriesData(slug: $slug, from: $from, to: $to, interval: "1h") {
            datetime
            value
          }
        }
      }
    `;

    const variables = {
      slug,
      from: dayAgo.toISOString(),
      to: now.toISOString()
    };

    const data = await this.executeGraphQL<{
      sentimentBalance: { timeseriesData: SantimentSocialData[] };
      socialVolume: { timeseriesData: SantimentSocialData[] };
      twitterVolume: { timeseriesData: SantimentSocialData[] };
      redditActivity: { timeseriesData: SantimentSocialData[] };
      telegramActivity: { timeseriesData: SantimentSocialData[] };
    }>(query, variables);

    return this.normalizeSantimentData(symbol, data);
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
    const slug = this.symbolToSlug(symbol);

    const query = `
      query GetSentimentHistory($slug: String!, $from: DateTime!, $to: DateTime!) {
        sentimentBalance: getMetric(metric: "sentiment_balance") {
          timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
            datetime
            value
          }
        }
        socialVolume: getMetric(metric: "social_volume_total") {
          timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
            datetime
            value
          }
        }
      }
    `;

    const variables = {
      slug,
      from: startTime,
      to: endTime
    };

    const data = await this.executeGraphQL<{
      sentimentBalance: { timeseriesData: SantimentSocialData[] };
      socialVolume: { timeseriesData: SantimentSocialData[] };
    }>(query, variables);

    // Combine sentiment and volume data by timestamp
    const sentimentMap = new Map<string, number>();
    const volumeMap = new Map<string, number>();

    for (const point of data.sentimentBalance.timeseriesData) {
      sentimentMap.set(point.datetime, point.value);
    }
    for (const point of data.socialVolume.timeseriesData) {
      volumeMap.set(point.datetime, point.value);
    }

    const results: SentimentData[] = [];
    for (const [datetime, sentiment] of sentimentMap) {
      const volume = volumeMap.get(datetime) || 0;
      const rawData: RawSentimentData = {
        symbol,
        timestamp: datetime,
        score: sentiment,
        scoreMin: -1,
        scoreMax: 1,
        mentionVolume: volume,
        changeRate24h: 0,
        sources: []
      };
      results.push(this.normalizeSentimentData(rawData));
    }

    return results.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Convert symbol to Santiment slug format
   */
  private symbolToSlug(symbol: string): string {
    const slugMap: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'SOL': 'solana',
      'ADA': 'cardano',
      'XRP': 'ripple',
      'DOGE': 'dogecoin',
      'DOT': 'polkadot',
      'AVAX': 'avalanche',
      'LINK': 'chainlink',
      'MATIC': 'polygon'
    };
    return slugMap[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  /**
   * Normalize Santiment API response to SentimentData
   */
  private normalizeSantimentData(
    symbol: string,
    data: {
      sentimentBalance: { timeseriesData: SantimentSocialData[] };
      socialVolume: { timeseriesData: SantimentSocialData[] };
      twitterVolume: { timeseriesData: SantimentSocialData[] };
      redditActivity: { timeseriesData: SantimentSocialData[] };
      telegramActivity: { timeseriesData: SantimentSocialData[] };
    }
  ): SentimentData {
    // Get the most recent values
    const latestSentiment = this.getLatestValue(data.sentimentBalance.timeseriesData);
    const latestVolume = this.getLatestValue(data.socialVolume.timeseriesData);
    const latestTwitter = this.getLatestValue(data.twitterVolume.timeseriesData);
    const latestReddit = this.getLatestValue(data.redditActivity.timeseriesData);
    const latestTelegram = this.getLatestValue(data.telegramActivity.timeseriesData);

    // Calculate 24h change
    const changeRate24h = this.calculate24hChange(data.sentimentBalance.timeseriesData);

    const sources: RawSentimentSource[] = [
      {
        platform: 'TWITTER',
        score: latestSentiment,
        volume: latestTwitter,
        weight: 0.4
      },
      {
        platform: 'REDDIT',
        score: latestSentiment,
        volume: latestReddit,
        weight: 0.3
      },
      {
        platform: 'TELEGRAM',
        score: latestSentiment,
        volume: latestTelegram,
        weight: 0.3
      }
    ];

    const rawData: RawSentimentData = {
      symbol,
      timestamp: new Date().toISOString(),
      score: latestSentiment,
      scoreMin: -1,
      scoreMax: 1,
      mentionVolume: latestVolume,
      changeRate24h,
      sources
    };

    return this.normalizeSentimentData(rawData);
  }

  /**
   * Get the latest value from a timeseries
   */
  private getLatestValue(timeseries: SantimentSocialData[]): number {
    if (!timeseries || timeseries.length === 0) {
      return 0;
    }
    const sorted = [...timeseries].sort(
      (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
    );
    return sorted[0].value;
  }

  /**
   * Calculate 24h percentage change
   */
  private calculate24hChange(timeseries: SantimentSocialData[]): number {
    if (!timeseries || timeseries.length < 2) {
      return 0;
    }

    const sorted = [...timeseries].sort(
      (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
    );

    const latest = sorted[0].value;
    const oldest = sorted[sorted.length - 1].value;

    if (oldest === 0) {
      return 0;
    }

    return ((latest - oldest) / Math.abs(oldest)) * 100;
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const query = `{ currentUser { id } }`;
      await this.executeGraphQL(query);
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Santiment API is healthy',
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
