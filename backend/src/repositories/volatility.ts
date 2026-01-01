import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { VolatilityState, VolatilityConfig } from '../types/volatility';
import {
  TenantAccessDeniedError,
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult
} from '../db/access';

/**
 * Volatility Repository - manages volatility state and config persistence with tenant isolation
 * 
 * Volatility state is stored per asset, while config is stored per tenant with optional asset override.
 * 
 * Requirements: 3.1
 */
export const VolatilityRepository = {
  // ==================== VolatilityState Operations ====================

  /**
   * Get a volatility state by ID
   * 
   * @param stateId - The unique identifier of the volatility state
   * @returns The volatility state, or null if not found
   */
  async getState(stateId: string): Promise<VolatilityState | null> {
    const result = await documentClient.get({
      TableName: TableNames.VOLATILITY_STATE,
      Key: {
        [KeySchemas.VOLATILITY_STATE.partitionKey]: stateId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return result.Item as VolatilityState;
  },

  /**
   * Get volatility state by asset ID
   * 
   * @param assetId - The asset identifier
   * @returns The volatility state for the asset, or null if not found
   */
  async getStateByAsset(assetId: string): Promise<VolatilityState | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.VOLATILITY_STATE,
      IndexName: 'assetId-index',
      KeyConditionExpression: '#assetId = :assetId',
      ExpressionAttributeNames: {
        '#assetId': 'assetId'
      },
      ExpressionAttributeValues: {
        ':assetId': assetId
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] as VolatilityState : null;
  },

  /**
   * List all volatility states
   * 
   * @param limit - Optional limit for pagination
   * @param exclusiveStartKey - Optional start key for pagination
   * @returns Paginated list of volatility states
   */
  async listStates(limit?: number, exclusiveStartKey?: DynamoDB.DocumentClient.Key): Promise<PaginatedResult<VolatilityState>> {
    const scanParams: DynamoDB.DocumentClient.ScanInput = {
      TableName: TableNames.VOLATILITY_STATE
    };

    if (limit) {
      scanParams.Limit = limit;
    }

    if (exclusiveStartKey) {
      scanParams.ExclusiveStartKey = exclusiveStartKey;
    }

    const result = await documentClient.scan(scanParams).promise();

    return {
      items: (result.Items || []) as VolatilityState[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a volatility state
   * 
   * @param state - The volatility state to save
   */
  async putState(state: VolatilityState): Promise<void> {
    await documentClient.put({
      TableName: TableNames.VOLATILITY_STATE,
      Item: state
    }).promise();
  },

  /**
   * Update volatility state values atomically
   * 
   * @param stateId - The unique identifier of the volatility state
   * @param updates - The fields to update
   * @returns The updated volatility state
   * @throws ResourceNotFoundError if volatility state doesn't exist
   */
  async updateState(
    stateId: string,
    updates: Partial<Pick<VolatilityState, 'currentIndex' | 'level' | 'throttlePercent' | 'allowNewEntries'>>
  ): Promise<VolatilityState> {
    const existing = await this.getState(stateId);
    if (!existing) {
      throw new ResourceNotFoundError('VolatilityState', stateId);
    }

    const now = new Date().toISOString();
    const updatedState: VolatilityState = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await this.putState(updatedState);
    return updatedState;
  },

  /**
   * Delete a volatility state
   * 
   * @param stateId - The unique identifier of the volatility state to delete
   * @throws ResourceNotFoundError if volatility state doesn't exist
   */
  async deleteState(stateId: string): Promise<void> {
    const existing = await this.getState(stateId);
    if (!existing) {
      throw new ResourceNotFoundError('VolatilityState', stateId);
    }

    await documentClient.delete({
      TableName: TableNames.VOLATILITY_STATE,
      Key: {
        [KeySchemas.VOLATILITY_STATE.partitionKey]: stateId
      }
    }).promise();
  },

  // ==================== VolatilityConfig Operations ====================

  /**
   * Get a volatility config by ID, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The unique identifier of the volatility config
   * @returns The volatility config, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getConfig(tenantId: string, configId: string): Promise<VolatilityConfig | null> {
    const result = await documentClient.get({
      TableName: TableNames.VOLATILITY_CONFIG,
      Key: {
        [KeySchemas.VOLATILITY_CONFIG.partitionKey]: tenantId,
        [KeySchemas.VOLATILITY_CONFIG.sortKey]: configId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'volatility-config');
    }

    return result.Item as VolatilityConfig;
  },

  /**
   * Get volatility config by asset ID for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @returns The volatility config for the asset, or null if not found
   */
  async getConfigByAsset(tenantId: string, assetId: string): Promise<VolatilityConfig | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.VOLATILITY_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#assetId = :assetId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.VOLATILITY_CONFIG.partitionKey,
        '#assetId': 'assetId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':assetId': assetId
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] as VolatilityConfig : null;
  },

  /**
   * Get default (portfolio-wide) volatility config for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The default volatility config, or null if not found
   */
  async getDefaultConfig(tenantId: string): Promise<VolatilityConfig | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.VOLATILITY_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: 'attribute_not_exists(#assetId) OR #assetId = :null',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.VOLATILITY_CONFIG.partitionKey,
        '#assetId': 'assetId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':null': null
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] as VolatilityConfig : null;
  },

  /**
   * List all volatility configs for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of volatility configs
   */
  async listConfigs(params: TenantQueryParams): Promise<PaginatedResult<VolatilityConfig>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.VOLATILITY_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.VOLATILITY_CONFIG.partitionKey
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
      items: (result.Items || []) as VolatilityConfig[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a volatility config, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier (must match config.tenantId)
   * @param config - The volatility config to save
   * @throws TenantAccessDeniedError if tenantId doesn't match config.tenantId
   */
  async putConfig(tenantId: string, config: VolatilityConfig): Promise<void> {
    // Verify the config belongs to the tenant
    if (config.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'volatility-config');
    }

    await documentClient.put({
      TableName: TableNames.VOLATILITY_CONFIG,
      Item: config
    }).promise();
  },

  /**
   * Delete a volatility config, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The unique identifier of the volatility config to delete
   * @throws ResourceNotFoundError if volatility config doesn't exist
   */
  async deleteConfig(tenantId: string, configId: string): Promise<void> {
    // First verify the config exists and belongs to this tenant
    const existing = await this.getConfig(tenantId, configId);
    if (!existing) {
      throw new ResourceNotFoundError('VolatilityConfig', configId);
    }

    await documentClient.delete({
      TableName: TableNames.VOLATILITY_CONFIG,
      Key: {
        [KeySchemas.VOLATILITY_CONFIG.partitionKey]: tenantId,
        [KeySchemas.VOLATILITY_CONFIG.sortKey]: configId
      }
    }).promise();
  },

  /**
   * Check if a volatility state exists
   * 
   * @param stateId - The unique identifier of the volatility state
   * @returns True if the volatility state exists, false otherwise
   */
  async stateExists(stateId: string): Promise<boolean> {
    const state = await this.getState(stateId);
    return state !== null;
  },

  /**
   * Check if a volatility config exists for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The unique identifier of the volatility config
   * @returns True if the volatility config exists, false otherwise
   */
  async configExists(tenantId: string, configId: string): Promise<boolean> {
    const config = await this.getConfig(tenantId, configId);
    return config !== null;
  }
};
