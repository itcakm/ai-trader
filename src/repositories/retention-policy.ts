import { S3 } from 'aws-sdk';
import { RetentionPolicy, RetentionPolicyInput } from '../types/retention';
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
 * S3 bucket for audit data
 */
const AUDIT_BUCKET = process.env.AUDIT_BUCKET || 'audit-data';

/**
 * Default minimum retention days (7 years for regulatory compliance)
 */
const DEFAULT_MINIMUM_RETENTION_DAYS = 2555; // ~7 years

/**
 * Retention Policy Repository - manages retention policy persistence with S3 storage
 * 
 * Uses S3 with tenant-partitioned paths for policy storage.
 * Policies are stored with tenant isolation.
 * 
 * Storage path format: audit/{tenantId}/retention-policies/{recordType}.json
 * 
 * Requirements: 8.1
 */
export const RetentionPolicyRepository = {
  /**
   * Generate S3 key for a retention policy
   */
  generatePolicyKey(tenantId: string, recordType: string): string {
    return `audit/${tenantId}/retention-policies/${recordType}.json`;
  },

  /**
   * Generate prefix for listing policies by tenant
   */
  generatePrefix(tenantId: string): string {
    return `audit/${tenantId}/retention-policies/`;
  },

  /**
   * Store a retention policy in S3
   * 
   * Requirements: 8.1
   * 
   * @param policy - The retention policy to store
   * @returns The stored retention policy
   */
  async putPolicy(policy: RetentionPolicy): Promise<RetentionPolicy> {
    const key = this.generatePolicyKey(policy.tenantId, policy.recordType);

    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(policy),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-tenant-id': policy.tenantId,
        'x-amz-meta-policy-id': policy.policyId,
        'x-amz-meta-record-type': policy.recordType
      }
    }).promise();

    return policy;
  },


  /**
   * Get a retention policy by tenant and record type
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The record type
   * @returns The retention policy, or null if not found
   */
  async getPolicy(tenantId: string, recordType: string): Promise<RetentionPolicy | null> {
    const key = this.generatePolicyKey(tenantId, recordType);

    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const policy = JSON.parse(result.Body.toString()) as RetentionPolicy;

      // Defense in depth: verify tenant ownership
      if (policy.tenantId !== tenantId) {
        throw new Error(`Tenant access denied: ${tenantId}`);
      }

      return policy;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get a retention policy by policy ID
   * 
   * @param tenantId - The tenant identifier
   * @param policyId - The policy identifier
   * @returns The retention policy, or null if not found
   */
  async getPolicyById(tenantId: string, policyId: string): Promise<RetentionPolicy | null> {
    const policies = await this.listPolicies(tenantId);
    return policies.find(p => p.policyId === policyId) || null;
  },

  /**
   * List all retention policies for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns Array of retention policies
   */
  async listPolicies(tenantId: string): Promise<RetentionPolicy[]> {
    const policies: RetentionPolicy[] = [];
    const prefix = this.generatePrefix(tenantId);

    let continuationToken: string | undefined;

    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: AUDIT_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key) continue;

          // Only process JSON files
          if (!obj.Key.endsWith('.json')) continue;

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const policy = JSON.parse(getResult.Body.toString()) as RetentionPolicy;
              if (policy.tenantId === tenantId) {
                policies.push(policy);
              }
            }
          } catch {
            continue;
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    return policies;
  },

  /**
   * Delete a retention policy
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The record type
   */
  async deletePolicy(tenantId: string, recordType: string): Promise<void> {
    const key = this.generatePolicyKey(tenantId, recordType);

    await s3Client.deleteObject({
      Bucket: AUDIT_BUCKET,
      Key: key
    }).promise();
  },

  /**
   * Check if a policy exists
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The record type
   * @returns True if the policy exists
   */
  async policyExists(tenantId: string, recordType: string): Promise<boolean> {
    const key = this.generatePolicyKey(tenantId, recordType);

    try {
      await s3Client.headObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NotFound') {
        return false;
      }
      throw error;
    }
  },

  /**
   * Create a retention policy from input
   * 
   * @param input - The retention policy input
   * @returns The created retention policy
   */
  createPolicyFromInput(input: RetentionPolicyInput): RetentionPolicy {
    return {
      policyId: generateUUID(),
      tenantId: input.tenantId,
      recordType: input.recordType,
      retentionDays: input.retentionDays,
      archiveAfterDays: input.archiveAfterDays,
      minimumRetentionDays: input.minimumRetentionDays ?? DEFAULT_MINIMUM_RETENTION_DAYS,
      enabled: input.enabled ?? true
    };
  },

  /**
   * Get the default minimum retention days
   */
  getDefaultMinimumRetentionDays(): number {
    return DEFAULT_MINIMUM_RETENTION_DAYS;
  },

  /**
   * Get the S3 bucket name (for testing)
   */
  getBucketName(): string {
    return AUDIT_BUCKET;
  },

  /**
   * Get the S3 client (for testing)
   */
  getS3Client(): S3 {
    return s3Client;
  }
};
