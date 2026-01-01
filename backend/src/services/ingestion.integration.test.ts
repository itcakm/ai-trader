/**
 * Integration Tests for Market Data Ingestion Flow
 * 
 * Tests the complete ingestion flow:
 * - Connect source → receive data → normalize → validate → store
 * 
 * Requirements: 2.2, 3.2, 4.2, 5.2
 */

import { PriceNormalizerService, RawPriceInput } from './price-normalizer';
import { NewsProcessor, RawNewsInput } from './news-processor';
import { SentimentNormalizer, RawSentimentInput } from './sentiment-normalizer';
import { OnChainNormalizer, RawOnChainInput } from './onchain-normalizer';
import { serializeNewsEvent, deserializeNewsEvent } from '../repositories/news';
import { serializeSentimentData, deserializeSentimentData } from '../repositories/sentiment';
import { serializeOnChainMetric, deserializeOnChainMetric } from '../repositories/on-chain';
import { PricePoint } from '../types/price';
import { NewsEvent } from '../types/news';
import { SentimentData } from '../types/sentiment';
import { OnChainMetric } from '../types/on-chain';

/**
 * Mock in-memory storage for integration testing
 */
class MockPriceStore {
  private prices: Map<string, PricePoint[]> = new Map();

  async store(pricePoint: PricePoint): Promise<void> {
    const key = `${pricePoint.symbol}#${pricePoint.sourceId}`;
    if (!this.prices.has(key)) {
      this.prices.set(key, []);
    }
    this.prices.get(key)!.push(pricePoint);
  }

  async getBySymbol(symbol: string): Promise<PricePoint[]> {
    const results: PricePoint[] = [];
    for (const [key, prices] of this.prices.entries()) {
      if (key.startsWith(`${symbol}#`)) {
        results.push(...prices);
      }
    }
    return results.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  clear(): void {
    this.prices.clear();
  }
}

class MockNewsStore {
  private news: Map<string, NewsEvent> = new Map();

  async store(event: NewsEvent): Promise<void> {
    this.news.set(event.eventId, event);
  }

  async getByEventId(eventId: string): Promise<NewsEvent | null> {
    return this.news.get(eventId) || null;
  }

  async getBySymbol(symbol: string): Promise<NewsEvent[]> {
    return Array.from(this.news.values())
      .filter(e => e.symbols.includes(symbol))
      .sort((a, b) => 
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
  }

  clear(): void {
    this.news.clear();
  }
}

class MockSentimentStore {
  private sentiment: Map<string, SentimentData> = new Map();

  async store(data: SentimentData): Promise<void> {
    const key = `${data.symbol}#${data.timestamp}`;
    this.sentiment.set(key, data);
  }

  async getBySymbol(symbol: string): Promise<SentimentData[]> {
    return Array.from(this.sentiment.values())
      .filter(s => s.symbol === symbol)
      .sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
  }

  clear(): void {
    this.sentiment.clear();
  }
}

class MockOnChainStore {
  private metrics: Map<string, OnChainMetric> = new Map();

  async store(metric: OnChainMetric): Promise<void> {
    const key = `${metric.symbol}#${metric.metricType}#${metric.timestamp}`;
    this.metrics.set(key, metric);
  }

  async getBySymbol(symbol: string): Promise<OnChainMetric[]> {
    return Array.from(this.metrics.values())
      .filter(m => m.symbol === symbol)
      .sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
  }

  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Simulated data source that generates raw data
 */
class MockDataSource {
  constructor(
    public readonly sourceId: string,
    public readonly type: 'PRICE' | 'NEWS' | 'SENTIMENT' | 'ON_CHAIN'
  ) {}

  generateRawPriceData(symbol: string): RawPriceInput {
    const basePrice = symbol === 'BTC' ? 45000 : symbol === 'ETH' ? 2500 : 100;
    const variance = basePrice * 0.02;
    const open = basePrice + (Math.random() - 0.5) * variance;
    const close = basePrice + (Math.random() - 0.5) * variance;
    const high = Math.max(open, close) + Math.random() * variance * 0.5;
    const low = Math.min(open, close) - Math.random() * variance * 0.5;

    return {
      symbol,
      timestamp: new Date().toISOString(),
      open: open.toString(),
      high: high.toString(),
      low: low.toString(),
      close: close.toString(),
      volume: (Math.random() * 1000000).toString(),
      sourceId: this.sourceId
    };
  }

  generateRawNewsData(symbol: string): RawNewsInput {
    return {
      title: `Breaking: ${symbol} sees major market movement`,
      content: `The cryptocurrency ${symbol} has experienced significant price action today. Analysts are watching closely as trading volume increases. Market participants are reacting to recent regulatory developments.`,
      source: 'CryptoNews',
      sourceUrl: `https://cryptonews.com/news/${symbol.toLowerCase()}-update`,
      publishedAt: new Date().toISOString(),
      rawSymbols: [symbol],
      rawCategory: 'MARKET'
    };
  }

  generateRawSentimentData(symbol: string): RawSentimentInput {
    return {
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
      sourceId: this.sourceId
    };
  }

  generateRawOnChainData(symbol: string): RawOnChainInput {
    return {
      symbol,
      metricType: 'ACTIVE_ADDRESSES',
      value: Math.floor(Math.random() * 1000000),
      timestamp: new Date().toISOString(),
      change24h: (Math.random() - 0.5) * 10,
      sourceId: this.sourceId
    };
  }
}

/**
 * Integration test for complete ingestion pipeline
 */
class IngestionPipeline {
  private priceStore: MockPriceStore;
  private newsStore: MockNewsStore;
  private sentimentStore: MockSentimentStore;
  private onChainStore: MockOnChainStore;
  private newsProcessor: NewsProcessor;

  constructor() {
    this.priceStore = new MockPriceStore();
    this.newsStore = new MockNewsStore();
    this.sentimentStore = new MockSentimentStore();
    this.onChainStore = new MockOnChainStore();
    this.newsProcessor = new NewsProcessor();
  }

  /**
   * Process and store price data
   * Requirements: 2.2
   */
  async ingestPrice(rawData: RawPriceInput): Promise<{ success: boolean; pricePoint?: PricePoint; errors: string[] }> {
    const result = PriceNormalizerService.normalize(rawData);
    
    if (!result.isValid) {
      return { 
        success: false, 
        errors: result.anomalies.map(a => a.description) 
      };
    }

    await this.priceStore.store(result.pricePoint);
    return { success: true, pricePoint: result.pricePoint, errors: [] };
  }

  /**
   * Process and store news data
   * Requirements: 3.2
   */
  async ingestNews(rawData: RawNewsInput): Promise<{ success: boolean; newsEvent?: NewsEvent; errors: string[] }> {
    try {
      const newsEvent = this.newsProcessor.processNews(rawData);
      
      if (!this.newsProcessor.validateNewsEvent(newsEvent)) {
        return { success: false, errors: ['News event validation failed'] };
      }

      await this.newsStore.store(newsEvent);
      return { success: true, newsEvent, errors: [] };
    } catch (error) {
      return { 
        success: false, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      };
    }
  }

  /**
   * Process and store sentiment data
   * Requirements: 4.2
   */
  async ingestSentiment(rawData: RawSentimentInput): Promise<{ success: boolean; sentimentData?: SentimentData; errors: string[] }> {
    const result = SentimentNormalizer.normalize(rawData);
    
    if (!result.success || !result.data) {
      return { success: false, errors: result.errors };
    }

    const validation = SentimentNormalizer.validate(result.data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    await this.sentimentStore.store(result.data);
    return { success: true, sentimentData: result.data, errors: [] };
  }

  /**
   * Process and store on-chain data
   * Requirements: 5.2
   */
  async ingestOnChain(rawData: RawOnChainInput): Promise<{ success: boolean; onChainMetric?: OnChainMetric; errors: string[] }> {
    const result = OnChainNormalizer.normalize(rawData);
    
    if (!result.success || !result.data) {
      return { success: false, errors: result.errors };
    }

    const validation = OnChainNormalizer.validate(result.data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    await this.onChainStore.store(result.data);
    return { success: true, onChainMetric: result.data, errors: [] };
  }

  // Getters for stores (for verification in tests)
  getPriceStore(): MockPriceStore { return this.priceStore; }
  getNewsStore(): MockNewsStore { return this.newsStore; }
  getSentimentStore(): MockSentimentStore { return this.sentimentStore; }
  getOnChainStore(): MockOnChainStore { return this.onChainStore; }

  clear(): void {
    this.priceStore.clear();
    this.newsStore.clear();
    this.sentimentStore.clear();
    this.onChainStore.clear();
  }
}

describe('Market Data Ingestion Integration Tests', () => {
  let pipeline: IngestionPipeline;
  let dataSource: MockDataSource;

  beforeEach(() => {
    pipeline = new IngestionPipeline();
    dataSource = new MockDataSource('test-source-001', 'PRICE');
  });

  afterEach(() => {
    pipeline.clear();
  });

  describe('Price Data Ingestion Flow', () => {
    /**
     * Test: connect source → receive data → normalize → validate → store
     * Requirements: 2.2
     */
    it('should complete full price ingestion flow', async () => {
      // Step 1: Generate raw data from source
      const rawPrice = dataSource.generateRawPriceData('BTC');
      
      // Step 2: Ingest through pipeline (normalize → validate → store)
      const result = await pipeline.ingestPrice(rawPrice);
      
      // Step 3: Verify success
      expect(result.success).toBe(true);
      expect(result.pricePoint).toBeDefined();
      expect(result.errors).toHaveLength(0);
      
      // Step 4: Verify stored data
      const stored = await pipeline.getPriceStore().getBySymbol('BTC');
      expect(stored).toHaveLength(1);
      expect(stored[0].symbol).toBe('BTC');
      expect(stored[0].sourceId).toBe('test-source-001');
    });

    it('should normalize price data from string to number format', async () => {
      const rawPrice: RawPriceInput = {
        symbol: 'ETH',
        timestamp: '1704067200000', // Unix timestamp in ms
        open: '2500.50',
        high: '2550.75',
        low: '2480.25',
        close: '2530.00',
        volume: '1000000',
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestPrice(rawPrice);
      
      expect(result.success).toBe(true);
      expect(result.pricePoint?.open).toBe(2500.50);
      expect(result.pricePoint?.high).toBe(2550.75);
      expect(result.pricePoint?.low).toBe(2480.25);
      expect(result.pricePoint?.close).toBe(2530.00);
      expect(result.pricePoint?.volume).toBe(1000000);
    });

    it('should detect and flag price anomalies', async () => {
      // Use valid OHLC but with a price spike (if previous price is set)
      const rawPrice: RawPriceInput = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        open: '45000',
        high: '45500',
        low: '44500',
        close: '45200',
        volume: '0', // Zero volume should reduce quality score
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestPrice(rawPrice);
      
      // Should succeed but with lower quality score due to zero volume
      expect(result.success).toBe(true);
      expect(result.pricePoint).toBeDefined();
      expect(result.pricePoint!.qualityScore).toBeLessThan(1);
    });

    it('should reject invalid price data', async () => {
      const rawPrice: RawPriceInput = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        open: '-100', // Invalid: negative price
        high: '-50',
        low: '-150',
        close: '-75',
        volume: '1000000',
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestPrice(rawPrice);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('News Data Ingestion Flow', () => {
    /**
     * Test: connect source → receive data → normalize → validate → store
     * Requirements: 3.2
     */
    it('should complete full news ingestion flow', async () => {
      // Step 1: Generate raw data from source
      const rawNews = dataSource.generateRawNewsData('BTC');
      
      // Step 2: Ingest through pipeline
      const result = await pipeline.ingestNews(rawNews);
      
      // Step 3: Verify success
      expect(result.success).toBe(true);
      expect(result.newsEvent).toBeDefined();
      expect(result.errors).toHaveLength(0);
      
      // Step 4: Verify stored data
      const stored = await pipeline.getNewsStore().getBySymbol('BTC');
      expect(stored).toHaveLength(1);
      expect(stored[0].symbols).toContain('BTC');
      expect(stored[0].category).toBe('MARKET');
    });

    it('should extract symbols from news content', async () => {
      const rawNews: RawNewsInput = {
        title: 'Bitcoin and Ethereum surge amid market rally',
        content: 'BTC and ETH have both seen significant gains. $SOL also showing strength.',
        source: 'CryptoNews',
        sourceUrl: 'https://cryptonews.com/market-rally',
        publishedAt: new Date().toISOString()
      };

      const result = await pipeline.ingestNews(rawNews);
      
      expect(result.success).toBe(true);
      expect(result.newsEvent?.symbols).toContain('BTC');
      expect(result.newsEvent?.symbols).toContain('ETH');
      expect(result.newsEvent?.symbols).toContain('SOL');
    });

    it('should categorize news correctly', async () => {
      const regulatoryNews: RawNewsInput = {
        title: 'SEC announces new cryptocurrency regulations',
        content: 'The Securities and Exchange Commission has released new compliance guidelines for crypto exchanges.',
        source: 'Reuters',
        sourceUrl: 'https://reuters.com/sec-crypto',
        publishedAt: new Date().toISOString()
      };

      const result = await pipeline.ingestNews(regulatoryNews);
      
      expect(result.success).toBe(true);
      expect(result.newsEvent?.category).toBe('REGULATORY');
    });

    it('should calculate relevance score', async () => {
      const rawNews: RawNewsInput = {
        title: 'Breaking: Major Bitcoin ETF approval expected',
        content: 'Urgent news about significant regulatory approval for Bitcoin ETF.',
        source: 'Bloomberg',
        sourceUrl: 'https://bloomberg.com/btc-etf',
        publishedAt: new Date().toISOString(),
        rawSymbols: ['BTC']
      };

      const result = await pipeline.ingestNews(rawNews);
      
      expect(result.success).toBe(true);
      expect(result.newsEvent?.relevanceScore).toBeGreaterThan(0);
      expect(result.newsEvent?.relevanceScore).toBeLessThanOrEqual(1);
    });

    it('should generate content hash for deduplication', async () => {
      const rawNews = dataSource.generateRawNewsData('ETH');
      
      const result = await pipeline.ingestNews(rawNews);
      
      expect(result.success).toBe(true);
      expect(result.newsEvent?.contentHash).toBeDefined();
      expect(result.newsEvent?.contentHash.length).toBe(64); // SHA-256 hex
    });
  });

  describe('Sentiment Data Ingestion Flow', () => {
    /**
     * Test: connect source → receive data → normalize → validate → store
     * Requirements: 4.2
     */
    it('should complete full sentiment ingestion flow', async () => {
      // Step 1: Generate raw data from source
      const rawSentiment = dataSource.generateRawSentimentData('BTC');
      
      // Step 2: Ingest through pipeline
      const result = await pipeline.ingestSentiment(rawSentiment);
      
      // Step 3: Verify success
      expect(result.success).toBe(true);
      expect(result.sentimentData).toBeDefined();
      expect(result.errors).toHaveLength(0);
      
      // Step 4: Verify stored data
      const stored = await pipeline.getSentimentStore().getBySymbol('BTC');
      expect(stored).toHaveLength(1);
      expect(stored[0].symbol).toBe('BTC');
    });

    it('should normalize sentiment scores to -1 to +1 scale', async () => {
      const rawSentiment: RawSentimentInput = {
        symbol: 'ETH',
        score: 75, // 0-100 scale
        scoreMin: 0,
        scoreMax: 100,
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestSentiment(rawSentiment);
      
      expect(result.success).toBe(true);
      expect(result.sentimentData?.overallScore).toBeGreaterThanOrEqual(-1);
      expect(result.sentimentData?.overallScore).toBeLessThanOrEqual(1);
      // 75 on 0-100 scale should be 0.5 on -1 to +1 scale
      expect(result.sentimentData?.overallScore).toBeCloseTo(0.5, 1);
    });

    it('should track sentiment metrics', async () => {
      const rawSentiment: RawSentimentInput = {
        symbol: 'SOL',
        score: 0.6,
        scoreMin: -1,
        scoreMax: 1,
        mentionVolume: 5000,
        changeRate24h: 15.5,
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestSentiment(rawSentiment);
      
      expect(result.success).toBe(true);
      expect(result.sentimentData?.mentionVolume).toBe(5000);
      expect(result.sentimentData?.changeRate24h).toBe(15.5);
    });

    it('should reject invalid sentiment data', async () => {
      const rawSentiment: RawSentimentInput = {
        symbol: '', // Invalid: empty symbol
        score: 50,
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestSentiment(rawSentiment);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('On-Chain Data Ingestion Flow', () => {
    /**
     * Test: connect source → receive data → normalize → validate → store
     * Requirements: 5.2
     */
    it('should complete full on-chain ingestion flow', async () => {
      // Step 1: Generate raw data from source
      const rawOnChain = dataSource.generateRawOnChainData('BTC');
      
      // Step 2: Ingest through pipeline
      const result = await pipeline.ingestOnChain(rawOnChain);
      
      // Step 3: Verify success
      expect(result.success).toBe(true);
      expect(result.onChainMetric).toBeDefined();
      expect(result.errors).toHaveLength(0);
      
      // Step 4: Verify stored data
      const stored = await pipeline.getOnChainStore().getBySymbol('BTC');
      expect(stored).toHaveLength(1);
      expect(stored[0].symbol).toBe('BTC');
      expect(stored[0].metricType).toBe('ACTIVE_ADDRESSES');
    });

    it('should normalize metric type aliases', async () => {
      const rawOnChain: RawOnChainInput = {
        symbol: 'ETH',
        metricType: 'tx_volume', // Alias for TRANSACTION_VOLUME
        value: 1000000,
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestOnChain(rawOnChain);
      
      expect(result.success).toBe(true);
      expect(result.onChainMetric?.metricType).toBe('TRANSACTION_VOLUME');
    });

    it('should infer network from symbol', async () => {
      const rawOnChain: RawOnChainInput = {
        symbol: 'ETH',
        metricType: 'ACTIVE_ADDRESSES',
        value: 500000,
        sourceId: 'test-source'
        // No network provided
      };

      const result = await pipeline.ingestOnChain(rawOnChain);
      
      expect(result.success).toBe(true);
      expect(result.onChainMetric?.network).toBe('ethereum');
    });

    it('should support all metric types', async () => {
      const metricTypes = [
        'ACTIVE_ADDRESSES',
        'TRANSACTION_VOLUME',
        'EXCHANGE_INFLOW',
        'EXCHANGE_OUTFLOW',
        'WHALE_TRANSACTIONS',
        'NVT_RATIO',
        'MVRV_RATIO'
      ];

      for (const metricType of metricTypes) {
        const rawOnChain: RawOnChainInput = {
          symbol: 'BTC',
          metricType,
          value: 1000,
          sourceId: 'test-source'
        };

        const result = await pipeline.ingestOnChain(rawOnChain);
        expect(result.success).toBe(true);
        expect(result.onChainMetric?.metricType).toBe(metricType);
      }
    });

    it('should reject unknown metric types', async () => {
      const rawOnChain: RawOnChainInput = {
        symbol: 'BTC',
        metricType: 'UNKNOWN_METRIC',
        value: 1000,
        sourceId: 'test-source'
      };

      const result = await pipeline.ingestOnChain(rawOnChain);
      
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Unknown metric type'))).toBe(true);
    });
  });

  describe('Multi-Data Type Ingestion', () => {
    it('should ingest all data types for a symbol', async () => {
      const symbol = 'BTC';

      // Ingest price
      const priceResult = await pipeline.ingestPrice(dataSource.generateRawPriceData(symbol));
      expect(priceResult.success).toBe(true);

      // Ingest news
      const newsResult = await pipeline.ingestNews(dataSource.generateRawNewsData(symbol));
      expect(newsResult.success).toBe(true);

      // Ingest sentiment
      const sentimentResult = await pipeline.ingestSentiment(dataSource.generateRawSentimentData(symbol));
      expect(sentimentResult.success).toBe(true);

      // Ingest on-chain
      const onChainResult = await pipeline.ingestOnChain(dataSource.generateRawOnChainData(symbol));
      expect(onChainResult.success).toBe(true);

      // Verify all data is stored
      const prices = await pipeline.getPriceStore().getBySymbol(symbol);
      const news = await pipeline.getNewsStore().getBySymbol(symbol);
      const sentiment = await pipeline.getSentimentStore().getBySymbol(symbol);
      const onChain = await pipeline.getOnChainStore().getBySymbol(symbol);

      expect(prices).toHaveLength(1);
      expect(news).toHaveLength(1);
      expect(sentiment).toHaveLength(1);
      expect(onChain).toHaveLength(1);
    });

    it('should handle batch ingestion of multiple data points', async () => {
      const symbols = ['BTC', 'ETH', 'SOL'];

      for (const symbol of symbols) {
        await pipeline.ingestPrice(dataSource.generateRawPriceData(symbol));
        await pipeline.ingestSentiment(dataSource.generateRawSentimentData(symbol));
      }

      // Verify all data is stored
      for (const symbol of symbols) {
        const prices = await pipeline.getPriceStore().getBySymbol(symbol);
        const sentiment = await pipeline.getSentimentStore().getBySymbol(symbol);
        
        expect(prices).toHaveLength(1);
        expect(sentiment).toHaveLength(1);
      }
    });
  });

  describe('Serialization Round-Trip', () => {
    it('should preserve news event data through serialization', async () => {
      const rawNews = dataSource.generateRawNewsData('BTC');
      const result = await pipeline.ingestNews(rawNews);
      
      expect(result.success).toBe(true);
      const original = result.newsEvent!;

      // Serialize and deserialize
      const serialized = serializeNewsEvent(original, 'BTC');
      const deserialized = deserializeNewsEvent(serialized);

      // Verify all fields preserved
      expect(deserialized.eventId).toBe(original.eventId);
      expect(deserialized.title).toBe(original.title);
      expect(deserialized.content).toBe(original.content);
      expect(deserialized.source).toBe(original.source);
      expect(deserialized.category).toBe(original.category);
      expect(deserialized.relevanceScore).toBe(original.relevanceScore);
      expect(deserialized.symbols).toEqual(original.symbols);
    });

    it('should preserve sentiment data through serialization', async () => {
      const rawSentiment = dataSource.generateRawSentimentData('ETH');
      const result = await pipeline.ingestSentiment(rawSentiment);
      
      expect(result.success).toBe(true);
      const original = result.sentimentData!;

      // Serialize and deserialize
      const serialized = serializeSentimentData(original);
      const deserialized = deserializeSentimentData(serialized);

      // Verify all fields preserved
      expect(deserialized.sentimentId).toBe(original.sentimentId);
      expect(deserialized.symbol).toBe(original.symbol);
      expect(deserialized.overallScore).toBe(original.overallScore);
      expect(deserialized.mentionVolume).toBe(original.mentionVolume);
      expect(deserialized.sources).toEqual(original.sources);
    });

    it('should preserve on-chain metric data through serialization', async () => {
      const rawOnChain = dataSource.generateRawOnChainData('SOL');
      const result = await pipeline.ingestOnChain(rawOnChain);
      
      expect(result.success).toBe(true);
      const original = result.onChainMetric!;

      // Serialize and deserialize
      const serialized = serializeOnChainMetric(original);
      const deserialized = deserializeOnChainMetric(serialized);

      // Verify all fields preserved
      expect(deserialized.metricId).toBe(original.metricId);
      expect(deserialized.symbol).toBe(original.symbol);
      expect(deserialized.metricType).toBe(original.metricType);
      expect(deserialized.value).toBe(original.value);
      expect(deserialized.network).toBe(original.network);
    });
  });
});
