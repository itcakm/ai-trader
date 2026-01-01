import { v4 as uuidv4 } from 'uuid';
import { 
  Deployment, 
  DeploymentConfig, 
  DeploymentState, 
  DeploymentMode 
} from '../types/deployment';
import { Strategy } from '../types/strategy';
import { ValidationResult } from '../types/validation';
import { DeploymentRepository } from '../repositories/deployment';
import { StrategyRepository } from '../repositories/strategy';
import { TemplateRepository } from '../repositories/template';
import { ResourceNotFoundError } from '../db/access';
import { validateDeployment } from './validation';

/**
 * Error thrown when validation fails
 */
export class DeploymentValidationError extends Error {
  public readonly validationResult: ValidationResult;

  constructor(message: string, validationResult: ValidationResult) {
    super(message);
    this.name = 'DeploymentValidationError';
    this.validationResult = validationResult;
  }
}

/**
 * Error thrown when template reference is invalid
 */
export class InvalidTemplateReferenceError extends Error {
  constructor(templateId: string, version?: number) {
    const versionInfo = version !== undefined ? ` version ${version}` : '';
    super(`Invalid template reference: template '${templateId}'${versionInfo} not found`);
    this.name = 'InvalidTemplateReferenceError';
  }
}

/**
 * Error thrown when an invalid state transition is attempted
 */
export class InvalidStateTransitionError extends Error {
  constructor(currentState: DeploymentState, targetState: DeploymentState) {
    super(`Invalid state transition from '${currentState}' to '${targetState}'`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Risk control parameters required for LIVE deployment
 */
export interface RiskControls {
  maxPositionSize?: number;
  maxDailyLoss?: number;
  maxDrawdown?: number;
}

/**
 * Valid state transitions map
 * Defines which states can transition to which other states
 */
const VALID_STATE_TRANSITIONS: Record<DeploymentState, DeploymentState[]> = {
  'PENDING': ['RUNNING', 'STOPPED', 'ERROR'],
  'RUNNING': ['PAUSED', 'STOPPED', 'COMPLETED', 'ERROR'],
  'PAUSED': ['RUNNING', 'STOPPED'],
  'STOPPED': [], // Terminal state
  'COMPLETED': [], // Terminal state
  'ERROR': ['STOPPED'] // Can only stop from error state
};

/**
 * Deployment Service - manages deployment lifecycle operations
 * 
 * Provides functionality for deploying strategies in different modes (BACKTEST, PAPER, LIVE)
 * with mode-specific validation and state management.
 * 
 * Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.7
 */
export const DeploymentService = {
  /**
   * Deploy a strategy with mode-specific validation
   * 
   * Requirements: 4.1, 4.2, 4.4
   * 
   * @param tenantId - The tenant identifier
   * @param config - The deployment configuration
   * @param riskControls - Risk controls (required for LIVE mode)
   * @returns The newly created deployment
   * @throws ResourceNotFoundError if strategy doesn't exist
   * @throws InvalidTemplateReferenceError if strategy's template reference is invalid
   * @throws DeploymentValidationError if deployment validation fails
   */
  async deploy(
    tenantId: string,
    config: DeploymentConfig,
    riskControls?: RiskControls
  ): Promise<Deployment> {
    // Get the strategy to deploy
    const strategy = await StrategyRepository.getStrategy(tenantId, config.strategyId);
    
    if (!strategy) {
      throw new ResourceNotFoundError('Strategy', config.strategyId);
    }

    // Validate template reference (Requirement 6.3)
    const template = await TemplateRepository.getTemplateVersion(
      strategy.templateId,
      strategy.templateVersion
    );

    if (!template) {
      throw new InvalidTemplateReferenceError(strategy.templateId, strategy.templateVersion);
    }

    // Validate deployment configuration based on mode
    const validationResult = validateDeployment(config, strategy, riskControls);
    
    if (!validationResult.valid) {
      throw new DeploymentValidationError(
        'Deployment validation failed',
        validationResult
      );
    }

    const now = new Date().toISOString();
    const deploymentId = uuidv4();

    const deployment: Deployment = {
      deploymentId,
      strategyId: config.strategyId,
      tenantId,
      mode: config.mode,
      state: 'PENDING' as DeploymentState,
      strategyVersion: strategy.currentVersion,
      config,
      createdAt: now,
      updatedAt: now
    };

    await DeploymentRepository.putDeployment(tenantId, deployment);

    return deployment;
  },

  /**
   * Get a deployment by ID
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The deployment identifier
   * @returns The deployment
   * @throws ResourceNotFoundError if deployment doesn't exist
   */
  async getDeployment(tenantId: string, deploymentId: string): Promise<Deployment> {
    const deployment = await DeploymentRepository.getDeployment(tenantId, deploymentId);
    
    if (!deployment) {
      throw new ResourceNotFoundError('Deployment', deploymentId);
    }

    return deployment;
  },

  /**
   * Update deployment state with transition validation
   * 
   * Requirements: 4.5, 4.6, 4.7
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The deployment identifier
   * @param newState - The target state
   * @returns The updated deployment
   * @throws ResourceNotFoundError if deployment doesn't exist
   * @throws InvalidStateTransitionError if state transition is not allowed
   */
  async updateState(
    tenantId: string,
    deploymentId: string,
    newState: DeploymentState
  ): Promise<Deployment> {
    const deployment = await this.getDeployment(tenantId, deploymentId);
    
    // Validate state transition
    const allowedTransitions = VALID_STATE_TRANSITIONS[deployment.state];
    
    if (!allowedTransitions.includes(newState)) {
      throw new InvalidStateTransitionError(deployment.state, newState);
    }

    return await DeploymentRepository.updateDeployment(tenantId, deploymentId, {
      state: newState
    });
  },

  /**
   * List all deployments for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy ID to filter by
   * @returns List of deployments
   */
  async listDeployments(
    tenantId: string,
    strategyId?: string
  ): Promise<Deployment[]> {
    if (strategyId) {
      const result = await DeploymentRepository.listDeploymentsByStrategy({
        tenantId,
        strategyId
      });
      return result.items;
    }

    const result = await DeploymentRepository.listDeployments({ tenantId });
    return result.items;
  },

  /**
   * Pause a running deployment
   * 
   * Halts strategy execution while preserving current positions.
   * 
   * Requirements: 4.6
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The deployment identifier
   * @returns The updated deployment
   * @throws ResourceNotFoundError if deployment doesn't exist
   * @throws InvalidStateTransitionError if deployment is not in RUNNING state
   */
  async pause(tenantId: string, deploymentId: string): Promise<Deployment> {
    return await this.updateState(tenantId, deploymentId, 'PAUSED');
  },

  /**
   * Resume a paused deployment
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The deployment identifier
   * @returns The updated deployment
   * @throws ResourceNotFoundError if deployment doesn't exist
   * @throws InvalidStateTransitionError if deployment is not in PAUSED state
   */
  async resume(tenantId: string, deploymentId: string): Promise<Deployment> {
    return await this.updateState(tenantId, deploymentId, 'RUNNING');
  },

  /**
   * Stop a deployment
   * 
   * Terminates strategy execution.
   * 
   * Requirements: 4.7
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The deployment identifier
   * @returns The updated deployment
   * @throws ResourceNotFoundError if deployment doesn't exist
   * @throws InvalidStateTransitionError if deployment cannot be stopped from current state
   */
  async stop(tenantId: string, deploymentId: string): Promise<Deployment> {
    return await this.updateState(tenantId, deploymentId, 'STOPPED');
  },

  /**
   * Check if a state transition is valid
   * 
   * @param currentState - The current deployment state
   * @param targetState - The target state
   * @returns True if the transition is valid
   */
  isValidStateTransition(
    currentState: DeploymentState,
    targetState: DeploymentState
  ): boolean {
    const allowedTransitions = VALID_STATE_TRANSITIONS[currentState];
    return allowedTransitions.includes(targetState);
  }
};
