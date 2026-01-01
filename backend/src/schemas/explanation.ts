/**
 * JSON Schema for Strategy Explanation responses.
 * Validates AI model outputs for strategy explanations.
 */

export interface ExplanationFactorOutput {
  factor: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  weight?: number;
}

export interface ExplanationOutput {
  explanation: string;
  keyFactors: ExplanationFactorOutput[];
  riskAssessment?: string;
}

export const ExplanationFactorSchema = {
  type: 'object',
  required: ['factor', 'impact'],
  properties: {
    factor: { type: 'string' },
    impact: { type: 'string', enum: ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] },
    weight: { type: 'number', minimum: 0, maximum: 1 }
  },
  additionalProperties: false
} as const;

export const ExplanationSchema = {
  type: 'object',
  required: ['explanation', 'keyFactors'],
  properties: {
    explanation: {
      type: 'string',
      minLength: 50
    },
    keyFactors: {
      type: 'array',
      items: ExplanationFactorSchema
    },
    riskAssessment: {
      type: 'string'
    }
  },
  additionalProperties: false
} as const;
