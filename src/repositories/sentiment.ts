/**
 * Sentiment Repository - manages sentiment data persistence and retrieval
 * 
 * Sentiment data is stored with symbol as partition key and timestamp as sort key.
 * Supports CRUD operations for SentimentData entities in DynamoDB with JSON serialization.
 * 
 * Requirements: 4.4
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { SentimentData, SentimentSource } from '../types/sentiment';
import { ResourceNotFoundError, PaginatedResult } from '../db/access';

/**
 * Table name for sentiment data
 */
const SENTIMENT_TABLE = process.env.SENTIMENT_TABLE || 'sentiment-data';

/**
 * Key schema for sentiment table
 */
const KEY_SCHEMA = {
  partitionKey: 'symbol',
  sortKey: 'timestamp'
};

/**
 * GSI names for sentiment table
 */
const GSI_NAMES = {
  SOURCE_INDEX: 'aggregatedFrom-timestamp-index'
};

/**
 * Query parameters for listing sentiment data
 */
export interface SentimentQueryParams {
  symbol?: string;
  startTime?: string;
  endTime?: string;
  sourceId?: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Serialized sentiment data for DynamoDB storage
 */
interface SerializedSentimentData {
  symbol: string;
  timestamp: string;
  sentimentId: string;
  overallScore: number;
  mentionVolume: number;
  changeRate24h: number;
  sources: string;  // JSON serialized array
  aggregatedFrom: string;  // JSON serialized array
  qualityScore: number;
}

/**
 * Serialize a SentimentData for DynamoDB storage
 */
function serializeSentimentData(data: SentimentData): SerializedSentimentData {
  return {
    symbol: data.symbol,
    timestamp: data.timestamp,
    sentimentId: data.sentimentId,
    overallScore: data.overallScore,
    mentionVolume: data.mentionVolume,
    changeRate24h: data.changeRate24h,
    sources: JSON.stringify(data.sources),
    aggregatedFrom: JSON.stringify(data.aggregatedFrom),
    qualityScore: data.qualityScore
  };
}

/**
 * Deserialize a DynamoDB item back to SentimentData
 */
function deserializeSentimentData(item: SerializedSentimentData): SentimentData {
  return {
    sentimentId: item.sentimentId,
    symbol: item.symbol,
    timestamp: item.timestamp,
    overallScore: item.overallScore,
    mentionVolume: item.mentionVolume,
    changeRate24h: item.changeRate24h,
    sources: JSON.parse(item.sources) as SentimentSource[],
    aggregatedFrom: JSON.parse(item.aggregatedFrom) as string[],
    qualityScore: item.qualityScore
  };
}

/**
 * Sentiment Repository
 */
export const SentimentRepository = {
  /**
   * Get sentiment data by symbol and timestamp
   * 
   * @param symbol - The symbol to query
   * @param timestamp - The timestamp of the sentiment data
   * @returns The sentiment data, or null if not found
   */
  async getSentimentData(symbol: string, timestamp: string): Promise<SentimentData | null> {
    const result = await documentClient.get({
      TableName: SENTIMENT_TABLE,
      Key: {
        [KEY_SCHEMA.partitionKey]: symbol,
        [KEY_SCHEMA.sortKey]: timestamp
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return deserializeSentimentData(result.Item as SerializedSentimentData);
  },

  /**
   * Get sentiment data by sentimentId
   * 
   * Note: This requires a scan since sentimentId is not a key.
   * For production, consider adding a GSI on sentimentId.
   * 
   * @param sentimentId - The unique identifier of the sentiment data
   * @returns The sentiment data, or null if not found
   */
  async getBySentimentId(sentimentId: string): Promise<SentimentData | null> {
    const result = await documentClient.scan({
      TableName: SENTIMENT_TABLE,
      FilterExpression: 'sentimentId = :id',
      ExpressionAttributeValues: {
        ':id': sentimentId
      },
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return deserializeSentimentData(result.Items[0] as SerializedSentimentData);
  },

  /**
   * List sentiment data for a symbol within a time range
   * 
   * Requirements: 4.4 (associate with specific symbols and timestamps)
   * 
   * @param symbol - The symbol to query
   * @param startTime - Start of time range (ISO string)
   * @param endTime - End of time range (ISO string)
   * @param params - Additional query parameters
   * @returns Paginated list of sentiment data
   */
  async listBySymbol(
    symbol: string,
    startTime?: string,
    endTime?: string,
    params: Omit<SentimentQueryParams, 'symbol' | 'startTime' | 'endTime'> = {}
  ): Promise<PaginatedResult<SentimentData>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: SENTIMENT_TABLE,
      KeyConditionExpression: '#symbol = :symbol',
      ExpressionAttributeNames: {
        '#symbol': 'symbol'
      },
      ExpressionAttributeValues: {
        ':symbol': symbol
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
      items: (result.Items || []).map(item => deserializeSentimentData(item as SerializedSentimentData)),
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Get the latest sentiment data for a symbol
   * 
   * @param symbol - The symbol to query
   * @returns The most recent sentiment data, or null if none exists
   */
  async getLatest(symbol: string): Promise<SentimentData | null> {
    const result = await documentClient.query({
      TableName: SENTIMENT_TABLE,
      KeyConditionExpression: '#symbol = :symbol',
      ExpressionAttributeNames: {
        '#symbol': 'symbol'
      },
      ExpressionAttributeValues: {
        ':symbol': symbol
      },
      ScanIndexForward: false,  // Most recent first
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return deserializeSentimentData(result.Items[0] as SerializedSentimentData);
  },

  /**
   * Save sentiment data
   * 
   * Requirements: 4.4 (store sentiment data associated with symbols and timestamps)
   * 
   * @param data - The sentiment data to save
   */
  async putSentimentData(data: SentimentData): Promise<void> {
    await documentClient.put({
      TableName: SENTIMENT_TABLE,
      Item: serializeSentimentData(data)
    }).promise();
  },

  /**
   * Save multiple sentiment data records in a batch
   * 
   * @param dataList - Array of sentiment data to save
   */
  async batchPutSentimentData(dataList: SentimentData[]): Promise<void> {
    if (dataList.length === 0) {
      return;
    }

    const writeRequests = dataList.map(data => ({
      PutRequest: {
        Item: serializeSentimentData(data)
      }
    }));

    // Batch write in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < writeRequests.length; i += 25) {
      const batch = writeRequests.slice(i, i + 25);
      await documentClient.batchWrite({
        RequestItems: {
          [SENTIMENT_TABLE]: batch
        }
      }).promise();
    }
  },

  /**
   * Delete sentiment data
   * 
   * @param symbol - The symbol of the sentiment data
   * @param timestamp - The timestamp of the sentiment data
   * @throws ResourceNotFoundError if sentiment data doesn't exist
   */
  async deleteSentimentData(symbol: string, timestamp: string): Promise<void> {
    const existing = await this.getSentimentData(symbol, timestamp);
    if (!existing) {
      throw new ResourceNotFoundError('SentimentData', `${symbol}#${timestamp}`);
    }

    await documentClient.delete({
      TableName: SENTIMENT_TABLE,
      Key: {
        [KEY_SCHEMA.partitionKey]: symbol,
        [KEY_SCHEMA.sortKey]: timestamp
      }
    }).promise();
  },

  /**
   * Get sentiment data for multiple symbols
   * 
   * @param symbols - Array of symbols to query
   * @param timestamp - Optional specific timestamp to query
   * @returns Map of symbol to sentiment data
   */
  async getMultipleSymbols(
    symbols: string[],
    timestamp?: string
  ): Promise<Map<string, SentimentData | null>> {
    const results = new Map<string, SentimentData | null>();

    // Query each symbol in parallel
    const promises = symbols.map(async symbol => {
      let data: SentimentData | null;
      if (timestamp) {
        data = await this.getSentimentData(symbol, timestamp);
      } else {
        data = await this.getLatest(symbol);
      }
      results.set(symbol, data);
    });

    await Promise.all(promises);
    return results;
  },

  /**
   * Get sentiment history for a symbol with aggregation
   * 
   * @param symbol - The symbol to query
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @param interval - Aggregation interval ('1h', '1d', '1w')
   * @returns Array of sentiment data points
   */
  async getHistory(
    symbol: string,
    startTime: string,
    endTime: string,
    interval: '1h' | '1d' | '1w' = '1d'
  ): Promise<SentimentData[]> {
    const result = await this.listBySymbol(symbol, startTime, endTime, { limit: 1000 });
    
    // For now, return all data points
    // In production, implement aggregation based on interval
    return result.items;
  },

  /**
   * Check if sentiment data exists for a symbol at a specific timestamp
   * 
   * @param symbol - The symbol to check
   * @param timestamp - The timestamp to check
   * @returns True if sentiment data exists
   */
  async exists(symbol: string, timestamp: string): Promise<boolean> {
    const data = await this.getSentimentData(symbol, timestamp);
    return data !== null;
  },

  /**
   * Get recent sentiment data across all symbols
   * 
   * @param limit - Maximum number of records to return
   * @returns List of recent sentiment data
   */
  async getRecentSentiment(limit: number = 50): Promise<SentimentData[]> {
    const result = await documentClient.scan({
      TableName: SENTIMENT_TABLE,
      Limit: limit
    }).promise();

    const items = (result.Items || []).map(item =>
      deserializeSentimentData(item as SerializedSentimentData)
    );

    // Sort by timestamp descending
    return items.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
};

// Export serialization functions for testing
export { serializeSentimentData, deserializeSentimentData };
