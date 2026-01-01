/**
 * Base Sentiment Adapter - provides common sentiment normalization logic for all sentiment adapters
 * 
 * This abstract class implements the common functionality shared by all sentiment adapters:
 * - Sentiment score normalization to -1 to +1 scale
 * - Quality score calculation
 * - Connection state management
 * - Subscription handling
 * 
 * Requirements: 4.1, 4.2
 */

import { DataSourceType } from '../../types/data-source';
import {
  SubscriptionHandle,
  RawDataPoint,
  DataCallback,
  HealthCheckResult
} from '../../types/source-adapter';
import { SentimentAdapter, SentimentData, SentimentSource, SentimentPlatform } from '../../types/sentiment';
import { generateUUID } from '../../utils/uuid';

/**
 * Raw sentiment data from a provider (before normalization)
 */
export interface RawSentimentData {
  symbol: string;
  timestamp: string | number;
  score: number;
  scoreMin?: number;
  scoreMax?: number;
  mentionVolume?: number;
  changeRate24h?: number;
  sources?: RawSentimentSource[];
}

/**
 * Raw sentiment source data from a provider
 */
export interface RawSentimentSource {
  platform: string;
  score: number;
  volume?: number;
  weight?: number;
}

/**
 * Configuration for a sentiment adapter
 */
export interface SentimentAdapterConfig {
  sourceId: string;
  apiEndpoint: string;
  apiKey?: string;
  apiSecret?: string;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
}

/**
 * Abstract base class for sentiment adapters
 */
export abstract class BaseSentimentAdapter implements SentimentAdapter {
  readonly sourceType: DataSourceType = 'SENTIMENT';

  protected config: SentimentAdapterConfig;
  protected connected: boolean = false;
  protected subscriptions: Map<string, SubscriptionHandle> = new Map();

  constructor(config: SentimentAdapterConfig) {
    this.config = config;
  }

  /**
   * Normalize raw sentiment data to standard SentimentData format
   * 
   * Converts provider-specific data formats to the common SentimentData interface.
   * Normalizes scores to -1 to +1 scale and calculates quality score.
   * 
   * @param raw - Raw sentiment data from the provider
   * @returns Normalized SentimentData
   */
  protected normalizeSentimentData(raw: RawSentimentData): SentimentData {
    const timestamp = typeof raw.timestamp === 'number'
      ? new Date(raw.timestamp).toISOString()
      : raw.timestamp;

    const normalizedScore = this.normalizeScore(raw.score, raw.scoreMin, raw.scoreMax);
    const sources = this.normalizeSources(raw.sources || []);
    const qualityScore = this.calculateQualityScore(raw, sources);

    return {
      sentimentId: generateUUID(),
      symbol: raw.symbol,
      timestamp,
      overallScore: normalizedScore,
      mentionVolume: raw.mentionVolume ?? 0,
      changeRate24h: raw.changeRate24h ?? 0,
      sources,
      aggregatedFrom: [this.config.sourceId],
      qualityScore
    };
  }

  /**
   * Normalize a score to the -1 to +1 scale
   * 
   * Handles different scoring systems from various providers:
   * - 0-100 scale (e.g., LunarCrush)
   * - 0-1 scale
   * - -1 to +1 scale (already normalized)
   * - Custom min/max scales
   * 
   * @param score - The raw score value
   * @param min - Minimum value of the source scale (default: auto-detect)
   * @param max - Maximum value of the source scale (default: auto-detect)
   * @returns Normalized score between -1 and +1
   */
  protected normalizeScore(score: number, min?: number, max?: number): number {
    // If min/max are provided, use them
    if (min !== undefined && max !== undefined) {
      return this.scaleToNormalized(score, min, max);
    }

    // Auto-detect scale based on score value
    if (score >= 0 && score <= 1) {
      // Assume 0-1 scale, convert to -1 to +1
      return (score * 2) - 1;
    } else if (score >= 0 && score <= 100) {
      // Assume 0-100 scale, convert to -1 to +1
      return ((score / 100) * 2) - 1;
    } else if (score >= -1 && score <= 1) {
      // Already normalized
      return score;
    }

    // Clamp to -1 to +1 range
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Scale a value from a custom range to -1 to +1
   */
  protected scaleToNormalized(value: number, min: number, max: number): number {
    if (max === min) {
      return 0;
    }
    const normalized = ((value - min) / (max - min)) * 2 - 1;
    return Math.max(-1, Math.min(1, normalized));
  }

  /**
   * Normalize platform string to valid SentimentPlatform enum
   */
  protected normalizePlatform(platform: string): SentimentPlatform {
    const normalized = platform.toUpperCase().trim();

    const platformMap: Record<string, SentimentPlatform> = {
      'TWITTER': 'TWITTER',
      'X': 'TWITTER',
      'REDDIT': 'REDDIT',
      'TELEGRAM': 'TELEGRAM',
      'DISCORD': 'DISCORD',
      'NEWS': 'NEWS',
      'ARTICLES': 'NEWS'
    };

    return platformMap[normalized] || 'NEWS';
  }

  /**
   * Normalize raw sentiment sources to standard format
   */
  protected normalizeSources(rawSources: RawSentimentSource[]): SentimentSource[] {
    return rawSources.map(source => ({
      platform: this.normalizePlatform(source.platform),
      score: this.normalizeScore(source.score),
      volume: source.volume ?? 0,
      weight: source.weight ?? 1 / rawSources.length
    }));
  }

  /**
   * Calculate quality score for sentiment data
   * 
   * Quality is based on:
   * - Data completeness (all required fields present)
   * - Score validity (within expected range)
   * - Source diversity (multiple platforms)
   * - Volume presence (has mention volume)
   * 
   * @param data - The raw sentiment data to evaluate
   * @param sources - Normalized sources
   * @returns Quality score between 0 and 1
   */
  protected calculateQualityScore(data: RawSentimentData, sources: SentimentSource[]): number {
    let score = 1.0;

    // Check for required fields
    if (!data.symbol || data.symbol.trim().length === 0) {
      score -= 0.3;
    }
    if (data.score === undefined || isNaN(data.score)) {
      score -= 0.3;
    }
    if (!data.timestamp) {
      score -= 0.1;
    }

    // Check score validity
    const normalizedScore = this.normalizeScore(data.score, data.scoreMin, data.scoreMax);
    if (normalizedScore < -1 || normalizedScore > 1) {
      score -= 0.2;
    }

    // Check source diversity
    if (sources.length === 0) {
      score -= 0.1;
    } else if (sources.length === 1) {
      score -= 0.05;
    }

    // Check volume presence
    if (!data.mentionVolume || data.mentionVolume === 0) {
      score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Validate that sentiment data has all required fields
   */
  protected validateSentimentData(data: SentimentData): boolean {
    return (
      typeof data.sentimentId === 'string' && data.sentimentId.length > 0 &&
      typeof data.symbol === 'string' && data.symbol.length > 0 &&
      typeof data.timestamp === 'string' && data.timestamp.length > 0 &&
      typeof data.overallScore === 'number' && !isNaN(data.overallScore) &&
      data.overallScore >= -1 && data.overallScore <= 1 &&
      typeof data.mentionVolume === 'number' && !isNaN(data.mentionVolume) &&
      typeof data.changeRate24h === 'number' && !isNaN(data.changeRate24h) &&
      Array.isArray(data.sources) &&
      Array.isArray(data.aggregatedFrom) && data.aggregatedFrom.length > 0 &&
      typeof data.qualityScore === 'number' &&
      data.qualityScore >= 0 && data.qualityScore <= 1
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
  abstract getSentiment(symbol: string): Promise<SentimentData>;
  abstract getSentimentHistory(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<SentimentData[]>;

  isConnected(): boolean {
    return this.connected;
  }

  getSourceId(): string {
    return this.config.sourceId;
  }
}
