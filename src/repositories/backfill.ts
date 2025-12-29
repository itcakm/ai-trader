/**
 * Backfill Repository - manages backfill request persistence and retrieval
 * 
 * Backfill requests are stored with tenantId as partition key and requestId as sort key.
 * Supports CRUD operations for BackfillRequest entities in DynamoDB.
 * 
 * Requirements: 9.1
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { BackfillRequest, BackfillStatus } from '../types/backfill';
import { ResourceNotFoundError, PaginatedResult, TenantAccessDeniedError } from '../db/access';

/**
 * Query parameters for listing backfill requests
 */
export interface BackfillQueryParams {
  tenantId: string;
  status?: BackfillStatus;
  sourceId?: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Backfill Repository
 */
export const BackfillRepository = {
  /**
   * Get a backfill request by ID with tenant verification
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The unique identifier of the backfill request
   * @returns The backfill request, or null if not found
   */
  async getBackfillRequest(tenantId: string, requestId: string): Promise<BackfillRequest | null> {
    const result = await documentClient.get({
      TableName: TableNames.BACKFILL_REQUESTS,
      Key: {
        [KeySchemas.BACKFILL_REQUESTS.partitionKey]: tenantId,
        [KeySchemas.BACKFILL_REQUESTS.sortKey]: requestId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Verify tenant ownership (defense in depth)
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'backfill request');
    }

    return result.Item as BackfillRequest;
  },

  /**
   * List all backfill requests for a tenant with optional filtering
   * 
   * @param params - Query parameters including tenantId and optional filters
   * @returns Paginated list of backfill requests
   */
  async listBackfillRequests(params: BackfillQueryParams): Promise<PaginatedResult<BackfillRequest>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.BACKFILL_REQUESTS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.BACKFILL_REQUESTS.partitionKey
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
      items: (result.Items || []) as BackfillRequest[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List backfill requests by status using GSI
   * 
   * @param status - The backfill status to filter by
   * @param params - Additional query parameters
   * @returns Paginated list of backfill requests
   */
  async listByStatus(
    status: BackfillStatus,
    params: Omit<BackfillQueryParams, 'status'> = { tenantId: '' }
  ): Promise<PaginatedResult<BackfillRequest>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.BACKFILL_REQUESTS,
      IndexName: GSINames.BACKFILL_REQUESTS.STATUS_INDEX,
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
      items: (result.Items || []) as BackfillRequest[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List backfill requests by source ID using GSI
   * 
   * @param sourceId - The source ID to filter by
   * @param params - Additional query parameters
   * @returns Paginated list of backfill requests
   */
  async listBySourceId(
    sourceId: string,
    params: Omit<BackfillQueryParams, 'sourceId'> = { tenantId: '' }
  ): Promise<PaginatedResult<BackfillRequest>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.BACKFILL_REQUESTS,
      IndexName: GSINames.BACKFILL_REQUESTS.SOURCE_INDEX,
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
      items: (result.Items || []) as BackfillRequest[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },


  /**
   * Save a backfill request
   * 
   * @param request - The backfill request to save
   */
  async putBackfillRequest(request: BackfillRequest): Promise<void> {
    await documentClient.put({
      TableName: TableNames.BACKFILL_REQUESTS,
      Item: request
    }).promise();
  },

  /**
   * Delete a backfill request
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The unique identifier of the backfill request to delete
   * @throws ResourceNotFoundError if backfill request doesn't exist
   */
  async deleteBackfillRequest(tenantId: string, requestId: string): Promise<void> {
    const existing = await this.getBackfillRequest(tenantId, requestId);
    if (!existing) {
      throw new ResourceNotFoundError('BackfillRequest', requestId);
    }

    await documentClient.delete({
      TableName: TableNames.BACKFILL_REQUESTS,
      Key: {
        [KeySchemas.BACKFILL_REQUESTS.partitionKey]: tenantId,
        [KeySchemas.BACKFILL_REQUESTS.sortKey]: requestId
      }
    }).promise();
  },

  /**
   * Update a backfill request
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The unique identifier of the backfill request
   * @param updates - Partial backfill request updates
   * @returns The updated backfill request
   * @throws ResourceNotFoundError if backfill request doesn't exist
   */
  async updateBackfillRequest(
    tenantId: string,
    requestId: string,
    updates: Partial<Omit<BackfillRequest, 'requestId' | 'tenantId' | 'createdAt'>>
  ): Promise<BackfillRequest> {
    const existing = await this.getBackfillRequest(tenantId, requestId);
    if (!existing) {
      throw new ResourceNotFoundError('BackfillRequest', requestId);
    }

    const updatedRequest: BackfillRequest = {
      ...existing,
      ...updates
    };

    await this.putBackfillRequest(updatedRequest);

    return updatedRequest;
  },

  /**
   * Update backfill request status
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The unique identifier of the backfill request
   * @param status - The new status
   * @param completedAt - Optional completion timestamp
   * @returns The updated backfill request
   * @throws ResourceNotFoundError if backfill request doesn't exist
   */
  async updateStatus(
    tenantId: string,
    requestId: string,
    status: BackfillStatus,
    completedAt?: string
  ): Promise<BackfillRequest> {
    const updates: Partial<BackfillRequest> = { status };
    if (completedAt) {
      updates.completedAt = completedAt;
    }
    return this.updateBackfillRequest(tenantId, requestId, updates);
  },

  /**
   * Check if a backfill request exists
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The unique identifier of the backfill request
   * @returns True if the backfill request exists, false otherwise
   */
  async backfillRequestExists(tenantId: string, requestId: string): Promise<boolean> {
    const request = await this.getBackfillRequest(tenantId, requestId);
    return request !== null;
  },

  /**
   * Get active backfill requests for a tenant (QUEUED or PROCESSING)
   * 
   * @param tenantId - The tenant ID
   * @returns List of active backfill requests
   */
  async getActiveBackfillRequests(tenantId: string): Promise<BackfillRequest[]> {
    const result = await this.listBackfillRequests({ tenantId });
    return result.items.filter(
      request => request.status === 'QUEUED' || request.status === 'PROCESSING'
    );
  },

  /**
   * Count active backfill requests for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns Count of active backfill requests
   */
  async countActiveBackfillRequests(tenantId: string): Promise<number> {
    const activeRequests = await this.getActiveBackfillRequests(tenantId);
    return activeRequests.length;
  },

  /**
   * Batch get backfill requests
   * 
   * @param tenantId - The tenant ID
   * @param requestIds - Array of request IDs to retrieve
   * @returns Array of backfill requests (may be fewer than requested if some don't exist)
   */
  async batchGetBackfillRequests(tenantId: string, requestIds: string[]): Promise<BackfillRequest[]> {
    if (requestIds.length === 0) {
      return [];
    }

    const keys = requestIds.map(requestId => ({
      [KeySchemas.BACKFILL_REQUESTS.partitionKey]: tenantId,
      [KeySchemas.BACKFILL_REQUESTS.sortKey]: requestId
    }));

    const result = await documentClient.batchGet({
      RequestItems: {
        [TableNames.BACKFILL_REQUESTS]: {
          Keys: keys
        }
      }
    }).promise();

    const items = result.Responses?.[TableNames.BACKFILL_REQUESTS] || [];
    return items as BackfillRequest[];
  },

  /**
   * Batch delete backfill requests
   * 
   * @param tenantId - The tenant ID
   * @param requestIds - Array of request IDs to delete
   */
  async batchDeleteBackfillRequests(tenantId: string, requestIds: string[]): Promise<void> {
    if (requestIds.length === 0) {
      return;
    }

    const deleteRequests = requestIds.map(requestId => ({
      DeleteRequest: {
        Key: {
          [KeySchemas.BACKFILL_REQUESTS.partitionKey]: tenantId,
          [KeySchemas.BACKFILL_REQUESTS.sortKey]: requestId
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
          [TableNames.BACKFILL_REQUESTS]: batch
        }
      }).promise();
    }
  }
};
