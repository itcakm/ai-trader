/**
 * News Repository Property Tests
 * 
 * Property 6: News Event Persistence Round-Trip
 * Validates: Requirements 3.4
 * 
 * For any valid NewsEvent object, serializing to JSON, persisting to storage,
 * retrieving, and deserializing SHALL produce an equivalent NewsEvent with
 * all fields preserved.
 */

import * as fc from 'fast-check';
import { NewsEvent } from '../types/news';
import { serializeNewsEvent, deserializeNewsEvent } from './news';
import { newsEventArb } from '../test/generators';

describe('NewsRepository', () => {
  /**
   * Feature: market-data-ingestion, Property 6: News Event Persistence Round-Trip
   * Validates: Requirements 3.4
   * 
   * For any valid NewsEvent object, serializing to JSON, persisting to storage,
   * retrieving, and deserializing SHALL produce an equivalent NewsEvent with
   * all fields preserved.
   */
  describe('Property 6: News Event Persistence Round-Trip', () => {
    it('should preserve all fields through serialization and deserialization', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          // Use a test symbol for serialization
          const symbol = event.symbols.length > 0 ? event.symbols[0] : 'TEST';
          
          // Serialize the event
          const serialized = serializeNewsEvent(event, symbol);
          
          // Deserialize back to NewsEvent
          const deserialized = deserializeNewsEvent(serialized);

          // Verify all fields are preserved
          expect(deserialized.eventId).toBe(event.eventId);
          expect(deserialized.title).toBe(event.title);
          expect(deserialized.content).toBe(event.content);
          expect(deserialized.summary).toBe(event.summary);
          expect(deserialized.source).toBe(event.source);
          expect(deserialized.sourceUrl).toBe(event.sourceUrl);
          expect(deserialized.publishedAt).toBe(event.publishedAt);
          expect(deserialized.ingestedAt).toBe(event.ingestedAt);
          expect(deserialized.symbols).toEqual(event.symbols);
          expect(deserialized.category).toBe(event.category);
          expect(deserialized.relevanceScore).toBe(event.relevanceScore);
          expect(deserialized.sentiment).toBe(event.sentiment);
          expect(deserialized.contentHash).toBe(event.contentHash);
          expect(deserialized.qualityScore).toBe(event.qualityScore);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce equivalent NewsEvent after round-trip', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          const symbol = event.symbols.length > 0 ? event.symbols[0] : 'TEST';
          
          const serialized = serializeNewsEvent(event, symbol);
          const deserialized = deserializeNewsEvent(serialized);

          // Deep equality check
          expect(deserialized).toEqual(event);
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly serialize symbols array to JSON string', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          const symbol = event.symbols.length > 0 ? event.symbols[0] : 'TEST';
          
          const serialized = serializeNewsEvent(event, symbol);
          
          // Verify symbols is serialized as JSON string
          expect(typeof serialized.symbols).toBe('string');
          
          // Verify it can be parsed back
          const parsedSymbols = JSON.parse(serialized.symbols);
          expect(Array.isArray(parsedSymbols)).toBe(true);
          expect(parsedSymbols).toEqual(event.symbols);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve optional sentiment field correctly', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          const symbol = event.symbols.length > 0 ? event.symbols[0] : 'TEST';
          
          const serialized = serializeNewsEvent(event, symbol);
          const deserialized = deserializeNewsEvent(serialized);

          if (event.sentiment === undefined) {
            expect(deserialized.sentiment).toBeUndefined();
          } else {
            expect(deserialized.sentiment).toBe(event.sentiment);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve optional summary field correctly', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          const symbol = event.symbols.length > 0 ? event.symbols[0] : 'TEST';
          
          const serialized = serializeNewsEvent(event, symbol);
          const deserialized = deserializeNewsEvent(serialized);

          if (event.summary === undefined) {
            expect(deserialized.summary).toBeUndefined();
          } else {
            expect(deserialized.summary).toBe(event.summary);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should create correct composite sort key', () => {
      fc.assert(
        fc.property(newsEventArb(), (event: NewsEvent) => {
          const symbol = event.symbols.length > 0 ? event.symbols[0] : 'TEST';
          
          const serialized = serializeNewsEvent(event, symbol);
          
          // Verify sort key format: publishedAt#eventId
          expect(serialized.publishedAtEventId).toBe(`${event.publishedAt}#${event.eventId}`);
        }),
        { numRuns: 100 }
      );
    });
  });
});
