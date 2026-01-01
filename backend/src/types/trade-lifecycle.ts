/**
 * Trade Lifecycle Types
 * Requirements: 1.1, 1.2, 1.5
 */

/**
 * Trade event types in the lifecycle
 * Requirements: 1.1
 */
export type TradeEventType =
  | 'SIGNAL_GENERATED'
  | 'ORDER_CREATED'
  | 'ORDER_SUBMITTED'
  | 'ORDER_ACKNOWLEDGED'
  | 'PARTIAL_FILL'
  | 'COMPLETE_FILL'
  | 'ORDER_CANCELLED'
  | 'ORDER_REJECTED'
  | 'ORDER_EXPIRED';

/**
 * Complete order state at a lifecycle stage
 * Requirements: 1.5
 */
export interface OrderSnapshot {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  quantity: number;
  filledQuantity: number;
  price?: number;
  stopPrice?: number;
  status: string;
  exchangeOrderId?: string;
  parameters: Record<string, unknown>;
}

/**
 * Condition that triggered the event
 * Requirements: 1.2
 */
export interface TriggerCondition {
  type: string;
  description: string;
  value: unknown;
  threshold?: unknown;
}

/**
 * A single event in the trade lifecycle
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */
export interface TradeEvent {
  eventId: string;
  tenantId: string;
  tradeCorrelationId: string;
  eventType: TradeEventType;
  timestamp: string;
  orderDetails: OrderSnapshot;
  strategyId: string;
  triggerConditions: TriggerCondition[];
  latencyFromPrevious?: number;
  metadata: Record<string, unknown>;
}

/**
 * Input for creating a trade event
 */
export interface TradeEventInput {
  tenantId: string;
  tradeCorrelationId: string;
  eventType: TradeEventType;
  orderDetails: OrderSnapshot;
  strategyId: string;
  triggerConditions: TriggerCondition[];
  metadata?: Record<string, unknown>;
}

/**
 * Latency metrics between lifecycle stages
 * Requirements: 1.6
 */
export interface LatencyMetrics {
  tradeCorrelationId: string;
  totalLatencyMs: number;
  stageLatencies: StageLatency[];
  averageLatencyMs: number;
}

export interface StageLatency {
  fromEvent: TradeEventType;
  toEvent: TradeEventType;
  latencyMs: number;
}

/**
 * Trade Lifecycle Logger Service Interface
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6
 */
export interface TradeLifecycleLogger {
  logTradeEvent(event: TradeEventInput): Promise<TradeEvent>;
  getTradeLifecycle(tenantId: string, tradeCorrelationId: string): Promise<TradeEvent[]>;
  getLatencyMetrics(tenantId: string, tradeCorrelationId: string): Promise<LatencyMetrics>;
}
