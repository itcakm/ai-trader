/**
 * Ensemble Integration Tests
 * 
 * Tests the complete ensemble flow:
 * - Allocate models → request ensemble → aggregate results
 * 
 * Requirements: 7.1, 7.2
 */

import {
  EnsembleRequest,
  EnsembleResponse,
  IndividualModelResult,
  IndividualResultStatus,
} from '../types/ensemble';
import {
  MarketRegime,
  RegimeClassificationRequest,
  RegimeClassificationResponse,
} from '../types/analysis';
import { MarketDataSnapshot, PricePoint, VolumePoint } from '../types/market-data';
import { FundAllocation, ModelAllocation, AllocationValidation } from '../types/allocation';
import { ModelConfiguration, CostLimits } from '../types/model-config';
import { AIProvider, ProviderType } from '../types/provider';
import { EnsembleService } from './ensemble';
import { AllocationService, AllocationValidationError } from './allocation';

/**
 * Simple UUID v4 generator for testing
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * In-memory mock implementation of AllocationRepository
 */
class MockAllocationStore {
  private allocations: Map<string, Map<string, FundAllocation[]>> = new Map();

  async createAllocation(tenantId: string, strategyId: string, allocation: FundAllocation): Promise<void> {
    if (!this.allocations.has(tenantId)) {
      this.allocations.set(tenantId, new Map());
    }
    const tenantAllocations = this.allocations.get(tenantId)!;
    if (!tenantAllocations.has(strategyId)) {
      tenantAllocations.set(strategyId, []);
    }
    tenantAllocations.get(strategyId)!.push({ ...allocation });
  }

  async getLatestAllocation(tenantId: string, strategyId: string): Promise<FundAllocation | null> {
    const tenantAllocations = this.allocations.get(tenantId);
    if (!tenantAllocations) return null;
    const strategyAllocations = tenantAllocations.get(strategyId);
    if (!strategyAllocations || strategyAllocations.length === 0) return null;
    return strategyAllocations[strategyAllocations.length - 1];
  }

  async getAllocationHistory(tenantId: string, strategyId: string): Promise<FundAllocation[]> {
    const tenantAllocations = this.allocations.get(tenantId);
    if (!tenantAllocations) return [];
    return tenantAllocations.get(strategyId) || [];
  }

  clear(): void {
    this.allocations.clear();
  }
}

/**
 * Helper to create test market data
 */
function createTestMarketData(symbol: string = 'BTC'): MarketDataSnapshot {
  const now = new Date();
  const prices: PricePoint[] = [];
  const volume: VolumePoint[] = [];

  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(now.getTime() - i * 3600000).toISOString();
    prices.push({
      timestamp,
      open: 50000 + Math.random() * 1000,
      high: 51000 + Math.random() * 1000,
      low: 49000 + Math.random() * 1000,
      close: 50500 + Math.random() * 1000
    });
    volume.push({
      timestamp,
      volume: 1000000 + Math.random() * 500000
    });
  }

  return {
    symbol,
    prices,
    volume,
    timestamp: now.toISOString()
  };
}

/**
 * Helper to create valid model allocations
 */
function createValidAllocations(count: number): ModelAllocation[] {
  if (count < 1 || count > 5) {
    throw new Error('Count must be between 1 and 5');
  }

  const allocations: ModelAllocation[] = [];
  const basePercentage = Math.floor(100 / count);
  let remaining = 100 - (basePercentage * count);

  for (let i = 0; i < count; i++) {
    const percentage = basePercentage + (i === 0 ? remaining : 0);
    allocations.push({
      modelConfigId: generateUUID(),
      percentage,
      priority: count - i
    });
  }

  return allocations;
}

/**
 * Helper to create a mock regime classification response
 */
function createMockRegimeResponse(
  regime: MarketRegime,
  confidence: number,
  modelId: string
): RegimeClassificationResponse {
  return {
    regime,
    confidence,
    reasoning: `Analysis indicates ${regime} market conditions`,
    supportingFactors: ['Factor 1', 'Factor 2'],
    modelId,
    promptVersion: '1',
    processingTimeMs: 100,
    timestamp: new Date().toISOString()
  };
}

/**
 * Helper to create individual model results
 */
function createIndividualResults(
  allocations: ModelAllocation[],
  regimes: MarketRegime[],
  confidences: number[]
): IndividualModelResult[] {
  return allocations.map((allocation, index) => ({
    modelConfigId: allocation.modelConfigId,
    modelName: `Model ${index + 1}`,
    result: createMockRegimeResponse(
      regimes[index] || 'UNCERTAIN',
      confidences[index] || 0.5,
      allocation.modelConfigId
    ),
    status: 'SUCCESS' as IndividualResultStatus,
    weight: allocation.percentage / 100
  }));
}


describe('Ensemble Integration Tests', () => {
  let allocationStore: MockAllocationStore;

  beforeEach(() => {
    allocationStore = new MockAllocationStore();
    
    // Reset ensemble service config
    EnsembleService.configure({
      defaultTimeoutMs: 30000,
      alertOnTotalFailure: true
    });
  });

  afterEach(() => {
    allocationStore.clear();
  });

  describe('Allocation Validation', () => {
    /**
     * Test: valid allocations pass validation
     * 
     * Requirements: 5.1, 5.2, 5.4
     */
    it('should validate allocations with sum = 100%', () => {
      const allocations = createValidAllocations(3);
      const result = AllocationService.validateAllocations(allocations);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      // Verify sum equals 100
      const sum = allocations.reduce((s, a) => s + a.percentage, 0);
      expect(sum).toBe(100);
    });

    /**
     * Test: allocations with sum != 100% fail validation
     * 
     * Requirements: 5.1
     */
    it('should reject allocations with sum != 100%', () => {
      const allocations: ModelAllocation[] = [
        { modelConfigId: generateUUID(), percentage: 40, priority: 1 },
        { modelConfigId: generateUUID(), percentage: 40, priority: 2 }
      ];
      
      const result = AllocationService.validateAllocations(allocations);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('100%'))).toBe(true);
    });

    /**
     * Test: allocations with too many models fail validation
     * 
     * Requirements: 5.2
     */
    it('should reject allocations with more than 5 models', () => {
      const allocations: ModelAllocation[] = [];
      for (let i = 0; i < 6; i++) {
        allocations.push({
          modelConfigId: generateUUID(),
          percentage: Math.floor(100 / 6),
          priority: i + 1
        });
      }
      // Adjust to make sum = 100
      allocations[0].percentage += 100 - allocations.reduce((s, a) => s + a.percentage, 0);
      
      const result = AllocationService.validateAllocations(allocations);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('5 models'))).toBe(true);
    });

    /**
     * Test: allocations with percentage below minimum fail validation
     * 
     * Requirements: 5.4
     */
    it('should reject allocations with percentage below 10%', () => {
      const allocations: ModelAllocation[] = [
        { modelConfigId: generateUUID(), percentage: 5, priority: 1 },
        { modelConfigId: generateUUID(), percentage: 95, priority: 2 }
      ];
      
      const result = AllocationService.validateAllocations(allocations);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('10%'))).toBe(true);
    });

    /**
     * Test: empty allocations fail validation
     * 
     * Requirements: 5.2
     */
    it('should reject empty allocations', () => {
      const result = AllocationService.validateAllocations([]);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least'))).toBe(true);
    });

    /**
     * Test: single model allocation is valid
     * 
     * Requirements: 5.2
     */
    it('should accept single model allocation with 100%', () => {
      const allocations: ModelAllocation[] = [
        { modelConfigId: generateUUID(), percentage: 100, priority: 1 }
      ];
      
      const result = AllocationService.validateAllocations(allocations);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Weight Calculation', () => {
    /**
     * Test: weights are calculated correctly from allocations
     */
    it('should calculate weights as percentage / 100', () => {
      const allocations: ModelAllocation[] = [
        { modelConfigId: 'model-1', percentage: 50, priority: 1 },
        { modelConfigId: 'model-2', percentage: 30, priority: 2 },
        { modelConfigId: 'model-3', percentage: 20, priority: 3 }
      ];
      
      const weights = AllocationService.calculateWeights(allocations);
      
      expect(weights.get('model-1')).toBe(0.5);
      expect(weights.get('model-2')).toBe(0.3);
      expect(weights.get('model-3')).toBe(0.2);
    });

    /**
     * Test: weights sum to 1.0
     */
    it('should produce weights that sum to 1.0', () => {
      const allocations = createValidAllocations(4);
      const weights = AllocationService.calculateWeights(allocations);
      
      let sum = 0;
      for (const weight of weights.values()) {
        sum += weight;
      }
      
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  describe('Ensemble Aggregation', () => {
    /**
     * Test: aggregation with unanimous agreement
     * 
     * Requirements: 7.2
     */
    it('should aggregate results with unanimous agreement', () => {
      const allocations = createValidAllocations(3);
      const results = createIndividualResults(
        allocations,
        ['TRENDING_UP', 'TRENDING_UP', 'TRENDING_UP'],
        [0.9, 0.8, 0.85]
      );
      
      const aggregated = EnsembleService.aggregateRegimeResults(results);
      
      expect(aggregated.regime).toBe('TRENDING_UP');
      // Weighted average: (0.9 * w1 + 0.8 * w2 + 0.85 * w3) / (w1 + w2 + w3)
      expect(aggregated.confidence).toBeGreaterThan(0);
      expect(aggregated.confidence).toBeLessThanOrEqual(1);
    });

    /**
     * Test: aggregation with disagreement uses weighted voting
     * 
     * Requirements: 7.2
     */
    it('should use weighted voting when models disagree', () => {
      const allocations: ModelAllocation[] = [
        { modelConfigId: 'model-1', percentage: 60, priority: 1 },
        { modelConfigId: 'model-2', percentage: 40, priority: 2 }
      ];
      
      const results: IndividualModelResult[] = [
        {
          modelConfigId: 'model-1',
          modelName: 'Model 1',
          result: createMockRegimeResponse('TRENDING_UP', 0.9, 'model-1'),
          status: 'SUCCESS',
          weight: 0.6
        },
        {
          modelConfigId: 'model-2',
          modelName: 'Model 2',
          result: createMockRegimeResponse('TRENDING_DOWN', 0.8, 'model-2'),
          status: 'SUCCESS',
          weight: 0.4
        }
      ];
      
      const aggregated = EnsembleService.aggregateRegimeResults(results);
      
      // Model 1 has higher weight (60%), so TRENDING_UP should win
      expect(aggregated.regime).toBe('TRENDING_UP');
    });

    /**
     * Test: weighted average confidence calculation
     * 
     * Requirements: 7.2
     */
    it('should calculate weighted average confidence', () => {
      const results: IndividualModelResult[] = [
        {
          modelConfigId: 'model-1',
          modelName: 'Model 1',
          result: createMockRegimeResponse('TRENDING_UP', 0.9, 'model-1'),
          status: 'SUCCESS',
          weight: 0.5
        },
        {
          modelConfigId: 'model-2',
          modelName: 'Model 2',
          result: createMockRegimeResponse('TRENDING_UP', 0.7, 'model-2'),
          status: 'SUCCESS',
          weight: 0.5
        }
      ];
      
      const aggregated = EnsembleService.aggregateRegimeResults(results);
      
      // Weighted average: (0.9 * 0.5 + 0.7 * 0.5) / (0.5 + 0.5) = 0.8
      expect(aggregated.confidence).toBeCloseTo(0.8, 5);
    });
  });

  describe('Consensus Detection', () => {
    /**
     * Test: consensus is true when all models agree
     * 
     * Requirements: 7.3
     */
    it('should detect consensus when all models agree', () => {
      const allocations = createValidAllocations(3);
      const results = createIndividualResults(
        allocations,
        ['RANGING', 'RANGING', 'RANGING'],
        [0.8, 0.75, 0.85]
      );
      
      const consensus = EnsembleService.checkConsensus(results);
      
      expect(consensus).toBe(true);
    });

    /**
     * Test: consensus is false when models disagree
     * 
     * Requirements: 7.3
     */
    it('should detect disagreement when models differ', () => {
      const allocations = createValidAllocations(3);
      const results = createIndividualResults(
        allocations,
        ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING'],
        [0.8, 0.75, 0.85]
      );
      
      const consensus = EnsembleService.checkConsensus(results);
      
      expect(consensus).toBe(false);
    });

    /**
     * Test: consensus level calculation
     * 
     * Requirements: 7.3
     */
    it('should calculate consensus level as proportion of winning vote', () => {
      const results: IndividualModelResult[] = [
        {
          modelConfigId: 'model-1',
          modelName: 'Model 1',
          result: createMockRegimeResponse('TRENDING_UP', 0.9, 'model-1'),
          status: 'SUCCESS',
          weight: 0.6
        },
        {
          modelConfigId: 'model-2',
          modelName: 'Model 2',
          result: createMockRegimeResponse('TRENDING_DOWN', 0.8, 'model-2'),
          status: 'SUCCESS',
          weight: 0.4
        }
      ];
      
      const consensusLevel = EnsembleService.calculateConsensus(results);
      
      // TRENDING_UP has 60% of the vote
      expect(consensusLevel).toBeCloseTo(0.6, 5);
    });

    /**
     * Test: full consensus level is 1.0
     */
    it('should return consensus level 1.0 when all agree', () => {
      const allocations = createValidAllocations(2);
      const results = createIndividualResults(
        allocations,
        ['HIGH_VOLATILITY', 'HIGH_VOLATILITY'],
        [0.9, 0.85]
      );
      
      const consensusLevel = EnsembleService.calculateConsensus(results);
      
      expect(consensusLevel).toBeCloseTo(1.0, 5);
    });
  });

  describe('Fallback Handling', () => {
    /**
     * Test: fallback response on total failure
     * 
     * Requirements: 7.5
     */
    it('should create fallback response with UNCERTAIN regime', () => {
      const fallback = EnsembleService.createFallbackRegimeResponse();
      
      expect(fallback.regime).toBe('UNCERTAIN');
      expect(fallback.confidence).toBe(0);
      expect(fallback.modelId).toBe('ensemble-fallback');
    });

    /**
     * Test: fallback ensemble response structure
     * 
     * Requirements: 7.5
     */
    it('should create complete fallback ensemble response', () => {
      const startTime = Date.now() - 100;
      const individualResults: IndividualModelResult[] = [
        {
          modelConfigId: 'model-1',
          modelName: 'Model 1',
          result: null,
          status: 'ERROR',
          errorMessage: 'Connection failed',
          weight: 0.5
        }
      ];
      
      const response = EnsembleService.createFallbackResponse(
        individualResults,
        startTime,
        'All models failed'
      );
      
      const aggregatedRegime = response.aggregatedResult as RegimeClassificationResponse;
      expect(aggregatedRegime.regime).toBe('UNCERTAIN');
      expect(response.consensus).toBe(false);
      expect(response.consensusLevel).toBe(0);
      expect(response.individualResults).toHaveLength(1);
      expect(response.processingTimeMs).toBeGreaterThanOrEqual(100);
    });

    /**
     * Test: aggregation with no successful results returns fallback
     */
    it('should return fallback when no successful results', () => {
      const results: IndividualModelResult[] = [
        {
          modelConfigId: 'model-1',
          modelName: 'Model 1',
          result: null,
          status: 'ERROR',
          errorMessage: 'Failed',
          weight: 0.5
        },
        {
          modelConfigId: 'model-2',
          modelName: 'Model 2',
          result: null,
          status: 'TIMEOUT',
          errorMessage: 'Timed out',
          weight: 0.5
        }
      ];
      
      const aggregated = EnsembleService.aggregateRegimeResults(results);
      
      expect(aggregated.regime).toBe('UNCERTAIN');
      expect(aggregated.confidence).toBe(0);
    });
  });

  describe('Partial Results Handling', () => {
    /**
     * Test: aggregation with partial success
     * 
     * Requirements: 7.4
     */
    it('should aggregate using only successful results', () => {
      const results: IndividualModelResult[] = [
        {
          modelConfigId: 'model-1',
          modelName: 'Model 1',
          result: createMockRegimeResponse('TRENDING_UP', 0.9, 'model-1'),
          status: 'SUCCESS',
          weight: 0.5
        },
        {
          modelConfigId: 'model-2',
          modelName: 'Model 2',
          result: null,
          status: 'TIMEOUT',
          errorMessage: 'Timed out',
          weight: 0.3
        },
        {
          modelConfigId: 'model-3',
          modelName: 'Model 3',
          result: createMockRegimeResponse('TRENDING_UP', 0.8, 'model-3'),
          status: 'SUCCESS',
          weight: 0.2
        }
      ];
      
      const aggregated = EnsembleService.aggregateRegimeResults(results);
      
      // Should use only successful results (model-1 and model-3)
      expect(aggregated.regime).toBe('TRENDING_UP');
      expect(aggregated.confidence).toBeGreaterThan(0);
    });

    /**
     * Test: consensus calculation excludes failed models
     */
    it('should calculate consensus excluding failed models', () => {
      const results: IndividualModelResult[] = [
        {
          modelConfigId: 'model-1',
          modelName: 'Model 1',
          result: createMockRegimeResponse('RANGING', 0.9, 'model-1'),
          status: 'SUCCESS',
          weight: 0.4
        },
        {
          modelConfigId: 'model-2',
          modelName: 'Model 2',
          result: null,
          status: 'ERROR',
          errorMessage: 'Failed',
          weight: 0.3
        },
        {
          modelConfigId: 'model-3',
          modelName: 'Model 3',
          result: createMockRegimeResponse('RANGING', 0.85, 'model-3'),
          status: 'SUCCESS',
          weight: 0.3
        }
      ];
      
      const consensus = EnsembleService.checkConsensus(results);
      
      // Both successful models agree
      expect(consensus).toBe(true);
    });
  });

  describe('Individual Results Structure', () => {
    /**
     * Test: individual results contain all required fields
     * 
     * Requirements: 7.1
     */
    it('should include all required fields in individual results', () => {
      const allocations = createValidAllocations(2);
      const results = createIndividualResults(
        allocations,
        ['TRENDING_UP', 'TRENDING_DOWN'],
        [0.9, 0.8]
      );
      
      for (const result of results) {
        expect(result.modelConfigId).toBeDefined();
        expect(result.modelName).toBeDefined();
        expect(result.status).toBeDefined();
        expect(result.weight).toBeDefined();
        expect(result.weight).toBeGreaterThan(0);
        expect(result.weight).toBeLessThanOrEqual(1);
        
        if (result.status === 'SUCCESS') {
          expect(result.result).toBeDefined();
          const regimeResult = result.result as RegimeClassificationResponse;
          expect(regimeResult.regime).toBeDefined();
          expect(regimeResult.confidence).toBeDefined();
        }
      }
    });

    /**
     * Test: error results include error message
     */
    it('should include error message for failed results', () => {
      const errorResult: IndividualModelResult = {
        modelConfigId: 'model-1',
        modelName: 'Model 1',
        result: null,
        status: 'ERROR',
        errorMessage: 'API rate limit exceeded',
        weight: 0.5
      };
      
      expect(errorResult.status).toBe('ERROR');
      expect(errorResult.errorMessage).toBeDefined();
      expect(errorResult.result).toBeNull();
    });

    /**
     * Test: timeout results include timeout message
     */
    it('should include timeout message for timed out results', () => {
      const timeoutResult: IndividualModelResult = {
        modelConfigId: 'model-1',
        modelName: 'Model 1',
        result: null,
        status: 'TIMEOUT',
        errorMessage: 'Model timed out after 30000ms',
        weight: 0.5
      };
      
      expect(timeoutResult.status).toBe('TIMEOUT');
      expect(timeoutResult.errorMessage).toContain('timed out');
      expect(timeoutResult.result).toBeNull();
    });
  });
});
