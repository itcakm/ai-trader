/**
 * AI Analysis types for market regime classification and strategy explanations.
 */

import { MarketDataSnapshot } from './market-data';

export type MarketRegime =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNCERTAIN';

// Regime Classification Types
export interface RegimeClassificationRequest {
  tenantId: string;
  modelConfigId: string;
  marketData: MarketDataSnapshot;
  timeframe: string;
  additionalContext?: string;
}

export interface RegimeClassificationResponse {
  regime: MarketRegime;
  confidence: number; // 0.0 to 1.0
  reasoning: string;
  supportingFactors: string[];
  modelId: string;
  promptVersion: string;
  processingTimeMs: number;
  timestamp: string;
}

// Strategy Explanation Types
export interface StrategyAction {
  type: 'ENTRY' | 'EXIT' | 'INCREASE' | 'DECREASE' | 'HOLD';
  symbol: string;
  quantity?: number;
  price?: number;
  reason: string;
}

export interface ExplanationRequest {
  tenantId: string;
  modelConfigId: string;
  strategyId: string;
  action: StrategyAction;
  marketContext: MarketDataSnapshot;
  strategyParameters: Record<string, unknown>;
}

export interface ExplanationFactor {
  factor: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  weight: number;
}

export interface ExplanationResponse {
  explanation: string;
  keyFactors: ExplanationFactor[];
  riskAssessment: string;
  modelId: string;
  promptVersion: string;
  processingTimeMs: number;
  timestamp: string;
}

// Parameter Suggestion Types
export interface ParameterSuggestionRequest {
  tenantId: string;
  modelConfigId: string;
  strategyId: string;
  currentParameters: Record<string, unknown>;
  marketContext: MarketDataSnapshot;
  performanceHistory?: PerformanceDataPoint[];
}

export interface PerformanceDataPoint {
  timestamp: string;
  pnl: number;
  winRate: number;
}

export interface ParameterSuggestion {
  parameterName: string;
  currentValue: unknown;
  suggestedValue: unknown;
  rationale: string;
  expectedImpact: string;
  confidence: number;
}

export interface ParameterSuggestionResponse {
  suggestions: ParameterSuggestion[];
  overallAssessment: string;
  modelId: string;
  promptVersion: string;
  processingTimeMs: number;
  timestamp: string;
}
