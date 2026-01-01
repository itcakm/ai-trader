import { S3 } from 'aws-sdk';
import {
  RetentionPolicy,
  RetentionPolicyInput,
  StorageUsage,
  ArchiveResult,
  RetrievalJob,
  DeletionValidation,
  RetentionManager
} from '../types/retention';
import { RetentionPolicyRepository } from '../repositories/retention-policy';
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

const s3Client = new S3(s3Config);

/**
 * S3 buckets for audit data
 */
const AUDIT_BUCKET = process.env.AUDIT_BUCKET || 'audit-data';
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET || 'audit-archive';

/**
 * Storage cost estimates (USD per GB per month)
 */
const HOT_STORAGE_COST_PER_GB = 0.023; // S3 Standard
const COLD_STORAGE_COST_PER_GB = 0.004; // S3 Glacier

/**
 * Record types that can have retention policies
 */
const VALID_RECORD_TYPES = [
  'TRADE_EVENT',
  'AI_TRACE',
  'RISK_EVENT',
  'DATA_LINEAGE',
  'ACCESS_LOG',
  'AUDIT_PACKAGE',
  'COMPLIANCE_REPORT'
];

/**
 * Retention Manager Service - manages data retention policies and archival
 * 
 * Implements the RetentionManager interface for configuring retention policies,
 * archiving expired records, retrieving archived data, and tracking storage usage.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export const RetentionManagerService: RetentionManager = {
  /**
   * Configure a retention policy for a record type
   * 
   * Requirements: 8.1, 8.3
   * 
   * @param input - The retention policy input
   * @returns The configured retention policy
   */
  async setPolicy(input: RetentionPolicyInput): Promise<RetentionPolicy> {
    // Validate record type
    if (!VALID_RECORD_TYPES.includes(input.recordType)) {
      throw new Error(`Invalid record type: ${input.recordType}. Valid types: ${VALID_RECORD_TYPES.join(', ')}`);
    }

    // Get default minimum retention days
    const defaultMinRetention = RetentionPolicyRepository.getDefaultMinimumRetentionDays();
    const minimumRetentionDays = input.minimumRetentionDays ?? defaultMinRetention;

    // Enforce minimum retention period (Requirements: 8.3)
    if (input.retentionDays < minimumRetentionDays) {
      throw new Error(
        `Retention period (${input.retentionDays} days) cannot be less than minimum retention period (${minimumRetentionDays} days)`
      );
    }

    // Validate archive timing
    if (input.archiveAfterDays >= input.retentionDays) {
      throw new Error(
        `Archive period (${input.archiveAfterDays} days) must be less than retention period (${input.retentionDays} days)`
      );
    }

    // Check if policy already exists
    const existingPolicy = await RetentionPolicyRepository.getPolicy(input.tenantId, input.recordType);

    let policy: RetentionPolicy;
    if (existingPolicy) {
      // Update existing policy
      policy = {
        ...existingPolicy,
        retentionDays: input.retentionDays,
        archiveAfterDays: input.archiveAfterDays,
        minimumRetentionDays,
        enabled: input.enabled ?? existingPolicy.enabled
      };
    } else {
      // Create new policy
      policy = RetentionPolicyRepository.createPolicyFromInput({
        ...input,
        minimumRetentionDays
      });
    }

    return RetentionPolicyRepository.putPolicy(policy);
  },


  /**
   * Archive records that have exceeded their archive period
   * 
   * Requirements: 8.2
   * 
   * @param tenantId - The tenant identifier
   * @returns The archive operation result
   */
  async archiveExpiredRecords(tenantId: string): Promise<ArchiveResult> {
    const policies = await RetentionPolicyRepository.listPolicies(tenantId);
    const enabledPolicies = policies.filter(p => p.enabled);

    let totalRecordsArchived = 0;
    let totalBytesArchived = 0;
    const recordTypeCounts: Record<string, number> = {};

    for (const policy of enabledPolicies) {
      const archiveResult = await archiveRecordsForPolicy(tenantId, policy);
      totalRecordsArchived += archiveResult.recordsArchived;
      totalBytesArchived += archiveResult.bytesArchived;
      if (archiveResult.recordsArchived > 0) {
        recordTypeCounts[policy.recordType] = archiveResult.recordsArchived;
      }
    }

    return {
      tenantId,
      recordsArchived: totalRecordsArchived,
      bytesArchived: totalBytesArchived,
      recordTypes: recordTypeCounts,
      completedAt: new Date().toISOString()
    };
  },

  /**
   * Retrieve archived records
   * 
   * Requirements: 8.4
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The record type to retrieve
   * @param timeRange - The time range for retrieval
   * @returns The retrieval job
   */
  async retrieveArchivedRecords(
    tenantId: string,
    recordType: string,
    timeRange: { startDate: string; endDate: string }
  ): Promise<RetrievalJob> {
    // Validate record type
    if (!VALID_RECORD_TYPES.includes(recordType)) {
      throw new Error(`Invalid record type: ${recordType}`);
    }

    // Validate time range
    const startDate = new Date(timeRange.startDate);
    const endDate = new Date(timeRange.endDate);
    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    const jobId = generateUUID();
    const createdAt = new Date().toISOString();

    // Create retrieval job
    const job: RetrievalJob = {
      jobId,
      tenantId,
      recordType,
      timeRange,
      status: 'PENDING',
      estimatedCompletionTime: calculateEstimatedCompletionTime(startDate, endDate),
      createdAt
    };

    // Store job metadata
    await storeRetrievalJob(job);

    // Initiate async retrieval (in production, this would trigger a background job)
    initiateArchiveRetrieval(job).catch(err => {
      console.error(`Archive retrieval failed for job ${jobId}:`, err);
    });

    return job;
  },

  /**
   * Get storage usage metrics for a tenant
   * 
   * Requirements: 8.5
   * 
   * @param tenantId - The tenant identifier
   * @returns The storage usage metrics
   */
  async getStorageUsage(tenantId: string): Promise<StorageUsage> {
    const hotStorageBytes = await calculateStorageSize(AUDIT_BUCKET, `audit/${tenantId}/`);
    const coldStorageBytes = await calculateStorageSize(ARCHIVE_BUCKET, `archive/${tenantId}/`);
    const totalBytes = hotStorageBytes + coldStorageBytes;

    // Calculate estimated monthly cost
    const hotStorageGB = hotStorageBytes / (1024 * 1024 * 1024);
    const coldStorageGB = coldStorageBytes / (1024 * 1024 * 1024);
    const estimatedMonthlyCostUsd = 
      (hotStorageGB * HOT_STORAGE_COST_PER_GB) + 
      (coldStorageGB * COLD_STORAGE_COST_PER_GB);

    // Get record counts by type
    const recordCounts = await getRecordCounts(tenantId);

    return {
      tenantId,
      hotStorageBytes,
      coldStorageBytes,
      totalBytes,
      estimatedMonthlyCostUsd: Math.round(estimatedMonthlyCostUsd * 100) / 100,
      recordCounts,
      asOfTimestamp: new Date().toISOString()
    };
  },

  /**
   * Validate a deletion request against retention policies
   * 
   * Requirements: 8.6
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The record type
   * @param recordIds - The record IDs to validate for deletion
   * @returns The deletion validation result
   */
  async validateDeletion(
    tenantId: string,
    recordType: string,
    recordIds: string[]
  ): Promise<DeletionValidation> {
    // Validate record type
    if (!VALID_RECORD_TYPES.includes(recordType)) {
      throw new Error(`Invalid record type: ${recordType}`);
    }

    // Get retention policy for this record type
    const policy = await RetentionPolicyRepository.getPolicy(tenantId, recordType);
    
    if (!policy) {
      // No policy means use default minimum retention
      const defaultMinRetention = RetentionPolicyRepository.getDefaultMinimumRetentionDays();
      return validateRecordsAgainstRetention(
        tenantId,
        recordType,
        recordIds,
        defaultMinRetention
      );
    }

    // Use the policy's minimum retention days
    return validateRecordsAgainstRetention(
      tenantId,
      recordType,
      recordIds,
      policy.minimumRetentionDays
    );
  }
};


/**
 * Archive records for a specific policy
 */
async function archiveRecordsForPolicy(
  tenantId: string,
  policy: RetentionPolicy
): Promise<{ recordsArchived: number; bytesArchived: number }> {
  const archiveThreshold = new Date();
  archiveThreshold.setDate(archiveThreshold.getDate() - policy.archiveAfterDays);

  const recordTypeToPath: Record<string, string> = {
    'TRADE_EVENT': 'trade-events',
    'AI_TRACE': 'ai-traces',
    'RISK_EVENT': 'risk-events',
    'DATA_LINEAGE': 'lineage-nodes',
    'ACCESS_LOG': 'access-logs',
    'AUDIT_PACKAGE': 'packages',
    'COMPLIANCE_REPORT': 'reports'
  };

  const pathSegment = recordTypeToPath[policy.recordType] || policy.recordType.toLowerCase();
  const prefix = `audit/${tenantId}/${pathSegment}/`;

  let recordsArchived = 0;
  let bytesArchived = 0;
  let continuationToken: string | undefined;

  do {
    const listResult = await s3Client.listObjectsV2({
      Bucket: AUDIT_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }).promise();

    if (listResult.Contents) {
      for (const obj of listResult.Contents) {
        if (!obj.Key || !obj.LastModified || !obj.Size) continue;

        // Check if object is older than archive threshold
        if (obj.LastModified < archiveThreshold) {
          // Move to archive bucket
          const archiveKey = obj.Key.replace('audit/', 'archive/');
          
          try {
            // Copy to archive
            await s3Client.copyObject({
              Bucket: ARCHIVE_BUCKET,
              CopySource: `${AUDIT_BUCKET}/${obj.Key}`,
              Key: archiveKey,
              StorageClass: 'GLACIER'
            }).promise();

            // Delete from hot storage
            await s3Client.deleteObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            recordsArchived++;
            bytesArchived += obj.Size;
          } catch (err) {
            console.error(`Failed to archive ${obj.Key}:`, err);
          }
        }
      }
    }

    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);

  return { recordsArchived, bytesArchived };
}

/**
 * Calculate estimated completion time for archive retrieval
 */
function calculateEstimatedCompletionTime(startDate: Date, endDate: Date): string {
  // Glacier retrieval typically takes 3-5 hours for standard retrieval
  // Estimate based on date range (more data = longer retrieval)
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const baseHours = 4; // Base retrieval time
  const additionalHours = Math.min(daysDiff / 30, 8); // Add time for larger ranges
  
  const completionTime = new Date();
  completionTime.setHours(completionTime.getHours() + baseHours + additionalHours);
  
  return completionTime.toISOString();
}

/**
 * Store retrieval job metadata
 */
async function storeRetrievalJob(job: RetrievalJob): Promise<void> {
  const key = `audit/${job.tenantId}/retrieval-jobs/${job.jobId}.json`;
  
  await s3Client.putObject({
    Bucket: AUDIT_BUCKET,
    Key: key,
    Body: JSON.stringify(job),
    ContentType: 'application/json'
  }).promise();
}

/**
 * Initiate archive retrieval (async operation)
 */
async function initiateArchiveRetrieval(job: RetrievalJob): Promise<void> {
  const recordTypeToPath: Record<string, string> = {
    'TRADE_EVENT': 'trade-events',
    'AI_TRACE': 'ai-traces',
    'RISK_EVENT': 'risk-events',
    'DATA_LINEAGE': 'lineage-nodes',
    'ACCESS_LOG': 'access-logs',
    'AUDIT_PACKAGE': 'packages',
    'COMPLIANCE_REPORT': 'reports'
  };

  const pathSegment = recordTypeToPath[job.recordType] || job.recordType.toLowerCase();
  const prefix = `archive/${job.tenantId}/${pathSegment}/`;

  // Update job status to IN_PROGRESS
  job.status = 'IN_PROGRESS';
  await storeRetrievalJob(job);

  try {
    // List objects in archive that match the time range
    const objectsToRestore: string[] = [];
    let continuationToken: string | undefined;

    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: ARCHIVE_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key || !obj.LastModified) continue;

          const startDate = new Date(job.timeRange.startDate);
          const endDate = new Date(job.timeRange.endDate);

          if (obj.LastModified >= startDate && obj.LastModified <= endDate) {
            objectsToRestore.push(obj.Key);
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Initiate restore for each object
    for (const key of objectsToRestore) {
      await s3Client.restoreObject({
        Bucket: ARCHIVE_BUCKET,
        Key: key,
        RestoreRequest: {
          Days: 7, // Keep restored copy for 7 days
          GlacierJobParameters: {
            Tier: 'Standard' // 3-5 hours retrieval
          }
        }
      }).promise().catch(() => {
        // Ignore errors for already-restored objects
      });
    }

    // Update job status to COMPLETED
    job.status = 'COMPLETED';
    job.completedAt = new Date().toISOString();
    job.downloadUrl = `https://${ARCHIVE_BUCKET}.s3.amazonaws.com/${prefix}`;
    await storeRetrievalJob(job);
  } catch (err) {
    // Update job status to FAILED
    job.status = 'FAILED';
    await storeRetrievalJob(job);
    throw err;
  }
}


/**
 * Calculate storage size for a prefix
 */
async function calculateStorageSize(bucket: string, prefix: string): Promise<number> {
  let totalSize = 0;
  let continuationToken: string | undefined;

  try {
    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          totalSize += obj.Size || 0;
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    // Return 0 if bucket doesn't exist or access denied
    console.error(`Failed to calculate storage size for ${bucket}/${prefix}:`, err);
    return 0;
  }

  return totalSize;
}

/**
 * Get record counts by type for a tenant
 */
async function getRecordCounts(tenantId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  
  const recordTypeToPath: Record<string, string> = {
    'TRADE_EVENT': 'trade-events',
    'AI_TRACE': 'ai-traces',
    'RISK_EVENT': 'risk-events',
    'DATA_LINEAGE': 'lineage-nodes',
    'ACCESS_LOG': 'access-logs',
    'AUDIT_PACKAGE': 'packages',
    'COMPLIANCE_REPORT': 'reports'
  };

  for (const [recordType, pathSegment] of Object.entries(recordTypeToPath)) {
    const prefix = `audit/${tenantId}/${pathSegment}/`;
    let count = 0;
    let continuationToken: string | undefined;

    try {
      do {
        const listResult = await s3Client.listObjectsV2({
          Bucket: AUDIT_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken
        }).promise();

        count += listResult.KeyCount || 0;
        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);

      counts[recordType] = count;
    } catch {
      counts[recordType] = 0;
    }
  }

  return counts;
}

/**
 * Validate records against retention period
 * 
 * Requirements: 8.6
 */
async function validateRecordsAgainstRetention(
  tenantId: string,
  recordType: string,
  recordIds: string[],
  minimumRetentionDays: number
): Promise<DeletionValidation> {
  const retentionThreshold = new Date();
  retentionThreshold.setDate(retentionThreshold.getDate() - minimumRetentionDays);

  const recordTypeToPath: Record<string, string> = {
    'TRADE_EVENT': 'trade-events',
    'AI_TRACE': 'ai-traces',
    'RISK_EVENT': 'risk-events',
    'DATA_LINEAGE': 'lineage-nodes',
    'ACCESS_LOG': 'access-logs',
    'AUDIT_PACKAGE': 'packages',
    'COMPLIANCE_REPORT': 'reports'
  };

  const pathSegment = recordTypeToPath[recordType] || recordType.toLowerCase();
  const protectedRecordIds: string[] = [];

  for (const recordId of recordIds) {
    // Try to find the record and check its creation date
    const prefix = `audit/${tenantId}/${pathSegment}/`;
    let found = false;

    let continuationToken: string | undefined;
    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: AUDIT_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key || !obj.LastModified) continue;

          // Check if this object matches the record ID
          if (obj.Key.includes(recordId)) {
            found = true;
            // Check if record is within retention period
            if (obj.LastModified > retentionThreshold) {
              protectedRecordIds.push(recordId);
            }
            break;
          }
        }
      }

      if (found) break;
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // If record not found in hot storage, assume it's protected
    // (could be in archive or not exist)
    if (!found) {
      protectedRecordIds.push(recordId);
    }
  }

  const allowed = protectedRecordIds.length === 0;

  return {
    allowed,
    recordsChecked: recordIds.length,
    recordsProtected: protectedRecordIds.length,
    protectedRecordIds,
    reason: allowed 
      ? undefined 
      : `${protectedRecordIds.length} record(s) are within the minimum retention period of ${minimumRetentionDays} days`
  };
}

/**
 * Get a retrieval job by ID
 */
export async function getRetrievalJob(tenantId: string, jobId: string): Promise<RetrievalJob | null> {
  const key = `audit/${tenantId}/retrieval-jobs/${jobId}.json`;

  try {
    const result = await s3Client.getObject({
      Bucket: AUDIT_BUCKET,
      Key: key
    }).promise();

    if (!result.Body) {
      return null;
    }

    return JSON.parse(result.Body.toString()) as RetrievalJob;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * Get all policies for a tenant
 */
export async function getPolicies(tenantId: string): Promise<RetentionPolicy[]> {
  return RetentionPolicyRepository.listPolicies(tenantId);
}

/**
 * Get a specific policy
 */
export async function getPolicy(tenantId: string, recordType: string): Promise<RetentionPolicy | null> {
  return RetentionPolicyRepository.getPolicy(tenantId, recordType);
}

/**
 * Check if a record is within its retention period
 */
export function isWithinRetentionPeriod(
  recordTimestamp: string,
  minimumRetentionDays: number
): boolean {
  const recordDate = new Date(recordTimestamp);
  const retentionThreshold = new Date();
  retentionThreshold.setDate(retentionThreshold.getDate() - minimumRetentionDays);
  
  return recordDate > retentionThreshold;
}

/**
 * Check if a record should be archived
 */
export function shouldArchive(
  recordTimestamp: string,
  archiveAfterDays: number
): boolean {
  const recordDate = new Date(recordTimestamp);
  const archiveThreshold = new Date();
  archiveThreshold.setDate(archiveThreshold.getDate() - archiveAfterDays);
  
  return recordDate < archiveThreshold;
}

/**
 * Get valid record types
 */
export function getValidRecordTypes(): string[] {
  return [...VALID_RECORD_TYPES];
}
