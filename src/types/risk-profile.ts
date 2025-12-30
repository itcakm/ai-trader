/**
 * Risk Profile Types
 * Requirements: 8.1
 */

import { LimitScope, LimitType } from './position-limit';
import { DrawdownConfig } from './drawdown';
import { VolatilityConfig } from './volatility';
import { CircuitBreakerCondition } from './circuit-breaker';

export interface PositionLimitConfig {
  scope: LimitScope;
  assetId?: string;
  limitType: LimitType;
  maxValue: number;
}

export interface ExchangeSafeguardConfig {
  maxOrderSize: number;
  minOrderSize: number;
  maxPriceDeviationPercent: number;
  rateLimitBuffer: number;  // % of rate limit to reserve
  connectionTimeoutMs: number;
  maxRetries: number;
}

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

export interface RiskProfileInput {
  name: string;
  positionLimits: PositionLimitConfig[];
  drawdownConfig: Omit<DrawdownConfig, 'configId' | 'tenantId'>;
  volatilityConfig: Omit<VolatilityConfig, 'configId' | 'tenantId'>;
  circuitBreakers: CircuitBreakerCondition[];
  exchangeSafeguards: ExchangeSafeguardConfig;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RiskProfileService {
  createProfile(tenantId: string, profile: RiskProfileInput): Promise<RiskProfile>;
  getProfile(tenantId: string, profileId: string): Promise<RiskProfile>;
  updateProfile(tenantId: string, profileId: string, updates: Partial<RiskProfileInput>): Promise<RiskProfile>;
  listProfiles(tenantId: string): Promise<RiskProfile[]>;
  assignToStrategy(tenantId: string, strategyId: string, profileId: string): Promise<void>;
  getProfileHistory(tenantId: string, profileId: string): Promise<RiskProfile[]>;
  validateProfile(profile: RiskProfileInput): ValidationResult;
}
