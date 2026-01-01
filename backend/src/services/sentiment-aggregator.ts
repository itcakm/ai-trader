/**
 * Sentiment Aggregator Service - aggregates sentiment data from multiple sources
 * 
 * This service handles:
 * - Weighted averaging of sentiment scores across multiple sources
 * - Combining sentiment data from different providers
 * - Ensuring weight normalization (sum to 1.0)
 * - Quality score aggregation
 * 
 * Requirements: 4.5
 */

import { SentimentData, SentimentSource, SentimentPlatform } from '../types/sentiment';
import { generateUUID } from '../utils/uuid';

/**
 * Source weight configuration
 */
export interface SourceWeightConfig {
  sourceId: string;
  weight: number;
}

/**
 * Aggregation options
 */
export interface AggregationOptions {
  /** Custom weights for each source (by sourceId). If not provided, equal weights are used */
  sourceWeights?: SourceWeightConfig[];
  /** Whether to normalize weights to sum to 1.0 (default: true) */
  normalizeWeights?: boolean;
  /** Minimum quality score threshold for including a source (default: 0) */
  minQualityScore?: number;
}

/**
 * Aggregation result
 */
export interface AggregationResult {
  success: boolean;
  data?: SentimentData;
  errors: string[];
  warnings: string[];
  /** Details about how each source contributed to the aggregation */
  sourceContributions: SourceContribution[];
}

/**
 * Details about a source's contribution to the aggregation
 */
export interface SourceContribution {
  sourceId: string;
  originalScore: number;
  weight: number;
  weightedScore: number;
  included: boolean;
  excludeReason?: string;
}

/**
 * Sentiment Aggregator Service
 */
export const SentimentAggregator = {
  /**
   * Aggregate sentiment data from multiple sources using weighted averaging
   * 
   * The overall score is calculated as the weighted average of individual source scores:
   * overallScore = Σ(score_i * weight_i) where Σ(weight_i) = 1.0
   * 
   * Requirements: 4.5
   * 
   * @param sentimentDataList - Array of sentiment data from different sources
   * @param options - Aggregation options
   * @returns Aggregation result with combined sentiment data
   */
  aggregate(
    sentimentDataList: SentimentData[],
    options: AggregationOptions = {}
  ): AggregationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sourceContributions: SourceContribution[] = [];

    // Validate input
    if (!sentimentDataList || sentimentDataList.length === 0) {
      return {
        success: false,
        errors: ['At least one sentiment data source is required'],
        warnings,
        sourceContributions
      };
    }

    // Filter by quality score if threshold is set
    const minQuality = options.minQualityScore ?? 0;
    const filteredData: SentimentData[] = [];
    
    for (const data of sentimentDataList) {
      if (data.qualityScore >= minQuality) {
        filteredData.push(data);
      } else {
        warnings.push(`Source ${data.aggregatedFrom[0]} excluded due to low quality score (${data.qualityScore} < ${minQuality})`);
      }
    }

    if (filteredData.length === 0) {
      return {
        success: false,
        errors: ['No sources met the minimum quality threshold'],
        warnings,
        sourceContributions
      };
    }

    // Verify all data is for the same symbol
    const symbols = new Set(filteredData.map(d => d.symbol));
    if (symbols.size > 1) {
      return {
        success: false,
        errors: [`Cannot aggregate sentiment for different symbols: ${Array.from(symbols).join(', ')}`],
        warnings,
        sourceContributions
      };
    }

    // Calculate weights
    const weights = this.calculateWeights(filteredData, options);
    
    // Verify weights sum to 1.0
    const weightSum = weights.reduce((sum, w) => sum + w.weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.0001) {
      if (options.normalizeWeights !== false) {
        // Normalize weights
        const normalizedWeights = this.normalizeWeights(weights);
        weights.length = 0;
        weights.push(...normalizedWeights);
      } else {
        warnings.push(`Weights sum to ${weightSum}, not 1.0`);
      }
    }

    // Calculate weighted average score
    let weightedScoreSum = 0;
    let totalMentionVolume = 0;
    let weightedChangeRate = 0;
    let weightedQualityScore = 0;
    const allSources: SentimentSource[] = [];
    const aggregatedFrom: string[] = [];

    for (let i = 0; i < filteredData.length; i++) {
      const data = filteredData[i];
      const weight = weights[i].weight;
      const weightedScore = data.overallScore * weight;

      sourceContributions.push({
        sourceId: data.aggregatedFrom[0] || `source-${i}`,
        originalScore: data.overallScore,
        weight,
        weightedScore,
        included: true
      });

      weightedScoreSum += weightedScore;
      totalMentionVolume += data.mentionVolume;
      weightedChangeRate += data.changeRate24h * weight;
      weightedQualityScore += data.qualityScore * weight;

      // Merge sources
      for (const source of data.sources) {
        allSources.push({
          ...source,
          weight: source.weight * weight // Adjust source weight by overall weight
        });
      }

      // Track all source IDs
      aggregatedFrom.push(...data.aggregatedFrom);
    }

    // Add excluded sources to contributions
    for (const data of sentimentDataList) {
      if (!filteredData.includes(data)) {
        sourceContributions.push({
          sourceId: data.aggregatedFrom[0] || 'unknown',
          originalScore: data.overallScore,
          weight: 0,
          weightedScore: 0,
          included: false,
          excludeReason: `Quality score ${data.qualityScore} below threshold ${minQuality}`
        });
      }
    }

    // Consolidate sources by platform
    const consolidatedSources = this.consolidateSources(allSources);

    // Get the most recent timestamp
    const latestTimestamp = filteredData
      .map(d => new Date(d.timestamp).getTime())
      .reduce((max, t) => Math.max(max, t), 0);

    const aggregatedData: SentimentData = {
      sentimentId: generateUUID(),
      symbol: filteredData[0].symbol,
      timestamp: new Date(latestTimestamp).toISOString(),
      overallScore: Math.max(-1, Math.min(1, weightedScoreSum)),
      mentionVolume: totalMentionVolume,
      changeRate24h: weightedChangeRate,
      sources: consolidatedSources,
      aggregatedFrom: [...new Set(aggregatedFrom)], // Deduplicate
      qualityScore: Math.max(0, Math.min(1, weightedQualityScore))
    };

    return {
      success: true,
      data: aggregatedData,
      errors,
      warnings,
      sourceContributions
    };
  },

  /**
   * Calculate weights for each source
   * 
   * If custom weights are provided, use them. Otherwise, use equal weights.
   * 
   * @param data - Filtered sentiment data
   * @param options - Aggregation options
   * @returns Array of source weights
   */
  calculateWeights(
    data: SentimentData[],
    options: AggregationOptions
  ): SourceWeightConfig[] {
    if (options.sourceWeights && options.sourceWeights.length > 0) {
      // Use custom weights, matching by sourceId
      const weightMap = new Map(
        options.sourceWeights.map(w => [w.sourceId, w.weight])
      );

      return data.map(d => {
        const sourceId = d.aggregatedFrom[0] || '';
        const weight = weightMap.get(sourceId) ?? (1 / data.length);
        return { sourceId, weight };
      });
    }

    // Equal weights
    const equalWeight = 1 / data.length;
    return data.map(d => ({
      sourceId: d.aggregatedFrom[0] || '',
      weight: equalWeight
    }));
  },

  /**
   * Normalize weights to sum to 1.0
   * 
   * Requirements: 4.5 (sum of weights SHALL equal 1.0)
   * 
   * @param weights - Array of source weights
   * @returns Normalized weights that sum to 1.0
   */
  normalizeWeights(weights: SourceWeightConfig[]): SourceWeightConfig[] {
    const sum = weights.reduce((total, w) => total + w.weight, 0);
    
    if (sum === 0) {
      // If all weights are 0, use equal weights
      const equalWeight = 1 / weights.length;
      return weights.map(w => ({ ...w, weight: equalWeight }));
    }

    return weights.map(w => ({
      ...w,
      weight: w.weight / sum
    }));
  },

  /**
   * Consolidate sources by platform, combining weights and volumes
   * 
   * @param sources - Array of sentiment sources
   * @returns Consolidated sources with combined weights
   */
  consolidateSources(sources: SentimentSource[]): SentimentSource[] {
    const platformMap = new Map<SentimentPlatform, {
      scores: number[];
      weights: number[];
      volumes: number[];
    }>();

    for (const source of sources) {
      const existing = platformMap.get(source.platform);
      if (existing) {
        existing.scores.push(source.score);
        existing.weights.push(source.weight);
        existing.volumes.push(source.volume);
      } else {
        platformMap.set(source.platform, {
          scores: [source.score],
          weights: [source.weight],
          volumes: [source.volume]
        });
      }
    }

    const consolidated: SentimentSource[] = [];
    for (const [platform, data] of platformMap) {
      // Calculate weighted average score for this platform
      const totalWeight = data.weights.reduce((sum, w) => sum + w, 0);
      const weightedScore = totalWeight > 0
        ? data.scores.reduce((sum, s, i) => sum + s * data.weights[i], 0) / totalWeight
        : data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;

      consolidated.push({
        platform,
        score: Math.max(-1, Math.min(1, weightedScore)),
        volume: data.volumes.reduce((sum, v) => sum + v, 0),
        weight: totalWeight
      });
    }

    // Normalize consolidated weights to sum to 1
    const totalWeight = consolidated.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight > 0) {
      for (const source of consolidated) {
        source.weight = source.weight / totalWeight;
      }
    }

    return consolidated;
  },

  /**
   * Validate that weights sum to 1.0 (within tolerance)
   * 
   * Requirements: 4.5
   * 
   * @param weights - Array of weights to validate
   * @param tolerance - Acceptable deviation from 1.0 (default: 0.0001)
   * @returns True if weights sum to 1.0 within tolerance
   */
  validateWeightSum(weights: number[], tolerance: number = 0.0001): boolean {
    const sum = weights.reduce((total, w) => total + w, 0);
    return Math.abs(sum - 1.0) <= tolerance;
  },

  /**
   * Calculate the weighted average of scores
   * 
   * Requirements: 4.5
   * 
   * @param scores - Array of scores
   * @param weights - Array of weights (must sum to 1.0)
   * @returns Weighted average score
   */
  calculateWeightedAverage(scores: number[], weights: number[]): number {
    if (scores.length !== weights.length) {
      throw new Error('Scores and weights arrays must have the same length');
    }

    if (scores.length === 0) {
      return 0;
    }

    let weightedSum = 0;
    for (let i = 0; i < scores.length; i++) {
      weightedSum += scores[i] * weights[i];
    }

    return weightedSum;
  }
};
