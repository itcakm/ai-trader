import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { DrawdownState, DrawdownConfig, DrawdownStatus } from '../types/drawdown';
import {
  TenantAccessDeniedError,
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult
} from '../db/access';

/**
 * Drawdown Repository - manages drawdown state and config persistence with tenant isolation
 * 
 * Drawdown state and config are stored with tenantId as partition key,
 * ensuring tenant isolation at the database level.
 * 
 * Requirements: 2.1
 */
export const DrawdownRepository = {
  // ==================== DrawdownState Operations ====================

  /**
   * Get a drawdown state by ID, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param stateId - The unique identifier of the drawdown state
   * @returns The drawdown state, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getState(tenantId: string, stateId: string): Promise<DrawdownState | null> {
    const result = await documentClient.get({
      TableName: TableNames.DRAWDOWN_STATE,
      Key: {
        [KeySchemas.DRAWDOWN_STATE.partitionKey]: tenantId,
        [KeySchemas.DRAWDOWN_STATE.sortKey]: stateId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'drawdown-state');
    }

    return result.Item as DrawdownState;
  },

  /**
   * Get drawdown state by strategy ID
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The drawdown state for the strategy, or null if not found
   */
  async getStateByStrategy(tenantId: string, strategyId: string): Promise<DrawdownState | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DRAWDOWN_STATE,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#strategyId = :strategyId AND #scope = :scope',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DRAWDOWN_STATE.partitionKey,
        '#strategyId': 'strategyId',
        '#scope': 'scope'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':strategyId': strategyId,
        ':scope': 'STRATEGY'
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] as DrawdownState : null;
  },

  /**
   * Get portfolio-level drawdown state for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The portfolio drawdown state, or null if not found
   */
  async getPortfolioState(tenantId: string): Promise<DrawdownState | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DRAWDOWN_STATE,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#scope = :scope',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DRAWDOWN_STATE.partitionKey,
        '#scope': 'scope'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':scope': 'PORTFOLIO'
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] as DrawdownState : null;
  },

  /**
   * List all drawdown states for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of drawdown states
   */
  async listStates(params: TenantQueryParams): Promise<PaginatedResult<DrawdownState>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DRAWDOWN_STATE,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DRAWDOWN_STATE.partitionKey
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
      items: (result.Items || []) as DrawdownState[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List drawdown states by status
   * 
   * @param tenantId - The tenant identifier
   * @param status - The drawdown status to filter by
   * @returns List of drawdown states with the specified status
   */
  async listStatesByStatus(tenantId: string, status: DrawdownStatus): Promise<DrawdownState[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DRAWDOWN_STATE,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DRAWDOWN_STATE.partitionKey,
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':status': status
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return (result.Items || []) as DrawdownState[];
  },

  /**
   * Save a drawdown state, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier (must match state.tenantId)
   * @param state - The drawdown state to save
   * @throws TenantAccessDeniedError if tenantId doesn't match state.tenantId
   */
  async putState(tenantId: string, state: DrawdownState): Promise<void> {
    // Verify the state belongs to the tenant
    if (state.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'drawdown-state');
    }

    await documentClient.put({
      TableName: TableNames.DRAWDOWN_STATE,
      Item: state
    }).promise();
  },

  /**
   * Update drawdown state values atomically
   * 
   * @param tenantId - The tenant identifier
   * @param stateId - The unique identifier of the drawdown state
   * @param updates - The fields to update
   * @returns The updated drawdown state
   * @throws ResourceNotFoundError if drawdown state doesn't exist
   */
  async updateState(
    tenantId: string,
    stateId: string,
    updates: Partial<Pick<DrawdownState, 'currentValue' | 'peakValue' | 'drawdownPercent' | 'drawdownAbsolute' | 'status'>>
  ): Promise<DrawdownState> {
    const existing = await this.getState(tenantId, stateId);
    if (!existing) {
      throw new ResourceNotFoundError('DrawdownState', stateId);
    }

    const now = new Date().toISOString();
    const updatedState: DrawdownState = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await this.putState(tenantId, updatedState);
    return updatedState;
  },

  /**
   * Delete a drawdown state, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param stateId - The unique identifier of the drawdown state to delete
   * @throws ResourceNotFoundError if drawdown state doesn't exist
   */
  async deleteState(tenantId: string, stateId: string): Promise<void> {
    // First verify the state exists and belongs to this tenant
    const existing = await this.getState(tenantId, stateId);
    if (!existing) {
      throw new ResourceNotFoundError('DrawdownState', stateId);
    }

    await documentClient.delete({
      TableName: TableNames.DRAWDOWN_STATE,
      Key: {
        [KeySchemas.DRAWDOWN_STATE.partitionKey]: tenantId,
        [KeySchemas.DRAWDOWN_STATE.sortKey]: stateId
      }
    }).promise();
  },

  // ==================== DrawdownConfig Operations ====================

  /**
   * Get a drawdown config by ID, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The unique identifier of the drawdown config
   * @returns The drawdown config, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getConfig(tenantId: string, configId: string): Promise<DrawdownConfig | null> {
    const result = await documentClient.get({
      TableName: TableNames.DRAWDOWN_CONFIG,
      Key: {
        [KeySchemas.DRAWDOWN_CONFIG.partitionKey]: tenantId,
        [KeySchemas.DRAWDOWN_CONFIG.sortKey]: configId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'drawdown-config');
    }

    return result.Item as DrawdownConfig;
  },

  /**
   * Get drawdown config by strategy ID
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The drawdown config for the strategy, or null if not found
   */
  async getConfigByStrategy(tenantId: string, strategyId: string): Promise<DrawdownConfig | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DRAWDOWN_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#strategyId = :strategyId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DRAWDOWN_CONFIG.partitionKey,
        '#strategyId': 'strategyId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':strategyId': strategyId
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] as DrawdownConfig : null;
  },

  /**
   * Get default (portfolio-level) drawdown config for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The default drawdown config, or null if not found
   */
  async getDefaultConfig(tenantId: string): Promise<DrawdownConfig | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DRAWDOWN_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: 'attribute_not_exists(#strategyId) OR #strategyId = :null',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DRAWDOWN_CONFIG.partitionKey,
        '#strategyId': 'strategyId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':null': null
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] as DrawdownConfig : null;
  },

  /**
   * List all drawdown configs for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of drawdown configs
   */
  async listConfigs(params: TenantQueryParams): Promise<PaginatedResult<DrawdownConfig>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DRAWDOWN_CONFIG,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DRAWDOWN_CONFIG.partitionKey
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
      items: (result.Items || []) as DrawdownConfig[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a drawdown config, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier (must match config.tenantId)
   * @param config - The drawdown config to save
   * @throws TenantAccessDeniedError if tenantId doesn't match config.tenantId
   */
  async putConfig(tenantId: string, config: DrawdownConfig): Promise<void> {
    // Verify the config belongs to the tenant
    if (config.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'drawdown-config');
    }

    await documentClient.put({
      TableName: TableNames.DRAWDOWN_CONFIG,
      Item: config
    }).promise();
  },

  /**
   * Delete a drawdown config, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The unique identifier of the drawdown config to delete
   * @throws ResourceNotFoundError if drawdown config doesn't exist
   */
  async deleteConfig(tenantId: string, configId: string): Promise<void> {
    // First verify the config exists and belongs to this tenant
    const existing = await this.getConfig(tenantId, configId);
    if (!existing) {
      throw new ResourceNotFoundError('DrawdownConfig', configId);
    }

    await documentClient.delete({
      TableName: TableNames.DRAWDOWN_CONFIG,
      Key: {
        [KeySchemas.DRAWDOWN_CONFIG.partitionKey]: tenantId,
        [KeySchemas.DRAWDOWN_CONFIG.sortKey]: configId
      }
    }).promise();
  },

  /**
   * Check if a drawdown state exists for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param stateId - The unique identifier of the drawdown state
   * @returns True if the drawdown state exists, false otherwise
   */
  async stateExists(tenantId: string, stateId: string): Promise<boolean> {
    const state = await this.getState(tenantId, stateId);
    return state !== null;
  },

  /**
   * Check if a drawdown config exists for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The unique identifier of the drawdown config
   * @returns True if the drawdown config exists, false otherwise
   */
  async configExists(tenantId: string, configId: string): Promise<boolean> {
    const config = await this.getConfig(tenantId, configId);
    return config !== null;
  }
};
