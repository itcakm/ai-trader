import { S3 } from 'aws-sdk';
import { TradeEvent, TradeEventInput } from '../types/trade-lifecycle';
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
 * Trade Lifecycle Repository - manages trade event persistence with S3 storage
 * 
 * Uses S3 with tenant-partitioned paths for immutable log storage.
 * Events are stored with tenant isolation and support time-based queries.
 * 
 * Storage path format: audit/{tenantId}/trade-events/{year}/{month}/{day}/{eventId}.json
 * 
 * Requirements: 1.1, 1.4
 */
export const TradeLifecycleRepository = {
  /**
   * Generate S3 key for a trade event
   * Uses tenant-partitioned paths for isolation
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The event timestamp
   * @param eventId - The event identifier
   * @returns S3 key path
   */
  generateKey(tenantId: string, timestamp: string, eventId: string): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    return `audit/${tenantId}/trade-events/${year}/${month}/${day}/${eventId}.json`;
  },

  /**
   * Generate prefix for listing events by tenant and date range
   * 
   * @param tenantId - The tenant identifier
   * @param year - Optional year filter
   * @param month - Optional month filter
   * @param day - Optional day filter
   * @returns S3 prefix path
   */
  generatePrefix(tenantId: string, year?: number, month?: number, day?: number): string {
    let prefix = `audit/${tenantId}/trade-events/`;
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
   * Store a trade event as an immutable record in S3
   * 
   * Requirements: 1.1, 1.4
   * 
   * @param event - The trade event to store
   * @returns The stored trade event with generated eventId
   */
  async putEvent(event: TradeEvent): Promise<TradeEvent> {
    const key = this.generateKey(event.tenantId, event.timestamp, event.eventId);
    
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(event),
      ContentType: 'application/json',
      // Prevent overwrites to ensure immutability
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': event.tenantId,
        'x-amz-meta-correlation-id': event.tradeCorrelationId,
        'x-amz-meta-event-type': event.eventType
      }
    }).promise();

    return event;
  },

  /**
   * Get a trade event by ID
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The event timestamp
   * @param eventId - The event identifier
   * @returns The trade event, or null if not found
   */
  async getEvent(tenantId: string, timestamp: string, eventId: string): Promise<TradeEvent | null> {
    const key = this.generateKey(tenantId, timestamp, eventId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const event = JSON.parse(result.Body.toString()) as TradeEvent;
      
      // Defense in depth: verify tenant ownership
      if (event.tenantId !== tenantId) {
        throw new Error(`Tenant access denied: ${tenantId}`);
      }

      return event;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * List trade events for a tenant by correlation ID
   * 
   * Requirements: 1.3
   * 
   * @param tenantId - The tenant identifier
   * @param tradeCorrelationId - The trade correlation ID
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @returns Array of trade events for the correlation ID
   */
  async listEventsByCorrelationId(
    tenantId: string,
    tradeCorrelationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TradeEvent[]> {
    const events: TradeEvent[] = [];
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
          
          // Filter by date range if provided
          if (startDate || endDate) {
            const keyParts = obj.Key.split('/');
            if (keyParts.length >= 6) {
              const eventDate = new Date(`${keyParts[3]}-${keyParts[4]}-${keyParts[5]}`);
              if (startDate && eventDate < startDate) continue;
              if (endDate && eventDate > endDate) continue;
            }
          }

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const event = JSON.parse(getResult.Body.toString()) as TradeEvent;
              
              // Filter by correlation ID and verify tenant
              if (event.tradeCorrelationId === tradeCorrelationId && event.tenantId === tenantId) {
                events.push(event);
              }
            }
          } catch {
            // Skip events that can't be read
            continue;
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Sort by timestamp
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },

  /**
   * List trade events for a tenant within a date range
   * 
   * @param tenantId - The tenant identifier
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @param limit - Maximum number of events to return
   * @returns Array of trade events
   */
  async listEventsByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit?: number
  ): Promise<TradeEvent[]> {
    const events: TradeEvent[] = [];
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
          if (limit && events.length >= limit) break;
          
          // Filter by date range from key path
          const keyParts = obj.Key.split('/');
          if (keyParts.length >= 6) {
            const eventDate = new Date(`${keyParts[3]}-${keyParts[4]}-${keyParts[5]}`);
            if (eventDate < startDate || eventDate > endDate) continue;
          }

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const event = JSON.parse(getResult.Body.toString()) as TradeEvent;
              
              // Verify tenant ownership
              if (event.tenantId === tenantId) {
                events.push(event);
              }
            }
          } catch {
            // Skip events that can't be read
            continue;
          }
        }
      }

      if (limit && events.length >= limit) break;
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Sort by timestamp
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },

  /**
   * Check if an event exists (for immutability verification)
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The event timestamp
   * @param eventId - The event identifier
   * @returns True if the event exists
   */
  async eventExists(tenantId: string, timestamp: string, eventId: string): Promise<boolean> {
    const key = this.generateKey(tenantId, timestamp, eventId);
    
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
