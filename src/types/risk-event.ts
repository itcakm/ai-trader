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
