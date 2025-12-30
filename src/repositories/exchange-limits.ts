import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { ResourceNotFoundError, PaginatedResult } from '../db/access';

/**
 * Exchange Limits Types
 * Requirements: 9.1
 */
export interface ExchangeLimits {
  exchangeId: string;
  assetId: string;
  minOrderSize: number;
  maxOrderSize: number;
  minPrice: number;
  maxPrice: number;
  maxPriceDeviationPercent: number;
  tickSize: number;
  lotSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeHealth {
  exchangeId: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  latencyMs: number;
  errorRate: number;
  rateLimitRemaining: number;
  rateLimitResetAt: string;
  lastCheckedAt: string;
}

export interface RateLimitState {
  exchangeId: string;
  remaining: number;
  limit: number;
  resetAt: string;
  windowStart: string;
  requestCount: number;
  updatedAt: string;
}

/**
 * Exchange Limits Repository - manages exchange-specific limits persistence
 * 
 * Exchange limits are stored with exchangeId as partition key and assetId as sort key,
 * allowing efficient queries for all limits on an exchange or specific asset limits.
 * 
 * Requirements: 9.1
 */
export const ExchangeLimitsRepository = {
  /**
   * Get exchange limits for a specific asset
   */
  async getLimits(exchangeId: string, assetId: string): Promise<ExchangeLimits | null> {
    const result = await documentClient.get({
      TableName: TableNames.EXCHANGE_LIMITS,
      Key: {
        [KeySchemas.EXCHANGE_LIMITS.partitionKey]: exchangeId,
        [KeySchemas.EXCHANGE_LIMITS.sortKey]: assetId
      }
    }).promise();

    return result.Item as ExchangeLimits | null;
  },

  /**
   * List all limits for an exchange
   */
  async listLimitsByExchange(exchangeId: string): Promise<ExchangeLimits[]> {
    const result = await documentClient.query({
      TableName: TableNames.EXCHANGE_LIMITS,
      KeyConditionExpression: '#pk = :exchangeId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.EXCHANGE_LIMITS.partitionKey
      },
      ExpressionAttributeValues: {
        ':exchangeId': exchangeId
      }
    }).promise();

    return (result.Items || []) as ExchangeLimits[];
  },

  /**
   * Save exchange limits
   */
  async putLimits(limits: ExchangeLimits): Promise<void> {
    await documentClient.put({
      TableName: TableNames.EXCHANGE_LIMITS,
      Item: limits
    }).promise();
  },

  /**
   * Delete exchange limits
   */
  async deleteLimits(exchangeId: string, assetId: string): Promise<void> {
    await documentClient.delete({
      TableName: TableNames.EXCHANGE_LIMITS,
      Key: {
        [KeySchemas.EXCHANGE_LIMITS.partitionKey]: exchangeId,
        [KeySchemas.EXCHANGE_LIMITS.sortKey]: assetId
      }
    }).promise();
  },

  /**
   * Get exchange health status
   */
  async getHealth(exchangeId: string): Promise<ExchangeHealth | null> {
    const result = await documentClient.get({
      TableName: TableNames.EXCHANGE_HEALTH,
      Key: {
        [KeySchemas.EXCHANGE_HEALTH.partitionKey]: exchangeId
      }
    }).promise();

    return result.Item as ExchangeHealth | null;
  },

  /**
   * Update exchange health status
   */
  async putHealth(health: ExchangeHealth): Promise<void> {
    await documentClient.put({
      TableName: TableNames.EXCHANGE_HEALTH,
      Item: health
    }).promise();
  },

  /**
   * Get rate limit state for an exchange
   */
  async getRateLimitState(exchangeId: string): Promise<RateLimitState | null> {
    const result = await documentClient.get({
      TableName: TableNames.RATE_LIMIT_STATE,
      Key: {
        [KeySchemas.RATE_LIMIT_STATE.partitionKey]: exchangeId
      }
    }).promise();

    return result.Item as RateLimitState | null;
  },

  /**
   * Update rate limit state
   */
  async putRateLimitState(state: RateLimitState): Promise<void> {
    await documentClient.put({
      TableName: TableNames.RATE_LIMIT_STATE,
      Item: state
    }).promise();
  },

  /**
   * Increment request count atomically
   */
  async incrementRequestCount(exchangeId: string, increment: number = 1): Promise<RateLimitState | null> {
    try {
      const result = await documentClient.update({
        TableName: TableNames.RATE_LIMIT_STATE,
        Key: {
          [KeySchemas.RATE_LIMIT_STATE.partitionKey]: exchangeId
        },
        UpdateExpression: 'SET requestCount = requestCount + :inc, updatedAt = :now',
        ExpressionAttributeValues: {
          ':inc': increment,
          ':now': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      }).promise();

      return result.Attributes as RateLimitState;
    } catch (error) {
      // If item doesn't exist, return null
      return null;
    }
  }
};
