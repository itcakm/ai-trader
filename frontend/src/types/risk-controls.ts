/**
 * Risk Controls types for the frontend
 */

/**
 * Limit types
 */
export type LimitType = 'ABSOLUTE' | 'PERCENTAGE';
export type LimitScope = 'ASSET' | 'STRATEGY' | 'PORTFOLIO';

/**
 * Position limit
 */
export interface PositionLimit {
  limitId: string;
  tenantId: string;
  scope: LimitScope;
  assetId?: string;
  strategyId?: string;
  limitType: LimitType;
  maxValue: number;
  currentValue: number;
  utilizationPercent: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Kill switch types
 */
export type KillTriggerType = 'MANUAL' | 'AUTOMATIC';
export type KillSwitchScopeType = 'TENANT' | 'STRATEGY' | 'ASSET';

/**
 * Kill switch state
 */
export interface KillSwitchState {
  tenantId: string;
  active: boolean;
  activatedAt?: string;
  activatedBy?: string;
  activationReason?: string;
  triggerType: KillTriggerType;
  scope: KillSwitchScopeType;
  scopeId?: string;
  pendingOrdersCancelled: number;
}

/**
 * Kill trigger condition types
 */
export type KillTriggerCondition =
  | { type: 'RAPID_LOSS'; lossPercent: number; timeWindowMinutes: number }
  | { type: 'ERROR_RATE'; errorPercent: number; timeWindowMinutes: number }
  | { type: 'SYSTEM_ERROR'; errorTypes: string[] };

/**
 * Auto kill trigger
 */
export interface AutoKillTrigger {
  triggerId: string;
  condition: KillTriggerCondition;
  enabled: boolean;
}

/**
 * Kill switch configuration
 */
export interface KillSwitchConfig {
  configId: string;
  tenantId: string;
  autoTriggers: AutoKillTrigger[];
  requireAuthForDeactivation: boolean;
  notificationChannels: string[];
}

/**
 * Risk profile position limit config
 */
export interface PositionLimitConfig {
  scope: LimitScope;
  assetId?: string;
  limitType: LimitType;
  maxValue: number;
}

/**
 * Drawdown configuration
 */
export interface DrawdownConfig {
  configId: string;
  tenantId: string;
  maxDrawdownPercent: number;
  warningThresholdPercent: number;
  lookbackPeriodDays: number;
}

/**
 * Volatility configuration
 */
export interface VolatilityConfig {
  configId: string;
  tenantId: string;
  maxVolatilityPercent: number;
  lookbackPeriodHours: number;
  adjustmentFactor: number;
}

/**
 * Circuit breaker condition
 */
export interface CircuitBreakerCondition {
  conditionId: string;
  name: string;
  metric: string;
  threshold: number;
  operator: 'GT' | 'LT' | 'GTE' | 'LTE' | 'EQ';
  action: 'PAUSE' | 'STOP' | 'ALERT';
  enabled: boolean;
}

/**
 * Exchange safeguard config
 */
export interface ExchangeSafeguardConfig {
  maxOrderSize: number;
  minOrderSize: number;
  maxPriceDeviationPercent: number;
  rateLimitBuffer: number;
  connectionTimeoutMs: number;
  maxRetries: number;
}

/**
 * Risk profile
 */
export interface RiskProfile {
  profileId: string;
  tenantId: string;
  name: string;
  version: number;
  positionLimits: PositionLimitConfig[];
  drawdownConfig: DrawdownConfig;
  volatilityConfig: VolatilityConfig;
  circuitBreakers: CircuitBreakerCondition[];
  exchangeSafeguards: ExchangeSafeguardConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * Risk status summary
 */
export interface RiskStatusSummary {
  killSwitchActive: boolean;
  activeAlerts: number;
  positionUtilization: number;
  drawdownCurrent: number;
  drawdownMax: number;
  volatilityCurrent: number;
  volatilityMax: number;
  lastUpdated: string;
}

/**
 * Risk event
 */
export interface RiskEvent {
  eventId: string;
  type: 'LIMIT_BREACH' | 'DRAWDOWN_WARNING' | 'VOLATILITY_SPIKE' | 'CIRCUIT_BREAKER' | 'KILL_SWITCH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
  acknowledged: boolean;
}

/**
 * Limit scope badge variant mapping
 */
export const limitScopeVariant: Record<LimitScope, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  ASSET: 'info',
  STRATEGY: 'warning',
  PORTFOLIO: 'default',
};

/**
 * Risk event severity variant mapping
 */
export const riskEventSeverityVariant: Record<RiskEvent['severity'], 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'error',
  CRITICAL: 'error',
};
