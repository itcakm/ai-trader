/**
 * Data Source Repository - manages data source persistence and retrieval
 * 
 * Data sources are stored with sourceId as partition key.
 * Supports CRUD operations for DataSource entities in DynamoDB.
 * 
 * Requirements: 1.1, 1.2
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { DataSource, DataSourceType, DataSourceStatus } from '../types/data-source';
import { ResourceNotFoundError, PaginatedResult } from '../db/access';

/**
 * Query parameters for listing data sources
 */
export interface DataSourceQueryParams {
  type?: DataSourceType;
  status?: DataSourceStatus;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Data Source Repository
 */
export const DataSourceRepository = {
  /**
   * Get a data source by ID
   * 
   * @param sourceId - The unique identifier of the data source
   * @returns The data source, or null if not found
   */
  async getDataSource(sourceId: string): Promise<DataSource | null> {
    const result = await documentClient.get({
      TableName: TableNames.DATA_SOURCES,
      Key: {
        [KeySchemas.DATA_SOURCES.partitionKey]: sourceId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return result.Item as DataSource;
  },

  /**
   * List all data sources with optional filtering
   * 
   * @param params - Query parameters including optional type/status filters and pagination
   * @returns Paginated list of data sources
   */
  async listDataSources(params: DataSourceQueryParams = {}): Promise<PaginatedResult<DataSource>> {
    // If filtering by type, use the type GSI
    if (params.type) {
      return this.listByType(params.type, params);
    }

    // If filtering by status, use the status GSI
    if (params.status) {
      return this.listByStatus(params.status, params);
    }

    // Otherwise, scan all data sources
    const scanParams: DynamoDB.DocumentClient.ScanInput = {
      TableName: TableNames.DATA_SOURCES
    };

    if (params.limit) {
      scanParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      scanParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.scan(scanParams).promise();

    return {
      items: (result.Items || []) as DataSource[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List data sources by type using GSI
   */
  async listByType(
    type: DataSourceType,
    params: Omit<DataSourceQueryParams, 'type'> = {}
  ): Promise<PaginatedResult<DataSource>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DATA_SOURCES,
      IndexName: GSINames.DATA_SOURCES.TYPE_INDEX,
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
      items: (result.Items || []) as DataSource[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List data sources by status using GSI
   */
  async listByStatus(
    status: DataSourceStatus,
    params: Omit<DataSourceQueryParams, 'status'> = {}
  ): Promise<PaginatedResult<DataSource>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DATA_SOURCES,
      IndexName: GSINames.DATA_SOURCES.STATUS_INDEX,
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
      items: (result.Items || []) as DataSource[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a data source
   * 
   * @param dataSource - The data source to save
   */
  async putDataSource(dataSource: DataSource): Promise<void> {
    await documentClient.put({
      TableName: TableNames.DATA_SOURCES,
      Item: dataSource
    }).promise();
  },

  /**
   * Delete a data source
   * 
   * @param sourceId - The unique identifier of the data source to delete
   * @throws ResourceNotFoundError if data source doesn't exist
   */
  async deleteDataSource(sourceId: string): Promise<void> {
    const existing = await this.getDataSource(sourceId);
    if (!existing) {
      throw new ResourceNotFoundError('DataSource', sourceId);
    }

    await documentClient.delete({
      TableName: TableNames.DATA_SOURCES,
      Key: {
        [KeySchemas.DATA_SOURCES.partitionKey]: sourceId
      }
    }).promise();
  },

  /**
   * Update a data source
   * 
   * @param sourceId - The unique identifier of the data source
   * @param updates - Partial data source updates
   * @returns The updated data source
   * @throws ResourceNotFoundError if data source doesn't exist
   */
  async updateDataSource(
    sourceId: string,
    updates: Partial<Omit<DataSource, 'sourceId' | 'createdAt'>>
  ): Promise<DataSource> {
    const existing = await this.getDataSource(sourceId);
    if (!existing) {
      throw new ResourceNotFoundError('DataSource', sourceId);
    }

    const now = new Date().toISOString();
    
    const updatedDataSource: DataSource = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await this.putDataSource(updatedDataSource);

    return updatedDataSource;
  },

  /**
   * Check if a data source exists
   * 
   * @param sourceId - The unique identifier of the data source
   * @returns True if the data source exists, false otherwise
   */
  async dataSourceExists(sourceId: string): Promise<boolean> {
    const dataSource = await this.getDataSource(sourceId);
    return dataSource !== null;
  },

  /**
   * Get active data sources by type, ordered by priority
   * 
   * @param type - The data source type
   * @returns List of active data sources sorted by priority (ascending)
   */
  async getActiveSourcesByType(type: DataSourceType): Promise<DataSource[]> {
    const result = await this.listByType(type);
    
    return result.items
      .filter(source => source.status === 'ACTIVE')
      .sort((a, b) => a.priority - b.priority);
  }
};
