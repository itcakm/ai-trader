/**
 * Circuit Breaker Types
 * Requirements: 5.1, 5.3
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type CircuitBreakerScope = 'STRATEGY' | 'ASSET' | 'PORTFOLIO';

export type CircuitBreakerCondition =
  | { type: 'LOSS_RATE'; lossPercent: number; timeWindowMinutes: number }
  | { type: 'CONSECUTIVE_FAILURES'; count: number }
  | { type: 'PRICE_DEVIATION'; deviationPercent: number; timeWindowMinutes: number }
  | { type: 'ERROR_RATE'; errorPercent: number; sampleSize: number };

export interface CircuitBreaker {
  breakerId: string;
  tenantId: string;
  name: string;
  condition: CircuitBreakerCondition;
  scope: CircuitBreakerScope;
  scopeId?: string;
  state: CircuitBreakerState;
  tripCount: number;
  lastTrippedAt?: string;
  cooldownMinutes: number;
  autoResetEnabled: boolean;
}

export interface CircuitBreakerInput {
  name: string;
  condition: CircuitBreakerCondition;
  scope: CircuitBreakerScope;
  scopeId?: string;
  cooldownMinutes: number;
  autoResetEnabled: boolean;
}

export interface CircuitBreakerCheckResult {
  allClosed: boolean;
  openBreakers: CircuitBreaker[];
  halfOpenBreakers: CircuitBreaker[];
}

export interface TradingContext {
  strategyId?: string;
  assetId?: string;
  recentLossPercent?: number;
  recentErrorRate?: number;
  priceDeviation?: number;
}

export interface TradingEvent {
  eventType: 'TRADE' | 'ERROR' | 'PRICE_UPDATE';
  strategyId?: string;
  assetId?: string;
  success: boolean;
  lossAmount?: number;
  errorMessage?: string;
  priceDeviation?: number;
  timestamp: string;
}

export interface CircuitBreakerService {
  createBreaker(tenantId: string, config: CircuitBreakerInput): Promise<CircuitBreaker>;
  getBreaker(tenantId: string, breakerId: string): Promise<CircuitBreaker>;
  listBreakers(tenantId: string): Promise<CircuitBreaker[]>;
  checkBreakers(tenantId: string, context: TradingContext): Promise<CircuitBreakerCheckResult>;
  tripBreaker(tenantId: string, breakerId: string, reason: string): Promise<CircuitBreaker>;
  resetBreaker(tenantId: string, breakerId: string, authToken?: string): Promise<CircuitBreaker>;
  recordEvent(tenantId: string, event: TradingEvent): Promise<void>;
}
