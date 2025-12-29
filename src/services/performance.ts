/**
 * Performance Service - tracks AI model accuracy and metrics
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { PerformanceRepository } from '../repositories/performance';
import {
  ModelPerformance,
  PerformancePrediction,
  PerformanceMetrics,
  PerformancePeriod,
  RecordPredictionInput,
  ValidatePredictionInput,
  createEmptyMetrics
} from '../types/performance';
import { MarketRegime } from '../types/analysis';
import { generateUUID } from '../utils/uuid';

/**
 * Calculate the start of a period based on a timestamp
 */
function getPeriodStart(timestamp: string, period: PerformancePeriod): string {
  const date = new Date(timestamp);
  
  switch (period) {
    case 'DAILY':
      date.setUTCHours(0, 0, 0, 0);
      break;
    case 'WEEKLY':
      // Set to start of week (Sunday)
      const dayOfWeek = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() - dayOfWeek);
      date.setUTCHours(0, 0, 0, 0);
      break;
    case 'MONTHLY':
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      break;
  }
  
  return date.toISOString();
}

/**
 * Performance Service for tracking AI model accuracy
 */
export const PerformanceService = {
  /**
   * Record a new prediction from an AI analysis
   * 
   * Requirements: 6.1, 6.2
   * 
   * @param input - The prediction input data
   * @returns The created prediction record
   */
  async recordPrediction(input: RecordPredictionInput): Promise<PerformancePrediction> {
    const now = new Date().toISOString();
    
    const prediction: Omit<PerformancePrediction, 'predictionId'> = {
      tenantId: input.tenantId,
      modelConfigId: input.modelConfigId,
      analysisId: input.analysisId,
      predictedRegime: input.predictedRegime,
      confidence: input.confidence,
      timestamp: now,
      validated: false,
      processingTimeMs: input.processingTimeMs,
      costUsd: input.costUsd
    };

    const createdPrediction = await PerformanceRepository.createPrediction(prediction);

    // Update metrics for all periods
    await this.incrementAnalysisCount(
      input.tenantId,
      input.modelConfigId,
      now,
      input.confidence,
      input.processingTimeMs,
      input.costUsd
    );

    return createdPrediction;
  },

  /**
   * Validate a prediction against actual market movement
   * 
   * Requirements: 6.1
   * 
   * @param input - The validation input
   * @returns The updated prediction record
   */
  async validatePrediction(input: ValidatePredictionInput): Promise<PerformancePrediction> {
    const prediction = await PerformanceRepository.getPrediction(
      input.tenantId,
      input.predictionId
    );

    if (!prediction) {
      throw new Error(`Prediction not found: ${input.predictionId}`);
    }

    if (prediction.validated) {
      throw new Error(`Prediction already validated: ${input.predictionId}`);
    }

    const correct = prediction.predictedRegime === input.actualRegime;

    const updatedPrediction = await PerformanceRepository.updatePrediction(
      input.tenantId,
      input.predictionId,
      {
        validated: true,
        actualRegime: input.actualRegime,
        correct
      }
    );

    // Update accuracy metrics for all periods
    await this.updateAccuracyMetrics(
      input.tenantId,
      prediction.modelConfigId,
      prediction.timestamp,
      correct
    );

    return updatedPrediction;
  },

  /**
   * Get performance metrics for a model
   * 
   * Requirements: 6.3, 6.4
   * 
   * @param tenantId - The tenant identifier
   * @param modelConfigId - The model configuration identifier
   * @param period - The period type (DAILY, WEEKLY, MONTHLY)
   * @returns The performance metrics, or null if not found
   */
  async getPerformance(
    tenantId: string,
    modelConfigId: string,
    period: PerformancePeriod
  ): Promise<ModelPerformance | null> {
    return PerformanceRepository.getLatestPerformance(tenantId, modelConfigId, period);
  },

  /**
   * Get performance metrics for a specific period
   * 
   * @param tenantId - The tenant identifier
   * @param modelConfigId - The model configuration identifier
   * @param period - The period type
   * @param periodStart - The start of the period
   * @returns The performance metrics
   */
  async getPerformanceForPeriod(
    tenantId: string,
    modelConfigId: string,
    period: PerformancePeriod,
    periodStart: string
  ): Promise<ModelPerformance | null> {
    return PerformanceRepository.getPerformance(tenantId, modelConfigId, period, periodStart);
  },

  /**
   * Compare performance across multiple models
   * 
   * Requirements: 6.4, 6.5
   * 
   * @param tenantId - The tenant identifier
   * @param modelConfigIds - Array of model configuration IDs to compare
   * @param period - The period type for comparison
   * @returns Array of performance records for each model
   */
  async compareModels(
    tenantId: string,
    modelConfigIds: string[],
    period: PerformancePeriod
  ): Promise<ModelPerformance[]> {
    const performances: ModelPerformance[] = [];

    for (const modelConfigId of modelConfigIds) {
      const performance = await this.getPerformance(tenantId, modelConfigId, period);
      if (performance) {
        performances.push(performance);
      }
    }

    // Sort by accuracy descending
    return performances.sort((a, b) => b.metrics.regimeAccuracy - a.metrics.regimeAccuracy);
  },

  /**
   * Get performance history for a model
   * 
   * @param tenantId - The tenant identifier
   * @param modelConfigId - The model configuration identifier
   * @param period - The period type
   * @param limit - Maximum number of records to return
   * @returns Array of historical performance records
   */
  async getPerformanceHistory(
    tenantId: string,
    modelConfigId: string,
    period: PerformancePeriod,
    limit: number = 30
  ): Promise<ModelPerformance[]> {
    const result = await PerformanceRepository.listPerformance({
      tenantId,
      modelConfigId,
      period,
      limit
    });
    return result.items;
  },

  /**
   * Increment analysis count and update running metrics
   * 
   * @internal
   */
  async incrementAnalysisCount(
    tenantId: string,
    modelConfigId: string,
    timestamp: string,
    confidence: number,
    processingTimeMs?: number,
    costUsd?: number
  ): Promise<void> {
    const periods: PerformancePeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

    for (const period of periods) {
      const periodStart = getPeriodStart(timestamp, period);
      const performance = await PerformanceRepository.getOrCreatePerformance(
        tenantId,
        modelConfigId,
        period,
        periodStart
      );

      const metrics = performance.metrics;
      const newTotal = metrics.totalAnalyses + 1;

      // Update running averages
      const newAvgConfidence = 
        (metrics.averageConfidence * metrics.totalAnalyses + confidence) / newTotal;
      
      const newAvgLatency = processingTimeMs !== undefined
        ? (metrics.averageLatencyMs * metrics.totalAnalyses + processingTimeMs) / newTotal
        : metrics.averageLatencyMs;

      const newTotalCost = costUsd !== undefined
        ? metrics.totalCostUsd + costUsd
        : metrics.totalCostUsd;

      const updatedMetrics: PerformanceMetrics = {
        ...metrics,
        totalAnalyses: newTotal,
        averageConfidence: newAvgConfidence,
        averageLatencyMs: newAvgLatency,
        totalCostUsd: newTotalCost,
        costPerAnalysis: newTotalCost / newTotal
      };

      await PerformanceRepository.upsertPerformance({
        ...performance,
        metrics: updatedMetrics,
        updatedAt: new Date().toISOString()
      });
    }
  },

  /**
   * Update accuracy metrics after validation
   * 
   * @internal
   */
  async updateAccuracyMetrics(
    tenantId: string,
    modelConfigId: string,
    timestamp: string,
    correct: boolean
  ): Promise<void> {
    const periods: PerformancePeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

    for (const period of periods) {
      const periodStart = getPeriodStart(timestamp, period);
      const performance = await PerformanceRepository.getPerformance(
        tenantId,
        modelConfigId,
        period,
        periodStart
      );

      if (!performance) {
        // Performance record should exist from recordPrediction
        continue;
      }

      // Get all validated predictions for this period to recalculate accuracy
      const predictions = await PerformanceRepository.listPredictions({
        tenantId,
        modelConfigId,
        validated: true,
        startDate: periodStart
      });

      const validatedPredictions = predictions.items;
      const correctCount = validatedPredictions.filter(p => p.correct).length;
      const totalValidated = validatedPredictions.length;

      const newAccuracy = totalValidated > 0 ? correctCount / totalValidated : 0;

      const updatedMetrics: PerformanceMetrics = {
        ...performance.metrics,
        regimeAccuracy: newAccuracy
      };

      await PerformanceRepository.upsertPerformance({
        ...performance,
        metrics: updatedMetrics,
        updatedAt: new Date().toISOString()
      });
    }
  },

  /**
   * Record a validation failure (schema validation failed)
   * 
   * @param tenantId - The tenant identifier
   * @param modelConfigId - The model configuration identifier
   */
  async recordValidationFailure(
    tenantId: string,
    modelConfigId: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const periods: PerformancePeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

    for (const period of periods) {
      const periodStart = getPeriodStart(now, period);
      const performance = await PerformanceRepository.getOrCreatePerformance(
        tenantId,
        modelConfigId,
        period,
        periodStart
      );

      const metrics = performance.metrics;
      const totalAttempts = metrics.totalAnalyses + 1;
      
      // Calculate new validation failure rate
      // Assuming we track failures separately, we increment error count
      const currentFailures = metrics.validationFailureRate * metrics.totalAnalyses;
      const newFailureRate = (currentFailures + 1) / totalAttempts;

      const updatedMetrics: PerformanceMetrics = {
        ...metrics,
        validationFailureRate: newFailureRate
      };

      await PerformanceRepository.upsertPerformance({
        ...performance,
        metrics: updatedMetrics,
        updatedAt: new Date().toISOString()
      });
    }
  },

  /**
   * Record an error (API error, timeout, etc.)
   * 
   * @param tenantId - The tenant identifier
   * @param modelConfigId - The model configuration identifier
   */
  async recordError(
    tenantId: string,
    modelConfigId: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const periods: PerformancePeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

    for (const period of periods) {
      const periodStart = getPeriodStart(now, period);
      const performance = await PerformanceRepository.getOrCreatePerformance(
        tenantId,
        modelConfigId,
        period,
        periodStart
      );

      const metrics = performance.metrics;
      const totalAttempts = metrics.totalAnalyses + 1;
      
      // Calculate new error rate
      const currentErrors = metrics.errorRate * metrics.totalAnalyses;
      const newErrorRate = (currentErrors + 1) / totalAttempts;

      const updatedMetrics: PerformanceMetrics = {
        ...metrics,
        errorRate: newErrorRate
      };

      await PerformanceRepository.upsertPerformance({
        ...performance,
        metrics: updatedMetrics,
        updatedAt: new Date().toISOString()
      });
    }
  },

  /**
   * Get unvalidated predictions for a model
   * 
   * @param tenantId - The tenant identifier
   * @param modelConfigId - The model configuration identifier
   * @param limit - Maximum number of predictions to return
   * @returns Array of unvalidated predictions
   */
  async getUnvalidatedPredictions(
    tenantId: string,
    modelConfigId: string,
    limit: number = 100
  ): Promise<PerformancePrediction[]> {
    return PerformanceRepository.getUnvalidatedPredictions(tenantId, modelConfigId, limit);
  }
};

// Export helper function for testing
export { getPeriodStart };
