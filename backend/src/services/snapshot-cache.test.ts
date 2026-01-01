/**
 * Snapshot Cache Service Tests
 * 
 * Property-based tests for snapshot caching
 * 
 * Requirements: 6.4
 */

import * as fc from 'fast-check';
import {
  InMemorySnapshotCache,
  ElastiCacheSnapshotCache,
  generateCacheKey,
  parseCacheKey,
  createInMemoryCache,
  RedisClient
} from './snapshot-cache';
import { MarketDataSnapshot } from '../types/snapshot';
import {
  marketDataSnapshotArb,
  cryptoSymbolArb
} from '../test/generators';

/**
 * Create a mock Redis client for testing
 */
function createMockRedisClient(): RedisClient & { store: Map<string, { value: string; expiresAt: number }> } {
  const store = new Map<string, { value: string; expiresAt: number }>();
  
  return {
    store,
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
      const expiresAt = options?.EX ? Date.now() + options.EX * 1000 : 0;
      store.set(key, { value, expiresAt });
    },
    async del(keys: string | string[]): Promise<number> {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      let count = 0;
      for (const key of keyArray) {
        if (store.delete(key)) count++;
      }
      return count;
    },
    async keys(pattern: string): Promise<string[]> {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(store.keys()).filter(key => regex.test(key));
    }
  };
}

describe('Snapshot Cache', () => {
  /**
   * Property 13: Snapshot Caching
   * 
   * *For any* MarketDataSnapshot that is cached, subsequent requests for the same
   * symbol and timeframe within the cache TTL SHALL return the identical snapshot
   * (same snapshotId), AND cache invalidation SHALL cause fresh assembly on next request.
   * 
   * **Validates: Requirements 6.4**
   */
  describe('Property 13: Snapshot Caching', () => {
    describe('InMemorySnapshotCache', () => {
      it('cached snapshot SHALL return identical snapshot (same snapshotId) within TTL', async () => {
        await fc.assert(
          fc.asyncProperty(
            marketDataSnapshotArb(),
            async (snapshot) => {
              const cache = createInMemoryCache({ defaultTtlSeconds: 60 });
              
              // Cache the snapshot
              await cache.set(snapshot);
              
              // Retrieve the snapshot
              const retrieved = await cache.get(snapshot.symbol, snapshot.timeframe);
              
              // Should return the same snapshot
              expect(retrieved).not.toBeNull();
              expect(retrieved!.snapshotId).toBe(snapshot.snapshotId);
              expect(retrieved!.symbol).toBe(snapshot.symbol);
              expect(retrieved!.timeframe).toBe(snapshot.timeframe);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('cache invalidation SHALL cause null return on next request', async () => {
        await fc.assert(
          fc.asyncProperty(
            marketDataSnapshotArb(),
            async (snapshot) => {
              const cache = createInMemoryCache({ defaultTtlSeconds: 60 });
              
              // Cache the snapshot
              await cache.set(snapshot);
              
              // Verify it's cached
              const beforeInvalidate = await cache.get(snapshot.symbol, snapshot.timeframe);
              expect(beforeInvalidate).not.toBeNull();
              
              // Invalidate the cache
              await cache.invalidate(snapshot.symbol);
              
              // Should return null after invalidation
              const afterInvalidate = await cache.get(snapshot.symbol, snapshot.timeframe);
              expect(afterInvalidate).toBeNull();
            }
          ),
          { numRuns: 100 }
        );
      });

      it('cache entry invalidation SHALL only remove specific entry', async () => {
        await fc.assert(
          fc.asyncProperty(
            cryptoSymbolArb(),
            fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
            fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
            async (symbol, timeframe1, timeframe2) => {
              // Skip if timeframes are the same
              if (timeframe1 === timeframe2) return;
              
              const cache = createInMemoryCache({ defaultTtlSeconds: 60 });
              
              // Create two snapshots with different timeframes
              const snapshot1: MarketDataSnapshot = {
                snapshotId: 'snap-1',
                symbol,
                timestamp: new Date().toISOString(),
                timeframe: timeframe1,
                prices: [],
                latestPrice: { symbol, timestamp: '', open: 0, high: 0, low: 0, close: 0, volume: 0, sourceId: '', qualityScore: 0 },
                newsContext: { symbol, timeWindow: '24h', events: [], summary: '', dominantSentiment: 'NEUTRAL', eventCount: 0, generatedAt: '' },
                sentiment: null,
                onChainMetrics: [],
                qualityScore: 0.5,
                dataCompleteness: { hasPrices: false, hasNews: false, hasSentiment: false, hasOnChain: false, missingTypes: [] },
                assembledAt: new Date().toISOString()
              };
              
              const snapshot2: MarketDataSnapshot = {
                ...snapshot1,
                snapshotId: 'snap-2',
                timeframe: timeframe2
              };
              
              // Cache both snapshots
              await cache.set(snapshot1);
              await cache.set(snapshot2);
              
              // Invalidate only the first entry
              await cache.invalidateEntry(symbol, timeframe1);
              
              // First should be null, second should still exist
              const retrieved1 = await cache.get(symbol, timeframe1);
              const retrieved2 = await cache.get(symbol, timeframe2);
              
              expect(retrieved1).toBeNull();
              expect(retrieved2).not.toBeNull();
              expect(retrieved2!.snapshotId).toBe('snap-2');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('expired cache entries SHALL return null', async () => {
        const cache = createInMemoryCache({ defaultTtlSeconds: 1 });
        
        const snapshot: MarketDataSnapshot = {
          snapshotId: 'test-snap',
          symbol: 'BTC',
          timestamp: new Date().toISOString(),
          timeframe: '1h',
          prices: [],
          latestPrice: { symbol: 'BTC', timestamp: '', open: 0, high: 0, low: 0, close: 0, volume: 0, sourceId: '', qualityScore: 0 },
          newsContext: { symbol: 'BTC', timeWindow: '24h', events: [], summary: '', dominantSentiment: 'NEUTRAL', eventCount: 0, generatedAt: '' },
          sentiment: null,
          onChainMetrics: [],
          qualityScore: 0.5,
          dataCompleteness: { hasPrices: false, hasNews: false, hasSentiment: false, hasOnChain: false, missingTypes: [] },
          assembledAt: new Date().toISOString()
        };
        
        // Cache with very short TTL
        await cache.set(snapshot, 0.001); // 1ms TTL
        
        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Should return null after expiration
        const retrieved = await cache.get('BTC', '1h');
        expect(retrieved).toBeNull();
      });

      it('has() SHALL return true for cached entries and false for missing', async () => {
        await fc.assert(
          fc.asyncProperty(
            marketDataSnapshotArb(),
            async (snapshot) => {
              const cache = createInMemoryCache({ defaultTtlSeconds: 60 });
              
              // Before caching
              const hasBefore = await cache.has(snapshot.symbol, snapshot.timeframe);
              expect(hasBefore).toBe(false);
              
              // After caching
              await cache.set(snapshot);
              const hasAfter = await cache.has(snapshot.symbol, snapshot.timeframe);
              expect(hasAfter).toBe(true);
              
              // After invalidation
              await cache.invalidate(snapshot.symbol);
              const hasAfterInvalidate = await cache.has(snapshot.symbol, snapshot.timeframe);
              expect(hasAfterInvalidate).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('ElastiCacheSnapshotCache', () => {
      it('cached snapshot SHALL return identical snapshot (same snapshotId) within TTL', async () => {
        await fc.assert(
          fc.asyncProperty(
            marketDataSnapshotArb(),
            async (snapshot) => {
              const mockClient = createMockRedisClient();
              const cache = new ElastiCacheSnapshotCache(mockClient, { defaultTtlSeconds: 60 });
              
              // Cache the snapshot
              await cache.set(snapshot);
              
              // Retrieve the snapshot
              const retrieved = await cache.get(snapshot.symbol, snapshot.timeframe);
              
              // Should return the same snapshot
              expect(retrieved).not.toBeNull();
              expect(retrieved!.snapshotId).toBe(snapshot.snapshotId);
              expect(retrieved!.symbol).toBe(snapshot.symbol);
              expect(retrieved!.timeframe).toBe(snapshot.timeframe);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('cache invalidation SHALL cause null return on next request', async () => {
        await fc.assert(
          fc.asyncProperty(
            marketDataSnapshotArb(),
            async (snapshot) => {
              const mockClient = createMockRedisClient();
              const cache = new ElastiCacheSnapshotCache(mockClient, { defaultTtlSeconds: 60 });
              
              // Cache the snapshot
              await cache.set(snapshot);
              
              // Verify it's cached
              const beforeInvalidate = await cache.get(snapshot.symbol, snapshot.timeframe);
              expect(beforeInvalidate).not.toBeNull();
              
              // Invalidate the cache
              await cache.invalidate(snapshot.symbol);
              
              // Should return null after invalidation
              const afterInvalidate = await cache.get(snapshot.symbol, snapshot.timeframe);
              expect(afterInvalidate).toBeNull();
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys for same symbol and timeframe', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
          (symbol, timeframe) => {
            const key1 = generateCacheKey(symbol, timeframe);
            const key2 = generateCacheKey(symbol, timeframe);
            
            expect(key1).toBe(key2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate different keys for different symbols or timeframes', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          cryptoSymbolArb(),
          fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
          fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
          (symbol1, symbol2, timeframe1, timeframe2) => {
            // Skip if both are the same
            if (symbol1 === symbol2 && timeframe1 === timeframe2) return;
            
            const key1 = generateCacheKey(symbol1, timeframe1);
            const key2 = generateCacheKey(symbol2, timeframe2);
            
            if (symbol1 !== symbol2 || timeframe1 !== timeframe2) {
              expect(key1).not.toBe(key2);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('parseCacheKey', () => {
    it('should round-trip with generateCacheKey', () => {
      fc.assert(
        fc.property(
          cryptoSymbolArb(),
          fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
          (symbol, timeframe) => {
            const key = generateCacheKey(symbol, timeframe);
            const parsed = parseCacheKey(key);
            
            expect(parsed).not.toBeNull();
            expect(parsed!.symbol).toBe(symbol.toUpperCase());
            expect(parsed!.timeframe).toBe(timeframe);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for invalid keys', () => {
      expect(parseCacheKey('invalid')).toBeNull();
      expect(parseCacheKey('wrong:format')).toBeNull();
      expect(parseCacheKey('notasnapshot:BTC:1h')).toBeNull();
    });
  });
});
