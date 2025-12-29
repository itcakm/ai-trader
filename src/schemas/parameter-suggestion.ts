/**
 * JSON Schema for Parameter Suggestion responses.
 * Validates AI model outputs for strategy parameter suggestions.
 */

export interface ParameterSuggestionItemOutput {
  parameterName: string;
  currentValue: unknown;
  suggestedValue: unknown;
  rationale: string;
  expectedImpact: string;
  confidence: number;
}

export interface ParameterSuggestionOutput {
  suggestions: ParameterSuggestionItemOutput[];
  overallAssessment: string;
}

export const ParameterSuggestionItemSchema = {
  type: 'object',
  required: ['parameterName', 'currentValue', 'suggestedValue', 'rationale', 'expectedImpact', 'confidence'],
  properties: {
    parameterName: { type: 'string' },
    currentValue: {},
    suggestedValue: {},
    rationale: { type: 'string' },
    expectedImpact: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  additionalProperties: false
} as const;

export const ParameterSuggestionSchema = {
  type: 'object',
  required: ['suggestions', 'overallAssessment'],
  properties: {
    suggestions: {
      type: 'array',
      items: ParameterSuggestionItemSchema
    },
    overallAssessment: {
      type: 'string',
      minLength: 10
    }
  },
  additionalProperties: false
} as const;
