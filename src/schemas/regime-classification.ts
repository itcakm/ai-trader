/**
 * JSON Schema for Market Regime Classification responses.
 * Validates AI model outputs for regime classification.
 */

export interface RegimeClassificationOutput {
  regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'UNCERTAIN';
  confidence: number;
  reasoning: string;
  supportingFactors?: string[];
}

export const RegimeClassificationSchema = {
  type: 'object',
  required: ['regime', 'confidence', 'reasoning'],
  properties: {
    regime: {
      type: 'string',
      enum: ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNCERTAIN']
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    reasoning: {
      type: 'string',
      minLength: 10
    },
    supportingFactors: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  additionalProperties: false
} as const;
