/**
 * Fund Allocation Service - manages fund allocation across AI models
 * 
 * This service provides business logic for managing fund allocations,
 * including validation of allocation rules, versioning, and retrieval.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { FundAllocation, ModelAllocation, AllocationValidation } from '../types/allocation';
import { AllocationRepository, CreateAllocationInput } from '../repositories/allocation';

/**
 * Validation error for allocation rules
 */
export class AllocationValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message);
    this.name = 'AllocationValidationError';
  }
}

/**
 * Result of allocation validation
 */
export interface AllocationValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Input for creating or updating an allocation
 */
export interface AllocationInput {
  allocations: ModelAllocation[];
  ensembleMode?: boolean;
}

/**
 * Fund Allocation Service
 */
export const AllocationService = {
  /**
   * Validate allocation rules
   * 
   * Rules:
   * - Total allocation percentages must equal 100%
   * - Number of models must be between 1 and 5
   * - Each individual allocation must be at least 10%
   * 
   * @param allocations - The model allocations to validate
   * @returns Validation result with any errors
   * 
   * Requirements: 5.1, 5.2, 5.4
   */
  validateAllocations(allocations: ModelAllocation[]): AllocationValidationResult {
    const errors: string[] = [];

    // Check model count (1-5)
    if (allocations.length < AllocationValidation.minModels) {
      errors.push(
        `Allocation must include at least ${AllocationValidation.minModels} model(s), got ${allocations.length}`
      );
    }

    if (allocations.length > AllocationValidation.maxModels) {
      errors.push(
        `Allocation cannot include more than ${AllocationValidation.maxModels} models, got ${allocations.length}`
      );
    }

    // Check minimum percentage per model (10%)
    for (const allocation of allocations) {
      if (allocation.percentage < AllocationValidation.minPercentagePerModel) {
        errors.push(
          `Model ${allocation.modelConfigId} has allocation ${allocation.percentage}%, minimum is ${AllocationValidation.minPercentagePerModel}%`
        );
      }
    }

    // Check total equals 100%
    const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);
    if (totalPercentage !== AllocationValidation.totalPercentage) {
      errors.push(
        `Total allocation must equal ${AllocationValidation.totalPercentage}%, got ${totalPercentage}%`
      );
    }

    // Check for duplicate model config IDs
    const modelConfigIds = allocations.map(a => a.modelConfigId);
    const uniqueIds = new Set(modelConfigIds);
    if (uniqueIds.size !== modelConfigIds.length) {
      errors.push('Duplicate model configuration IDs found in allocation');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Create a new fund allocation for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param input - The allocation input
   * @param createdBy - The user creating the allocation
   * @returns The created fund allocation
   * @throws AllocationValidationError if validation fails
   * 
   * Requirements: 5.1, 5.2, 5.4
   */
  async createAllocation(
    tenantId: string,
    strategyId: string,
    input: AllocationInput,
    createdBy: string
  ): Promise<FundAllocation> {
    // Validate allocations
    const validationResult = this.validateAllocations(input.allocations);
    if (!validationResult.valid) {
      throw new AllocationValidationError(
        'Invalid allocation configuration',
        validationResult.errors
      );
    }

    // Check if allocation already exists for this strategy
    const existing = await AllocationRepository.getLatestAllocation(tenantId, strategyId);
    if (existing) {
      throw new AllocationValidationError(
        'Allocation already exists for this strategy. Use updateAllocation to create a new version.',
        ['Allocation already exists']
      );
    }

    const createInput: CreateAllocationInput = {
      strategyId,
      allocations: input.allocations,
      ensembleMode: input.ensembleMode ?? (input.allocations.length > 1),
      createdBy
    };

    return AllocationRepository.createAllocation(tenantId, createInput);
  },

  /**
   * Get the current (latest) allocation for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The current fund allocation, or null if none exists
   */
  async getAllocation(
    tenantId: string,
    strategyId: string
  ): Promise<FundAllocation | null> {
    return AllocationRepository.getLatestAllocation(tenantId, strategyId);
  },

  /**
   * Get a specific version of an allocation
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param version - The version number
   * @returns The fund allocation, or null if not found
   */
  async getAllocationVersion(
    tenantId: string,
    strategyId: string,
    version: number
  ): Promise<FundAllocation | null> {
    return AllocationRepository.getAllocation(tenantId, strategyId, version);
  },

  /**
   * Update an allocation by creating a new version
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param input - The new allocation input
   * @param createdBy - The user creating the new version
   * @returns The new fund allocation version
   * @throws AllocationValidationError if validation fails
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4
   */
  async updateAllocation(
    tenantId: string,
    strategyId: string,
    input: AllocationInput,
    createdBy: string
  ): Promise<FundAllocation> {
    // Validate allocations
    const validationResult = this.validateAllocations(input.allocations);
    if (!validationResult.valid) {
      throw new AllocationValidationError(
        'Invalid allocation configuration',
        validationResult.errors
      );
    }

    return AllocationRepository.createNewVersion(
      tenantId,
      strategyId,
      input.allocations,
      input.ensembleMode ?? (input.allocations.length > 1),
      createdBy
    );
  },

  /**
   * Get the complete allocation history for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns List of all allocation versions, ordered by version ascending
   * 
   * Requirements: 5.3
   */
  async getAllocationHistory(
    tenantId: string,
    strategyId: string
  ): Promise<FundAllocation[]> {
    return AllocationRepository.getAllocationHistory(tenantId, strategyId);
  },

  /**
   * Delete all versions of an allocation for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   */
  async deleteAllocation(
    tenantId: string,
    strategyId: string
  ): Promise<void> {
    return AllocationRepository.deleteAllocation(tenantId, strategyId);
  },

  /**
   * Get the allocation percentage for a specific model
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param modelConfigId - The model configuration ID
   * @returns The allocation percentage, or null if not found
   * 
   * Requirements: 5.5
   */
  async getModelAllocationPercentage(
    tenantId: string,
    strategyId: string,
    modelConfigId: string
  ): Promise<number | null> {
    const allocation = await this.getAllocation(tenantId, strategyId);
    if (!allocation) {
      return null;
    }

    const modelAllocation = allocation.allocations.find(
      a => a.modelConfigId === modelConfigId
    );

    return modelAllocation?.percentage ?? null;
  },

  /**
   * Check if ensemble mode is enabled for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns True if ensemble mode is enabled, false otherwise
   */
  async isEnsembleModeEnabled(
    tenantId: string,
    strategyId: string
  ): Promise<boolean> {
    const allocation = await this.getAllocation(tenantId, strategyId);
    return allocation?.ensembleMode ?? false;
  },

  /**
   * Get all model config IDs in the current allocation
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns List of model configuration IDs
   */
  async getAllocatedModelIds(
    tenantId: string,
    strategyId: string
  ): Promise<string[]> {
    const allocation = await this.getAllocation(tenantId, strategyId);
    if (!allocation) {
      return [];
    }

    return allocation.allocations.map(a => a.modelConfigId);
  },

  /**
   * Calculate weighted allocation for ensemble results
   * 
   * @param allocations - The model allocations
   * @returns Map of modelConfigId to weight (0-1)
   */
  calculateWeights(allocations: ModelAllocation[]): Map<string, number> {
    const weights = new Map<string, number>();
    
    for (const allocation of allocations) {
      weights.set(allocation.modelConfigId, allocation.percentage / 100);
    }

    return weights;
  }
};
