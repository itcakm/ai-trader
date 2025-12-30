import * as fc from 'fast-check';
import { RiskEventService } from './risk-event';
import { RiskEventRepository } from '../repositories/risk-event';
import { RiskEvent, RiskEventInput, AlertConfig, AlertChannel } from '../types/risk-event';
import {
  riskEventArb,
  riskEventInputArb,
  alertConfigArb,
  tenantRiskEventsArb,
  multiTenantRiskEventsArb,
  riskEventSeverityArb,
  riskEventTypeArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/risk-event');

const mockRiskEventRepo = RiskEventRepository as jest.Mocked<typeof RiskEventRepository>;

describe('RiskEventService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRiskEventRepo.clearAllCaches?.();
    RiskEventService.resetAlertSender();
  });

  /**
   * Property 24: Risk Event Logging
   * 
   * For any risk event, the log record SHALL contain eventType, severity, 
   * triggerCondition, actionTaken, and timestamp, AND the record SHALL be 
   * serializable to and from JSON without data loss.
   * 
   * **Validates: Requirements 10.1, 10.2**
   */
  describe('Property 24: Risk Event Logging', () => {
    it('logEvent creates event with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskEventInputArb(),
          async (input) => {
            let savedEvent: RiskEvent | undefined;
            mockRiskEventRepo.putEvent.mockImplementation(async (event: RiskEvent) => {
              savedEvent = event;
            });
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(null);

            const result = await RiskEventService.logEvent(input);

            // Verify all required fields are present
            expect(result.eventId).toBeDefined();
            expect(result.tenantId).toBe(input.tenantId);
            expect(result.eventType).toBe(input.eventType);
            expect(result.severity).toBe(input.severity);
            expect(result.description).toBe(input.description);
            expect(result.triggerCondition).toBe(input.triggerCondition);
            expect(result.actionTaken).toBe(input.actionTaken);
            expect(result.timestamp).toBeDefined();
            expect(result.metadata).toBeDefined();

            // Verify event was saved
            expect(savedEvent).toBeDefined();
            expect(savedEvent?.eventId).toBe(result.eventId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('event serialization round-trip preserves all data', () => {
      fc.assert(
        fc.property(
          riskEventArb(),
          (event) => {
            // Serialize to JSON
            const serialized = RiskEventService.serializeEvent(event);
            
            // Deserialize back
            const deserialized = RiskEventService.deserializeEvent(serialized);

            // Verify all fields are preserved
            expect(deserialized.eventId).toBe(event.eventId);
            expect(deserialized.tenantId).toBe(event.tenantId);
            expect(deserialized.eventType).toBe(event.eventType);
            expect(deserialized.severity).toBe(event.severity);
            expect(deserialized.strategyId).toBe(event.strategyId);
            expect(deserialized.assetId).toBe(event.assetId);
            expect(deserialized.description).toBe(event.description);
            expect(deserialized.triggerCondition).toBe(event.triggerCondition);
            expect(deserialized.actionTaken).toBe(event.actionTaken);
            expect(deserialized.timestamp).toBe(event.timestamp);
            expect(JSON.stringify(deserialized.metadata)).toBe(JSON.stringify(event.metadata));

            // Verify using the service's validation method
            expect(RiskEventService.validateRoundTrip(event)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('serialized event is valid JSON', () => {
      fc.assert(
        fc.property(
          riskEventArb(),
          (event) => {
            const serialized = RiskEventService.serializeEvent(event);
            
            // Should not throw when parsing
            expect(() => JSON.parse(serialized)).not.toThrow();
            
            // Should be a string
            expect(typeof serialized).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('timestamp is set to current time on logEvent', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskEventInputArb(),
          async (input) => {
            const beforeTime = new Date().toISOString();
            
            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(null);

            const result = await RiskEventService.logEvent(input);
            
            const afterTime = new Date().toISOString();

            // Timestamp should be between before and after
            expect(result.timestamp >= beforeTime).toBe(true);
            expect(result.timestamp <= afterTime).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('eventId is unique for each logged event', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskEventInputArb(),
          async (input) => {
            const eventIds = new Set<string>();
            
            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(null);

            // Log multiple events with same input
            for (let i = 0; i < 5; i++) {
              const result = await RiskEventService.logEvent(input);
              eventIds.add(result.eventId);
            }

            // All event IDs should be unique
            expect(eventIds.size).toBe(5);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('metadata defaults to empty object when not provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          riskEventTypeArb(),
          riskEventSeverityArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 5, maxLength: 50 }),
          fc.string({ minLength: 5, maxLength: 50 }),
          async (tenantId, eventType, severity, description, triggerCondition, actionTaken) => {
            const input: RiskEventInput = {
              tenantId,
              eventType,
              severity,
              description,
              triggerCondition,
              actionTaken
              // metadata not provided
            };

            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(null);

            const result = await RiskEventService.logEvent(input);

            // Metadata should default to empty object
            expect(result.metadata).toBeDefined();
            expect(typeof result.metadata).toBe('object');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Alert Configuration', () => {
    it('configureAlerts stores configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          alertConfigArb(),
          async (tenantId, config) => {
            let savedConfig: AlertConfig | undefined;
            mockRiskEventRepo.putAlertConfig.mockImplementation(async (_tid: string, cfg: AlertConfig) => {
              savedConfig = cfg;
            });

            await RiskEventService.configureAlerts(tenantId, config);

            expect(savedConfig).toBeDefined();
            expect(savedConfig?.channels).toEqual(config.channels);
            expect(savedConfig?.severityThreshold).toBe(config.severityThreshold);
            expect(savedConfig?.eventTypes).toEqual(config.eventTypes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('alerts are sent when severity meets threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskEventInputArb(),
          async (input) => {
            // Create config that will trigger alerts
            const config: AlertConfig = {
              channels: [{ type: 'EMAIL', destination: 'test@example.com', enabled: true }],
              severityThreshold: 'INFO', // Lowest threshold, all events should trigger
              eventTypes: [] // Empty means all types
            };

            const alertsSent: Array<{ channel: AlertChannel; event: RiskEvent }> = [];
            RiskEventService.setAlertSender(async (channel, event) => {
              alertsSent.push({ channel, event });
            });

            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(config);

            await RiskEventService.logEvent(input);

            // Alert should have been sent
            expect(alertsSent.length).toBe(1);
            expect(alertsSent[0].event.eventType).toBe(input.eventType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('alerts are not sent when severity below threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          riskEventTypeArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 5, maxLength: 50 }),
          fc.string({ minLength: 5, maxLength: 50 }),
          async (tenantId, eventType, description, triggerCondition, actionTaken) => {
            // Create INFO severity event
            const input: RiskEventInput = {
              tenantId,
              eventType,
              severity: 'INFO',
              description,
              triggerCondition,
              actionTaken
            };

            // Config with EMERGENCY threshold (highest)
            const config: AlertConfig = {
              channels: [{ type: 'EMAIL', destination: 'test@example.com', enabled: true }],
              severityThreshold: 'EMERGENCY',
              eventTypes: []
            };

            const alertsSent: Array<{ channel: AlertChannel; event: RiskEvent }> = [];
            RiskEventService.setAlertSender(async (channel, event) => {
              alertsSent.push({ channel, event });
            });

            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(config);

            await RiskEventService.logEvent(input);

            // No alert should have been sent (INFO < EMERGENCY)
            expect(alertsSent.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('only enabled channels receive alerts', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskEventInputArb(),
          async (input) => {
            const config: AlertConfig = {
              channels: [
                { type: 'EMAIL', destination: 'test@example.com', enabled: true },
                { type: 'SMS', destination: '+1234567890', enabled: false },
                { type: 'WEBHOOK', destination: 'https://example.com/hook', enabled: true }
              ],
              severityThreshold: 'INFO',
              eventTypes: []
            };

            const alertsSent: Array<{ channel: AlertChannel; event: RiskEvent }> = [];
            RiskEventService.setAlertSender(async (channel, event) => {
              alertsSent.push({ channel, event });
            });

            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(config);

            await RiskEventService.logEvent(input);

            // Only enabled channels should receive alerts
            expect(alertsSent.length).toBe(2);
            expect(alertsSent.every(a => a.channel.enabled)).toBe(true);
            expect(alertsSent.some(a => a.channel.type === 'SMS')).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Helper Methods', () => {
    it('logLimitBreach creates correct event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 3, maxLength: 20 }),
          fc.double({ min: 0, max: 1000000, noNaN: true }),
          fc.double({ min: 0, max: 1000000, noNaN: true }),
          async (tenantId, limitType, currentValue, maxValue) => {
            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(null);

            const result = await RiskEventService.logLimitBreach(
              tenantId,
              limitType,
              currentValue,
              maxValue
            );

            expect(result.eventType).toBe('LIMIT_BREACH');
            expect(result.severity).toBe('CRITICAL');
            expect(result.tenantId).toBe(tenantId);
            expect(result.metadata).toEqual({ limitType, currentValue, maxValue });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('logKillSwitchActivated creates EMERGENCY event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 100 }),
          fc.string({ minLength: 3, maxLength: 50 }),
          fc.constantFrom('MANUAL', 'AUTOMATIC'),
          async (tenantId, reason, activatedBy, triggerType) => {
            mockRiskEventRepo.putEvent.mockResolvedValue();
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(null);

            const result = await RiskEventService.logKillSwitchActivated(
              tenantId,
              reason,
              activatedBy,
              triggerType as 'MANUAL' | 'AUTOMATIC'
            );

            expect(result.eventType).toBe('KILL_SWITCH_ACTIVATED');
            expect(result.severity).toBe('EMERGENCY');
            expect(result.metadata).toEqual({ reason, activatedBy, triggerType });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Period Parsing', () => {
    it('parsePeriod handles hours correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 168 }),
          (hours) => {
            const { startTime, endTime } = RiskEventService.parsePeriod(`${hours}h`);
            
            const start = new Date(startTime);
            const end = new Date(endTime);
            const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            
            // Allow small tolerance for execution time
            expect(Math.abs(diffHours - hours)).toBeLessThan(0.1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('parsePeriod handles days correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30 }),
          (days) => {
            const { startTime, endTime } = RiskEventService.parsePeriod(`${days}d`);
            
            const start = new Date(startTime);
            const end = new Date(endTime);
            const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
            
            // Allow small tolerance for execution time
            expect(Math.abs(diffDays - days)).toBeLessThan(0.1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 25: Risk Event Tenant Isolation
   * 
   * For any tenant querying risk events, the results SHALL contain only events 
   * where the event's tenantId matches the requesting tenant's ID.
   * 
   * **Validates: Requirements 10.4**
   */
  describe('Property 25: Risk Event Tenant Isolation', () => {
    it('getEvents returns only events for the requesting tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          multiTenantRiskEventsArb(),
          async ({ tenant1Id, tenant1Events, tenant2Id, tenant2Events }) => {
            // Setup mock to return events filtered by tenant
            mockRiskEventRepo.listEvents.mockImplementation(async (tenantId: string) => {
              if (tenantId === tenant1Id) {
                return { items: tenant1Events, lastEvaluatedKey: undefined };
              } else if (tenantId === tenant2Id) {
                return { items: tenant2Events, lastEvaluatedKey: undefined };
              }
              return { items: [], lastEvaluatedKey: undefined };
            });

            // Query for tenant1's events
            const tenant1Results = await RiskEventService.getEvents(tenant1Id, {});
            
            // Query for tenant2's events
            const tenant2Results = await RiskEventService.getEvents(tenant2Id, {});

            // Verify tenant1 only gets their events
            expect(tenant1Results.every(e => e.tenantId === tenant1Id)).toBe(true);
            expect(tenant1Results.length).toBe(tenant1Events.length);

            // Verify tenant2 only gets their events
            expect(tenant2Results.every(e => e.tenantId === tenant2Id)).toBe(true);
            expect(tenant2Results.length).toBe(tenant2Events.length);

            // Verify no cross-tenant leakage
            expect(tenant1Results.some(e => e.tenantId === tenant2Id)).toBe(false);
            expect(tenant2Results.some(e => e.tenantId === tenant1Id)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('tenant cannot access events from another tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          multiTenantRiskEventsArb(),
          async ({ tenant1Id, tenant1Events, tenant2Id, tenant2Events }) => {
            // Setup mock - simulate proper tenant isolation
            mockRiskEventRepo.listEvents.mockImplementation(async (tenantId: string) => {
              // Only return events that match the requesting tenant
              const allEvents = [...tenant1Events, ...tenant2Events];
              const filteredEvents = allEvents.filter(e => e.tenantId === tenantId);
              return { items: filteredEvents, lastEvaluatedKey: undefined };
            });

            // Tenant1 queries - should only get tenant1 events
            const results = await RiskEventService.getEvents(tenant1Id, {});

            // Verify isolation
            for (const event of results) {
              expect(event.tenantId).toBe(tenant1Id);
              expect(event.tenantId).not.toBe(tenant2Id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('event statistics are isolated by tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          multiTenantRiskEventsArb(),
          async ({ tenant1Id, tenant1Events, tenant2Id, tenant2Events }) => {
            // Setup mock for stats
            mockRiskEventRepo.getEventStats.mockImplementation(
              async (tenantId: string, _startTime: string, _endTime: string) => {
                const events = tenantId === tenant1Id ? tenant1Events : tenant2Events;
                
                const eventsByType: Record<string, number> = {};
                const eventsBySeverity: Record<string, number> = {};
                
                for (const event of events) {
                  eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
                  eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
                }

                return {
                  totalEvents: events.length,
                  eventsByType: eventsByType as any,
                  eventsBySeverity: eventsBySeverity as any,
                  period: 'test'
                };
              }
            );

            const tenant1Stats = await RiskEventService.getEventStats(tenant1Id, '24h');
            const tenant2Stats = await RiskEventService.getEventStats(tenant2Id, '24h');

            // Stats should reflect only that tenant's events
            expect(tenant1Stats.totalEvents).toBe(tenant1Events.length);
            expect(tenant2Stats.totalEvents).toBe(tenant2Events.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('alert configuration is isolated by tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          alertConfigArb(),
          alertConfigArb(),
          async (tenant1Id, tenant2Id, config1, config2) => {
            // Ensure different tenants
            if (tenant1Id === tenant2Id) return;

            const savedConfigs = new Map<string, AlertConfig>();
            
            mockRiskEventRepo.putAlertConfig.mockImplementation(
              async (tenantId: string, config: AlertConfig) => {
                savedConfigs.set(tenantId, config);
              }
            );

            mockRiskEventRepo.getAlertConfig.mockImplementation(
              async (tenantId: string) => {
                return savedConfigs.get(tenantId) || null;
              }
            );

            // Configure alerts for both tenants
            await RiskEventService.configureAlerts(tenant1Id, config1);
            await RiskEventService.configureAlerts(tenant2Id, config2);

            // Verify each tenant gets their own config
            const retrieved1 = await RiskEventService.getAlertConfig(tenant1Id);
            const retrieved2 = await RiskEventService.getAlertConfig(tenant2Id);

            expect(retrieved1).toEqual(config1);
            expect(retrieved2).toEqual(config2);
            expect(retrieved1).not.toEqual(retrieved2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('logged events are stored with correct tenant ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          riskEventInputArb(),
          async (input) => {
            let savedEvent: RiskEvent | undefined;
            mockRiskEventRepo.putEvent.mockImplementation(async (event: RiskEvent) => {
              savedEvent = event;
            });
            mockRiskEventRepo.getAlertConfig.mockResolvedValue(null);

            await RiskEventService.logEvent(input);

            // Verify the saved event has the correct tenant ID
            expect(savedEvent).toBeDefined();
            expect(savedEvent?.tenantId).toBe(input.tenantId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
