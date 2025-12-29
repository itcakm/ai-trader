/**
 * News Context Service - generates NewsContext for AI prompts
 * 
 * Provides:
 * - NewsContext generation with relevance ranking
 * - Context usage tracking for auditability
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.5
 */

import { generateUUID } from '../utils/uuid';
import { NewsEvent } from '../types/news';
import { NewsContext, NewsContextEvent, DominantSentiment } from '../types/news-context';

/**
 * Context usage tracking record
 */
export interface ContextUsageRecord {
  trackingId: string;
  contextId: string;
  analysisId: string;
  eventIds: string[];
  symbol: string;
  trackedAt: string;
}

/**
 * In-memory storage for context usage tracking
 * In production, this would be persisted to DynamoDB
 */
const contextUsageStore: Map<string, ContextUsageRecord> = new Map();

/**
 * News provider interface for dependency injection
 */
export interface NewsProvider {
  getNews(symbol: string, startTime: string, endTime: string): Promise<NewsEvent[]>;
}

/**
 * Determine dominant sentiment from news events
 * 
 * @param events - Array of news events to analyze
 * @returns The dominant sentiment classification
 */
export function determineDominantSentiment(events: NewsEvent[]): DominantSentiment {
  if (events.length === 0) {
    return 'NEUTRAL';
  }

  const eventsWithSentiment = events.filter(e => e.sentiment !== undefined && e.sentiment !== null);
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
 * Sort news events by relevance score (descending) then by publishedAt (descending)
 * 
 * Requirements: 7.3
 * 
 * @param events - Array of news events to sort
 * @returns Sorted array of news events
 */
export function sortEventsByRelevance(events: NewsEvent[]): NewsEvent[] {
  return [...events].sort((a, b) => {
    // First sort by relevance score descending
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    // Then by publishedAt descending (most recent first)
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

/**
 * Filter events to only include those within the specified time window
 * 
 * Requirements: 7.1
 * 
 * @param events - Array of news events to filter
 * @param timeWindowHours - Time window in hours
 * @param referenceTime - Reference time (defaults to now)
 * @returns Filtered array of news events within the time window
 */
export function filterEventsByTimeWindow(
  events: NewsEvent[],
  timeWindowHours: number,
  referenceTime: Date = new Date()
): NewsEvent[] {
  const windowStart = new Date(referenceTime.getTime() - timeWindowHours * 60 * 60 * 1000);
  
  return events.filter(event => {
    const eventTime = new Date(event.publishedAt);
    return eventTime >= windowStart && eventTime <= referenceTime;
  });
}

/**
 * Convert NewsEvent to NewsContextEvent format
 * 
 * @param event - NewsEvent to convert
 * @returns NewsContextEvent
 */
export function toNewsContextEvent(event: NewsEvent): NewsContextEvent {
  return {
    eventId: event.eventId,
    title: event.title,
    summary: event.summary || (event.content.length > 200 
      ? event.content.substring(0, 200) + '...' 
      : event.content),
    category: event.category,
    relevanceScore: event.relevanceScore,
    publishedAt: event.publishedAt,
    source: event.source
  };
}

/**
 * Generate a summary string for the news context
 * 
 * @param symbol - The symbol
 * @param eventCount - Number of events
 * @param timeWindowHours - Time window in hours
 * @returns Summary string
 */
export function generateContextSummary(
  symbol: string,
  eventCount: number,
  timeWindowHours: number
): string {
  if (eventCount === 0) {
    return `No news events for ${symbol} in the last ${timeWindowHours} hours`;
  }
  return `${eventCount} news events for ${symbol} in the last ${timeWindowHours} hours`;
}

/**
 * Generate NewsContext from news events
 * 
 * Requirements: 7.1, 7.2, 7.3
 * 
 * @param symbol - The symbol to generate context for
 * @param events - Array of news events
 * @param timeWindowHours - Time window in hours
 * @param maxEvents - Maximum number of events to include (max 10)
 * @returns Generated NewsContext
 */
export function generateNewsContext(
  symbol: string,
  events: NewsEvent[],
  timeWindowHours: number,
  maxEvents: number
): NewsContext {
  // Enforce maximum of 10 events per Requirements 7.2
  const effectiveMaxEvents = Math.min(maxEvents, 10);
  
  // Filter events within time window
  const filteredEvents = filterEventsByTimeWindow(events, timeWindowHours);
  
  // Sort by relevance score descending, then by publishedAt descending
  const sortedEvents = sortEventsByRelevance(filteredEvents);
  
  // Limit to maxEvents
  const limitedEvents = sortedEvents.slice(0, effectiveMaxEvents);
  
  // Convert to NewsContextEvent format
  const contextEvents = limitedEvents.map(toNewsContextEvent);
  
  // Generate summary
  const summary = generateContextSummary(symbol, contextEvents.length, timeWindowHours);
  
  // Determine dominant sentiment from original events (before limiting)
  const dominantSentiment = determineDominantSentiment(filteredEvents);
  
  return {
    symbol,
    timeWindow: `${timeWindowHours}h`,
    events: contextEvents,
    summary,
    dominantSentiment,
    eventCount: contextEvents.length,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Track context usage for auditability
 * 
 * Requirements: 7.5
 * 
 * @param contextId - The context identifier (can be generated or provided)
 * @param analysisId - The analysis that used this context
 * @param context - The NewsContext that was used
 * @returns The tracking record
 */
export function trackContextUsage(
  contextId: string,
  analysisId: string,
  context: NewsContext
): ContextUsageRecord {
  const trackingId = generateUUID();
  const eventIds = context.events.map(e => e.eventId);
  
  const record: ContextUsageRecord = {
    trackingId,
    contextId,
    analysisId,
    eventIds,
    symbol: context.symbol,
    trackedAt: new Date().toISOString()
  };
  
  // Store the tracking record
  contextUsageStore.set(trackingId, record);
  
  return record;
}

/**
 * Get context usage records by analysis ID
 * 
 * @param analysisId - The analysis ID to look up
 * @returns Array of tracking records for the analysis
 */
export function getContextUsageByAnalysis(analysisId: string): ContextUsageRecord[] {
  const records: ContextUsageRecord[] = [];
  for (const record of contextUsageStore.values()) {
    if (record.analysisId === analysisId) {
      records.push(record);
    }
  }
  return records;
}

/**
 * Get context usage records by context ID
 * 
 * @param contextId - The context ID to look up
 * @returns Array of tracking records for the context
 */
export function getContextUsageByContextId(contextId: string): ContextUsageRecord[] {
  const records: ContextUsageRecord[] = [];
  for (const record of contextUsageStore.values()) {
    if (record.contextId === contextId) {
      records.push(record);
    }
  }
  return records;
}

/**
 * Clear all context usage records (for testing)
 */
export function clearContextUsageStore(): void {
  contextUsageStore.clear();
}

/**
 * Get all context usage records (for testing)
 */
export function getAllContextUsageRecords(): ContextUsageRecord[] {
  return Array.from(contextUsageStore.values());
}

/**
 * News Context Service implementation
 */
export class NewsContextService {
  private newsProvider: NewsProvider;

  constructor(newsProvider: NewsProvider) {
    this.newsProvider = newsProvider;
  }

  /**
   * Generate NewsContext for a symbol
   * 
   * Requirements: 7.1, 7.2, 7.3
   * 
   * @param symbol - The symbol to generate context for
   * @param timeWindowHours - Time window in hours
   * @param maxEvents - Maximum number of events (capped at 10)
   * @returns Generated NewsContext
   */
  async generateNewsContext(
    symbol: string,
    timeWindowHours: number,
    maxEvents: number
  ): Promise<NewsContext> {
    const now = new Date();
    const startTime = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000).toISOString();
    const endTime = now.toISOString();

    // Fetch news events from provider
    const events = await this.newsProvider.getNews(symbol, startTime, endTime);

    // Generate context
    return generateNewsContext(symbol, events, timeWindowHours, maxEvents);
  }

  /**
   * Track context usage for auditability
   * 
   * Requirements: 7.5
   * 
   * @param contextId - The context identifier
   * @param analysisId - The analysis that used this context
   * @param context - The NewsContext that was used
   * @returns The tracking record
   */
  trackContextUsage(
    contextId: string,
    analysisId: string,
    context: NewsContext
  ): ContextUsageRecord {
    return trackContextUsage(contextId, analysisId, context);
  }
}

/**
 * Create a news context service with the given news provider
 */
export function createNewsContextService(newsProvider: NewsProvider): NewsContextService {
  return new NewsContextService(newsProvider);
}
