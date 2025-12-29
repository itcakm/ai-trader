/**
 * Base News Adapter - provides common news processing logic for all news adapters
 * 
 * This abstract class implements the common functionality shared by all news adapters:
 * - News event normalization to common NewsEvent format
 * - Content hash generation for deduplication
 * - Quality score calculation
 * - Connection state management
 * - Subscription handling
 * 
 * Requirements: 3.1, 3.2
 */

import { DataSourceType } from '../../types/data-source';
import {
  SubscriptionHandle,
  RawDataPoint,
  DataCallback,
  HealthCheckResult
} from '../../types/source-adapter';
import { NewsAdapter, NewsEvent, NewsCategory } from '../../types/news';
import { generateUUID } from '../../utils/uuid';
import * as crypto from 'crypto';

/**
 * Raw news data from a provider (before normalization)
 */
export interface RawNewsData {
  title: string;
  content: string;
  summary?: string;
  source: string;
  sourceUrl: string;
  publishedAt: string | number;
  symbols?: string[];
  category?: string;
  sentiment?: number;
}

/**
 * Configuration for a news adapter
 */
export interface NewsAdapterConfig {
  sourceId: string;
  apiEndpoint: string;
  apiKey?: string;
  apiSecret?: string;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
}

/**
 * Abstract base class for news adapters
 */
export abstract class BaseNewsAdapter implements NewsAdapter {
  readonly sourceType: DataSourceType = 'NEWS';

  protected config: NewsAdapterConfig;
  protected connected: boolean = false;
  protected subscriptions: Map<string, SubscriptionHandle> = new Map();

  constructor(config: NewsAdapterConfig) {
    this.config = config;
  }

  /**
   * Normalize raw news data to standard NewsEvent format
   * 
   * Converts provider-specific data formats to the common NewsEvent interface.
   * Generates content hash for deduplication and calculates quality score.
   * 
   * @param raw - Raw news data from the provider
   * @returns Normalized NewsEvent
   */
  protected normalizeNewsEvent(raw: RawNewsData): NewsEvent {
    const publishedAt = typeof raw.publishedAt === 'number'
      ? new Date(raw.publishedAt).toISOString()
      : raw.publishedAt;

    const contentHash = this.generateContentHash(raw.title, raw.content);
    const category = this.normalizeCategory(raw.category);
    const qualityScore = this.calculateQualityScore(raw);

    return {
      eventId: generateUUID(),
      title: raw.title,
      content: raw.content,
      summary: raw.summary,
      source: raw.source,
      sourceUrl: raw.sourceUrl,
      publishedAt,
      ingestedAt: new Date().toISOString(),
      symbols: raw.symbols || [],
      category,
      relevanceScore: 0, // Will be calculated by news processor
      sentiment: raw.sentiment,
      contentHash,
      qualityScore
    };
  }

  /**
   * Generate a content hash for deduplication
   * 
   * Creates a SHA-256 hash of the title and content combined.
   * This is used to detect duplicate news events from different sources.
   * 
   * @param title - News event title
   * @param content - News event content
   * @returns Hex-encoded SHA-256 hash
   */
  protected generateContentHash(title: string, content: string): string {
    const combined = `${title.toLowerCase().trim()}|${content.toLowerCase().trim()}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Normalize category string to valid NewsCategory enum
   * 
   * @param category - Raw category string from provider
   * @returns Valid NewsCategory
   */
  protected normalizeCategory(category?: string): NewsCategory {
    if (!category) {
      return 'GENERAL';
    }

    const normalized = category.toUpperCase().trim();

    const categoryMap: Record<string, NewsCategory> = {
      'REGULATORY': 'REGULATORY',
      'REGULATION': 'REGULATORY',
      'LEGAL': 'REGULATORY',
      'GOVERNMENT': 'REGULATORY',
      'TECHNICAL': 'TECHNICAL',
      'TECHNOLOGY': 'TECHNICAL',
      'DEVELOPMENT': 'TECHNICAL',
      'UPDATE': 'TECHNICAL',
      'MARKET': 'MARKET',
      'TRADING': 'MARKET',
      'PRICE': 'MARKET',
      'EXCHANGE': 'MARKET',
      'PARTNERSHIP': 'PARTNERSHIP',
      'COLLABORATION': 'PARTNERSHIP',
      'INTEGRATION': 'PARTNERSHIP',
      'GENERAL': 'GENERAL',
      'NEWS': 'GENERAL',
      'OTHER': 'GENERAL'
    };

    return categoryMap[normalized] || 'GENERAL';
  }

  /**
   * Calculate quality score for a news event
   * 
   * Quality is based on:
   * - Data completeness (all required fields present)
   * - Content length (meaningful content)
   * - Valid timestamp
   * - Source URL validity
   * 
   * @param data - The raw news data to evaluate
   * @returns Quality score between 0 and 1
   */
  protected calculateQualityScore(data: RawNewsData): number {
    let score = 1.0;

    // Check for required fields
    if (!data.title || data.title.trim().length === 0) {
      score -= 0.3;
    }
    if (!data.content || data.content.trim().length === 0) {
      score -= 0.3;
    }
    if (!data.source || data.source.trim().length === 0) {
      score -= 0.1;
    }
    if (!data.sourceUrl || data.sourceUrl.trim().length === 0) {
      score -= 0.1;
    }

    // Check content quality
    if (data.title && data.title.length < 10) {
      score -= 0.1;
    }
    if (data.content && data.content.length < 50) {
      score -= 0.1;
    }

    // Check timestamp validity
    if (!data.publishedAt) {
      score -= 0.1;
    } else {
      const timestamp = typeof data.publishedAt === 'number'
        ? data.publishedAt
        : Date.parse(data.publishedAt);
      if (isNaN(timestamp)) {
        score -= 0.1;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Validate that a news event has all required fields
   */
  protected validateNewsEvent(event: NewsEvent): boolean {
    return (
      typeof event.eventId === 'string' && event.eventId.length > 0 &&
      typeof event.title === 'string' && event.title.length > 0 &&
      typeof event.content === 'string' && event.content.length > 0 &&
      typeof event.source === 'string' && event.source.length > 0 &&
      typeof event.sourceUrl === 'string' && event.sourceUrl.length > 0 &&
      typeof event.publishedAt === 'string' && event.publishedAt.length > 0 &&
      typeof event.ingestedAt === 'string' && event.ingestedAt.length > 0 &&
      Array.isArray(event.symbols) &&
      this.isValidCategory(event.category) &&
      typeof event.relevanceScore === 'number' &&
      event.relevanceScore >= 0 && event.relevanceScore <= 1 &&
      typeof event.contentHash === 'string' && event.contentHash.length > 0 &&
      typeof event.qualityScore === 'number' &&
      event.qualityScore >= 0 && event.qualityScore <= 1
    );
  }

  /**
   * Check if a category is valid
   */
  protected isValidCategory(category: string): category is NewsCategory {
    return ['REGULATORY', 'TECHNICAL', 'MARKET', 'PARTNERSHIP', 'GENERAL'].includes(category);
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
  abstract subscribeToNews(
    symbols: string[],
    callback: (news: NewsEvent) => void
  ): Promise<SubscriptionHandle>;
  abstract getNewsHistory(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<NewsEvent[]>;
  abstract searchNews(query: string, limit: number): Promise<NewsEvent[]>;

  isConnected(): boolean {
    return this.connected;
  }

  getSourceId(): string {
    return this.config.sourceId;
  }
}
