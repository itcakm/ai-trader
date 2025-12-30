/**
 * Audit Stream Types
 * Requirements: 10.1, 10.2, 10.4
 */

/**
 * Stream subscription filters
 * Requirements: 10.2
 */
export interface StreamFilters {
  eventTypes?: string[];
  severities?: string[];
  strategyIds?: string[];
}

/**
 * Subscription for audit event streams
 * Requirements: 10.1, 10.2
 */
export interface StreamSubscription {
  subscriptionId: string;
  tenantId: string;
  userId: string;
  filters: StreamFilters;
  createdAt: string;
}

/**
 * Input for creating a stream subscription
 */
export interface StreamSubscriptionInput {
  tenantId: string;
  userId: string;
  filters?: StreamFilters;
}

/**
 * Streamed audit event
 * Requirements: 10.1
 */
export interface StreamedAuditEvent {
  eventId: string;
  eventType: string;
  severity: string;
  timestamp: string;
  summary: string;
  data: Record<string, unknown>;
}

/**
 * Notification channel types
 * Requirements: 10.4
 */
export type NotificationChannelType = 'EMAIL' | 'SMS' | 'SLACK' | 'WEBHOOK';

/**
 * Notification channel configuration
 * Requirements: 10.4
 */
export interface NotificationChannel {
  type: NotificationChannelType;
  destination: string;
  enabled: boolean;
}

/**
 * Notification configuration for critical events
 * Requirements: 10.4
 */
export interface NotificationConfig {
  tenantId: string;
  channels: NotificationChannel[];
  severityThreshold: 'CRITICAL' | 'EMERGENCY';
}

/**
 * Input for configuring notifications
 */
export interface NotificationConfigInput {
  tenantId: string;
  channels: NotificationChannel[];
  severityThreshold: 'CRITICAL' | 'EMERGENCY';
}

/**
 * Event buffer configuration
 * Requirements: 10.6
 */
export interface BufferConfig {
  maxEvents: number;
  maxAgeSeconds: number;
}

/**
 * Real-Time Audit Streamer Service Interface
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
export interface RealTimeAuditStreamer {
  subscribe(
    tenantId: string,
    userId: string,
    filters?: StreamFilters
  ): Promise<StreamSubscription>;
  unsubscribe(subscriptionId: string): Promise<void>;
  publishEvent(event: StreamedAuditEvent): Promise<void>;
  configureNotifications(config: NotificationConfigInput): Promise<NotificationConfig>;
  getBufferedEvents(subscriptionId: string, since: string): Promise<StreamedAuditEvent[]>;
}
