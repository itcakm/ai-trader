import { S3 } from 'aws-sdk';
import {
  StreamSubscription,
  StreamSubscriptionInput,
  StreamedAuditEvent,
  NotificationConfig,
  NotificationConfigInput,
  BufferConfig
} from '../types/audit-stream';
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
 * S3 bucket name for audit subscriptions
 */
export const SUBSCRIPTIONS_BUCKET = process.env.AUDIT_SUBSCRIPTIONS_BUCKET || 'audit-subscriptions';

/**
 * S3 bucket name for event buffers
 */
export const EVENT_BUFFER_BUCKET = process.env.AUDIT_EVENT_BUFFER_BUCKET || 'audit-event-buffer';

/**
 * Default buffer configuration
 * Requirements: 10.6
 */
export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxEvents: 1000,
  maxAgeSeconds: 3600 // 1 hour
};

/**
 * Generate S3 key for a subscription
 * Path format: subscriptions/{tenantId}/{subscriptionId}.json
 */
export function getSubscriptionKey(tenantId: string, subscriptionId: string): string {
  return `subscriptions/${tenantId}/${subscriptionId}.json`;
}

/**
 * Generate S3 prefix for listing subscriptions by tenant
 */
export function getSubscriptionPrefix(tenantId: string): string {
  return `subscriptions/${tenantId}/`;
}

/**
 * Generate S3 key for notification config
 * Path format: notifications/{tenantId}/config.json
 */
export function getNotificationConfigKey(tenantId: string): string {
  return `notifications/${tenantId}/config.json`;
}


/**
 * Generate S3 key for buffered events
 * Path format: buffer/{tenantId}/{subscriptionId}/{eventId}.json
 */
export function getBufferEventKey(
  tenantId: string,
  subscriptionId: string,
  eventId: string
): string {
  return `buffer/${tenantId}/${subscriptionId}/${eventId}.json`;
}

/**
 * Generate S3 prefix for listing buffered events
 */
export function getBufferPrefix(tenantId: string, subscriptionId: string): string {
  return `buffer/${tenantId}/${subscriptionId}/`;
}

/**
 * Parse subscription metadata from S3 key
 */
export function parseSubscriptionKey(key: string): {
  tenantId: string;
  subscriptionId: string;
} | null {
  const match = key.match(/^subscriptions\/([^/]+)\/([^/]+)\.json$/);
  if (!match) {
    return null;
  }
  return {
    tenantId: match[1],
    subscriptionId: match[2]
  };
}

/**
 * Buffered event with metadata for ordering
 */
export interface BufferedEvent {
  event: StreamedAuditEvent;
  bufferedAt: string;
  subscriptionId: string;
}

/**
 * Audit Subscription Repository - manages subscription and buffer persistence in S3
 * 
 * Subscriptions are stored in S3 with the following path structure:
 * subscriptions/{tenantId}/{subscriptionId}.json
 * 
 * Event buffers are stored as:
 * buffer/{tenantId}/{subscriptionId}/{eventId}.json
 * 
 * This enables:
 * - Tenant isolation through path-based partitioning
 * - Multiple concurrent subscribers per tenant (Requirements: 10.5)
 * - Event buffering for reconnection replay (Requirements: 10.6)
 * 
 * Requirements: 10.5, 10.6
 */
export const AuditSubscriptionRepository = {
  /**
   * Create a new subscription
   * 
   * @param input - The subscription input
   * @returns The created subscription
   */
  async createSubscription(input: StreamSubscriptionInput): Promise<StreamSubscription> {
    const subscriptionId = generateUUID();
    const createdAt = new Date().toISOString();

    const subscription: StreamSubscription = {
      subscriptionId,
      tenantId: input.tenantId,
      userId: input.userId,
      filters: input.filters || {},
      createdAt
    };

    const key = getSubscriptionKey(subscription.tenantId, subscription.subscriptionId);

    await s3Client
      .putObject({
        Bucket: SUBSCRIPTIONS_BUCKET,
        Key: key,
        Body: JSON.stringify(subscription, null, 2),
        ContentType: 'application/json'
      })
      .promise();

    return subscription;
  },

  /**
   * Get a subscription by ID with tenant validation
   * 
   * @param tenantId - The tenant ID
   * @param subscriptionId - The subscription ID
   * @returns The subscription, or null if not found
   */
  async getSubscription(
    tenantId: string,
    subscriptionId: string
  ): Promise<StreamSubscription | null> {
    const key = getSubscriptionKey(tenantId, subscriptionId);

    try {
      const result = await s3Client
        .getObject({
          Bucket: SUBSCRIPTIONS_BUCKET,
          Key: key
        })
        .promise();

      if (!result.Body) {
        return null;
      }

      const subscription = JSON.parse(result.Body.toString('utf-8')) as StreamSubscription;

      // Verify tenant ownership
      if (subscription.tenantId !== tenantId) {
        return null;
      }

      return subscription;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get a subscription by ID without tenant validation (for internal use)
   * 
   * @param subscriptionId - The subscription ID
   * @returns The subscription, or null if not found
   */
  async getSubscriptionById(subscriptionId: string): Promise<StreamSubscription | null> {
    // We need to search across all tenants - list all and find
    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: SUBSCRIPTIONS_BUCKET,
            Prefix: 'subscriptions/',
            ContinuationToken: continuationToken
          })
          .promise();

        if (listResult.Contents) {
          for (const obj of listResult.Contents) {
            if (obj.Key && obj.Key.includes(subscriptionId)) {
              const result = await s3Client
                .getObject({
                  Bucket: SUBSCRIPTIONS_BUCKET,
                  Key: obj.Key
                })
                .promise();

              if (result.Body) {
                const subscription = JSON.parse(result.Body.toString('utf-8')) as StreamSubscription;
                if (subscription.subscriptionId === subscriptionId) {
                  return subscription;
                }
              }
            }
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);

      return null;
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Delete a subscription
   * 
   * @param tenantId - The tenant ID
   * @param subscriptionId - The subscription ID
   */
  async deleteSubscription(tenantId: string, subscriptionId: string): Promise<void> {
    const key = getSubscriptionKey(tenantId, subscriptionId);

    await s3Client
      .deleteObject({
        Bucket: SUBSCRIPTIONS_BUCKET,
        Key: key
      })
      .promise();

    // Also clean up the event buffer for this subscription
    await this.clearBuffer(tenantId, subscriptionId);
  },

  /**
   * List all subscriptions for a tenant
   * 
   * Requirements: 10.5
   * 
   * @param tenantId - The tenant ID
   * @returns List of subscriptions
   */
  async listSubscriptions(tenantId: string): Promise<StreamSubscription[]> {
    const subscriptions: StreamSubscription[] = [];
    const prefix = getSubscriptionPrefix(tenantId);

    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: SUBSCRIPTIONS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken
          })
          .promise();

        if (listResult.Contents) {
          for (const obj of listResult.Contents) {
            if (!obj.Key) continue;

            try {
              const result = await s3Client
                .getObject({
                  Bucket: SUBSCRIPTIONS_BUCKET,
                  Key: obj.Key
                })
                .promise();

              if (result.Body) {
                const subscription = JSON.parse(result.Body.toString('utf-8')) as StreamSubscription;
                subscriptions.push(subscription);
              }
            } catch (error: any) {
              // Skip entries that can't be read
              if (error.code !== 'NoSuchKey' && error.code !== 'NotFound') {
                throw error;
              }
            }
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }

    return subscriptions;
  },

  /**
   * List all active subscriptions across all tenants
   * 
   * Requirements: 10.5
   * 
   * @returns List of all subscriptions
   */
  async listAllSubscriptions(): Promise<StreamSubscription[]> {
    const subscriptions: StreamSubscription[] = [];

    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: SUBSCRIPTIONS_BUCKET,
            Prefix: 'subscriptions/',
            ContinuationToken: continuationToken
          })
          .promise();

        if (listResult.Contents) {
          for (const obj of listResult.Contents) {
            if (!obj.Key) continue;

            try {
              const result = await s3Client
                .getObject({
                  Bucket: SUBSCRIPTIONS_BUCKET,
                  Key: obj.Key
                })
                .promise();

              if (result.Body) {
                const subscription = JSON.parse(result.Body.toString('utf-8')) as StreamSubscription;
                subscriptions.push(subscription);
              }
            } catch (error: any) {
              if (error.code !== 'NoSuchKey' && error.code !== 'NotFound') {
                throw error;
              }
            }
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }

    return subscriptions;
  },


  /**
   * Buffer an event for a subscription
   * 
   * Requirements: 10.6
   * 
   * @param tenantId - The tenant ID
   * @param subscriptionId - The subscription ID
   * @param event - The event to buffer
   */
  async bufferEvent(
    tenantId: string,
    subscriptionId: string,
    event: StreamedAuditEvent
  ): Promise<void> {
    const bufferedEvent: BufferedEvent = {
      event,
      bufferedAt: new Date().toISOString(),
      subscriptionId
    };

    const key = getBufferEventKey(tenantId, subscriptionId, event.eventId);

    await s3Client
      .putObject({
        Bucket: EVENT_BUFFER_BUCKET,
        Key: key,
        Body: JSON.stringify(bufferedEvent, null, 2),
        ContentType: 'application/json'
      })
      .promise();
  },

  /**
   * Get buffered events for a subscription since a given timestamp
   * 
   * Requirements: 10.6
   * 
   * @param tenantId - The tenant ID
   * @param subscriptionId - The subscription ID
   * @param since - ISO timestamp to get events after
   * @param bufferConfig - Buffer configuration
   * @returns List of buffered events in order
   */
  async getBufferedEvents(
    tenantId: string,
    subscriptionId: string,
    since: string,
    bufferConfig: BufferConfig = DEFAULT_BUFFER_CONFIG
  ): Promise<StreamedAuditEvent[]> {
    const events: BufferedEvent[] = [];
    const prefix = getBufferPrefix(tenantId, subscriptionId);
    const sinceDate = new Date(since);
    const maxAge = new Date(Date.now() - bufferConfig.maxAgeSeconds * 1000);

    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: EVENT_BUFFER_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken
          })
          .promise();

        if (listResult.Contents) {
          for (const obj of listResult.Contents) {
            if (!obj.Key || events.length >= bufferConfig.maxEvents) break;

            try {
              const result = await s3Client
                .getObject({
                  Bucket: EVENT_BUFFER_BUCKET,
                  Key: obj.Key
                })
                .promise();

              if (result.Body) {
                const bufferedEvent = JSON.parse(result.Body.toString('utf-8')) as BufferedEvent;
                const eventDate = new Date(bufferedEvent.event.timestamp);

                // Filter by timestamp and max age
                if (eventDate > sinceDate && eventDate > maxAge) {
                  events.push(bufferedEvent);
                }
              }
            } catch (error: any) {
              if (error.code !== 'NoSuchKey' && error.code !== 'NotFound') {
                throw error;
              }
            }
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken && events.length < bufferConfig.maxEvents);
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }

    // Sort by timestamp and return just the events
    return events
      .sort((a, b) => new Date(a.event.timestamp).getTime() - new Date(b.event.timestamp).getTime())
      .map(be => be.event);
  },

  /**
   * Clear the event buffer for a subscription
   * 
   * @param tenantId - The tenant ID
   * @param subscriptionId - The subscription ID
   */
  async clearBuffer(tenantId: string, subscriptionId: string): Promise<void> {
    const prefix = getBufferPrefix(tenantId, subscriptionId);

    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: EVENT_BUFFER_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken
          })
          .promise();

        if (listResult.Contents && listResult.Contents.length > 0) {
          const deleteParams = {
            Bucket: EVENT_BUFFER_BUCKET,
            Delete: {
              Objects: listResult.Contents
                .filter(obj => obj.Key)
                .map(obj => ({ Key: obj.Key! }))
            }
          };

          if (deleteParams.Delete.Objects.length > 0) {
            await s3Client.deleteObjects(deleteParams).promise();
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return;
      }
      throw error;
    }
  },

  /**
   * Clean up expired events from the buffer
   * 
   * Requirements: 10.6
   * 
   * @param bufferConfig - Buffer configuration
   */
  async cleanupExpiredEvents(bufferConfig: BufferConfig = DEFAULT_BUFFER_CONFIG): Promise<number> {
    let deletedCount = 0;
    const maxAge = new Date(Date.now() - bufferConfig.maxAgeSeconds * 1000);

    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3Client
          .listObjectsV2({
            Bucket: EVENT_BUFFER_BUCKET,
            Prefix: 'buffer/',
            ContinuationToken: continuationToken
          })
          .promise();

        if (listResult.Contents) {
          const keysToDelete: string[] = [];

          for (const obj of listResult.Contents) {
            if (!obj.Key) continue;

            try {
              const result = await s3Client
                .getObject({
                  Bucket: EVENT_BUFFER_BUCKET,
                  Key: obj.Key
                })
                .promise();

              if (result.Body) {
                const bufferedEvent = JSON.parse(result.Body.toString('utf-8')) as BufferedEvent;
                const eventDate = new Date(bufferedEvent.bufferedAt);

                if (eventDate < maxAge) {
                  keysToDelete.push(obj.Key);
                }
              }
            } catch (error: any) {
              if (error.code !== 'NoSuchKey' && error.code !== 'NotFound') {
                throw error;
              }
            }
          }

          if (keysToDelete.length > 0) {
            await s3Client
              .deleteObjects({
                Bucket: EVENT_BUFFER_BUCKET,
                Delete: {
                  Objects: keysToDelete.map(key => ({ Key: key }))
                }
              })
              .promise();
            deletedCount += keysToDelete.length;
          }
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return 0;
      }
      throw error;
    }

    return deletedCount;
  },

  /**
   * Save notification configuration for a tenant
   * 
   * Requirements: 10.4
   * 
   * @param input - The notification config input
   * @returns The saved notification config
   */
  async saveNotificationConfig(input: NotificationConfigInput): Promise<NotificationConfig> {
    const config: NotificationConfig = {
      tenantId: input.tenantId,
      channels: input.channels,
      severityThreshold: input.severityThreshold
    };

    const key = getNotificationConfigKey(config.tenantId);

    await s3Client
      .putObject({
        Bucket: SUBSCRIPTIONS_BUCKET,
        Key: key,
        Body: JSON.stringify(config, null, 2),
        ContentType: 'application/json'
      })
      .promise();

    return config;
  },

  /**
   * Get notification configuration for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns The notification config, or null if not found
   */
  async getNotificationConfig(tenantId: string): Promise<NotificationConfig | null> {
    const key = getNotificationConfigKey(tenantId);

    try {
      const result = await s3Client
        .getObject({
          Bucket: SUBSCRIPTIONS_BUCKET,
          Key: key
        })
        .promise();

      if (!result.Body) {
        return null;
      }

      return JSON.parse(result.Body.toString('utf-8')) as NotificationConfig;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Delete notification configuration for a tenant
   * 
   * @param tenantId - The tenant ID
   */
  async deleteNotificationConfig(tenantId: string): Promise<void> {
    const key = getNotificationConfigKey(tenantId);

    await s3Client
      .deleteObject({
        Bucket: SUBSCRIPTIONS_BUCKET,
        Key: key
      })
      .promise();
  }
};
