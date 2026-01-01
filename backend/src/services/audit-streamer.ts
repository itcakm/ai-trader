import {
  StreamSubscription,
  StreamSubscriptionInput,
  StreamedAuditEvent,
  StreamFilters,
  NotificationConfig,
  NotificationConfigInput,
  BufferConfig,
  NotificationChannel
} from '../types/audit-stream';
import {
  AuditSubscriptionRepository,
  DEFAULT_BUFFER_CONFIG
} from '../repositories/audit-subscription';

/**
 * In-memory store for active subscribers (WebSocket connections would be stored here)
 * Maps subscriptionId to callback function
 */
type EventCallback = (event: StreamedAuditEvent) => void;
const activeSubscribers: Map<string, EventCallback> = new Map();

/**
 * In-memory store for subscription metadata (for quick lookup)
 */
const subscriptionCache: Map<string, StreamSubscription> = new Map();

/**
 * Check if an event matches the subscription filters
 * 
 * Requirements: 10.2
 * 
 * @param event - The event to check
 * @param filters - The subscription filters
 * @returns True if the event matches all filters
 */
export function eventMatchesFilters(
  event: StreamedAuditEvent,
  filters: StreamFilters
): boolean {
  // If no filters, match all events
  if (!filters || Object.keys(filters).length === 0) {
    return true;
  }

  // Check event type filter
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    if (!filters.eventTypes.includes(event.eventType)) {
      return false;
    }
  }

  // Check severity filter
  if (filters.severities && filters.severities.length > 0) {
    if (!filters.severities.includes(event.severity)) {
      return false;
    }
  }

  // Check strategy ID filter (from event data)
  if (filters.strategyIds && filters.strategyIds.length > 0) {
    const eventStrategyId = event.data?.strategyId as string | undefined;
    if (!eventStrategyId || !filters.strategyIds.includes(eventStrategyId)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if an event severity meets the notification threshold
 * 
 * Requirements: 10.4
 * 
 * @param eventSeverity - The event severity
 * @param threshold - The notification threshold
 * @returns True if the event meets or exceeds the threshold
 */
export function severityMeetsThreshold(
  eventSeverity: string,
  threshold: 'CRITICAL' | 'EMERGENCY'
): boolean {
  const severityLevels: Record<string, number> = {
    'DEBUG': 0,
    'INFO': 1,
    'WARNING': 2,
    'ERROR': 3,
    'CRITICAL': 4,
    'EMERGENCY': 5
  };

  const eventLevel = severityLevels[eventSeverity.toUpperCase()] ?? 0;
  const thresholdLevel = severityLevels[threshold] ?? 4;

  return eventLevel >= thresholdLevel;
}


/**
 * Send notification to a channel (stub implementation)
 * In production, this would integrate with actual notification services
 * 
 * Requirements: 10.4
 * 
 * @param channel - The notification channel
 * @param event - The event to notify about
 */
async function sendNotification(
  channel: NotificationChannel,
  event: StreamedAuditEvent
): Promise<void> {
  if (!channel.enabled) {
    return;
  }

  // In production, this would call actual notification services
  // For now, we just log the notification
  console.log(`[NOTIFICATION] ${channel.type} to ${channel.destination}: ${event.summary}`);

  // Simulate async notification sending
  await Promise.resolve();
}

/**
 * Real-Time Audit Streamer Service
 * 
 * Provides real-time streaming of audit events via WebSocket or Server-Sent Events.
 * Supports subscription filtering, critical event notifications, and event buffering
 * for reconnection replay.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
export const AuditStreamerService = {
  /**
   * Subscribe to audit event stream
   * 
   * Requirements: 10.1, 10.2
   * 
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   * @param filters - Optional filters for the subscription
   * @returns The created subscription
   */
  async subscribe(
    tenantId: string,
    userId: string,
    filters?: StreamFilters
  ): Promise<StreamSubscription> {
    const input: StreamSubscriptionInput = {
      tenantId,
      userId,
      filters
    };

    const subscription = await AuditSubscriptionRepository.createSubscription(input);

    // Cache the subscription for quick lookup
    subscriptionCache.set(subscription.subscriptionId, subscription);

    return subscription;
  },

  /**
   * Unsubscribe from audit event stream
   * 
   * @param subscriptionId - The subscription ID to remove
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    // Get subscription to find tenant ID
    const subscription = subscriptionCache.get(subscriptionId) ||
      await AuditSubscriptionRepository.getSubscriptionById(subscriptionId);

    if (subscription) {
      await AuditSubscriptionRepository.deleteSubscription(
        subscription.tenantId,
        subscriptionId
      );
    }

    // Remove from active subscribers and cache
    activeSubscribers.delete(subscriptionId);
    subscriptionCache.delete(subscriptionId);
  },

  /**
   * Register a callback for receiving events (for WebSocket integration)
   * 
   * @param subscriptionId - The subscription ID
   * @param callback - The callback to invoke when events arrive
   */
  registerCallback(subscriptionId: string, callback: EventCallback): void {
    activeSubscribers.set(subscriptionId, callback);
  },

  /**
   * Unregister a callback (for WebSocket disconnection)
   * 
   * @param subscriptionId - The subscription ID
   */
  unregisterCallback(subscriptionId: string): void {
    activeSubscribers.delete(subscriptionId);
  },

  /**
   * Publish an audit event to all matching subscribers
   * 
   * Requirements: 10.3, 10.5
   * 
   * @param event - The event to publish
   */
  async publishEvent(event: StreamedAuditEvent): Promise<void> {
    // Get all subscriptions
    const allSubscriptions = await AuditSubscriptionRepository.listAllSubscriptions();

    // Get tenant ID from event data if available
    const eventTenantId = event.data?.tenantId as string | undefined;

    // Process each subscription
    const deliveryPromises: Promise<void>[] = [];

    for (const subscription of allSubscriptions) {
      // Filter by tenant if event has tenant ID
      if (eventTenantId && subscription.tenantId !== eventTenantId) {
        continue;
      }

      // Check if event matches subscription filters
      if (!eventMatchesFilters(event, subscription.filters)) {
        continue;
      }

      // Deliver to active subscriber or buffer
      const callback = activeSubscribers.get(subscription.subscriptionId);

      if (callback) {
        // Deliver immediately to active subscriber
        try {
          callback(event);
        } catch (error) {
          console.error(`Error delivering event to subscriber ${subscription.subscriptionId}:`, error);
        }
      }

      // Always buffer the event for replay (Requirements: 10.6)
      deliveryPromises.push(
        AuditSubscriptionRepository.bufferEvent(
          subscription.tenantId,
          subscription.subscriptionId,
          event
        ).catch(error => {
          console.error(`Error buffering event for subscription ${subscription.subscriptionId}:`, error);
        })
      );
    }

    // Handle critical event notifications (Requirements: 10.4)
    if (severityMeetsThreshold(event.severity, 'CRITICAL')) {
      deliveryPromises.push(this.sendCriticalNotifications(event, eventTenantId));
    }

    await Promise.all(deliveryPromises);
  },

  /**
   * Send notifications for critical events
   * 
   * Requirements: 10.4
   * 
   * @param event - The critical event
   * @param tenantId - Optional tenant ID to limit notifications
   */
  async sendCriticalNotifications(
    event: StreamedAuditEvent,
    tenantId?: string
  ): Promise<void> {
    // If tenant ID is specified, only notify that tenant
    if (tenantId) {
      const config = await AuditSubscriptionRepository.getNotificationConfig(tenantId);
      if (config && severityMeetsThreshold(event.severity, config.severityThreshold)) {
        await this.notifyChannels(config.channels, event);
      }
      return;
    }

    // Otherwise, we'd need to notify all tenants with matching configs
    // This is a simplified implementation - in production, you'd have a more
    // efficient way to look up notification configs
    const allSubscriptions = await AuditSubscriptionRepository.listAllSubscriptions();
    const notifiedTenants = new Set<string>();

    for (const subscription of allSubscriptions) {
      if (notifiedTenants.has(subscription.tenantId)) {
        continue;
      }

      const config = await AuditSubscriptionRepository.getNotificationConfig(subscription.tenantId);
      if (config && severityMeetsThreshold(event.severity, config.severityThreshold)) {
        await this.notifyChannels(config.channels, event);
        notifiedTenants.add(subscription.tenantId);
      }
    }
  },

  /**
   * Send notifications to all enabled channels
   * 
   * @param channels - The notification channels
   * @param event - The event to notify about
   */
  async notifyChannels(
    channels: NotificationChannel[],
    event: StreamedAuditEvent
  ): Promise<void> {
    const notificationPromises = channels
      .filter(channel => channel.enabled)
      .map(channel => sendNotification(channel, event));

    await Promise.all(notificationPromises);
  },

  /**
   * Configure push notifications for critical events
   * 
   * Requirements: 10.4
   * 
   * @param config - The notification configuration
   * @returns The saved configuration
   */
  async configureNotifications(config: NotificationConfigInput): Promise<NotificationConfig> {
    return AuditSubscriptionRepository.saveNotificationConfig(config);
  },

  /**
   * Get notification configuration for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns The notification config, or null if not found
   */
  async getNotificationConfig(tenantId: string): Promise<NotificationConfig | null> {
    return AuditSubscriptionRepository.getNotificationConfig(tenantId);
  },

  /**
   * Get buffered events for reconnection replay
   * 
   * Requirements: 10.6
   * 
   * @param subscriptionId - The subscription ID
   * @param since - ISO timestamp to get events after
   * @param bufferConfig - Optional buffer configuration
   * @returns List of buffered events in order
   */
  async getBufferedEvents(
    subscriptionId: string,
    since: string,
    bufferConfig: BufferConfig = DEFAULT_BUFFER_CONFIG
  ): Promise<StreamedAuditEvent[]> {
    // Get subscription to find tenant ID
    const subscription = subscriptionCache.get(subscriptionId) ||
      await AuditSubscriptionRepository.getSubscriptionById(subscriptionId);

    if (!subscription) {
      return [];
    }

    return AuditSubscriptionRepository.getBufferedEvents(
      subscription.tenantId,
      subscriptionId,
      since,
      bufferConfig
    );
  },

  /**
   * Get a subscription by ID
   * 
   * @param subscriptionId - The subscription ID
   * @returns The subscription, or null if not found
   */
  async getSubscription(subscriptionId: string): Promise<StreamSubscription | null> {
    return subscriptionCache.get(subscriptionId) ||
      AuditSubscriptionRepository.getSubscriptionById(subscriptionId);
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
    return AuditSubscriptionRepository.listSubscriptions(tenantId);
  },

  /**
   * Clean up expired events from all buffers
   * 
   * @param bufferConfig - Optional buffer configuration
   * @returns Number of events deleted
   */
  async cleanupExpiredEvents(
    bufferConfig: BufferConfig = DEFAULT_BUFFER_CONFIG
  ): Promise<number> {
    return AuditSubscriptionRepository.cleanupExpiredEvents(bufferConfig);
  },

  /**
   * Clear subscription cache (for testing)
   */
  clearCache(): void {
    subscriptionCache.clear();
    activeSubscribers.clear();
  }
};
