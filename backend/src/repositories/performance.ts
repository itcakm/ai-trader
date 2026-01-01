import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import {
  ModelPerformance,
  PerformancePrediction,
  PerformanceMetrics,
  PerformancePeriod,
  createEmptyMetrics
} from '../types/performance';
import { ResourceNotFoundError, TenantAccessDeniedError, PaginatedResult } from '../db/access';
import { generateUUID } from '../utils/uuid';

/**
 * Query parameters for listing predictions
 */
export interface PredictionQueryParams {
  tenantId: string;
  modelConfigId?: string;
  validated?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Query parameters for listing performance records
 */
export interface PerformanceQueryParams {
  tenantId: string;
  modelConfigId: string;
  period?: PerformancePeriod;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Creates a composite partition key for performance records
 * Format: tenantId#modelConfigId
 */
function createPerformancePartitionKey(tenantId: string, modelConfigId: string): string {
  return `${tenantId}#${modelConfigId}`;
}

/**
 * Creates a composite sort key for performance records
 * Format: period#periodStart
 */
function createPerformanceSortKey(period: PerformancePeriod, periodStart: string): string {
  return `${period}#${periodStart}`;
}

/**
 * Parses a composite partition key back to tenantId and modelConfigId
 */
function parsePerformancePartitionKey(key: string): { tenantId: string; modelConfigId: string } {
  const hashIndex = key.indexOf('#');
  return {
    tenantId: key.substring(0, hashIndex),
    modelConfigId: key.substring(hashIndex + 1)
  };
}

/**
 * Performance Repository - manages model performance and prediction persistence
 * 
 * Requirements: 6.2, 6.3
 */
export const PerformanceRepository = {
  // ==================== Prediction Operations ====================

  /**
   * Get a prediction by tenant and prediction ID
   */
  async getPrediction(
    tenantId: string,
    predictionId: string
  ): Promise<PerformancePrediction | null> {
    const result = await documentClient.get({
      TableName: TableNames.PREDICTIONS,
      Key: {
        [KeySchemas.PREDICTIONS.partitionKey]: tenantId,
        [KeySchemas.PREDICTIONS.sortKey]: predictionId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Verify tenant ownership (defense in depth)
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'prediction');
    }

    return result.Item as PerformancePrediction;
  },

  /**
   * Create a new prediction record
   */
  async createPrediction(
    prediction: Omit<PerformancePrediction, 'predictionId'>
  ): Promise<PerformancePrediction> {
    const predictionId = generateUUID();
    
    const fullPrediction: PerformancePrediction = {
      ...prediction,
      predictionId
    };

    await documentClient.put({
      TableName: TableNames.PREDICTIONS,
      Item: fullPrediction,
      ConditionExpression: 'attribute_not_exists(predictionId)'
    }).promise();

    return fullPrediction;
  },

  /**
   * Update a prediction with validation results
   */
  async updatePrediction(
    tenantId: string,
    predictionId: string,
    updates: Partial<Pick<PerformancePrediction, 'validated' | 'actualRegime' | 'correct'>>
  ): Promise<PerformancePrediction> {
    const existing = await this.getPrediction(tenantId, predictionId);
    if (!existing) {
      throw new ResourceNotFoundError('PerformancePrediction', predictionId);
    }

    const updatedPrediction: PerformancePrediction = {
      ...existing,
      ...updates
    };

    await documentClient.put({
      TableName: TableNames.PREDICTIONS,
      Item: updatedPrediction
    }).promise();

    return updatedPrediction;
  },

  /**
   * List predictions for a tenant with optional filters
   */
  async listPredictions(
    params: PredictionQueryParams
  ): Promise<PaginatedResult<PerformancePrediction>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.PREDICTIONS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.PREDICTIONS.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': params.tenantId
      }
    };

    // Build filter expressions
    const filterConditions: string[] = [];
    
    if (params.modelConfigId) {
      filterConditions.push('#modelConfigId = :modelConfigId');
      queryParams.ExpressionAttributeNames!['#modelConfigId'] = 'modelConfigId';
      queryParams.ExpressionAttributeValues![':modelConfigId'] = params.modelConfigId;
    }

    if (params.validated !== undefined) {
      filterConditions.push('#validated = :validated');
      queryParams.ExpressionAttributeNames!['#validated'] = 'validated';
      queryParams.ExpressionAttributeValues![':validated'] = params.validated;
    }

    if (params.startDate) {
      filterConditions.push('#timestamp >= :startDate');
      queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      queryParams.ExpressionAttributeValues![':startDate'] = params.startDate;
    }

    if (params.endDate) {
      if (!queryParams.ExpressionAttributeNames!['#timestamp']) {
        queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      }
      filterConditions.push('#timestamp <= :endDate');
      queryParams.ExpressionAttributeValues![':endDate'] = params.endDate;
    }

    if (filterConditions.length > 0) {
      queryParams.FilterExpression = filterConditions.join(' AND ');
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as PerformancePrediction[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List predictions by model using GSI
   */
  async listPredictionsByModel(
    modelConfigId: string,
    params: {
      startDate?: string;
      endDate?: string;
      limit?: number;
      exclusiveStartKey?: DynamoDB.DocumentClient.Key;
    } = {}
  ): Promise<PaginatedResult<PerformancePrediction>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.PREDICTIONS,
      IndexName: GSINames.PREDICTIONS.MODEL_TIMESTAMP_INDEX,
      KeyConditionExpression: '#modelConfigId = :modelConfigId',
      ExpressionAttributeNames: {
        '#modelConfigId': 'modelConfigId'
      },
      ExpressionAttributeValues: {
        ':modelConfigId': modelConfigId
      }
    };

    // Add timestamp range if provided
    if (params.startDate && params.endDate) {
      queryParams.KeyConditionExpression += ' AND #timestamp BETWEEN :startDate AND :endDate';
      queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      queryParams.ExpressionAttributeValues![':startDate'] = params.startDate;
      queryParams.ExpressionAttributeValues![':endDate'] = params.endDate;
    } else if (params.startDate) {
      queryParams.KeyConditionExpression += ' AND #timestamp >= :startDate';
      queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      queryParams.ExpressionAttributeValues![':startDate'] = params.startDate;
    } else if (params.endDate) {
      queryParams.KeyConditionExpression += ' AND #timestamp <= :endDate';
      queryParams.ExpressionAttributeNames!['#timestamp'] = 'timestamp';
      queryParams.ExpressionAttributeValues![':endDate'] = params.endDate;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as PerformancePrediction[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Get unvalidated predictions for a model
   */
  async getUnvalidatedPredictions(
    tenantId: string,
    modelConfigId: string,
    limit: number = 100
  ): Promise<PerformancePrediction[]> {
    const result = await this.listPredictions({
      tenantId,
      modelConfigId,
      validated: false,
      limit
    });
    return result.items;
  },

  // ==================== Performance Operations ====================

  /**
   * Get performance metrics for a model and period
   */
  async getPerformance(
    tenantId: string,
    modelConfigId: string,
    period: PerformancePeriod,
    periodStart: string
  ): Promise<ModelPerformance | null> {
    const partitionKey = createPerformancePartitionKey(tenantId, modelConfigId);
    const sortKey = createPerformanceSortKey(period, periodStart);

    const result = await documentClient.get({
      TableName: TableNames.PERFORMANCE,
      Key: {
        [KeySchemas.PERFORMANCE.partitionKey]: partitionKey,
        [KeySchemas.PERFORMANCE.sortKey]: sortKey
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return result.Item as ModelPerformance;
  },

  /**
   * Create or update performance metrics
   */
  async upsertPerformance(
    performance: ModelPerformance
  ): Promise<ModelPerformance> {
    const partitionKey = createPerformancePartitionKey(
      performance.tenantId,
      performance.modelConfigId
    );
    const sortKey = createPerformanceSortKey(
      performance.period,
      performance.periodStart
    );

    const item = {
      ...performance,
      [KeySchemas.PERFORMANCE.partitionKey]: partitionKey,
      [KeySchemas.PERFORMANCE.sortKey]: sortKey
    };

    await documentClient.put({
      TableName: TableNames.PERFORMANCE,
      Item: item
    }).promise();

    return performance;
  },

  /**
   * List performance records for a model
   */
  async listPerformance(
    params: PerformanceQueryParams
  ): Promise<PaginatedResult<ModelPerformance>> {
    const partitionKey = createPerformancePartitionKey(
      params.tenantId,
      params.modelConfigId
    );

    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.PERFORMANCE,
      KeyConditionExpression: '#pk = :partitionKey',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.PERFORMANCE.partitionKey
      },
      ExpressionAttributeValues: {
        ':partitionKey': partitionKey
      }
    };

    // Filter by period if specified
    if (params.period) {
      queryParams.KeyConditionExpression += ' AND begins_with(#sk, :periodPrefix)';
      queryParams.ExpressionAttributeNames!['#sk'] = KeySchemas.PERFORMANCE.sortKey;
      queryParams.ExpressionAttributeValues![':periodPrefix'] = `${params.period}#`;
    }

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as ModelPerformance[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Get the latest performance record for a model and period type
   */
  async getLatestPerformance(
    tenantId: string,
    modelConfigId: string,
    period: PerformancePeriod
  ): Promise<ModelPerformance | null> {
    const partitionKey = createPerformancePartitionKey(tenantId, modelConfigId);

    const result = await documentClient.query({
      TableName: TableNames.PERFORMANCE,
      KeyConditionExpression: '#pk = :partitionKey AND begins_with(#sk, :periodPrefix)',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.PERFORMANCE.partitionKey,
        '#sk': KeySchemas.PERFORMANCE.sortKey
      },
      ExpressionAttributeValues: {
        ':partitionKey': partitionKey,
        ':periodPrefix': `${period}#`
      },
      ScanIndexForward: false, // Descending order to get latest first
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as ModelPerformance;
  },

  /**
   * Get or create performance record for current period
   */
  async getOrCreatePerformance(
    tenantId: string,
    modelConfigId: string,
    period: PerformancePeriod,
    periodStart: string
  ): Promise<ModelPerformance> {
    const existing = await this.getPerformance(tenantId, modelConfigId, period, periodStart);
    
    if (existing) {
      return existing;
    }

    const newPerformance: ModelPerformance = {
      performanceId: generateUUID(),
      tenantId,
      modelConfigId,
      period,
      periodStart,
      metrics: createEmptyMetrics(),
      updatedAt: new Date().toISOString()
    };

    return this.upsertPerformance(newPerformance);
  },

  /**
   * Delete a prediction
   */
  async deletePrediction(
    tenantId: string,
    predictionId: string
  ): Promise<void> {
    const existing = await this.getPrediction(tenantId, predictionId);
    if (!existing) {
      throw new ResourceNotFoundError('PerformancePrediction', predictionId);
    }

    await documentClient.delete({
      TableName: TableNames.PREDICTIONS,
      Key: {
        [KeySchemas.PREDICTIONS.partitionKey]: tenantId,
        [KeySchemas.PREDICTIONS.sortKey]: predictionId
      }
    }).promise();
  },

  /**
   * Check if a prediction exists
   */
  async predictionExists(
    tenantId: string,
    predictionId: string
  ): Promise<boolean> {
    const prediction = await this.getPrediction(tenantId, predictionId);
    return prediction !== null;
  }
};
