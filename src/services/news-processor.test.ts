/**
 * News Processor Property Tests
 * 
 * Property 5: News Event Processing
 * Validates: Requirements 3.2, 3.3, 3.6
 * 
 * For any NewsEvent after processing, it SHALL contain title, content, source,
 * publishedAt, symbols array, category (from valid enum), AND relevanceScore
 * between 0.0 and 1.0.
 */

import * as fc from 'fast-check';
import { NewsProcessor, RawNewsInput } from './news-processor';
import { NewsCategory } from '../types/news';
import { rawNewsInputArb } from '../test/generators';

describe('NewsProcessor', () => {
  const processor = new NewsProcessor();

  const validCategories: NewsCategory[] = ['REGULATORY', 'TECHNICAL', 'MARKET', 'PARTNERSHIP', 'GENERAL'];

  /**
   * Feature: market-data-ingestion, Property 5: News Event Processing
   * Validates: Requirements 3.2, 3.3, 3.6
   * 
   * For any NewsEvent after processing, it SHALL contain title, content, source,
   * publishedAt, symbols array, category (from valid enum), AND relevanceScore
   * between 0.0 and 1.0.
   */
  describe('Property 5: News Event Processing', () => {
    it('should produce NewsEvent with all required fields for any valid input', () => {
      fc.assert(
        fc.property(rawNewsInputArb(), (input: RawNewsInput) => {
          const result = processor.processNews(input);

          // Verify all required fields are present
          expect(typeof result.eventId).toBe('string');
          expect(result.eventId.length).toBeGreaterThan(0);

          expect(typeof result.title).toBe('string');
          expect(result.title.length).toBeGreaterThan(0);

          expect(typeof result.content).toBe('string');
          expect(result.content.length).toBeGreaterThan(0);

          expect(typeof result.source).toBe('string');
          expect(result.source.length).toBeGreaterThan(0);

          expect(typeof result.sourceUrl).toBe('string');
          expect(result.sourceUrl.length).toBeGreaterThan(0);

          expect(typeof result.publishedAt).toBe('string');
          expect(result.publishedAt.length).toBeGreaterThan(0);

          expect(typeof result.ingestedAt).toBe('string');
          expect(result.ingestedAt.length).toBeGreaterThan(0);

          // Symbols must be an array
          expect(Array.isArray(result.symbols)).toBe(true);

          // Category must be from valid enum
          expect(validCategories).toContain(result.category);

          // Relevance score must be between 0.0 and 1.0
          expect(typeof result.relevanceScore).toBe('number');
          expect(result.relevanceScore).toBeGreaterThanOrEqual(0.0);
          expect(result.relevanceScore).toBeLessThanOrEqual(1.0);

          // Content hash must be present
          expect(typeof result.contentHash).toBe('string');
          expect(result.contentHash.length).toBe(64); // SHA-256 hex length

          // Quality score must be between 0.0 and 1.0
          expect(typeof result.qualityScore).toBe('number');
          expect(result.qualityScore).toBeGreaterThanOrEqual(0.0);
          expect(result.qualityScore).toBeLessThanOrEqual(1.0);
        }),
        { numRuns: 100 }
      );
    });

    it('should categorize news into valid categories for any input', () => {
      fc.assert(
        fc.property(rawNewsInputArb(), (input: RawNewsInput) => {
          const result = processor.processNews(input);
          expect(validCategories).toContain(result.category);
        }),
        { numRuns: 100 }
      );
    });

    it('should calculate relevance score within valid range for any input', () => {
      fc.assert(
        fc.property(rawNewsInputArb(), (input: RawNewsInput) => {
          const result = processor.processNews(input);
          expect(result.relevanceScore).toBeGreaterThanOrEqual(0.0);
          expect(result.relevanceScore).toBeLessThanOrEqual(1.0);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve sentiment when provided in input', () => {
      fc.assert(
        fc.property(
          rawNewsInputArb().filter(input => input.rawSentiment !== undefined),
          (input: RawNewsInput) => {
            const result = processor.processNews(input);
            expect(result.sentiment).toBe(input.rawSentiment);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique content hash for different content', () => {
      fc.assert(
        fc.property(
          rawNewsInputArb(),
          rawNewsInputArb(),
          (input1: RawNewsInput, input2: RawNewsInput) => {
            // Only test when content is actually different
            if (input1.title !== input2.title || input1.content !== input2.content) {
              const result1 = processor.processNews(input1);
              const result2 = processor.processNews(input2);
              expect(result1.contentHash).not.toBe(result2.contentHash);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate same content hash for identical content', () => {
      fc.assert(
        fc.property(rawNewsInputArb(), (input: RawNewsInput) => {
          const result1 = processor.processNews(input);
          const result2 = processor.processNews(input);
          expect(result1.contentHash).toBe(result2.contentHash);
        }),
        { numRuns: 100 }
      );
    });
  });
});
