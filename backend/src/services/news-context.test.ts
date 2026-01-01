/**
 * News Context Service Tests
 * 
 * Property-based tests for NewsContext generation and tracking
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.5
 */

import * as fc from 'fast-check';
import {
  generateNewsContext,
  sortEventsByRelevance,
  filterEventsByTimeWindow,
  toNewsContextEvent,
  determineDominantSentiment,
  trackContextUsage,
  getContextUsageByAnalysis,
  getContextUsageByContextId,
  clearContextUsageStore,
  getAllContextUsageRecords,
  NewsContextService,
  createNewsContextService,
  NewsProvider
} from './news-context';
import { NewsEvent } from '../types/news';
import { NewsContext } from '../types/news-context';
import {
  newsEventArb,
  cryptoSymbolArb,
  isoDateStringArb
} from '../test/generators';

/**
 * Generator for news events with controlled publishedAt times within a time window
 */
const newsEventWithinTimeWindowArb = (
  timeWindowHours: number,
  referenceTime: Date = new Date()
): fc.Arbitrary<NewsEvent> => {
  const windowStart = referenceTime.getTime() - timeWindowHours * 60 * 60 * 1000;
  const windowEnd = referenceTime.getTime();
  
  return newsEventArb().map(event => ({
    ...event,
    publishedAt: new Date(
      windowStart + Math.random() * (windowEnd - windowStart)
    ).toISOString()
  }));
};

/**
 * Generator for news events outside a time window
 */
const newsEventOutsideTimeWindowArb = (
  timeWindowHours: number,
  referenceTime: Date = new Date()
): fc.Arbitrary<NewsEvent> => {
  const windowStart = referenceTime.getTime() - timeWindowHours * 60 * 60 * 1000;
  
  return newsEventArb().map(event => ({
    ...event,
    // Set publishedAt to before the time window
    publishedAt: new Date(
      windowStart - Math.random() * 24 * 60 * 60 * 1000 - 1000
    ).toISOString()
  }));
};

describe('News Context Service', () => {
  beforeEach(() => {
    clearContextUsageStore();
  });

  /**
   * Property 14: NewsContext Generation
   * 
   * *For any* NewsContext, it SHALL contain at most 10 NewsEvents, all events SHALL be
   * within the specified time window, AND events SHALL be ordered by relevanceScore
   * descending then publishedAt descending.
   * 
   * **Validates: Requirements 7.1, 7.2, 7.3**
   * **Feature: market-data-ingestion, Property 14: NewsContext Generation**
   */
  describe('Property 14: NewsContext Generation', () => {
    it('NewsContext SHALL contain at most 10 NewsEvents regardless of maxEvents parameter', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 30 }),
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 1, max: 168 }),
          (symbol, events, maxEvents, timeWindowHours) => {
            const context = generateNewsContext(symbol, events, timeWindowHours, maxEvents);
            
            // Property 14: SHALL contain at most 10 NewsEvents
            expect(context.events.length).toBeLessThanOrEqual(10);
            expect(context.eventCount).toBe(context.events.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all events SHALL be within the specified time window', () => {
      const referenceTime = new Date();
      
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.integer({ min: 1, max: 72 }),
          fc.array(
            fc.oneof(
              newsEventWithinTimeWindowArb(72, referenceTime),
              newsEventOutsideTimeWindowArb(72, referenceTime)
            ),
            { minLength: 0, maxLength: 20 }
          ),
          (symbol, timeWindowHours, events) => {
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            
            const windowStart = new Date(referenceTime.getTime() - timeWindowHours * 60 * 60 * 1000);
            
            // All events in context should be within the time window
            for (const event of context.events) {
              const eventTime = new Date(event.publishedAt);
              expect(eventTime.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
              expect(eventTime.getTime()).toBeLessThanOrEqual(referenceTime.getTime());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('events SHALL be ordered by relevanceScore descending', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 2, maxLength: 20 }),
          fc.integer({ min: 1, max: 168 }),
          (symbol, events, timeWindowHours) => {
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            
            // Events should be sorted by relevanceScore descending
            for (let i = 1; i < context.events.length; i++) {
              expect(context.events[i - 1].relevanceScore).toBeGreaterThanOrEqual(
                context.events[i].relevanceScore
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('when relevanceScores are equal, events SHALL be ordered by publishedAt descending', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 2, maxLength: 20 }),
          fc.integer({ min: 1, max: 168 }),
          (symbol, events, timeWindowHours) => {
            // Set all events to have the same relevance score
            const sameRelevanceEvents = events.map(e => ({
              ...e,
              relevanceScore: 0.5
            }));
            
            const context = generateNewsContext(symbol, sameRelevanceEvents, timeWindowHours, 10);
            
            // When relevance scores are equal, events should be sorted by publishedAt descending
            for (let i = 1; i < context.events.length; i++) {
              const prevTime = new Date(context.events[i - 1].publishedAt).getTime();
              const currTime = new Date(context.events[i].publishedAt).getTime();
              expect(prevTime).toBeGreaterThanOrEqual(currTime);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('NewsContext SHALL contain required fields', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 15 }),
          fc.integer({ min: 1, max: 168 }),
          fc.integer({ min: 1, max: 10 }),
          (symbol, events, timeWindowHours, maxEvents) => {
            const context = generateNewsContext(symbol, events, timeWindowHours, maxEvents);
            
            // Verify required fields
            expect(context.symbol).toBe(symbol);
            expect(context.timeWindow).toBe(`${timeWindowHours}h`);
            expect(Array.isArray(context.events)).toBe(true);
            expect(typeof context.summary).toBe('string');
            expect(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED']).toContain(context.dominantSentiment);
            expect(typeof context.eventCount).toBe('number');
            expect(typeof context.generatedAt).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('each NewsContextEvent SHALL contain required fields from original NewsEvent', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 15 }),
          fc.integer({ min: 1, max: 168 }),
          (symbol, events, timeWindowHours) => {
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            
            for (const contextEvent of context.events) {
              expect(typeof contextEvent.eventId).toBe('string');
              expect(contextEvent.eventId.length).toBeGreaterThan(0);
              expect(typeof contextEvent.title).toBe('string');
              expect(typeof contextEvent.summary).toBe('string');
              expect(['REGULATORY', 'TECHNICAL', 'MARKET', 'PARTNERSHIP', 'GENERAL']).toContain(contextEvent.category);
              expect(typeof contextEvent.relevanceScore).toBe('number');
              expect(contextEvent.relevanceScore).toBeGreaterThanOrEqual(0);
              expect(contextEvent.relevanceScore).toBeLessThanOrEqual(1);
              expect(typeof contextEvent.publishedAt).toBe('string');
              expect(typeof contextEvent.source).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('sortEventsByRelevance', () => {
    it('should sort events by relevance score descending', () => {
      fc.assert(
        fc.property(
          fc.array(newsEventArb(), { minLength: 2, maxLength: 20 }),
          (events) => {
            const sorted = sortEventsByRelevance(events);
            
            for (let i = 1; i < sorted.length; i++) {
              expect(sorted[i - 1].relevanceScore).toBeGreaterThanOrEqual(sorted[i].relevanceScore);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not modify the original array', () => {
      fc.assert(
        fc.property(
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          (events) => {
            const originalOrder = events.map(e => e.eventId);
            sortEventsByRelevance(events);
            const afterOrder = events.map(e => e.eventId);
            
            expect(afterOrder).toEqual(originalOrder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('filterEventsByTimeWindow', () => {
    it('should only include events within the time window', () => {
      const referenceTime = new Date();
      
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 72 }),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 20 }),
          (timeWindowHours, events) => {
            const filtered = filterEventsByTimeWindow(events, timeWindowHours, referenceTime);
            const windowStart = new Date(referenceTime.getTime() - timeWindowHours * 60 * 60 * 1000);
            
            for (const event of filtered) {
              const eventTime = new Date(event.publishedAt);
              expect(eventTime.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
              expect(eventTime.getTime()).toBeLessThanOrEqual(referenceTime.getTime());
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('toNewsContextEvent', () => {
    it('should convert NewsEvent to NewsContextEvent with all required fields', () => {
      fc.assert(
        fc.property(
          newsEventArb(),
          (event) => {
            const contextEvent = toNewsContextEvent(event);
            
            expect(contextEvent.eventId).toBe(event.eventId);
            expect(contextEvent.title).toBe(event.title);
            expect(contextEvent.category).toBe(event.category);
            expect(contextEvent.relevanceScore).toBe(event.relevanceScore);
            expect(contextEvent.publishedAt).toBe(event.publishedAt);
            expect(contextEvent.source).toBe(event.source);
            expect(typeof contextEvent.summary).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use event summary if available, otherwise truncate content', () => {
      fc.assert(
        fc.property(
          newsEventArb(),
          (event) => {
            const contextEvent = toNewsContextEvent(event);
            
            if (event.summary) {
              expect(contextEvent.summary).toBe(event.summary);
            } else {
              // Should be truncated content
              expect(contextEvent.summary.length).toBeLessThanOrEqual(204); // 200 + '...'
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('determineDominantSentiment', () => {
    it('should return NEUTRAL for empty events', () => {
      expect(determineDominantSentiment([])).toBe('NEUTRAL');
    });

    it('should return NEUTRAL for events without sentiment', () => {
      fc.assert(
        fc.property(
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          (events) => {
            const eventsWithoutSentiment = events.map(e => ({
              ...e,
              sentiment: undefined
            }));
            
            expect(determineDominantSentiment(eventsWithoutSentiment)).toBe('NEUTRAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return POSITIVE for events with high positive sentiment', () => {
      fc.assert(
        fc.property(
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          (events) => {
            const positiveEvents = events.map(e => ({
              ...e,
              sentiment: 0.5 + Math.random() * 0.5 // 0.5 to 1.0
            }));
            
            expect(determineDominantSentiment(positiveEvents)).toBe('POSITIVE');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return NEGATIVE for events with high negative sentiment', () => {
      fc.assert(
        fc.property(
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          (events) => {
            const negativeEvents = events.map(e => ({
              ...e,
              sentiment: -0.5 - Math.random() * 0.5 // -0.5 to -1.0
            }));
            
            expect(determineDominantSentiment(negativeEvents)).toBe('NEGATIVE');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('NewsContextService', () => {
    it('should generate context using news provider', async () => {
      await fc.assert(
        fc.asyncProperty(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 15 }),
          fc.integer({ min: 1, max: 72 }),
          fc.integer({ min: 1, max: 10 }),
          async (symbol, events, timeWindowHours, maxEvents) => {
            const mockProvider: NewsProvider = {
              getNews: async () => events
            };
            
            const service = createNewsContextService(mockProvider);
            const context = await service.generateNewsContext(symbol, timeWindowHours, maxEvents);
            
            expect(context.symbol).toBe(symbol);
            expect(context.events.length).toBeLessThanOrEqual(Math.min(maxEvents, 10));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15: NewsContext Tracking
   * 
   * *For any* NewsContext used in an AI analysis, a tracking record SHALL be created
   * linking the context's eventIds to the analysisId for auditability.
   * 
   * **Validates: Requirements 7.5**
   * **Feature: market-data-ingestion, Property 15: NewsContext Tracking**
   */
  describe('Property 15: NewsContext Tracking', () => {
    beforeEach(() => {
      clearContextUsageStore();
    });

    it('tracking record SHALL be created linking context eventIds to analysisId', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 72 }),
          (contextId, analysisId, symbol, events, timeWindowHours) => {
            clearContextUsageStore();
            
            // Generate a context
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            
            // Track the context usage
            const record = trackContextUsage(contextId, analysisId, context);
            
            // Verify tracking record was created
            expect(record.trackingId).toBeDefined();
            expect(typeof record.trackingId).toBe('string');
            expect(record.trackingId.length).toBeGreaterThan(0);
            
            // Verify contextId is linked
            expect(record.contextId).toBe(contextId);
            
            // Verify analysisId is linked
            expect(record.analysisId).toBe(analysisId);
            
            // Verify eventIds are linked
            expect(Array.isArray(record.eventIds)).toBe(true);
            expect(record.eventIds).toEqual(context.events.map(e => e.eventId));
            
            // Verify symbol is tracked
            expect(record.symbol).toBe(context.symbol);
            
            // Verify timestamp is set
            expect(typeof record.trackedAt).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('tracking record SHALL be retrievable by analysisId', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 72 }),
          (contextId, analysisId, symbol, events, timeWindowHours) => {
            clearContextUsageStore();
            
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            const record = trackContextUsage(contextId, analysisId, context);
            
            // Retrieve by analysisId
            const records = getContextUsageByAnalysis(analysisId);
            
            expect(records.length).toBe(1);
            expect(records[0].trackingId).toBe(record.trackingId);
            expect(records[0].analysisId).toBe(analysisId);
            expect(records[0].contextId).toBe(contextId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('tracking record SHALL be retrievable by contextId', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 72 }),
          (contextId, analysisId, symbol, events, timeWindowHours) => {
            clearContextUsageStore();
            
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            const record = trackContextUsage(contextId, analysisId, context);
            
            // Retrieve by contextId
            const records = getContextUsageByContextId(contextId);
            
            expect(records.length).toBe(1);
            expect(records[0].trackingId).toBe(record.trackingId);
            expect(records[0].contextId).toBe(contextId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple tracking records SHALL be created for multiple analyses using same context', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }),
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 72 }),
          (contextId, analysisIds, symbol, events, timeWindowHours) => {
            clearContextUsageStore();
            
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            
            // Track usage for multiple analyses
            for (const analysisId of analysisIds) {
              trackContextUsage(contextId, analysisId, context);
            }
            
            // Verify all records were created
            const allRecords = getAllContextUsageRecords();
            expect(allRecords.length).toBe(analysisIds.length);
            
            // Verify each analysis has its own record
            for (const analysisId of analysisIds) {
              const records = getContextUsageByAnalysis(analysisId);
              expect(records.length).toBe(1);
              expect(records[0].analysisId).toBe(analysisId);
            }
            
            // Verify all records are linked to the same contextId
            const contextRecords = getContextUsageByContextId(contextId);
            expect(contextRecords.length).toBe(analysisIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('tracking record eventIds SHALL match the context events', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 72 }),
          (contextId, analysisId, symbol, events, timeWindowHours) => {
            clearContextUsageStore();
            
            const context = generateNewsContext(symbol, events, timeWindowHours, 10);
            const record = trackContextUsage(contextId, analysisId, context);
            
            // Verify eventIds match exactly
            const contextEventIds = context.events.map(e => e.eventId);
            expect(record.eventIds).toEqual(contextEventIds);
            expect(record.eventIds.length).toBe(context.events.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('tracking record SHALL be created even for empty context', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          cryptoSymbolArb(),
          fc.integer({ min: 1, max: 72 }),
          (contextId, analysisId, symbol, timeWindowHours) => {
            clearContextUsageStore();
            
            // Generate empty context
            const context = generateNewsContext(symbol, [], timeWindowHours, 10);
            const record = trackContextUsage(contextId, analysisId, context);
            
            // Verify tracking record was created
            expect(record.trackingId).toBeDefined();
            expect(record.contextId).toBe(contextId);
            expect(record.analysisId).toBe(analysisId);
            expect(record.eventIds).toEqual([]);
            expect(record.symbol).toBe(symbol);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
