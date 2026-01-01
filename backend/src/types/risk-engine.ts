/**
 * Risk Engine Core Types
 * Requirements: 6.1, 6.2
 */

import { OrderRequest } from './order';
import { ExecutionReport } from './order';

export type RiskCheckType =
  | 'POSITION_LIMIT'
  | 'PORTFOLIO_LIMIT'
  | 'DRAWDOWN'
  | 'VOLATILITY'
  | 'CIRCUIT_BREAKER'
  | 'KILL_SWITCH'
  | 'EXCHANGE_LIMIT'
  | 'CAPITAL_AVAILABLE'
  | 'LEVERAGE';

export interface RiskCheckDetail {
  checkType: RiskCheckType;
  passed: boolean;
  message: string;
  currentValue?: number;
  limitValue?: number;
}

export interface RiskCheckResult {
  approved: boolean;
  orderId: string;
  checks: RiskCheckDetail[];
  rejectionReason?: string;
  processingTimeMs: number;
  timestamp: string;
}

export interface Restriction {
  restrictionId: string;
  tenantId: string;
  type: 'KILL_SWITCH' | 'CIRCUIT_BREAKER' | 'DRAWDOWN_PAUSE' | 'VOLATILITY_BLOCK';
  scope: 'TENANT' | 'STRATEGY' | 'ASSET';
  scopeId?: string;
  reason: string;
  activatedAt: string;
  expiresAt?: string;
}

export interface RiskState {
  tenantId: string;
  strategyId?: string;
  positions: Record<string, number>;
  drawdownPercent: number;
  exposurePercent: number;
  activeRestrictions: Restriction[];
  lastUpdatedAt: string;
}

export interface RiskEngine {
  // Pre-trade validation
  validateOrder(order: OrderRequest): Promise<RiskCheckResult>;

  // Post-trade updates
  processExecution(execution: ExecutionReport): Promise<void>;

  // Kill switch
  activateKillSwitch(tenantId: string, reason: string): Promise<void>;
  deactivateKillSwitch(tenantId: string, authToken: string): Promise<void>;

  // State queries
  getRiskState(tenantId: string, strategyId?: string): Promise<RiskState>;
  getActiveRestrictions(tenantId: string): Promise<Restriction[]>;
}
