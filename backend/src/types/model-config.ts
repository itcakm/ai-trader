/**
 * Model Configuration types for per-tenant AI model settings.
 */

import { RateLimitConfig } from './provider';

export interface EncryptedCredentials {
  encryptedApiKey: string;
  keyId: string; // KMS key reference
}

export interface CostLimits {
  maxDailyCostUsd: number;
  maxMonthlyCostUsd: number;
  currentDailyCostUsd: number;
  currentMonthlyCostUsd: number;
  lastResetDate: string;
}

export interface ModelConfiguration {
  configId: string;
  tenantId: string;
  providerId: string;
  modelId: string;
  modelName: string;
  enabled: boolean;
  credentials: EncryptedCredentials;
  costLimits: CostLimits;
  rateLimits: RateLimitConfig;
  priority: number; // 1-10, higher = preferred
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigurationInput {
  providerId: string;
  modelId: string;
  modelName: string;
  enabled?: boolean;
  credentials: EncryptedCredentials;
  costLimits: CostLimits;
  rateLimits: RateLimitConfig;
  priority?: number;
}

export interface ValidationResult {
  valid: boolean;
  errorMessage?: string;
}
