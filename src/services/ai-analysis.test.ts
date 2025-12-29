/**
 * AI Analysis Service Tests
 * 
 * Property-based tests for AI analysis service functionality.
 */

import * as fc from 'fast-check';
import { AIAnalysisService, VALID_REGIMES, FALLBACK_REGIME_RESPONSE } from './ai-analysis';
import { MarketRegime, RegimeClassificationResponse } from '../types/analysis';

/**
 * Generator for valid MarketRegime values
 */
const validRegimeArb = (): fc.Arbitrary<MarketRegime> =>
  fc.constantFrom(...VALID_REGIMES);

/**
 * Generator for valid confidence values (0.0 to 1.0)
 */
const validConfidenceArb = (): fc.Arbitrary<number> =>
  fc.double({ min: 0, max: 1, noNaN: true });

/**
 * Generator for invalid confidence values (outside 0.0 to 1.0)
 */
const invalidConfidenceArb = (): fc.Arbitrary<number> =>
  fc.oneof(
    fc.double({ min: -1000, max: -0.001, noNaN: true }),
    fc.double({ min: 1.001, max: 1000, noNaN: true }),
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity)
  );

/**
 * Generator for invalid regime values
 */
const invalidRegimeArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => !VALID_REGIMES.includes(s as MarketRegime));

/**
 * Generator for valid RegimeClassificationResponse
 */
const validRegimeResponseArb = (): fc.Arbitrary<RegimeClassificationResponse> =>
  fc.record({
    regime: validRegimeArb(),
    confidence: validConfidenceArb(),
    reasoning: fc.string({ minLength: 10, maxLength: 500 }),
    supportingFactors: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
    modelId: fc.string({ minLength: 1, maxLength: 50 }),
    promptVersion: fc.string({ minLength: 1, maxLength: 10 }),
    processingTimeMs: fc.integer({ min: 0, max: 60000 }),
    timestamp: fc.date().map(d => d.toISOString())
  });

describe('AIAnalysisService', () => {
  describe('Regime Output Constraints', () => {
    /**
     * Property 6: Regime Classification Output Constraints
     * 
     * *For any* RegimeClassificationResponse, the regime field SHALL be one of the valid 
     * MarketRegime enum values, AND the confidence field SHALL be a number between 0.0 and 1.0 inclusive.
     * 
     * **Validates: Requirements 3.2, 3.3**
     * 
     * Feature: ai-assisted-intelligence, Property 6: Regime Classification Output Constraints
     */
    describe('Property 6: Regime Classification Output Constraints', () => {
      it('should accept all valid regime values', () => {
        fc.assert(
          fc.property(validRegimeArb(), (regime) => {
            const result = AIAnalysisService.isValidRegime(regime);
            expect(result).toBe(true);
          }),
          { numRuns: 100 }
        );
      });

      it('should reject invalid regime values', () => {
        fc.assert(
          fc.property(invalidRegimeArb(), (regime) => {
            const result = AIAnalysisService.isValidRegime(regime);
            expect(result).toBe(false);
          }),
          { numRuns: 100 }
        );
      });

      it('should accept confidence values between 0.0 and 1.0 inclusive', () => {
        fc.assert(
          fc.property(validConfidenceArb(), (confidence) => {
            const result = AIAnalysisService.isValidConfidence(confidence);
            expect(result).toBe(true);
          }),
          { numRuns: 100 }
        );
      });

      it('should reject confidence values outside 0.0 to 1.0', () => {
        fc.assert(
          fc.property(invalidConfidenceArb(), (confidence) => {
            const result = AIAnalysisService.isValidConfidence(confidence);
            expect(result).toBe(false);
          }),
          { numRuns: 100 }
        );
      });

      it('should validate complete regime output with valid values', () => {
        fc.assert(
          fc.property(validRegimeResponseArb(), (response) => {
            const result = AIAnalysisService.validateRegimeOutput(response);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }),
          { numRuns: 100 }
        );
      });

      it('should reject regime output with invalid regime', () => {
        fc.assert(
          fc.property(
            invalidRegimeArb(),
            validConfidenceArb(),
            (regime, confidence) => {
              const output = { regime, confidence, reasoning: 'Test reasoning' };
              const result = AIAnalysisService.validateRegimeOutput(output);
              expect(result.valid).toBe(false);
              expect(result.errors.some(e => e.includes('Invalid regime'))).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject regime output with invalid confidence', () => {
        fc.assert(
          fc.property(
            validRegimeArb(),
            invalidConfidenceArb(),
            (regime, confidence) => {
              const output = { regime, confidence, reasoning: 'Test reasoning' };
              const result = AIAnalysisService.validateRegimeOutput(output);
              expect(result.valid).toBe(false);
              expect(result.errors.some(e => e.includes('Invalid confidence'))).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject non-object outputs', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.constant(undefined)
            ),
            (output) => {
              const result = AIAnalysisService.validateRegimeOutput(output);
              expect(result.valid).toBe(false);
              expect(result.errors).toContain('Output must be an object');
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });
});


  describe('Schema Validation with Fallback', () => {
    /**
     * Property 7: Schema Validation with Fallback
     * 
     * *For any* AI_Model output that fails JSON schema validation, the system SHALL return 
     * a fallback response with regime='UNCERTAIN' and confidence=0, AND the validation 
     * failure SHALL be logged.
     * 
     * **Validates: Requirements 3.4, 3.5**
     * 
     * Feature: ai-assisted-intelligence, Property 7: Schema Validation with Fallback
     */
    describe('Property 7: Schema Validation with Fallback', () => {
      it('should return UNCERTAIN regime for fallback responses', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.integer({ min: 0, max: 10000 }),
            (modelId, promptVersion, startTimeOffset) => {
              const startTime = Date.now() - startTimeOffset;
              const fallback = AIAnalysisService.createFallbackRegimeResponse(
                modelId,
                promptVersion,
                startTime
              );
              
              expect(fallback.regime).toBe('UNCERTAIN');
              expect(fallback.confidence).toBe(0);
              expect(fallback.modelId).toBe(modelId);
              expect(fallback.promptVersion).toBe(promptVersion);
              expect(fallback.processingTimeMs).toBeGreaterThanOrEqual(0);
              expect(fallback.timestamp).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should have valid structure in fallback response', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (modelId, promptVersion) => {
              const fallback = AIAnalysisService.createFallbackRegimeResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              
              // Verify fallback is a valid regime response structure
              expect(AIAnalysisService.isValidRegime(fallback.regime)).toBe(true);
              expect(AIAnalysisService.isValidConfidence(fallback.confidence)).toBe(true);
              expect(typeof fallback.reasoning).toBe('string');
              expect(Array.isArray(fallback.supportingFactors)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should validate that fallback confidence is exactly 0', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (modelId, promptVersion) => {
              const fallback = AIAnalysisService.createFallbackRegimeResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              
              // Confidence must be exactly 0 for fallback
              expect(fallback.confidence).toStrictEqual(0);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should validate that fallback regime is exactly UNCERTAIN', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (modelId, promptVersion) => {
              const fallback = AIAnalysisService.createFallbackRegimeResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              
              // Regime must be exactly UNCERTAIN for fallback
              expect(fallback.regime).toStrictEqual('UNCERTAIN');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should preserve model and prompt info in fallback', () => {
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 5 }),
            (modelId, promptVersion) => {
              const fallback = AIAnalysisService.createFallbackRegimeResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              
              // Model and prompt info should be preserved for audit trail
              expect(fallback.modelId).toBe(modelId);
              expect(fallback.promptVersion).toBe(promptVersion);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should calculate processing time correctly in fallback', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.integer({ min: 10, max: 5000 }),
            (modelId, promptVersion, delay) => {
              const startTime = Date.now() - delay;
              const fallback = AIAnalysisService.createFallbackRegimeResponse(
                modelId,
                promptVersion,
                startTime
              );
              
              // Processing time should be approximately the delay
              expect(fallback.processingTimeMs).toBeGreaterThanOrEqual(delay);
              // Allow some tolerance for test execution time
              expect(fallback.processingTimeMs).toBeLessThan(delay + 100);
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });


  describe('Explanation Generation with Template Tracking', () => {
    /**
     * Property 8: Explanation Generation with Template Tracking
     * 
     * *For any* ExplanationResponse, the response SHALL include the promptVersion used, 
     * AND an audit record SHALL exist containing the rendered prompt and raw AI output.
     * 
     * **Validates: Requirements 4.3, 4.4, 4.5**
     * 
     * Feature: ai-assisted-intelligence, Property 8: Explanation Generation with Template Tracking
     */
    describe('Property 8: Explanation Generation with Template Tracking', () => {
      it('should include promptVersion in fallback explanation response', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 5 }),
            (modelId, promptVersion) => {
              const fallback = AIAnalysisService.createFallbackExplanationResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              
              // Verify promptVersion is included
              expect(fallback.promptVersion).toBe(promptVersion);
              expect(fallback.modelId).toBe(modelId);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should have valid structure in fallback explanation response', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (modelId, promptVersion) => {
              const fallback = AIAnalysisService.createFallbackExplanationResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              
              // Verify fallback has required fields
              expect(typeof fallback.explanation).toBe('string');
              expect(fallback.explanation.length).toBeGreaterThan(0);
              expect(Array.isArray(fallback.keyFactors)).toBe(true);
              expect(typeof fallback.riskAssessment).toBe('string');
              expect(typeof fallback.modelId).toBe('string');
              expect(typeof fallback.promptVersion).toBe('string');
              expect(typeof fallback.processingTimeMs).toBe('number');
              expect(typeof fallback.timestamp).toBe('string');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should preserve model and prompt info in explanation fallback', () => {
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.integer({ min: 1, max: 100 }).map(n => n.toString()),
            (modelId, promptVersion) => {
              const fallback = AIAnalysisService.createFallbackExplanationResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              
              // Model and prompt info should be preserved for audit trail
              expect(fallback.modelId).toBe(modelId);
              expect(fallback.promptVersion).toBe(promptVersion);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should calculate processing time correctly in explanation fallback', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.integer({ min: 10, max: 5000 }),
            (modelId, promptVersion, delay) => {
              const startTime = Date.now() - delay;
              const fallback = AIAnalysisService.createFallbackExplanationResponse(
                modelId,
                promptVersion,
                startTime
              );
              
              // Processing time should be approximately the delay
              expect(fallback.processingTimeMs).toBeGreaterThanOrEqual(delay);
              // Allow some tolerance for test execution time
              expect(fallback.processingTimeMs).toBeLessThan(delay + 100);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should have valid timestamp in explanation fallback', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (modelId, promptVersion) => {
              const beforeTime = new Date().toISOString();
              const fallback = AIAnalysisService.createFallbackExplanationResponse(
                modelId,
                promptVersion,
                Date.now()
              );
              const afterTime = new Date().toISOString();
              
              // Timestamp should be a valid ISO string
              expect(() => new Date(fallback.timestamp)).not.toThrow();
              // Timestamp should be between before and after
              expect(fallback.timestamp >= beforeTime).toBe(true);
              expect(fallback.timestamp <= afterTime).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should create valid audit records with template info', () => {
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.integer({ min: 1, max: 100 }),
            (tenantId, modelConfigId, templateId, version) => {
              // Test the audit record creation
              const auditRequest = {
                promptTemplateId: templateId,
                promptVersion: version,
                renderedPrompt: 'test prompt',
                marketDataHash: 'abc123'
              };
              
              const auditResponse = {
                rawOutput: '{"test": true}',
                validatedOutput: { test: true },
                validationPassed: true,
                processingTimeMs: 100,
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
                costUsd: 0.001
              };
              
              const auditRecord = AIAnalysisService.createAuditRecord(
                tenantId,
                modelConfigId,
                'EXPLANATION',
                auditRequest,
                auditResponse
              );
              
              // Verify audit record contains template info
              expect(auditRecord.request.promptTemplateId).toBe(templateId);
              expect(auditRecord.request.promptVersion).toBe(version);
              expect(auditRecord.tenantId).toBe(tenantId);
              expect(auditRecord.modelConfigId).toBe(modelConfigId);
              expect(auditRecord.analysisType).toBe('EXPLANATION');
              expect(auditRecord.response.rawOutput).toBe('{"test": true}');
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });
