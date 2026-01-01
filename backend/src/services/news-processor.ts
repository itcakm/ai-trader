/**
 * News Processing Service
 * 
 * Implements field extraction, categorization, and relevance scoring for news events.
 * Processes raw news data into normalized NewsEvent format ready for storage and analysis.
 * 
 * Requirements: 3.2, 3.3, 3.6
 */

import { NewsEvent, NewsCategory } from '../types/news';
import { generateUUID } from '../utils/uuid';
import * as crypto from 'crypto';

/**
 * Input for processing a raw news item
 */
export interface RawNewsInput {
  title: string;
  content: string;
  summary?: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  rawSymbols?: string[];
  rawCategory?: string;
  rawSentiment?: number;
}

/**
 * Configuration for the news processor
 */
export interface NewsProcessorConfig {
  /** Keywords that indicate high relevance */
  highRelevanceKeywords?: string[];
  /** Keywords that indicate medium relevance */
  mediumRelevanceKeywords?: string[];
  /** Symbol patterns to extract from content */
  symbolPatterns?: RegExp[];
  /** Minimum content length for quality scoring */
  minContentLength?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<NewsProcessorConfig> = {
  highRelevanceKeywords: [
    'breaking', 'urgent', 'major', 'significant', 'critical',
    'sec', 'regulation', 'ban', 'approval', 'etf', 'hack', 'exploit'
  ],
  mediumRelevanceKeywords: [
    'update', 'announce', 'launch', 'partnership', 'integration',
    'upgrade', 'release', 'report', 'analysis', 'forecast'
  ],
  symbolPatterns: [
    /\$([A-Z]{2,10})\b/g,  // $BTC, $ETH format
    /\b([A-Z]{2,5})\/USD[T]?\b/g,  // BTC/USD, ETH/USDT format
    /\b(Bitcoin|Ethereum|Solana|Cardano|Ripple|Dogecoin)\b/gi  // Full names
  ],
  minContentLength: 50
};

/**
 * Symbol name to ticker mapping
 */
const SYMBOL_NAME_MAP: Record<string, string> = {
  'bitcoin': 'BTC',
  'ethereum': 'ETH',
  'solana': 'SOL',
  'cardano': 'ADA',
  'ripple': 'XRP',
  'dogecoin': 'DOGE',
  'polkadot': 'DOT',
  'avalanche': 'AVAX',
  'chainlink': 'LINK',
  'polygon': 'MATIC'
};

/**
 * Category keyword mapping
 */
const CATEGORY_KEYWORDS: Record<NewsCategory, string[]> = {
  'REGULATORY': [
    'regulation', 'regulatory', 'sec', 'cftc', 'law', 'legal', 'compliance',
    'ban', 'restriction', 'license', 'government', 'policy', 'legislation',
    'enforcement', 'sanction', 'court', 'lawsuit', 'ruling'
  ],
  'TECHNICAL': [
    'upgrade', 'fork', 'protocol', 'development', 'code', 'bug', 'fix',
    'release', 'version', 'mainnet', 'testnet', 'smart contract', 'layer',
    'scalability', 'security', 'vulnerability', 'patch', 'update'
  ],
  'MARKET': [
    'price', 'trading', 'volume', 'market', 'exchange', 'listing', 'delist',
    'bull', 'bear', 'rally', 'crash', 'surge', 'drop', 'ath', 'atl',
    'liquidation', 'futures', 'options', 'spot', 'whale'
  ],
  'PARTNERSHIP': [
    'partnership', 'partner', 'collaboration', 'integration', 'deal',
    'agreement', 'alliance', 'joint venture', 'acquisition', 'merger',
    'investment', 'funding', 'backed', 'sponsor'
  ],
  'GENERAL': []
};

/**
 * News Processing Service
 */
export class NewsProcessor {
  private config: Required<NewsProcessorConfig>;

  constructor(config: NewsProcessorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a raw news input into a fully normalized NewsEvent
   * 
   * @param input - Raw news input data
   * @returns Processed NewsEvent with all fields populated
   */
  processNews(input: RawNewsInput): NewsEvent {
    // Extract symbols from content if not provided
    const symbols = this.extractSymbols(input);

    // Determine category
    const category = this.categorizeNews(input);

    // Calculate relevance score
    const relevanceScore = this.calculateRelevanceScore(input, symbols);

    // Generate content hash for deduplication
    const contentHash = this.generateContentHash(input.title, input.content);

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(input);

    return {
      eventId: generateUUID(),
      title: input.title.trim(),
      content: input.content.trim(),
      summary: input.summary?.trim(),
      source: input.source.trim(),
      sourceUrl: input.sourceUrl.trim(),
      publishedAt: input.publishedAt,
      ingestedAt: new Date().toISOString(),
      symbols,
      category,
      relevanceScore,
      sentiment: input.rawSentiment,
      contentHash,
      qualityScore
    };
  }

  /**
   * Extract cryptocurrency symbols from news content
   * 
   * @param input - Raw news input
   * @returns Array of unique symbol tickers
   */
  extractSymbols(input: RawNewsInput): string[] {
    const symbols = new Set<string>();

    // Add any provided symbols
    if (input.rawSymbols) {
      input.rawSymbols.forEach(s => symbols.add(s.toUpperCase()));
    }

    const textToSearch = `${input.title} ${input.content}`;

    // Extract using patterns
    for (const pattern of this.config.symbolPatterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(textToSearch)) !== null) {
        const symbol = match[1];
        if (symbol) {
          // Check if it's a name that needs mapping
          const mapped = SYMBOL_NAME_MAP[symbol.toLowerCase()];
          if (mapped) {
            symbols.add(mapped);
          } else {
            symbols.add(symbol.toUpperCase());
          }
        }
      }
    }

    return Array.from(symbols);
  }

  /**
   * Categorize news based on content analysis
   * 
   * @param input - Raw news input
   * @returns Determined NewsCategory
   */
  categorizeNews(input: RawNewsInput): NewsCategory {
    // If category is provided and valid, use it
    if (input.rawCategory) {
      const normalized = input.rawCategory.toUpperCase().trim();
      if (this.isValidCategory(normalized)) {
        return normalized as NewsCategory;
      }
    }

    const textToAnalyze = `${input.title} ${input.content}`.toLowerCase();

    // Score each category based on keyword matches
    const scores: Record<NewsCategory, number> = {
      'REGULATORY': 0,
      'TECHNICAL': 0,
      'MARKET': 0,
      'PARTNERSHIP': 0,
      'GENERAL': 0
    };

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (textToAnalyze.includes(keyword.toLowerCase())) {
          scores[category as NewsCategory] += 1;
          // Title matches count double
          if (input.title.toLowerCase().includes(keyword.toLowerCase())) {
            scores[category as NewsCategory] += 1;
          }
        }
      }
    }

    // Find category with highest score
    let maxScore = 0;
    let bestCategory: NewsCategory = 'GENERAL';

    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category as NewsCategory;
      }
    }

    return bestCategory;
  }

  /**
   * Calculate relevance score for a news event
   * 
   * Score is based on:
   * - Symbol matching (higher if symbols are mentioned)
   * - Keyword analysis (high/medium relevance keywords)
   * - Content quality (length, structure)
   * - Recency (more recent = more relevant)
   * 
   * @param input - Raw news input
   * @param symbols - Extracted symbols
   * @returns Relevance score between 0.0 and 1.0
   */
  calculateRelevanceScore(input: RawNewsInput, symbols: string[]): number {
    let score = 0.3; // Base score

    const textToAnalyze = `${input.title} ${input.content}`.toLowerCase();

    // Symbol presence boost (up to 0.2)
    if (symbols.length > 0) {
      score += Math.min(0.2, symbols.length * 0.05);
    }

    // High relevance keywords (up to 0.25)
    let highKeywordCount = 0;
    for (const keyword of this.config.highRelevanceKeywords) {
      if (textToAnalyze.includes(keyword.toLowerCase())) {
        highKeywordCount++;
      }
    }
    score += Math.min(0.25, highKeywordCount * 0.05);

    // Medium relevance keywords (up to 0.15)
    let mediumKeywordCount = 0;
    for (const keyword of this.config.mediumRelevanceKeywords) {
      if (textToAnalyze.includes(keyword.toLowerCase())) {
        mediumKeywordCount++;
      }
    }
    score += Math.min(0.15, mediumKeywordCount * 0.03);

    // Content quality boost (up to 0.1)
    if (input.content.length >= this.config.minContentLength) {
      score += 0.05;
    }
    if (input.summary) {
      score += 0.05;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Generate content hash for deduplication
   * 
   * @param title - News title
   * @param content - News content
   * @returns SHA-256 hash of normalized content
   */
  generateContentHash(title: string, content: string): string {
    const normalized = `${title.toLowerCase().trim()}|${content.toLowerCase().trim()}`;
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Calculate quality score for news content
   * 
   * @param input - Raw news input
   * @returns Quality score between 0.0 and 1.0
   */
  calculateQualityScore(input: RawNewsInput): number {
    let score = 1.0;

    // Check required fields
    if (!input.title || input.title.trim().length === 0) {
      score -= 0.3;
    }
    if (!input.content || input.content.trim().length === 0) {
      score -= 0.3;
    }
    if (!input.source || input.source.trim().length === 0) {
      score -= 0.1;
    }
    if (!input.sourceUrl || input.sourceUrl.trim().length === 0) {
      score -= 0.1;
    }

    // Content quality checks
    if (input.title && input.title.length < 10) {
      score -= 0.1;
    }
    if (input.content && input.content.length < this.config.minContentLength) {
      score -= 0.1;
    }

    // Timestamp validity
    if (!input.publishedAt) {
      score -= 0.1;
    } else {
      const timestamp = Date.parse(input.publishedAt);
      if (isNaN(timestamp)) {
        score -= 0.1;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if a category string is valid
   */
  private isValidCategory(category: string): boolean {
    return ['REGULATORY', 'TECHNICAL', 'MARKET', 'PARTNERSHIP', 'GENERAL'].includes(category);
  }

  /**
   * Validate a processed NewsEvent
   * 
   * @param event - NewsEvent to validate
   * @returns true if valid, false otherwise
   */
  validateNewsEvent(event: NewsEvent): boolean {
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
}
