/**
 * Snapshot Cache Service - implements ElastiCache integration for snapshot caching
 * 
 * Provides:
 * - Caching of MarketDataSnapshot objects
 * - Cache invalidation
 * - TTL-based expiration
 * 
 * Requirements: 6.4
 */

import { MarketDataSnapshot } from '../types/snapshot';

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Default TTL in seconds */
  defaultTtlSeconds: number;
  /** Redis/ElastiCache endpoint */
  endpoint?: string;
  /** Redis/ElastiCache port */
  port?: number;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  defaultTtlSeconds: 60, // 1 minute default TTL
  endpoint: process.env.ELASTICACHE_ENDPOINT || 'localhost',
  port: parseInt(process.env.ELASTICACHE_PORT || '6379', 10)
};

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  snapshot: MarketDataSnapshot;
  cachedAt: string;
  expiresAt: string;
}

/**
 * Generate cache key from symbol and timeframe
 */
export function generateCacheKey(symbol: string, timeframe: string): string {
  return `snapshot:${symbol.toUpperCase()}:${timeframe}`;
}

/**
 * Parse cache key to extract symbol and timeframe
 */
export function parseCacheKey(key: string): { symbol: string; timeframe: string } | null {
  const parts = key.split(':');
  if (parts.length !== 3 || parts[0] !== 'snapshot') {
    return null;
  }
  return { symbol: parts[1], timeframe: parts[2] };
}

/**
 * In-memory cache implementation for testing and fallback
 */
export class InMemorySnapshotCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a cached snapshot
   * 
   * @param symbol - The symbol to get snapshot for
   * @param timeframe - The timeframe of the snapshot
   * @returns The cached snapshot or null if not found/expired
   */
  async get(symbol: string, timeframe: string): Promise<MarketDataSnapshot | null> {
    const key = generateCacheKey(symbol, timeframe);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (new Date(entry.expiresAt) < new Date()) {
      this.cache.delete(key);
      return null;
    }

    return entry.snapshot;
  }

  /**
   * Set a snapshot in cache
   * 
   * @param snapshot - The snapshot to cache
   * @param ttlSeconds - Optional TTL override in seconds
   */
  async set(snapshot: MarketDataSnapshot, ttlSeconds?: number): Promise<void> {
    const key = generateCacheKey(snapshot.symbol, snapshot.timeframe);
    const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    // Update snapshot with cache metadata
    const cachedSnapshot: MarketDataSnapshot = {
      ...snapshot,
      cachedUntil: expiresAt.toISOString()
    };

    const entry: CacheEntry = {
      snapshot: cachedSnapshot,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidate cache for a symbol
   * 
   * @param symbol - The symbol to invalidate cache for
   */
  async invalidate(symbol: string): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      const parsed = parseCacheKey(key);
      if (parsed && parsed.symbol === symbol.toUpperCase()) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Invalidate a specific cache entry
   * 
   * @param symbol - The symbol
   * @param timeframe - The timeframe
   */
  async invalidateEntry(symbol: string, timeframe: string): Promise<void> {
    const key = generateCacheKey(symbol, timeframe);
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Check if a cache entry exists and is valid
   */
  async has(symbol: string, timeframe: string): Promise<boolean> {
    const snapshot = await this.get(symbol, timeframe);
    return snapshot !== null;
  }
}


/**
 * ElastiCache/Redis client interface
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<void>;
  del(key: string | string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

/**
 * ElastiCache Snapshot Cache implementation
 * 
 * Uses Redis/ElastiCache for distributed caching
 */
export class ElastiCacheSnapshotCache {
  private client: RedisClient;
  private config: CacheConfig;

  constructor(client: RedisClient, config?: Partial<CacheConfig>) {
    this.client = client;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a cached snapshot
   * 
   * Requirements: 6.4
   * 
   * @param symbol - The symbol to get snapshot for
   * @param timeframe - The timeframe of the snapshot
   * @returns The cached snapshot or null if not found/expired
   */
  async get(symbol: string, timeframe: string): Promise<MarketDataSnapshot | null> {
    const key = generateCacheKey(symbol, timeframe);
    
    try {
      const data = await this.client.get(key);
      
      if (!data) {
        return null;
      }

      const entry: CacheEntry = JSON.parse(data);
      return entry.snapshot;
    } catch (error) {
      // Log error and return null on cache miss
      console.error(`Cache get error for ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a snapshot in cache
   * 
   * Requirements: 6.4
   * 
   * @param snapshot - The snapshot to cache
   * @param ttlSeconds - Optional TTL override in seconds
   */
  async set(snapshot: MarketDataSnapshot, ttlSeconds?: number): Promise<void> {
    const key = generateCacheKey(snapshot.symbol, snapshot.timeframe);
    const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    // Update snapshot with cache metadata
    const cachedSnapshot: MarketDataSnapshot = {
      ...snapshot,
      cachedUntil: expiresAt.toISOString()
    };

    const entry: CacheEntry = {
      snapshot: cachedSnapshot,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    try {
      await this.client.set(key, JSON.stringify(entry), { EX: ttl });
    } catch (error) {
      // Log error but don't throw - caching is best-effort
      console.error(`Cache set error for ${key}:`, error);
    }
  }

  /**
   * Invalidate cache for a symbol
   * 
   * Requirements: 6.4
   * 
   * @param symbol - The symbol to invalidate cache for
   */
  async invalidate(symbol: string): Promise<void> {
    const pattern = `snapshot:${symbol.toUpperCase()}:*`;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error(`Cache invalidate error for ${symbol}:`, error);
    }
  }

  /**
   * Invalidate a specific cache entry
   * 
   * @param symbol - The symbol
   * @param timeframe - The timeframe
   */
  async invalidateEntry(symbol: string, timeframe: string): Promise<void> {
    const key = generateCacheKey(symbol, timeframe);
    
    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`Cache invalidate entry error for ${key}:`, error);
    }
  }

  /**
   * Check if a cache entry exists
   */
  async has(symbol: string, timeframe: string): Promise<boolean> {
    const snapshot = await this.get(symbol, timeframe);
    return snapshot !== null;
  }
}

/**
 * Snapshot cache interface
 */
export interface SnapshotCache {
  get(symbol: string, timeframe: string): Promise<MarketDataSnapshot | null>;
  set(snapshot: MarketDataSnapshot, ttlSeconds?: number): Promise<void>;
  invalidate(symbol: string): Promise<void>;
  invalidateEntry(symbol: string, timeframe: string): Promise<void>;
  has(symbol: string, timeframe: string): Promise<boolean>;
}

/**
 * Create an in-memory snapshot cache
 */
export function createInMemoryCache(config?: Partial<CacheConfig>): InMemorySnapshotCache {
  return new InMemorySnapshotCache(config);
}

/**
 * Create an ElastiCache snapshot cache
 */
export function createElastiCacheCache(
  client: RedisClient,
  config?: Partial<CacheConfig>
): ElastiCacheSnapshotCache {
  return new ElastiCacheSnapshotCache(client, config);
}
