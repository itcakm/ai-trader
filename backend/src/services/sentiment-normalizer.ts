/**
 * Sentiment Normalizer Service - normalizes sentiment data to standard format
 * 
 * This service handles:
 * - Score normalization to -1 to +1 scale
 * - Tracking sentiment metrics (overall score, volume, change rate)
 * - Associating sentiment with symbols and timestamps
 * - Quality score calculation
 * 
 * Requirements: 4.2, 4.3, 4.4
 */

import { SentimentData, SentimentSource, SentimentPlatform } from '../types/sentiment';
import { generateUUID } from '../utils/uuid';

/**
 * Raw sentiment input from various providers
 */
export interface RawSentimentInput {
  symbol: string;
  timestamp?: string;
  score: number;
  scoreMin?: number;
  scoreMax?: number;
  mentionVolume?: number;
  changeRate24h?: number;
  sources?: RawSourceInput[];
  sourceId: string;
}

/**
 * Raw source input
 */
export interface RawSourceInput {
  platform: string;
  score: number;
  volume?: number;
  weight?: number;
}

/**
 * Normalization result with validation status
 */
export interface NormalizationResult {
  success: boolean;
  data?: SentimentData;
  errors: string[];
  warnings: string[];
}

/**
 * Score scale configuration
 */
export interface ScoreScale {
  min: number;
  max: number;
  name: string;
}

/**
 * Common score scales from different providers
 */
export const SCORE_SCALES: Record<string, ScoreScale> = {
  NORMALIZED: { min: -1, max: 1, name: 'Normalized (-1 to +1)' },
  PERCENTAGE: { min: 0, max: 100, name: 'Percentage (0-100)' },
  ZERO_TO_ONE: { min: 0, max: 1, name: 'Zero to One (0-1)' },
  LUNARCRUSH: { min: 0, max: 100, name: 'LunarCrush (0-100)' },
  SANTIMENT: { min: -1, max: 1, name: 'Santiment (-1 to +1)' }
};

/**
 * Sentiment Normalizer Service
 */
export const SentimentNormalizer = {
  /**
   * Normalize raw sentiment input to standard SentimentData format
   * 
   * Converts scores from various scales to the standard -1 to +1 range.
   * Validates all required fields and calculates quality score.
   * 
   * Requirements: 4.2, 4.3
   * 
   * @param input - Raw sentiment input from a provider
   * @returns Normalization result with data or errors
   */
  normalize(input: RawSentimentInput): NormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!input.symbol || input.symbol.trim().length === 0) {
      errors.push('Symbol is required');
    }
    if (input.score === undefined || input.score === null || isNaN(input.score)) {
      errors.push('Score is required and must be a valid number');
    }
    if (!input.sourceId || input.sourceId.trim().length === 0) {
      errors.push('Source ID is required');
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings };
    }

    // Normalize the score to -1 to +1 scale
    const normalizedScore = this.normalizeScore(
      input.score,
      input.scoreMin,
      input.scoreMax
    );

    // Validate normalized score is within bounds
    if (normalizedScore < -1 || normalizedScore > 1) {
      warnings.push(`Score ${input.score} normalized to ${normalizedScore}, clamped to [-1, 1]`);
    }

    // Normalize sources
    const sources = this.normalizeSources(input.sources || []);

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(input, sources);

    const sentimentData: SentimentData = {
      sentimentId: generateUUID(),
      symbol: input.symbol.toUpperCase().trim(),
      timestamp: input.timestamp || new Date().toISOString(),
      overallScore: Math.max(-1, Math.min(1, normalizedScore)),
      mentionVolume: input.mentionVolume ?? 0,
      changeRate24h: input.changeRate24h ?? 0,
      sources,
      aggregatedFrom: [input.sourceId],
      qualityScore
    };

    return { success: true, data: sentimentData, errors, warnings };
  },

  /**
   * Normalize a score to the -1 to +1 scale
   * 
   * Handles different scoring systems:
   * - 0-100 scale (percentage)
   * - 0-1 scale
   * - -1 to +1 scale (already normalized)
   * - Custom min/max scales
   * 
   * Requirements: 4.2
   * 
   * @param score - The raw score value
   * @param min - Minimum value of the source scale
   * @param max - Maximum value of the source scale
   * @returns Normalized score between -1 and +1
   */
  normalizeScore(score: number, min?: number, max?: number): number {
    // If explicit min/max provided, use them
    if (min !== undefined && max !== undefined) {
      return this.scaleToNormalized(score, min, max);
    }

    // Auto-detect scale based on score characteristics
    return this.autoDetectAndNormalize(score);
  },

  /**
   * Auto-detect the score scale and normalize
   */
  autoDetectAndNormalize(score: number): number {
    // Already in -1 to +1 range
    if (score >= -1 && score <= 1) {
      // Could be 0-1 scale or -1 to +1 scale
      // If score is negative, it's definitely -1 to +1
      if (score < 0) {
        return score;
      }
      // If score is between 0 and 1, assume it's 0-1 scale
      // Convert to -1 to +1
      return (score * 2) - 1;
    }

    // 0-100 percentage scale
    if (score >= 0 && score <= 100) {
      return ((score / 100) * 2) - 1;
    }

    // Score outside expected ranges - clamp to -1 to +1
    return Math.max(-1, Math.min(1, score));
  },

  /**
   * Scale a value from a custom range to -1 to +1
   */
  scaleToNormalized(value: number, min: number, max: number): number {
    if (max === min) {
      return 0;
    }
    // Linear transformation: (value - min) / (max - min) gives 0-1
    // Then (0-1) * 2 - 1 gives -1 to +1
    const normalized = ((value - min) / (max - min)) * 2 - 1;
    return Math.max(-1, Math.min(1, normalized));
  },

  /**
   * Normalize platform string to valid SentimentPlatform enum
   */
  normalizePlatform(platform: string): SentimentPlatform {
    const normalized = platform.toUpperCase().trim();

    const platformMap: Record<string, SentimentPlatform> = {
      'TWITTER': 'TWITTER',
      'X': 'TWITTER',
      'REDDIT': 'REDDIT',
      'TELEGRAM': 'TELEGRAM',
      'DISCORD': 'DISCORD',
      'NEWS': 'NEWS',
      'ARTICLES': 'NEWS',
      'MEDIA': 'NEWS'
    };

    return platformMap[normalized] || 'NEWS';
  },

  /**
   * Normalize raw source inputs to standard SentimentSource format
   */
  normalizeSources(rawSources: RawSourceInput[]): SentimentSource[] {
    if (rawSources.length === 0) {
      return [];
    }

    // Calculate default weight if not provided
    const defaultWeight = 1 / rawSources.length;

    return rawSources.map(source => ({
      platform: this.normalizePlatform(source.platform),
      score: this.normalizeScore(source.score),
      volume: source.volume ?? 0,
      weight: source.weight ?? defaultWeight
    }));
  },

  /**
   * Calculate quality score for sentiment data
   * 
   * Quality is based on:
   * - Data completeness (required fields present)
   * - Score validity (within expected range)
   * - Source diversity (multiple platforms)
   * - Volume presence (has mention volume)
   * 
   * Requirements: 4.4
   * 
   * @param input - Raw sentiment input
   * @param sources - Normalized sources
   * @returns Quality score between 0 and 1
   */
  calculateQualityScore(input: RawSentimentInput, sources: SentimentSource[]): number {
    let score = 1.0;

    // Check required fields completeness
    if (!input.symbol || input.symbol.trim().length === 0) {
      score -= 0.3;
    }
    if (input.score === undefined || isNaN(input.score)) {
      score -= 0.3;
    }
    if (!input.timestamp) {
      score -= 0.05;
    }

    // Check score validity
    const normalizedScore = this.normalizeScore(input.score, input.scoreMin, input.scoreMax);
    if (isNaN(normalizedScore)) {
      score -= 0.2;
    }

    // Check source diversity
    if (sources.length === 0) {
      score -= 0.1;
    } else if (sources.length === 1) {
      score -= 0.05;
    }

    // Check volume presence
    if (!input.mentionVolume || input.mentionVolume === 0) {
      score -= 0.1;
    }

    // Check change rate presence
    if (input.changeRate24h === undefined) {
      score -= 0.05;
    }

    return Math.max(0, Math.min(1, score));
  },

  /**
   * Validate that sentiment data has all required fields and valid values
   * 
   * Requirements: 4.2, 4.3, 4.4
   * 
   * @param data - Sentiment data to validate
   * @returns Validation result with any errors
   */
  validate(data: SentimentData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required string fields
    if (!data.sentimentId || data.sentimentId.trim().length === 0) {
      errors.push('sentimentId is required');
    }
    if (!data.symbol || data.symbol.trim().length === 0) {
      errors.push('symbol is required');
    }
    if (!data.timestamp || data.timestamp.trim().length === 0) {
      errors.push('timestamp is required');
    }

    // Check overallScore bounds
    if (typeof data.overallScore !== 'number' || isNaN(data.overallScore)) {
      errors.push('overallScore must be a valid number');
    } else if (data.overallScore < -1 || data.overallScore > 1) {
      errors.push('overallScore must be between -1 and 1');
    }

    // Check mentionVolume
    if (typeof data.mentionVolume !== 'number' || isNaN(data.mentionVolume)) {
      errors.push('mentionVolume must be a valid number');
    }

    // Check changeRate24h
    if (typeof data.changeRate24h !== 'number' || isNaN(data.changeRate24h)) {
      errors.push('changeRate24h must be a valid number');
    }

    // Check sources array
    if (!Array.isArray(data.sources)) {
      errors.push('sources must be an array');
    }

    // Check aggregatedFrom array
    if (!Array.isArray(data.aggregatedFrom) || data.aggregatedFrom.length === 0) {
      errors.push('aggregatedFrom must be a non-empty array');
    }

    // Check qualityScore bounds
    if (typeof data.qualityScore !== 'number' || isNaN(data.qualityScore)) {
      errors.push('qualityScore must be a valid number');
    } else if (data.qualityScore < 0 || data.qualityScore > 1) {
      errors.push('qualityScore must be between 0 and 1');
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Batch normalize multiple sentiment inputs
   * 
   * @param inputs - Array of raw sentiment inputs
   * @returns Array of normalization results
   */
  batchNormalize(inputs: RawSentimentInput[]): NormalizationResult[] {
    return inputs.map(input => this.normalize(input));
  },

  /**
   * Detect the likely scale of a score based on its value
   * 
   * @param score - The score to analyze
   * @returns The detected scale configuration
   */
  detectScale(score: number): ScoreScale {
    if (score < 0) {
      return SCORE_SCALES.NORMALIZED;
    }
    if (score > 1 && score <= 100) {
      return SCORE_SCALES.PERCENTAGE;
    }
    if (score >= 0 && score <= 1) {
      return SCORE_SCALES.ZERO_TO_ONE;
    }
    return SCORE_SCALES.NORMALIZED;
  }
};
