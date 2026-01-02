/**
 * Strategy types for the frontend
 */

/**
 * Operational status of a strategy
 */
export type StrategyState = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'ERROR';

/**
 * Possible types for parameter values
 */
export type ParameterValue = number | string | boolean;

/**
 * Hard bounds constraints for parameter validation
 */
export interface HardBounds {
  min?: number;
  max?: number;
  pattern?: string;
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

/**
 * A user's configured trading strategy based on a template
 */
export interface Strategy {
  strategyId: string;
  tenantId: string;
  name: string;
  templateId: string;
  templateVersion: number;
  parameters: Record<string, ParameterValue>;
  currentVersion: number;
  state: StrategyState;
  createdAt: string;
  updatedAt: string;
}

/**
 * An immutable snapshot of a strategy configuration at a point in time
 */
export interface StrategyVersion {
  strategyId: string;
  version: number;
  parameters: Record<string, ParameterValue>;
  createdAt: string;
  createdBy: string;
  changeDescription?: string;
}

/**
 * Strategy performance metrics
 */
export interface StrategyPerformance {
  strategyId: string;
  totalTrades: number;
  winRate: number;
  profitLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  lastUpdated: string;
}

/**
 * Strategy deployment configuration
 */
export interface StrategyDeployment {
  strategyId: string;
  environment: 'paper' | 'live';
  allocatedCapital: number;
  maxPositionSize: number;
  riskLimit: number;
  deployedAt: string;
  deployedBy: string;
}

/**
 * Form data for creating/editing a strategy
 */
export interface StrategyFormData {
  name: string;
  templateId: string;
  parameters: Record<string, ParameterValue>;
}

/**
 * Strategy status badge variant mapping
 */
export const strategyStateVariant: Record<StrategyState, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  PAUSED: 'warning',
  STOPPED: 'info',
  ERROR: 'error',
};
