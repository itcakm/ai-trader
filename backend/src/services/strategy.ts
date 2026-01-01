import { v4 as uuidv4 } from 'uuid';
import { Strategy, StrategyState, StrategyVersion, ParameterValue } from '../types/strategy';
import { StrategyTemplate } from '../types/template';
import { ValidationResult } from '../types/validation';
import { StrategyRepository } from '../repositories/strategy';
import { TemplateRepository } from '../repositories/template';
import { VersionRepository } from '../repositories/version';
import { ResourceNotFoundError } from '../db/access';
import { validateParameter, validateStrategy } from './validation';

/**
 * Error thrown when validation fails
 */
export class ValidationFailedError extends Error {
  public readonly validationResult: ValidationResult;

  constructor(message: string, validationResult: ValidationResult) {
    super(message);
    this.name = 'ValidationFailedError';
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
 * Strategy Service - manages strategy lifecycle operations
 * 
 * Provides functionality for creating, configuring, and managing trading strategies
 * based on templates with parameter validation.
 */
export const StrategyService = {
  /**
   * Create a new strategy from a template
   * 
   * Initializes all parameters with their default values from the template.
   * 
   * Requirements: 2.1
   * 
   * @param tenantId - The tenant identifier
   * @param templateId - The template to base the strategy on
   * @param name - The name for the new strategy
   * @returns The newly created strategy
   * @throws ResourceNotFoundError if template doesn't exist
   */
  async createStrategy(
    tenantId: string,
    templateId: string,
    name: string
  ): Promise<Strategy> {
    // Get the latest version of the template
    const template = await TemplateRepository.getTemplate(templateId);
    
    if (!template) {
      throw new ResourceNotFoundError('Template', templateId);
    }

    // Initialize parameters with default values from template
    const parameters: Record<string, ParameterValue> = {};
    for (const paramDef of template.parameters) {
      parameters[paramDef.name] = paramDef.defaultValue;
    }

    const now = new Date().toISOString();
    const strategyId = uuidv4();
    
    const strategy: Strategy = {
      strategyId,
      tenantId,
      name,
      templateId: template.templateId,
      templateVersion: template.version,
      parameters,
      currentVersion: 1,
      state: 'DRAFT' as StrategyState,
      createdAt: now,
      updatedAt: now
    };

    await StrategyRepository.putStrategy(tenantId, strategy);

    // Create initial version (version 1)
    await VersionRepository.createVersion(
      strategyId,
      parameters,
      tenantId,
      'Initial strategy creation'
    );

    return strategy;
  },

  /**
   * Get a strategy by ID
   * 
   * Requirements: 2.6
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The strategy
   * @throws ResourceNotFoundError if strategy doesn't exist
   */
  async getStrategy(tenantId: string, strategyId: string): Promise<Strategy> {
    const strategy = await StrategyRepository.getStrategy(tenantId, strategyId);
    
    if (!strategy) {
      throw new ResourceNotFoundError('Strategy', strategyId);
    }

    return strategy;
  },

  /**
   * Update strategy parameters with validation
   * 
   * Validates each parameter against its definition in the template.
   * Rejects invalid values and preserves original on failure.
   * 
   * Requirements: 2.2, 2.3
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param parameters - The parameters to update
   * @returns The updated strategy
   * @throws ResourceNotFoundError if strategy or template doesn't exist
   * @throws ValidationFailedError if parameter validation fails
   */
  async updateParameters(
    tenantId: string,
    strategyId: string,
    parameters: Record<string, ParameterValue>,
    changeDescription?: string
  ): Promise<Strategy> {
    // Get the existing strategy
    const strategy = await this.getStrategy(tenantId, strategyId);

    // Get the template for validation
    const template = await TemplateRepository.getTemplateVersion(
      strategy.templateId,
      strategy.templateVersion
    );

    if (!template) {
      throw new InvalidTemplateReferenceError(strategy.templateId, strategy.templateVersion);
    }

    // Validate each parameter being updated
    const errors: ValidationResult['errors'] = [];
    
    for (const [paramName, value] of Object.entries(parameters)) {
      const paramDef = template.parameters.find(p => p.name === paramName);
      
      if (!paramDef) {
        errors.push({
          field: paramName,
          code: 'UNKNOWN_PARAMETER',
          message: `Parameter "${paramName}" is not defined in template`
        });
        continue;
      }

      const result = validateParameter(value, paramDef);
      if (!result.valid) {
        errors.push(...result.errors);
      }
    }

    if (errors.length > 0) {
      throw new ValidationFailedError(
        'Parameter validation failed',
        { valid: false, errors }
      );
    }

    // Merge new parameters with existing ones
    const updatedParameters = {
      ...strategy.parameters,
      ...parameters
    };

    // Validate the complete strategy (including parameter combinations)
    const updatedStrategy: Strategy = {
      ...strategy,
      parameters: updatedParameters
    };

    const fullValidation = validateStrategy(updatedStrategy, template);
    if (!fullValidation.valid) {
      throw new ValidationFailedError(
        'Strategy validation failed',
        fullValidation
      );
    }

    const newVersion = strategy.currentVersion + 1;

    // Create a new version before updating the strategy
    await VersionRepository.createVersion(
      strategyId,
      updatedParameters,
      tenantId,
      changeDescription
    );

    // Save the updated strategy with incremented version
    return await StrategyRepository.updateStrategy(tenantId, strategyId, {
      parameters: updatedParameters,
      currentVersion: newVersion
    });
  },

  /**
   * List all strategies for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns List of strategies
   */
  async listStrategies(tenantId: string): Promise<Strategy[]> {
    const result = await StrategyRepository.listStrategies({ tenantId });
    return result.items;
  },

  /**
   * Validate that a strategy's template reference is valid
   * 
   * Requirements: 2.5, 6.3
   * 
   * @param strategy - The strategy to validate
   * @returns True if template reference is valid
   * @throws InvalidTemplateReferenceError if template reference is invalid
   */
  async validateTemplateReference(strategy: Strategy): Promise<boolean> {
    const template = await TemplateRepository.getTemplateVersion(
      strategy.templateId,
      strategy.templateVersion
    );

    if (!template) {
      throw new InvalidTemplateReferenceError(strategy.templateId, strategy.templateVersion);
    }

    return true;
  },

  /**
   * Get a strategy with template reference validation
   * 
   * Requirements: 2.5, 6.3
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The strategy with validated template reference
   * @throws ResourceNotFoundError if strategy doesn't exist
   * @throws InvalidTemplateReferenceError if template reference is invalid
   */
  async getStrategyWithValidation(
    tenantId: string,
    strategyId: string
  ): Promise<Strategy> {
    const strategy = await this.getStrategy(tenantId, strategyId);
    await this.validateTemplateReference(strategy);
    return strategy;
  },

  /**
   * Get version history for a strategy
   * 
   * Requirements: 3.3, 3.4
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns All versions ordered by creation time ascending
   * @throws ResourceNotFoundError if strategy doesn't exist
   */
  async getVersionHistory(
    tenantId: string,
    strategyId: string
  ): Promise<StrategyVersion[]> {
    // Verify the strategy exists and belongs to this tenant
    await this.getStrategy(tenantId, strategyId);
    
    return await VersionRepository.getVersionHistory(strategyId);
  },

  /**
   * Get a specific version of a strategy
   * 
   * Requirements: 3.4
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param version - The version number to retrieve
   * @returns The strategy version
   * @throws ResourceNotFoundError if strategy or version doesn't exist
   */
  async getVersion(
    tenantId: string,
    strategyId: string,
    version: number
  ): Promise<StrategyVersion> {
    // Verify the strategy exists and belongs to this tenant
    await this.getStrategy(tenantId, strategyId);
    
    const strategyVersion = await VersionRepository.getVersion(strategyId, version);
    
    if (!strategyVersion) {
      throw new ResourceNotFoundError('StrategyVersion', `${strategyId}:v${version}`);
    }
    
    return strategyVersion;
  },

  /**
   * Rollback a strategy to a previous version
   * 
   * Creates a new version with the configuration from the target version.
   * 
   * Requirements: 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param targetVersion - The version number to rollback to
   * @returns The updated strategy with new version
   * @throws ResourceNotFoundError if strategy or target version doesn't exist
   */
  async rollbackToVersion(
    tenantId: string,
    strategyId: string,
    targetVersion: number
  ): Promise<Strategy> {
    // Verify the strategy exists and belongs to this tenant
    const strategy = await this.getStrategy(tenantId, strategyId);
    
    // Get the target version to rollback to
    const targetVersionData = await VersionRepository.getVersion(strategyId, targetVersion);
    
    if (!targetVersionData) {
      throw new ResourceNotFoundError('StrategyVersion', `${strategyId}:v${targetVersion}`);
    }
    
    const newVersionNumber = strategy.currentVersion + 1;
    
    // Create a new version with the rolled-back configuration
    await VersionRepository.createVersion(
      strategyId,
      targetVersionData.parameters,
      tenantId,
      `Rollback to version ${targetVersion}`
    );
    
    // Update the strategy with the rolled-back parameters
    return await StrategyRepository.updateStrategy(tenantId, strategyId, {
      parameters: { ...targetVersionData.parameters },
      currentVersion: newVersionNumber
    });
  }
};
