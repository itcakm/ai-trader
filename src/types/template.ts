/**
 * Hard bounds constraints for parameter validation
 */
export interface HardBounds {
  min?: number;
  max?: number;
  pattern?: string; // regex for string validation
}

/**
 * Definition of a configurable parameter within a strategy template
 */
export interface ParameterDefinition {
  name: string;
  dataType: 'number' | 'string' | 'boolean' | 'enum';
  defaultValue: ParameterValue;
  hardBounds?: HardBounds;
  required: boolean;
  description: string;
  enumValues?: string[];
}

/**
 * Possible types for parameter values
 */
export type ParameterValue = number | string | boolean;

/**
 * Strategy template - a reusable blueprint for trading strategies
 */
export interface StrategyTemplate {
  templateId: string;
  name: string;
  description: string;
  version: number;
  parameters: ParameterDefinition[];
  createdAt: string;
  updatedAt: string;
}
