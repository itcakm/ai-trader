import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { AIProvider, ProviderType, ProviderStatus } from '../types/provider';
import { ResourceNotFoundError, PaginatedResult } from '../db/access';

/**
 * Query parameters for listing providers
 */
export interface ProviderQueryParams {
  type?: ProviderType;
  status?: ProviderStatus;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Input for creating a new provider
 */
export interface CreateProviderInput {
  providerId: string;
  type: ProviderType;
  name: string;
  apiEndpoint: string;
  authMethod: 'API_KEY' | 'OAUTH' | 'IAM';
  supportedModels: string[];
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay: number;
  };
}

/**
 * Provider Repository - manages AI provider persistence and retrieval
 * 
 * Providers are stored with providerId as partition key.
 * Supports querying by type and status via GSIs.
 * 
 * Requirements: 1.1, 1.2
 */
export const ProviderRepository = {
  /**
   * Get a provider by ID
   * 
   * @param providerId - The unique identifier of the provider
   * @returns The provider, or null if not found
   */
  async getProvider(providerId: string): Promise<AIProvider | null> {
    const result = await documentClient.get({
      TableName: TableNames.PROVIDERS,
      Key: {
        [KeySchemas.PROVIDERS.partitionKey]: providerId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return result.Item as AIProvider;
  },

  /**
   * Create a new provider
   * 
   * @param input - The provider creation input
   * @returns The created provider
   */
  async createProvider(input: CreateProviderInput): Promise<AIProvider> {
    const now = new Date().toISOString();
    
    const provider: AIProvider = {
      ...input,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };

    await documentClient.put({
      TableName: TableNames.PROVIDERS,
      Item: provider,
      ConditionExpression: 'attribute_not_exists(providerId)'
    }).promise();

    return provider;
  },

  /**
   * Update an existing provider
   * 
   * @param providerId - The unique identifier of the provider
   * @param updates - Partial provider updates
   * @returns The updated provider
   * @throws ResourceNotFoundError if provider doesn't exist
   */
  async updateProvider(
    providerId: string,
    updates: Partial<Omit<AIProvider, 'providerId' | 'createdAt'>>
  ): Promise<AIProvider> {
    const existing = await this.getProvider(providerId);
    if (!existing) {
      throw new ResourceNotFoundError('Provider', providerId);
    }

    const now = new Date().toISOString();
    
    const updatedProvider: AIProvider = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await documentClient.put({
      TableName: TableNames.PROVIDERS,
      Item: updatedProvider
    }).promise();

    return updatedProvider;
  },

  /**
   * Delete a provider
   * 
   * @param providerId - The unique identifier of the provider to delete
   * @throws ResourceNotFoundError if provider doesn't exist
   */
  async deleteProvider(providerId: string): Promise<void> {
    const existing = await this.getProvider(providerId);
    if (!existing) {
      throw new ResourceNotFoundError('Provider', providerId);
    }

    await documentClient.delete({
      TableName: TableNames.PROVIDERS,
      Key: {
        [KeySchemas.PROVIDERS.partitionKey]: providerId
      }
    }).promise();
  },

  /**
   * List all providers with optional filtering
   * 
   * @param params - Query parameters including optional type/status filters
   * @returns Paginated list of providers
   */
  async listProviders(params: ProviderQueryParams = {}): Promise<PaginatedResult<AIProvider>> {
    // If filtering by type, use the type GSI
    if (params.type) {
      return this.listProvidersByType(params.type, params);
    }

    // If filtering by status, use the status GSI
    if (params.status) {
      return this.listProvidersByStatus(params.status, params);
    }

    // Otherwise, scan all providers
    const scanParams: DynamoDB.DocumentClient.ScanInput = {
      TableName: TableNames.PROVIDERS
    };

    if (params.limit) {
      scanParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      scanParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.scan(scanParams).promise();

    return {
      items: (result.Items || []) as AIProvider[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List providers by type using GSI
   */
  async listProvidersByType(
    type: ProviderType,
    params: Omit<ProviderQueryParams, 'type'> = {}
  ): Promise<PaginatedResult<AIProvider>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.PROVIDERS,
      IndexName: GSINames.PROVIDERS.TYPE_INDEX,
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':type': type
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
      items: (result.Items || []) as AIProvider[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List providers by status using GSI
   */
  async listProvidersByStatus(
    status: ProviderStatus,
    params: Omit<ProviderQueryParams, 'status'> = {}
  ): Promise<PaginatedResult<AIProvider>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.PROVIDERS,
      IndexName: GSINames.PROVIDERS.STATUS_INDEX,
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status
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
      items: (result.Items || []) as AIProvider[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Update provider status
   * 
   * @param providerId - The unique identifier of the provider
   * @param status - The new status
   * @returns The updated provider
   */
  async updateProviderStatus(providerId: string, status: ProviderStatus): Promise<AIProvider> {
    return this.updateProvider(providerId, { status });
  },

  /**
   * Check if a provider exists
   * 
   * @param providerId - The unique identifier of the provider
   * @returns True if the provider exists, false otherwise
   */
  async providerExists(providerId: string): Promise<boolean> {
    const provider = await this.getProvider(providerId);
    return provider !== null;
  },

  /**
   * Get all active providers
   * 
   * @returns List of active providers
   */
  async getActiveProviders(): Promise<AIProvider[]> {
    const result = await this.listProvidersByStatus('ACTIVE');
    return result.items;
  }
};
