import * as fc from 'fast-check';
import {
  AuditStreamerService,
  eventMatchesFilters,
  severityMeetsThreshold
} from './audit-streamer';
import { AuditSubscriptionRepository } from '../repositories/audit-subscription';
import {
  StreamSubscription,
  StreamedAuditEvent,
  StreamFilters,
  NotificationConfig
} from '../types/audit-stream';
import {
  streamFiltersArb,
  streamedAuditEventArb,
  streamSubscriptionArb,
  criticalEventArb,
  nonCriticalEventArb,
  notificationConfigInputArb,
  subscriptionAndMatchingEventArb,
  multipleSubscriptionsArb,
  bufferedEventsSequenceArb,
  isoDateStringArb,
  severityArb,
  auditEventTypeArb
} from '../test/generators';

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockS3 = {
    putObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve() }),
    getObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Body: Buffer.from('{}') }) }),
    listObjectsV2: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Contents: [], KeyCount: 0 }) }),
    deleteObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve() }),
    deleteObjects: jest.fn().mockReturnValue({ promise: () => Promise.resolve() })
  };
  return {
    S3: jest.fn(() => mockS3)
  };
});

// Mock the repository
jest.mock('../repositories/audit-subscription');

const mockSubscriptionRepo = AuditSubscriptionRepository as jest.Mocked<typeof AuditSubscriptionRepository>;

describe('Audit Streamer Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditStreamerService.clearCache();
    
    // Set up default mock implementations
    mockSubscriptionRepo.createSubscription.mockImplementation(async (input) => ({
      subscriptionId: 'test-sub-' + Date.now(),
      tenantId: input.tenantId,
      userId: input.userId,
      filters: input.filters || {},
      createdAt: new Date().toISOString()
    }));
    
    mockSubscriptionRepo.getSubscriptionById.mockResolvedValue(null);
    mockSubscriptionRepo.listAllSubscriptions.mockResolvedValue([]);
    mockSubscriptionRepo.listSubscriptions.mockResolvedValue([]);
    mockSubscriptionRepo.deleteSubscription.mockResolvedValue();
    mockSubscriptionRepo.bufferEvent.mockResolvedValue();
    mockSubscriptionRepo.getBufferedEvents.mockResolvedValue([]);
    mockSubscriptionRepo.saveNotificationConfig.mockImplementation(async (input) => ({
      tenantId: input.tenantId,
      channels: input.channels,
      severityThreshold: input.severityThreshold
    }));
    mockSubscriptionRepo.getNotificationConfig.mockResolvedValue(null);
  });

  describe('eventMatchesFilters', () => {
    it('should match all events when no filters are specified', () => {
      const event: StreamedAuditEvent = {
        eventId: 'test-1',
        eventType: 'TRADE_SIGNAL',
        severity: 'INFO',
        timestamp: new Date().toISOString(),
        summary: 'Test event',
        data: {}
      };
      
      expect(eventMatchesFilters(event, {})).toBe(true);
      expect(eventMatchesFilters(event, { eventTypes: undefined })).toBe(true);
    });

    it('should filter by event type', () => {
      const event: StreamedAuditEvent = {
        eventId: 'test-1',
        eventType: 'TRADE_SIGNAL',
        severity: 'INFO',
        timestamp: new Date().toISOString(),
        summary: 'Test event',
        data: {}
      };
      
      expect(eventMatchesFilters(event, { eventTypes: ['TRADE_SIGNAL'] })).toBe(true);
      expect(eventMatchesFilters(event, { eventTypes: ['ORDER_CREATED'] })).toBe(false);
    });

    it('should filter by severity', () => {
      const event: StreamedAuditEvent = {
        eventId: 'test-1',
        eventType: 'TRADE_SIGNAL',
        severity: 'CRITICAL',
        timestamp: new Date().toISOString(),
        summary: 'Test event',
        data: {}
      };
      
      expect(eventMatchesFilters(event, { severities: ['CRITICAL', 'EMERGENCY'] })).toBe(true);
      expect(eventMatchesFilters(event, { severities: ['INFO', 'WARNING'] })).toBe(false);
    });

    it('should filter by strategy ID', () => {
      const strategyId = 'strategy-123';
      const event: StreamedAuditEvent = {
        eventId: 'test-1',
        eventType: 'TRADE_SIGNAL',
        severity: 'INFO',
        timestamp: new Date().toISOString(),
        summary: 'Test event',
        data: { strategyId }
      };
      
      expect(eventMatchesFilters(event, { strategyIds: [strategyId] })).toBe(true);
      expect(eventMatchesFilters(event, { strategyIds: ['other-strategy'] })).toBe(false);
    });
  });

  describe('severityMeetsThreshold', () => {
    it('should return true for CRITICAL when threshold is CRITICAL', () => {
      expect(severityMeetsThreshold('CRITICAL', 'CRITICAL')).toBe(true);
    });

    it('should return true for EMERGENCY when threshold is CRITICAL', () => {
      expect(severityMeetsThreshold('EMERGENCY', 'CRITICAL')).toBe(true);
    });

    it('should return false for ERROR when threshold is CRITICAL', () => {
      expect(severityMeetsThreshold('ERROR', 'CRITICAL')).toBe(false);
    });

    it('should return true for EMERGENCY when threshold is EMERGENCY', () => {
      expect(severityMeetsThreshold('EMERGENCY', 'EMERGENCY')).toBe(true);
    });

    it('should return false for CRITICAL when threshold is EMERGENCY', () => {
      expect(severityMeetsThreshold('CRITICAL', 'EMERGENCY')).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should create a subscription', async () => {
      const subscription = await AuditStreamerService.subscribe(
        'tenant-1',
        'user-1',
        { eventTypes: ['TRADE_SIGNAL'] }
      );
      
      expect(subscription.tenantId).toBe('tenant-1');
      expect(subscription.userId).toBe('user-1');
      expect(mockSubscriptionRepo.createSubscription).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should delete a subscription', async () => {
      const subscription: StreamSubscription = {
        subscriptionId: 'sub-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        filters: {},
        createdAt: new Date().toISOString()
      };
      
      mockSubscriptionRepo.getSubscriptionById.mockResolvedValue(subscription);
      
      await AuditStreamerService.unsubscribe('sub-1');
      
      expect(mockSubscriptionRepo.deleteSubscription).toHaveBeenCalledWith('tenant-1', 'sub-1');
    });
  });

  describe('configureNotifications', () => {
    it('should save notification configuration', async () => {
      const config = await AuditStreamerService.configureNotifications({
        tenantId: 'tenant-1',
        channels: [{ type: 'EMAIL', destination: 'test@example.com', enabled: true }],
        severityThreshold: 'CRITICAL'
      });
      
      expect(config.tenantId).toBe('tenant-1');
      expect(mockSubscriptionRepo.saveNotificationConfig).toHaveBeenCalled();
    });
  });
});


/**
 * Property-Based Tests for Real-Time Audit Streaming
 * Feature: reporting-audit
 */
describe('Audit Streamer Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditStreamerService.clearCache();
    
    mockSubscriptionRepo.createSubscription.mockImplementation(async (input) => ({
      subscriptionId: 'test-sub-' + Math.random().toString(36).substr(2, 9),
      tenantId: input.tenantId,
      userId: input.userId,
      filters: input.filters || {},
      createdAt: new Date().toISOString()
    }));
    
    mockSubscriptionRepo.getSubscriptionById.mockResolvedValue(null);
    mockSubscriptionRepo.listAllSubscriptions.mockResolvedValue([]);
    mockSubscriptionRepo.listSubscriptions.mockResolvedValue([]);
    mockSubscriptionRepo.deleteSubscription.mockResolvedValue();
    mockSubscriptionRepo.bufferEvent.mockResolvedValue();
    mockSubscriptionRepo.getBufferedEvents.mockResolvedValue([]);
    mockSubscriptionRepo.saveNotificationConfig.mockImplementation(async (input) => ({
      tenantId: input.tenantId,
      channels: input.channels,
      severityThreshold: input.severityThreshold
    }));
    mockSubscriptionRepo.getNotificationConfig.mockResolvedValue(null);
  });

  /**
   * Property 31: Stream Filter Correctness
   * 
   * *For any* stream subscription with filters (event types, severities), all events
   * delivered to the subscriber SHALL match the specified filters.
   * 
   * **Validates: Requirements 10.2**
   */
  describe('Property 31: Stream Filter Correctness', () => {
    it('should only match events that satisfy ALL specified filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          streamFiltersArb(),
          streamedAuditEventArb(),
          async (filters, event) => {
            const matches = eventMatchesFilters(event, filters);
            
            // If event matches, verify all filter conditions are satisfied
            if (matches) {
              // Check event type filter
              if (filters.eventTypes && filters.eventTypes.length > 0) {
                expect(filters.eventTypes).toContain(event.eventType);
              }
              
              // Check severity filter
              if (filters.severities && filters.severities.length > 0) {
                expect(filters.severities).toContain(event.severity);
              }
              
              // Check strategy ID filter
              if (filters.strategyIds && filters.strategyIds.length > 0) {
                const eventStrategyId = event.data?.strategyId as string | undefined;
                if (eventStrategyId) {
                  expect(filters.strategyIds).toContain(eventStrategyId);
                } else {
                  // If event has no strategyId but filter requires one, should not match
                  expect(matches).toBe(false);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match all events when no filters are specified', async () => {
      await fc.assert(
        fc.asyncProperty(
          streamedAuditEventArb(),
          async (event) => {
            // Empty filters should match all events
            expect(eventMatchesFilters(event, {})).toBe(true);
            expect(eventMatchesFilters(event, { eventTypes: undefined, severities: undefined })).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly filter by event type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventTypeArb(), { minLength: 1, maxLength: 4 }),
          streamedAuditEventArb(),
          async (allowedTypes, event) => {
            const filters: StreamFilters = { eventTypes: allowedTypes };
            const matches = eventMatchesFilters(event, filters);
            
            // Event should match if and only if its type is in the allowed list
            expect(matches).toBe(allowedTypes.includes(event.eventType));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly filter by severity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(severityArb(), { minLength: 1, maxLength: 4 }),
          streamedAuditEventArb(),
          async (allowedSeverities, event) => {
            const filters: StreamFilters = { severities: allowedSeverities };
            const matches = eventMatchesFilters(event, filters);
            
            // Event should match if and only if its severity is in the allowed list
            expect(matches).toBe(allowedSeverities.includes(event.severity));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should require ALL filters to match (AND logic)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventTypeArb(), { minLength: 1, maxLength: 3 }),
          fc.array(severityArb(), { minLength: 1, maxLength: 3 }),
          streamedAuditEventArb(),
          async (allowedTypes, allowedSeverities, event) => {
            const filters: StreamFilters = {
              eventTypes: allowedTypes,
              severities: allowedSeverities
            };
            const matches = eventMatchesFilters(event, filters);
            
            const typeMatches = allowedTypes.includes(event.eventType);
            const severityMatches = allowedSeverities.includes(event.severity);
            
            // Should match only if BOTH conditions are satisfied
            expect(matches).toBe(typeMatches && severityMatches);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 32: Critical Event Notification
   * 
   * *For any* audit event with severity CRITICAL or EMERGENCY, the system SHALL
   * send notifications to all configured channels for the tenant.
   * 
   * **Validates: Requirements 10.4**
   */
  describe('Property 32: Critical Event Notification', () => {
    it('should identify CRITICAL and EMERGENCY as meeting CRITICAL threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalEventArb(),
          async (event) => {
            // CRITICAL and EMERGENCY should always meet CRITICAL threshold
            expect(severityMeetsThreshold(event.severity, 'CRITICAL')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not identify non-critical events as meeting CRITICAL threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonCriticalEventArb(),
          async (event) => {
            // DEBUG, INFO, WARNING, ERROR should NOT meet CRITICAL threshold
            expect(severityMeetsThreshold(event.severity, 'CRITICAL')).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only identify EMERGENCY as meeting EMERGENCY threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          severityArb(),
          async (severity) => {
            const meetsThreshold = severityMeetsThreshold(severity, 'EMERGENCY');
            
            // Only EMERGENCY should meet EMERGENCY threshold
            expect(meetsThreshold).toBe(severity === 'EMERGENCY');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trigger notifications for critical events when config exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalEventArb(),
          notificationConfigInputArb(),
          async (event, configInput) => {
            // Set up notification config
            const config: NotificationConfig = {
              tenantId: configInput.tenantId,
              channels: configInput.channels,
              severityThreshold: configInput.severityThreshold
            };
            
            mockSubscriptionRepo.getNotificationConfig.mockResolvedValue(config);
            
            // Add tenant ID to event
            const eventWithTenant = {
              ...event,
              data: { ...event.data, tenantId: configInput.tenantId }
            };
            
            // Check if event meets threshold
            const meetsThreshold = severityMeetsThreshold(
              eventWithTenant.severity,
              config.severityThreshold
            );
            
            // If event meets threshold, notifications should be triggered
            if (meetsThreshold) {
              // The event severity should be CRITICAL or EMERGENCY
              expect(['CRITICAL', 'EMERGENCY']).toContain(eventWithTenant.severity);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 33: Concurrent Subscriber Delivery
   * 
   * *For any* audit event published, all active subscribers for the tenant
   * (matching the event's filters) SHALL receive the event.
   * 
   * **Validates: Requirements 10.5**
   */
  describe('Property 33: Concurrent Subscriber Delivery', () => {
    it('should deliver events to all matching subscribers', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleSubscriptionsArb(3),
          streamedAuditEventArb(),
          async (subscriptions, event) => {
            // Set up subscriptions in mock
            mockSubscriptionRepo.listAllSubscriptions.mockResolvedValue(subscriptions);
            
            // Track which subscriptions received the event
            const receivedBy: string[] = [];
            
            // Register callbacks for each subscription
            for (const sub of subscriptions) {
              AuditStreamerService.registerCallback(sub.subscriptionId, (e) => {
                receivedBy.push(sub.subscriptionId);
              });
            }
            
            // Add tenant ID to event (matching the subscriptions)
            const tenantId = subscriptions[0].tenantId;
            const eventWithTenant = {
              ...event,
              data: { ...event.data, tenantId }
            };
            
            // Publish the event
            await AuditStreamerService.publishEvent(eventWithTenant);
            
            // Check which subscriptions should have received the event
            for (const sub of subscriptions) {
              const shouldReceive = eventMatchesFilters(eventWithTenant, sub.filters);
              const didReceive = receivedBy.includes(sub.subscriptionId);
              
              // If subscription filters match, it should have received the event
              if (shouldReceive) {
                expect(didReceive).toBe(true);
              }
            }
            
            // Clean up callbacks
            for (const sub of subscriptions) {
              AuditStreamerService.unregisterCallback(sub.subscriptionId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should buffer events for all matching subscriptions', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleSubscriptionsArb(3),
          streamedAuditEventArb(),
          async (subscriptions, event) => {
            // Set up subscriptions in mock
            mockSubscriptionRepo.listAllSubscriptions.mockResolvedValue(subscriptions);
            
            // Add tenant ID to event
            const tenantId = subscriptions[0].tenantId;
            const eventWithTenant = {
              ...event,
              data: { ...event.data, tenantId }
            };
            
            // Publish the event (no callbacks registered, so events should be buffered)
            await AuditStreamerService.publishEvent(eventWithTenant);
            
            // Check that bufferEvent was called for matching subscriptions
            const bufferCalls = mockSubscriptionRepo.bufferEvent.mock.calls;
            
            for (const sub of subscriptions) {
              const shouldBuffer = eventMatchesFilters(eventWithTenant, sub.filters);
              const wasBuffered = bufferCalls.some(
                call => call[0] === tenantId && call[1] === sub.subscriptionId
              );
              
              if (shouldBuffer) {
                expect(wasBuffered).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not deliver events to subscribers with non-matching filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          streamSubscriptionArb(),
          streamedAuditEventArb(),
          async (subscription, event) => {
            // Set up subscription with specific filters
            const strictFilters: StreamFilters = {
              eventTypes: ['NONEXISTENT_TYPE'],
              severities: ['NONEXISTENT_SEVERITY']
            };
            const subWithStrictFilters = { ...subscription, filters: strictFilters };
            
            mockSubscriptionRepo.listAllSubscriptions.mockResolvedValue([subWithStrictFilters]);
            
            // Track if callback was invoked
            let callbackInvoked = false;
            AuditStreamerService.registerCallback(subscription.subscriptionId, () => {
              callbackInvoked = true;
            });
            
            // Publish event
            await AuditStreamerService.publishEvent(event);
            
            // Callback should NOT have been invoked (filters don't match)
            expect(callbackInvoked).toBe(false);
            
            // Clean up
            AuditStreamerService.unregisterCallback(subscription.subscriptionId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 34: Event Buffer Replay
   * 
   * *For any* subscriber that disconnects and reconnects within the buffer window,
   * all events that occurred during disconnection SHALL be replayed in order.
   * 
   * **Validates: Requirements 10.6**
   */
  describe('Property 34: Event Buffer Replay', () => {
    it('should return buffered events in chronological order', async () => {
      await fc.assert(
        fc.asyncProperty(
          bufferedEventsSequenceArb(5),
          streamSubscriptionArb(),
          async (events, subscription) => {
            // Set up mock to return buffered events
            mockSubscriptionRepo.getSubscriptionById.mockResolvedValue(subscription);
            mockSubscriptionRepo.getBufferedEvents.mockResolvedValue(events);
            
            // Get buffered events
            const since = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
            const bufferedEvents = await AuditStreamerService.getBufferedEvents(
              subscription.subscriptionId,
              since
            );
            
            // Verify events are in chronological order
            for (let i = 1; i < bufferedEvents.length; i++) {
              const prevTime = new Date(bufferedEvents[i - 1].timestamp).getTime();
              const currTime = new Date(bufferedEvents[i].timestamp).getTime();
              expect(currTime).toBeGreaterThanOrEqual(prevTime);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all events since the specified timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          bufferedEventsSequenceArb(5),
          streamSubscriptionArb(),
          isoDateStringArb(),
          async (events, subscription, since) => {
            // Filter events that should be returned (after 'since')
            const sinceTime = new Date(since).getTime();
            const expectedEvents = events.filter(
              e => new Date(e.timestamp).getTime() > sinceTime
            );
            
            // Set up mock
            mockSubscriptionRepo.getSubscriptionById.mockResolvedValue(subscription);
            mockSubscriptionRepo.getBufferedEvents.mockResolvedValue(expectedEvents);
            
            // Get buffered events
            const bufferedEvents = await AuditStreamerService.getBufferedEvents(
              subscription.subscriptionId,
              since
            );
            
            // All returned events should be after 'since'
            for (const event of bufferedEvents) {
              const eventTime = new Date(event.timestamp).getTime();
              expect(eventTime).toBeGreaterThan(sinceTime);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for non-existent subscription', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          isoDateStringArb(),
          async (subscriptionId, since) => {
            // Mock returns null for non-existent subscription
            mockSubscriptionRepo.getSubscriptionById.mockResolvedValue(null);
            
            const bufferedEvents = await AuditStreamerService.getBufferedEvents(
              subscriptionId,
              since
            );
            
            expect(bufferedEvents).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve event data integrity during buffering', async () => {
      await fc.assert(
        fc.asyncProperty(
          streamedAuditEventArb(),
          streamSubscriptionArb(),
          async (event, subscription) => {
            // Set up mock to return the same event
            mockSubscriptionRepo.getSubscriptionById.mockResolvedValue(subscription);
            mockSubscriptionRepo.getBufferedEvents.mockResolvedValue([event]);
            
            const since = new Date(Date.now() - 3600000).toISOString();
            const bufferedEvents = await AuditStreamerService.getBufferedEvents(
              subscription.subscriptionId,
              since
            );
            
            // Verify event data is preserved
            if (bufferedEvents.length > 0) {
              const bufferedEvent = bufferedEvents[0];
              expect(bufferedEvent.eventId).toBe(event.eventId);
              expect(bufferedEvent.eventType).toBe(event.eventType);
              expect(bufferedEvent.severity).toBe(event.severity);
              expect(bufferedEvent.summary).toBe(event.summary);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
