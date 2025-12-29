/**
 * News Repository - manages news event persistence and retrieval
 * 
 * News events are stored with symbol as partition key and publishedAt#eventId as sort key.
 * Supports CRUD operations for NewsEvent entities in DynamoDB with JSON serialization.
 * 
 * Requirements: 3.4
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { NewsEvent, NewsCategory } from '../types/news';
import { ResourceNotFoundError, PaginatedResult } from '../db/access';

/**
 * Query parameters for listing news events
 */
export interface NewsQueryParams {
  symbol?: string;
  source?: string;
  startTime?: string;
  endTime?: string;
  category?: NewsCategory;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Serialized news event for DynamoDB storage
 */
interface SerializedNewsEvent {
  symbol: string;
  publishedAtEventId: string;
  eventId: string;
  title: string;
  content: string;
  summary?: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  ingestedAt: string;
  symbols: string;  // JSON serialized array
  category: NewsCategory;
  relevanceScore: number;
  sentiment?: number;
  contentHash: string;
  qualityScore: number;
}

/**
 * Create the composite sort key from publishedAt and eventId
 */
function createSortKey(publishedAt: string, eventId: string): string {
  return `${publishedAt}#${eventId}`;
}

/**
 * Parse the composite sort key back to publishedAt and eventId
 */
function parseSortKey(sortKey: string): { publishedAt: string; eventId: string } {
  const lastHashIndex = sortKey.lastIndexOf('#');
  return {
    publishedAt: sortKey.substring(0, lastHashIndex),
    eventId: sortKey.substring(lastHashIndex + 1)
  };
}

/**
 * Serialize a NewsEvent for DynamoDB storage
 */
function serializeNewsEvent(event: NewsEvent, symbol: string): SerializedNewsEvent {
  return {
    symbol,
    publishedAtEventId: createSortKey(event.publishedAt, event.eventId),
    eventId: event.eventId,
    title: event.title,
    content: event.content,
    summary: event.summary,
    source: event.source,
    sourceUrl: event.sourceUrl,
    publishedAt: event.publishedAt,
    ingestedAt: event.ingestedAt,
    symbols: JSON.stringify(event.symbols),
    category: event.category,
    relevanceScore: event.relevanceScore,
    sentiment: event.sentiment,
    contentHash: event.contentHash,
    qualityScore: event.qualityScore
  };
}

/**
 * Deserialize a DynamoDB item back to NewsEvent
 */
function deserializeNewsEvent(item: SerializedNewsEvent): NewsEvent {
  return {
    eventId: item.eventId,
    title: item.title,
    content: item.content,
    summary: item.summary,
    source: item.source,
    sourceUrl: item.sourceUrl,
    publishedAt: item.publishedAt,
    ingestedAt: item.ingestedAt,
    symbols: JSON.parse(item.symbols),
    category: item.category,
    relevanceScore: item.relevanceScore,
    sentiment: item.sentiment,
    contentHash: item.contentHash,
    qualityScore: item.qualityScore
  };
}

/**
 * News Repository
 */
export const NewsRepository = {
  /**
   * Get a news event by symbol and eventId
   * 
   * @param symbol - The symbol the news is associated with
   * @param eventId - The unique identifier of the news event
   * @param publishedAt - The publication timestamp
   * @returns The news event, or null if not found
   */
  async getNewsEvent(symbol: string, eventId: string, publishedAt: string): Promise<NewsEvent | null> {
    const result = await documentClient.get({
      TableName: TableNames.NEWS_EVENTS,
      Key: {
        [KeySchemas.NEWS_EVENTS.partitionKey]: symbol,
        [KeySchemas.NEWS_EVENTS.sortKey]: createSortKey(publishedAt, eventId)
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return deserializeNewsEvent(result.Item as SerializedNewsEvent);
  },

  /**
   * Get a news event by content hash (for deduplication)
   * 
   * @param contentHash - The content hash to search for
   * @returns The news event if found, null otherwise
   */
  async getByContentHash(contentHash: string): Promise<NewsEvent | null> {
    const result = await documentClient.query({
      TableName: TableNames.NEWS_EVENTS,
      IndexName: GSINames.NEWS_EVENTS.CONTENT_HASH_INDEX,
      KeyConditionExpression: 'contentHash = :hash',
      ExpressionAttributeValues: {
        ':hash': contentHash
      },
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return deserializeNewsEvent(result.Items[0] as SerializedNewsEvent);
  },

  /**
   * List news events for a symbol within a time range
   * 
   * @param symbol - The symbol to query
   * @param startTime - Start of time range (ISO string)
   * @param endTime - End of time range (ISO string)
   * @param params - Additional query parameters
   * @returns Paginated list of news events
   */
  async listBySymbol(
    symbol: string,
    startTime?: string,
    endTime?: string,
    params: Omit<NewsQueryParams, 'symbol' | 'startTime' | 'endTime'> = {}
  ): Promise<PaginatedResult<NewsEvent>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.NEWS_EVENTS,
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
      queryParams.KeyConditionExpression += ' AND publishedAtEventId BETWEEN :start AND :end';
      queryParams.ExpressionAttributeValues![':start'] = startTime;
      queryParams.ExpressionAttributeValues![':end'] = `${endTime}~`;  // ~ is after # in ASCII
    } else if (startTime) {
      queryParams.KeyConditionExpression += ' AND publishedAtEventId >= :start';
      queryParams.ExpressionAttributeValues![':start'] = startTime;
    } else if (endTime) {
      queryParams.KeyConditionExpression += ' AND publishedAtEventId <= :end';
      queryParams.ExpressionAttributeValues![':end'] = `${endTime}~`;
    }

    // Add category filter if provided
    if (params.category) {
      queryParams.FilterExpression = 'category = :category';
      queryParams.ExpressionAttributeValues![':category'] = params.category;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []).map(item => deserializeNewsEvent(item as SerializedNewsEvent)),
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List news events by source
   * 
   * @param source - The news source name
   * @param startTime - Start of time range (ISO string)
   * @param endTime - End of time range (ISO string)
   * @param params - Additional query parameters
   * @returns Paginated list of news events
   */
  async listBySource(
    source: string,
    startTime?: string,
    endTime?: string,
    params: Omit<NewsQueryParams, 'source' | 'startTime' | 'endTime'> = {}
  ): Promise<PaginatedResult<NewsEvent>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.NEWS_EVENTS,
      IndexName: GSINames.NEWS_EVENTS.SOURCE_PUBLISHED_INDEX,
      KeyConditionExpression: '#source = :source',
      ExpressionAttributeNames: {
        '#source': 'source'
      },
      ExpressionAttributeValues: {
        ':source': source
      },
      ScanIndexForward: false
    };

    if (startTime && endTime) {
      queryParams.KeyConditionExpression += ' AND publishedAt BETWEEN :start AND :end';
      queryParams.ExpressionAttributeValues![':start'] = startTime;
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
      items: (result.Items || []).map(item => deserializeNewsEvent(item as SerializedNewsEvent)),
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a news event
   * 
   * News events are stored once per symbol they are associated with.
   * 
   * @param event - The news event to save
   */
  async putNewsEvent(event: NewsEvent): Promise<void> {
    // Store the event for each associated symbol
    const symbols = event.symbols.length > 0 ? event.symbols : ['GENERAL'];

    const writeRequests = symbols.map(symbol => ({
      PutRequest: {
        Item: serializeNewsEvent(event, symbol)
      }
    }));

    // Batch write in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < writeRequests.length; i += 25) {
      const batch = writeRequests.slice(i, i + 25);
      await documentClient.batchWrite({
        RequestItems: {
          [TableNames.NEWS_EVENTS]: batch
        }
      }).promise();
    }
  },

  /**
   * Delete a news event
   * 
   * @param symbol - The symbol the news is associated with
   * @param eventId - The unique identifier of the news event
   * @param publishedAt - The publication timestamp
   * @throws ResourceNotFoundError if news event doesn't exist
   */
  async deleteNewsEvent(symbol: string, eventId: string, publishedAt: string): Promise<void> {
    const existing = await this.getNewsEvent(symbol, eventId, publishedAt);
    if (!existing) {
      throw new ResourceNotFoundError('NewsEvent', eventId);
    }

    await documentClient.delete({
      TableName: TableNames.NEWS_EVENTS,
      Key: {
        [KeySchemas.NEWS_EVENTS.partitionKey]: symbol,
        [KeySchemas.NEWS_EVENTS.sortKey]: createSortKey(publishedAt, eventId)
      }
    }).promise();
  },

  /**
   * Check if a news event with the given content hash already exists
   * 
   * @param contentHash - The content hash to check
   * @returns True if a news event with this hash exists
   */
  async contentHashExists(contentHash: string): Promise<boolean> {
    const event = await this.getByContentHash(contentHash);
    return event !== null;
  },

  /**
   * Get recent news events across all symbols
   * 
   * @param limit - Maximum number of events to return
   * @returns List of recent news events
   */
  async getRecentNews(limit: number = 50): Promise<NewsEvent[]> {
    // Scan with limit - in production, consider using a GSI with timestamp
    const result = await documentClient.scan({
      TableName: TableNames.NEWS_EVENTS,
      Limit: limit
    }).promise();

    const events = (result.Items || []).map(item => 
      deserializeNewsEvent(item as SerializedNewsEvent)
    );

    // Sort by publishedAt descending
    return events.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }
};

// Export serialization functions for testing
export { serializeNewsEvent, deserializeNewsEvent };
