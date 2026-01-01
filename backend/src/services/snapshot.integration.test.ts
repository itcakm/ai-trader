/**
 * Integration Tests for Snapshot Assembly
 * 
 * Tests the complete snapshot assembly flow:
 * - Ingest all data types → assemble snapshot → verify completeness
 * 
 * Requirements: 6.1
 */

import { 
  SnapshotServiceImpl, 
  createSnapshotService, 
  DataProviders,
  calculateDataCompleteness,
  calculateSnapshotQualityScore,
  generateNewsContext
} from './snapshot';
import { PriceNormalizerService, RawPriceInput } from './price-normalizer';
import { NewsProcessor, RawNewsInput } from './news-processor';
import { SentimentNormalizer, RawSentimentInput } from './sentiment-normalizer';
import { OnChainNormalizer, RawOnChainInput } from './onchain-normalizer';
import { PricePoint } from '../types/price';
import { NewsEvent } from '../types/news';
import { SentimentData } from '../types/sentiment';
import { OnChainMetric, OnChainMetricType } from '../types/on-chain';
import { MarketDataSnapshot, SnapshotOptions } from '../types/snapshot';

/**
 * In-memory data store for integration testing
 */
class InMemoryDataStore {
  private prices: Map<string, PricePoint[]> = new Map();
  private news: Map<string, NewsEvent[]> = new Map();
  private sentiment: Map<string, SentimentData> = new Map();
  private onChain: Map<string, OnChainMetric[]> = new Map();

  // Price operations
  addPrice(price: PricePoint): void {
    const key = price.symbol;
    if (!this.prices.has(key)) {
      this.prices.set(key, []);
    }
    this.prices.get(key)!.push(price);
  }

  getPrices(symbol: string): PricePoint[] {
    return this.prices.get(symbol) || [];
  }

  getLatestPrice(symbol: string): PricePoint | null {
    const prices = this.getPrices(symbol);
    if (prices.length === 0) return null;
    return prices.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
  }

  // News operations
  addNews(event: NewsEvent): void {
    for (const symbol of event.symbols) {
      if (!this.news.has(symbol)) {
        this.news.set(symbol, []);
      }
      this.news.get(symbol)!.push(event);
    }
    // Also add to GENERAL if no symbols
    if (event.symbols.length === 0) {
      if (!this.news.has('GENERAL')) {
        this.news.set('GENERAL', []);
      }
      this.news.get('GENERAL')!.push(event);
    }
  }

  getNews(symbol: string, startTime: string, endTime: string): NewsEvent[] {
    const events = this.news.get(symbol) || [];
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return events.filter(e => {
      const time = new Date(e.publishedAt).getTime();
      return time >= start && time <= end;
    });
  }

  // Sentiment operations
  addSentiment(data: SentimentData): void {
    this.sentiment.set(data.symbol, data);
  }

  getSentiment(symbol: string): SentimentData | null {
    return this.sentiment.get(symbol) || null;
  }

  // On-chain operations
  addOnChainMetric(metric: OnChainMetric): void {
    const key = metric.symbol;
    if (!this.onChain.has(key)) {
      this.onChain.set(key, []);
    }
    this.onChain.get(key)!.push(metric);
  }

  getOnChainMetrics(symbol: string): OnChainMetric[] {
    return this.onChain.get(symbol) || [];
  }

  clear(): void {
    this.prices.clear();
    this.news.clear();
    this.sentiment.clear();
    this.onChain.clear();
  }
}

/**
 * Create data providers from in-memory store
 */
function createDataProviders(store: InMemoryDataStore): DataProviders {
  return {
    getPrices: async (symbol: string, _timeframe: string) => store.getPrices(symbol),
    getLatestPrice: async (symbol: string) => store.getLatestPrice(symbol),
    getNews: async (symbol: string, startTime: string, endTime: string) => 
      store.getNews(symbol, startTime, endTime),
    getSentiment: async (symbol: string) => store.getSentiment(symbol),
    getOnChainMetrics: async (symbol: string) => store.getOnChainMetrics(symbol)
  };
}

/**
 * Helper to generate test data
 */
class TestDataGenerator {
  private newsProcessor = new NewsProcessor();

  generatePricePoint(symbol: string, sourceId: string = 'test-source'): PricePoint {
    const basePrice = symbol === 'BTC' ? 45000 : symbol === 'ETH' ? 2500 : 100;
    const variance = basePrice * 0.02;
    const open = basePrice + (Math.random() - 0.5) * variance;
    const close = basePrice + (Math.random() - 0.5) * variance;
    const high = Math.max(open, close) + Math.random() * variance * 0.5;
    const low = Math.min(open, close) - Math.random() * variance * 0.5;

    const rawInput: RawPriceInput = {
      symbol,
      timestamp: new Date().toISOString(),
      open: open.toString(),
      high: high.toString(),
      low: low.toString(),
      close: close.toString(),
      volume: (Math.random() * 1000000).toString(),
      sourceId
    };

    return PriceNormalizerService.normalize(rawInput).pricePoint;
  }

  generateNewsEvent(symbol: string): NewsEvent {
    const rawInput: RawNewsInput = {
      title: `Breaking: ${symbol} market update`,
      content: `The cryptocurrency ${symbol} has seen significant activity. Market analysts are watching closely as trading volume increases.`,
      source: 'CryptoNews',
      sourceUrl: `https://cryptonews.com/${symbol.toLowerCase()}-update`,
      publishedAt: new Date().toISOString(),
      rawSymbols: [symbol],
      rawCategory: 'MARKET',
      rawSentiment: Math.random() * 2 - 1
    };

    return this.newsProcessor.processNews(rawInput);
  }

  generateSentimentData(symbol: string): SentimentData {
    const rawInput: RawSentimentInput = {
      symbol,
      timestamp: new Date().toISOString(),
      score: Math.random() * 100,
      scoreMin: 0,
      scoreMax: 100,
      mentionVolume: Math.floor(Math.random() * 10000),
      changeRate24h: (Math.random() - 0.5) * 20,
      sources: [
        { platform: 'TWITTER', score: Math.random() * 100, volume: 5000 },
        { platform: 'REDDIT', score: Math.random() * 100, volume: 3000 }
      ],
      sourceId: 'test-source'
    };

    return SentimentNormalizer.normalize(rawInput).data!;
  }

  generateOnChainMetric(symbol: string, metricType: OnChainMetricType = 'ACTIVE_ADDRESSES'): OnChainMetric {
    const rawInput: RawOnChainInput = {
      symbol,
      metricType,
      value: Math.floor(Math.random() * 1000000),
      timestamp: new Date().toISOString(),
      change24h: (Math.random() - 0.5) * 10,
      sourceId: 'test-source'
    };

    return OnChainNormalizer.normalize(rawInput).data!;
  }
}

describe('Snapshot Assembly Integration Tests', () => {
  let store: InMemoryDataStore;
  let snapshotService: SnapshotServiceImpl;
  let generator: TestDataGenerator;

  beforeEach(() => {
    store = new InMemoryDataStore();
    snapshotService = createSnapshotService(createDataProviders(store));
    generator = new TestDataGenerator();
  });

  afterEach(() => {
    store.clear();
  });

  describe('Complete Snapshot Assembly Flow', () => {
    /**
     * Test: ingest all data types → assemble snapshot → verify completeness
     * Requirements: 6.1
     */
    it('should assemble complete snapshot with all data types', async () => {
      const symbol = 'BTC';

      // Step 1: Ingest price data
      const price1 = generator.generatePricePoint(symbol);
      const price2 = generator.generatePricePoint(symbol);
      store.addPrice(price1);
      store.addPrice(price2);

      // Step 2: Ingest news data
      const news1 = generator.generateNewsEvent(symbol);
      const news2 = generator.generateNewsEvent(symbol);
      store.addNews(news1);
      store.addNews(news2);

      // Step 3: Ingest sentiment data
      const sentiment = generator.generateSentimentData(symbol);
      store.addSentiment(sentiment);

      // Step 4: Ingest on-chain data
      const onChain1 = generator.generateOnChainMetric(symbol, 'ACTIVE_ADDRESSES');
      const onChain2 = generator.generateOnChainMetric(symbol, 'TRANSACTION_VOLUME');
      store.addOnChainMetric(onChain1);
      store.addOnChainMetric(onChain2);

      // Step 5: Assemble snapshot
      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      // Step 6: Verify completeness
      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.symbol).toBe(symbol);
      expect(snapshot.timeframe).toBe('1h');
      
      // Verify all data types present
      expect(snapshot.prices).toHaveLength(2);
      expect(snapshot.latestPrice).toBeDefined();
      expect(snapshot.newsContext.events.length).toBeGreaterThan(0);
      expect(snapshot.sentiment).toBeDefined();
      expect(snapshot.onChainMetrics).toHaveLength(2);

      // Verify data completeness
      expect(snapshot.dataCompleteness.hasPrices).toBe(true);
      expect(snapshot.dataCompleteness.hasNews).toBe(true);
      expect(snapshot.dataCompleteness.hasSentiment).toBe(true);
      expect(snapshot.dataCompleteness.hasOnChain).toBe(true);
      expect(snapshot.dataCompleteness.missingTypes).toHaveLength(0);

      // Verify quality score
      expect(snapshot.qualityScore).toBeGreaterThan(0);
      expect(snapshot.qualityScore).toBeLessThanOrEqual(1);
    });

    it('should handle partial data availability', async () => {
      const symbol = 'ETH';

      // Only ingest price and sentiment (no news or on-chain)
      store.addPrice(generator.generatePricePoint(symbol));
      store.addSentiment(generator.generateSentimentData(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      // Verify partial completeness
      expect(snapshot.dataCompleteness.hasPrices).toBe(true);
      expect(snapshot.dataCompleteness.hasNews).toBe(false);
      expect(snapshot.dataCompleteness.hasSentiment).toBe(true);
      expect(snapshot.dataCompleteness.hasOnChain).toBe(false);
      
      // Verify missing types
      expect(snapshot.dataCompleteness.missingTypes).toContain('NEWS');
      expect(snapshot.dataCompleteness.missingTypes).toContain('ON_CHAIN');
      expect(snapshot.dataCompleteness.missingTypes).not.toContain('PRICE');
      expect(snapshot.dataCompleteness.missingTypes).not.toContain('SENTIMENT');
    });

    it('should handle empty data gracefully', async () => {
      const symbol = 'SOL';

      // No data ingested
      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      // Verify empty snapshot
      expect(snapshot.symbol).toBe(symbol);
      expect(snapshot.prices).toHaveLength(0);
      expect(snapshot.newsContext.events).toHaveLength(0);
      expect(snapshot.sentiment).toBeNull();
      expect(snapshot.onChainMetrics).toHaveLength(0);

      // Verify all types missing
      expect(snapshot.dataCompleteness.hasPrices).toBe(false);
      expect(snapshot.dataCompleteness.hasNews).toBe(false);
      expect(snapshot.dataCompleteness.hasSentiment).toBe(false);
      expect(snapshot.dataCompleteness.hasOnChain).toBe(false);
      expect(snapshot.dataCompleteness.missingTypes).toHaveLength(4);

      // Quality score should be 0 for empty snapshot
      expect(snapshot.qualityScore).toBe(0);
    });
  });

  describe('Snapshot Options', () => {
    it('should respect includePrices option', async () => {
      const symbol = 'BTC';
      store.addPrice(generator.generatePricePoint(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h', {
        includePrices: false
      });

      expect(snapshot.prices).toHaveLength(0);
      expect(snapshot.dataCompleteness.hasPrices).toBe(false);
    });

    it('should respect includeNews option', async () => {
      const symbol = 'BTC';
      store.addNews(generator.generateNewsEvent(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h', {
        includeNews: false
      });

      expect(snapshot.newsContext.events).toHaveLength(0);
      expect(snapshot.dataCompleteness.hasNews).toBe(false);
    });

    it('should respect includeSentiment option', async () => {
      const symbol = 'BTC';
      store.addSentiment(generator.generateSentimentData(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h', {
        includeSentiment: false
      });

      expect(snapshot.sentiment).toBeNull();
      expect(snapshot.dataCompleteness.hasSentiment).toBe(false);
    });

    it('should respect includeOnChain option', async () => {
      const symbol = 'BTC';
      store.addOnChainMetric(generator.generateOnChainMetric(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h', {
        includeOnChain: false
      });

      expect(snapshot.onChainMetrics).toHaveLength(0);
      expect(snapshot.dataCompleteness.hasOnChain).toBe(false);
    });

    it('should respect maxNewsEvents option', async () => {
      const symbol = 'BTC';
      
      // Add 15 news events
      for (let i = 0; i < 15; i++) {
        store.addNews(generator.generateNewsEvent(symbol));
      }

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h', {
        maxNewsEvents: 5
      });

      expect(snapshot.newsContext.events.length).toBeLessThanOrEqual(5);
    });
  });

  describe('News Context Generation', () => {
    it('should sort news by relevance score', async () => {
      const symbol = 'BTC';
      
      // Create news with different relevance scores
      const news1 = generator.generateNewsEvent(symbol);
      const news2 = generator.generateNewsEvent(symbol);
      const news3 = generator.generateNewsEvent(symbol);
      
      store.addNews(news1);
      store.addNews(news2);
      store.addNews(news3);

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      // Verify events are sorted by relevance (descending)
      const events = snapshot.newsContext.events;
      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1].relevanceScore).toBeGreaterThanOrEqual(events[i].relevanceScore);
      }
    });

    it('should determine dominant sentiment', async () => {
      const symbol = 'BTC';
      
      // Add news events
      store.addNews(generator.generateNewsEvent(symbol));
      store.addNews(generator.generateNewsEvent(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      // Verify dominant sentiment is set
      expect(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED']).toContain(
        snapshot.newsContext.dominantSentiment
      );
    });

    it('should generate summary', async () => {
      const symbol = 'ETH';
      store.addNews(generator.generateNewsEvent(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      expect(snapshot.newsContext.summary).toBeDefined();
      expect(snapshot.newsContext.summary.length).toBeGreaterThan(0);
    });
  });

  describe('Quality Score Calculation', () => {
    it('should calculate quality score based on data quality', async () => {
      const symbol = 'BTC';

      // Add high-quality data
      store.addPrice(generator.generatePricePoint(symbol));
      store.addSentiment(generator.generateSentimentData(symbol));
      store.addOnChainMetric(generator.generateOnChainMetric(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      expect(snapshot.qualityScore).toBeGreaterThan(0);
      expect(snapshot.qualityScore).toBeLessThanOrEqual(1);
    });

    it('should weight different data types appropriately', async () => {
      const symbol = 'BTC';

      // Add only price data (highest weight: 0.4)
      store.addPrice(generator.generatePricePoint(symbol));

      const priceOnlySnapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      // Add sentiment data (weight: 0.2)
      store.addSentiment(generator.generateSentimentData(symbol));

      const priceAndSentimentSnapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      // Both should have quality scores
      expect(priceOnlySnapshot.qualityScore).toBeGreaterThan(0);
      expect(priceAndSentimentSnapshot.qualityScore).toBeGreaterThan(0);
    });
  });

  describe('Data Completeness Tracking', () => {
    it('should accurately track which data types are present', async () => {
      const symbol = 'BTC';

      // Add only price and on-chain
      store.addPrice(generator.generatePricePoint(symbol));
      store.addOnChainMetric(generator.generateOnChainMetric(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      expect(snapshot.dataCompleteness.hasPrices).toBe(true);
      expect(snapshot.dataCompleteness.hasNews).toBe(false);
      expect(snapshot.dataCompleteness.hasSentiment).toBe(false);
      expect(snapshot.dataCompleteness.hasOnChain).toBe(true);
    });

    it('should list missing data types', async () => {
      const symbol = 'ETH';

      // Add only sentiment
      store.addSentiment(generator.generateSentimentData(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      expect(snapshot.dataCompleteness.missingTypes).toContain('PRICE');
      expect(snapshot.dataCompleteness.missingTypes).toContain('NEWS');
      expect(snapshot.dataCompleteness.missingTypes).toContain('ON_CHAIN');
      expect(snapshot.dataCompleteness.missingTypes).not.toContain('SENTIMENT');
    });
  });

  describe('Multi-Symbol Snapshots', () => {
    it('should assemble snapshots for different symbols independently', async () => {
      // Add data for BTC
      store.addPrice(generator.generatePricePoint('BTC'));
      store.addSentiment(generator.generateSentimentData('BTC'));

      // Add data for ETH
      store.addPrice(generator.generatePricePoint('ETH'));
      store.addNews(generator.generateNewsEvent('ETH'));

      // Assemble snapshots
      const btcSnapshot = await snapshotService.assembleSnapshot('BTC', '1h');
      const ethSnapshot = await snapshotService.assembleSnapshot('ETH', '1h');

      // Verify BTC snapshot
      expect(btcSnapshot.symbol).toBe('BTC');
      expect(btcSnapshot.dataCompleteness.hasPrices).toBe(true);
      expect(btcSnapshot.dataCompleteness.hasSentiment).toBe(true);
      expect(btcSnapshot.dataCompleteness.hasNews).toBe(false);

      // Verify ETH snapshot
      expect(ethSnapshot.symbol).toBe('ETH');
      expect(ethSnapshot.dataCompleteness.hasPrices).toBe(true);
      expect(ethSnapshot.dataCompleteness.hasNews).toBe(true);
      expect(ethSnapshot.dataCompleteness.hasSentiment).toBe(false);
    });
  });

  describe('Snapshot Metadata', () => {
    it('should include all required metadata fields', async () => {
      const symbol = 'BTC';
      store.addPrice(generator.generatePricePoint(symbol));

      const snapshot = await snapshotService.assembleSnapshot(symbol, '4h');

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.snapshotId.length).toBeGreaterThan(0);
      expect(snapshot.symbol).toBe(symbol);
      expect(snapshot.timeframe).toBe('4h');
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.assembledAt).toBeDefined();
      expect(snapshot.qualityScore).toBeDefined();
      expect(snapshot.dataCompleteness).toBeDefined();
    });

    it('should provide default latest price when no prices available', async () => {
      const symbol = 'SOL';

      const snapshot = await snapshotService.assembleSnapshot(symbol, '1h');

      expect(snapshot.latestPrice).toBeDefined();
      expect(snapshot.latestPrice.symbol).toBe(symbol);
      expect(snapshot.latestPrice.close).toBe(0);
      expect(snapshot.latestPrice.qualityScore).toBe(0);
    });
  });

  describe('Unit Tests for Helper Functions', () => {
    it('calculateDataCompleteness should correctly identify missing types', () => {
      const options: SnapshotOptions = {
        includePrices: true,
        includeNews: true,
        includeSentiment: true,
        includeOnChain: true,
        newsTimeWindowHours: 24,
        maxNewsEvents: 10
      };

      const completeness = calculateDataCompleteness(
        [], // no prices
        { symbol: 'BTC', timeWindow: '24h', events: [], summary: '', dominantSentiment: 'NEUTRAL', eventCount: 0, generatedAt: '' },
        null, // no sentiment
        [], // no on-chain
        options
      );

      expect(completeness.hasPrices).toBe(false);
      expect(completeness.hasNews).toBe(false);
      expect(completeness.hasSentiment).toBe(false);
      expect(completeness.hasOnChain).toBe(false);
      expect(completeness.missingTypes).toEqual(['PRICE', 'NEWS', 'SENTIMENT', 'ON_CHAIN']);
    });

    it('generateNewsContext should limit events to maxEvents', () => {
      const events: NewsEvent[] = [];
      for (let i = 0; i < 20; i++) {
        events.push({
          eventId: `event-${i}`,
          title: `News ${i}`,
          content: `Content ${i}`,
          source: 'Test',
          sourceUrl: 'https://test.com',
          publishedAt: new Date().toISOString(),
          ingestedAt: new Date().toISOString(),
          symbols: ['BTC'],
          category: 'MARKET',
          relevanceScore: Math.random(),
          contentHash: `hash-${i}`,
          qualityScore: 0.9
        });
      }

      const context = generateNewsContext('BTC', events, 24, 5);

      expect(context.events.length).toBe(5);
      expect(context.eventCount).toBe(5);
    });

    it('generateNewsContext should sort by relevance then recency', () => {
      const now = new Date();
      const events: NewsEvent[] = [
        {
          eventId: 'event-1',
          title: 'Low relevance old',
          content: 'Content',
          source: 'Test',
          sourceUrl: 'https://test.com',
          publishedAt: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
          ingestedAt: new Date().toISOString(),
          symbols: ['BTC'],
          category: 'MARKET',
          relevanceScore: 0.3,
          contentHash: 'hash-1',
          qualityScore: 0.9
        },
        {
          eventId: 'event-2',
          title: 'High relevance',
          content: 'Content',
          source: 'Test',
          sourceUrl: 'https://test.com',
          publishedAt: new Date(now.getTime() - 7200000).toISOString(), // 2 hours ago
          ingestedAt: new Date().toISOString(),
          symbols: ['BTC'],
          category: 'MARKET',
          relevanceScore: 0.9,
          contentHash: 'hash-2',
          qualityScore: 0.9
        },
        {
          eventId: 'event-3',
          title: 'Low relevance new',
          content: 'Content',
          source: 'Test',
          sourceUrl: 'https://test.com',
          publishedAt: now.toISOString(), // now
          ingestedAt: new Date().toISOString(),
          symbols: ['BTC'],
          category: 'MARKET',
          relevanceScore: 0.3,
          contentHash: 'hash-3',
          qualityScore: 0.9
        }
      ];

      const context = generateNewsContext('BTC', events, 24, 10);

      // High relevance should be first
      expect(context.events[0].eventId).toBe('event-2');
      // Among same relevance, newer should come first
      expect(context.events[1].eventId).toBe('event-3');
      expect(context.events[2].eventId).toBe('event-1');
    });
  });
});
