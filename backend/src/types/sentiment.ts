/**
 * Sentiment Data Types for Market Data Ingestion
 * Requirements: 4.2, 4.3
 */

import { SourceAdapter } from './source-adapter';

export type SentimentPlatform = 'TWITTER' | 'REDDIT' | 'TELEGRAM' | 'DISCORD' | 'NEWS';

export interface SentimentSource {
  platform: SentimentPlatform;
  score: number;
  volume: number;
  weight: number;
}

export interface SentimentData {
  sentimentId: string;
  symbol: string;
  timestamp: string;
  overallScore: number;
  mentionVolume: number;
  changeRate24h: number;
  sources: SentimentSource[];
  aggregatedFrom: string[];
  qualityScore: number;
}

export interface SentimentAdapter extends SourceAdapter {
  getSentiment(symbol: string): Promise<SentimentData>;

  getSentimentHistory(
    symbol: string,
    startTime: string,
    endTime: string
  ): Promise<SentimentData[]>;
}
