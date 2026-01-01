/**
 * Position Limit Types
 * Requirements: 1.1, 1.3
 */

export type LimitType = 'ABSOLUTE' | 'PERCENTAGE';
export type LimitScope = 'ASSET' | 'STRATEGY' | 'PORTFOLIO';

export interface PositionLimit {
  limitId: string;
  tenantId: string;
  scope: LimitScope;
  assetId?: string;      // For ASSET scope
  strategyId?: string;   // For STRATEGY scope
  limitType: LimitType;
  maxValue: number;      // Absolute value or percentage (0-100)
  currentValue: number;
  utilizationPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface PositionLimitInput {
  scope: LimitScope;
  assetId?: string;
  strategyId?: string;
  limitType: LimitType;
  maxValue: number;
}

export interface LimitCheckResult {
  withinLimit: boolean;
  currentValue: number;
  maxValue: number;
  remainingCapacity: number;
  wouldExceedBy?: number;
}

export interface PositionLimitService {
  setLimit(tenantId: string, limit: PositionLimitInput): Promise<PositionLimit>;
  getLimit(tenantId: string, limitId: string): Promise<PositionLimit>;
  listLimits(tenantId: string, scope?: LimitScope): Promise<PositionLimit[]>;
  checkLimit(tenantId: string, order: unknown): Promise<LimitCheckResult>;
  updateCurrentValue(tenantId: string, limitId: string, value: number): Promise<void>;
}
