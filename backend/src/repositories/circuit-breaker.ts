import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerScope,
  TradingEvent
} from '../types/circuit-breaker';
import {
  TenantAccessDeniedError,
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult
} from '../db/access';

/**
 * In-memory cache for circuit breaker state (simulates ElastiCache)
 * In production, this would be replaced with actual ElastiCache/Redis client
 */
const circuitBreakerCache = new Map<string, { breaker: CircuitBreaker; expiresAt: number }>();

/**
 * Cache TTL in milliseconds (60 seconds for circuit breakers)
 */
const CACHE_TTL_MS = 60 * 1000;

/**
 * Event history for condition evaluation
 * Key: tenantId#breakerId, Value: array of recent events
 */
const eventHistory = new Map<string, TradingEvent[]>();

/**
 * Maximum events to keep per breaker for condition evaluation
 */
const MAX_EVENT_HISTORY = 1000;

/**
 * Circuit Breaker Repository - manages circuit breaker persistence
 * 
 * Uses both DynamoDB for durable storage and ElastiCache (simulated) for fast access.
 * Circuit breakers are critical for trading safety, so we use a dual-write pattern.
 * 
 * Requirements: 5.1
 */
export const CircuitBreakerRepository = {
  // ==================== Cache Operations ====================

  /**
   * Get cache key for circuit breaker
   */
  getCacheKey(tenantId: string, breakerId: string): string {
    return `risk:circuitbreaker:${tenantId}:${breakerId}`;
  },

  /**
   * Get circuit breaker from cache
   */
  getFromCache(tenantId: string, breakerId: string): CircuitBreaker | null {
    const key = this.getCacheKey(tenantId, breakerId);
    const cached = circuitBreakerCache.get(key);
    
    if (!cached) {
      return null;
    }

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      circuitBreakerCache.delete(key);
      return null;
    }

    return cached.breaker;
  },

  /**
   * Set circuit breaker in cache
   */
  setInCache(breaker: CircuitBreaker): void {
    const key = this.getCacheKey(breaker.tenantId, breaker.breakerId);
    circuitBreakerCache.set(key, {
      breaker,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
  },

  /**
   * Remove circuit breaker from cache
   */
  removeFromCache(tenantId: string, breakerId: string): void {
    const key = this.getCacheKey(tenantId, breakerId);
    circuitBreakerCache.delete(key);
  },

  /**
   * Clear all cache entries for a tenant
   */
  clearTenantCache(tenantId: string): void {
    const prefix = `risk:circuitbreaker:${tenantId}`;
    for (const key of circuitBreakerCache.keys()) {
      if (key.startsWith(prefix)) {
        circuitBreakerCache.delete(key);
      }
    }
  },

  // ==================== CircuitBreaker CRUD Operations ====================

  /**
   * Get circuit breaker by ID
   * First checks cache, then falls back to DynamoDB
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @returns The circuit breaker, or null if not found
   */
  async getBreaker(tenantId: string, breakerId: string): Promise<CircuitBreaker | null> {
    // Check cache first for fast access
    const cached = this.getFromCache(tenantId, breakerId);
    if (cached) {
      return cached;
    }

    // Fall back to DynamoDB
    const result = await documentClient.get({
      TableName: TableNames.CIRCUIT_BREAKERS,
      Key: {
        [KeySchemas.CIRCUIT_BREAKERS.partitionKey]: tenantId,
        [KeySchemas.CIRCUIT_BREAKERS.sortKey]: breakerId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'circuit-breaker');
    }

    const breaker = result.Item as CircuitBreaker;
    
    // Populate cache for future fast access
    this.setInCache(breaker);

    return breaker;
  },

  /**
   * List all circuit breakers for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of circuit breakers
   */
  async listBreakers(params: TenantQueryParams): Promise<PaginatedResult<CircuitBreaker>> {
    const queryParams: AWS.DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.CIRCUIT_BREAKERS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.CIRCUIT_BREAKERS.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': params.tenantId
      }
    };

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as CircuitBreaker[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List circuit breakers by state
   * 
   * @param tenantId - The tenant identifier
   * @param state - The circuit breaker state to filter by
   * @returns List of circuit breakers in the specified state
   */
  async listBreakersByState(tenantId: string, state: CircuitBreakerState): Promise<CircuitBreaker[]> {
    const result = await documentClient.query({
      TableName: TableNames.CIRCUIT_BREAKERS,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#state = :state',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.CIRCUIT_BREAKERS.partitionKey,
        '#state': 'state'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':state': state
      }
    }).promise();

    return (result.Items || []) as CircuitBreaker[];
  },

  /**
   * List circuit breakers by scope
   * 
   * @param tenantId - The tenant identifier
   * @param scope - The scope to filter by
   * @param scopeId - Optional scope ID to filter by
   * @returns List of circuit breakers for the specified scope
   */
  async listBreakersByScope(
    tenantId: string,
    scope: CircuitBreakerScope,
    scopeId?: string
  ): Promise<CircuitBreaker[]> {
    let filterExpression = '#scope = :scope';
    const expressionAttributeNames: Record<string, string> = {
      '#pk': KeySchemas.CIRCUIT_BREAKERS.partitionKey,
      '#scope': 'scope'
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':tenantId': tenantId,
      ':scope': scope
    };

    if (scopeId) {
      filterExpression += ' AND #scopeId = :scopeId';
      expressionAttributeNames['#scopeId'] = 'scopeId';
      expressionAttributeValues[':scopeId'] = scopeId;
    }

    const result = await documentClient.query({
      TableName: TableNames.CIRCUIT_BREAKERS,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }).promise();

    return (result.Items || []) as CircuitBreaker[];
  },

  /**
   * Save circuit breaker with dual-write to cache and DynamoDB
   * 
   * @param tenantId - The tenant identifier (must match breaker.tenantId)
   * @param breaker - The circuit breaker to save
   * @throws TenantAccessDeniedError if tenantId doesn't match breaker.tenantId
   */
  async putBreaker(tenantId: string, breaker: CircuitBreaker): Promise<void> {
    // Verify the breaker belongs to the tenant
    if (breaker.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'circuit-breaker');
    }

    // Write to cache first for immediate availability
    this.setInCache(breaker);

    // Then write to DynamoDB for durability
    await documentClient.put({
      TableName: TableNames.CIRCUIT_BREAKERS,
      Item: breaker
    }).promise();
  },

  /**
   * Update circuit breaker state atomically
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param updates - The fields to update
   * @returns The updated circuit breaker
   */
  async updateBreaker(
    tenantId: string,
    breakerId: string,
    updates: Partial<Omit<CircuitBreaker, 'tenantId' | 'breakerId'>>
  ): Promise<CircuitBreaker> {
    const existing = await this.getBreaker(tenantId, breakerId);
    
    if (!existing) {
      throw new ResourceNotFoundError('CircuitBreaker', breakerId);
    }

    const updatedBreaker: CircuitBreaker = {
      ...existing,
      ...updates
    };

    await this.putBreaker(tenantId, updatedBreaker);
    return updatedBreaker;
  },

  /**
   * Delete circuit breaker
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   */
  async deleteBreaker(tenantId: string, breakerId: string): Promise<void> {
    // First verify the breaker exists and belongs to this tenant
    const existing = await this.getBreaker(tenantId, breakerId);
    if (!existing) {
      throw new ResourceNotFoundError('CircuitBreaker', breakerId);
    }

    // Remove from cache
    this.removeFromCache(tenantId, breakerId);

    // Remove from DynamoDB
    await documentClient.delete({
      TableName: TableNames.CIRCUIT_BREAKERS,
      Key: {
        [KeySchemas.CIRCUIT_BREAKERS.partitionKey]: tenantId,
        [KeySchemas.CIRCUIT_BREAKERS.sortKey]: breakerId
      }
    }).promise();

    // Clear event history for this breaker
    const eventKey = `${tenantId}#${breakerId}`;
    eventHistory.delete(eventKey);
  },

  /**
   * Check if a circuit breaker exists
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @returns True if the circuit breaker exists
   */
  async breakerExists(tenantId: string, breakerId: string): Promise<boolean> {
    const breaker = await this.getBreaker(tenantId, breakerId);
    return breaker !== null;
  },

  // ==================== Event History Operations ====================

  /**
   * Get event history key
   */
  getEventHistoryKey(tenantId: string, breakerId: string): string {
    return `${tenantId}#${breakerId}`;
  },

  /**
   * Record a trading event for condition evaluation
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param event - The trading event to record
   */
  async recordEvent(tenantId: string, breakerId: string, event: TradingEvent): Promise<void> {
    const key = this.getEventHistoryKey(tenantId, breakerId);
    
    let events = eventHistory.get(key) || [];
    events.push(event);

    // Keep only the most recent events
    if (events.length > MAX_EVENT_HISTORY) {
      events = events.slice(-MAX_EVENT_HISTORY);
    }

    eventHistory.set(key, events);

    // Also persist to DynamoDB for durability (optional, for audit)
    const { timestamp, ...eventWithoutTimestamp } = event;
    await documentClient.put({
      TableName: TableNames.CIRCUIT_BREAKER_EVENTS,
      Item: {
        [KeySchemas.CIRCUIT_BREAKER_EVENTS.partitionKey]: key,
        [KeySchemas.CIRCUIT_BREAKER_EVENTS.sortKey]: timestamp,
        tenantId,
        breakerId,
        eventTimestamp: timestamp,
        ...eventWithoutTimestamp
      }
    }).promise();
  },

  /**
   * Get recent events for a circuit breaker
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param timeWindowMinutes - Optional time window to filter events
   * @returns Array of recent trading events
   */
  getRecentEvents(tenantId: string, breakerId: string, timeWindowMinutes?: number): TradingEvent[] {
    const key = this.getEventHistoryKey(tenantId, breakerId);
    const events = eventHistory.get(key) || [];

    if (!timeWindowMinutes) {
      return events;
    }

    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
    return events.filter(e => e.timestamp >= cutoffTime);
  },

  /**
   * Clear event history for a circuit breaker
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   */
  clearEventHistory(tenantId: string, breakerId: string): void {
    const key = this.getEventHistoryKey(tenantId, breakerId);
    eventHistory.delete(key);
  },

  /**
   * Get consecutive failures count from recent events
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @returns Number of consecutive failures
   */
  getConsecutiveFailures(tenantId: string, breakerId: string): number {
    const key = this.getEventHistoryKey(tenantId, breakerId);
    const events = eventHistory.get(key) || [];

    let consecutiveFailures = 0;
    // Count from most recent backwards
    for (let i = events.length - 1; i >= 0; i--) {
      if (!events[i].success) {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    return consecutiveFailures;
  },

  /**
   * Calculate loss rate from recent events
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param timeWindowMinutes - Time window to calculate loss rate
   * @returns Loss rate as a percentage
   */
  calculateLossRate(tenantId: string, breakerId: string, timeWindowMinutes: number): number {
    const events = this.getRecentEvents(tenantId, breakerId, timeWindowMinutes);
    
    if (events.length === 0) {
      return 0;
    }

    const totalLoss = events
      .filter(e => e.eventType === 'TRADE' && e.lossAmount !== undefined && e.lossAmount > 0)
      .reduce((sum, e) => sum + (e.lossAmount || 0), 0);

    // Return loss as percentage (assuming lossAmount is already a percentage or normalized)
    return totalLoss;
  },

  /**
   * Calculate error rate from recent events
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param sampleSize - Number of recent events to consider
   * @returns Error rate as a percentage (0-100)
   */
  calculateErrorRate(tenantId: string, breakerId: string, sampleSize: number): number {
    const key = this.getEventHistoryKey(tenantId, breakerId);
    const events = eventHistory.get(key) || [];

    if (events.length === 0) {
      return 0;
    }

    const recentEvents = events.slice(-sampleSize);
    const errorCount = recentEvents.filter(e => !e.success).length;

    return (errorCount / recentEvents.length) * 100;
  },

  /**
   * Get maximum price deviation from recent events
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param timeWindowMinutes - Time window to check
   * @returns Maximum price deviation as a percentage
   */
  getMaxPriceDeviation(tenantId: string, breakerId: string, timeWindowMinutes: number): number {
    const events = this.getRecentEvents(tenantId, breakerId, timeWindowMinutes);
    
    if (events.length === 0) {
      return 0;
    }

    const priceDeviations = events
      .filter(e => e.eventType === 'PRICE_UPDATE' && e.priceDeviation !== undefined)
      .map(e => Math.abs(e.priceDeviation || 0));

    return priceDeviations.length > 0 ? Math.max(...priceDeviations) : 0;
  },

  /**
   * Clear the in-memory cache (for testing purposes)
   */
  clearCache(): void {
    circuitBreakerCache.clear();
  },

  /**
   * Clear all event history (for testing purposes)
   */
  clearAllEventHistory(): void {
    eventHistory.clear();
  }
};
