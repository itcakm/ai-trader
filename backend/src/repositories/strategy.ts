import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { Strategy } from '../types/strategy';
import { 
  TenantAccessDeniedError, 
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult 
} from '../db/access';

/**
 * Strategy Repository - manages strategy persistence and retrieval with tenant isolation
 * 
 * Strategies are stored with tenantId as partition key and strategyId as sort key,
 * ensuring tenant isolation at the database level.
 * 
 * Requirements: 2.4, 2.6, 5.4
 */
export const StrategyRepository = {
  /**
   * Get a strategy by ID, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The unique identifier of the strategy
   * @returns The strategy, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getStrategy(tenantId: string, strategyId: string): Promise<Strategy | null> {
    const result = await documentClient.get({
      TableName: TableNames.STRATEGIES,
      Key: {
        [KeySchemas.STRATEGIES.partitionKey]: tenantId,
        [KeySchemas.STRATEGIES.sortKey]: strategyId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'strategy');
    }

    return result.Item as Strategy;
  },

  /**
   * List all strategies for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of strategies
   */
  async listStrategies(params: TenantQueryParams): Promise<PaginatedResult<Strategy>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.STRATEGIES,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.STRATEGIES.partitionKey
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
      items: (result.Items || []) as Strategy[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a strategy, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier (must match strategy.tenantId)
   * @param strategy - The strategy to save
   * @throws TenantAccessDeniedError if tenantId doesn't match strategy.tenantId
   */
  async putStrategy(tenantId: string, strategy: Strategy): Promise<void> {
    // Verify the strategy belongs to the tenant
    if (strategy.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'strategy');
    }

    await documentClient.put({
      TableName: TableNames.STRATEGIES,
      Item: strategy
    }).promise();
  },

  /**
   * Delete a strategy, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The unique identifier of the strategy to delete
   * @throws ResourceNotFoundError if strategy doesn't exist
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async deleteStrategy(tenantId: string, strategyId: string): Promise<void> {
    // First verify the strategy exists and belongs to this tenant
    const existing = await this.getStrategy(tenantId, strategyId);
    if (!existing) {
      throw new ResourceNotFoundError('Strategy', strategyId);
    }

    await documentClient.delete({
      TableName: TableNames.STRATEGIES,
      Key: {
        [KeySchemas.STRATEGIES.partitionKey]: tenantId,
        [KeySchemas.STRATEGIES.sortKey]: strategyId
      }
    }).promise();
  },

  /**
   * Update a strategy, ensuring tenant isolation and returning the updated strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The unique identifier of the strategy
   * @param updates - Partial strategy updates
   * @returns The updated strategy
   * @throws ResourceNotFoundError if strategy doesn't exist
   */
  async updateStrategy(
    tenantId: string,
    strategyId: string,
    updates: Partial<Omit<Strategy, 'strategyId' | 'tenantId' | 'createdAt'>>
  ): Promise<Strategy> {
    // Get existing strategy
    const existing = await this.getStrategy(tenantId, strategyId);
    if (!existing) {
      throw new ResourceNotFoundError('Strategy', strategyId);
    }

    const now = new Date().toISOString();
    
    // Merge updates with existing strategy
    const updatedStrategy: Strategy = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await this.putStrategy(tenantId, updatedStrategy);

    return updatedStrategy;
  },

  /**
   * Check if a strategy exists for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The unique identifier of the strategy
   * @returns True if the strategy exists, false otherwise
   */
  async strategyExists(tenantId: string, strategyId: string): Promise<boolean> {
    const strategy = await this.getStrategy(tenantId, strategyId);
    return strategy !== null;
  }
};
