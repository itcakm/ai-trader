import * as fc from 'fast-check';
import {
  AITraceService,
  AITraceServiceExtended,
  hasRequiredFields,
  hasReproducibleInputs
} from './ai-trace';
import { AITraceRepository } from '../repositories/ai-trace';
import { AITrace, AITraceInput, AIInputSnapshot } from '../types/ai-trace';
import {
  aiTraceArb,
  aiTraceInputArb,
  aiTraceSequenceArb,
  aiInputSnapshotArb,
  aiAnalysisTypeArb,
  marketDataReferenceArb,
  tokenUsageArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository for unit testing
jest.mock('../repositories/ai-trace');

const mockRepository = AITraceRepository as jest.Mocked<typeof AITraceRepository>;

describe('AI Trace Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logAITrace', () => {
    it('should log an AI trace with all required fields', async () => {
      const input: AITraceInput = {
        tenantId: 'tenant-123',
        correlationId: 'corr-456',
        analysisType: 'REGIME_CLASSIFICATION',
        promptTemplateId: 'template-789',
        promptVersion: 1,
        renderedPrompt: 'Analyze the current market regime for BTC',
        inputSnapshot: {
          marketDataHash: 'abc123def456',
          marketDataSnapshot: {
            symbols: ['BTC', 'ETH'],
            timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
            snapshotId: 'snapshot-001'
          }
        },
        rawOutput: '{"regime": "bullish", "confidence": 0.85}',
        validatedOutput: { regime: 'bullish', confidence: 0.85 },
        validationPassed: true,
        modelId: 'gpt-4',
        modelVersion: '0613',
        processingTimeMs: 1500,
        tokenUsage: { promptTokens: 500, completionTokens: 100, totalTokens: 600 },
        costUsd: 0.05
      };

      mockRepository.putTrace.mockImplementation(async (trace) => trace);

      const result = await AITraceService.logAITrace(input);

      expect(result.traceId).toBeDefined();
      expect(result.tenantId).toBe(input.tenantId);
      expect(result.correlationId).toBe(input.correlationId);
      expect(result.analysisType).toBe(input.analysisType);
      expect(result.timestamp).toBeDefined();
      expect(result.promptTemplateId).toBe(input.promptTemplateId);
      expect(result.promptVersion).toBe(input.promptVersion);
      expect(result.renderedPrompt).toBe(input.renderedPrompt);
      expect(result.inputSnapshot).toEqual(input.inputSnapshot);
      expect(result.rawOutput).toBe(input.rawOutput);
      expect(result.validatedOutput).toEqual(input.validatedOutput);
      expect(result.validationPassed).toBe(input.validationPassed);
      expect(result.modelId).toBe(input.modelId);
      expect(result.modelVersion).toBe(input.modelVersion);
      expect(result.processingTimeMs).toBe(input.processingTimeMs);
      expect(result.tokenUsage).toEqual(input.tokenUsage);
      expect(result.costUsd).toBe(input.costUsd);
      expect(mockRepository.putTrace).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: input.tenantId,
        correlationId: input.correlationId
      }));
    });

    it('should log an AI trace without correlation ID', async () => {
      const input: AITraceInput = {
        tenantId: 'tenant-123',
        analysisType: 'MARKET_ANALYSIS',
        promptTemplateId: 'template-789',
        promptVersion: 2,
        renderedPrompt: 'Analyze market conditions',
        inputSnapshot: {
          marketDataHash: 'xyz789',
          marketDataSnapshot: {
            symbols: ['BTC'],
            timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
            snapshotId: 'snapshot-002'
          }
        },
        rawOutput: 'Market is volatile',
        validatedOutput: 'Market is volatile',
        validationPassed: true,
        modelId: 'gpt-4',
        modelVersion: '0613',
        processingTimeMs: 1000,
        tokenUsage: { promptTokens: 300, completionTokens: 50, totalTokens: 350 },
        costUsd: 0.03
      };

      mockRepository.putTrace.mockImplementation(async (trace) => trace);

      const result = await AITraceService.logAITrace(input);

      expect(result.traceId).toBeDefined();
      expect(result.correlationId).toBeUndefined();
    });
  });

  describe('hasRequiredFields', () => {
    it('should return true for valid AI trace', () => {
      const trace: AITrace = {
        traceId: 'trace-1',
        tenantId: 'tenant-123',
        analysisType: 'REGIME_CLASSIFICATION',
        timestamp: '2024-01-01T10:00:00.000Z',
        promptTemplateId: 'template-789',
        promptVersion: 1,
        renderedPrompt: 'Test prompt',
        inputSnapshot: {
          marketDataHash: 'abc123',
          marketDataSnapshot: {
            symbols: ['BTC'],
            timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
            snapshotId: 'snapshot-001'
          }
        },
        rawOutput: 'Test output',
        validatedOutput: { result: 'test' },
        validationPassed: true,
        modelId: 'gpt-4',
        modelVersion: '0613',
        processingTimeMs: 1000,
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        costUsd: 0.01
      };

      expect(hasRequiredFields(trace)).toBe(true);
    });

    it('should return false for missing traceId', () => {
      const trace = {
        traceId: '',
        tenantId: 'tenant-123',
        analysisType: 'REGIME_CLASSIFICATION',
        timestamp: '2024-01-01T10:00:00.000Z',
        promptTemplateId: 'template-789',
        promptVersion: 1,
        renderedPrompt: 'Test prompt',
        inputSnapshot: {
          marketDataHash: 'abc123',
          marketDataSnapshot: {
            symbols: ['BTC'],
            timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
            snapshotId: 'snapshot-001'
          }
        },
        rawOutput: 'Test output',
        validatedOutput: { result: 'test' },
        validationPassed: true,
        modelId: 'gpt-4',
        modelVersion: '0613',
        processingTimeMs: 1000,
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        costUsd: 0.01
      } as AITrace;

      expect(hasRequiredFields(trace)).toBe(false);
    });
  });

  describe('hasReproducibleInputs', () => {
    it('should return true for valid input snapshot', () => {
      const snapshot: AIInputSnapshot = {
        marketDataHash: 'abc123',
        marketDataSnapshot: {
          symbols: ['BTC', 'ETH'],
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
          snapshotId: 'snapshot-001'
        }
      };

      expect(hasReproducibleInputs(snapshot)).toBe(true);
    });

    it('should return false for missing marketDataHash', () => {
      const snapshot = {
        marketDataHash: '',
        marketDataSnapshot: {
          symbols: ['BTC'],
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
          snapshotId: 'snapshot-001'
        }
      } as AIInputSnapshot;

      expect(hasReproducibleInputs(snapshot)).toBe(false);
    });

    it('should return false for empty symbols array', () => {
      const snapshot: AIInputSnapshot = {
        marketDataHash: 'abc123',
        marketDataSnapshot: {
          symbols: [],
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
          snapshotId: 'snapshot-001'
        }
      };

      expect(hasReproducibleInputs(snapshot)).toBe(false);
    });
  });
});


/**
 * Property-Based Tests for AI Trace
 * Feature: reporting-audit
 */
describe('AI Trace Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 5: AI Trace Field Completeness
   * 
   * *For any* AI trace logged by the Audit_Service, the stored record SHALL contain:
   * prompt template ID, prompt version, rendered prompt, raw AI output, validated output,
   * processing time, model ID, model version, and ensemble weights (if applicable).
   * 
   * **Validates: Requirements 2.2, 2.5**
   */
  describe('Property 5: AI Trace Field Completeness', () => {
    it('should ensure all logged AI traces contain required fields', async () => {
      await fc.assert(
        fc.asyncProperty(aiTraceInputArb(), async (input) => {
          mockRepository.putTrace.mockImplementation(async (trace) => trace);

          const result = await AITraceService.logAITrace(input);

          // Verify all required fields are present (Requirements: 2.2)
          expect(result.traceId).toBeDefined();
          expect(result.traceId.length).toBeGreaterThan(0);
          expect(result.tenantId).toBe(input.tenantId);
          expect(result.analysisType).toBe(input.analysisType);
          expect(result.timestamp).toBeDefined();
          
          // Prompt-related fields (Requirements: 2.2)
          expect(result.promptTemplateId).toBe(input.promptTemplateId);
          expect(result.promptVersion).toBe(input.promptVersion);
          expect(result.renderedPrompt).toBe(input.renderedPrompt);
          
          // Output fields (Requirements: 2.2)
          expect(result.rawOutput).toBe(input.rawOutput);
          expect(result.validatedOutput).toEqual(input.validatedOutput);
          expect(result.validationPassed).toBe(input.validationPassed);
          
          // Model information (Requirements: 2.5)
          expect(result.modelId).toBe(input.modelId);
          expect(result.modelVersion).toBe(input.modelVersion);
          
          // Ensemble weights if provided (Requirements: 2.5)
          if (input.ensembleWeights !== undefined) {
            expect(result.ensembleWeights).toEqual(input.ensembleWeights);
          }
          
          // Metrics
          expect(result.processingTimeMs).toBe(input.processingTimeMs);
          expect(result.tokenUsage).toEqual(input.tokenUsage);
          expect(result.costUsd).toBe(input.costUsd);
          
          // Input snapshot (Requirements: 2.6)
          expect(result.inputSnapshot).toEqual(input.inputSnapshot);

          // Verify hasRequiredFields returns true
          expect(hasRequiredFields(result)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: AI Trace Correlation Linking
   * 
   * *For any* AI trace linked to a trade decision via correlation ID, querying the trace
   * by correlation ID SHALL return the trace, and the trace SHALL reference the correct decision.
   * 
   * **Validates: Requirements 2.3**
   */
  describe('Property 6: AI Trace Correlation Linking', () => {
    it('should return all and only traces with matching correlation ID', async () => {
      await fc.assert(
        fc.asyncProperty(aiTraceSequenceArb(), async ({ tenantId, correlationId, traces }) => {
          // Mock repository to return the traces
          mockRepository.listTracesByCorrelationId.mockResolvedValue(traces);

          const result = await AITraceServiceExtended.getTracesByCorrelationId(tenantId, correlationId);

          // All returned traces should have the same correlation ID
          for (const trace of result) {
            expect(trace.correlationId).toBe(correlationId);
            expect(trace.tenantId).toBe(tenantId);
          }

          // Should return all traces (same count)
          expect(result.length).toBe(traces.length);

          // All original traces should be in the result
          const resultTraceIds = new Set(result.map(t => t.traceId));
          for (const trace of traces) {
            expect(resultTraceIds.has(trace.traceId)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: AI Input Reproducibility
   * 
   * *For any* AI trace, the stored input snapshot SHALL contain sufficient information
   * (market data hash, snapshot references, context IDs) to reproduce the exact AI interaction.
   * 
   * **Validates: Requirements 2.6**
   */
  describe('Property 7: AI Input Reproducibility', () => {
    it('should ensure all logged AI traces have reproducible input snapshots', async () => {
      await fc.assert(
        fc.asyncProperty(aiTraceInputArb(), async (input) => {
          mockRepository.putTrace.mockImplementation(async (trace) => trace);

          const result = await AITraceService.logAITrace(input);

          // Verify input snapshot has all required fields for reproduction
          const snapshot = result.inputSnapshot;
          
          // Must have market data hash for verification
          expect(snapshot.marketDataHash).toBeDefined();
          expect(snapshot.marketDataHash.length).toBeGreaterThan(0);
          
          // Must have market data snapshot reference
          expect(snapshot.marketDataSnapshot).toBeDefined();
          expect(snapshot.marketDataSnapshot.snapshotId).toBeDefined();
          expect(snapshot.marketDataSnapshot.symbols).toBeDefined();
          expect(snapshot.marketDataSnapshot.symbols.length).toBeGreaterThan(0);
          expect(snapshot.marketDataSnapshot.timeRange).toBeDefined();
          expect(snapshot.marketDataSnapshot.timeRange.start).toBeDefined();
          expect(snapshot.marketDataSnapshot.timeRange.end).toBeDefined();
          
          // Verify hasReproducibleInputs returns true
          expect(hasReproducibleInputs(snapshot)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should store and retrieve input snapshots correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          aiInputSnapshotArb(),
          fc.uuid(),
          fc.uuid(),
          isoDateStringArb(),
          async (snapshot, tenantId, traceId, timestamp) => {
            // Mock repository to return the snapshot
            mockRepository.getInputSnapshot.mockResolvedValue(snapshot);

            const result = await AITraceServiceExtended.getReproductionInputs(tenantId, timestamp, traceId);

            // Verify the snapshot is returned correctly
            expect(result.marketDataHash).toBe(snapshot.marketDataHash);
            expect(result.marketDataSnapshot.snapshotId).toBe(snapshot.marketDataSnapshot.snapshotId);
            expect(result.marketDataSnapshot.symbols).toEqual(snapshot.marketDataSnapshot.symbols);
            expect(result.marketDataSnapshot.timeRange).toEqual(snapshot.marketDataSnapshot.timeRange);
            
            // Optional fields should match if present
            if (snapshot.newsContextIds) {
              expect(result.newsContextIds).toEqual(snapshot.newsContextIds);
            }
            if (snapshot.sentimentDataIds) {
              expect(result.sentimentDataIds).toEqual(snapshot.sentimentDataIds);
            }
            if (snapshot.onChainDataIds) {
              expect(result.onChainDataIds).toEqual(snapshot.onChainDataIds);
            }
            if (snapshot.strategyContext) {
              expect(result.strategyContext).toEqual(snapshot.strategyContext);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
