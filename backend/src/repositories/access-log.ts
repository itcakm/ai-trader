import { S3 } from 'aws-sdk';
import { AccessLogEntry, AccessLogInput } from '../types/audit-access';
import { generateUUID } from '../utils/uuid';

/**
 * S3 client configuration
 */
const s3Config: S3.ClientConfiguration = {
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.S3_ENDPOINT && {
    endpoint: process.env.S3_ENDPOINT,
    s3ForcePathStyle: true
  })
};

/**
 * S3 client instance
 */
export const s3Client = new S3(s3Config);

/**
 * S3 bucket name for access logs
 */
export const ACCESS_LOGS_BUCKET = process.env.ACCESS_LOGS_BUCKET || 'audit-access-logs';

/**
 * Generate S3 key for an access log entry with tenant partitioning
 * Path format: access-logs/{tenantId}/{year}/{month}/{day}/{logId}.json
 * 
 * Requirements: 9.4
 */
export function getAccessLogKey(tenantId: string, timestamp: string, logId: string): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `access-logs/${tenantId}/${year}/${month}/${day}/${logId}.json`;
}

/**
 * Generate S3 prefix for listing access logs by tenant and date range
 */
export function getAccessLogPrefix(
  tenantId: string,
  year?: number,
  month?: number,
  day?: number
): string {
  let prefix = `access-logs/${tenantId}/`;
  if (year !== undefined) {
    prefix += `${year}/`;
    if (month !== undefined) {
      prefix += `${String(month).padStart(2, '0')}/`;
      if (day !== undefined) {
        prefix += `${String(day).padStart(2, '0')}/`;
      }
    }
  }
  return prefix;
}

/**
 * Parse access log metadata from S3 key
 */
export function parseAccessLogKey(key: string): {
  tenantId: string;
  year: number;
  month: number;
  day: number;
  logId: string;
} | null {
  const match = key.match(
    /^access-logs\/([^/]+)\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\.json$/
  );
  if (!match) {
    return null;
  }
  return {
    tenantId: match[1],
    year: parseInt(match[2], 10),
    month: parseInt(match[3], 10),
    day: parseInt(match[4], 10),
    logId: match[5]
  };
}

/**
 * Access log filters for querying
 */
export interface AccessLogFilters {
  startDate?: string;
  endDate?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  success?: boolean;
  limit?: number;
}

/**
 * Access Log Repository - manages access log persistence in S3 with tenant partitioning
 * 
 * Access logs are stored in S3 with the following path structure:
 * access-logs/{tenantId}/{year}/{month}/{day}/{logId}.json
 * 
 * This enables:
 * - Tenant isolation through path-based partitioning
 * - Efficient date-range queries using S3 prefixes
 * - Audit trail for all access events
 * 
 * Requirements: 9.4
 */
export const AccessLogRepository = {
  /**
   * Store an access log entry in S3
   * 
   * @param input - The access log input to store
   * @returns The created access log entry
   */
  async putAccessLog(input: AccessLogInput): Promise<AccessLogEntry> {
    const logId = generateUUID();
    const timestamp = new Date().toISOString();
    
    const entry: AccessLogEntry = {
      logId,
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      timestamp,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      success: input.success,
      failureReason: input.failureReason
    };

    const key = getAccessLogKey(entry.tenantId, entry.timestamp, entry.logId);

    await s3Client
      .putObject({
        Bucket: ACCESS_LOGS_BUCKET,
        Key: key,
        Body: JSON.stringify(entry, null, 2),
        ContentType: 'application/json'
      })
      .promise();

    return entry;
  },

  /**
   * Get an access log entry by ID with tenant validation
   * 
   * @param tenantId - The tenant ID making the request
   * @param logId - The access log ID
   * @param timestamp - The timestamp of the log (for key construction)
   * @returns The access log entry, or null if not found
   */
  async getAccessLog(
    tenantId: string,
    logId: string,
    timestamp: string
  ): Promise<AccessLogEntry | null> {
    const key = getAccessLogKey(tenantId, timestamp, logId);

    try {
      const result = await s3Client
        .getObject({
          Bucket: ACCESS_LOGS_BUCKET,
          Key: key
        })
        .promise();

      if (!result.Body) {
        return null;
      }

      const entry = JSON.parse(result.Body.toString('utf-8')) as AccessLogEntry;

      // Verify tenant ownership (defense in depth)
      if (entry.tenantId !== tenantId) {
        return null;
      }

      return entry;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * List access logs for a tenant with optional filters
   * 
   * @param tenantId - The tenant ID
   * @param filters - Optional filters for the query
   * @returns List of access log entries matching the filters
   */
  async listAccessLogs(
    tenantId: string,
    filters?: AccessLogFilters
  ): Promise<AccessLogEntry[]> {
    const entries: AccessLogEntry[] = [];
    const limit = filters?.limit ?? 100;

    // Determine the prefix based on date filters
    let prefix = getAccessLogPrefix(tenantId);

    if (filters?.startDate) {
      const startDate = new Date(filters.startDate);
      prefix = getAccessLogPrefix(
        tenantId,
        startDate.getUTCFullYear(),
        startDate.getUTCMonth() + 1
      );
    }

    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: ACCESS_LOGS_BUCKET,
            Prefix: prefix,
            MaxKeys: Math.min(limit - entries.length, 1000),
            ContinuationToken: continuationToken
          })
          .promise();

        if (!listResult.Contents) {
          break;
        }

        // Fetch and filter entries
        for (const obj of listResult.Contents) {
          if (!obj.Key || entries.length >= limit) {
            break;
          }

          const entry = await this.fetchAndFilterEntry(tenantId, obj.Key, filters);
          if (entry) {
            entries.push(entry);
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken && entries.length < limit);
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }

    return entries;
  },

  /**
   * Fetch an entry and apply filters
   */
  async fetchAndFilterEntry(
    tenantId: string,
    key: string,
    filters?: AccessLogFilters
  ): Promise<AccessLogEntry | null> {
    try {
      const result = await s3Client
        .getObject({
          Bucket: ACCESS_LOGS_BUCKET,
          Key: key
        })
        .promise();

      if (!result.Body) {
        return null;
      }

      const entry = JSON.parse(result.Body.toString('utf-8')) as AccessLogEntry;

      // Verify tenant ownership
      if (entry.tenantId !== tenantId) {
        return null;
      }

      // Apply filters
      if (filters?.userId && entry.userId !== filters.userId) {
        return null;
      }

      if (filters?.action && entry.action !== filters.action) {
        return null;
      }

      if (filters?.resourceType && entry.resourceType !== filters.resourceType) {
        return null;
      }

      if (filters?.success !== undefined && entry.success !== filters.success) {
        return null;
      }

      if (filters?.startDate && entry.timestamp < filters.startDate) {
        return null;
      }

      if (filters?.endDate && entry.timestamp > filters.endDate) {
        return null;
      }

      return entry;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Count access logs for a tenant in a date range
   * 
   * @param tenantId - The tenant ID
   * @param startDate - Optional start date
   * @param endDate - Optional end date
   * @returns Count of access log entries
   */
  async countAccessLogs(
    tenantId: string,
    startDate?: string,
    endDate?: string
  ): Promise<number> {
    let prefix = getAccessLogPrefix(tenantId);

    if (startDate) {
      const start = new Date(startDate);
      prefix = getAccessLogPrefix(
        tenantId,
        start.getUTCFullYear(),
        start.getUTCMonth() + 1
      );
    }

    let count = 0;
    let continuationToken: string | undefined;

    try {
      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: ACCESS_LOGS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken
          })
          .promise();

        count += listResult.KeyCount ?? 0;
        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return 0;
      }
      throw error;
    }

    return count;
  },

  /**
   * Get access logs by user ID
   * 
   * @param tenantId - The tenant ID
   * @param userId - The user ID to filter by
   * @param limit - Maximum number of entries to return
   * @returns List of access log entries for the user
   */
  async getAccessLogsByUser(
    tenantId: string,
    userId: string,
    limit: number = 100
  ): Promise<AccessLogEntry[]> {
    return this.listAccessLogs(tenantId, { userId, limit });
  },

  /**
   * Get access logs by resource
   * 
   * @param tenantId - The tenant ID
   * @param resourceType - The resource type to filter by
   * @param resourceId - Optional specific resource ID
   * @param limit - Maximum number of entries to return
   * @returns List of access log entries for the resource
   */
  async getAccessLogsByResource(
    tenantId: string,
    resourceType: string,
    resourceId?: string,
    limit: number = 100
  ): Promise<AccessLogEntry[]> {
    const entries = await this.listAccessLogs(tenantId, { resourceType, limit });
    
    if (resourceId) {
      return entries.filter(e => e.resourceId === resourceId);
    }
    
    return entries;
  },

  /**
   * Get failed access attempts
   * 
   * @param tenantId - The tenant ID
   * @param limit - Maximum number of entries to return
   * @returns List of failed access log entries
   */
  async getFailedAccessAttempts(
    tenantId: string,
    limit: number = 100
  ): Promise<AccessLogEntry[]> {
    return this.listAccessLogs(tenantId, { success: false, limit });
  }
};
