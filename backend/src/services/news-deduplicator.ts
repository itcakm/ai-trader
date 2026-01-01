/**
 * News Deduplication Service
 * 
 * Implements content hash comparison and similarity detection for news events.
 * Prevents duplicate news from being stored when the same story is reported
 * by multiple sources.
 * 
 * Requirements: 3.5
 */

import * as crypto from 'crypto';
import { NewsEvent, NewsDeduplicationResult } from '../types/news';
import { NewsRepository } from '../repositories/news';

/**
 * Configuration for the news deduplicator
 */
export interface NewsDeduplicatorConfig {
  /** Similarity threshold for considering two news events as duplicates (0.0 to 1.0) */
  similarityThreshold?: number;
  /** Whether to use in-memory cache for recent hashes */
  useCache?: boolean;
  /** Maximum size of the in-memory cache */
  maxCacheSize?: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<NewsDeduplicatorConfig> = {
  similarityThreshold: 0.85,
  useCache: true,
  maxCacheSize: 10000,
  cacheTtlMs: 3600000  // 1 hour
};

/**
 * Cache entry for content hash
 */
interface CacheEntry {
  eventId: string;
  timestamp: number;
}

/**
 * News Deduplication Service
 */
export class NewsDeduplicator {
  private config: Required<NewsDeduplicatorConfig>;
  private hashCache: Map<string, CacheEntry> = new Map();

  constructor(config: NewsDeduplicatorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a news event is a duplicate
   * 
   * First checks by exact content hash match, then by similarity if no exact match.
   * 
   * @param event - The news event to check
   * @returns Deduplication result indicating if unique or duplicate
   */
  async checkDuplicate(event: NewsEvent): Promise<NewsDeduplicationResult> {
    // First, check exact hash match in cache
    if (this.config.useCache) {
      const cachedResult = this.checkCache(event.contentHash);
      if (cachedResult) {
        return {
          isUnique: false,
          similarEventId: cachedResult.eventId,
          similarityScore: 1.0
        };
      }
    }

    // Check exact hash match in database
    const existingByHash = await NewsRepository.getByContentHash(event.contentHash);
    if (existingByHash) {
      // Add to cache for future lookups
      this.addToCache(event.contentHash, existingByHash.eventId);
      
      return {
        isUnique: false,
        similarEventId: existingByHash.eventId,
        similarityScore: 1.0
      };
    }

    // If no exact match, it's unique
    // Add to cache for future lookups
    this.addToCache(event.contentHash, event.eventId);

    return {
      isUnique: true
    };
  }

  /**
   * Check if two news events are duplicates based on content similarity
   * 
   * @param event1 - First news event
   * @param event2 - Second news event
   * @returns Similarity score between 0.0 and 1.0
   */
  calculateSimilarity(event1: NewsEvent, event2: NewsEvent): number {
    // Exact hash match
    if (event1.contentHash === event2.contentHash) {
      return 1.0;
    }

    // Calculate text similarity using Jaccard similarity on word sets
    const words1 = this.tokenize(event1.title + ' ' + event1.content);
    const words2 = this.tokenize(event2.title + ' ' + event2.content);

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  /**
   * Check if two events are duplicates based on similarity threshold
   * 
   * @param event1 - First news event
   * @param event2 - Second news event
   * @returns True if events are considered duplicates
   */
  areDuplicates(event1: NewsEvent, event2: NewsEvent): boolean {
    const similarity = this.calculateSimilarity(event1, event2);
    return similarity >= this.config.similarityThreshold;
  }

  /**
   * Generate content hash for a news event
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
   * Find duplicates in a batch of news events
   * 
   * @param events - Array of news events to check
   * @returns Map of eventId to duplicate eventId (if duplicate)
   */
  async findDuplicatesInBatch(events: NewsEvent[]): Promise<Map<string, string>> {
    const duplicates = new Map<string, string>();
    const seenHashes = new Map<string, string>();

    for (const event of events) {
      // Check against already seen events in this batch
      if (seenHashes.has(event.contentHash)) {
        duplicates.set(event.eventId, seenHashes.get(event.contentHash)!);
        continue;
      }

      // Check against database
      const result = await this.checkDuplicate(event);
      if (!result.isUnique && result.similarEventId) {
        duplicates.set(event.eventId, result.similarEventId);
      } else {
        seenHashes.set(event.contentHash, event.eventId);
      }
    }

    return duplicates;
  }

  /**
   * Filter out duplicates from a batch of news events
   * 
   * @param events - Array of news events to filter
   * @returns Array of unique news events
   */
  async filterDuplicates(events: NewsEvent[]): Promise<NewsEvent[]> {
    const duplicates = await this.findDuplicatesInBatch(events);
    return events.filter(event => !duplicates.has(event.eventId));
  }

  /**
   * Tokenize text into a set of words
   */
  private tokenize(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);  // Filter out very short words
    
    return new Set(words);
  }

  /**
   * Check the in-memory cache for a content hash
   */
  private checkCache(contentHash: string): CacheEntry | null {
    const entry = this.hashCache.get(contentHash);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.config.cacheTtlMs) {
      this.hashCache.delete(contentHash);
      return null;
    }

    return entry;
  }

  /**
   * Add a content hash to the in-memory cache
   */
  private addToCache(contentHash: string, eventId: string): void {
    if (!this.config.useCache) {
      return;
    }

    // Evict oldest entries if cache is full
    if (this.hashCache.size >= this.config.maxCacheSize) {
      this.evictOldestEntries(Math.floor(this.config.maxCacheSize * 0.1));
    }

    this.hashCache.set(contentHash, {
      eventId,
      timestamp: Date.now()
    });
  }

  /**
   * Evict the oldest entries from the cache
   */
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.hashCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < count && i < entries.length; i++) {
      this.hashCache.delete(entries[i][0]);
    }
  }

  /**
   * Clear the in-memory cache
   */
  clearCache(): void {
    this.hashCache.clear();
  }

  /**
   * Get the current cache size
   */
  getCacheSize(): number {
    return this.hashCache.size;
  }

  /**
   * Get the similarity threshold
   */
  getSimilarityThreshold(): number {
    return this.config.similarityThreshold;
  }
}
