/**
 * Stream Repository - manages stream persistence and retrieval
 * 
 * Streams are stored with tenantId as partition key and streamId as sort key.
 * Supports CRUD operations for DataStream entities in DynamoDB.
 * 
 * Requirements: 8.1
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { DataStream, StreamStatus } from '../types/stream';
import { DataSourceType } from '../types/data-source';
import { ResourceNotFoundError, PaginatedResult, TenantAccessDeniedError } from '../db/access';

/**
 * Query parameters for listing streams
 */
export interface StreamQueryParams {
  tenantId: string;
  status?: StreamStatus;
  sourceId?: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Stream Repository
 */
export const StreamRepository = {
  /**
   * Get a stream by ID with tenant verification
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The unique identifier of the stream
   * @returns The stream, or null if not found
   */
  async getStream(tenantId: string, streamId: string): Promise<DataStream | null> {
    const result = await documentClient.get({
      TableName: TableNames.STREAMS,
      Key: {
        [KeySchemas.STREAMS.partitionKey]: tenantId,
        [KeySchemas.STREAMS.sortKey]: streamId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Verify tenant ownership (defense in depth)
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'stream');
    }

    return result.Item as DataStream;
  },


  /**
   * List all streams for a tenant with optional filtering
   * 
   * @param params - Query parameters including tenantId and optional filters
   * @returns Paginated list of streams
   */
  async listStreams(params: StreamQueryParams): Promise<PaginatedResult<DataStream>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.STREAMS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.STREAMS.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': params.tenantId
      }
    };

    // Add status filter if provided
    if (params.status) {
      queryParams.FilterExpression = '#status = :status';
      queryParams.ExpressionAttributeNames!['#status'] = 'status';
      queryParams.ExpressionAttributeValues![':status'] = params.status;
    }

    // Add sourceId filter if provided
    if (params.sourceId) {
      const filterExpr = params.status 
        ? `${queryParams.FilterExpression} AND #sourceId = :sourceId`
        : '#sourceId = :sourceId';
      queryParams.FilterExpression = filterExpr;
      queryParams.ExpressionAttributeNames!['#sourceId'] = 'sourceId';
      queryParams.ExpressionAttributeValues![':sourceId'] = params.sourceId;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as DataStream[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List streams by status using GSI
   * 
   * @param status - The stream status to filter by
   * @param params - Additional query parameters
   * @returns Paginated list of streams
   */
  async listByStatus(
    status: StreamStatus,
    params: Omit<StreamQueryParams, 'status'> = { tenantId: '' }
  ): Promise<PaginatedResult<DataStream>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.STREAMS,
      IndexName: GSINames.STREAMS.STATUS_INDEX,
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status
      }
    };

    // Filter by tenantId if provided
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
      items: (result.Items || []) as DataStream[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List streams by source ID using GSI
   * 
   * @param sourceId - The source ID to filter by
   * @param params - Additional query parameters
   * @returns Paginated list of streams
   */
  async listBySourceId(
    sourceId: string,
    params: Omit<StreamQueryParams, 'sourceId'> = { tenantId: '' }
  ): Promise<PaginatedResult<DataStream>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.STREAMS,
      IndexName: GSINames.STREAMS.SOURCE_INDEX,
      KeyConditionExpression: '#sourceId = :sourceId',
      ExpressionAttributeNames: {
        '#sourceId': 'sourceId'
      },
      ExpressionAttributeValues: {
        ':sourceId': sourceId
      }
    };

    // Filter by tenantId if provided
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
      items: (result.Items || []) as DataStream[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },


  /**
   * Save a stream
   * 
   * @param stream - The stream to save
   */
  async putStream(stream: DataStream): Promise<void> {
    await documentClient.put({
      TableName: TableNames.STREAMS,
      Item: stream
    }).promise();
  },

  /**
   * Delete a stream
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The unique identifier of the stream to delete
   * @throws ResourceNotFoundError if stream doesn't exist
   */
  async deleteStream(tenantId: string, streamId: string): Promise<void> {
    const existing = await this.getStream(tenantId, streamId);
    if (!existing) {
      throw new ResourceNotFoundError('DataStream', streamId);
    }

    await documentClient.delete({
      TableName: TableNames.STREAMS,
      Key: {
        [KeySchemas.STREAMS.partitionKey]: tenantId,
        [KeySchemas.STREAMS.sortKey]: streamId
      }
    }).promise();
  },

  /**
   * Update a stream
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The unique identifier of the stream
   * @param updates - Partial stream updates
   * @returns The updated stream
   * @throws ResourceNotFoundError if stream doesn't exist
   */
  async updateStream(
    tenantId: string,
    streamId: string,
    updates: Partial<Omit<DataStream, 'streamId' | 'tenantId' | 'createdAt'>>
  ): Promise<DataStream> {
    const existing = await this.getStream(tenantId, streamId);
    if (!existing) {
      throw new ResourceNotFoundError('DataStream', streamId);
    }

    const updatedStream: DataStream = {
      ...existing,
      ...updates,
      lastActivity: new Date().toISOString()
    };

    await this.putStream(updatedStream);

    return updatedStream;
  },

  /**
   * Update stream status
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The unique identifier of the stream
   * @param status - The new status
   * @returns The updated stream
   * @throws ResourceNotFoundError if stream doesn't exist
   */
  async updateStatus(
    tenantId: string,
    streamId: string,
    status: StreamStatus
  ): Promise<DataStream> {
    return this.updateStream(tenantId, streamId, { status });
  },

  /**
   * Check if a stream exists
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The unique identifier of the stream
   * @returns True if the stream exists, false otherwise
   */
  async streamExists(tenantId: string, streamId: string): Promise<boolean> {
    const stream = await this.getStream(tenantId, streamId);
    return stream !== null;
  },

  /**
   * Get active streams for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns List of active streams
   */
  async getActiveStreams(tenantId: string): Promise<DataStream[]> {
    const result = await this.listStreams({ tenantId, status: 'ACTIVE' });
    return result.items;
  },

  /**
   * Count active streams for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns Count of active streams
   */
  async countActiveStreams(tenantId: string): Promise<number> {
    const activeStreams = await this.getActiveStreams(tenantId);
    return activeStreams.length;
  },

  /**
   * Batch get streams
   * 
   * @param tenantId - The tenant ID
   * @param streamIds - Array of stream IDs to retrieve
   * @returns Array of streams (may be fewer than requested if some don't exist)
   */
  async batchGetStreams(tenantId: string, streamIds: string[]): Promise<DataStream[]> {
    if (streamIds.length === 0) {
      return [];
    }

    const keys = streamIds.map(streamId => ({
      [KeySchemas.STREAMS.partitionKey]: tenantId,
      [KeySchemas.STREAMS.sortKey]: streamId
    }));

    const result = await documentClient.batchGet({
      RequestItems: {
        [TableNames.STREAMS]: {
          Keys: keys
        }
      }
    }).promise();

    const items = result.Responses?.[TableNames.STREAMS] || [];
    return items as DataStream[];
  },

  /**
   * Batch delete streams
   * 
   * @param tenantId - The tenant ID
   * @param streamIds - Array of stream IDs to delete
   */
  async batchDeleteStreams(tenantId: string, streamIds: string[]): Promise<void> {
    if (streamIds.length === 0) {
      return;
    }

    const deleteRequests = streamIds.map(streamId => ({
      DeleteRequest: {
        Key: {
          [KeySchemas.STREAMS.partitionKey]: tenantId,
          [KeySchemas.STREAMS.sortKey]: streamId
        }
      }
    }));

    // DynamoDB batch write has a limit of 25 items
    const batches = [];
    for (let i = 0; i < deleteRequests.length; i += 25) {
      batches.push(deleteRequests.slice(i, i + 25));
    }

    for (const batch of batches) {
      await documentClient.batchWrite({
        RequestItems: {
          [TableNames.STREAMS]: batch
        }
      }).promise();
    }
  }
};
