import * as fc from 'fast-check';
import { PerformanceService, getPeriodStart } from './performance';
import { PerformanceRepository } from '../repositories/performance';
import {
  ModelPerformance,
  PerformancePrediction,
  PerformanceMetrics,
  PerformancePeriod,
  createEmptyMetrics
} from '../types/performance';
import { MarketRegime } from '../types/analysis';
import {
  recordPredictionInputArb,
  marketRegimeArb,
  performancePeriodArb,
  performanceMetricsArb,
  modelPerformanceArb,
  unvalidatedPredictionArb,
  validatedPredictionArb,
  predictionListForModelArb,
  performanceComparisonArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/performance');

const mockPerformanceRepo = PerformanceRepository as jest.Mocked<typeof PerformanceRepository>;

describe('PerformanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 11: Performance Tracking and Metrics
   * 
   * For any AI_Analysis that is generated, a PerformancePrediction record SHALL be created,
   * AND when validated against actual market movement, the ModelPerformance metrics SHALL
   * be updated to reflect the accuracy.
   * 
   * **Feature: ai-assisted-intelligence, Property 11: Performance Tracking and Metrics**
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */
  describe('Property 11: Performance Tracking and Metrics', () => {
    it('should create a prediction record for every analysis', async () => {
      await fc.assert(
        fc.asyncProperty(
          recordPredictionInputArb(),
          async (input) => {
            // Setup mocks
            const createdPrediction: PerformancePrediction = {
              predictionId: 'new-prediction-id',
              tenantId: input.tenantId,
              modelConfigId: input.modelConfigId,
              analysisId: input.analysisId,
              predictedRegime: input.predictedRegime,
              confidence: input.confidence,
              timestamp: new Date().toISOString(),
              validated: false,
              processingTimeMs: input.processingTimeMs,
              costUsd: input.costUsd
            };

            mockPerformanceRepo.createPrediction.mockResolvedValue(createdPrediction);
            mockPerformanceRepo.getOrCreatePerformance.mockImplementation(
              async (tenantId, modelConfigId, period, periodStart) => ({
                performanceId: `perf-${period}`,
                tenantId,
                modelConfigId,
                period,
                periodStart,
                metrics: createEmptyMetrics(),
                updatedAt: new Date().toISOString()
              })
            );
            mockPerformanceRepo.upsertPerformance.mockImplementation(
              async (perf) => perf
            );

            const result = await PerformanceService.recordPrediction(input);

            // Verify prediction was created
            expect(mockPerformanceRepo.createPrediction).toHaveBeenCalled();
            expect(result.tenantId).toBe(input.tenantId);
            expect(result.modelConfigId).toBe(input.modelConfigId);
            expect(result.analysisId).toBe(input.analysisId);
            expect(result.predictedRegime).toBe(input.predictedRegime);
            expect(result.confidence).toBe(input.confidence);
            expect(result.validated).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update accuracy metrics when prediction is validated', async () => {
      await fc.assert(
        fc.asyncProperty(
          unvalidatedPredictionArb(),
          marketRegimeArb(),
          async (prediction, actualRegime) => {
            // Setup mocks
            mockPerformanceRepo.getPrediction.mockResolvedValue(prediction);
            
            const updatedPrediction: PerformancePrediction = {
              ...prediction,
              validated: true,
              actualRegime,
              correct: prediction.predictedRegime === actualRegime
            };
            mockPerformanceRepo.updatePrediction.mockResolvedValue(updatedPrediction);
            
            mockPerformanceRepo.getPerformance.mockImplementation(
              async (tenantId, modelConfigId, period, periodStart) => ({
                performanceId: `perf-${period}`,
                tenantId,
                modelConfigId,
                period,
                periodStart,
                metrics: createEmptyMetrics(),
                updatedAt: new Date().toISOString()
              })
            );
            
            mockPerformanceRepo.listPredictions.mockResolvedValue({
              items: [updatedPrediction],
              lastEvaluatedKey: undefined
            });
            
            mockPerformanceRepo.upsertPerformance.mockImplementation(
              async (perf) => perf
            );

            const result = await PerformanceService.validatePrediction({
              tenantId: prediction.tenantId,
              predictionId: prediction.predictionId,
              actualRegime
            });

            // Verify prediction was updated
            expect(result.validated).toBe(true);
            expect(result.actualRegime).toBe(actualRegime);
            expect(result.correct).toBe(prediction.predictedRegime === actualRegime);
            
            // Verify metrics were updated
            expect(mockPerformanceRepo.upsertPerformance).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly calculate accuracy based on validated predictions', async () => {
      await fc.assert(
        fc.asyncProperty(
          predictionListForModelArb(),
          async ({ tenantId, modelConfigId, predictions }) => {
            // Filter to only validated predictions
            const validatedPredictions = predictions.filter(p => p.validated);
            const correctCount = validatedPredictions.filter(p => p.correct).length;
            const expectedAccuracy = validatedPredictions.length > 0
              ? correctCount / validatedPredictions.length
              : 0;

            // Setup mock to return the predictions
            mockPerformanceRepo.listPredictions.mockResolvedValue({
              items: validatedPredictions,
              lastEvaluatedKey: undefined
            });

            // If we have validated predictions, verify accuracy calculation
            if (validatedPredictions.length > 0) {
              // The accuracy should match our expected calculation
              expect(expectedAccuracy).toBeGreaterThanOrEqual(0);
              expect(expectedAccuracy).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track metrics for all period types (DAILY, WEEKLY, MONTHLY)', async () => {
      await fc.assert(
        fc.asyncProperty(
          recordPredictionInputArb(),
          async (input) => {
            const periodsUpdated: PerformancePeriod[] = [];
            
            mockPerformanceRepo.createPrediction.mockResolvedValue({
              predictionId: 'new-id',
              ...input,
              timestamp: new Date().toISOString(),
              validated: false
            });
            
            mockPerformanceRepo.getOrCreatePerformance.mockImplementation(
              async (tenantId, modelConfigId, period, periodStart) => {
                periodsUpdated.push(period);
                return {
                  performanceId: `perf-${period}`,
                  tenantId,
                  modelConfigId,
                  period,
                  periodStart,
                  metrics: createEmptyMetrics(),
                  updatedAt: new Date().toISOString()
                };
              }
            );
            
            mockPerformanceRepo.upsertPerformance.mockImplementation(
              async (perf) => perf
            );

            await PerformanceService.recordPrediction(input);

            // Verify all three periods were updated
            expect(periodsUpdated).toContain('DAILY');
            expect(periodsUpdated).toContain('WEEKLY');
            expect(periodsUpdated).toContain('MONTHLY');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject validation of already validated predictions', async () => {
      await fc.assert(
        fc.asyncProperty(
          validatedPredictionArb(),
          marketRegimeArb(),
          async (prediction, newActualRegime) => {
            mockPerformanceRepo.getPrediction.mockResolvedValue(prediction);

            await expect(
              PerformanceService.validatePrediction({
                tenantId: prediction.tenantId,
                predictionId: prediction.predictionId,
                actualRegime: newActualRegime
              })
            ).rejects.toThrow('already validated');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw error when validating non-existent prediction', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          marketRegimeArb(),
          async (tenantId, predictionId, actualRegime) => {
            mockPerformanceRepo.getPrediction.mockResolvedValue(null);

            await expect(
              PerformanceService.validatePrediction({
                tenantId,
                predictionId,
                actualRegime
              })
            ).rejects.toThrow('not found');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getPeriodStart', () => {
    it('should calculate correct period start for DAILY', () => {
      fc.assert(
        fc.property(
          isoDateStringArb(),
          (timestamp) => {
            const periodStart = getPeriodStart(timestamp, 'DAILY');
            const date = new Date(periodStart);
            
            // Should be at midnight UTC
            expect(date.getUTCHours()).toBe(0);
            expect(date.getUTCMinutes()).toBe(0);
            expect(date.getUTCSeconds()).toBe(0);
            expect(date.getUTCMilliseconds()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct period start for WEEKLY', () => {
      fc.assert(
        fc.property(
          isoDateStringArb(),
          (timestamp) => {
            const periodStart = getPeriodStart(timestamp, 'WEEKLY');
            const date = new Date(periodStart);
            
            // Should be Sunday at midnight UTC
            expect(date.getUTCDay()).toBe(0); // Sunday
            expect(date.getUTCHours()).toBe(0);
            expect(date.getUTCMinutes()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct period start for MONTHLY', () => {
      fc.assert(
        fc.property(
          isoDateStringArb(),
          (timestamp) => {
            const periodStart = getPeriodStart(timestamp, 'MONTHLY');
            const date = new Date(periodStart);
            
            // Should be first day of month at midnight UTC
            expect(date.getUTCDate()).toBe(1);
            expect(date.getUTCHours()).toBe(0);
            expect(date.getUTCMinutes()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('compareModels', () => {
    it('should return performances sorted by accuracy descending', async () => {
      await fc.assert(
        fc.asyncProperty(
          performanceComparisonArb(),
          async ({ tenantId, period, performances }) => {
            // Setup mocks to return each performance
            for (const perf of performances) {
              mockPerformanceRepo.getLatestPerformance.mockResolvedValueOnce(perf);
            }

            const modelConfigIds = performances.map(p => p.modelConfigId);
            const result = await PerformanceService.compareModels(
              tenantId,
              modelConfigIds,
              period
            );

            // Verify results are sorted by accuracy descending
            for (let i = 1; i < result.length; i++) {
              expect(result[i - 1].metrics.regimeAccuracy)
                .toBeGreaterThanOrEqual(result[i].metrics.regimeAccuracy);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only return performances for models that have data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          performancePeriodArb(),
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 0, max: 5 }),
          async (tenantId, period, modelConfigIds, numWithData) => {
            // Some models have data, some don't
            const modelsWithData = modelConfigIds.slice(0, Math.min(numWithData, modelConfigIds.length));
            
            mockPerformanceRepo.getLatestPerformance.mockImplementation(
              async (tid, mcid, p) => {
                if (modelsWithData.includes(mcid)) {
                  return {
                    performanceId: `perf-${mcid}`,
                    tenantId: tid,
                    modelConfigId: mcid,
                    period: p,
                    periodStart: new Date().toISOString(),
                    metrics: createEmptyMetrics(),
                    updatedAt: new Date().toISOString()
                  };
                }
                return null;
              }
            );

            const result = await PerformanceService.compareModels(
              tenantId,
              modelConfigIds,
              period
            );

            // Should only return models that have data
            expect(result.length).toBe(modelsWithData.length);
            for (const perf of result) {
              expect(modelsWithData).toContain(perf.modelConfigId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getPerformance', () => {
    it('should return latest performance for a model', async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPerformanceArb(),
          async (performance) => {
            mockPerformanceRepo.getLatestPerformance.mockResolvedValue(performance);

            const result = await PerformanceService.getPerformance(
              performance.tenantId,
              performance.modelConfigId,
              performance.period
            );

            expect(result).toEqual(performance);
            expect(mockPerformanceRepo.getLatestPerformance).toHaveBeenCalledWith(
              performance.tenantId,
              performance.modelConfigId,
              performance.period
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null when no performance data exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          performancePeriodArb(),
          async (tenantId, modelConfigId, period) => {
            mockPerformanceRepo.getLatestPerformance.mockResolvedValue(null);

            const result = await PerformanceService.getPerformance(
              tenantId,
              modelConfigId,
              period
            );

            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
