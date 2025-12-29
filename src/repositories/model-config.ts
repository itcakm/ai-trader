import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { ModelConfiguration, ModelConfigurationInput } from '../types/model-config';
import { ResourceNotFoundError, TenantAccessDeniedError, PaginatedResult } from '../db/access';
import { generateUUID } from '../utils/uuid';

/**
 * Query parameters for listing model configurations
 */
export interface ModelConfigQueryParams {
  tenantId: string;
  providerId?: string;
  enabled?: boolean;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Model Configuration Repository - manages AI model configuration persistence
 * 
 * Configurations are stored with tenantId as partition key and configId as sort key.
 * Supports querying by provider via GSI.
 * 
 * Requirements: 2.1, 2.4
 */
export const ModelConfigRepository = {
  /**
   * Get a model configuration by tenant and config ID
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The model configuration, or null if not found
   */
  async getConfiguration(tenantId: string, configId: string): Promise<ModelConfiguration | null> {
    const result = await documentClient.get({
      TableName: TableNames.MODEL_CONFIGURATIONS,
      Key: {
        [KeySchemas.MODEL_CONFIGURATIONS.partitionKey]: tenantId,
        [KeySchemas.MODEL_CONFIGURATIONS.sortKey]: configId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Verify tenant ownership (defense in depth)
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'model configuration');
    }

    return result.Item as ModelConfiguration;
  },

  /**
   * Create a new model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param input - The configuration input
   * @returns The created model configuration
   */
  async createConfiguration(tenantId: string, input: ModelConfigurationInput): Promise<ModelConfiguration> {
    const now = new Date().toISOString();
    const configId = generateUUID();
    
    const configuration: ModelConfiguration = {
      configId,
      tenantId,
      providerId: input.providerId,
      modelId: input.modelId,
      modelName: input.modelName,
      enabled: input.enabled ?? true,
      credentials: input.credentials,
      costLimits: input.costLimits,
      rateLimits: input.rateLimits,
      priority: input.priority ?? 5,
      createdAt: now,
      updatedAt: now
    };

    await documentClient.put({
      TableName: TableNames.MODEL_CONFIGURATIONS,
      Item: configuration,
      ConditionExpression: 'attribute_not_exists(configId)'
    }).promise();

    return configuration;
  },

  /**
   * Update an existing model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @param updates - Partial configuration updates
   * @returns The updated model configuration
   * @throws ResourceNotFoundError if configuration doesn't exist
   */
  async updateConfiguration(
    tenantId: string,
    configId: string,
    updates: Partial<Omit<ModelConfiguration, 'configId' | 'tenantId' | 'createdAt'>>
  ): Promise<ModelConfiguration> {
    const existing = await this.getConfiguration(tenantId, configId);
    if (!existing) {
      throw new ResourceNotFoundError('ModelConfiguration', configId);
    }

    const now = new Date().toISOString();
    
    const updatedConfiguration: ModelConfiguration = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await documentClient.put({
      TableName: TableNames.MODEL_CONFIGURATIONS,
      Item: updatedConfiguration
    }).promise();

    return updatedConfiguration;
  },

  /**
   * Delete a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @throws ResourceNotFoundError if configuration doesn't exist
   */
  async deleteConfiguration(tenantId: string, configId: string): Promise<void> {
    const existing = await this.getConfiguration(tenantId, configId);
    if (!existing) {
      throw new ResourceNotFoundError('ModelConfiguration', configId);
    }

    await documentClient.delete({
      TableName: TableNames.MODEL_CONFIGURATIONS,
      Key: {
        [KeySchemas.MODEL_CONFIGURATIONS.partitionKey]: tenantId,
        [KeySchemas.MODEL_CONFIGURATIONS.sortKey]: configId
      }
    }).promise();
  },

  /**
   * List all model configurations for a tenant
   * 
   * @param params - Query parameters including optional filters
   * @returns Paginated list of model configurations
   */
  async listConfigurations(params: ModelConfigQueryParams): Promise<PaginatedResult<ModelConfiguration>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.MODEL_CONFIGURATIONS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.MODEL_CONFIGURATIONS.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': params.tenantId
      }
    };

    // Add filter for enabled status if specified
    if (params.enabled !== undefined) {
      queryParams.FilterExpression = '#enabled = :enabled';
      queryParams.ExpressionAttributeNames!['#enabled'] = 'enabled';
      queryParams.ExpressionAttributeValues![':enabled'] = params.enabled;
    }

    // Add filter for providerId if specified
    if (params.providerId) {
      const filterExpr = params.enabled !== undefined 
        ? `${queryParams.FilterExpression} AND #providerId = :providerId`
        : '#providerId = :providerId';
      queryParams.FilterExpression = filterExpr;
      queryParams.ExpressionAttributeNames!['#providerId'] = 'providerId';
      queryParams.ExpressionAttributeValues![':providerId'] = params.providerId;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as ModelConfiguration[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List configurations by provider using GSI
   * 
   * @param providerId - The provider identifier
   * @param params - Additional query parameters
   * @returns Paginated list of model configurations
   */
  async listConfigurationsByProvider(
    providerId: string,
    params: Omit<ModelConfigQueryParams, 'providerId'> = { tenantId: '' }
  ): Promise<PaginatedResult<ModelConfiguration>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.MODEL_CONFIGURATIONS,
      IndexName: GSINames.MODEL_CONFIGURATIONS.PROVIDER_INDEX,
      KeyConditionExpression: '#providerId = :providerId',
      ExpressionAttributeNames: {
        '#providerId': 'providerId'
      },
      ExpressionAttributeValues: {
        ':providerId': providerId
      }
    };

    // Filter by tenantId if specified
    if (params.tenantId) {
      queryParams.FilterExpression = '#tenantId = :tenantId';
      queryParams.ExpressionAttributeNames!['#tenantId'] = 'tenantId';
      queryParams.ExpressionAttributeValues![':tenantId'] = params.tenantId;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as ModelConfiguration[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Enable a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The updated model configuration
   */
  async enableConfiguration(tenantId: string, configId: string): Promise<ModelConfiguration> {
    return this.updateConfiguration(tenantId, configId, { enabled: true });
  },

  /**
   * Disable a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns The updated model configuration
   */
  async disableConfiguration(tenantId: string, configId: string): Promise<ModelConfiguration> {
    return this.updateConfiguration(tenantId, configId, { enabled: false });
  },

  /**
   * Update cost limits for a model configuration
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @param costLimits - The new cost limits
   * @returns The updated model configuration
   */
  async updateCostLimits(
    tenantId: string,
    configId: string,
    costLimits: ModelConfiguration['costLimits']
  ): Promise<ModelConfiguration> {
    return this.updateConfiguration(tenantId, configId, { costLimits });
  },

  /**
   * Check if a configuration exists
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The configuration identifier
   * @returns True if the configuration exists, false otherwise
   */
  async configurationExists(tenantId: string, configId: string): Promise<boolean> {
    const config = await this.getConfiguration(tenantId, configId);
    return config !== null;
  },

  /**
   * Get all enabled configurations for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns List of enabled model configurations
   */
  async getEnabledConfigurations(tenantId: string): Promise<ModelConfiguration[]> {
    const result = await this.listConfigurations({ tenantId, enabled: true });
    return result.items;
  }
};
