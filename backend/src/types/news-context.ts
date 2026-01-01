/**
 * NewsContext Types for AI Prompts
 * Requirements: 7.1
 */

import { NewsCategory } from './news';

export type DominantSentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';

export interface NewsContextEvent {
  eventId: string;
  title: string;
  summary: string;
  category: NewsCategory;
  relevanceScore: number;
  publishedAt: string;
  source: string;
}

export interface NewsContext {
  symbol: string;
  timeWindow: string;
  events: NewsContextEvent[];
  summary: string;
  dominantSentiment: DominantSentiment;
  eventCount: number;
  generatedAt: string;
}

export interface ContextService {
  generateNewsContext(
    symbol: string,
    timeWindowHours: number,
    maxEvents: number
  ): Promise<NewsContext>;

  trackContextUsage(contextId: string, analysisId: string): Promise<void>;
}
