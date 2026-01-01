/**
 * Property-based tests for Schema Validator Service
 * Feature: ai-assisted-intelligence, Property 18: Schema Validation Completeness
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import * as fc from 'fast-check';
import { SchemaValidator } from './schema-validator';
import { RegimeClassificationOutput } from '../schemas/regime-classification';
import { ExplanationOutput, ExplanationFactorOutput } from '../schemas/explanation';
import { ParameterSuggestionOutput, ParameterSuggestionItemOutput } from '../schemas/parameter-suggestion';

// Generators for valid outputs
const validRegimeArb = (): fc.Arbitrary<RegimeClassificationOutput['regime']> =>
  fc.constantFrom('TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNCERTAIN');

const validConfidenceArb = (): fc.Arbitrary<number> =>
  fc.double({ min: 0, max: 1, noNaN: true });

const validReasoningArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 10, maxLength: 500 });

const validRegimeClassificationArb = (): fc.Arbitrary<RegimeClassificationOutput> =>
  fc.record({
    regime: validRegimeArb(),
    confidence: validConfidenceArb(),
    reasoning: validReasoningArb(),
    supportingFactors: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }), { nil: undefined })
  });

const validExplanationFactorArb = (): fc.Arbitrary<ExplanationFactorOutput> =>
  fc.record({
    factor: fc.string({ minLength: 1, maxLength: 100 }),
    impact: fc.constantFrom('POSITIVE', 'NEGATIVE', 'NEUTRAL'),
    weight: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined })
  });

const validExplanationArb = (): fc.Arbitrary<ExplanationOutput> =>
  fc.record({
    explanation: fc.string({ minLength: 50, maxLength: 1000 }),
    keyFactors: fc.array(validExplanationFactorArb(), { minLength: 0, maxLength: 10 }),
    riskAssessment: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined })
  });

const validParameterSuggestionItemArb = (): fc.Arbitrary<ParameterSuggestionItemOutput> =>
  fc.record({
    parameterName: fc.string({ minLength: 1, maxLength: 50 }),
    currentValue: fc.oneof(fc.double({ noNaN: true }), fc.string(), fc.boolean()),
    suggestedValue: fc.oneof(fc.double({ noNaN: true }), fc.string(), fc.boolean()),
    rationale: fc.string({ minLength: 1, maxLength: 500 }),
    expectedImpact: fc.string({ minLength: 1, maxLength: 200 }),
    confidence: fc.double({ min: 0, max: 1, noNaN: true })
  });

const validParameterSuggestionArb = (): fc.Arbitrary<ParameterSuggestionOutput> =>
  fc.record({
    suggestions: fc.array(validParameterSuggestionItemArb(), { minLength: 0, maxLength: 10 }),
    overallAssessment: fc.string({ minLength: 10, maxLength: 500 })
  });

// Generators for invalid outputs
const invalidRegimeArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
    !['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNCERTAIN'].includes(s)
  );

const invalidConfidenceArb = (): fc.Arbitrary<number> =>
  fc.oneof(
    fc.double({ min: -1000, max: -0.001, noNaN: true }),
    fc.double({ min: 1.001, max: 1000, noNaN: true })
  );

const invalidImpactArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
    !['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(s)
  );

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('Property 18: Schema Validation Completeness', () => {
    /**
     * Property 18: Schema Validation Completeness
     * For any AI output type (Market_Regime, Explanation, Parameter_Suggestion),
     * the Schema_Validator SHALL validate against the corresponding schema,
     * AND validation failures SHALL include the specific field path and error message.
     * Validates: Requirements 9.1, 9.2, 9.3
     */

    describe('Market_Regime validation', () => {
      it('should accept all valid regime classification outputs', () => {
        fc.assert(
          fc.property(validRegimeClassificationArb(), (output) => {
            const result = validator.validateRegimeClassification(output);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.parsedOutput).toBeDefined();
          }),
          { numRuns: 100 }
        );
      });

      it('should reject outputs with invalid regime values and provide field path', () => {
        fc.assert(
          fc.property(
            invalidRegimeArb(),
            validConfidenceArb(),
            validReasoningArb(),
            (regime, confidence, reasoning) => {
              const output = { regime, confidence, reasoning };
              const result = validator.validateRegimeClassification(output);
              
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              
              // Should include field path for regime
              const regimeError = result.errors.find(e => e.path.includes('regime'));
              expect(regimeError).toBeDefined();
              expect(regimeError?.message).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject outputs with invalid confidence values and provide field path', () => {
        fc.assert(
          fc.property(
            validRegimeArb(),
            invalidConfidenceArb(),
            validReasoningArb(),
            (regime, confidence, reasoning) => {
              const output = { regime, confidence, reasoning };
              const result = validator.validateRegimeClassification(output);
              
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              
              // Should include field path for confidence
              const confidenceError = result.errors.find(e => e.path.includes('confidence'));
              expect(confidenceError).toBeDefined();
              expect(confidenceError?.message).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject outputs with missing required fields and provide field path', () => {
        fc.assert(
          fc.property(
            fc.constantFrom('regime', 'confidence', 'reasoning'),
            validRegimeClassificationArb(),
            (missingField, validOutput) => {
              const output = { ...validOutput };
              delete (output as Record<string, unknown>)[missingField];
              
              const result = validator.validateRegimeClassification(output);
              
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              expect(result.errors[0].message).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Explanation validation', () => {
      it('should accept all valid explanation outputs', () => {
        fc.assert(
          fc.property(validExplanationArb(), (output) => {
            const result = validator.validateExplanation(output);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.parsedOutput).toBeDefined();
          }),
          { numRuns: 100 }
        );
      });

      it('should reject outputs with invalid impact values and provide field path', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 50, maxLength: 200 }),
            invalidImpactArb(),
            (explanation, invalidImpact) => {
              const output = {
                explanation,
                keyFactors: [{ factor: 'test', impact: invalidImpact }]
              };
              const result = validator.validateExplanation(output);
              
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              
              // Should include field path for impact
              const impactError = result.errors.find(e => e.path.includes('impact'));
              expect(impactError).toBeDefined();
              expect(impactError?.message).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject outputs with explanation too short and provide field path', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 49 }),
            (shortExplanation) => {
              const output = {
                explanation: shortExplanation,
                keyFactors: []
              };
              const result = validator.validateExplanation(output);
              
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              
              // Should include field path for explanation
              const explanationError = result.errors.find(e => e.path.includes('explanation'));
              expect(explanationError).toBeDefined();
              expect(explanationError?.message).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Parameter_Suggestion validation', () => {
      it('should accept all valid parameter suggestion outputs', () => {
        fc.assert(
          fc.property(validParameterSuggestionArb(), (output) => {
            const result = validator.validateParameterSuggestion(output);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.parsedOutput).toBeDefined();
          }),
          { numRuns: 100 }
        );
      });

      it('should reject outputs with invalid confidence in suggestions and provide field path', () => {
        fc.assert(
          fc.property(
            invalidConfidenceArb(),
            (invalidConfidence) => {
              const output = {
                suggestions: [{
                  parameterName: 'testParam',
                  currentValue: 10,
                  suggestedValue: 20,
                  rationale: 'test rationale',
                  expectedImpact: 'positive impact',
                  confidence: invalidConfidence
                }],
                overallAssessment: 'This is an overall assessment of the suggestions'
              };
              const result = validator.validateParameterSuggestion(output);
              
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              
              // Should include field path for confidence
              const confidenceError = result.errors.find(e => e.path.includes('confidence'));
              expect(confidenceError).toBeDefined();
              expect(confidenceError?.message).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject outputs with overallAssessment too short and provide field path', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 9 }),
            (shortAssessment) => {
              const output = {
                suggestions: [],
                overallAssessment: shortAssessment
              };
              const result = validator.validateParameterSuggestion(output);
              
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              
              // Should include field path for overallAssessment
              const assessmentError = result.errors.find(e => e.path.includes('overallAssessment'));
              expect(assessmentError).toBeDefined();
              expect(assessmentError?.message).toBeDefined();
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('JSON string parsing', () => {
      it('should handle valid JSON strings for all output types', () => {
        fc.assert(
          fc.property(validRegimeClassificationArb(), (output) => {
            const jsonString = JSON.stringify(output);
            const result = validator.validateRegimeClassification(jsonString);
            expect(result.valid).toBe(true);
            expect(result.parsedOutput).toEqual(output);
          }),
          { numRuns: 100 }
        );
      });

      it('should reject invalid JSON strings with parse error', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
              try { JSON.parse(s); return false; } catch { return true; }
            }),
            (invalidJson) => {
              const result = validator.validateRegimeClassification(invalidJson);
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              expect(result.errors[0].keyword).toBe('parse');
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });
});
