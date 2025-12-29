/**
 * Performance tracking types for AI model accuracy and metrics.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { MarketRegime } from './analysis';

/**
 * Period type for performance aggregation
 */
export type PerformancePeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';

/**
 * Aggregated performance metrics for a model over a time period
 */
export interface PerformanceMetrics {
  totalAnalyses: number;
  regimeAccuracy: number;      // 0.0 to 1.0
  averageConfidence: number;   // 0.0 to 1.0
  averageLatencyMs: number;
  totalCostUsd: number;
  costPerAnalysis: number;
  errorRate: number;           // 0.0 to 1.0
  validationFailureRate: number;
}

/**
 * Model performance record for a specific period
 */
export interface ModelPerformance {
  performanceId: string;
  tenantId: string;
  modelConfigId: string;
  period: PerformancePeriod;
  periodStart: string;
  metrics: PerformanceMetrics;
  updatedAt: string;
}

/**
 * A prediction record for tracking regime classification accuracy
 */
export interface PerformancePrediction {
  predictionId: string;
  tenantId: string;
  modelConfigId: string;
  analysisId: string;
  predictedRegime: MarketRegime;
  confidence: number;
  timestamp: string;
  validated: boolean;
  actualRegime?: MarketRegime;
  correct?: boolean;
  processingTimeMs?: number;
  costUsd?: number;
}

/**
 * Input for recording a new prediction
 */
export interface RecordPredictionInput {
  tenantId: string;
  modelConfigId: string;
  analysisId: string;
  predictedRegime: MarketRegime;
  confidence: number;
  processingTimeMs?: number;
  costUsd?: number;
}

/**
 * Input for validating a prediction against actual market movement
 */
export interface ValidatePredictionInput {
  tenantId: string;
  predictionId: string;
  actualRegime: MarketRegime;
}

/**
 * Default empty metrics for initialization
 */
export function createEmptyMetrics(): PerformanceMetrics {
  return {
    totalAnalyses: 0,
    regimeAccuracy: 0,
    averageConfidence: 0,
    averageLatencyMs: 0,
    totalCostUsd: 0,
    costPerAnalysis: 0,
    errorRate: 0,
    validationFailureRate: 0
  };
}
