/**
 * Exchange Audit Repository
 *
 * Manages persistence of exchange audit logs in DynamoDB.
 * Provides tenant-isolated access to audit data with TTL support.
 *
 * Requirements: 2.6
 */

import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { ExchangeAuditLog, ExchangeAuditFilters } from '../types/exchange-audit';
import { TenantAccessDeniedError } from '../db/access';

/**
 * Table name for exchange audit logs
 */
const TABLE_NAME = process.env.EXCHANGE_AUDIT_LOGS_TABLE || 'exchange-audit-logs';

/**
 * Key schema for exchange audit logs table
 * - Partition Key: tenantId (for tenant isolation)
 * - Sort Key: timestamp#logId (for time-based queries)
 */
const KEY_SCHEMA = {
  partitionKey: 'tenantId',
  sortKey: 'timestampLogId',
};

/**
 * Default TTL in days for audit logs (90 days)
 */
const DEFAULT_TTL_DAYS = 90;

/**
 * Generate the sort key from timestamp and logId
 */
function generateSortKey(timestamp: string, logId: string): string {
  return `${timestamp}#${logId}`;
}

/**
 * Parse the sort key to extract timestamp and logId
 */
function parseSortKey(sortKey: string): { timestamp: string; logId: string } {
  const parts = sortKey.split('#');
  return {
    timestamp: parts[0],
    logId: parts.slice(1).join('#'),
  };
}

/**
 * Calculate TTL timestamp (Unix seconds) from current time
 */
function calculateTTL(ttlDays: number = DEFAULT_TTL_DAYS): number {
  const now = Date.now();
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  return Math.floor((now + ttlMs) / 1000);
}

/**
 * Exchange Audit Repository - manages exchange audit log persistence
 */
export const ExchangeAuditRepository = {
  /**
   * Store an audit log entry
   *
   * @param log - The audit log entry to store
   * @param ttlDays - Optional TTL in days (defaults to 90)
   */
  async putAuditLog(log: ExchangeAuditLog, ttlDays?: number): Promise<void> {
    const sortKey = generateSortKey(log.timestamp, log.logId);
    const expiresAt = log.expiresAt ?? calculateTTL(ttlDays);

    const item = {
      ...log,
      [KEY_SCHEMA.sortKey]: sortKey,
      expiresAt,
    };

    await documentClient
      .put({
        TableName: TABLE_NAME,
        Item: item,
      })
      .promise();
  },

  /**
   * Get an audit log entry by tenant, timestamp, and logId
   *
   * @param tenantId - The tenant identifier
   * @param timestamp - The timestamp of the log entry
   * @param logId - The log entry identifier
   * @returns The audit log entry, or null if not found
   */
  async getAuditLog(
    tenantId: string,
    timestamp: string,
    logId: string
  ): Promise<ExchangeAuditLog | null> {
    const sortKey = generateSortKey(timestamp, logId);

    const result = await documentClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
          [KEY_SCHEMA.sortKey]: sortKey,
        },
      })
      .promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'exchange audit log');
    }

    // Remove the composite sort key from the returned object
    const { timestampLogId, ...log } = result.Item as ExchangeAuditLog & { timestampLogId: string };
    return log;
  },

  /**
   * List audit logs for a tenant with optional filters
   *
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters for the query
   * @returns List of audit log entries
   */
  async listAuditLogs(
    tenantId: string,
    filters?: ExchangeAuditFilters
  ): Promise<ExchangeAuditLog[]> {
    const limit = filters?.limit ?? 100;

    // Build the query
    let keyConditionExpression = '#pk = :tenantId';
    const expressionAttributeNames: Record<string, string> = {
      '#pk': KEY_SCHEMA.partitionKey,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':tenantId': tenantId,
    };

    // Add time range filter to key condition if provided
    if (filters?.startTime && filters?.endTime) {
      keyConditionExpression += ' AND #sk BETWEEN :startTime AND :endTime';
      expressionAttributeNames['#sk'] = KEY_SCHEMA.sortKey;
      expressionAttributeValues[':startTime'] = filters.startTime;
      expressionAttributeValues[':endTime'] = `${filters.endTime}~`; // ~ is after # in ASCII
    } else if (filters?.startTime) {
      keyConditionExpression += ' AND #sk >= :startTime';
      expressionAttributeNames['#sk'] = KEY_SCHEMA.sortKey;
      expressionAttributeValues[':startTime'] = filters.startTime;
    } else if (filters?.endTime) {
      keyConditionExpression += ' AND #sk <= :endTime';
      expressionAttributeNames['#sk'] = KEY_SCHEMA.sortKey;
      expressionAttributeValues[':endTime'] = `${filters.endTime}~`;
    }

    // Build filter expression for non-key attributes
    const filterConditions: string[] = [];

    if (filters?.exchangeId) {
      filterConditions.push('#exchangeId = :exchangeId');
      expressionAttributeNames['#exchangeId'] = 'exchangeId';
      expressionAttributeValues[':exchangeId'] = filters.exchangeId;
    }

    if (filters?.operationType) {
      filterConditions.push('#operationType = :operationType');
      expressionAttributeNames['#operationType'] = 'operationType';
      expressionAttributeValues[':operationType'] = filters.operationType;
    }

    if (filters?.success !== undefined) {
      filterConditions.push('#success = :success');
      expressionAttributeNames['#success'] = 'success';
      expressionAttributeValues[':success'] = filters.success;
    }

    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit,
      ScanIndexForward: false, // Most recent first
    };

    if (filterConditions.length > 0) {
      queryParams.FilterExpression = filterConditions.join(' AND ');
    }

    const result = await documentClient.query(queryParams).promise();

    // Remove the composite sort key from returned objects
    return (result.Items || []).map((item) => {
      const { timestampLogId, ...log } = item as ExchangeAuditLog & { timestampLogId: string };
      return log;
    });
  },

  /**
   * Delete an audit log entry
   *
   * @param tenantId - The tenant identifier
   * @param timestamp - The timestamp of the log entry
   * @param logId - The log entry identifier
   */
  async deleteAuditLog(
    tenantId: string,
    timestamp: string,
    logId: string
  ): Promise<void> {
    const sortKey = generateSortKey(timestamp, logId);

    await documentClient
      .delete({
        TableName: TABLE_NAME,
        Key: {
          [KEY_SCHEMA.partitionKey]: tenantId,
          [KEY_SCHEMA.sortKey]: sortKey,
        },
      })
      .promise();
  },

  /**
   * Count audit logs for a tenant with optional filters
   *
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters
   * @returns Count of matching audit logs
   */
  async countAuditLogs(
    tenantId: string,
    filters?: ExchangeAuditFilters
  ): Promise<number> {
    // Build the query similar to listAuditLogs but with Select: 'COUNT'
    let keyConditionExpression = '#pk = :tenantId';
    const expressionAttributeNames: Record<string, string> = {
      '#pk': KEY_SCHEMA.partitionKey,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':tenantId': tenantId,
    };

    if (filters?.startTime && filters?.endTime) {
      keyConditionExpression += ' AND #sk BETWEEN :startTime AND :endTime';
      expressionAttributeNames['#sk'] = KEY_SCHEMA.sortKey;
      expressionAttributeValues[':startTime'] = filters.startTime;
      expressionAttributeValues[':endTime'] = `${filters.endTime}~`;
    }

    const filterConditions: string[] = [];

    if (filters?.exchangeId) {
      filterConditions.push('#exchangeId = :exchangeId');
      expressionAttributeNames['#exchangeId'] = 'exchangeId';
      expressionAttributeValues[':exchangeId'] = filters.exchangeId;
    }

    if (filters?.operationType) {
      filterConditions.push('#operationType = :operationType');
      expressionAttributeNames['#operationType'] = 'operationType';
      expressionAttributeValues[':operationType'] = filters.operationType;
    }

    if (filters?.success !== undefined) {
      filterConditions.push('#success = :success');
      expressionAttributeNames['#success'] = 'success';
      expressionAttributeValues[':success'] = filters.success;
    }

    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      Select: 'COUNT',
    };

    if (filterConditions.length > 0) {
      queryParams.FilterExpression = filterConditions.join(' AND ');
    }

    let count = 0;
    let lastEvaluatedKey: DynamoDB.DocumentClient.Key | undefined;

    do {
      if (lastEvaluatedKey) {
        queryParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await documentClient.query(queryParams).promise();
      count += result.Count ?? 0;
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return count;
  },

  /**
   * Get audit logs by exchange ID
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param limit - Maximum number of results
   * @returns List of audit log entries for the exchange
   */
  async getAuditLogsByExchange(
    tenantId: string,
    exchangeId: string,
    limit?: number
  ): Promise<ExchangeAuditLog[]> {
    return this.listAuditLogs(tenantId, { exchangeId: exchangeId as any, limit });
  },
};
