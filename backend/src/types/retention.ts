/**
 * Retention Policy Types
 * Requirements: 8.1
 */

/**
 * Retention policy configuration
 * Requirements: 8.1, 8.3
 */
export interface RetentionPolicy {
  policyId: string;
  tenantId: string;
  recordType: string;
  retentionDays: number;
  archiveAfterDays: number;
  minimumRetentionDays: number;
  enabled: boolean;
}

/**
 * Input for creating/updating a retention policy
 */
export interface RetentionPolicyInput {
  tenantId: string;
  recordType: string;
  retentionDays: number;
  archiveAfterDays: number;
  minimumRetentionDays?: number;
  enabled?: boolean;
}

/**
 * Storage usage metrics
 * Requirements: 8.5
 */
export interface StorageUsage {
  tenantId: string;
  hotStorageBytes: number;
  coldStorageBytes: number;
  totalBytes: number;
  estimatedMonthlyCostUsd: number;
  recordCounts: Record<string, number>;
  asOfTimestamp: string;
}

/**
 * Archive operation result
 * Requirements: 8.2
 */
export interface ArchiveResult {
  tenantId: string;
  recordsArchived: number;
  bytesArchived: number;
  recordTypes: Record<string, number>;
  completedAt: string;
}

/**
 * Retrieval job for archived records
 * Requirements: 8.4
 */
export interface RetrievalJob {
  jobId: string;
  tenantId: string;
  recordType: string;
  timeRange: { startDate: string; endDate: string };
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  estimatedCompletionTime?: string;
  downloadUrl?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Deletion validation result
 * Requirements: 8.6
 */
export interface DeletionValidation {
  allowed: boolean;
  recordsChecked: number;
  recordsProtected: number;
  protectedRecordIds: string[];
  reason?: string;
}

/**
 * Retention Manager Service Interface
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export interface RetentionManager {
  setPolicy(policy: RetentionPolicyInput): Promise<RetentionPolicy>;
  archiveExpiredRecords(tenantId: string): Promise<ArchiveResult>;
  retrieveArchivedRecords(
    tenantId: string,
    recordType: string,
    timeRange: { startDate: string; endDate: string }
  ): Promise<RetrievalJob>;
  getStorageUsage(tenantId: string): Promise<StorageUsage>;
  validateDeletion(
    tenantId: string,
    recordType: string,
    recordIds: string[]
  ): Promise<DeletionValidation>;
}
