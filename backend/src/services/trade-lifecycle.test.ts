import * as fc from 'fast-check';
import {
  TradeLifecycleService,
  hasRequiredFields,
  calculateLatency
} from './trade-lifecycle';
import { TradeLifecycleRepository } from '../repositories/trade-lifecycle';
import { TradeEvent, TradeEventInput } from '../types/trade-lifecycle';
import {
  tradeEventArb,
  tradeEventInputArb,
  tradeEventSequenceArb,
  orderSnapshotArb,
  triggerConditionArb,
  tradeEventTypeArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository for unit testing
jest.mock('../repositories/trade-lifecycle');

const mockRepository = TradeLifecycleRepository as jest.Mocked<typeof TradeLifecycleRepository>;

describe('Trade Lifecycle Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logTradeEvent', () => {
    it('should log a trade event with all required fields', async () => {
      const input: TradeEventInput = {
        tenantId: 'tenant-123',
        tradeCorrelationId: 'corr-456',
        eventType: 'ORDER_CREATED',
        orderDetails: {
          orderId: 'order-789',
          symbol: 'BTC',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: 1.5,
          filledQuantity: 0,
          price: 50000,
          status: 'NEW',
          parameters: {}
        },
        strategyId: 'strategy-abc',
        triggerConditions: [
          { type: 'SIGNAL', description: 'Buy signal triggered', value: true }
        ]
      };

      mockRepository.listEventsByCorrelationId.mockResolvedValue([]);
      mockRepository.putEvent.mockImplementation(async (event) => event);

      const result = await TradeLifecycleService.logTradeEvent(input);

      expect(result.eventId).toBeDefined();
      expect(result.tenantId).toBe(input.tenantId);
      expect(result.tradeCorrelationId).toBe(input.tradeCorrelationId);
      expect(result.eventType).toBe(input.eventType);
      expect(result.timestamp).toBeDefined();
      expect(result.orderDetails).toEqual(input.orderDetails);
      expect(result.strategyId).toBe(input.strategyId);
      expect(result.triggerConditions).toEqual(input.triggerConditions);
      expect(mockRepository.putEvent).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: input.tenantId,
        tradeCorrelationId: input.tradeCorrelationId
      }));
    });

    it('should calculate latency from previous event', async () => {
      const previousTimestamp = new Date('2024-01-01T10:00:00.000Z').toISOString();
      const previousEvent: TradeEvent = {
        eventId: 'prev-event',
        tenantId: 'tenant-123',
        tradeCorrelationId: 'corr-456',
        eventType: 'SIGNAL_GENERATED',
        timestamp: previousTimestamp,
        orderDetails: {
          orderId: 'order-789',
          symbol: 'BTC',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: 1.5,
          filledQuantity: 0,
          status: 'NEW',
          parameters: {}
        },
        strategyId: 'strategy-abc',
        triggerConditions: [],
        metadata: {}
      };

      const input: TradeEventInput = {
        tenantId: 'tenant-123',
        tradeCorrelationId: 'corr-456',
        eventType: 'ORDER_CREATED',
        orderDetails: {
          orderId: 'order-789',
          symbol: 'BTC',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: 1.5,
          filledQuantity: 0,
          status: 'NEW',
          parameters: {}
        },
        strategyId: 'strategy-abc',
        triggerConditions: []
      };

      mockRepository.listEventsByCorrelationId.mockResolvedValue([previousEvent]);
      mockRepository.putEvent.mockImplementation(async (event) => event);

      const result = await TradeLifecycleService.logTradeEvent(input);

      expect(result.latencyFromPrevious).toBeDefined();
      expect(typeof result.latencyFromPrevious).toBe('number');
      expect(result.latencyFromPrevious).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTradeLifecycle', () => {
    it('should return events sorted by timestamp', async () => {
      const events: TradeEvent[] = [
        {
          eventId: 'event-3',
          tenantId: 'tenant-123',
          tradeCorrelationId: 'corr-456',
          eventType: 'COMPLETE_FILL',
          timestamp: '2024-01-01T10:02:00.000Z',
          orderDetails: { orderId: 'o1', symbol: 'BTC', side: 'BUY', orderType: 'LIMIT', quantity: 1, filledQuantity: 1, status: 'FILLED', parameters: {} },
          strategyId: 'strategy-abc',
          triggerConditions: [],
          metadata: {}
        },
        {
          eventId: 'event-1',
          tenantId: 'tenant-123',
          tradeCorrelationId: 'corr-456',
          eventType: 'SIGNAL_GENERATED',
          timestamp: '2024-01-01T10:00:00.000Z',
          orderDetails: { orderId: 'o1', symbol: 'BTC', side: 'BUY', orderType: 'LIMIT', quantity: 1, filledQuantity: 0, status: 'NEW', parameters: {} },
          strategyId: 'strategy-abc',
          triggerConditions: [],
          metadata: {}
        },
        {
          eventId: 'event-2',
          tenantId: 'tenant-123',
          tradeCorrelationId: 'corr-456',
          eventType: 'ORDER_SUBMITTED',
          timestamp: '2024-01-01T10:01:00.000Z',
          orderDetails: { orderId: 'o1', symbol: 'BTC', side: 'BUY', orderType: 'LIMIT', quantity: 1, filledQuantity: 0, status: 'PENDING', parameters: {} },
          strategyId: 'strategy-abc',
          triggerConditions: [],
          metadata: {}
        }
      ];

      mockRepository.listEventsByCorrelationId.mockResolvedValue(events);

      const result = await TradeLifecycleService.getTradeLifecycle('tenant-123', 'corr-456');

      expect(result).toHaveLength(3);
      expect(result[0].eventId).toBe('event-1');
      expect(result[1].eventId).toBe('event-2');
      expect(result[2].eventId).toBe('event-3');
    });
  });

  describe('getLatencyMetrics', () => {
    it('should calculate correct latency metrics', async () => {
      const events: TradeEvent[] = [
        {
          eventId: 'event-1',
          tenantId: 'tenant-123',
          tradeCorrelationId: 'corr-456',
          eventType: 'SIGNAL_GENERATED',
          timestamp: '2024-01-01T10:00:00.000Z',
          orderDetails: { orderId: 'o1', symbol: 'BTC', side: 'BUY', orderType: 'LIMIT', quantity: 1, filledQuantity: 0, status: 'NEW', parameters: {} },
          strategyId: 'strategy-abc',
          triggerConditions: [],
          metadata: {}
        },
        {
          eventId: 'event-2',
          tenantId: 'tenant-123',
          tradeCorrelationId: 'corr-456',
          eventType: 'ORDER_SUBMITTED',
          timestamp: '2024-01-01T10:00:01.000Z', // 1 second later
          orderDetails: { orderId: 'o1', symbol: 'BTC', side: 'BUY', orderType: 'LIMIT', quantity: 1, filledQuantity: 0, status: 'PENDING', parameters: {} },
          strategyId: 'strategy-abc',
          triggerConditions: [],
          metadata: {}
        },
        {
          eventId: 'event-3',
          tenantId: 'tenant-123',
          tradeCorrelationId: 'corr-456',
          eventType: 'COMPLETE_FILL',
          timestamp: '2024-01-01T10:00:03.000Z', // 2 seconds later
          orderDetails: { orderId: 'o1', symbol: 'BTC', side: 'BUY', orderType: 'LIMIT', quantity: 1, filledQuantity: 1, status: 'FILLED', parameters: {} },
          strategyId: 'strategy-abc',
          triggerConditions: [],
          metadata: {}
        }
      ];

      mockRepository.listEventsByCorrelationId.mockResolvedValue(events);

      const result = await TradeLifecycleService.getLatencyMetrics('tenant-123', 'corr-456');

      expect(result.tradeCorrelationId).toBe('corr-456');
      expect(result.totalLatencyMs).toBe(3000); // 1000 + 2000
      expect(result.stageLatencies).toHaveLength(2);
      expect(result.stageLatencies[0].fromEvent).toBe('SIGNAL_GENERATED');
      expect(result.stageLatencies[0].toEvent).toBe('ORDER_SUBMITTED');
      expect(result.stageLatencies[0].latencyMs).toBe(1000);
      expect(result.stageLatencies[1].fromEvent).toBe('ORDER_SUBMITTED');
      expect(result.stageLatencies[1].toEvent).toBe('COMPLETE_FILL');
      expect(result.stageLatencies[1].latencyMs).toBe(2000);
      expect(result.averageLatencyMs).toBe(1500);
    });

    it('should return empty metrics for no events', async () => {
      mockRepository.listEventsByCorrelationId.mockResolvedValue([]);

      const result = await TradeLifecycleService.getLatencyMetrics('tenant-123', 'corr-456');

      expect(result.totalLatencyMs).toBe(0);
      expect(result.stageLatencies).toHaveLength(0);
      expect(result.averageLatencyMs).toBe(0);
    });
  });

  describe('hasRequiredFields', () => {
    it('should return true for valid trade event', () => {
      const event: TradeEvent = {
        eventId: 'event-1',
        tenantId: 'tenant-123',
        tradeCorrelationId: 'corr-456',
        eventType: 'ORDER_CREATED',
        timestamp: '2024-01-01T10:00:00.000Z',
        orderDetails: {
          orderId: 'order-789',
          symbol: 'BTC',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: 1.5,
          filledQuantity: 0,
          status: 'NEW',
          parameters: {}
        },
        strategyId: 'strategy-abc',
        triggerConditions: [],
        metadata: {}
      };

      expect(hasRequiredFields(event)).toBe(true);
    });

    it('should return false for missing eventId', () => {
      const event = {
        eventId: '',
        tenantId: 'tenant-123',
        tradeCorrelationId: 'corr-456',
        eventType: 'ORDER_CREATED',
        timestamp: '2024-01-01T10:00:00.000Z',
        orderDetails: {
          orderId: 'order-789',
          symbol: 'BTC',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: 1.5,
          filledQuantity: 0,
          status: 'NEW',
          parameters: {}
        },
        strategyId: 'strategy-abc',
        triggerConditions: [],
        metadata: {}
      } as TradeEvent;

      expect(hasRequiredFields(event)).toBe(false);
    });
  });

  describe('calculateLatency', () => {
    it('should calculate correct latency between timestamps', () => {
      const from = '2024-01-01T10:00:00.000Z';
      const to = '2024-01-01T10:00:05.000Z';

      expect(calculateLatency(from, to)).toBe(5000);
    });
  });
});

/**
 * Property-Based Tests for Trade Lifecycle
 * Feature: reporting-audit
 */
describe('Trade Lifecycle Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Trade Event Field Completeness
   * 
   * *For any* trade event logged by the Audit_Service, the stored record SHALL contain
   * all required fields: event type, timestamp, order details (including all parameters
   * and metadata), strategy ID, and triggering conditions.
   * 
   * **Validates: Requirements 1.2, 1.5**
   */
  describe('Property 1: Trade Event Field Completeness', () => {
    it('should ensure all logged trade events contain required fields', async () => {
      await fc.assert(
        fc.asyncProperty(tradeEventInputArb(), async (input) => {
          mockRepository.listEventsByCorrelationId.mockResolvedValue([]);
          mockRepository.putEvent.mockImplementation(async (event) => event);

          const result = await TradeLifecycleService.logTradeEvent(input);

          // Verify all required fields are present
          expect(result.eventId).toBeDefined();
          expect(result.eventId.length).toBeGreaterThan(0);
          expect(result.tenantId).toBe(input.tenantId);
          expect(result.tradeCorrelationId).toBe(input.tradeCorrelationId);
          expect(result.eventType).toBe(input.eventType);
          expect(result.timestamp).toBeDefined();
          expect(result.strategyId).toBe(input.strategyId);
          expect(Array.isArray(result.triggerConditions)).toBe(true);
          expect(result.metadata).toBeDefined();

          // Verify order details completeness (Requirements: 1.5)
          expect(result.orderDetails).toBeDefined();
          expect(result.orderDetails.orderId).toBe(input.orderDetails.orderId);
          expect(result.orderDetails.symbol).toBe(input.orderDetails.symbol);
          expect(result.orderDetails.side).toBe(input.orderDetails.side);
          expect(result.orderDetails.orderType).toBe(input.orderDetails.orderType);
          expect(typeof result.orderDetails.quantity).toBe('number');
          expect(typeof result.orderDetails.filledQuantity).toBe('number');
          expect(result.orderDetails.status).toBe(input.orderDetails.status);
          expect(result.orderDetails.parameters).toBeDefined();

          // Verify hasRequiredFields returns true
          expect(hasRequiredFields(result)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Trade Correlation Integrity
   * 
   * *For any* set of trade events sharing the same trade correlation ID, querying by
   * that correlation ID SHALL return all events in the set, and no events from other trades.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 2: Trade Correlation Integrity', () => {
    it('should return all and only events with matching correlation ID', async () => {
      await fc.assert(
        fc.asyncProperty(tradeEventSequenceArb(), async ({ tenantId, tradeCorrelationId, events }) => {
          // Mock repository to return the events
          mockRepository.listEventsByCorrelationId.mockResolvedValue(events);

          const result = await TradeLifecycleService.getTradeLifecycle(tenantId, tradeCorrelationId);

          // All returned events should have the same correlation ID
          for (const event of result) {
            expect(event.tradeCorrelationId).toBe(tradeCorrelationId);
            expect(event.tenantId).toBe(tenantId);
          }

          // Should return all events (same count)
          expect(result.length).toBe(events.length);

          // All original events should be in the result
          const resultEventIds = new Set(result.map(e => e.eventId));
          for (const event of events) {
            expect(resultEventIds.has(event.eventId)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Latency Calculation Accuracy
   * 
   * *For any* sequence of trade events with the same correlation ID, the latency recorded
   * for each event (except the first) SHALL equal the difference between its timestamp
   * and the previous event's timestamp.
   * 
   * **Validates: Requirements 1.6**
   */
  describe('Property 4: Latency Calculation Accuracy', () => {
    it('should calculate accurate latency between consecutive events', async () => {
      await fc.assert(
        fc.asyncProperty(tradeEventSequenceArb(), async ({ tenantId, tradeCorrelationId, events }) => {
          // Ensure events are sorted by timestamp
          const sortedEvents = [...events].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          mockRepository.listEventsByCorrelationId.mockResolvedValue(sortedEvents);

          const metrics = await TradeLifecycleService.getLatencyMetrics(tenantId, tradeCorrelationId);

          // Should have n-1 stage latencies for n events
          expect(metrics.stageLatencies.length).toBe(Math.max(0, sortedEvents.length - 1));

          // Verify each latency calculation
          for (let i = 0; i < metrics.stageLatencies.length; i++) {
            const stageLatency = metrics.stageLatencies[i];
            const fromEvent = sortedEvents[i];
            const toEvent = sortedEvents[i + 1];

            const expectedLatency = new Date(toEvent.timestamp).getTime() - new Date(fromEvent.timestamp).getTime();

            expect(stageLatency.fromEvent).toBe(fromEvent.eventType);
            expect(stageLatency.toEvent).toBe(toEvent.eventType);
            expect(stageLatency.latencyMs).toBe(expectedLatency);
          }

          // Total latency should be sum of all stage latencies
          const expectedTotal = metrics.stageLatencies.reduce((sum, s) => sum + s.latencyMs, 0);
          expect(metrics.totalLatencyMs).toBe(expectedTotal);

          // Average should be total / count (or 0 if no stages)
          if (metrics.stageLatencies.length > 0) {
            expect(metrics.averageLatencyMs).toBe(expectedTotal / metrics.stageLatencies.length);
          } else {
            expect(metrics.averageLatencyMs).toBe(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
