/**
 * Snapshot Service Tests
 * 
 * Property-based tests for snapshot assembly completeness
 * 
 * Requirements: 6.1, 6.2, 6.3
 */

import * as fc from 'fast-check';
import {
  SnapshotServiceImpl,
  createSnapshotService,
  calculateDataCompleteness,
  calculateSnapshotQualityScore,
  generateNewsContext,
  DataProviders
} from './snapshot';
import { PricePoint } from '../types/price';
import { NewsEvent } from '../types/news';
import { SentimentData } from '../types/sentiment';
import { OnChainMetric } from '../types/on-chain';
import { SnapshotOptions } from '../types/snapshot';
import {
  pricePointArb,
  newsEventArb,
  sentimentDataArb,
  onChainMetricArb,
  snapshotOptionsArb,
  cryptoSymbolArb
} from '../test/generators';

/**
 * Create mock data providers for testing
 */
function createMockProviders(
  prices: PricePoint[],
  newsEvents: NewsEvent[],
  sentiment: SentimentData | null,
  onChainMetrics: OnChainMetric[]
): DataProviders {
  return {
    getPrices: async () => prices,
    getLatestPrice: async () => prices.length > 0 ? prices[prices.length - 1] : null,
    getNews: async () => newsEvents,
    getSentiment: async () => sentiment,
    getOnChainMetrics: async () => onChainMetrics
  };
}

describe('Snapshot Service', () => {
  /**
   * Property 12: Snapshot Assembly Completeness
   * 
   * *For any* MarketDataSnapshot, it SHALL contain the symbol, timestamp, timeframe,
   * qualityScore, and dataCompleteness fields, AND dataCompleteness SHALL accurately
   * reflect which data types (prices, news, sentiment, onChain) are present or missing.
   * 
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */
  describe('Property 12: Snapshot Assembly Completeness', () => {
    it('snapshot SHALL contain required fields: symbol, timestamp, timeframe, qualityScore, dataCompleteness', async () => {
      await fc.assert(
        fc.asyncProperty(
          cryptoSymbolArb(),
          fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
          fc.array(pricePointArb(), { minLength: 0, maxLength: 5 }),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 5 }),
          fc.option(sentimentDataArb(), { nil: null }),
          fc.array(onChainMetricArb(), { minLength: 0, maxLength: 5 }),
          async (symbol, timeframe, prices, newsEvents, sentiment, onChainMetrics) => {
            const providers = createMockProviders(prices, newsEvents, sentiment, onChainMetrics);
            const service = createSnapshotService(providers);
            
            const snapshot = await service.assembleSnapshot(symbol, timeframe);
            
            // Verify required fields exist
            expect(snapshot.snapshotId).toBeDefined();
            expect(typeof snapshot.snapshotId).toBe('string');
            expect(snapshot.snapshotId.length).toBeGreaterThan(0);
            
            expect(snapshot.symbol).toBe(symbol);
            
            expect(snapshot.timestamp).toBeDefined();
            expect(typeof snapshot.timestamp).toBe('string');
            
            expect(snapshot.timeframe).toBe(timeframe);
            
            expect(typeof snapshot.qualityScore).toBe('number');
            expect(snapshot.qualityScore).toBeGreaterThanOrEqual(0);
            expect(snapshot.qualityScore).toBeLessThanOrEqual(1);
            
            expect(snapshot.dataCompleteness).toBeDefined();
            expect(typeof snapshot.dataCompleteness.hasPrices).toBe('boolean');
            expect(typeof snapshot.dataCompleteness.hasNews).toBe('boolean');
            expect(typeof snapshot.dataCompleteness.hasSentiment).toBe('boolean');
            expect(typeof snapshot.dataCompleteness.hasOnChain).toBe('boolean');
            expect(Array.isArray(snapshot.dataCompleteness.missingTypes)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('dataCompleteness SHALL accurately reflect which data types are present', async () => {
      await fc.assert(
        fc.asyncProperty(
          cryptoSymbolArb(),
          fc.constantFrom('1h'),
          fc.array(pricePointArb(), { minLength: 0, maxLength: 5 }),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 5 }),
          fc.option(sentimentDataArb(), { nil: null }),
          fc.array(onChainMetricArb(), { minLength: 0, maxLength: 5 }),
          async (symbol, timeframe, prices, newsEvents, sentiment, onChainMetrics) => {
            const providers = createMockProviders(prices, newsEvents, sentiment, onChainMetrics);
            const service = createSnapshotService(providers);
            
            const snapshot = await service.assembleSnapshot(symbol, timeframe);
            const completeness = snapshot.dataCompleteness;
            
            // Verify hasPrices matches actual prices
            expect(completeness.hasPrices).toBe(prices.length > 0);
            
            // Verify hasNews matches actual news events
            expect(completeness.hasNews).toBe(newsEvents.length > 0);
            
            // Verify hasSentiment matches actual sentiment
            expect(completeness.hasSentiment).toBe(sentiment !== null);
            
            // Verify hasOnChain matches actual on-chain metrics
            expect(completeness.hasOnChain).toBe(onChainMetrics.length > 0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('missingTypes SHALL accurately list missing data types', async () => {
      await fc.assert(
        fc.asyncProperty(
          cryptoSymbolArb(),
          fc.constantFrom('1h'),
          fc.array(pricePointArb(), { minLength: 0, maxLength: 5 }),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 5 }),
          fc.option(sentimentDataArb(), { nil: null }),
          fc.array(onChainMetricArb(), { minLength: 0, maxLength: 5 }),
          async (symbol, timeframe, prices, newsEvents, sentiment, onChainMetrics) => {
            const providers = createMockProviders(prices, newsEvents, sentiment, onChainMetrics);
            const service = createSnapshotService(providers);
            
            const snapshot = await service.assembleSnapshot(symbol, timeframe);
            const missingTypes = snapshot.dataCompleteness.missingTypes;
            
            // Verify PRICE is in missingTypes iff prices is empty
            expect(missingTypes.includes('PRICE')).toBe(prices.length === 0);
            
            // Verify NEWS is in missingTypes iff newsEvents is empty
            expect(missingTypes.includes('NEWS')).toBe(newsEvents.length === 0);
            
            // Verify SENTIMENT is in missingTypes iff sentiment is null
            expect(missingTypes.includes('SENTIMENT')).toBe(sentiment === null);
            
            // Verify ON_CHAIN is in missingTypes iff onChainMetrics is empty
            expect(missingTypes.includes('ON_CHAIN')).toBe(onChainMetrics.length === 0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('snapshot SHALL include available data even when some types are missing', async () => {
      await fc.assert(
        fc.asyncProperty(
          cryptoSymbolArb(),
          fc.constantFrom('1h'),
          fc.array(pricePointArb(), { minLength: 1, maxLength: 5 }),
          async (symbol, timeframe, prices) => {
            // Only provide prices, no other data
            const providers = createMockProviders(prices, [], null, []);
            const service = createSnapshotService(providers);
            
            const snapshot = await service.assembleSnapshot(symbol, timeframe);
            
            // Should have prices
            expect(snapshot.prices.length).toBe(prices.length);
            expect(snapshot.dataCompleteness.hasPrices).toBe(true);
            
            // Should indicate missing types
            expect(snapshot.dataCompleteness.hasNews).toBe(false);
            expect(snapshot.dataCompleteness.hasSentiment).toBe(false);
            expect(snapshot.dataCompleteness.hasOnChain).toBe(false);
            expect(snapshot.dataCompleteness.missingTypes).toContain('NEWS');
            expect(snapshot.dataCompleteness.missingTypes).toContain('SENTIMENT');
            expect(snapshot.dataCompleteness.missingTypes).toContain('ON_CHAIN');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateDataCompleteness', () => {
    it('should correctly identify all data types as present when all data is provided', () => {
      fc.assert(
        fc.property(
          fc.array(pricePointArb(), { minLength: 1, maxLength: 5 }),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 5 }),
          sentimentDataArb(),
          fc.array(onChainMetricArb(), { minLength: 1, maxLength: 5 }),
          (prices, newsEvents, sentiment, onChainMetrics) => {
            const newsContext = generateNewsContext('BTC', newsEvents, 24, 10);
            const options: SnapshotOptions = {
              includePrices: true,
              includeNews: true,
              includeSentiment: true,
              includeOnChain: true,
              newsTimeWindowHours: 24,
              maxNewsEvents: 10
            };
            
            const completeness = calculateDataCompleteness(
              prices,
              newsContext,
              sentiment,
              onChainMetrics,
              options
            );
            
            expect(completeness.hasPrices).toBe(true);
            expect(completeness.hasNews).toBe(true);
            expect(completeness.hasSentiment).toBe(true);
            expect(completeness.hasOnChain).toBe(true);
            expect(completeness.missingTypes).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect options when determining completeness', () => {
      fc.assert(
        fc.property(
          fc.array(pricePointArb(), { minLength: 1, maxLength: 5 }),
          fc.array(newsEventArb(), { minLength: 1, maxLength: 5 }),
          sentimentDataArb(),
          fc.array(onChainMetricArb(), { minLength: 1, maxLength: 5 }),
          (prices, newsEvents, sentiment, onChainMetrics) => {
            const newsContext = generateNewsContext('BTC', newsEvents, 24, 10);
            
            // Options that exclude all data types
            const options: SnapshotOptions = {
              includePrices: false,
              includeNews: false,
              includeSentiment: false,
              includeOnChain: false,
              newsTimeWindowHours: 24,
              maxNewsEvents: 10
            };
            
            const completeness = calculateDataCompleteness(
              prices,
              newsContext,
              sentiment,
              onChainMetrics,
              options
            );
            
            // When options exclude data types, they should not be marked as present
            expect(completeness.hasPrices).toBe(false);
            expect(completeness.hasNews).toBe(false);
            expect(completeness.hasSentiment).toBe(false);
            expect(completeness.hasOnChain).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateSnapshotQualityScore', () => {
    it('should return 0 when no data is available', () => {
      const emptyNewsContext = generateNewsContext('BTC', [], 24, 10);
      const options: SnapshotOptions = {
        includePrices: true,
        includeNews: true,
        includeSentiment: true,
        includeOnChain: true,
        newsTimeWindowHours: 24,
        maxNewsEvents: 10
      };
      
      const completeness = calculateDataCompleteness([], emptyNewsContext, null, [], options);
      const score = calculateSnapshotQualityScore([], emptyNewsContext, null, [], completeness);
      
      expect(score).toBe(0);
    });

    it('should return a score between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.array(pricePointArb(), { minLength: 0, maxLength: 5 }),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 5 }),
          fc.option(sentimentDataArb(), { nil: null }),
          fc.array(onChainMetricArb(), { minLength: 0, maxLength: 5 }),
          (prices, newsEvents, sentiment, onChainMetrics) => {
            const newsContext = generateNewsContext('BTC', newsEvents, 24, 10);
            const options: SnapshotOptions = {
              includePrices: true,
              includeNews: true,
              includeSentiment: true,
              includeOnChain: true,
              newsTimeWindowHours: 24,
              maxNewsEvents: 10
            };
            
            const completeness = calculateDataCompleteness(
              prices,
              newsContext,
              sentiment,
              onChainMetrics,
              options
            );
            
            const score = calculateSnapshotQualityScore(
              prices,
              newsContext,
              sentiment,
              onChainMetrics,
              completeness
            );
            
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('generateNewsContext', () => {
    it('should limit events to maxEvents', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 0, maxLength: 20 }),
          fc.integer({ min: 1, max: 10 }),
          (symbol, events, maxEvents) => {
            const context = generateNewsContext(symbol, events, 24, maxEvents);
            
            expect(context.events.length).toBeLessThanOrEqual(maxEvents);
            expect(context.eventCount).toBe(context.events.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort events by relevance score descending', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.array(newsEventArb(), { minLength: 2, maxLength: 10 }),
          (symbol, events) => {
            const context = generateNewsContext(symbol, events, 24, 10);
            
            // Verify events are sorted by relevance score descending
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
  });
});
