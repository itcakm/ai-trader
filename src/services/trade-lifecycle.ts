import { TradeLifecycleRepository } from '../repositories/trade-lifecycle';
import {
  TradeEvent,
  TradeEventInput,
  TradeEventType,
  LatencyMetrics,
  StageLatency,
  TradeLifecycleLogger
} from '../types/trade-lifecycle';
import { generateUUID } from '../utils/uuid';

/**
 * Trade Lifecycle Service - manages trade event logging and lifecycle tracking
 * 
 * Implements the TradeLifecycleLogger interface for logging trade events,
 * retrieving trade lifecycles, and calculating latency metrics.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6
 */
export const TradeLifecycleService: TradeLifecycleLogger = {
  /**
   * Log a trade event as an immutable record
   * 
   * Requirements: 1.1, 1.2, 1.4
   * 
   * @param input - The trade event input
   * @returns The stored trade event with generated eventId and calculated latency
   */
  async logTradeEvent(input: TradeEventInput): Promise<TradeEvent> {
    const eventId = generateUUID();
    const timestamp = new Date().toISOString();
    
    // Calculate latency from previous event if this is not the first event
    let latencyFromPrevious: number | undefined;
    
    try {
      const existingEvents = await TradeLifecycleRepository.listEventsByCorrelationId(
        input.tenantId,
        input.tradeCorrelationId
      );
      
      if (existingEvents.length > 0) {
        // Sort by timestamp to get the most recent event
        const sortedEvents = existingEvents.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const previousEvent = sortedEvents[0];
        const previousTimestamp = new Date(previousEvent.timestamp).getTime();
        const currentTimestamp = new Date(timestamp).getTime();
        latencyFromPrevious = currentTimestamp - previousTimestamp;
      }
    } catch {
      // If we can't get previous events, proceed without latency calculation
      latencyFromPrevious = undefined;
    }

    const event: TradeEvent = {
      eventId,
      tenantId: input.tenantId,
      tradeCorrelationId: input.tradeCorrelationId,
      eventType: input.eventType,
      timestamp,
      orderDetails: input.orderDetails,
      strategyId: input.strategyId,
      triggerConditions: input.triggerConditions,
      latencyFromPrevious,
      metadata: input.metadata || {}
    };

    // Store the event as an immutable record
    await TradeLifecycleRepository.putEvent(event);

    return event;
  },

  /**
   * Get all events for a trade by correlation ID
   * 
   * Requirements: 1.3
   * 
   * @param tenantId - The tenant identifier
   * @param tradeCorrelationId - The trade correlation ID
   * @returns Array of trade events sorted by timestamp
   */
  async getTradeLifecycle(tenantId: string, tradeCorrelationId: string): Promise<TradeEvent[]> {
    const events = await TradeLifecycleRepository.listEventsByCorrelationId(
      tenantId,
      tradeCorrelationId
    );
    
    // Sort by timestamp (ascending)
    return events.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  },

  /**
   * Get latency metrics between lifecycle stages
   * 
   * Requirements: 1.6
   * 
   * @param tenantId - The tenant identifier
   * @param tradeCorrelationId - The trade correlation ID
   * @returns Latency metrics for the trade lifecycle
   */
  async getLatencyMetrics(tenantId: string, tradeCorrelationId: string): Promise<LatencyMetrics> {
    const events = await this.getTradeLifecycle(tenantId, tradeCorrelationId);
    
    if (events.length === 0) {
      return {
        tradeCorrelationId,
        totalLatencyMs: 0,
        stageLatencies: [],
        averageLatencyMs: 0
      };
    }

    const stageLatencies: StageLatency[] = [];
    let totalLatencyMs = 0;

    // Calculate latency between consecutive events
    for (let i = 1; i < events.length; i++) {
      const previousEvent = events[i - 1];
      const currentEvent = events[i];
      
      const previousTimestamp = new Date(previousEvent.timestamp).getTime();
      const currentTimestamp = new Date(currentEvent.timestamp).getTime();
      const latencyMs = currentTimestamp - previousTimestamp;
      
      stageLatencies.push({
        fromEvent: previousEvent.eventType,
        toEvent: currentEvent.eventType,
        latencyMs
      });
      
      totalLatencyMs += latencyMs;
    }

    const averageLatencyMs = stageLatencies.length > 0 
      ? totalLatencyMs / stageLatencies.length 
      : 0;

    return {
      tradeCorrelationId,
      totalLatencyMs,
      stageLatencies,
      averageLatencyMs
    };
  }
};

/**
 * Helper function to validate trade event input
 * 
 * @param input - The trade event input to validate
 * @returns True if valid, throws error if invalid
 */
export function validateTradeEventInput(input: TradeEventInput): boolean {
  if (!input.tenantId || input.tenantId.trim() === '') {
    throw new Error('tenantId is required');
  }
  
  if (!input.tradeCorrelationId || input.tradeCorrelationId.trim() === '') {
    throw new Error('tradeCorrelationId is required');
  }
  
  if (!input.eventType) {
    throw new Error('eventType is required');
  }
  
  if (!input.orderDetails) {
    throw new Error('orderDetails is required');
  }
  
  if (!input.orderDetails.orderId || input.orderDetails.orderId.trim() === '') {
    throw new Error('orderDetails.orderId is required');
  }
  
  if (!input.orderDetails.symbol || input.orderDetails.symbol.trim() === '') {
    throw new Error('orderDetails.symbol is required');
  }
  
  if (!input.strategyId || input.strategyId.trim() === '') {
    throw new Error('strategyId is required');
  }
  
  if (!Array.isArray(input.triggerConditions)) {
    throw new Error('triggerConditions must be an array');
  }
  
  return true;
}

/**
 * Check if a trade event has all required fields
 * 
 * Requirements: 1.2, 1.5
 * 
 * @param event - The trade event to check
 * @returns True if all required fields are present
 */
export function hasRequiredFields(event: TradeEvent): boolean {
  // Check top-level required fields
  if (!event.eventId) return false;
  if (!event.tenantId) return false;
  if (!event.tradeCorrelationId) return false;
  if (!event.eventType) return false;
  if (!event.timestamp) return false;
  if (!event.strategyId) return false;
  if (!Array.isArray(event.triggerConditions)) return false;
  
  // Check orderDetails required fields (Requirements: 1.5)
  if (!event.orderDetails) return false;
  if (!event.orderDetails.orderId) return false;
  if (!event.orderDetails.symbol) return false;
  if (!event.orderDetails.side) return false;
  if (!event.orderDetails.orderType) return false;
  if (typeof event.orderDetails.quantity !== 'number') return false;
  if (typeof event.orderDetails.filledQuantity !== 'number') return false;
  if (!event.orderDetails.status) return false;
  if (!event.orderDetails.parameters) return false;
  
  // Check metadata exists (can be empty object)
  if (!event.metadata) return false;
  
  return true;
}

/**
 * Calculate latency between two timestamps
 * 
 * @param fromTimestamp - The earlier timestamp
 * @param toTimestamp - The later timestamp
 * @returns Latency in milliseconds
 */
export function calculateLatency(fromTimestamp: string, toTimestamp: string): number {
  const fromTime = new Date(fromTimestamp).getTime();
  const toTime = new Date(toTimestamp).getTime();
  return toTime - fromTime;
}
