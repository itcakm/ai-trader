/**
 * Volatility Types
 * Requirements: 3.1, 3.2
 */

export type VolatilityIndexType = 'ATR' | 'STD_DEV' | 'REALIZED_VOL' | 'IMPLIED_VOL';
export type VolatilityLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

export interface VolatilityState {
  stateId: string;
  assetId: string;
  currentIndex: number;
  indexType: VolatilityIndexType;
  level: VolatilityLevel;
  throttlePercent: number;    // 0 = no throttle, 100 = full stop
  allowNewEntries: boolean;
  updatedAt: string;
}

export interface VolatilityConfig {
  configId: string;
  tenantId: string;
  assetId?: string;           // null = portfolio-wide
  indexType: VolatilityIndexType;
  normalThreshold: number;
  highThreshold: number;
  extremeThreshold: number;
  highThrottlePercent: number;      // e.g., 50% reduction
  extremeThrottlePercent: number;   // e.g., 100% (no new entries)
  cooldownMinutes: number;
}

export interface ThrottleCheckResult {
  level: VolatilityLevel;
  throttlePercent: number;
  allowNewEntries: boolean;
  adjustedMaxSize?: number;
  cooldownRemainingMs?: number;
}

export interface VolatilityService {
  getVolatilityState(assetId: string): Promise<VolatilityState>;
  updateVolatilityIndex(assetId: string, indexValue: number): Promise<VolatilityState>;
  checkThrottle(tenantId: string, assetId: string): Promise<ThrottleCheckResult>;
  applyThrottle(order: unknown, throttlePercent: number): unknown;
}
