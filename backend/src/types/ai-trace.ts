/**
 * AI Trace Types
 * Requirements: 2.1, 2.2, 2.5, 2.6
 */

/**
 * AI analysis types that generate traces
 * Requirements: 2.1
 */
export type AIAnalysisType =
  | 'REGIME_CLASSIFICATION'
  | 'STRATEGY_EXPLANATION'
  | 'PARAMETER_SUGGESTION'
  | 'RISK_ASSESSMENT'
  | 'MARKET_ANALYSIS';

/**
 * Reference to market data used in analysis
 * Requirements: 2.6
 */
export interface MarketDataReference {
  symbols: string[];
  timeRange: { start: string; end: string };
  snapshotId: string;
}

/**
 * Snapshot of all inputs needed to reproduce the AI analysis
 * Requirements: 2.6
 */
export interface AIInputSnapshot {
  marketDataHash: string;
  marketDataSnapshot: MarketDataReference;
  newsContextIds?: string[];
  sentimentDataIds?: string[];
  onChainDataIds?: string[];
  strategyContext?: Record<string, unknown>;
}

/**
 * Token usage metrics for AI analysis
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Complete AI interaction trace
 * Requirements: 2.1, 2.2, 2.5, 2.6
 */
export interface AITrace {
  traceId: string;
  tenantId: string;
  correlationId?: string;
  analysisType: AIAnalysisType;
  promptTemplateId: string;
  promptVersion: number;
  renderedPrompt: string;
  inputSnapshot: AIInputSnapshot;
  rawOutput: string;
  validatedOutput: unknown;
  validationPassed: boolean;
  modelId: string;
  modelVersion: string;
  ensembleWeights?: Record<string, number>;
  processingTimeMs: number;
  tokenUsage: TokenUsage;
  costUsd: number;
  timestamp: string;
}

/**
 * Input for creating an AI trace
 */
export interface AITraceInput {
  tenantId: string;
  correlationId?: string;
  analysisType: AIAnalysisType;
  promptTemplateId: string;
  promptVersion: number;
  renderedPrompt: string;
  inputSnapshot: AIInputSnapshot;
  rawOutput: string;
  validatedOutput: unknown;
  validationPassed: boolean;
  modelId: string;
  modelVersion: string;
  ensembleWeights?: Record<string, number>;
  processingTimeMs: number;
  tokenUsage: TokenUsage;
  costUsd: number;
}

/**
 * Decision influence record
 * Requirements: 2.4
 */
export interface DecisionInfluence {
  traceId: string;
  decisionType: string;
  outputValuesUsed: Record<string, unknown>;
  influenceDescription: string;
  resultingAction: string;
}

/**
 * AI Trace Logger Service Interface
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export interface AITraceLogger {
  logAITrace(input: AITraceInput): Promise<AITrace>;
  linkToDecision(traceId: string, correlationId: string): Promise<void>;
  recordDecisionInfluence(influence: DecisionInfluence): Promise<void>;
  getReproductionInputs(traceId: string): Promise<AIInputSnapshot>;
}
