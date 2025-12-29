/**
 * Ensemble Service - orchestrates multi-model parallel analysis with aggregation
 * 
 * This service provides ensemble analysis capabilities where multiple AI models
 * are invoked in parallel and their results are aggregated based on fund allocation weights.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import {
  EnsembleRequest,
  EnsembleResponse,
  IndividualModelResult,
  IndividualResultStatus,
  EnsembleServiceConfig,
  EnsembleAlertHandler,
} from '../types/ensemble';
import {
  MarketRegime,
  RegimeClassificationRequest,
  RegimeClassificationResponse,
} from '../types/analysis';
import { FundAllocation, ModelAllocation } from '../types/allocation';
import { AllocationService } from './allocation';
import { AIAnalysisService, FALLBACK_REGIME_RESPONSE } from './ai-analysis';
import { ModelConfigRepository } from '../repositories/model-config';
import { generateUUID } from '../utils/uuid';

/**
 * Default configuration for ensemble service
 */
const DEFAULT_CONFIG: EnsembleServiceConfig = {
  defaultTimeoutMs: 30000,
  alertOnTotalFailure: true,
};

/**
 * Default no-op alert handler
 */
const defaultAlertHandler: EnsembleAlertHandler = {
  async alertTotalFailure(_tenantId: string, _strategyId: string, _errors: string[]): Promise<void> {
    console.error('Ensemble total failure alert:', { _tenantId, _strategyId, _errors });
  },
};

/**
 * Ensemble Service
 * 
 * Provides multi-model parallel analysis with weighted aggregation.
 */
export const EnsembleService = {
  config: { ...DEFAULT_CONFIG } as EnsembleServiceConfig,
  alertHandler: defaultAlertHandler as EnsembleAlertHandler,

  /**
   * Configure the ensemble service
   */
  configure(config: Partial<EnsembleServiceConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Set the alert handler for total failures
   */
  setAlertHandler(handler: EnsembleAlertHandler): void {
    this.alertHandler = handler;
  },


  /**
   * Analyze with ensemble - invokes all allocated models in parallel
   * 
   * This method:
   * 1. Retrieves the fund allocation for the strategy
   * 2. Invokes all allocated models in parallel using Promise.allSettled
   * 3. Applies timeout handling with Promise.race
   * 4. Aggregates results using weighted averaging
   * 5. Detects disagreement and sets consensus flag
   * 6. Returns fallback on total failure
   * 
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   * 
   * @param request - The ensemble analysis request
   * @returns The ensemble response with aggregated and individual results
   */
  async analyzeWithEnsemble(request: EnsembleRequest): Promise<EnsembleResponse> {
    const startTime = Date.now();
    const { tenantId, strategyId, analysisType, marketData, timeoutMs, additionalContext } = request;

    // Get fund allocation for the strategy
    const allocation = await AllocationService.getAllocation(tenantId, strategyId);
    if (!allocation || allocation.allocations.length === 0) {
      return this.createFallbackResponse([], startTime, 'No allocation found for strategy');
    }

    // Calculate weights from allocation
    const weights = AllocationService.calculateWeights(allocation.allocations);

    // Invoke all models in parallel with timeout
    const individualResults = await this.invokeModelsInParallel(
      tenantId,
      allocation.allocations,
      weights,
      marketData,
      additionalContext,
      timeoutMs
    );

    // Check for total failure
    const successfulResults = individualResults.filter(r => r.status === 'SUCCESS' && r.result);
    if (successfulResults.length === 0) {
      // Trigger alert on total failure
      if (this.config.alertOnTotalFailure) {
        const errors = individualResults.map(r => r.errorMessage || 'Unknown error');
        await this.alertHandler.alertTotalFailure(tenantId, strategyId, errors);
      }
      return this.createFallbackResponse(individualResults, startTime, 'All models failed');
    }

    // Aggregate results based on analysis type
    if (analysisType === 'REGIME') {
      const aggregatedResult = this.aggregateRegimeResults(individualResults);
      const consensus = this.checkConsensus(individualResults);
      const consensusLevel = this.calculateConsensus(individualResults);

      return {
        aggregatedResult,
        individualResults,
        consensus,
        consensusLevel,
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // For other analysis types, return the first successful result
    // (full implementation would handle EXPLANATION and PARAMETERS types)
    const firstSuccess = successfulResults[0];
    return {
      aggregatedResult: firstSuccess.result!,
      individualResults,
      consensus: true,
      consensusLevel: 1.0,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Invoke all models in parallel with timeout handling
   * 
   * Uses Promise.allSettled to ensure all models are invoked and results collected,
   * combined with Promise.race for timeout handling.
   * 
   * Requirements: 7.1, 7.4
   */
  async invokeModelsInParallel(
    tenantId: string,
    allocations: ModelAllocation[],
    weights: Map<string, number>,
    marketData: import('../types/market-data').MarketDataSnapshot,
    additionalContext: string | undefined,
    timeoutMs: number
  ): Promise<IndividualModelResult[]> {
    // Create promises for each model invocation with individual timeout
    const modelPromises = allocations.map(async (allocation): Promise<IndividualModelResult> => {
      const { modelConfigId } = allocation;
      const weight = weights.get(modelConfigId) ?? 0;

      // Get model name from config
      let modelName = modelConfigId;
      try {
        const config = await ModelConfigRepository.getConfiguration(tenantId, modelConfigId);
        if (config) {
          modelName = config.modelName;
        }
      } catch {
        // Use modelConfigId as fallback name
      }

      // Create the analysis request
      const request: RegimeClassificationRequest = {
        tenantId,
        modelConfigId,
        marketData,
        timeframe: '1h',
        additionalContext,
      };

      // Race between model invocation and timeout
      const timeoutPromise = new Promise<IndividualModelResult>((resolve) => {
        setTimeout(() => {
          resolve({
            modelConfigId,
            modelName,
            result: null,
            status: 'TIMEOUT' as IndividualResultStatus,
            errorMessage: `Model timed out after ${timeoutMs}ms`,
            weight,
          });
        }, timeoutMs);
      });

      const invocationPromise = (async (): Promise<IndividualModelResult> => {
        try {
          const result = await AIAnalysisService.classifyMarketRegime(request);
          return {
            modelConfigId,
            modelName,
            result,
            status: 'SUCCESS' as IndividualResultStatus,
            weight,
          };
        } catch (error) {
          return {
            modelConfigId,
            modelName,
            result: null,
            status: 'ERROR' as IndividualResultStatus,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            weight,
          };
        }
      })();

      return Promise.race([invocationPromise, timeoutPromise]);
    });

    // Wait for all models to complete (or timeout)
    const results = await Promise.allSettled(modelPromises);

    // Extract results from settled promises
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      // This shouldn't happen since we handle errors in the promise, but just in case
      const allocation = allocations[index];
      return {
        modelConfigId: allocation.modelConfigId,
        modelName: allocation.modelConfigId,
        result: null,
        status: 'ERROR' as IndividualResultStatus,
        errorMessage: result.reason?.message || 'Promise rejected',
        weight: weights.get(allocation.modelConfigId) ?? 0,
      };
    });
  },


  /**
   * Aggregate regime classification results with weighted averaging
   * 
   * Calculates the weighted average confidence and determines the consensus regime
   * based on the highest weighted vote.
   * 
   * Requirements: 7.2
   * 
   * @param results - Individual model results
   * @returns Aggregated regime classification response
   */
  aggregateRegimeResults(results: IndividualModelResult[]): RegimeClassificationResponse {
    const successfulResults = results.filter(
      (r): r is IndividualModelResult & { result: RegimeClassificationResponse } =>
        r.status === 'SUCCESS' && r.result !== null
    );

    if (successfulResults.length === 0) {
      return this.createFallbackRegimeResponse();
    }

    // Calculate weighted votes for each regime
    const regimeVotes = new Map<MarketRegime, number>();
    let totalWeight = 0;
    let weightedConfidenceSum = 0;

    for (const result of successfulResults) {
      const regime = result.result.regime;
      const weight = result.weight;
      const confidence = result.result.confidence;

      // Accumulate weighted votes for regime
      const currentVote = regimeVotes.get(regime) ?? 0;
      regimeVotes.set(regime, currentVote + weight);

      // Accumulate weighted confidence
      weightedConfidenceSum += confidence * weight;
      totalWeight += weight;
    }

    // Find the regime with highest weighted vote
    let winningRegime: MarketRegime = 'UNCERTAIN';
    let maxVote = 0;
    for (const [regime, vote] of regimeVotes.entries()) {
      if (vote > maxVote) {
        maxVote = vote;
        winningRegime = regime;
      }
    }

    // Calculate weighted average confidence
    const weightedAverageConfidence = totalWeight > 0 
      ? weightedConfidenceSum / totalWeight 
      : 0;

    // Combine reasoning from all successful models
    const combinedReasoning = successfulResults
      .map(r => `[${r.modelName}]: ${r.result.reasoning}`)
      .join(' | ');

    // Combine supporting factors
    const allFactors = successfulResults.flatMap(r => r.result.supportingFactors);
    const uniqueFactors = [...new Set(allFactors)];

    return {
      regime: winningRegime,
      confidence: weightedAverageConfidence,
      reasoning: combinedReasoning,
      supportingFactors: uniqueFactors,
      modelId: 'ensemble',
      promptVersion: '1',
      processingTimeMs: 0, // Will be set by caller
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Check if there is consensus among models
   * 
   * Consensus is true when all successful models agree on the same regime.
   * 
   * Requirements: 7.3
   * 
   * @param results - Individual model results
   * @returns True if all models agree, false otherwise
   */
  checkConsensus(results: IndividualModelResult[]): boolean {
    const successfulResults = results.filter(
      (r): r is IndividualModelResult & { result: RegimeClassificationResponse } =>
        r.status === 'SUCCESS' && r.result !== null
    );

    if (successfulResults.length <= 1) {
      return true; // Single model or no models = consensus by default
    }

    const firstRegime = successfulResults[0].result.regime;
    return successfulResults.every(r => r.result.regime === firstRegime);
  },

  /**
   * Calculate consensus level (0.0 to 1.0)
   * 
   * Consensus level is the proportion of weighted votes for the winning regime.
   * 
   * Requirements: 7.3
   * 
   * @param results - Individual model results
   * @returns Consensus level between 0 and 1
   */
  calculateConsensus(results: IndividualModelResult[]): number {
    const successfulResults = results.filter(
      (r): r is IndividualModelResult & { result: RegimeClassificationResponse } =>
        r.status === 'SUCCESS' && r.result !== null
    );

    if (successfulResults.length === 0) {
      return 0;
    }

    if (successfulResults.length === 1) {
      return 1; // Single model = full consensus
    }

    // Calculate weighted votes for each regime
    const regimeVotes = new Map<MarketRegime, number>();
    let totalWeight = 0;

    for (const result of successfulResults) {
      const regime = result.result.regime;
      const weight = result.weight;

      const currentVote = regimeVotes.get(regime) ?? 0;
      regimeVotes.set(regime, currentVote + weight);
      totalWeight += weight;
    }

    // Find the maximum vote
    let maxVote = 0;
    for (const vote of regimeVotes.values()) {
      if (vote > maxVote) {
        maxVote = vote;
      }
    }

    // Consensus level is the proportion of votes for the winning regime
    return totalWeight > 0 ? maxVote / totalWeight : 0;
  },

  /**
   * Create a fallback regime response for total failure scenarios
   * 
   * Requirements: 7.5
   */
  createFallbackRegimeResponse(): RegimeClassificationResponse {
    return {
      ...FALLBACK_REGIME_RESPONSE,
      modelId: 'ensemble-fallback',
      promptVersion: '1',
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Create a fallback ensemble response
   * 
   * Requirements: 7.5
   */
  createFallbackResponse(
    individualResults: IndividualModelResult[],
    startTime: number,
    reason: string
  ): EnsembleResponse {
    const fallbackResult = this.createFallbackRegimeResponse();
    fallbackResult.reasoning = reason;

    return {
      aggregatedResult: fallbackResult,
      individualResults,
      consensus: false,
      consensusLevel: 0,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  },
};
