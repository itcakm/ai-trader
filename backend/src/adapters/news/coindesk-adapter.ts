/**
 * CoinDesk News Adapter
 * 
 * Implements the NewsAdapter interface for CoinDesk news feed.
 * Handles connection, subscription, and data retrieval from CoinDesk API.
 * 
 * Requirements: 3.1
 */

import {
  SubscriptionHandle,
  RawDataPoint,
  DataCallback,
  HealthCheckResult
} from '../../types/source-adapter';
import { NewsEvent } from '../../types/news';
import { BaseNewsAdapter, NewsAdapterConfig, RawNewsData } from './base-news-adapter';

/**
 * CoinDesk-specific configuration
 */
export interface CoinDeskAdapterConfig extends NewsAdapterConfig {
  includeAnalysis?: boolean;
  languages?: string[];
}

/**
 * CoinDesk API response format
 */
interface CoinDeskNewsItem {
  guid: string;
  title: string;
  description: string;
  content: string;
  link: string;
  pubDate: string;
  author?: string;
  tags?: string[];
  categories?: string[];
  coins?: string[];
}

/**
 * CoinDesk News Adapter implementation
 */
export class CoinDeskAdapter extends BaseNewsAdapter {
  private coinDeskConfig: CoinDeskAdapterConfig;
  private newsCallbacks: Map<string, (news: NewsEvent) => void> = new Map();

  constructor(config: CoinDeskAdapterConfig) {
    super(config);
    this.coinDeskConfig = config;
  }

  /**
   * Connect to CoinDesk API
   */
  async connect(): Promise<void> {
    // In production, this would establish connection to CoinDesk API
    this.connected = true;
  }

  /**
   * Disconnect from CoinDesk API
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.subscriptions.clear();
    this.newsCallbacks.clear();
  }

  /**
   * Subscribe to raw data updates
   */
  async subscribe(symbols: string[], callback: DataCallback): Promise<SubscriptionHandle> {
    if (!this.connected) {
      throw new Error('Not connected to CoinDesk API');
    }

    const handle = this.createSubscriptionHandle(symbols);
    return handle;
  }

  /**
   * Unsubscribe from data updates
   */
  async unsubscribe(handle: SubscriptionHandle): Promise<void> {
    this.subscriptions.delete(handle.id);
    this.newsCallbacks.delete(handle.id);
  }

  /**
   * Fetch historical raw data
   */
  async fetchHistorical(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<RawDataPoint[]> {
    if (!this.connected) {
      throw new Error('Not connected to CoinDesk API');
    }

    // In production, this would fetch from CoinDesk historical API
    return [];
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // In production, this would ping CoinDesk API
      const latencyMs = Date.now() - startTime;

      return {
        healthy: this.connected,
        latencyMs,
        message: this.connected ? 'CoinDesk API connection healthy' : 'Not connected',
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

  /**
   * Subscribe to news updates for specific symbols
   */
  async subscribeToNews(
    symbols: string[],
    callback: (news: NewsEvent) => void
  ): Promise<SubscriptionHandle> {
    if (!this.connected) {
      throw new Error('Not connected to CoinDesk API');
    }

    const handle = this.createSubscriptionHandle(symbols);
    this.newsCallbacks.set(handle.id, callback);

    return handle;
  }

  /**
   * Get historical news for a symbol
   */
  async getNewsHistory(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<NewsEvent[]> {
    if (!this.connected) {
      throw new Error('Not connected to CoinDesk API');
    }

    // In production, this would fetch from CoinDesk historical news API
    return [];
  }

  /**
   * Search news by query
   */
  async searchNews(query: string, limit: number): Promise<NewsEvent[]> {
    if (!this.connected) {
      throw new Error('Not connected to CoinDesk API');
    }

    // In production, this would search CoinDesk news API
    return [];
  }

  /**
   * Convert CoinDesk news item to raw news data format
   */
  protected convertToRawNewsData(item: CoinDeskNewsItem): RawNewsData {
    // Map CoinDesk categories to our category system
    const category = this.mapCoinDeskCategory(item.categories);

    return {
      title: item.title,
      content: item.content || item.description,
      summary: item.description,
      source: 'CoinDesk',
      sourceUrl: item.link,
      publishedAt: item.pubDate,
      symbols: item.coins,
      category
    };
  }

  /**
   * Map CoinDesk categories to our NewsCategory
   */
  private mapCoinDeskCategory(categories?: string[]): string | undefined {
    if (!categories || categories.length === 0) {
      return undefined;
    }

    const categoryLower = categories[0].toLowerCase();

    if (categoryLower.includes('regulation') || categoryLower.includes('legal') || categoryLower.includes('government')) {
      return 'REGULATORY';
    }
    if (categoryLower.includes('tech') || categoryLower.includes('development') || categoryLower.includes('protocol')) {
      return 'TECHNICAL';
    }
    if (categoryLower.includes('market') || categoryLower.includes('trading') || categoryLower.includes('price')) {
      return 'MARKET';
    }
    if (categoryLower.includes('partnership') || categoryLower.includes('collaboration') || categoryLower.includes('deal')) {
      return 'PARTNERSHIP';
    }

    return 'GENERAL';
  }

  /**
   * Process incoming CoinDesk news item
   */
  protected processNewsItem(item: CoinDeskNewsItem): NewsEvent {
    const rawData = this.convertToRawNewsData(item);
    return this.normalizeNewsEvent(rawData);
  }
}
