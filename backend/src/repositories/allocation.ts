import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { FundAllocation, ModelAllocation } from '../types/allocation';
import { ResourceNotFoundError, TenantAccessDeniedError, PaginatedResult } from '../db/access';
import { generateUUID } from '../utils/uuid';

/**
 * Input for creating a new fund allocation
 */
export interface CreateAllocationInput {
  strategyId: string;
  allocations: ModelAllocation[];
  ensembleMode: boolean;
  createdBy: string;
}

/**
 * Query parameters for listing allocations
 */
export interface AllocationQueryParams {
  tenantId: string;
  strategyId?: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Creates a composite sort key for versioned allocations
 * Format: strategyId#version (zero-padded for proper sorting)
 */
function createSortKey(strategyId: string, version: number): string {
  return `${strategyId}#${version.toString().padStart(10, '0')}`;
}

/**
 * Parses a composite sort key back to strategyId and version
 */
function parseSortKey(sortKey: string): { strategyId: string; version: number } {
  const lastHashIndex = sortKey.lastIndexOf('#');
  return {
    strategyId: sortKey.substring(0, lastHashIndex),
    version: parseInt(sortKey.substring(lastHashIndex + 1), 10)
  };
}

/**
 * Fund Allocation Repository - manages versioned fund allocation persistence
 * 
 * Allocations are stored with tenantId as partition key and strategyId#version as sort key.
 * This enables efficient querying of all versions for a strategy and retrieval of specific versions.
 * 
 * Requirements: 5.3
 */
export const AllocationRepository = {
  /**
   * Get a specific version of a fund allocation
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param version - The version number
   * @returns The fund allocation, or null if not found
   */
  async getAllocation(
    tenantId: string,
    strategyId: string,
    version: number
  ): Promise<FundAllocation | null> {
    const sortKey = createSortKey(strategyId, version);
    
    const result = await documentClient.get({
      TableName: TableNames.ALLOCATIONS,
      Key: {
        [KeySchemas.ALLOCATIONS.partitionKey]: tenantId,
        [KeySchemas.ALLOCATIONS.sortKey]: sortKey
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Verify tenant ownership (defense in depth)
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'fund allocation');
    }

    return result.Item as FundAllocation;
  },

  /**
   * Get the latest version of a fund allocation for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The latest fund allocation, or null if none exists
   */
  async getLatestAllocation(
    tenantId: string,
    strategyId: string
  ): Promise<FundAllocation | null> {
    const result = await documentClient.query({
      TableName: TableNames.ALLOCATIONS,
      KeyConditionExpression: '#pk = :tenantId AND begins_with(#sk, :strategyPrefix)',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.ALLOCATIONS.partitionKey,
        '#sk': KeySchemas.ALLOCATIONS.sortKey
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':strategyPrefix': `${strategyId}#`
      },
      ScanIndexForward: false, // Descending order to get latest version first
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as FundAllocation;
  },

  /**
   * Create a new fund allocation (version 1)
   * 
   * @param tenantId - The tenant identifier
   * @param input - The allocation input
   * @returns The created fund allocation
   */
  async createAllocation(
    tenantId: string,
    input: CreateAllocationInput
  ): Promise<FundAllocation> {
    const now = new Date().toISOString();
    const allocationId = generateUUID();
    const version = 1;
    const sortKey = createSortKey(input.strategyId, version);
    
    const allocation: FundAllocation = {
      allocationId,
      tenantId,
      strategyId: input.strategyId,
      version,
      allocations: input.allocations,
      ensembleMode: input.ensembleMode,
      createdAt: now,
      createdBy: input.createdBy
    };

    // Store with composite sort key for versioning
    const item = {
      ...allocation,
      [KeySchemas.ALLOCATIONS.sortKey]: sortKey
    };

    await documentClient.put({
      TableName: TableNames.ALLOCATIONS,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#pk)',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.ALLOCATIONS.partitionKey
      }
    }).promise();

    return allocation;
  },

  /**
   * Create a new version of a fund allocation
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param allocations - The new model allocations
   * @param ensembleMode - Whether ensemble mode is enabled
   * @param createdBy - The user creating the new version
   * @returns The new fund allocation version
   * @throws ResourceNotFoundError if no existing allocation exists
   */
  async createNewVersion(
    tenantId: string,
    strategyId: string,
    allocations: ModelAllocation[],
    ensembleMode: boolean,
    createdBy: string
  ): Promise<FundAllocation> {
    // Get the latest version to determine next version number
    const latest = await this.getLatestAllocation(tenantId, strategyId);
    
    if (!latest) {
      throw new ResourceNotFoundError('FundAllocation', strategyId);
    }

    const now = new Date().toISOString();
    const allocationId = generateUUID();
    const newVersion = latest.version + 1;
    const sortKey = createSortKey(strategyId, newVersion);
    
    const allocation: FundAllocation = {
      allocationId,
      tenantId,
      strategyId,
      version: newVersion,
      allocations,
      ensembleMode,
      createdAt: now,
      createdBy
    };

    // Store with composite sort key for versioning
    const item = {
      ...allocation,
      [KeySchemas.ALLOCATIONS.sortKey]: sortKey
    };

    await documentClient.put({
      TableName: TableNames.ALLOCATIONS,
      Item: item
    }).promise();

    return allocation;
  },

  /**
   * Get all versions of a fund allocation for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns List of all allocation versions, ordered by version ascending
   */
  async getAllocationHistory(
    tenantId: string,
    strategyId: string
  ): Promise<FundAllocation[]> {
    const result = await documentClient.query({
      TableName: TableNames.ALLOCATIONS,
      KeyConditionExpression: '#pk = :tenantId AND begins_with(#sk, :strategyPrefix)',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.ALLOCATIONS.partitionKey,
        '#sk': KeySchemas.ALLOCATIONS.sortKey
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':strategyPrefix': `${strategyId}#`
      },
      ScanIndexForward: true // Ascending order by version
    }).promise();

    return (result.Items || []) as FundAllocation[];
  },

  /**
   * List all allocations for a tenant
   * 
   * @param params - Query parameters
   * @returns Paginated list of fund allocations
   */
  async listAllocations(
    params: AllocationQueryParams
  ): Promise<PaginatedResult<FundAllocation>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.ALLOCATIONS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.ALLOCATIONS.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': params.tenantId
      }
    };

    // Filter by strategyId if specified
    if (params.strategyId) {
      queryParams.KeyConditionExpression += ' AND begins_with(#sk, :strategyPrefix)';
      queryParams.ExpressionAttributeNames!['#sk'] = KeySchemas.ALLOCATIONS.sortKey;
      queryParams.ExpressionAttributeValues![':strategyPrefix'] = `${params.strategyId}#`;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as FundAllocation[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Delete all versions of a fund allocation for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   */
  async deleteAllocation(
    tenantId: string,
    strategyId: string
  ): Promise<void> {
    // Get all versions
    const history = await this.getAllocationHistory(tenantId, strategyId);
    
    if (history.length === 0) {
      throw new ResourceNotFoundError('FundAllocation', strategyId);
    }

    // Delete all versions
    for (const allocation of history) {
      const sortKey = createSortKey(strategyId, allocation.version);
      await documentClient.delete({
        TableName: TableNames.ALLOCATIONS,
        Key: {
          [KeySchemas.ALLOCATIONS.partitionKey]: tenantId,
          [KeySchemas.ALLOCATIONS.sortKey]: sortKey
        }
      }).promise();
    }
  },

  /**
   * Check if an allocation exists for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns True if an allocation exists
   */
  async allocationExists(
    tenantId: string,
    strategyId: string
  ): Promise<boolean> {
    const latest = await this.getLatestAllocation(tenantId, strategyId);
    return latest !== null;
  },

  /**
   * Get the next version number for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The next version number (1 if no allocation exists)
   */
  async getNextVersion(
    tenantId: string,
    strategyId: string
  ): Promise<number> {
    const latest = await this.getLatestAllocation(tenantId, strategyId);
    return latest ? latest.version + 1 : 1;
  }
};
