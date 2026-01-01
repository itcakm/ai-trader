import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { PositionLimit, LimitScope } from '../types/position-limit';
import {
  TenantAccessDeniedError,
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult
} from '../db/access';

/**
 * Position Limit Repository - manages position limit persistence with tenant isolation
 * 
 * Position limits are stored with tenantId as partition key and limitId as sort key,
 * ensuring tenant isolation at the database level.
 * 
 * Requirements: 1.1
 */
export const PositionLimitRepository = {
  /**
   * Get a position limit by ID, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param limitId - The unique identifier of the position limit
   * @returns The position limit, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getLimit(tenantId: string, limitId: string): Promise<PositionLimit | null> {
    const result = await documentClient.get({
      TableName: TableNames.POSITION_LIMITS,
      Key: {
        [KeySchemas.POSITION_LIMITS.partitionKey]: tenantId,
        [KeySchemas.POSITION_LIMITS.sortKey]: limitId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'position-limit');
    }

    return result.Item as PositionLimit;
  },

  /**
   * List all position limits for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of position limits
   */
  async listLimits(params: TenantQueryParams): Promise<PaginatedResult<PositionLimit>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.POSITION_LIMITS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.POSITION_LIMITS.partitionKey
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
      items: (result.Items || []) as PositionLimit[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List position limits by scope for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param scope - The limit scope to filter by
   * @returns List of position limits matching the scope
   */
  async listLimitsByScope(tenantId: string, scope: LimitScope): Promise<PositionLimit[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.POSITION_LIMITS,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#scope = :scope',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.POSITION_LIMITS.partitionKey,
        '#scope': 'scope'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':scope': scope
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return (result.Items || []) as PositionLimit[];
  },

  /**
   * Find position limits by asset ID for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @returns List of position limits for the asset
   */
  async findLimitsByAsset(tenantId: string, assetId: string): Promise<PositionLimit[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.POSITION_LIMITS,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#assetId = :assetId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.POSITION_LIMITS.partitionKey,
        '#assetId': 'assetId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':assetId': assetId
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return (result.Items || []) as PositionLimit[];
  },

  /**
   * Find position limits by strategy ID for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns List of position limits for the strategy
   */
  async findLimitsByStrategy(tenantId: string, strategyId: string): Promise<PositionLimit[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.POSITION_LIMITS,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#strategyId = :strategyId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.POSITION_LIMITS.partitionKey,
        '#strategyId': 'strategyId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':strategyId': strategyId
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return (result.Items || []) as PositionLimit[];
  },

  /**
   * Save a position limit, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier (must match limit.tenantId)
   * @param limit - The position limit to save
   * @throws TenantAccessDeniedError if tenantId doesn't match limit.tenantId
   */
  async putLimit(tenantId: string, limit: PositionLimit): Promise<void> {
    // Verify the limit belongs to the tenant
    if (limit.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'position-limit');
    }

    await documentClient.put({
      TableName: TableNames.POSITION_LIMITS,
      Item: limit
    }).promise();
  },

  /**
   * Delete a position limit, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param limitId - The unique identifier of the position limit to delete
   * @throws ResourceNotFoundError if position limit doesn't exist
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async deleteLimit(tenantId: string, limitId: string): Promise<void> {
    // First verify the limit exists and belongs to this tenant
    const existing = await this.getLimit(tenantId, limitId);
    if (!existing) {
      throw new ResourceNotFoundError('PositionLimit', limitId);
    }

    await documentClient.delete({
      TableName: TableNames.POSITION_LIMITS,
      Key: {
        [KeySchemas.POSITION_LIMITS.partitionKey]: tenantId,
        [KeySchemas.POSITION_LIMITS.sortKey]: limitId
      }
    }).promise();
  },

  /**
   * Update a position limit's current value
   * 
   * @param tenantId - The tenant identifier
   * @param limitId - The unique identifier of the position limit
   * @param currentValue - The new current value
   * @param portfolioValue - Optional portfolio value for percentage calculation
   * @returns The updated position limit
   * @throws ResourceNotFoundError if position limit doesn't exist
   */
  async updateCurrentValue(
    tenantId: string,
    limitId: string,
    currentValue: number,
    portfolioValue?: number
  ): Promise<PositionLimit> {
    const existing = await this.getLimit(tenantId, limitId);
    if (!existing) {
      throw new ResourceNotFoundError('PositionLimit', limitId);
    }

    const now = new Date().toISOString();
    
    // Calculate utilization based on limit type
    let utilizationPercent: number;
    if (existing.limitType === 'PERCENTAGE' && portfolioValue && portfolioValue > 0) {
      // For percentage limits, utilization is current value as % of portfolio vs max %
      const currentPercent = (currentValue / portfolioValue) * 100;
      utilizationPercent = (currentPercent / existing.maxValue) * 100;
    } else {
      // For absolute limits, utilization is current value vs max value
      utilizationPercent = existing.maxValue > 0 
        ? (currentValue / existing.maxValue) * 100 
        : 0;
    }

    const updatedLimit: PositionLimit = {
      ...existing,
      currentValue,
      utilizationPercent: Math.min(utilizationPercent, 100),
      updatedAt: now
    };

    await this.putLimit(tenantId, updatedLimit);
    return updatedLimit;
  },

  /**
   * Check if a position limit exists for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param limitId - The unique identifier of the position limit
   * @returns True if the position limit exists, false otherwise
   */
  async limitExists(tenantId: string, limitId: string): Promise<boolean> {
    const limit = await this.getLimit(tenantId, limitId);
    return limit !== null;
  },

  /**
   * Find applicable limits for an order (asset, strategy, and portfolio limits)
   * 
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param strategyId - The strategy identifier
   * @returns All applicable position limits
   */
  async findApplicableLimits(
    tenantId: string,
    assetId: string,
    strategyId: string
  ): Promise<PositionLimit[]> {
    // Get all limits for the tenant
    const allLimits = await this.listLimits({ tenantId });
    
    // Filter to applicable limits
    return allLimits.items.filter(limit => {
      switch (limit.scope) {
        case 'ASSET':
          return limit.assetId === assetId;
        case 'STRATEGY':
          return limit.strategyId === strategyId;
        case 'PORTFOLIO':
          return true; // Portfolio limits always apply
        default:
          return false;
      }
    });
  }
};
