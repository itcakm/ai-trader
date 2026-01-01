import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import {
  RiskEvent,
  RiskEventFilters,
  RiskEventStats,
  RiskEventType,
  RiskEventSeverity,
  AlertConfig,
  AuditedRiskEvent,
  RejectionDetails,
  ParameterChangeRecord,
  MarketConditionSnapshot
} from '../types/risk-event';
import {
  TenantAccessDeniedError,
  TenantQueryParams,
  PaginatedResult
} from '../db/access';

/**
 * Default retention period in days (1 year)
 * Requirements: 10.5
 */
const DEFAULT_RETENTION_DAYS = 365;

/**
 * In-memory cache for recent events (simulates ElastiCache)
 * Used for fast aggregation queries
 */
const recentEventsCache = new Map<string, { events: RiskEvent[]; expiresAt: number }>();

/**
 * In-memory cache for audited events (simulates ElastiCache)
 * Used for audit trail queries
 */
const auditedEventsCache = new Map<string, { events: AuditedRiskEvent[]; expiresAt: number }>();

/**
 * In-memory storage for rejection details (simulates S3/DynamoDB)
 * Requirements: 3.4
 */
const rejectionDetailsStore = new Map<string, RejectionDetails>();

/**
 * In-memory storage for parameter changes (simulates S3/DynamoDB)
 * Requirements: 3.5
 */
const parameterChangesStore = new Map<string, ParameterChangeRecord[]>();

/**
 * In-memory storage for context links (simulates S3/DynamoDB)
 * Requirements: 3.3
 */
const contextLinksStore = new Map<string, { tradeId?: string; marketConditions?: MarketConditionSnapshot }>();

/**
 * Cache TTL in milliseconds (5 minutes for event cache)
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Maximum events to keep in cache per tenant
 */
const MAX_CACHED_EVENTS = 1000;

/**
 * Risk Event Repository - manages risk event persistence with TTL for retention
 * 
 * Uses DynamoDB with TTL for automatic retention management.
 * Events are stored with tenant isolation and support various query patterns.
 * 
 * Requirements: 10.1, 10.5
 */
export const RiskEventRepository = {
  // ==================== Cache Operations ====================

  /**
   * Get cache key for tenant events
   */
  getCacheKey(tenantId: string): string {
    return `risk:events:${tenantId}`;
  },

  /**
   * Get events from cache
   */
  getFromCache(tenantId: string): RiskEvent[] | null {
    const key = this.getCacheKey(tenantId);
    const cached = recentEventsCache.get(key);
    
    if (!cached) {
      return null;
    }

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      recentEventsCache.delete(key);
      return null;
    }

    return cached.events;
  },

  /**
   * Add event to cache
   */
  addToCache(event: RiskEvent): void {
    const key = this.getCacheKey(event.tenantId);
    let cached = recentEventsCache.get(key);
    
    if (!cached || Date.now() > cached.expiresAt) {
      cached = { events: [], expiresAt: Date.now() + CACHE_TTL_MS };
    }

    cached.events.push(event);
    
    // Keep only most recent events
    if (cached.events.length > MAX_CACHED_EVENTS) {
      cached.events = cached.events.slice(-MAX_CACHED_EVENTS);
    }

    cached.expiresAt = Date.now() + CACHE_TTL_MS;
    recentEventsCache.set(key, cached);
  },

  /**
   * Clear cache for a tenant
   */
  clearCache(tenantId: string): void {
    const key = this.getCacheKey(tenantId);
    recentEventsCache.delete(key);
  },

  // ==================== Sort Key Helpers ====================

  /**
   * Create composite sort key from timestamp and eventId
   */
  createSortKey(timestamp: string, eventId: string): string {
    return `${timestamp}#${eventId}`;
  },

  /**
   * Parse composite sort key into timestamp and eventId
   */
  parseSortKey(sortKey: string): { timestamp: string; eventId: string } {
    const [timestamp, eventId] = sortKey.split('#');
    return { timestamp, eventId };
  },

  /**
   * Calculate TTL expiration timestamp
   * Requirements: 10.5
   */
  calculateExpiresAt(retentionDays: number = DEFAULT_RETENTION_DAYS): number {
    const now = Date.now();
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    return Math.floor((now + retentionMs) / 1000); // DynamoDB TTL uses seconds
  },

  // ==================== CRUD Operations ====================

  /**
   * Store a risk event with TTL for retention
   * 
   * Requirements: 10.1, 10.5
   * 
   * @param event - The risk event to store
   * @param retentionDays - Optional retention period (default 1 year)
   */
  async putEvent(event: RiskEvent, retentionDays?: number): Promise<void> {
    const sortKey = this.createSortKey(event.timestamp, event.eventId);
    const expiresAt = this.calculateExpiresAt(retentionDays);

    await documentClient.put({
      TableName: TableNames.RISK_EVENTS,
      Item: {
        ...event,
        [KeySchemas.RISK_EVENTS.sortKey]: sortKey,
        expiresAt
      }
    }).promise();

    // Add to cache for fast access
    this.addToCache(event);
  },

  /**
   * Get a risk event by ID
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The event timestamp
   * @param eventId - The event identifier
   * @returns The risk event, or null if not found
   */
  async getEvent(tenantId: string, timestamp: string, eventId: string): Promise<RiskEvent | null> {
    const sortKey = this.createSortKey(timestamp, eventId);

    const result = await documentClient.get({
      TableName: TableNames.RISK_EVENTS,
      Key: {
        [KeySchemas.RISK_EVENTS.partitionKey]: tenantId,
        [KeySchemas.RISK_EVENTS.sortKey]: sortKey
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'risk-event');
    }

    // Remove internal fields before returning
    const { timestampEventId, expiresAt, ...event } = result.Item as RiskEvent & { 
      timestampEventId: string; 
      expiresAt: number 
    };
    
    return event;
  },

  /**
   * List risk events for a tenant with optional filters
   * 
   * Requirements: 10.4 (tenant isolation)
   * 
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters for the query
   * @returns Paginated list of risk events
   */
  async listEvents(tenantId: string, filters?: RiskEventFilters): Promise<PaginatedResult<RiskEvent>> {
    let keyConditionExpression = '#pk = :tenantId';
    const expressionAttributeNames: Record<string, string> = {
      '#pk': KeySchemas.RISK_EVENTS.partitionKey
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':tenantId': tenantId
    };

    // Add time range filter to key condition if provided
    if (filters?.startTime && filters?.endTime) {
      keyConditionExpression += ' AND #sk BETWEEN :startTime AND :endTime';
      expressionAttributeNames['#sk'] = KeySchemas.RISK_EVENTS.sortKey;
      expressionAttributeValues[':startTime'] = filters.startTime;
      expressionAttributeValues[':endTime'] = `${filters.endTime}~`; // ~ is after # in ASCII
    } else if (filters?.startTime) {
      keyConditionExpression += ' AND #sk >= :startTime';
      expressionAttributeNames['#sk'] = KeySchemas.RISK_EVENTS.sortKey;
      expressionAttributeValues[':startTime'] = filters.startTime;
    } else if (filters?.endTime) {
      keyConditionExpression += ' AND #sk <= :endTime';
      expressionAttributeNames['#sk'] = KeySchemas.RISK_EVENTS.sortKey;
      expressionAttributeValues[':endTime'] = `${filters.endTime}~`;
    }

    // Build filter expression for non-key attributes
    const filterConditions: string[] = [];

    if (filters?.eventTypes && filters.eventTypes.length > 0) {
      const typeConditions = filters.eventTypes.map((_, i) => `:eventType${i}`);
      filterConditions.push(`#eventType IN (${typeConditions.join(', ')})`);
      expressionAttributeNames['#eventType'] = 'eventType';
      filters.eventTypes.forEach((type, i) => {
        expressionAttributeValues[`:eventType${i}`] = type;
      });
    }

    if (filters?.severities && filters.severities.length > 0) {
      const severityConditions = filters.severities.map((_, i) => `:severity${i}`);
      filterConditions.push(`#severity IN (${severityConditions.join(', ')})`);
      expressionAttributeNames['#severity'] = 'severity';
      filters.severities.forEach((severity, i) => {
        expressionAttributeValues[`:severity${i}`] = severity;
      });
    }

    if (filters?.strategyId) {
      filterConditions.push('#strategyId = :strategyId');
      expressionAttributeNames['#strategyId'] = 'strategyId';
      expressionAttributeValues[':strategyId'] = filters.strategyId;
    }

    if (filters?.assetId) {
      filterConditions.push('#assetId = :assetId');
      expressionAttributeNames['#assetId'] = 'assetId';
      expressionAttributeValues[':assetId'] = filters.assetId;
    }

    const queryParams: AWS.DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.RISK_EVENTS,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false // Most recent first
    };

    if (filterConditions.length > 0) {
      queryParams.FilterExpression = filterConditions.join(' AND ');
    }

    if (filters?.limit) {
      queryParams.Limit = filters.limit;
    }

    const result = await documentClient.query(queryParams).promise();

    // Remove internal fields and verify tenant ownership
    const events = (result.Items || []).map(item => {
      if (item.tenantId !== tenantId) {
        throw new TenantAccessDeniedError(tenantId, 'risk-event');
      }
      const { timestampEventId, expiresAt, ...event } = item as RiskEvent & { 
        timestampEventId: string; 
        expiresAt: number 
      };
      return event;
    });

    return {
      items: events,
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Get event statistics for a tenant
   * 
   * Requirements: 10.6
   * 
   * @param tenantId - The tenant identifier
   * @param startTime - Start of the period
   * @param endTime - End of the period
   * @returns Event statistics
   */
  async getEventStats(tenantId: string, startTime: string, endTime: string): Promise<RiskEventStats> {
    const result = await this.listEvents(tenantId, {
      startTime,
      endTime,
      limit: 10000 // Get all events in period for stats
    });

    const eventsByType: Record<RiskEventType, number> = {
      'LIMIT_BREACH': 0,
      'LIMIT_WARNING': 0,
      'DRAWDOWN_WARNING': 0,
      'DRAWDOWN_BREACH': 0,
      'VOLATILITY_THROTTLE': 0,
      'CIRCUIT_BREAKER_TRIP': 0,
      'CIRCUIT_BREAKER_RESET': 0,
      'KILL_SWITCH_ACTIVATED': 0,
      'KILL_SWITCH_DEACTIVATED': 0,
      'ORDER_REJECTED': 0,
      'EXCHANGE_ERROR': 0
    };

    const eventsBySeverity: Record<RiskEventSeverity, number> = {
      'INFO': 0,
      'WARNING': 0,
      'CRITICAL': 0,
      'EMERGENCY': 0
    };

    for (const event of result.items) {
      eventsByType[event.eventType]++;
      eventsBySeverity[event.severity]++;
    }

    return {
      totalEvents: result.items.length,
      eventsByType,
      eventsBySeverity,
      period: `${startTime} to ${endTime}`
    };
  },

  /**
   * Delete a risk event
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The event timestamp
   * @param eventId - The event identifier
   */
  async deleteEvent(tenantId: string, timestamp: string, eventId: string): Promise<void> {
    const sortKey = this.createSortKey(timestamp, eventId);

    // First verify the event belongs to this tenant
    const existing = await this.getEvent(tenantId, timestamp, eventId);
    if (!existing) {
      return; // Event doesn't exist, nothing to delete
    }

    await documentClient.delete({
      TableName: TableNames.RISK_EVENTS,
      Key: {
        [KeySchemas.RISK_EVENTS.partitionKey]: tenantId,
        [KeySchemas.RISK_EVENTS.sortKey]: sortKey
      }
    }).promise();
  },

  // ==================== Alert Config Operations ====================

  /**
   * Store alert configuration for a tenant
   * 
   * Requirements: 10.3
   * 
   * @param tenantId - The tenant identifier
   * @param config - The alert configuration
   */
  async putAlertConfig(tenantId: string, config: AlertConfig): Promise<void> {
    await documentClient.put({
      TableName: TableNames.ALERT_CONFIGS,
      Item: {
        [KeySchemas.ALERT_CONFIGS.partitionKey]: tenantId,
        ...config
      }
    }).promise();
  },

  /**
   * Get alert configuration for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The alert configuration, or null if not found
   */
  async getAlertConfig(tenantId: string): Promise<AlertConfig | null> {
    const result = await documentClient.get({
      TableName: TableNames.ALERT_CONFIGS,
      Key: {
        [KeySchemas.ALERT_CONFIGS.partitionKey]: tenantId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    const { tenantId: _, ...config } = result.Item;
    return config as AlertConfig;
  },

  /**
   * Delete alert configuration for a tenant
   * 
   * @param tenantId - The tenant identifier
   */
  async deleteAlertConfig(tenantId: string): Promise<void> {
    await documentClient.delete({
      TableName: TableNames.ALERT_CONFIGS,
      Key: {
        [KeySchemas.ALERT_CONFIGS.partitionKey]: tenantId
      }
    }).promise();
  },

  // ==================== Aggregation Operations ====================

  /**
   * Get recent events from cache for fast aggregation
   * 
   * @param tenantId - The tenant identifier
   * @param timeWindowMinutes - Time window to look back
   * @returns Array of recent events
   */
  getRecentEventsFromCache(tenantId: string, timeWindowMinutes: number): RiskEvent[] {
    const cached = this.getFromCache(tenantId);
    if (!cached) {
      return [];
    }

    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
    return cached.filter(e => e.timestamp >= cutoffTime);
  },

  /**
   * Count events by type in a time window
   * 
   * @param tenantId - The tenant identifier
   * @param eventType - The event type to count
   * @param timeWindowMinutes - Time window to look back
   * @returns Count of events
   */
  countEventsByType(tenantId: string, eventType: RiskEventType, timeWindowMinutes: number): number {
    const events = this.getRecentEventsFromCache(tenantId, timeWindowMinutes);
    return events.filter(e => e.eventType === eventType).length;
  },

  /**
   * Count events by severity in a time window
   * 
   * @param tenantId - The tenant identifier
   * @param severity - The severity to count
   * @param timeWindowMinutes - Time window to look back
   * @returns Count of events
   */
  countEventsBySeverity(tenantId: string, severity: RiskEventSeverity, timeWindowMinutes: number): number {
    const events = this.getRecentEventsFromCache(tenantId, timeWindowMinutes);
    return events.filter(e => e.severity === severity).length;
  },

  // ==================== Testing Helpers ====================

  /**
   * Clear all caches (for testing purposes)
   */
  clearAllCaches(): void {
    recentEventsCache.clear();
    auditedEventsCache.clear();
    rejectionDetailsStore.clear();
    parameterChangesStore.clear();
    contextLinksStore.clear();
  },

  // ==================== Audit Operations ====================

  /**
   * Store an audited risk event with extended audit fields
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   * 
   * @param event - The audited risk event to store
   * @param retentionDays - Optional retention period (default 1 year)
   */
  async putAuditedEvent(event: AuditedRiskEvent, retentionDays?: number): Promise<void> {
    // Store the base event
    await this.putEvent(event, retentionDays);

    // Store rejection details if present (Requirements: 3.4)
    if (event.rejectionDetails) {
      rejectionDetailsStore.set(event.eventId, event.rejectionDetails);
    }

    // Store parameter change if present (Requirements: 3.5)
    if (event.parameterChange) {
      const existingChanges = parameterChangesStore.get(event.tenantId) || [];
      existingChanges.push(event.parameterChange);
      parameterChangesStore.set(event.tenantId, existingChanges);
    }

    // Store context links if present (Requirements: 3.3)
    if (event.triggeringTradeId || event.triggeringMarketConditions) {
      contextLinksStore.set(event.eventId, {
        tradeId: event.triggeringTradeId,
        marketConditions: event.triggeringMarketConditions
      });
    }

    // Add to audited events cache
    this.addToAuditedCache(event);
  },

  /**
   * Get an audited risk event by ID with all audit fields
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The event timestamp
   * @param eventId - The event identifier
   * @returns The audited risk event, or null if not found
   */
  async getAuditedEvent(tenantId: string, timestamp: string, eventId: string): Promise<AuditedRiskEvent | null> {
    const baseEvent = await this.getEvent(tenantId, timestamp, eventId);
    if (!baseEvent) {
      return null;
    }

    // Retrieve audit fields
    const rejectionDetails = rejectionDetailsStore.get(eventId);
    const contextLink = contextLinksStore.get(eventId);

    const auditedEvent: AuditedRiskEvent = {
      ...baseEvent,
      rejectionDetails,
      triggeringTradeId: contextLink?.tradeId,
      triggeringMarketConditions: contextLink?.marketConditions
    };

    return auditedEvent;
  },

  /**
   * Store rejection details for a risk event
   * 
   * Requirements: 3.4
   * 
   * @param eventId - The event identifier
   * @param details - The rejection details
   */
  async putRejectionDetails(eventId: string, details: RejectionDetails): Promise<void> {
    rejectionDetailsStore.set(eventId, details);
  },

  /**
   * Get rejection details for a risk event
   * 
   * Requirements: 3.4
   * 
   * @param eventId - The event identifier
   * @returns The rejection details, or null if not found
   */
  async getRejectionDetails(eventId: string): Promise<RejectionDetails | null> {
    return rejectionDetailsStore.get(eventId) || null;
  },

  /**
   * Store a parameter change record
   * 
   * Requirements: 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param eventId - The associated event identifier
   * @param change - The parameter change record
   */
  async putParameterChange(tenantId: string, eventId: string, change: ParameterChangeRecord): Promise<void> {
    const existingChanges = parameterChangesStore.get(tenantId) || [];
    existingChanges.push({ ...change, eventId } as ParameterChangeRecord & { eventId: string });
    parameterChangesStore.set(tenantId, existingChanges);
  },

  /**
   * Get parameter change history for a tenant
   * 
   * Requirements: 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param parameterName - Optional filter by parameter name
   * @returns Array of parameter change records
   */
  async getParameterChanges(tenantId: string, parameterName?: string): Promise<ParameterChangeRecord[]> {
    const changes = parameterChangesStore.get(tenantId) || [];
    if (parameterName) {
      return changes.filter(c => c.parameterName === parameterName);
    }
    return changes;
  },

  /**
   * Link a risk event to its triggering context
   * 
   * Requirements: 3.3
   * 
   * @param eventId - The event identifier
   * @param tradeId - Optional triggering trade ID
   * @param marketConditions - Optional market conditions snapshot
   */
  async putContextLink(
    eventId: string,
    tradeId?: string,
    marketConditions?: MarketConditionSnapshot
  ): Promise<void> {
    contextLinksStore.set(eventId, { tradeId, marketConditions });
  },

  /**
   * Get context link for a risk event
   * 
   * Requirements: 3.3
   * 
   * @param eventId - The event identifier
   * @returns The context link, or null if not found
   */
  async getContextLink(eventId: string): Promise<{ tradeId?: string; marketConditions?: MarketConditionSnapshot } | null> {
    return contextLinksStore.get(eventId) || null;
  },

  /**
   * List audited events for a tenant with optional filters
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters for the query
   * @returns Paginated list of audited risk events
   */
  async listAuditedEvents(tenantId: string, filters?: RiskEventFilters): Promise<PaginatedResult<AuditedRiskEvent>> {
    const baseResult = await this.listEvents(tenantId, filters);
    
    // Enrich each event with audit fields
    const auditedEvents: AuditedRiskEvent[] = baseResult.items.map(event => {
      const rejectionDetails = rejectionDetailsStore.get(event.eventId);
      const contextLink = contextLinksStore.get(event.eventId);
      
      return {
        ...event,
        rejectionDetails,
        triggeringTradeId: contextLink?.tradeId,
        triggeringMarketConditions: contextLink?.marketConditions
      };
    });

    return {
      items: auditedEvents,
      lastEvaluatedKey: baseResult.lastEvaluatedKey
    };
  },

  /**
   * Get events by triggering trade ID
   * 
   * Requirements: 3.3
   * 
   * @param tenantId - The tenant identifier
   * @param tradeId - The triggering trade ID
   * @returns Array of audited risk events linked to the trade
   */
  async getEventsByTradeId(tenantId: string, tradeId: string): Promise<AuditedRiskEvent[]> {
    const result = await this.listAuditedEvents(tenantId, { limit: 10000 });
    return result.items.filter(event => event.triggeringTradeId === tradeId);
  },

  // ==================== Audited Events Cache Operations ====================

  /**
   * Get cache key for tenant audited events
   */
  getAuditedCacheKey(tenantId: string): string {
    return `risk:audited:${tenantId}`;
  },

  /**
   * Get audited events from cache
   */
  getFromAuditedCache(tenantId: string): AuditedRiskEvent[] | null {
    const key = this.getAuditedCacheKey(tenantId);
    const cached = auditedEventsCache.get(key);
    
    if (!cached) {
      return null;
    }

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      auditedEventsCache.delete(key);
      return null;
    }

    return cached.events;
  },

  /**
   * Add audited event to cache
   */
  addToAuditedCache(event: AuditedRiskEvent): void {
    const key = this.getAuditedCacheKey(event.tenantId);
    let cached = auditedEventsCache.get(key);
    
    if (!cached || Date.now() > cached.expiresAt) {
      cached = { events: [], expiresAt: Date.now() + CACHE_TTL_MS };
    }

    cached.events.push(event);
    
    // Keep only most recent events
    if (cached.events.length > MAX_CACHED_EVENTS) {
      cached.events = cached.events.slice(-MAX_CACHED_EVENTS);
    }

    cached.expiresAt = Date.now() + CACHE_TTL_MS;
    auditedEventsCache.set(key, cached);
  }
};
