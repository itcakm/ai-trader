import { ParameterValue } from './template';

/**
 * Operational status of a strategy
 */
export type StrategyState = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'ERROR';

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

// Re-export ParameterValue for convenience
export { ParameterValue } from './template';
