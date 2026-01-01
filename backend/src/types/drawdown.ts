/**
 * Drawdown Types
 * Requirements: 2.1, 2.4
 */

export type DrawdownStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'PAUSED';
export type ResetInterval = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL';

export interface DrawdownState {
  stateId: string;
  tenantId: string;
  strategyId?: string;
  scope: 'STRATEGY' | 'PORTFOLIO';
  peakValue: number;
  currentValue: number;
  drawdownPercent: number;
  drawdownAbsolute: number;
  warningThreshold: number;
  maxThreshold: number;
  status: DrawdownStatus;
  lastResetAt: string;
  updatedAt: string;
}

export interface DrawdownConfig {
  configId: string;
  tenantId: string;
  strategyId?: string;
  warningThresholdPercent: number;   // Default 5%
  maxThresholdPercent: number;       // Default 10%
  resetInterval: ResetInterval;
  autoResumeEnabled: boolean;
  cooldownMinutes: number;
}

export interface DrawdownCheckResult {
  status: DrawdownStatus;
  currentDrawdownPercent: number;
  distanceToWarning: number;
  distanceToMax: number;
  tradingAllowed: boolean;
}

export interface DrawdownService {
  getDrawdownState(tenantId: string, strategyId?: string): Promise<DrawdownState>;
  updateValue(tenantId: string, strategyId: string | null, newValue: number): Promise<DrawdownState>;
  resetDrawdown(tenantId: string, strategyId?: string): Promise<DrawdownState>;
  checkDrawdown(tenantId: string, strategyId?: string): Promise<DrawdownCheckResult>;
  pauseStrategy(tenantId: string, strategyId: string, reason: string): Promise<void>;
  resumeStrategy(tenantId: string, strategyId: string, authToken: string): Promise<void>;
}
