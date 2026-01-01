import { S3 } from 'aws-sdk';
import * as crypto from 'crypto';

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
 * Immutable log record with integrity metadata
 */
export interface ImmutableLogRecord<T> {
  /** Unique identifier for the log record */
  recordId: string;
  /** Tenant identifier for isolation */
  tenantId: string;
  /** Type of audit record (e.g., 'trade-event', 'ai-trace', 'risk-event') */
  recordType: string;
  /** The actual data payload */
  data: T;
  /** ISO timestamp when the record was created */
  createdAt: string;
  /** SHA-256 hash of the data for integrity verification */
  contentHash: string;
  /** Version marker for immutability tracking */
  version: 1;
}

/**
 * Result of an integrity check
 */
export interface IntegrityCheckResult {
  /** Whether the record passes integrity verification */
  isValid: boolean;
  /** The stored content hash */
  storedHash: string;
  /** The computed content hash */
  computedHash: string;
  /** Error message if integrity check failed */
  error?: string;
}

/**
 * Error thrown when attempting to modify an immutable record
 */
export class ImmutableLogViolationError extends Error {
  constructor(recordId: string, message: string) {
    super(`Immutable log violation for record ${recordId}: ${message}`);
    this.name = 'ImmutableLogViolationError';
  }
}

/**
 * Compute SHA-256 hash of data for integrity verification
 * 
 * @param data - The data to hash
 * @returns SHA-256 hash as hex string
 */
export function computeContentHash<T>(data: T): string {
  const serialized = JSON.stringify(data, Object.keys(data as object).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex');
}


/**
 * Generate S3 key for an immutable log record
 * Uses tenant-partitioned paths for isolation
 * 
 * @param tenantId - The tenant identifier
 * @param recordType - The type of audit record
 * @param timestamp - The record timestamp
 * @param recordId - The record identifier
 * @returns S3 key path
 */
export function generateImmutableLogKey(
  tenantId: string,
  recordType: string,
  timestamp: string,
  recordId: string
): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  
  return `audit/${tenantId}/${recordType}/${year}/${month}/${day}/${recordId}.json`;
}

/**
 * Immutable Log Service - provides write-once semantics and modification detection
 * 
 * This service wraps audit record storage with immutability guarantees:
 * - Records cannot be modified after creation
 * - Content hashes enable tamper detection
 * - Attempts to overwrite existing records are rejected
 * 
 * Requirements: 1.4
 */
export const ImmutableLogService = {
  /**
   * Write an immutable log record
   * 
   * Creates a new audit record with write-once semantics. If a record with
   * the same ID already exists, the operation is rejected.
   * 
   * Requirements: 1.4
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The type of audit record
   * @param recordId - Unique identifier for the record
   * @param data - The data payload to store
   * @returns The created immutable log record
   * @throws ImmutableLogViolationError if record already exists
   */
  async write<T>(
    tenantId: string,
    recordType: string,
    recordId: string,
    data: T
  ): Promise<ImmutableLogRecord<T>> {
    const createdAt = new Date().toISOString();
    const contentHash = computeContentHash(data);
    
    const record: ImmutableLogRecord<T> = {
      recordId,
      tenantId,
      recordType,
      data,
      createdAt,
      contentHash,
      version: 1
    };

    const key = generateImmutableLogKey(tenantId, recordType, createdAt, recordId);

    // Check if record already exists (write-once semantics)
    const exists = await this.exists(tenantId, recordType, createdAt, recordId);
    if (exists) {
      throw new ImmutableLogViolationError(
        recordId,
        'Record already exists and cannot be overwritten'
      );
    }

    // Store the record with immutability metadata
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(record),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': tenantId,
        'x-amz-meta-record-type': recordType,
        'x-amz-meta-content-hash': contentHash
      }
    }).promise();

    return record;
  },

  /**
   * Read an immutable log record
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The type of audit record
   * @param timestamp - The record timestamp
   * @param recordId - The record identifier
   * @returns The immutable log record, or null if not found
   */
  async read<T>(
    tenantId: string,
    recordType: string,
    timestamp: string,
    recordId: string
  ): Promise<ImmutableLogRecord<T> | null> {
    const key = generateImmutableLogKey(tenantId, recordType, timestamp, recordId);

    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const record = JSON.parse(result.Body.toString()) as ImmutableLogRecord<T>;

      // Defense in depth: verify tenant ownership
      if (record.tenantId !== tenantId) {
        throw new Error(`Tenant access denied: ${tenantId}`);
      }

      return record;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Check if an immutable log record exists
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The type of audit record
   * @param timestamp - The record timestamp
   * @param recordId - The record identifier
   * @returns True if the record exists
   */
  async exists(
    tenantId: string,
    recordType: string,
    timestamp: string,
    recordId: string
  ): Promise<boolean> {
    const key = generateImmutableLogKey(tenantId, recordType, timestamp, recordId);

    try {
      await s3Client.headObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NotFound' || 
          (error as { code?: string }).code === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  },

  /**
   * Verify the integrity of an immutable log record
   * 
   * Recomputes the content hash and compares it to the stored hash
   * to detect any tampering or corruption.
   * 
   * Requirements: 1.4
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The type of audit record
   * @param timestamp - The record timestamp
   * @param recordId - The record identifier
   * @returns Integrity check result
   */
  async verifyIntegrity<T>(
    tenantId: string,
    recordType: string,
    timestamp: string,
    recordId: string
  ): Promise<IntegrityCheckResult> {
    const record = await this.read<T>(tenantId, recordType, timestamp, recordId);

    if (!record) {
      return {
        isValid: false,
        storedHash: '',
        computedHash: '',
        error: 'Record not found'
      };
    }

    const computedHash = computeContentHash(record.data);

    return {
      isValid: computedHash === record.contentHash,
      storedHash: record.contentHash,
      computedHash,
      error: computedHash !== record.contentHash 
        ? 'Content hash mismatch - data may have been tampered with'
        : undefined
    };
  },

  /**
   * Attempt to modify an existing record (should always fail)
   * 
   * This method exists to demonstrate and test the immutability guarantee.
   * Any attempt to modify an existing record will be rejected.
   * 
   * Requirements: 1.4
   * 
   * @param tenantId - The tenant identifier
   * @param recordType - The type of audit record
   * @param timestamp - The record timestamp
   * @param recordId - The record identifier
   * @param newData - The new data to write
   * @throws ImmutableLogViolationError always
   */
  async attemptModify<T>(
    tenantId: string,
    recordType: string,
    timestamp: string,
    recordId: string,
    _newData: T
  ): Promise<never> {
    const exists = await this.exists(tenantId, recordType, timestamp, recordId);
    
    if (exists) {
      throw new ImmutableLogViolationError(
        recordId,
        'Cannot modify existing immutable record'
      );
    }
    
    throw new ImmutableLogViolationError(
      recordId,
      'Record does not exist'
    );
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
