/**
 * Deployment execution modes
 */
export type DeploymentMode = 'BACKTEST' | 'PAPER' | 'LIVE';

/**
 * Operational state of a deployment
 */
export type DeploymentState = 'PENDING' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED' | 'ERROR';

/**
 * Configuration for backtest mode deployments
 */
export interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
}

/**
 * Configuration for deploying a strategy
 */
export interface DeploymentConfig {
  strategyId: string;
  mode: DeploymentMode;
  backtestConfig?: BacktestConfig;
}

/**
 * A deployed instance of a strategy
 */
export interface Deployment {
  deploymentId: string;
  strategyId: string;
  tenantId: string;
  mode: DeploymentMode;
  state: DeploymentState;
  strategyVersion: number;
  config: DeploymentConfig;
  createdAt: string;
  updatedAt: string;
}
