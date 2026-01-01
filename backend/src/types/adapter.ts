/**
 * AI Provider Adapter interface and related types.
 * All provider adapters must implement this interface.
 */

import { ProviderType } from './provider';
import {
  RegimeClassificationRequest,
  RegimeClassificationResponse,
  ExplanationRequest,
  ExplanationResponse,
  ParameterSuggestionRequest,
  ParameterSuggestionResponse,
} from './analysis';

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface QuotaStatus {
  requestsRemaining: number;
  tokensRemaining: number;
  resetsAt: string;
}

/**
 * Provider Adapter Interface - all AI providers must implement this.
 * Provides a normalized interface for interacting with different AI services.
 */
export interface AIProviderAdapter {
  readonly providerType: ProviderType;

  // Core analysis methods
  classifyMarketRegime(request: RegimeClassificationRequest): Promise<RegimeClassificationResponse>;
  generateExplanation(request: ExplanationRequest): Promise<ExplanationResponse>;
  suggestParameters(request: ParameterSuggestionRequest): Promise<ParameterSuggestionResponse>;

  // Health and status
  healthCheck(): Promise<HealthCheckResult>;
  getRemainingQuota(): Promise<QuotaStatus>;
}
