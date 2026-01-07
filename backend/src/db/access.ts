import { DynamoDB } from 'aws-sdk';
import { documentClient } from './client';
import { TableNames, KeySchemas } from './tables';

/**
 * Error thrown when a tenant attempts to access resources belonging to another tenant
 */
export class TenantAccessDeniedError extends Error {
  public readonly attemptedTenantId: string;
  public readonly resourceType: string;
  public readonly resourceTenantId?: string;

  constructor(tenantId: string, resourceType: string, resourceTenantId?: string) {
    super(`Access denied: tenant '${tenantId}' cannot access this ${resourceType}`);
    this.name = 'TenantAccessDeniedError';
    this.attemptedTenantId = tenantId;
    this.resourceType = resourceType;
    this.resourceTenantId = resourceTenantId;
  }
}

/**
 * Error thrown when a requested resource is not found
 */
export class ResourceNotFoundError extends Error {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`);
    this.name = 'ResourceNotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
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
 * Context for tenant-scoped operations
 * Requirements: 5.1, 5.2
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  isSuperAdmin: boolean;
}

/**
 * Options for tenant-scoped data access
 */
export interface TenantAccessOptions {
  /** Allow cross-tenant access (only for SUPER_ADMIN) */
  allowCrossTenant?: boolean;
  /** Target tenant ID for cross-tenant access */
  targetTenantId?: string;
}

/**
 * Tenant-scoped data access helper for strategies
 * Ensures all queries include tenantId in partition key for isolation
 * @deprecated Use TenantAccess.strategies with TenantContext instead
 */
export const StrategyAccess = {
  /**
   * Get a strategy by ID, ensuring tenant isolation
   * @deprecated Use TenantAccess.strategies.get() with TenantContext
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
      throw new TenantAccessDeniedError(tenantId, 'strategy', result.Item.tenantId);
    }

    return result.Item as T;
  },

  /**
   * List all strategies for a tenant
   * @deprecated Use TenantAccess.strategies.list() with TenantContext
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
   * @deprecated Use TenantAccess.strategies.put() with TenantContext
   */
  async putStrategy<T extends TenantScopedItem>(
    tenantId: string,
    item: T
  ): Promise<void> {
    // Verify the item belongs to the tenant
    if (item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'strategy', item.tenantId);
    }

    await documentClient.put({
      TableName: TableNames.STRATEGIES,
      Item: item
    }).promise();
  },

  /**
   * Delete a strategy, ensuring tenant isolation
   * @deprecated Use TenantAccess.strategies.delete() with TenantContext
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
 * @deprecated Use TenantAccess.deployments with TenantContext instead
 */
export const DeploymentAccess = {
  /**
   * Get a deployment by ID, ensuring tenant isolation
   * @deprecated Use TenantAccess.deployments.get() with TenantContext
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
      throw new TenantAccessDeniedError(tenantId, 'deployment', result.Item.tenantId);
    }

    return result.Item as T;
  },

  /**
   * List all deployments for a tenant
   * @deprecated Use TenantAccess.deployments.list() with TenantContext
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
   * @deprecated Use TenantAccess.deployments.put() with TenantContext
   */
  async putDeployment<T extends TenantScopedItem>(
    tenantId: string,
    item: T
  ): Promise<void> {
    // Verify the item belongs to the tenant
    if (item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'deployment', item.tenantId);
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

/**
 * Resolves the effective tenant ID for an operation
 * Requirements: 5.2, 5.7
 * 
 * @param context - The tenant context from JWT
 * @param options - Access options including cross-tenant settings
 * @returns The effective tenant ID to use for the operation
 * @throws TenantAccessDeniedError if cross-tenant access is attempted without SUPER_ADMIN
 */
export function resolveEffectiveTenantId(
  context: TenantContext,
  options?: TenantAccessOptions
): string {
  // If cross-tenant access is requested
  if (options?.allowCrossTenant && options?.targetTenantId) {
    // Only SUPER_ADMIN can access other tenants
    if (!context.isSuperAdmin) {
      throw new TenantAccessDeniedError(
        context.tenantId,
        'cross-tenant resource',
        options.targetTenantId
      );
    }
    return options.targetTenantId;
  }
  
  return context.tenantId;
}

/**
 * Validates that a resource belongs to the expected tenant
 * Requirements: 5.3
 * 
 * @param item - The item to validate
 * @param expectedTenantId - The expected tenant ID
 * @param resourceType - The type of resource (for error messages)
 * @throws TenantAccessDeniedError if tenant IDs don't match
 */
export function validateTenantOwnership<T extends TenantScopedItem>(
  item: T,
  expectedTenantId: string,
  resourceType: string
): void {
  if (item.tenantId !== expectedTenantId) {
    throw new TenantAccessDeniedError(expectedTenantId, resourceType, item.tenantId);
  }
}

/**
 * Injects tenant ID into an item for creation
 * Requirements: 5.6
 * 
 * @param item - The item to inject tenant ID into
 * @param tenantId - The tenant ID to inject
 * @returns The item with tenant ID set
 */
export function injectTenantId<T extends Partial<TenantScopedItem>>(
  item: T,
  tenantId: string
): T & TenantScopedItem {
  return {
    ...item,
    tenantId
  };
}

/**
 * Generic tenant-scoped data access helper
 * Provides CRUD operations with automatic tenant isolation
 * Requirements: 5.2, 5.3
 */
export class TenantScopedAccess<T extends TenantScopedItem> {
  constructor(
    private readonly tableName: string,
    private readonly keySchema: { partitionKey: string; sortKey: string },
    private readonly resourceType: string
  ) {}

  /**
   * Get a resource by ID with tenant isolation
   * Requirements: 5.2, 5.3
   */
  async get(
    context: TenantContext,
    resourceId: string,
    options?: TenantAccessOptions
  ): Promise<T | null> {
    const effectiveTenantId = resolveEffectiveTenantId(context, options);

    const result = await documentClient.get({
      TableName: this.tableName,
      Key: {
        [this.keySchema.partitionKey]: effectiveTenantId,
        [this.keySchema.sortKey]: resourceId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership even though partition key should ensure it
    const item = result.Item as T;
    validateTenantOwnership(item, effectiveTenantId, this.resourceType);

    return item;
  }

  /**
   * List all resources for a tenant
   * Requirements: 5.2
   */
  async list(
    context: TenantContext,
    options?: TenantAccessOptions & { limit?: number; exclusiveStartKey?: DynamoDB.DocumentClient.Key }
  ): Promise<PaginatedResult<T>> {
    const effectiveTenantId = resolveEffectiveTenantId(context, options);

    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: this.tableName,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': this.keySchema.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': effectiveTenantId
      }
    };

    if (options?.limit) {
      queryParams.Limit = options.limit;
    }

    if (options?.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = options.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as T[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  }

  /**
   * Create or update a resource with tenant isolation
   * Requirements: 5.2, 5.6
   */
  async put(
    context: TenantContext,
    item: Omit<T, 'tenantId'> & Partial<TenantScopedItem>,
    options?: TenantAccessOptions
  ): Promise<T> {
    const effectiveTenantId = resolveEffectiveTenantId(context, options);

    // Auto-inject tenant ID
    const itemWithTenant = injectTenantId(item, effectiveTenantId) as T;

    await documentClient.put({
      TableName: this.tableName,
      Item: itemWithTenant
    }).promise();

    return itemWithTenant;
  }

  /**
   * Update a resource with tenant isolation
   * Requirements: 5.2, 5.3
   */
  async update(
    context: TenantContext,
    resourceId: string,
    updates: Partial<Omit<T, 'tenantId'>>,
    options?: TenantAccessOptions
  ): Promise<T> {
    const effectiveTenantId = resolveEffectiveTenantId(context, options);

    // First verify the resource exists and belongs to the tenant
    const existing = await this.get(context, resourceId, options);
    if (!existing) {
      throw new ResourceNotFoundError(this.resourceType, resourceId);
    }

    // Build update expression
    const updateExpressionParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(updates).forEach(([key, value], index) => {
      if (key !== 'tenantId') { // Never allow updating tenantId
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressionParts.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      }
    });

    if (updateExpressionParts.length === 0) {
      return existing;
    }

    const result = await documentClient.update({
      TableName: this.tableName,
      Key: {
        [this.keySchema.partitionKey]: effectiveTenantId,
        [this.keySchema.sortKey]: resourceId
      },
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }).promise();

    return result.Attributes as T;
  }

  /**
   * Delete a resource with tenant isolation
   * Requirements: 5.2, 5.3
   */
  async delete(
    context: TenantContext,
    resourceId: string,
    options?: TenantAccessOptions
  ): Promise<void> {
    const effectiveTenantId = resolveEffectiveTenantId(context, options);

    // First verify the resource exists and belongs to the tenant
    const existing = await this.get(context, resourceId, options);
    if (!existing) {
      throw new ResourceNotFoundError(this.resourceType, resourceId);
    }

    await documentClient.delete({
      TableName: this.tableName,
      Key: {
        [this.keySchema.partitionKey]: effectiveTenantId,
        [this.keySchema.sortKey]: resourceId
      }
    }).promise();
  }
}

/**
 * Pre-configured tenant-scoped access instances for common tables
 */
export const TenantAccess = {
  strategies: new TenantScopedAccess<TenantScopedItem & { strategyId: string }>(
    TableNames.STRATEGIES,
    KeySchemas.STRATEGIES,
    'strategy'
  ),
  deployments: new TenantScopedAccess<TenantScopedItem & { deploymentId: string }>(
    TableNames.DEPLOYMENTS,
    KeySchemas.DEPLOYMENTS,
    'deployment'
  ),
  streams: new TenantScopedAccess<TenantScopedItem & { streamId: string }>(
    TableNames.STREAMS,
    KeySchemas.STREAMS,
    'stream'
  ),
  modelConfigurations: new TenantScopedAccess<TenantScopedItem & { configId: string }>(
    TableNames.MODEL_CONFIGURATIONS,
    KeySchemas.MODEL_CONFIGURATIONS,
    'model configuration'
  ),
  positionLimits: new TenantScopedAccess<TenantScopedItem & { limitId: string }>(
    TableNames.POSITION_LIMITS,
    KeySchemas.POSITION_LIMITS,
    'position limit'
  ),
  circuitBreakers: new TenantScopedAccess<TenantScopedItem & { breakerId: string }>(
    TableNames.CIRCUIT_BREAKERS,
    KeySchemas.CIRCUIT_BREAKERS,
    'circuit breaker'
  ),
};
