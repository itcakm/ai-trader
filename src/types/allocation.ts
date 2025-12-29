/**
 * Fund Allocation types for distributing trading capital across AI models.
 */

export interface ModelAllocation {
  modelConfigId: string;
  percentage: number; // 10-100, must sum to 100
  priority: number; // Tiebreaker when models disagree
}

export interface FundAllocation {
  allocationId: string;
  tenantId: string;
  strategyId: string;
  version: number;
  allocations: ModelAllocation[];
  ensembleMode: boolean;
  createdAt: string;
  createdBy: string;
}

// Validation rules for allocations
export const AllocationValidation = {
  minModels: 1,
  maxModels: 5,
  minPercentagePerModel: 10,
  totalPercentage: 100,
} as const;
