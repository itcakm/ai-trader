/**
 * Ensemble Analysis types for multi-model parallel analysis with aggregation.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { MarketDataSnapshot } from './market-data';
import { RegimeClassificationResponse, ExplanationResponse } from './analysis';

/**
 * Type of analysis to perform in ensemble mode
 */
export type EnsembleAnalysisType = 'REGIME' | 'EXPLANATION' | 'PARAMETERS';

/**
 * Status of an individual model's result in the ensemble
 */
export type IndividualResultStatus = 'SUCCESS' | 'TIMEOUT' | 'ERROR';

/**
 * Request for ensemble analysis
 */
export interface EnsembleRequest {
  tenantId: string;
  strategyId: string;
  analysisType: EnsembleAnalysisType;
  marketData: MarketDataSnapshot;
  timeoutMs: number;
  additionalContext?: string;
}

/**
 * Result from an individual model in the ensemble
 */
export interface IndividualModelResult {
  modelConfigId: string;
  modelName: string;
  result: RegimeClassificationResponse | ExplanationResponse | null;
  status: IndividualResultStatus;
  errorMessage?: string;
  weight: number; // From fund allocation (0-1)
}

/**
 * Response from ensemble analysis
 */
export interface EnsembleResponse {
  aggregatedResult: RegimeClassificationResponse | ExplanationResponse;
  individualResults: IndividualModelResult[];
  consensus: boolean;
  consensusLevel: number; // 0.0 to 1.0
  processingTimeMs: number;
  timestamp: string;
}

/**
 * Configuration for ensemble service
 */
export interface EnsembleServiceConfig {
  defaultTimeoutMs: number;
  alertOnTotalFailure: boolean;
}

/**
 * Alert handler interface for ensemble failures
 */
export interface EnsembleAlertHandler {
  alertTotalFailure(tenantId: string, strategyId: string, errors: string[]): Promise<void>;
}
