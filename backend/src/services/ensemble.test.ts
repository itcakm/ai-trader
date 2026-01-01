import * as fc from 'fast-check';
import { EnsembleService } from './ensemble';
import { AllocationService } from './allocation';
import { AIAnalysisService } from './ai-analysis';
import { ModelConfigRepository } from '../repositories/model-config';
import { FundAllocation, ModelAllocation } from '../types/allocation';
import { 
  EnsembleRequest, 
  IndividualModelResult,
  IndividualResultStatus 
} from '../types/ensemble';
import { 
  MarketRegime, 
  RegimeClassificationResponse 
} from '../types/analysis';
import { MarketDataSnapshot } from '../types/market-data';
import { validModelAllocationsArb, fundAllocationArb } from '../test/generators';

// Mock dependencies
jest.mock('./allocation');
jest.mock('./ai-analysis');
jest.mock('../repositories/model-config');

const mockAllocationService = AllocationService as jest.Mocked<typeof AllocationService>;
const mockAIAnalysisService = AIAnalysisService as jest.Mocked<typeof AIAnalysisService>;
const mockModelConfigRepo = ModelConfigRepository as jest.Mocked<typeof ModelConfigRepository>;

/**
 * Generator for MarketDataSnapshot
 */
const marketDataSnapshotArb = (): fc.Arbitrary<MarketDataSnapshot> =>
  fc.record({
    symbol: fc.constantFrom('BTC', 'ETH', 'SOL', 'ADA'),
    prices: fc.array(
      fc.record({
        timestamp: fc.date().map(d => d.toISOString()),
        open: fc.double({ min: 100, max: 100000, noNaN: true }),
        high: fc.double({ min: 100, max: 100000, noNaN: true }),
        low: fc.double({ min: 100, max: 100000, noNaN: true }),
        close: fc.double({ min: 100, max: 100000, noNaN: true }),
      }),
      { minLength: 1, maxLength: 10 }
    ),
    volume: fc.array(
      fc.record({
        timestamp: fc.date().map(d => d.toISOString()),
        volume: fc.double({ min: 0, max: 1000000000, noNaN: true }),
      }),
      { minLength: 1, maxLength: 10 }
    ),
    timestamp: fc.date().map(d => d.toISOString()),
  });

/**
 * Generator for MarketRegime
 */
const marketRegimeArb = (): fc.Arbitrary<MarketRegime> =>
  fc.constantFrom(
    'TRENDING_UP',
    'TRENDING_DOWN',
    'RANGING',
    'HIGH_VOLATILITY',
    'LOW_VOLATILITY',
    'UNCERTAIN'
  );

/**
 * Generator for RegimeClassificationResponse
 */
const regimeClassificationResponseArb = (): fc.Arbitrary<RegimeClassificationResponse> =>
  fc.record({
    regime: marketRegimeArb(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    reasoning: fc.string({ minLength: 10, maxLength: 200 }),
    supportingFactors: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    modelId: fc.uuid(),
    promptVersion: fc.stringOf(fc.constantFrom('1', '2', '3', '4', '5')),
    processingTimeMs: fc.integer({ min: 10, max: 5000 }),
    timestamp: fc.date().map(d => d.toISOString()),
  });

/**
 * Generator for EnsembleRequest
 */
const ensembleRequestArb = (): fc.Arbitrary<EnsembleRequest> =>
  fc.record({
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    analysisType: fc.constant('REGIME' as const),
    marketData: marketDataSnapshotArb(),
    timeoutMs: fc.integer({ min: 1000, max: 60000 }),
    additionalContext: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
  });


describe('EnsembleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset service config
    EnsembleService.configure({
      defaultTimeoutMs: 30000,
      alertOnTotalFailure: true,
    });
  });

  /**
   * Property 12: Ensemble Parallel Execution
   * 
   * For any EnsembleRequest with N allocated models, the system SHALL invoke all N models,
   * AND the EnsembleResponse SHALL contain exactly N IndividualModelResults
   * (with status SUCCESS, TIMEOUT, or ERROR for each).
   * 
   * **Feature: ai-assisted-intelligence, Property 12: Ensemble Parallel Execution**
   * **Validates: Requirements 7.1**
   */
  describe('Property 12: Ensemble Parallel Execution', () => {
    it('should invoke all N allocated models and return exactly N individual results', async () => {
      await fc.assert(
        fc.asyncProperty(
          ensembleRequestArb(),
          validModelAllocationsArb(),
          regimeClassificationResponseArb(),
          async (request, allocations, mockResponse) => {
            const N = allocations.length;
            
            // Setup mock allocation
            const mockAllocation: FundAllocation = {
              allocationId: 'test-allocation',
              tenantId: request.tenantId,
              strategyId: request.strategyId,
              version: 1,
              allocations,
              ensembleMode: true,
              createdAt: new Date().toISOString(),
              createdBy: 'test-user',
            };
            
            mockAllocationService.getAllocation.mockResolvedValue(mockAllocation);
            mockAllocationService.calculateWeights.mockImplementation((allocs) => {
              const weights = new Map<string, number>();
              for (const alloc of allocs) {
                weights.set(alloc.modelConfigId, alloc.percentage / 100);
              }
              return weights;
            });
            
            // Mock model config repository
            mockModelConfigRepo.getConfiguration.mockResolvedValue({
              configId: 'test-config',
              tenantId: request.tenantId,
              providerId: 'test-provider',
              modelId: 'test-model',
              modelName: 'Test Model',
              enabled: true,
              credentials: { encryptedApiKey: 'key', keyId: 'key-id' },
              costLimits: {
                maxDailyCostUsd: 100,
                maxMonthlyCostUsd: 1000,
                currentDailyCostUsd: 0,
                currentMonthlyCostUsd: 0,
                lastResetDate: new Date().toISOString(),
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // Mock AI analysis service to return success for all models
            mockAIAnalysisService.classifyMarketRegime.mockResolvedValue(mockResponse);
            
            const result = await EnsembleService.analyzeWithEnsemble(request);
            
            // Verify exactly N individual results
            expect(result.individualResults).toHaveLength(N);
            
            // Verify each result has a valid status
            for (const individualResult of result.individualResults) {
              expect(['SUCCESS', 'TIMEOUT', 'ERROR']).toContain(individualResult.status);
            }
            
            // Verify all model config IDs from allocation are represented
            const resultModelIds = new Set(result.individualResults.map(r => r.modelConfigId));
            const allocationModelIds = new Set(allocations.map(a => a.modelConfigId));
            expect(resultModelIds).toEqual(allocationModelIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return results for all models even when some fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          ensembleRequestArb(),
          validModelAllocationsArb(),
          regimeClassificationResponseArb(),
          fc.integer({ min: 0, max: 4 }), // Number of models to fail
          async (request, allocations, mockResponse, failCount) => {
            const N = allocations.length;
            const actualFailCount = Math.min(failCount, N - 1); // Keep at least one success
            
            const mockAllocation: FundAllocation = {
              allocationId: 'test-allocation',
              tenantId: request.tenantId,
              strategyId: request.strategyId,
              version: 1,
              allocations,
              ensembleMode: true,
              createdAt: new Date().toISOString(),
              createdBy: 'test-user',
            };
            
            mockAllocationService.getAllocation.mockResolvedValue(mockAllocation);
            mockAllocationService.calculateWeights.mockImplementation((allocs) => {
              const weights = new Map<string, number>();
              for (const alloc of allocs) {
                weights.set(alloc.modelConfigId, alloc.percentage / 100);
              }
              return weights;
            });
            
            mockModelConfigRepo.getConfiguration.mockResolvedValue({
              configId: 'test-config',
              tenantId: request.tenantId,
              providerId: 'test-provider',
              modelId: 'test-model',
              modelName: 'Test Model',
              enabled: true,
              credentials: { encryptedApiKey: 'key', keyId: 'key-id' },
              costLimits: {
                maxDailyCostUsd: 100,
                maxMonthlyCostUsd: 1000,
                currentDailyCostUsd: 0,
                currentMonthlyCostUsd: 0,
                lastResetDate: new Date().toISOString(),
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // Make some models fail
            let callCount = 0;
            mockAIAnalysisService.classifyMarketRegime.mockImplementation(async () => {
              callCount++;
              if (callCount <= actualFailCount) {
                throw new Error('Model failed');
              }
              return mockResponse;
            });
            
            const result = await EnsembleService.analyzeWithEnsemble(request);
            
            // Should still have exactly N results
            expect(result.individualResults).toHaveLength(N);
            
            // Each result should have a valid status
            for (const individualResult of result.individualResults) {
              expect(['SUCCESS', 'TIMEOUT', 'ERROR']).toContain(individualResult.status);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 13: Ensemble Weighted Aggregation
   * 
   * For any EnsembleResponse where multiple models return valid results,
   * the aggregatedResult confidence SHALL equal the weighted average of
   * individual confidences using Fund_Allocation percentages as weights.
   * 
   * **Feature: ai-assisted-intelligence, Property 13: Ensemble Weighted Aggregation**
   * **Validates: Requirements 7.2**
   */
  describe('Property 13: Ensemble Weighted Aggregation', () => {
    it('should calculate weighted average confidence based on allocation percentages', async () => {
      await fc.assert(
        fc.property(
          validModelAllocationsArb(),
          fc.array(
            fc.double({ min: 0, max: 1, noNaN: true }),
            { minLength: 1, maxLength: 5 }
          ),
          marketRegimeArb(),
          (allocations, confidences, regime) => {
            // Ensure we have matching number of confidences
            const actualConfidences = confidences.slice(0, allocations.length);
            while (actualConfidences.length < allocations.length) {
              actualConfidences.push(0.5);
            }
            
            // Create individual results with the given confidences
            const individualResults: IndividualModelResult[] = allocations.map((alloc, index) => ({
              modelConfigId: alloc.modelConfigId,
              modelName: `Model ${index}`,
              result: {
                regime,
                confidence: actualConfidences[index],
                reasoning: 'Test reasoning',
                supportingFactors: [],
                modelId: alloc.modelConfigId,
                promptVersion: '1',
                processingTimeMs: 100,
                timestamp: new Date().toISOString(),
              },
              status: 'SUCCESS' as IndividualResultStatus,
              weight: alloc.percentage / 100,
            }));
            
            // Calculate expected weighted average
            let expectedWeightedConfidence = 0;
            let totalWeight = 0;
            for (let i = 0; i < allocations.length; i++) {
              const weight = allocations[i].percentage / 100;
              expectedWeightedConfidence += actualConfidences[i] * weight;
              totalWeight += weight;
            }
            expectedWeightedConfidence = totalWeight > 0 
              ? expectedWeightedConfidence / totalWeight 
              : 0;
            
            // Aggregate results
            const aggregated = EnsembleService.aggregateRegimeResults(individualResults);
            
            // Verify weighted average confidence
            expect(aggregated.confidence).toBeCloseTo(expectedWeightedConfidence, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use allocation weights for regime voting', async () => {
      await fc.assert(
        fc.property(
          validModelAllocationsArb(),
          (allocations) => {
            // Create results where higher-weighted models vote for TRENDING_UP
            // and lower-weighted models vote for TRENDING_DOWN
            const sortedAllocations = [...allocations].sort((a, b) => b.percentage - a.percentage);
            
            const individualResults: IndividualModelResult[] = sortedAllocations.map((alloc, index) => ({
              modelConfigId: alloc.modelConfigId,
              modelName: `Model ${index}`,
              result: {
                regime: index === 0 ? 'TRENDING_UP' : 'TRENDING_DOWN',
                confidence: 0.8,
                reasoning: 'Test reasoning',
                supportingFactors: [],
                modelId: alloc.modelConfigId,
                promptVersion: '1',
                processingTimeMs: 100,
                timestamp: new Date().toISOString(),
              },
              status: 'SUCCESS' as IndividualResultStatus,
              weight: alloc.percentage / 100,
            }));
            
            const aggregated = EnsembleService.aggregateRegimeResults(individualResults);
            
            // The highest weighted model's regime should win if it has > 50% weight
            if (sortedAllocations[0].percentage > 50) {
              expect(aggregated.regime).toBe('TRENDING_UP');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: Ensemble Disagreement Handling
   * 
   * For any EnsembleResponse where models return different MarketRegime values,
   * the consensus field SHALL be false, AND all individual model outputs
   * SHALL be included in individualResults.
   * 
   * **Feature: ai-assisted-intelligence, Property 14: Ensemble Disagreement Handling**
   * **Validates: Requirements 7.3**
   */
  describe('Property 14: Ensemble Disagreement Handling', () => {
    it('should set consensus=false when models disagree on regime', async () => {
      await fc.assert(
        fc.property(
          validModelAllocationsArb().filter(a => a.length >= 2),
          (allocations) => {
            // Create results with different regimes
            const regimes: MarketRegime[] = [
              'TRENDING_UP',
              'TRENDING_DOWN',
              'RANGING',
              'HIGH_VOLATILITY',
              'LOW_VOLATILITY',
            ];
            
            const individualResults: IndividualModelResult[] = allocations.map((alloc, index) => ({
              modelConfigId: alloc.modelConfigId,
              modelName: `Model ${index}`,
              result: {
                regime: regimes[index % regimes.length],
                confidence: 0.8,
                reasoning: 'Test reasoning',
                supportingFactors: [],
                modelId: alloc.modelConfigId,
                promptVersion: '1',
                processingTimeMs: 100,
                timestamp: new Date().toISOString(),
              },
              status: 'SUCCESS' as IndividualResultStatus,
              weight: alloc.percentage / 100,
            }));
            
            // Check consensus
            const consensus = EnsembleService.checkConsensus(individualResults);
            
            // If models have different regimes, consensus should be false
            const uniqueRegimes = new Set(
              individualResults
                .filter(r => r.result)
                .map(r => (r.result as RegimeClassificationResponse).regime)
            );
            
            if (uniqueRegimes.size > 1) {
              expect(consensus).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should set consensus=true when all models agree on regime', async () => {
      await fc.assert(
        fc.property(
          validModelAllocationsArb(),
          marketRegimeArb(),
          (allocations, regime) => {
            // Create results with same regime
            const individualResults: IndividualModelResult[] = allocations.map((alloc, index) => ({
              modelConfigId: alloc.modelConfigId,
              modelName: `Model ${index}`,
              result: {
                regime,
                confidence: 0.8,
                reasoning: 'Test reasoning',
                supportingFactors: [],
                modelId: alloc.modelConfigId,
                promptVersion: '1',
                processingTimeMs: 100,
                timestamp: new Date().toISOString(),
              },
              status: 'SUCCESS' as IndividualResultStatus,
              weight: alloc.percentage / 100,
            }));
            
            const consensus = EnsembleService.checkConsensus(individualResults);
            
            // All models agree, so consensus should be true
            expect(consensus).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all individual results regardless of disagreement', async () => {
      await fc.assert(
        fc.asyncProperty(
          ensembleRequestArb(),
          validModelAllocationsArb().filter(a => a.length >= 2),
          async (request, allocations) => {
            const regimes: MarketRegime[] = [
              'TRENDING_UP',
              'TRENDING_DOWN',
              'RANGING',
            ];
            
            const mockAllocation: FundAllocation = {
              allocationId: 'test-allocation',
              tenantId: request.tenantId,
              strategyId: request.strategyId,
              version: 1,
              allocations,
              ensembleMode: true,
              createdAt: new Date().toISOString(),
              createdBy: 'test-user',
            };
            
            mockAllocationService.getAllocation.mockResolvedValue(mockAllocation);
            mockAllocationService.calculateWeights.mockImplementation((allocs) => {
              const weights = new Map<string, number>();
              for (const alloc of allocs) {
                weights.set(alloc.modelConfigId, alloc.percentage / 100);
              }
              return weights;
            });
            
            mockModelConfigRepo.getConfiguration.mockResolvedValue({
              configId: 'test-config',
              tenantId: request.tenantId,
              providerId: 'test-provider',
              modelId: 'test-model',
              modelName: 'Test Model',
              enabled: true,
              credentials: { encryptedApiKey: 'key', keyId: 'key-id' },
              costLimits: {
                maxDailyCostUsd: 100,
                maxMonthlyCostUsd: 1000,
                currentDailyCostUsd: 0,
                currentMonthlyCostUsd: 0,
                lastResetDate: new Date().toISOString(),
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // Return different regimes for different models
            let callIndex = 0;
            mockAIAnalysisService.classifyMarketRegime.mockImplementation(async () => ({
              regime: regimes[callIndex++ % regimes.length],
              confidence: 0.8,
              reasoning: 'Test reasoning',
              supportingFactors: [],
              modelId: 'test-model',
              promptVersion: '1',
              processingTimeMs: 100,
              timestamp: new Date().toISOString(),
            }));
            
            const result = await EnsembleService.analyzeWithEnsemble(request);
            
            // All individual results should be included
            expect(result.individualResults).toHaveLength(allocations.length);
            
            // Each allocation's model should be represented
            const resultModelIds = new Set(result.individualResults.map(r => r.modelConfigId));
            for (const alloc of allocations) {
              expect(resultModelIds.has(alloc.modelConfigId)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 15: Ensemble Timeout Handling
   * 
   * For any EnsembleRequest where some models timeout, the EnsembleResponse
   * SHALL be returned within the configured timeout, using results from
   * models that responded in time.
   * 
   * **Feature: ai-assisted-intelligence, Property 15: Ensemble Timeout Handling**
   * **Validates: Requirements 7.4**
   */
  describe('Property 15: Ensemble Timeout Handling', () => {
    it('should return partial results when some models timeout', async () => {
      await fc.assert(
        fc.asyncProperty(
          ensembleRequestArb(),
          validModelAllocationsArb().filter(a => a.length >= 2),
          async (request, allocations) => {
            // Use a short timeout for testing
            const shortTimeoutRequest = { ...request, timeoutMs: 100 };
            
            const mockAllocation: FundAllocation = {
              allocationId: 'test-allocation',
              tenantId: request.tenantId,
              strategyId: request.strategyId,
              version: 1,
              allocations,
              ensembleMode: true,
              createdAt: new Date().toISOString(),
              createdBy: 'test-user',
            };
            
            mockAllocationService.getAllocation.mockResolvedValue(mockAllocation);
            mockAllocationService.calculateWeights.mockImplementation((allocs) => {
              const weights = new Map<string, number>();
              for (const alloc of allocs) {
                weights.set(alloc.modelConfigId, alloc.percentage / 100);
              }
              return weights;
            });
            
            mockModelConfigRepo.getConfiguration.mockResolvedValue({
              configId: 'test-config',
              tenantId: request.tenantId,
              providerId: 'test-provider',
              modelId: 'test-model',
              modelName: 'Test Model',
              enabled: true,
              credentials: { encryptedApiKey: 'key', keyId: 'key-id' },
              costLimits: {
                maxDailyCostUsd: 100,
                maxMonthlyCostUsd: 1000,
                currentDailyCostUsd: 0,
                currentMonthlyCostUsd: 0,
                lastResetDate: new Date().toISOString(),
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // First model responds quickly, others timeout
            let callCount = 0;
            mockAIAnalysisService.classifyMarketRegime.mockImplementation(async () => {
              callCount++;
              if (callCount === 1) {
                // First model responds immediately
                return {
                  regime: 'TRENDING_UP' as MarketRegime,
                  confidence: 0.8,
                  reasoning: 'Test reasoning',
                  supportingFactors: [],
                  modelId: 'test-model',
                  promptVersion: '1',
                  processingTimeMs: 50,
                  timestamp: new Date().toISOString(),
                };
              }
              // Other models take too long
              await new Promise(resolve => setTimeout(resolve, 200));
              return {
                regime: 'TRENDING_DOWN' as MarketRegime,
                confidence: 0.7,
                reasoning: 'Test reasoning',
                supportingFactors: [],
                modelId: 'test-model',
                promptVersion: '1',
                processingTimeMs: 200,
                timestamp: new Date().toISOString(),
              };
            });
            
            const startTime = Date.now();
            const result = await EnsembleService.analyzeWithEnsemble(shortTimeoutRequest);
            const elapsed = Date.now() - startTime;
            
            // Should return within reasonable time (timeout + some buffer)
            expect(elapsed).toBeLessThan(shortTimeoutRequest.timeoutMs + 200);
            
            // Should have results for all models
            expect(result.individualResults).toHaveLength(allocations.length);
            
            // At least one should be SUCCESS, others may be TIMEOUT
            const successCount = result.individualResults.filter(r => r.status === 'SUCCESS').length;
            const timeoutCount = result.individualResults.filter(r => r.status === 'TIMEOUT').length;
            
            expect(successCount).toBeGreaterThanOrEqual(1);
            // Note: Due to timing, we can't guarantee exact timeout count
          }
        ),
        { numRuns: 20 } // Fewer runs due to timing-sensitive nature
      );
    });

    it('should mark timed-out models with TIMEOUT status', async () => {
      await fc.assert(
        fc.asyncProperty(
          ensembleRequestArb(),
          validModelAllocationsArb().filter(a => a.length >= 1),
          async (request, allocations) => {
            // Use very short timeout
            const shortTimeoutRequest = { ...request, timeoutMs: 10 };
            
            const mockAllocation: FundAllocation = {
              allocationId: 'test-allocation',
              tenantId: request.tenantId,
              strategyId: request.strategyId,
              version: 1,
              allocations,
              ensembleMode: true,
              createdAt: new Date().toISOString(),
              createdBy: 'test-user',
            };
            
            mockAllocationService.getAllocation.mockResolvedValue(mockAllocation);
            mockAllocationService.calculateWeights.mockImplementation((allocs) => {
              const weights = new Map<string, number>();
              for (const alloc of allocs) {
                weights.set(alloc.modelConfigId, alloc.percentage / 100);
              }
              return weights;
            });
            
            mockModelConfigRepo.getConfiguration.mockResolvedValue({
              configId: 'test-config',
              tenantId: request.tenantId,
              providerId: 'test-provider',
              modelId: 'test-model',
              modelName: 'Test Model',
              enabled: true,
              credentials: { encryptedApiKey: 'key', keyId: 'key-id' },
              costLimits: {
                maxDailyCostUsd: 100,
                maxMonthlyCostUsd: 1000,
                currentDailyCostUsd: 0,
                currentMonthlyCostUsd: 0,
                lastResetDate: new Date().toISOString(),
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // All models take too long
            mockAIAnalysisService.classifyMarketRegime.mockImplementation(async () => {
              await new Promise(resolve => setTimeout(resolve, 100));
              return {
                regime: 'TRENDING_UP' as MarketRegime,
                confidence: 0.8,
                reasoning: 'Test reasoning',
                supportingFactors: [],
                modelId: 'test-model',
                promptVersion: '1',
                processingTimeMs: 100,
                timestamp: new Date().toISOString(),
              };
            });
            
            const result = await EnsembleService.analyzeWithEnsemble(shortTimeoutRequest);
            
            // All models should have timed out
            for (const individualResult of result.individualResults) {
              expect(individualResult.status).toBe('TIMEOUT');
              expect(individualResult.result).toBeNull();
              expect(individualResult.errorMessage).toContain('timed out');
            }
          }
        ),
        { numRuns: 20 } // Fewer runs due to timing-sensitive nature
      );
    });
  });

  describe('Total Failure Fallback (Requirement 7.5)', () => {
    it('should return fallback response when all models fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          ensembleRequestArb(),
          validModelAllocationsArb(),
          async (request, allocations) => {
            const mockAllocation: FundAllocation = {
              allocationId: 'test-allocation',
              tenantId: request.tenantId,
              strategyId: request.strategyId,
              version: 1,
              allocations,
              ensembleMode: true,
              createdAt: new Date().toISOString(),
              createdBy: 'test-user',
            };
            
            mockAllocationService.getAllocation.mockResolvedValue(mockAllocation);
            mockAllocationService.calculateWeights.mockImplementation((allocs) => {
              const weights = new Map<string, number>();
              for (const alloc of allocs) {
                weights.set(alloc.modelConfigId, alloc.percentage / 100);
              }
              return weights;
            });
            
            mockModelConfigRepo.getConfiguration.mockResolvedValue({
              configId: 'test-config',
              tenantId: request.tenantId,
              providerId: 'test-provider',
              modelId: 'test-model',
              modelName: 'Test Model',
              enabled: true,
              credentials: { encryptedApiKey: 'key', keyId: 'key-id' },
              costLimits: {
                maxDailyCostUsd: 100,
                maxMonthlyCostUsd: 1000,
                currentDailyCostUsd: 0,
                currentMonthlyCostUsd: 0,
                lastResetDate: new Date().toISOString(),
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // All models fail
            mockAIAnalysisService.classifyMarketRegime.mockRejectedValue(
              new Error('Model failed')
            );
            
            const result = await EnsembleService.analyzeWithEnsemble(request);
            
            // Should return fallback response
            const aggregated = result.aggregatedResult as RegimeClassificationResponse;
            expect(aggregated.regime).toBe('UNCERTAIN');
            expect(aggregated.confidence).toBe(0);
            expect(result.consensus).toBe(false);
            expect(result.consensusLevel).toBe(0);
            
            // All individual results should be ERROR
            for (const individualResult of result.individualResults) {
              expect(individualResult.status).toBe('ERROR');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trigger alert on total failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          ensembleRequestArb(),
          validModelAllocationsArb(),
          async (request, allocations) => {
            const alertSpy = jest.fn();
            EnsembleService.setAlertHandler({
              alertTotalFailure: alertSpy,
            });
            
            const mockAllocation: FundAllocation = {
              allocationId: 'test-allocation',
              tenantId: request.tenantId,
              strategyId: request.strategyId,
              version: 1,
              allocations,
              ensembleMode: true,
              createdAt: new Date().toISOString(),
              createdBy: 'test-user',
            };
            
            mockAllocationService.getAllocation.mockResolvedValue(mockAllocation);
            mockAllocationService.calculateWeights.mockImplementation((allocs) => {
              const weights = new Map<string, number>();
              for (const alloc of allocs) {
                weights.set(alloc.modelConfigId, alloc.percentage / 100);
              }
              return weights;
            });
            
            mockModelConfigRepo.getConfiguration.mockResolvedValue({
              configId: 'test-config',
              tenantId: request.tenantId,
              providerId: 'test-provider',
              modelId: 'test-model',
              modelName: 'Test Model',
              enabled: true,
              credentials: { encryptedApiKey: 'key', keyId: 'key-id' },
              costLimits: {
                maxDailyCostUsd: 100,
                maxMonthlyCostUsd: 1000,
                currentDailyCostUsd: 0,
                currentMonthlyCostUsd: 0,
                lastResetDate: new Date().toISOString(),
              },
              rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, requestsPerDay: 1000 },
              priority: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // All models fail
            mockAIAnalysisService.classifyMarketRegime.mockRejectedValue(
              new Error('Model failed')
            );
            
            await EnsembleService.analyzeWithEnsemble(request);
            
            // Alert should have been triggered
            expect(alertSpy).toHaveBeenCalledWith(
              request.tenantId,
              request.strategyId,
              expect.any(Array)
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateConsensus', () => {
    it('should return 1.0 for single model', async () => {
      await fc.assert(
        fc.property(
          marketRegimeArb(),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (regime, confidence) => {
            const results: IndividualModelResult[] = [{
              modelConfigId: 'model-1',
              modelName: 'Model 1',
              result: {
                regime,
                confidence,
                reasoning: 'Test',
                supportingFactors: [],
                modelId: 'model-1',
                promptVersion: '1',
                processingTimeMs: 100,
                timestamp: new Date().toISOString(),
              },
              status: 'SUCCESS',
              weight: 1.0,
            }];
            
            const consensusLevel = EnsembleService.calculateConsensus(results);
            expect(consensusLevel).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 for no successful results', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (count) => {
            const results: IndividualModelResult[] = Array(count).fill(null).map((_, i) => ({
              modelConfigId: `model-${i}`,
              modelName: `Model ${i}`,
              result: null,
              status: 'ERROR' as IndividualResultStatus,
              errorMessage: 'Failed',
              weight: 1 / count,
            }));
            
            const consensusLevel = EnsembleService.calculateConsensus(results);
            expect(consensusLevel).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
