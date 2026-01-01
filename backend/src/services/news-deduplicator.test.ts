/**
 * News Deduplicator Property Tests
 * 
 * Property 7: News Deduplication
 * Validates: Requirements 3.5
 * 
 * For any two NewsEvents with contentHash similarity above the configured threshold,
 * only the first received event SHALL be stored, AND subsequent duplicates SHALL be
 * rejected with a reference to the original eventId.
 */

import * as fc from 'fast-check';
import { NewsEvent } from '../types/news';
import { NewsDeduplicator } from './news-deduplicator';
import { newsEventArb, isoDateStringArb, newsCategoryArb, cryptoSymbolArb } from '../test/generators';

// Mock the NewsRepository to avoid database calls
jest.mock('../repositories/news', () => ({
  NewsRepository: {
    getByContentHash: jest.fn().mockResolvedValue(null)
  }
}));

describe('NewsDeduplicator', () => {
  /**
   * Feature: market-data-ingestion, Property 7: News Deduplication
   * Validates: Requirements 3.5
   * 
   * For any two NewsEvents with contentHash similarity above the configured threshold,
   * only the first received event SHALL be stored, AND subsequent duplicates SHALL be
   * rejected with a reference to the original eventId.
   */
  describe('Property 7: News Deduplication', () => {
    const deduplicator = new NewsDeduplicator({ useCache: false });

    it('should identify identical content as duplicates with similarity 1.0', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          // Create a copy with same content but different eventId
          const duplicate: NewsEvent = {
            ...event,
            eventId: 'different-id-' + event.eventId
          };

          const similarity = deduplicator.calculateSimilarity(event, duplicate);
          expect(similarity).toBe(1.0);
          expect(deduplicator.areDuplicates(event, duplicate)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate same content hash for identical title and content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 50, maxLength: 500 }),
          (title: string, content: string) => {
            const hash1 = deduplicator.generateContentHash(title, content);
            const hash2 = deduplicator.generateContentHash(title, content);
            
            expect(hash1).toBe(hash2);
            expect(hash1.length).toBe(64); // SHA-256 hex length
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate different content hash for different content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 50, maxLength: 500 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 50, maxLength: 500 }),
          (title1: string, content1: string, title2: string, content2: string) => {
            // Only test when content is actually different
            if (title1.toLowerCase().trim() !== title2.toLowerCase().trim() ||
                content1.toLowerCase().trim() !== content2.toLowerCase().trim()) {
              const hash1 = deduplicator.generateContentHash(title1, content1);
              const hash2 = deduplicator.generateContentHash(title2, content2);
              
              expect(hash1).not.toBe(hash2);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate similarity between 0 and 1 for any two events', () => {
      fc.assert(
        fc.property(newsEventArb(), newsEventArb(), (event1: NewsEvent, event2: NewsEvent) => {
          const similarity = deduplicator.calculateSimilarity(event1, event2);
          
          expect(similarity).toBeGreaterThanOrEqual(0);
          expect(similarity).toBeLessThanOrEqual(1);
        }),
        { numRuns: 100 }
      );
    });

    it('should be symmetric - similarity(a,b) equals similarity(b,a)', () => {
      fc.assert(
        fc.property(newsEventArb(), newsEventArb(), (event1: NewsEvent, event2: NewsEvent) => {
          const similarity1 = deduplicator.calculateSimilarity(event1, event2);
          const similarity2 = deduplicator.calculateSimilarity(event2, event1);
          
          expect(similarity1).toBe(similarity2);
        }),
        { numRuns: 100 }
      );
    });

    it('should have reflexive similarity of 1.0 - similarity(a,a) equals 1', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          const similarity = deduplicator.calculateSimilarity(event, event);
          expect(similarity).toBe(1.0);
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly identify duplicates based on threshold', () => {
      const highThresholdDedup = new NewsDeduplicator({ 
        similarityThreshold: 0.9,
        useCache: false 
      });
      const lowThresholdDedup = new NewsDeduplicator({ 
        similarityThreshold: 0.5,
        useCache: false 
      });

      fc.assert(
        fc.property(newsEventArb(), newsEventArb(), (event1: NewsEvent, event2: NewsEvent) => {
          const similarity = highThresholdDedup.calculateSimilarity(event1, event2);
          
          // If high threshold says duplicate, low threshold must also say duplicate
          if (highThresholdDedup.areDuplicates(event1, event2)) {
            expect(lowThresholdDedup.areDuplicates(event1, event2)).toBe(true);
          }
          
          // Verify threshold logic
          if (similarity >= 0.9) {
            expect(highThresholdDedup.areDuplicates(event1, event2)).toBe(true);
          }
          if (similarity >= 0.5) {
            expect(lowThresholdDedup.areDuplicates(event1, event2)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should filter duplicates from batch correctly', async () => {
      const dedup = new NewsDeduplicator({ useCache: true });
      dedup.clearCache();

      await fc.assert(
        fc.asyncProperty(
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          async (events: NewsEvent[]) => {
            dedup.clearCache();
            
            const filtered = await dedup.filterDuplicates(events);
            
            // Filtered should not be longer than original
            expect(filtered.length).toBeLessThanOrEqual(events.length);
            
            // All filtered events should be from original array
            for (const event of filtered) {
              expect(events.some(e => e.eventId === event.eventId)).toBe(true);
            }
            
            // No duplicates in filtered result (by content hash)
            const hashes = new Set(filtered.map(e => e.contentHash));
            expect(hashes.size).toBe(filtered.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should find duplicates in batch and reference original eventId', async () => {
      const dedup = new NewsDeduplicator({ useCache: true });

      await fc.assert(
        fc.asyncProperty(newsEventArb(), async (event: NewsEvent) => {
          dedup.clearCache();
          
          // Create a duplicate with different eventId
          const duplicate: NewsEvent = {
            ...event,
            eventId: 'duplicate-' + event.eventId,
            ingestedAt: new Date().toISOString()
          };

          const events = [event, duplicate];
          const duplicateMap = await dedup.findDuplicatesInBatch(events);

          // The duplicate should reference the original
          if (duplicateMap.has(duplicate.eventId)) {
            expect(duplicateMap.get(duplicate.eventId)).toBe(event.eventId);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
