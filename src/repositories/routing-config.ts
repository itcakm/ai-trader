/**
 * Routing Config Repository
 *
 * Manages persistence of routing configurations in DynamoDB.
 * Provides tenant-isolated access to routing configuration data.
 *
 * Requirements: 6.1
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TenantAccessDeniedError, ResourceNotFoundError } from '../db/access';
import { ExchangeId } from '../types/exchange';

/**
 * Routing criteria for order execution
 */
export type RoutingCriteria = 'BEST_PRICE' | 'LOWEST_FEES' | 'HIGHEST_LIQUIDITY' | 'USER_PREFERENCE';

/**
 * Exchange priority configuration
 */
export interface ExchangePriority {
  exchangeId: ExchangeId;
  priority: number;
  enabled: boolean;
}

/**
 * Routing configuration per tenant
 */
export interface RoutingConfig {
  configId: string;
  tenantId: string;
  defaultCriteria: RoutingCriteria;
  exchangePriorities: ExchangePriority[];
  enableOrderSplitting: boolean;
  maxSplitExchanges: number;
  minSplitSize: number;
}

/**
 * Table name for routing configurations
 */
const TABLE_NAME = process.env.ROUTING_CONFIGS_TABLE || 'routing-configs';

/**
 * Key schema for routing configs table
 * - Partition Key: tenantId (for tenant isolation)
 */
const KEY_SCHEMA = {
  partitionKey: 'tenantId',
};

/**
 * Routing Config Repository - manages routing configuration persistence
 */
export const RoutingConfigRepository = {
  /**
   * Get routing configuration for a tenant
   *
   * @param tenantId - The tenant identifier
   * @returns The routing configuration, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getRoutingConfig(tenantId: string): Promise<RoutingConfig | null> {
    const result = await documentClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
        },
      })
      .promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'routing-config');
    }

    return result.Item as RoutingConfig;
  },

  /**
   * Save a routing configuration
   *
   * @param tenantId - The tenant identifier (must match config.tenantId)
   * @param config - The routing configuration to save
   * @throws TenantAccessDeniedError if tenantId doesn't match config.tenantId
   */
  async putRoutingConfig(tenantId: string, config: RoutingConfig): Promise<void> {
    // Verify the config belongs to the tenant
    if (config.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'routing-config');
    }

    await documentClient
      .put({
        TableName: TABLE_NAME,
        Item: config,
      })
      .promise();
  },

  /**
   * Delete a routing configuration
   *
   * @param tenantId - The tenant identifier
   * @throws ResourceNotFoundError if config doesn't exist
   */
  async deleteRoutingConfig(tenantId: string): Promise<void> {
    // First verify the config exists
    const existing = await this.getRoutingConfig(tenantId);
    if (!existing) {
      throw new ResourceNotFoundError('RoutingConfig', tenantId);
    }

    await documentClient
      .delete({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
        },
      })
      .promise();
  },

  /**
   * Update specific fields of a routing configuration
   *
   * @param tenantId - The tenant identifier
   * @param updates - Fields to update
   * @returns The updated routing configuration
   * @throws ResourceNotFoundError if config doesn't exist
   */
  async updateRoutingConfig(
    tenantId: string,
    updates: Partial<Omit<RoutingConfig, 'configId' | 'tenantId'>>
  ): Promise<RoutingConfig> {
    // Get existing config
    const existing = await this.getRoutingConfig(tenantId);
    if (!existing) {
      throw new ResourceNotFoundError('RoutingConfig', tenantId);
    }

    // Merge updates with existing config
    const updatedConfig: RoutingConfig = {
      ...existing,
      ...updates,
    };

    await this.putRoutingConfig(tenantId, updatedConfig);

    return updatedConfig;
  },

  /**
   * Check if a routing configuration exists for a tenant
   *
   * @param tenantId - The tenant identifier
   * @returns True if the config exists
   */
  async routingConfigExists(tenantId: string): Promise<boolean> {
    const config = await this.getRoutingConfig(tenantId);
    return config !== null;
  },
};
