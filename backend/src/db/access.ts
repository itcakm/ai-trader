import { DynamoDB } from 'aws-sdk';
import { documentClient } from './client';
import { TableNames, KeySchemas } from './tables';

/**
 * Error thrown when a tenant attempts to access resources belonging to another tenant
 */
export class TenantAccessDeniedError extends Error {
  constructor(tenantId: string, resourceType: string) {
    super(`Access denied: tenant '${tenantId}' cannot access this ${resourceType}`);
    this.name = 'TenantAccessDeniedError';
  }
}

/**
 * Error thrown when a requested resource is not found
 */
export class ResourceNotFoundError extends Error {
  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`);
    this.name = 'ResourceNotFoundError';
  }
}

/**
 * Base interface for tenant-scoped items
 */
export interface TenantScopedItem {
  tenantId: string;
}

/**
 * Query parameters for tenant-scoped queries
 */
export interface TenantQueryParams {
  tenantId: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Result of a paginated query
 */
export interface PaginatedResult<T> {
  items: T[];
  lastEvaluatedKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Tenant-scoped data access helper for strategies
 * Ensures all queries include tenantId in partition key for isolation
 */
export const StrategyAccess = {
  /**
   * Get a strategy by ID, ensuring tenant isolation
   */
  async getStrategy<T extends TenantScopedItem>(
    tenantId: string,
    strategyId: string
  ): Promise<T | null> {
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

    // Verify tenant ownership (defense in depth)
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'strategy');
    }

    return result.Item as T;
  },

  /**
   * List all strategies for a tenant
   */
  async listStrategies<T extends TenantScopedItem>(
    params: TenantQueryParams
  ): Promise<PaginatedResult<T>> {
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
      items: (result.Items || []) as T[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Put a strategy, ensuring tenant isolation
   */
  async putStrategy<T extends TenantScopedItem>(
    tenantId: string,
    item: T
  ): Promise<void> {
    // Verify the item belongs to the tenant
    if (item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'strategy');
    }

    await documentClient.put({
      TableName: TableNames.STRATEGIES,
      Item: item
    }).promise();
  },

  /**
   * Delete a strategy, ensuring tenant isolation
   */
  async deleteStrategy(
    tenantId: string,
    strategyId: string
  ): Promise<void> {
    // First verify the strategy belongs to this tenant
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
  }
};

/**
 * Tenant-scoped data access helper for deployments
 */
export const DeploymentAccess = {
  /**
   * Get a deployment by ID, ensuring tenant isolation
   */
  async getDeployment<T extends TenantScopedItem>(
    tenantId: string,
    deploymentId: string
  ): Promise<T | null> {
    const result = await documentClient.get({
      TableName: TableNames.DEPLOYMENTS,
      Key: {
        [KeySchemas.DEPLOYMENTS.partitionKey]: tenantId,
        [KeySchemas.DEPLOYMENTS.sortKey]: deploymentId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Verify tenant ownership (defense in depth)
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'deployment');
    }

    return result.Item as T;
  },

  /**
   * List all deployments for a tenant
   */
  async listDeployments<T extends TenantScopedItem>(
    params: TenantQueryParams
  ): Promise<PaginatedResult<T>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DEPLOYMENTS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DEPLOYMENTS.partitionKey
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
      items: (result.Items || []) as T[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Put a deployment, ensuring tenant isolation
   */
  async putDeployment<T extends TenantScopedItem>(
    tenantId: string,
    item: T
  ): Promise<void> {
    // Verify the item belongs to the tenant
    if (item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'deployment');
    }

    await documentClient.put({
      TableName: TableNames.DEPLOYMENTS,
      Item: item
    }).promise();
  }
};

/**
 * Validates that a tenantId matches the expected format
 */
export function isValidTenantId(tenantId: string): boolean {
  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(tenantId);
}

/**
 * Creates a tenant-scoped key for DynamoDB operations
 */
export function createTenantScopedKey(
  tenantId: string,
  resourceId: string,
  keySchema: { partitionKey: string; sortKey: string }
): DynamoDB.DocumentClient.Key {
  return {
    [keySchema.partitionKey]: tenantId,
    [keySchema.sortKey]: resourceId
  };
}
