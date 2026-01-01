/**
 * Exchange Repository
 *
 * Manages persistence of exchange configurations in DynamoDB.
 * Provides tenant-isolated access to exchange data.
 *
 * Requirements: 1.2
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { ExchangeId, ExchangeConfig } from '../types/exchange';
import { TenantAccessDeniedError, ResourceNotFoundError } from '../db/access';

/**
 * Table name for exchange configurations
 */
const TABLE_NAME = process.env.EXCHANGE_CONFIGS_TABLE || 'exchange-configs';

/**
 * Key schema for exchange configs table
 * - Partition Key: tenantId (for tenant isolation)
 * - Sort Key: exchangeId
 */
const KEY_SCHEMA = {
  partitionKey: 'tenantId',
  sortKey: 'exchangeId',
};

/**
 * Exchange Repository - manages exchange configuration persistence
 */
export const ExchangeRepository = {
  /**
   * Get an exchange configuration by tenant and exchange ID
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns The exchange configuration, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getExchange(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<ExchangeConfig | null> {
    const result = await documentClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
          [KEY_SCHEMA.sortKey]: exchangeId,
        },
      })
      .promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'exchange');
    }

    return result.Item as ExchangeConfig;
  },

  /**
   * Save an exchange configuration
   *
   * @param tenantId - The tenant identifier (must match config.tenantId)
   * @param config - The exchange configuration to save
   * @throws TenantAccessDeniedError if tenantId doesn't match config.tenantId
   */
  async putExchange(tenantId: string, config: ExchangeConfig): Promise<void> {
    // Verify the config belongs to the tenant
    if (config.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'exchange');
    }

    await documentClient
      .put({
        TableName: TABLE_NAME,
        Item: config,
      })
      .promise();
  },

  /**
   * List all exchange configurations for a tenant
   *
   * @param tenantId - The tenant identifier
   * @returns List of exchange configurations
   */
  async listExchanges(tenantId: string): Promise<ExchangeConfig[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KEY_SCHEMA.partitionKey,
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
      },
    };

    const result = await documentClient.query(queryParams).promise();

    return (result.Items || []) as ExchangeConfig[];
  },

  /**
   * Delete an exchange configuration
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @throws ResourceNotFoundError if exchange doesn't exist
   */
  async deleteExchange(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<void> {
    // First verify the exchange exists and belongs to this tenant
    const existing = await this.getExchange(tenantId, exchangeId);
    if (!existing) {
      throw new ResourceNotFoundError('Exchange', exchangeId);
    }

    await documentClient
      .delete({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
          [KEY_SCHEMA.sortKey]: exchangeId,
        },
      })
      .promise();
  },

  /**
   * Update specific fields of an exchange configuration
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param updates - Fields to update
   * @returns The updated exchange configuration
   * @throws ResourceNotFoundError if exchange doesn't exist
   */
  async updateExchange(
    tenantId: string,
    exchangeId: ExchangeId,
    updates: Partial<Omit<ExchangeConfig, 'exchangeId' | 'tenantId' | 'createdAt'>>
  ): Promise<ExchangeConfig> {
    // Get existing config
    const existing = await this.getExchange(tenantId, exchangeId);
    if (!existing) {
      throw new ResourceNotFoundError('Exchange', exchangeId);
    }

    const now = new Date().toISOString();

    // Merge updates with existing config
    const updatedConfig: ExchangeConfig = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.putExchange(tenantId, updatedConfig);

    return updatedConfig;
  },

  /**
   * Check if an exchange exists for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns True if the exchange exists
   */
  async exchangeExists(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<boolean> {
    const config = await this.getExchange(tenantId, exchangeId);
    return config !== null;
  },

  /**
   * Get exchanges by status
   *
   * @param tenantId - The tenant identifier
   * @param status - The status to filter by
   * @returns List of exchange configurations with the specified status
   */
  async getExchangesByStatus(
    tenantId: string,
    status: ExchangeConfig['status']
  ): Promise<ExchangeConfig[]> {
    const exchanges = await this.listExchanges(tenantId);
    return exchanges.filter((e) => e.status === status);
  },
};
