/**
 * Snapshot Service - assembles MarketDataSnapshot combining all data types
 * 
 * Provides:
 * - Snapshot assembly combining price, news, sentiment, and on-chain data
 * - Data completeness tracking
 * - Quality score calculation
 * 
 * Requirements: 6.1, 6.2
 */

import { generateUUID } from '../utils/uuid';
import { DataSourceType } from '../types/data-source';
import { PricePoint } from '../types/price';
import { NewsEvent } from '../types/news';
import { SentimentData } from '../types/sentiment';
import { OnChainMetric, OnChainMetricType } from '../types/on-chain';
import { NewsContext, NewsContextEvent, DominantSentiment } from '../types/news-context';
import {
  MarketDataSnapshot,
  DataCompleteness,
  SnapshotOptions
} from '../types/snapshot';

/**
 * Default snapshot options
 */
const DEFAULT_OPTIONS: SnapshotOptions = {
  includePrices: true,
  includeNews: true,
  includeSentiment: true,
  includeOnChain: true,
  newsTimeWindowHours: 24,
  maxNewsEvents: 10
};

/**
 * Data providers interface for dependency injection
 */
export interface DataProviders {
  getPrices(symbol: string, timeframe: string): Promise<PricePoint[]>;
  getLatestPrice(symbol: string): Promise<PricePoint | null>;
  getNews(symbol: string, startTime: string, endTime: string): Promise<NewsEvent[]>;
  getSentiment(symbol: string): Promise<SentimentData | null>;
  getOnChainMetrics(symbol: string): Promise<OnChainMetric[]>;
}

/**
 * Calculate data completeness based on available data
 * 
 * Requirements: 6.2, 6.3
 */
export function calculateDataCompleteness(
  prices: PricePoint[],
  newsContext: NewsContext,
  sentiment: SentimentData | null,
  onChainMetrics: OnChainMetric[],
  options: SnapshotOptions
): DataCompleteness {
  const hasPrices = options.includePrices && prices.length > 0;
  const hasNews = options.includeNews && newsContext.events.length > 0;
  const hasSentiment = options.includeSentiment && sentiment !== null;
  const hasOnChain = options.includeOnChain && onChainMetrics.length > 0;

  const missingTypes: DataSourceType[] = [];
  
  if (options.includePrices && !hasPrices) {
    missingTypes.push('PRICE');
  }
  if (options.includeNews && !hasNews) {
    missingTypes.push('NEWS');
  }
  if (options.includeSentiment && !hasSentiment) {
    missingTypes.push('SENTIMENT');
  }
  if (options.includeOnChain && !hasOnChain) {
    missingTypes.push('ON_CHAIN');
  }

  return {
    hasPrices,
    hasNews,
    hasSentiment,
    hasOnChain,
    missingTypes
  };
}


/**
 * Calculate quality score based on data completeness and individual quality scores
 * 
 * Requirements: 6.2
 */
export function calculateSnapshotQualityScore(
  prices: PricePoint[],
  newsContext: NewsContext,
  sentiment: SentimentData | null,
  onChainMetrics: OnChainMetric[],
  completeness: DataCompleteness
): number {
  const weights = {
    prices: 0.4,
    news: 0.2,
    sentiment: 0.2,
    onChain: 0.2
  };

  let totalWeight = 0;
  let weightedScore = 0;

  // Price quality
  if (completeness.hasPrices && prices.length > 0) {
    const avgPriceQuality = prices.reduce((sum, p) => sum + p.qualityScore, 0) / prices.length;
    weightedScore += avgPriceQuality * weights.prices;
    totalWeight += weights.prices;
  }

  // News quality (based on relevance scores)
  if (completeness.hasNews && newsContext.events.length > 0) {
    const avgNewsQuality = newsContext.events.reduce((sum, e) => sum + e.relevanceScore, 0) / newsContext.events.length;
    weightedScore += avgNewsQuality * weights.news;
    totalWeight += weights.news;
  }

  // Sentiment quality
  if (completeness.hasSentiment && sentiment) {
    weightedScore += sentiment.qualityScore * weights.sentiment;
    totalWeight += weights.sentiment;
  }

  // On-chain quality
  if (completeness.hasOnChain && onChainMetrics.length > 0) {
    const avgOnChainQuality = onChainMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / onChainMetrics.length;
    weightedScore += avgOnChainQuality * weights.onChain;
    totalWeight += weights.onChain;
  }

  // If no data available, return 0
  if (totalWeight === 0) {
    return 0;
  }

  // Normalize by total weight
  return weightedScore / totalWeight;
}

/**
 * Determine dominant sentiment from news events
 */
function determineDominantSentiment(events: NewsEvent[]): DominantSentiment {
  if (events.length === 0) {
    return 'NEUTRAL';
  }

  const eventsWithSentiment = events.filter(e => e.sentiment !== undefined);
  if (eventsWithSentiment.length === 0) {
    return 'NEUTRAL';
  }

  const avgSentiment = eventsWithSentiment.reduce((sum, e) => sum + (e.sentiment || 0), 0) / eventsWithSentiment.length;
  
  // Check for mixed sentiment (high variance)
  const variance = eventsWithSentiment.reduce((sum, e) => {
    const diff = (e.sentiment || 0) - avgSentiment;
    return sum + diff * diff;
  }, 0) / eventsWithSentiment.length;

  if (variance > 0.25) {
    return 'MIXED';
  }

  if (avgSentiment > 0.2) {
    return 'POSITIVE';
  } else if (avgSentiment < -0.2) {
    return 'NEGATIVE';
  }
  return 'NEUTRAL';
}

/**
 * Generate news context from news events
 * 
 * Requirements: 7.1, 7.2, 7.3
 */
export function generateNewsContext(
  symbol: string,
  events: NewsEvent[],
  timeWindowHours: number,
  maxEvents: number
): NewsContext {
  // Sort by relevance score descending, then by publishedAt descending
  const sortedEvents = [...events].sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  // Limit to maxEvents
  const limitedEvents = sortedEvents.slice(0, maxEvents);

  // Convert to NewsContextEvent format
  const contextEvents: NewsContextEvent[] = limitedEvents.map(event => ({
    eventId: event.eventId,
    title: event.title,
    summary: event.summary || event.content.substring(0, 200) + '...',
    category: event.category,
    relevanceScore: event.relevanceScore,
    publishedAt: event.publishedAt,
    source: event.source
  }));

  // Generate summary
  const summary = contextEvents.length > 0
    ? `${contextEvents.length} news events for ${symbol} in the last ${timeWindowHours} hours`
    : `No news events for ${symbol} in the last ${timeWindowHours} hours`;

  return {
    symbol,
    timeWindow: `${timeWindowHours}h`,
    events: contextEvents,
    summary,
    dominantSentiment: determineDominantSentiment(events),
    eventCount: contextEvents.length,
    generatedAt: new Date().toISOString()
  };
}


/**
 * Snapshot Service implementation
 */
export class SnapshotServiceImpl {
  private providers: DataProviders;

  constructor(providers: DataProviders) {
    this.providers = providers;
  }

  /**
   * Assemble a MarketDataSnapshot combining all data types
   * 
   * Requirements: 6.1, 6.2
   * 
   * @param symbol - The symbol to assemble snapshot for
   * @param timeframe - The timeframe for the snapshot
   * @param options - Optional configuration for what data to include
   * @returns Assembled MarketDataSnapshot
   */
  async assembleSnapshot(
    symbol: string,
    timeframe: string,
    options?: Partial<SnapshotOptions>
  ): Promise<MarketDataSnapshot> {
    const opts: SnapshotOptions = { ...DEFAULT_OPTIONS, ...options };
    const now = new Date();
    const timestamp = now.toISOString();

    // Calculate time window for news
    const newsStartTime = new Date(now.getTime() - opts.newsTimeWindowHours * 60 * 60 * 1000).toISOString();

    // Fetch all data in parallel
    const [prices, latestPrice, newsEvents, sentiment, onChainMetrics] = await Promise.all([
      opts.includePrices ? this.providers.getPrices(symbol, timeframe) : Promise.resolve([]),
      opts.includePrices ? this.providers.getLatestPrice(symbol) : Promise.resolve(null),
      opts.includeNews ? this.providers.getNews(symbol, newsStartTime, timestamp) : Promise.resolve([]),
      opts.includeSentiment ? this.providers.getSentiment(symbol) : Promise.resolve(null),
      opts.includeOnChain ? this.providers.getOnChainMetrics(symbol) : Promise.resolve([])
    ]);

    // Generate news context
    const newsContext = generateNewsContext(
      symbol,
      newsEvents,
      opts.newsTimeWindowHours,
      opts.maxNewsEvents
    );

    // Calculate completeness
    const dataCompleteness = calculateDataCompleteness(
      prices,
      newsContext,
      sentiment,
      onChainMetrics,
      opts
    );

    // Calculate quality score
    const qualityScore = calculateSnapshotQualityScore(
      prices,
      newsContext,
      sentiment,
      onChainMetrics,
      dataCompleteness
    );

    // Create default latest price if none available
    const defaultLatestPrice: PricePoint = latestPrice || {
      symbol,
      timestamp,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      sourceId: 'none',
      qualityScore: 0
    };

    return {
      snapshotId: generateUUID(),
      symbol,
      timestamp,
      timeframe,
      prices,
      latestPrice: defaultLatestPrice,
      newsContext,
      sentiment,
      onChainMetrics,
      qualityScore,
      dataCompleteness,
      assembledAt: new Date().toISOString()
    };
  }
}

/**
 * Create a snapshot service with the given data providers
 */
export function createSnapshotService(providers: DataProviders): SnapshotServiceImpl {
  return new SnapshotServiceImpl(providers);
}
