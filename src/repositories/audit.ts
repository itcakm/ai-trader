import { S3 } from 'aws-sdk';
import { AuditRecord, AuditFilters, DateRange } from '../types/audit';

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
 * S3 bucket name for audit logs
 */
export const AUDIT_LOGS_BUCKET = process.env.AUDIT_LOGS_BUCKET || 'audit-logs';

/**
 * Generate S3 key for an audit record with tenant partitioning
 * Path format: audit/{tenantId}/{year}/{month}/{day}/{auditId}.json
 * 
 * Requirements: 10.1, 10.2
 */
export function getAuditKey(tenantId: string, timestamp: string, auditId: string): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `audit/${tenantId}/${year}/${month}/${day}/${auditId}.json`;
}

/**
 * Generate S3 prefix for listing audit records by tenant and date range
 */
export function getAuditPrefix(tenantId: string, year?: number, month?: number, day?: number): string {
  let prefix = `audit/${tenantId}/`;
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
 * Parse audit record metadata from S3 key
 */
export function parseAuditKey(key: string): { tenantId: string; year: number; month: number; day: number; auditId: string } | null {
  const match = key.match(/^audit\/([^/]+)\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\.json$/);
  if (!match) {
    return null;
  }
  return {
    tenantId: match[1],
    year: parseInt(match[2], 10),
    month: parseInt(match[3], 10),
    day: parseInt(match[4], 10),
    auditId: match[5]
  };
}

/**
 * Tenant access denied error
 */
export class TenantAccessDeniedError extends Error {
  constructor(tenantId: string, resourceType: string) {
    super(`Access denied: tenant ${tenantId} cannot access ${resourceType}`);
    this.name = 'TenantAccessDeniedError';
  }
}

/**
 * Audit record not found error
 */
export class AuditRecordNotFoundError extends Error {
  constructor(auditId: string) {
    super(`Audit record not found: ${auditId}`);
    this.name = 'AuditRecordNotFoundError';
  }
}


/**
 * Audit Repository - manages audit record persistence in S3 with tenant partitioning
 * 
 * Audit records are stored in S3 with the following path structure:
 * audit/{tenantId}/{year}/{month}/{day}/{auditId}.json
 * 
 * This enables:
 * - Tenant isolation through path-based partitioning
 * - Efficient date-range queries using S3 prefixes
 * - Easy lifecycle management for retention policies
 * 
 * Requirements: 10.1, 10.2
 */
export const AuditRepository = {
  /**
   * Store an audit record in S3
   * 
   * @param record - The audit record to store
   */
  async putAuditRecord(record: AuditRecord): Promise<void> {
    const key = getAuditKey(record.tenantId, record.timestamp, record.auditId);
    
    await s3Client.putObject({
      Bucket: AUDIT_LOGS_BUCKET,
      Key: key,
      Body: JSON.stringify(record, null, 2),
      ContentType: 'application/json',
      // Set expiration based on retention period
      ...(record.retentionExpiresAt && {
        Expires: new Date(record.retentionExpiresAt)
      })
    }).promise();
  },

  /**
   * Get an audit record by ID with tenant validation
   * 
   * Requirements: 10.4
   * 
   * @param tenantId - The tenant ID making the request
   * @param auditId - The audit record ID
   * @param timestamp - The timestamp of the record (for key construction)
   * @returns The audit record, or null if not found
   * @throws TenantAccessDeniedError if tenant doesn't own the record
   */
  async getAuditRecord(
    tenantId: string,
    auditId: string,
    timestamp: string
  ): Promise<AuditRecord | null> {
    const key = getAuditKey(tenantId, timestamp, auditId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_LOGS_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const record = JSON.parse(result.Body.toString('utf-8')) as AuditRecord;
      
      // Verify tenant ownership (defense in depth)
      if (record.tenantId !== tenantId) {
        throw new TenantAccessDeniedError(tenantId, 'audit record');
      }

      return record;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * List audit records for a tenant with optional filters
   * 
   * Requirements: 10.4
   * 
   * @param tenantId - The tenant ID
   * @param filters - Optional filters for the query
   * @returns List of audit records matching the filters
   */
  async listAuditRecords(
    tenantId: string,
    filters?: AuditFilters
  ): Promise<AuditRecord[]> {
    const records: AuditRecord[] = [];
    const limit = filters?.limit ?? 100;
    
    // Determine the prefix based on date filters
    let prefix = getAuditPrefix(tenantId);
    
    if (filters?.startDate) {
      const startDate = new Date(filters.startDate);
      prefix = getAuditPrefix(
        tenantId,
        startDate.getUTCFullYear(),
        startDate.getUTCMonth() + 1
      );
    }

    try {
      let continuationToken: string | undefined;
      
      do {
        const listResult = await s3Client.listObjectsV2({
          Bucket: AUDIT_LOGS_BUCKET,
          Prefix: prefix,
          MaxKeys: Math.min(limit - records.length, 1000),
          ContinuationToken: continuationToken
        }).promise();

        if (!listResult.Contents) {
          break;
        }

        // Fetch and filter records
        for (const obj of listResult.Contents) {
          if (!obj.Key || records.length >= limit) {
            break;
          }

          const record = await this.fetchAndFilterRecord(tenantId, obj.Key, filters);
          if (record) {
            records.push(record);
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken && records.length < limit);

    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }

    return records;
  },

  /**
   * Fetch a record and apply filters
   */
  async fetchAndFilterRecord(
    tenantId: string,
    key: string,
    filters?: AuditFilters
  ): Promise<AuditRecord | null> {
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_LOGS_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const record = JSON.parse(result.Body.toString('utf-8')) as AuditRecord;

      // Verify tenant ownership
      if (record.tenantId !== tenantId) {
        return null;
      }

      // Apply filters
      if (filters?.modelConfigId && record.modelConfigId !== filters.modelConfigId) {
        return null;
      }

      if (filters?.analysisType && record.analysisType !== filters.analysisType) {
        return null;
      }

      if (filters?.startDate && record.timestamp < filters.startDate) {
        return null;
      }

      if (filters?.endDate && record.timestamp > filters.endDate) {
        return null;
      }

      return record;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Delete an audit record
   * 
   * @param tenantId - The tenant ID
   * @param auditId - The audit record ID
   * @param timestamp - The timestamp of the record
   */
  async deleteAuditRecord(
    tenantId: string,
    auditId: string,
    timestamp: string
  ): Promise<void> {
    const key = getAuditKey(tenantId, timestamp, auditId);
    
    await s3Client.deleteObject({
      Bucket: AUDIT_LOGS_BUCKET,
      Key: key
    }).promise();
  },

  /**
   * Export audit records for a date range to a single archive file
   * 
   * Requirements: 10.5
   * 
   * @param tenantId - The tenant ID
   * @param dateRange - The date range to export
   * @returns S3 URL of the exported archive
   */
  async exportAuditPackage(
    tenantId: string,
    dateRange: DateRange
  ): Promise<string> {
    const records = await this.listAuditRecords(tenantId, {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: 10000 // Max records per export
    });

    const exportKey = `exports/${tenantId}/${Date.now()}-audit-export.json`;
    
    await s3Client.putObject({
      Bucket: AUDIT_LOGS_BUCKET,
      Key: exportKey,
      Body: JSON.stringify({
        tenantId,
        exportedAt: new Date().toISOString(),
        dateRange,
        recordCount: records.length,
        records
      }, null, 2),
      ContentType: 'application/json'
    }).promise();

    // Generate a pre-signed URL for download (valid for 1 hour)
    const url = await s3Client.getSignedUrlPromise('getObject', {
      Bucket: AUDIT_LOGS_BUCKET,
      Key: exportKey,
      Expires: 3600
    });

    return url;
  },

  /**
   * Check if an audit record exists
   * 
   * @param tenantId - The tenant ID
   * @param auditId - The audit record ID
   * @param timestamp - The timestamp of the record
   * @returns True if the record exists
   */
  async auditRecordExists(
    tenantId: string,
    auditId: string,
    timestamp: string
  ): Promise<boolean> {
    const key = getAuditKey(tenantId, timestamp, auditId);
    
    try {
      await s3Client.headObject({
        Bucket: AUDIT_LOGS_BUCKET,
        Key: key
      }).promise();
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  },

  /**
   * Get count of audit records for a tenant in a date range
   * 
   * @param tenantId - The tenant ID
   * @param dateRange - Optional date range
   * @returns Count of audit records
   */
  async countAuditRecords(
    tenantId: string,
    dateRange?: DateRange
  ): Promise<number> {
    let prefix = getAuditPrefix(tenantId);
    
    if (dateRange?.startDate) {
      const startDate = new Date(dateRange.startDate);
      prefix = getAuditPrefix(
        tenantId,
        startDate.getUTCFullYear(),
        startDate.getUTCMonth() + 1
      );
    }

    let count = 0;
    let continuationToken: string | undefined;

    try {
      do {
        const listResult = await s3Client.listObjectsV2({
          Bucket: AUDIT_LOGS_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken
        }).promise();

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
  }
};
