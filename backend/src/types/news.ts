/**
 * News Data Types for Market Data Ingestion
 * Requirements: 3.2, 3.3
 */

import { SourceAdapter, SubscriptionHandle } from './source-adapter';

export type NewsCategory = 'REGULATORY' | 'TECHNICAL' | 'MARKET' | 'PARTNERSHIP' | 'GENERAL';

export interface NewsEvent {
  eventId: string;
  title: string;
  content: string;
  summary?: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  ingestedAt: string;
  symbols: string[];
  category: NewsCategory;
  relevanceScore: number;
  sentiment?: number;
  contentHash: string;
  qualityScore: number;
}

export interface NewsDeduplicationResult {
  isUnique: boolean;
  similarEventId?: string;
  similarityScore?: number;
}

export interface NewsAdapter extends SourceAdapter {
  subscribeToNews(
    symbols: string[],
    callback: (news: NewsEvent) => void
  ): Promise<SubscriptionHandle>;

  getNewsHistory(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<NewsEvent[]>;

  searchNews(query: string, limit: number): Promise<NewsEvent[]>;
}
