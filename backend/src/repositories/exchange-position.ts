/**
 * Exchange Position Repository
 *
 * Manages persistence of positions in DynamoDB.
 * Provides tenant-isolated access to position data with GSIs for efficient queries.
 *
 * Requirements: 7.1
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TenantAccessDeniedError, ResourceNotFoundError } from '../db/access';
import {
  Position,
  PositionHistory,
} from '../types/exchange-position';
import { ExchangeId } from '../types/exchange';

/**
 * Table name for positions
 */
const POSITIONS_TABLE = process.env.EXCHANGE_POSITIONS_TABLE || 'exchange-positions';

/**
 * Table name for position history
 */
const POSITION_HISTORY_TABLE = process.env.EXCHANGE_POSITION_HISTORY_TABLE || 'exchange-position-history';

/**
 * Key schema for positions table
 * - Partition Key: tenantId (for tenant isolation)
 * - Sort Key: assetId#exchangeId (composite for unique position identification)
 *
 * GSIs:
 * - exchangeId-index: For querying positions by exchange
 */
const POSITIONS_KEY_SCHEMA = {
  partitionKey: 'tenantId',
  sortKey: 'assetExchangeId', // Composite: assetId#exchangeId
};

/**
 * Key schema for position history table
 * - Partition Key: tenantId#assetId (composite for tenant isolation and asset grouping)
 * - Sort Key: timestamp#historyId (for time-based queries)
 */
const HISTORY_KEY_SCHEMA = {
  partitionKey: 'tenantAssetId', // Composite: tenantId#assetId
  sortKey: 'timestampHistoryId', // Composite: timestamp#historyId
};

/**
 * Create composite sort key for positions
 */
function createPositionSortKey(assetId: string, exchangeId: ExchangeId): string {
  return `${assetId}#${exchangeId}`;
}

/**
 * Parse composite sort key for positions
 */
function parsePositionSortKey(sortKey: string): { assetId: string; exchangeId: ExchangeId } {
  const [assetId, exchangeId] = sortKey.split('#');
  return { assetId, exchangeId: exchangeId as ExchangeId };
}

/**
 * Create composite partition key for history
 */
function createHistoryPartitionKey(tenantId: string, assetId: string): string {
  return `${tenantId}#${assetId}`;
}

/**
 * Create composite sort key for history
 */
function createHistorySortKey(timestamp: string, historyId: string): string {
  return `${timestamp}#${historyId}`;
}


/**
 * Exchange Position Repository - manages position persistence
 */
export const ExchangePositionRepository = {
  /**
   * Get a position by tenant, asset, and exchange
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeId - The exchange identifier
   * @returns The position, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getPosition(
    tenantId: string,
    assetId: string,
    exchangeId: ExchangeId
  ): Promise<Position | null> {
    const sortKey = createPositionSortKey(assetId, exchangeId);

    const result = await documentClient
      .get({
        TableName: POSITIONS_TABLE,
        Key: {
          [POSITIONS_KEY_SCHEMA.partitionKey]: tenantId,
          [POSITIONS_KEY_SCHEMA.sortKey]: sortKey,
        },
      })
      .promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'position');
    }

    return result.Item as Position;
  },

  /**
   * Save a position
   *
   * @param tenantId - The tenant identifier (must match position.tenantId)
   * @param position - The position to save
   * @throws TenantAccessDeniedError if tenantId doesn't match position.tenantId
   */
  async putPosition(tenantId: string, position: Position): Promise<void> {
    // Verify the position belongs to the tenant
    if (position.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'position');
    }

    const sortKey = createPositionSortKey(position.assetId, position.exchangeId);

    await documentClient
      .put({
        TableName: POSITIONS_TABLE,
        Item: {
          ...position,
          [POSITIONS_KEY_SCHEMA.sortKey]: sortKey,
        },
      })
      .promise();
  },

  /**
   * List positions for a tenant with optional exchange filter
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - Optional exchange filter
   * @returns List of positions
   */
  async listPositions(tenantId: string, exchangeId?: ExchangeId): Promise<Position[]> {
    let queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: POSITIONS_TABLE,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': POSITIONS_KEY_SCHEMA.partitionKey,
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
      },
    };

    // Add exchange filter if provided
    if (exchangeId) {
      queryParams.FilterExpression = '#exchangeId = :exchangeId';
      queryParams.ExpressionAttributeNames = {
        ...queryParams.ExpressionAttributeNames,
        '#exchangeId': 'exchangeId',
      };
      queryParams.ExpressionAttributeValues = {
        ...queryParams.ExpressionAttributeValues,
        ':exchangeId': exchangeId,
      };
    }

    const result = await documentClient.query(queryParams).promise();

    return (result.Items || []) as Position[];
  },

  /**
   * Get positions by exchange using GSI
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns List of positions for the exchange
   */
  async getPositionsByExchange(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<Position[]> {
    const result = await documentClient
      .query({
        TableName: POSITIONS_TABLE,
        IndexName: 'exchangeId-index',
        KeyConditionExpression: '#exchangeId = :exchangeId',
        FilterExpression: '#tenantId = :tenantId',
        ExpressionAttributeNames: {
          '#exchangeId': 'exchangeId',
          '#tenantId': 'tenantId',
        },
        ExpressionAttributeValues: {
          ':exchangeId': exchangeId,
          ':tenantId': tenantId,
        },
      })
      .promise();

    return (result.Items || []) as Position[];
  },

  /**
   * Delete a position
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeId - The exchange identifier
   */
  async deletePosition(
    tenantId: string,
    assetId: string,
    exchangeId: ExchangeId
  ): Promise<void> {
    const sortKey = createPositionSortKey(assetId, exchangeId);

    await documentClient
      .delete({
        TableName: POSITIONS_TABLE,
        Key: {
          [POSITIONS_KEY_SCHEMA.partitionKey]: tenantId,
          [POSITIONS_KEY_SCHEMA.sortKey]: sortKey,
        },
      })
      .promise();
  },

  /**
   * Update specific fields of a position
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeId - The exchange identifier
   * @param updates - Fields to update
   * @returns The updated position
   * @throws ResourceNotFoundError if position doesn't exist
   */
  async updatePosition(
    tenantId: string,
    assetId: string,
    exchangeId: ExchangeId,
    updates: Partial<Omit<Position, 'positionId' | 'tenantId' | 'assetId' | 'exchangeId' | 'openedAt'>>
  ): Promise<Position> {
    // Get existing position
    const existing = await this.getPosition(tenantId, assetId, exchangeId);
    if (!existing) {
      throw new ResourceNotFoundError('Position', `${assetId}:${exchangeId}`);
    }

    const now = new Date().toISOString();

    // Merge updates with existing position
    const updatedPosition: Position = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.putPosition(tenantId, updatedPosition);

    return updatedPosition;
  },


  /**
   * Add a position history record
   *
   * @param tenantId - The tenant identifier
   * @param history - The history record to add
   */
  async addPositionHistory(tenantId: string, history: PositionHistory): Promise<void> {
    // Verify the history belongs to the tenant
    if (history.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'position history');
    }

    const partitionKey = createHistoryPartitionKey(tenantId, history.assetId);
    const sortKey = createHistorySortKey(history.timestamp, history.historyId);

    await documentClient
      .put({
        TableName: POSITION_HISTORY_TABLE,
        Item: {
          ...history,
          [HISTORY_KEY_SCHEMA.partitionKey]: partitionKey,
          [HISTORY_KEY_SCHEMA.sortKey]: sortKey,
        },
      })
      .promise();
  },

  /**
   * Get position history for an asset within a time range
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param startTime - Start of time range (ISO string)
   * @param endTime - End of time range (ISO string)
   * @returns List of position history records
   */
  async getPositionHistory(
    tenantId: string,
    assetId: string,
    startTime: string,
    endTime: string
  ): Promise<PositionHistory[]> {
    const partitionKey = createHistoryPartitionKey(tenantId, assetId);

    const result = await documentClient
      .query({
        TableName: POSITION_HISTORY_TABLE,
        KeyConditionExpression: '#pk = :pk AND #sk BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#pk': HISTORY_KEY_SCHEMA.partitionKey,
          '#sk': HISTORY_KEY_SCHEMA.sortKey,
        },
        ExpressionAttributeValues: {
          ':pk': partitionKey,
          ':start': startTime,
          ':end': `${endTime}~`, // ~ is after any valid character to include all records up to endTime
        },
      })
      .promise();

    return (result.Items || []) as PositionHistory[];
  },

  /**
   * Get all position history for an asset
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param limit - Optional limit on results
   * @returns List of position history records
   */
  async getAllPositionHistory(
    tenantId: string,
    assetId: string,
    limit?: number
  ): Promise<PositionHistory[]> {
    const partitionKey = createHistoryPartitionKey(tenantId, assetId);

    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: POSITION_HISTORY_TABLE,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': HISTORY_KEY_SCHEMA.partitionKey,
      },
      ExpressionAttributeValues: {
        ':pk': partitionKey,
      },
      ScanIndexForward: false, // Most recent first
    };

    if (limit) {
      queryParams.Limit = limit;
    }

    const result = await documentClient.query(queryParams).promise();

    return (result.Items || []) as PositionHistory[];
  },

  /**
   * Get position history by exchange
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeId - The exchange identifier
   * @param limit - Optional limit on results
   * @returns List of position history records for the exchange
   */
  async getPositionHistoryByExchange(
    tenantId: string,
    assetId: string,
    exchangeId: ExchangeId,
    limit?: number
  ): Promise<PositionHistory[]> {
    const partitionKey = createHistoryPartitionKey(tenantId, assetId);

    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: POSITION_HISTORY_TABLE,
      KeyConditionExpression: '#pk = :pk',
      FilterExpression: '#exchangeId = :exchangeId',
      ExpressionAttributeNames: {
        '#pk': HISTORY_KEY_SCHEMA.partitionKey,
        '#exchangeId': 'exchangeId',
      },
      ExpressionAttributeValues: {
        ':pk': partitionKey,
        ':exchangeId': exchangeId,
      },
      ScanIndexForward: false, // Most recent first
    };

    if (limit) {
      queryParams.Limit = limit;
    }

    const result = await documentClient.query(queryParams).promise();

    return (result.Items || []) as PositionHistory[];
  },

  /**
   * Check if a position exists
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeId - The exchange identifier
   * @returns True if the position exists
   */
  async positionExists(
    tenantId: string,
    assetId: string,
    exchangeId: ExchangeId
  ): Promise<boolean> {
    const position = await this.getPosition(tenantId, assetId, exchangeId);
    return position !== null;
  },

  /**
   * Get all unique assets with positions for a tenant
   *
   * @param tenantId - The tenant identifier
   * @returns List of unique asset IDs
   */
  async getAssetsWithPositions(tenantId: string): Promise<string[]> {
    const positions = await this.listPositions(tenantId);
    const assetIds = new Set<string>();
    
    for (const position of positions) {
      assetIds.add(position.assetId);
    }

    return Array.from(assetIds);
  },

  /**
   * Batch get positions for multiple assets
   *
   * @param tenantId - The tenant identifier
   * @param assetExchangePairs - Array of {assetId, exchangeId} pairs
   * @returns Map of positions keyed by assetId:exchangeId
   */
  async batchGetPositions(
    tenantId: string,
    assetExchangePairs: Array<{ assetId: string; exchangeId: ExchangeId }>
  ): Promise<Map<string, Position>> {
    if (assetExchangePairs.length === 0) {
      return new Map();
    }

    const keys = assetExchangePairs.map(({ assetId, exchangeId }) => ({
      [POSITIONS_KEY_SCHEMA.partitionKey]: tenantId,
      [POSITIONS_KEY_SCHEMA.sortKey]: createPositionSortKey(assetId, exchangeId),
    }));

    // DynamoDB BatchGetItem has a limit of 100 items
    const batchSize = 100;
    const results = new Map<string, Position>();

    for (let i = 0; i < keys.length; i += batchSize) {
      const batchKeys = keys.slice(i, i + batchSize);

      const result = await documentClient
        .batchGet({
          RequestItems: {
            [POSITIONS_TABLE]: {
              Keys: batchKeys,
            },
          },
        })
        .promise();

      const items = result.Responses?.[POSITIONS_TABLE] || [];
      for (const item of items) {
        const position = item as Position;
        const key = `${position.assetId}:${position.exchangeId}`;
        results.set(key, position);
      }
    }

    return results;
  },
};
