/**
 * AI Intelligence types for the frontend
 */

/**
 * Encrypted credentials for AI providers
 */
export interface EncryptedCredentials {
  encryptedApiKey: string;
  keyId: string;
}

/**
 * Cost limits for AI model usage
 */
export interface CostLimits {
  maxDailyCostUsd: number;
  maxMonthlyCostUsd: number;
  currentDailyCostUsd: number;
  currentMonthlyCostUsd: number;
  lastResetDate: string;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

/**
 * Model configuration
 */
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
  priority: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Market regime types
 */
export type MarketRegime =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNCERTAIN';

/**
 * Regime classification response
 */
export interface RegimeClassification {
  regime: MarketRegime;
  confidence: number;
  reasoning: string;
  supportingFactors: string[];
  modelId: string;
  timestamp: string;
}

/**
 * Strategy action types
 */
export type StrategyActionType = 'ENTRY' | 'EXIT' | 'INCREASE' | 'DECREASE' | 'HOLD';

/**
 * Explanation factor
 */
export interface ExplanationFactor {
  factor: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  weight: number;
}

/**
 * Strategy explanation
 */
export interface StrategyExplanation {
  explanation: string;
  keyFactors: ExplanationFactor[];
  riskAssessment: string;
  modelId: string;
  timestamp: string;
}

/**
 * Parameter suggestion
 */
export interface ParameterSuggestion {
  parameterName: string;
  currentValue: unknown;
  suggestedValue: unknown;
  rationale: string;
  expectedImpact: string;
  confidence: number;
}

/**
 * Model allocation
 */
export interface ModelAllocation {
  modelConfigId: string;
  percentage: number;
  priority: number;
}

/**
 * Fund allocation
 */
export interface FundAllocation {
  allocationId: string;
  tenantId: string;
  strategyId: string;
  version: number;
  allocations: ModelAllocation[];
  ensembleMode: boolean;
  createdAt: string;
  createdBy: string;
}

/**
 * AI Provider info
 */
export interface AIProvider {
  providerId: string;
  name: string;
  models: AIModel[];
}

/**
 * AI Model info
 */
export interface AIModel {
  modelId: string;
  name: string;
  description: string;
  capabilities: string[];
  costPer1kTokens: number;
}

/**
 * Analysis result for display
 */
export interface AnalysisResult {
  id: string;
  type: 'regime' | 'explanation' | 'suggestion';
  strategyId?: string;
  strategyName?: string;
  modelName: string;
  timestamp: string;
  data: RegimeClassification | StrategyExplanation | ParameterSuggestion[];
}

/**
 * Market regime badge variant mapping
 */
export const regimeVariant: Record<MarketRegime, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  TRENDING_UP: 'success',
  TRENDING_DOWN: 'error',
  RANGING: 'default',
  HIGH_VOLATILITY: 'warning',
  LOW_VOLATILITY: 'info',
  UNCERTAIN: 'default',
};

/**
 * Impact badge variant mapping
 */
export const impactVariant: Record<'POSITIVE' | 'NEGATIVE' | 'NEUTRAL', 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  POSITIVE: 'success',
  NEGATIVE: 'error',
  NEUTRAL: 'default',
};
