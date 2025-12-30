import { S3 } from 'aws-sdk';
import { AITrace, AITraceInput, AIInputSnapshot, DecisionInfluence } from '../types/ai-trace';
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
 * AI Trace Repository - manages AI trace persistence with S3 storage
 * 
 * Uses S3 with tenant-partitioned paths for immutable log storage.
 * Traces are stored with tenant isolation and support time-based queries.
 * 
 * Storage path format: audit/{tenantId}/ai-traces/{year}/{month}/{day}/{traceId}.json
 * Input snapshots: audit/{tenantId}/ai-traces/{year}/{month}/{day}/{traceId}-snapshot.json
 * Decision influences: audit/{tenantId}/ai-traces/{year}/{month}/{day}/{traceId}-influences/{influenceId}.json
 * 
 * Requirements: 2.1, 2.6
 */
export const AITraceRepository = {
  /**
   * Generate S3 key for an AI trace
   * Uses tenant-partitioned paths for isolation
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @returns S3 key path
   */
  generateKey(tenantId: string, timestamp: string, traceId: string): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    return `audit/${tenantId}/ai-traces/${year}/${month}/${day}/${traceId}.json`;
  },


  /**
   * Generate S3 key for an AI input snapshot
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @returns S3 key path for the snapshot
   */
  generateSnapshotKey(tenantId: string, timestamp: string, traceId: string): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    return `audit/${tenantId}/ai-traces/${year}/${month}/${day}/${traceId}-snapshot.json`;
  },

  /**
   * Generate S3 key for a decision influence record
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @param influenceId - The influence record identifier
   * @returns S3 key path for the influence record
   */
  generateInfluenceKey(tenantId: string, timestamp: string, traceId: string, influenceId: string): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    return `audit/${tenantId}/ai-traces/${year}/${month}/${day}/${traceId}-influences/${influenceId}.json`;
  },

  /**
   * Generate prefix for listing traces by tenant and date range
   * 
   * @param tenantId - The tenant identifier
   * @param year - Optional year filter
   * @param month - Optional month filter
   * @param day - Optional day filter
   * @returns S3 prefix path
   */
  generatePrefix(tenantId: string, year?: number, month?: number, day?: number): string {
    let prefix = `audit/${tenantId}/ai-traces/`;
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
  },

  /**
   * Store an AI trace as an immutable record in S3
   * 
   * Requirements: 2.1
   * 
   * @param trace - The AI trace to store
   * @returns The stored AI trace
   */
  async putTrace(trace: AITrace): Promise<AITrace> {
    const key = this.generateKey(trace.tenantId, trace.timestamp, trace.traceId);
    
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(trace),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': trace.tenantId,
        'x-amz-meta-trace-id': trace.traceId,
        'x-amz-meta-analysis-type': trace.analysisType,
        ...(trace.correlationId && { 'x-amz-meta-correlation-id': trace.correlationId })
      }
    }).promise();

    // Store input snapshot separately for reproducibility (Requirements: 2.6)
    await this.putInputSnapshot(trace.tenantId, trace.timestamp, trace.traceId, trace.inputSnapshot);

    return trace;
  },


  /**
   * Store an AI input snapshot for reproducibility
   * 
   * Requirements: 2.6
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @param snapshot - The input snapshot to store
   */
  async putInputSnapshot(tenantId: string, timestamp: string, traceId: string, snapshot: AIInputSnapshot): Promise<void> {
    const key = this.generateSnapshotKey(tenantId, timestamp, traceId);
    
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(snapshot),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': tenantId,
        'x-amz-meta-trace-id': traceId,
        'x-amz-meta-type': 'input-snapshot'
      }
    }).promise();
  },

  /**
   * Store a decision influence record
   * 
   * Requirements: 2.4
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param influence - The decision influence record
   * @returns The influence ID
   */
  async putDecisionInfluence(tenantId: string, timestamp: string, influence: DecisionInfluence): Promise<string> {
    const influenceId = generateUUID();
    const key = this.generateInfluenceKey(tenantId, timestamp, influence.traceId, influenceId);
    
    const record = {
      influenceId,
      ...influence,
      recordedAt: new Date().toISOString()
    };
    
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(record),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': tenantId,
        'x-amz-meta-trace-id': influence.traceId,
        'x-amz-meta-type': 'decision-influence'
      }
    }).promise();

    return influenceId;
  },

  /**
   * Get an AI trace by ID
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @returns The AI trace, or null if not found
   */
  async getTrace(tenantId: string, timestamp: string, traceId: string): Promise<AITrace | null> {
    const key = this.generateKey(tenantId, timestamp, traceId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const trace = JSON.parse(result.Body.toString()) as AITrace;
      
      // Defense in depth: verify tenant ownership
      if (trace.tenantId !== tenantId) {
        throw new Error(`Tenant access denied: ${tenantId}`);
      }

      return trace;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },


  /**
   * Get an AI input snapshot for reproducibility
   * 
   * Requirements: 2.6
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @returns The input snapshot, or null if not found
   */
  async getInputSnapshot(tenantId: string, timestamp: string, traceId: string): Promise<AIInputSnapshot | null> {
    const key = this.generateSnapshotKey(tenantId, timestamp, traceId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      return JSON.parse(result.Body.toString()) as AIInputSnapshot;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * List AI traces for a tenant by correlation ID
   * 
   * Requirements: 2.3
   * 
   * @param tenantId - The tenant identifier
   * @param correlationId - The correlation ID to filter by
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @returns Array of AI traces for the correlation ID
   */
  async listTracesByCorrelationId(
    tenantId: string,
    correlationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AITrace[]> {
    const traces: AITrace[] = [];
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
          
          // Skip snapshot and influence files
          if (obj.Key.includes('-snapshot.json') || obj.Key.includes('-influences/')) continue;
          
          // Filter by date range if provided
          if (startDate || endDate) {
            const keyParts = obj.Key.split('/');
            if (keyParts.length >= 6) {
              const traceDate = new Date(`${keyParts[3]}-${keyParts[4]}-${keyParts[5]}`);
              if (startDate && traceDate < startDate) continue;
              if (endDate && traceDate > endDate) continue;
            }
          }

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const trace = JSON.parse(getResult.Body.toString()) as AITrace;
              
              // Filter by correlation ID and verify tenant
              if (trace.correlationId === correlationId && trace.tenantId === tenantId) {
                traces.push(trace);
              }
            }
          } catch {
            // Skip traces that can't be read
            continue;
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Sort by timestamp
    return traces.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },


  /**
   * List AI traces for a tenant within a date range
   * 
   * @param tenantId - The tenant identifier
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @param limit - Maximum number of traces to return
   * @returns Array of AI traces
   */
  async listTracesByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit?: number
  ): Promise<AITrace[]> {
    const traces: AITrace[] = [];
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
          if (limit && traces.length >= limit) break;
          
          // Skip snapshot and influence files
          if (obj.Key.includes('-snapshot.json') || obj.Key.includes('-influences/')) continue;
          
          // Filter by date range from key path
          const keyParts = obj.Key.split('/');
          if (keyParts.length >= 6) {
            const traceDate = new Date(`${keyParts[3]}-${keyParts[4]}-${keyParts[5]}`);
            if (traceDate < startDate || traceDate > endDate) continue;
          }

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const trace = JSON.parse(getResult.Body.toString()) as AITrace;
              
              // Verify tenant ownership
              if (trace.tenantId === tenantId) {
                traces.push(trace);
              }
            }
          } catch {
            // Skip traces that can't be read
            continue;
          }
        }
      }

      if (limit && traces.length >= limit) break;
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Sort by timestamp
    return traces.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },

  /**
   * Update the correlation ID for an existing trace
   * This creates a new version with the correlation ID set
   * 
   * Requirements: 2.3
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @param correlationId - The correlation ID to link
   */
  async updateCorrelationId(tenantId: string, timestamp: string, traceId: string, correlationId: string): Promise<void> {
    const trace = await this.getTrace(tenantId, timestamp, traceId);
    if (!trace) {
      throw new Error(`AI trace not found: ${traceId}`);
    }

    // Create updated trace with correlation ID
    const updatedTrace: AITrace = {
      ...trace,
      correlationId
    };

    // Store the updated trace (overwrites the existing one)
    const key = this.generateKey(tenantId, timestamp, traceId);
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(updatedTrace),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': tenantId,
        'x-amz-meta-trace-id': traceId,
        'x-amz-meta-analysis-type': updatedTrace.analysisType,
        'x-amz-meta-correlation-id': correlationId
      }
    }).promise();
  },

  /**
   * Check if a trace exists
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @returns True if the trace exists
   */
  async traceExists(tenantId: string, timestamp: string, traceId: string): Promise<boolean> {
    const key = this.generateKey(tenantId, timestamp, traceId);
    
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
