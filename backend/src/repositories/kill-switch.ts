import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import {
  KillSwitchState,
  KillSwitchConfig,
  KillSwitchScopeType
} from '../types/kill-switch';
import {
  TenantAccessDeniedError,
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult
} from '../db/access';

/**
 * In-memory cache for kill switch state (simulates ElastiCache)
 * In production, this would be replaced with actual ElastiCache/Redis client
 */
const killSwitchCache = new Map<string, { state: KillSwitchState; expiresAt: number }>();

/**
 * Cache TTL in milliseconds (no TTL for kill switch - persistent until cleared)
 */
const CACHE_TTL_MS = Infinity;

/**
 * Kill Switch Repository - manages kill switch state and config persistence
 * 
 * Uses both DynamoDB for durable storage and ElastiCache (simulated) for fast access.
 * The kill switch state is critical for trading safety, so we use a dual-write pattern.
 * 
 * Requirements: 4.1
 */
export const KillSwitchRepository = {
  // ==================== Cache Operations ====================

  /**
   * Get cache key for kill switch state
   */
  getCacheKey(tenantId: string, scope?: KillSwitchScopeType, scopeId?: string): string {
    if (scope && scopeId) {
      return `risk:killswitch:${tenantId}:${scope}:${scopeId}`;
    }
    return `risk:killswitch:${tenantId}`;
  },

  /**
   * Get kill switch state from cache
   */
  getFromCache(tenantId: string, scope?: KillSwitchScopeType, scopeId?: string): KillSwitchState | null {
    const key = this.getCacheKey(tenantId, scope, scopeId);
    const cached = killSwitchCache.get(key);
    
    if (!cached) {
      return null;
    }

    // Check expiration (though kill switch has no TTL)
    if (cached.expiresAt !== Infinity && Date.now() > cached.expiresAt) {
      killSwitchCache.delete(key);
      return null;
    }

    return cached.state;
  },

  /**
   * Set kill switch state in cache
   */
  setInCache(state: KillSwitchState): void {
    const key = this.getCacheKey(state.tenantId, state.scope, state.scopeId);
    killSwitchCache.set(key, {
      state,
      expiresAt: CACHE_TTL_MS === Infinity ? Infinity : Date.now() + CACHE_TTL_MS
    });
  },

  /**
   * Remove kill switch state from cache
   */
  removeFromCache(tenantId: string, scope?: KillSwitchScopeType, scopeId?: string): void {
    const key = this.getCacheKey(tenantId, scope, scopeId);
    killSwitchCache.delete(key);
  },

  /**
   * Clear all cache entries for a tenant
   */
  clearTenantCache(tenantId: string): void {
    const prefix = `risk:killswitch:${tenantId}`;
    for (const key of killSwitchCache.keys()) {
      if (key.startsWith(prefix)) {
        killSwitchCache.delete(key);
      }
    }
  },

  // ==================== KillSwitchState Operations ====================

  /**
   * Get kill switch state by tenant ID
   * First checks cache, then falls back to DynamoDB
   * 
   * @param tenantId - The tenant identifier
   * @returns The kill switch state, or null if not found
   */
  async getState(tenantId: string): Promise<KillSwitchState | null> {
    // Check cache first for fast access
    const cached = this.getFromCache(tenantId);
    if (cached) {
      return cached;
    }

    // Fall back to DynamoDB
    const result = await documentClient.get({
      TableName: TableNames.KILL_SWITCH_STATE,
      Key: {
        [KeySchemas.KILL_SWITCH_STATE.partitionKey]: tenantId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'kill-switch-state');
    }

    const state = result.Item as KillSwitchState;
    
    // Populate cache for future fast access
    this.setInCache(state);

    return state;
  },

  /**
   * Get kill switch state by scope
   * 
   * @param tenantId - The tenant identifier
   * @param scope - The scope type (TENANT, STRATEGY, ASSET)
   * @param scopeId - The scope identifier (for STRATEGY or ASSET scope)
   * @returns The kill switch state, or null if not found
   */
  async getStateByScope(
    tenantId: string,
    scope: KillSwitchScopeType,
    scopeId?: string
  ): Promise<KillSwitchState | null> {
    // Check cache first
    const cached = this.getFromCache(tenantId, scope, scopeId);
    if (cached) {
      return cached;
    }

    // For tenant-level scope, use the main getState
    if (scope === 'TENANT') {
      return this.getState(tenantId);
    }

    // Query by scope for strategy/asset level
    const result = await documentClient.query({
      TableName: TableNames.KILL_SWITCH_STATE,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#scope = :scope AND #scopeId = :scopeId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.KILL_SWITCH_STATE.partitionKey,
        '#scope': 'scope',
        '#scopeId': 'scopeId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':scope': scope,
        ':scopeId': scopeId
      }
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const state = result.Items[0] as KillSwitchState;
    this.setInCache(state);

    return state;
  },

  /**
   * Check if kill switch is active for a tenant (fast path using cache)
   * 
   * @param tenantId - The tenant identifier
   * @returns True if kill switch is active
   */
  async isActive(tenantId: string): Promise<boolean> {
    // Check cache first for sub-millisecond response
    const cached = this.getFromCache(tenantId);
    if (cached) {
      return cached.active;
    }

    const state = await this.getState(tenantId);
    return state?.active ?? false;
  },

  /**
   * Save kill switch state with dual-write to cache and DynamoDB
   * 
   * @param tenantId - The tenant identifier (must match state.tenantId)
   * @param state - The kill switch state to save
   * @throws TenantAccessDeniedError if tenantId doesn't match state.tenantId
   */
  async putState(tenantId: string, state: KillSwitchState): Promise<void> {
    // Verify the state belongs to the tenant
    if (state.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'kill-switch-state');
    }

    // Write to cache first for immediate availability
    this.setInCache(state);

    // Then write to DynamoDB for durability
    await documentClient.put({
      TableName: TableNames.KILL_SWITCH_STATE,
      Item: state
    }).promise();
  },

  /**
   * Update kill switch state atomically
   * 
   * @param tenantId - The tenant identifier
   * @param updates - The fields to update
   * @returns The updated kill switch state
   */
  async updateState(
    tenantId: string,
    updates: Partial<Omit<KillSwitchState, 'tenantId'>>
  ): Promise<KillSwitchState> {
    const existing = await this.getState(tenantId);
    
    if (!existing) {
      throw new ResourceNotFoundError('KillSwitchState', tenantId);
    }

    const updatedState: KillSwitchState = {
      ...existing,
      ...updates
    };

    await this.putState(tenantId, updatedState);
    return updatedState;
  },

  /**
   * Delete kill switch state
   * 
   * @param tenantId - The tenant identifier
   */
  async deleteState(tenantId: string): Promise<void> {
    // Remove from cache
    this.clearTenantCache(tenantId);

    // Remove from DynamoDB
    await documentClient.delete({
      TableName: TableNames.KILL_SWITCH_STATE,
      Key: {
        [KeySchemas.KILL_SWITCH_STATE.partitionKey]: tenantId
      }
    }).promise();
  },

  /**
   * List all active kill switches (for monitoring)
   * 
   * @returns List of all active kill switch states
   */
  async listActiveStates(): Promise<KillSwitchState[]> {
    const result = await documentClient.scan({
      TableName: TableNames.KILL_SWITCH_STATE,
      FilterExpression: '#active = :active',
      ExpressionAttributeNames: {
        '#active': 'active'
      },
      ExpressionAttributeValues: {
        ':active': true
      }
    }).promise();

    return (result.Items || []) as KillSwitchState[];
  },

  // ==================== KillSwitchConfig Operations ====================

  /**
   * Get kill switch config by ID
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The config identifier
   * @returns The kill switch config, or null if not found
   */
  async getConfig(tenantId: string, configId: string): Promise<KillSwitchConfig | null> {
    const result = await documentClient.get({
      TableName: TableNames.KILL_SWITCH_CONFIG,
      Key: {
        [KeySchemas.KILL_SWITCH_CONFIG.partitionKey]: tenantId,
        [KeySchemas.KILL_SWITCH_CONFIG.sortKey]: configId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'kill-switch-config');
    }

    return result.Item as KillSwitchConfig;
  },

  /**
   * Get default kill switch config for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The default kill switch config, or null if not found
   */
  async getDefaultConfig(tenantId: string): Promise<KillSwitchConfig | null> {
    const result = await documentClient.query({
      TableName: TableNames.KILL_SWITCH_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.KILL_SWITCH_CONFIG.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId
      },
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as KillSwitchConfig;
  },

  /**
   * List all kill switch configs for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of kill switch configs
   */
  async listConfigs(params: TenantQueryParams): Promise<PaginatedResult<KillSwitchConfig>> {
    const queryParams: AWS.DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.KILL_SWITCH_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.KILL_SWITCH_CONFIG.partitionKey
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
      items: (result.Items || []) as KillSwitchConfig[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save kill switch config
   * 
   * @param tenantId - The tenant identifier (must match config.tenantId)
   * @param config - The kill switch config to save
   * @throws TenantAccessDeniedError if tenantId doesn't match config.tenantId
   */
  async putConfig(tenantId: string, config: KillSwitchConfig): Promise<void> {
    // Verify the config belongs to the tenant
    if (config.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'kill-switch-config');
    }

    await documentClient.put({
      TableName: TableNames.KILL_SWITCH_CONFIG,
      Item: config
    }).promise();
  },

  /**
   * Delete kill switch config
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The config identifier
   */
  async deleteConfig(tenantId: string, configId: string): Promise<void> {
    // First verify the config exists and belongs to this tenant
    const existing = await this.getConfig(tenantId, configId);
    if (!existing) {
      throw new ResourceNotFoundError('KillSwitchConfig', configId);
    }

    await documentClient.delete({
      TableName: TableNames.KILL_SWITCH_CONFIG,
      Key: {
        [KeySchemas.KILL_SWITCH_CONFIG.partitionKey]: tenantId,
        [KeySchemas.KILL_SWITCH_CONFIG.sortKey]: configId
      }
    }).promise();
  },

  /**
   * Check if a kill switch state exists for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns True if the kill switch state exists
   */
  async stateExists(tenantId: string): Promise<boolean> {
    const state = await this.getState(tenantId);
    return state !== null;
  },

  /**
   * Clear the in-memory cache (for testing purposes)
   */
  clearCache(): void {
    killSwitchCache.clear();
  }
};
