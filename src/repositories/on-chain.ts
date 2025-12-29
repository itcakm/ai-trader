/**
 * On-Chain Repository - manages on-chain metric data persistence and retrieval
 * 
 * On-chain metrics are stored with symbol#metricType as partition key and timestamp as sort key.
 * Supports CRUD operations for OnChainMetric entities in DynamoDB with JSON serialization.
 * 
 * Requirements: 5.4
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { OnChainMetric, OnChainMetricType } from '../types/on-chain';
import { ResourceNotFoundError, PaginatedResult } from '../db/access';

/**
 * Table name for on-chain metrics
 */
const ONCHAIN_TABLE = process.env.ONCHAIN_TABLE || 'onchain-metrics';

/**
 * Key schema for on-chain table
 * Partition key: symbol#metricType
 * Sort key: timestamp
 */
const KEY_SCHEMA = {
  partitionKey: 'pk',  // symbol#metricType
  sortKey: 'timestamp'
};

/**
 * GSI names for on-chain table
 */
const GSI_NAMES = {
  NETWORK_INDEX: 'network-timestamp-index',
  SOURCE_INDEX: 'sourceId-timestamp-index'
};

/**
 * Query parameters for listing on-chain metrics
 */
export interface OnChainQueryParams {
  symbol?: string;
  metricType?: OnChainMetricType;
  network?: string;
  startTime?: string;
  endTime?: string;
  sourceId?: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Serialized on-chain metric for DynamoDB storage
 */
interface SerializedOnChainMetric {
  pk: string;  // symbol#metricType
  timestamp: string;
  metricId: string;
  symbol: string;
  network: string;
  metricType: OnChainMetricType;
  value: number;
  change24h?: number;
  change7d?: number;
  movingAverage7d?: number;
  sourceId: string;
  qualityScore: number;
}

/**
 * Create partition key from symbol and metric type
 */
function createPartitionKey(symbol: string, metricType: OnChainMetricType): string {
  return `${symbol.toUpperCase()}#${metricType}`;
}

/**
 * Parse partition key to extract symbol and metric type
 */
function parsePartitionKey(pk: string): { symbol: string; metricType: OnChainMetricType } {
  const [symbol, metricType] = pk.split('#');
  return { symbol, metricType: metricType as OnChainMetricType };
}

/**
 * Serialize an OnChainMetric for DynamoDB storage
 */
function serializeOnChainMetric(metric: OnChainMetric): SerializedOnChainMetric {
  return {
    pk: createPartitionKey(metric.symbol, metric.metricType),
    timestamp: metric.timestamp,
    metricId: metric.metricId,
    symbol: metric.symbol,
    network: metric.network,
    metricType: metric.metricType,
    value: metric.value,
    change24h: metric.change24h,
    change7d: metric.change7d,
    movingAverage7d: metric.movingAverage7d,
    sourceId: metric.sourceId,
    qualityScore: metric.qualityScore
  };
}

/**
 * Deserialize a DynamoDB item back to OnChainMetric
 */
function deserializeOnChainMetric(item: SerializedOnChainMetric): OnChainMetric {
  return {
    metricId: item.metricId,
    symbol: item.symbol,
    network: item.network,
    metricType: item.metricType,
    value: item.value,
    timestamp: item.timestamp,
    change24h: item.change24h,
    change7d: item.change7d,
    movingAverage7d: item.movingAverage7d,
    sourceId: item.sourceId,
    qualityScore: item.qualityScore
  };
}

/**
 * On-Chain Repository
 */
export const OnChainRepository = {
  /**
   * Get on-chain metric by symbol, metric type, and timestamp
   * 
   * @param symbol - The symbol to query
   * @param metricType - The metric type
   * @param timestamp - The timestamp of the metric
   * @returns The on-chain metric, or null if not found
   */
  async getMetric(
    symbol: string,
    metricType: OnChainMetricType,
    timestamp: string
  ): Promise<OnChainMetric | null> {
    const result = await documentClient.get({
      TableName: ONCHAIN_TABLE,
      Key: {
        [KEY_SCHEMA.partitionKey]: createPartitionKey(symbol, metricType),
        [KEY_SCHEMA.sortKey]: timestamp
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return deserializeOnChainMetric(result.Item as SerializedOnChainMetric);
  },

  /**
   * Get on-chain metric by metricId
   * 
   * Note: This requires a scan since metricId is not a key.
   * For production, consider adding a GSI on metricId.
   * 
   * @param metricId - The unique identifier of the metric
   * @returns The on-chain metric, or null if not found
   */
  async getByMetricId(metricId: string): Promise<OnChainMetric | null> {
    const result = await documentClient.scan({
      TableName: ONCHAIN_TABLE,
      FilterExpression: 'metricId = :id',
      ExpressionAttributeValues: {
        ':id': metricId
      },
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return deserializeOnChainMetric(result.Items[0] as SerializedOnChainMetric);
  },

  /**
   * List on-chain metrics for a symbol and metric type within a time range
   * 
   * Requirements: 5.4 (associate with specific blockchain networks and tokens)
   * 
   * @param symbol - The symbol to query
   * @param metricType - The metric type
   * @param startTime - Start of time range (ISO string)
   * @param endTime - End of time range (ISO string)
   * @param params - Additional query parameters
   * @returns Paginated list of on-chain metrics
   */
  async listBySymbolAndType(
    symbol: string,
    metricType: OnChainMetricType,
    startTime?: string,
    endTime?: string,
    params: Omit<OnChainQueryParams, 'symbol' | 'metricType' | 'startTime' | 'endTime'> = {}
  ): Promise<PaginatedResult<OnChainMetric>> {
    const pk = createPartitionKey(symbol, metricType);

    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: ONCHAIN_TABLE,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':pk': pk
      },
      ScanIndexForward: false  // Most recent first
    };

    // Add time range filter if provided
    if (startTime && endTime) {
      queryParams.KeyConditionExpression += ' AND #timestamp BETWEEN :start AND :end';
      queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      queryParams.ExpressionAttributeValues![':start'] = startTime;
      queryParams.ExpressionAttributeValues![':end'] = endTime;
    } else if (startTime) {
      queryParams.KeyConditionExpression += ' AND #timestamp >= :start';
      queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      queryParams.ExpressionAttributeValues![':start'] = startTime;
    } else if (endTime) {
      queryParams.KeyConditionExpression += ' AND #timestamp <= :end';
      queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      queryParams.ExpressionAttributeValues![':end'] = endTime;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []).map(item => deserializeOnChainMetric(item as SerializedOnChainMetric)),
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Get the latest on-chain metric for a symbol and metric type
   * 
   * @param symbol - The symbol to query
   * @param metricType - The metric type
   * @returns The most recent metric, or null if none exists
   */
  async getLatest(symbol: string, metricType: OnChainMetricType): Promise<OnChainMetric | null> {
    const pk = createPartitionKey(symbol, metricType);

    const result = await documentClient.query({
      TableName: ONCHAIN_TABLE,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':pk': pk
      },
      ScanIndexForward: false,  // Most recent first
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return deserializeOnChainMetric(result.Items[0] as SerializedOnChainMetric);
  },

  /**
   * Get all metric types for a symbol
   * 
   * @param symbol - The symbol to query
   * @returns Array of available metric types
   */
  async getAvailableMetricTypes(symbol: string): Promise<OnChainMetricType[]> {
    const metricTypes: OnChainMetricType[] = [
      'ACTIVE_ADDRESSES',
      'TRANSACTION_VOLUME',
      'EXCHANGE_INFLOW',
      'EXCHANGE_OUTFLOW',
      'WHALE_TRANSACTIONS',
      'NVT_RATIO',
      'MVRV_RATIO'
    ];

    const availableTypes: OnChainMetricType[] = [];

    // Check each metric type for data
    for (const metricType of metricTypes) {
      const latest = await this.getLatest(symbol, metricType);
      if (latest) {
        availableTypes.push(metricType);
      }
    }

    return availableTypes;
  },

  /**
   * Save on-chain metric
   * 
   * Requirements: 5.4 (store on-chain metrics associated with blockchain networks and tokens)
   * 
   * @param metric - The on-chain metric to save
   */
  async putMetric(metric: OnChainMetric): Promise<void> {
    await documentClient.put({
      TableName: ONCHAIN_TABLE,
      Item: serializeOnChainMetric(metric)
    }).promise();
  },

  /**
   * Save multiple on-chain metrics in a batch
   * 
   * @param metrics - Array of on-chain metrics to save
   */
  async batchPutMetrics(metrics: OnChainMetric[]): Promise<void> {
    if (metrics.length === 0) {
      return;
    }

    const writeRequests = metrics.map(metric => ({
      PutRequest: {
        Item: serializeOnChainMetric(metric)
      }
    }));

    // Batch write in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < writeRequests.length; i += 25) {
      const batch = writeRequests.slice(i, i + 25);
      await documentClient.batchWrite({
        RequestItems: {
          [ONCHAIN_TABLE]: batch
        }
      }).promise();
    }
  },

  /**
   * Delete on-chain metric
   * 
   * @param symbol - The symbol of the metric
   * @param metricType - The metric type
   * @param timestamp - The timestamp of the metric
   * @throws ResourceNotFoundError if metric doesn't exist
   */
  async deleteMetric(
    symbol: string,
    metricType: OnChainMetricType,
    timestamp: string
  ): Promise<void> {
    const existing = await this.getMetric(symbol, metricType, timestamp);
    if (!existing) {
      throw new ResourceNotFoundError('OnChainMetric', `${symbol}#${metricType}#${timestamp}`);
    }

    await documentClient.delete({
      TableName: ONCHAIN_TABLE,
      Key: {
        [KEY_SCHEMA.partitionKey]: createPartitionKey(symbol, metricType),
        [KEY_SCHEMA.sortKey]: timestamp
      }
    }).promise();
  },

  /**
   * Get metrics for multiple symbols and metric types
   * 
   * @param queries - Array of symbol/metricType pairs to query
   * @returns Map of query key to latest metric
   */
  async getMultipleLatest(
    queries: Array<{ symbol: string; metricType: OnChainMetricType }>
  ): Promise<Map<string, OnChainMetric | null>> {
    const results = new Map<string, OnChainMetric | null>();

    // Query each combination in parallel
    const promises = queries.map(async ({ symbol, metricType }) => {
      const key = `${symbol}#${metricType}`;
      const metric = await this.getLatest(symbol, metricType);
      results.set(key, metric);
    });

    await Promise.all(promises);
    return results;
  },

  /**
   * Get metric history for a symbol and metric type
   * 
   * @param symbol - The symbol to query
   * @param metricType - The metric type
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @returns Array of on-chain metrics
   */
  async getHistory(
    symbol: string,
    metricType: OnChainMetricType,
    startTime: string,
    endTime: string
  ): Promise<OnChainMetric[]> {
    const result = await this.listBySymbolAndType(symbol, metricType, startTime, endTime, { limit: 1000 });
    return result.items;
  },

  /**
   * Check if metric exists for a symbol, metric type, and timestamp
   * 
   * @param symbol - The symbol to check
   * @param metricType - The metric type
   * @param timestamp - The timestamp to check
   * @returns True if metric exists
   */
  async exists(
    symbol: string,
    metricType: OnChainMetricType,
    timestamp: string
  ): Promise<boolean> {
    const metric = await this.getMetric(symbol, metricType, timestamp);
    return metric !== null;
  },

  /**
   * Get recent metrics across all symbols for a specific metric type
   * 
   * @param metricType - The metric type to query
   * @param limit - Maximum number of records to return
   * @returns List of recent metrics
   */
  async getRecentByType(metricType: OnChainMetricType, limit: number = 50): Promise<OnChainMetric[]> {
    const result = await documentClient.scan({
      TableName: ONCHAIN_TABLE,
      FilterExpression: 'metricType = :type',
      ExpressionAttributeValues: {
        ':type': metricType
      },
      Limit: limit
    }).promise();

    const items = (result.Items || []).map(item =>
      deserializeOnChainMetric(item as SerializedOnChainMetric)
    );

    // Sort by timestamp descending
    return items.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  },

  /**
   * Get metrics by network
   * 
   * @param network - The blockchain network to query
   * @param limit - Maximum number of records to return
   * @returns List of metrics for the network
   */
  async getByNetwork(network: string, limit: number = 100): Promise<OnChainMetric[]> {
    const result = await documentClient.scan({
      TableName: ONCHAIN_TABLE,
      FilterExpression: 'network = :network',
      ExpressionAttributeValues: {
        ':network': network
      },
      Limit: limit
    }).promise();

    const items = (result.Items || []).map(item =>
      deserializeOnChainMetric(item as SerializedOnChainMetric)
    );

    // Sort by timestamp descending
    return items.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
};

// Export serialization functions for testing
export { serializeOnChainMetric, deserializeOnChainMetric, createPartitionKey, parsePartitionKey };
