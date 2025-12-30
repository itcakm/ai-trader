/**
 * Risk Event Types
 * Requirements: 10.1, 10.3
 */

export type RiskEventType =
  | 'LIMIT_BREACH'
  | 'LIMIT_WARNING'
  | 'DRAWDOWN_WARNING'
  | 'DRAWDOWN_BREACH'
  | 'VOLATILITY_THROTTLE'
  | 'CIRCUIT_BREAKER_TRIP'
  | 'CIRCUIT_BREAKER_RESET'
  | 'KILL_SWITCH_ACTIVATED'
  | 'KILL_SWITCH_DEACTIVATED'
  | 'ORDER_REJECTED'
  | 'EXCHANGE_ERROR';

export type RiskEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

export interface RiskEvent {
  eventId: string;
  tenantId: string;
  eventType: RiskEventType;
  severity: RiskEventSeverity;
  strategyId?: string;
  assetId?: string;
  description: string;
  triggerCondition: string;
  actionTaken: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface RiskEventInput {
  tenantId: string;
  eventType: RiskEventType;
  severity: RiskEventSeverity;
  strategyId?: string;
  assetId?: string;
  description: string;
  triggerCondition: string;
  actionTaken: string;
  metadata?: Record<string, unknown>;
}

export interface RiskEventFilters {
  eventTypes?: RiskEventType[];
  severities?: RiskEventSeverity[];
  strategyId?: string;
  assetId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export interface RiskEventStats {
  totalEvents: number;
  eventsByType: Record<RiskEventType, number>;
  eventsBySeverity: Record<RiskEventSeverity, number>;
  period: string;
}

export type AlertChannelType = 'EMAIL' | 'SMS' | 'WEBHOOK' | 'SLACK';

export interface AlertChannel {
  type: AlertChannelType;
  destination: string;
  enabled: boolean;
}

export interface AlertConfig {
  channels: AlertChannel[];
  severityThreshold: RiskEventSeverity;
  eventTypes: RiskEventType[];
}

export interface RiskEventService {
  logEvent(event: RiskEventInput): Promise<RiskEvent>;
  getEvents(tenantId: string, filters: RiskEventFilters): Promise<RiskEvent[]>;
  getEventStats(tenantId: string, period: string): Promise<RiskEventStats>;
  configureAlerts(tenantId: string, config: AlertConfig): Promise<void>;
  sendAlert(event: RiskEvent): Promise<void>;
}

/**
 * Audit Extensions for Risk Events
 * Requirements: 3.2, 3.4, 3.5
 */

import { OrderSnapshot } from './trade-lifecycle';

/**
 * Details when a risk control prevents a trade
 * Requirements: 3.4
 */
export interface FailedCheck {
  checkType: string;
  currentValue: unknown;
  limitValue: unknown;
  description: string;
}

export interface RejectionDetails {
  orderId: string;
  failedChecks: FailedCheck[];
  orderSnapshot: OrderSnapshot;
}

/**
 * Record of risk parameter changes
 * Requirements: 3.5
 */
export interface ParameterChangeRecord {
  parameterName: string;
  previousValue: unknown;
  newValue: unknown;
  changedBy: string;
  changeReason?: string;
}

/**
 * Market conditions at time of risk event
 * Requirements: 3.3
 */
export interface MarketConditionSnapshot {
  timestamp: string;
  prices: Record<string, number>;
  volatility: Record<string, number>;
  volume24h: Record<string, number>;
}

/**
 * Extended risk event with audit fields
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export interface AuditedRiskEvent extends RiskEvent {
  triggeringTradeId?: string;
  triggeringMarketConditions?: MarketConditionSnapshot;
  rejectionDetails?: RejectionDetails;
  parameterChange?: ParameterChangeRecord;
}

/**
 * Input for creating an audited risk event
 */
export interface AuditedRiskEventInput extends RiskEventInput {
  triggeringTradeId?: string;
  triggeringMarketConditions?: MarketConditionSnapshot;
  rejectionDetails?: RejectionDetails;
  parameterChange?: ParameterChangeRecord;
}
