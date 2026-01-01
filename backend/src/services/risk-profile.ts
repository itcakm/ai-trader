import { generateUUID } from '../utils/uuid';
import { RiskProfileRepository, StrategyProfileAssignment } from '../repositories/risk-profile';
import {
  RiskProfile,
  RiskProfileInput,
  ValidationResult,
  PositionLimitConfig,
  ExchangeSafeguardConfig
} from '../types/risk-profile';
import { DrawdownConfig } from '../types/drawdown';
import { VolatilityConfig } from '../types/volatility';
import { CircuitBreakerCondition } from '../types/circuit-breaker';

/**
 * Applied Risk Profile - the result of applying a profile with optional overrides
 */
export interface AppliedRiskProfile {
  profileId: string;
  profileVersion: number;
  strategyId: string;
  positionLimits: PositionLimitConfig[];
  drawdownConfig: Omit<DrawdownConfig, 'configId' | 'tenantId'>;
  volatilityConfig: Omit<VolatilityConfig, 'configId' | 'tenantId'>;
  circuitBreakers: CircuitBreakerCondition[];
  exchangeSafeguards: ExchangeSafeguardConfig;
  appliedAt: string;
}

/**
 * Strategy-specific overrides for a risk profile
 */
export interface RiskProfileOverrides {
  positionLimits?: PositionLimitConfig[];
  drawdownConfig?: Partial<Omit<DrawdownConfig, 'configId' | 'tenantId'>>;
  volatilityConfig?: Partial<Omit<VolatilityConfig, 'configId' | 'tenantId'>>;
  circuitBreakers?: CircuitBreakerCondition[];
  exchangeSafeguards?: Partial<ExchangeSafeguardConfig>;
}

/**
 * Risk Profile Service Interface
 * Requirements: 8.1, 8.2, 8.3
 */
export interface RiskProfileServiceInterface {
  createProfile(tenantId: string, profile: RiskProfileInput): Promise<RiskProfile>;
  getProfile(tenantId: string, profileId: string): Promise<RiskProfile | null>;
  updateProfile(tenantId: string, profileId: string, updates: Partial<RiskProfileInput>): Promise<RiskProfile>;
  listProfiles(tenantId: string): Promise<RiskProfile[]>;
  assignToStrategy(tenantId: string, strategyId: string, profileId: string): Promise<void>;
  getProfileHistory(tenantId: string, profileId: string): Promise<RiskProfile[]>;
  validateProfile(profile: RiskProfileInput): ValidationResult;
  getAppliedProfile(tenantId: string, strategyId: string, overrides?: RiskProfileOverrides): Promise<AppliedRiskProfile | null>;
  getStrategyAssignment(tenantId: string, strategyId: string): Promise<StrategyProfileAssignment | null>;
}

/**
 * Validate position limit configurations
 */
function validatePositionLimits(limits: PositionLimitConfig[]): string[] {
  const errors: string[] = [];
  
  for (let i = 0; i < limits.length; i++) {
    const limit = limits[i];
    
    if (limit.maxValue <= 0) {
      errors.push(`Position limit ${i + 1}: maxValue must be positive`);
    }
    
    if (limit.limitType === 'PERCENTAGE' && limit.maxValue > 100) {
      errors.push(`Position limit ${i + 1}: percentage limit cannot exceed 100%`);
    }
    
    if (limit.scope === 'ASSET' && !limit.assetId) {
      errors.push(`Position limit ${i + 1}: assetId required for ASSET scope`);
    }
  }
  
  return errors;
}

/**
 * Validate drawdown configuration
 */
function validateDrawdownConfig(config: Omit<DrawdownConfig, 'configId' | 'tenantId'>): string[] {
  const errors: string[] = [];
  
  if (config.warningThresholdPercent <= 0 || config.warningThresholdPercent >= 100) {
    errors.push('Drawdown warning threshold must be between 0 and 100');
  }
  
  if (config.maxThresholdPercent <= 0 || config.maxThresholdPercent >= 100) {
    errors.push('Drawdown max threshold must be between 0 and 100');
  }
  
  if (config.warningThresholdPercent >= config.maxThresholdPercent) {
    errors.push('Drawdown warning threshold must be less than max threshold');
  }
  
  if (config.cooldownMinutes < 0) {
    errors.push('Drawdown cooldown minutes cannot be negative');
  }
  
  return errors;
}

/**
 * Validate volatility configuration
 */
function validateVolatilityConfig(config: Omit<VolatilityConfig, 'configId' | 'tenantId'>): string[] {
  const errors: string[] = [];
  
  if (config.normalThreshold < 0) {
    errors.push('Volatility normal threshold cannot be negative');
  }
  
  if (config.highThreshold <= config.normalThreshold) {
    errors.push('Volatility high threshold must be greater than normal threshold');
  }
  
  if (config.extremeThreshold <= config.highThreshold) {
    errors.push('Volatility extreme threshold must be greater than high threshold');
  }
  
  if (config.highThrottlePercent < 0 || config.highThrottlePercent > 100) {
    errors.push('Volatility high throttle percent must be between 0 and 100');
  }
  
  if (config.extremeThrottlePercent < 0 || config.extremeThrottlePercent > 100) {
    errors.push('Volatility extreme throttle percent must be between 0 and 100');
  }
  
  if (config.cooldownMinutes < 0) {
    errors.push('Volatility cooldown minutes cannot be negative');
  }
  
  return errors;
}

/**
 * Validate circuit breaker conditions
 */
function validateCircuitBreakers(breakers: CircuitBreakerCondition[]): string[] {
  const errors: string[] = [];
  
  for (let i = 0; i < breakers.length; i++) {
    const breaker = breakers[i];
    
    switch (breaker.type) {
      case 'LOSS_RATE':
        if (breaker.lossPercent <= 0 || breaker.lossPercent > 100) {
          errors.push(`Circuit breaker ${i + 1}: loss percent must be between 0 and 100`);
        }
        if (breaker.timeWindowMinutes <= 0) {
          errors.push(`Circuit breaker ${i + 1}: time window must be positive`);
        }
        break;
      case 'CONSECUTIVE_FAILURES':
        if (breaker.count <= 0) {
          errors.push(`Circuit breaker ${i + 1}: failure count must be positive`);
        }
        break;
      case 'PRICE_DEVIATION':
        if (breaker.deviationPercent <= 0) {
          errors.push(`Circuit breaker ${i + 1}: deviation percent must be positive`);
        }
        if (breaker.timeWindowMinutes <= 0) {
          errors.push(`Circuit breaker ${i + 1}: time window must be positive`);
        }
        break;
      case 'ERROR_RATE':
        if (breaker.errorPercent <= 0 || breaker.errorPercent > 100) {
          errors.push(`Circuit breaker ${i + 1}: error percent must be between 0 and 100`);
        }
        if (breaker.sampleSize <= 0) {
          errors.push(`Circuit breaker ${i + 1}: sample size must be positive`);
        }
        break;
    }
  }
  
  return errors;
}

/**
 * Validate exchange safeguard configuration
 */
function validateExchangeSafeguards(config: ExchangeSafeguardConfig): string[] {
  const errors: string[] = [];
  
  if (config.minOrderSize < 0) {
    errors.push('Exchange min order size cannot be negative');
  }
  
  if (config.maxOrderSize <= 0) {
    errors.push('Exchange max order size must be positive');
  }
  
  if (config.minOrderSize >= config.maxOrderSize) {
    errors.push('Exchange min order size must be less than max order size');
  }
  
  if (config.maxPriceDeviationPercent <= 0) {
    errors.push('Exchange max price deviation must be positive');
  }
  
  if (config.rateLimitBuffer < 0 || config.rateLimitBuffer > 100) {
    errors.push('Exchange rate limit buffer must be between 0 and 100');
  }
  
  if (config.connectionTimeoutMs <= 0) {
    errors.push('Exchange connection timeout must be positive');
  }
  
  if (config.maxRetries < 0) {
    errors.push('Exchange max retries cannot be negative');
  }
  
  return errors;
}

/**
 * Apply overrides to a base profile configuration
 * Strategy-specific overrides take precedence over profile defaults
 * Requirements: 8.3
 */
function applyOverrides(
  profile: RiskProfile,
  overrides?: RiskProfileOverrides
): AppliedRiskProfile {
  const now = new Date().toISOString();
  
  if (!overrides) {
    return {
      profileId: profile.profileId,
      profileVersion: profile.version,
      strategyId: '', // Will be set by caller
      positionLimits: profile.positionLimits,
      drawdownConfig: profile.drawdownConfig,
      volatilityConfig: profile.volatilityConfig,
      circuitBreakers: profile.circuitBreakers,
      exchangeSafeguards: profile.exchangeSafeguards,
      appliedAt: now
    };
  }
  
  return {
    profileId: profile.profileId,
    profileVersion: profile.version,
    strategyId: '', // Will be set by caller
    positionLimits: overrides.positionLimits ?? profile.positionLimits,
    drawdownConfig: {
      ...profile.drawdownConfig,
      ...overrides.drawdownConfig
    },
    volatilityConfig: {
      ...profile.volatilityConfig,
      ...overrides.volatilityConfig
    },
    circuitBreakers: overrides.circuitBreakers ?? profile.circuitBreakers,
    exchangeSafeguards: {
      ...profile.exchangeSafeguards,
      ...overrides.exchangeSafeguards
    },
    appliedAt: now
  };
}

/**
 * Risk Profile Service - manages risk profiles and their application to strategies
 * 
 * Provides functionality to create, update, validate, and apply risk profiles.
 * Supports profile inheritance where strategy-specific overrides take precedence
 * over profile defaults.
 * 
 * Requirements: 8.1, 8.2, 8.3
 */
export const RiskProfileService: RiskProfileServiceInterface = {
  /**
   * Create a new risk profile
   * 
   * @param tenantId - The tenant identifier
   * @param input - The risk profile configuration
   * @returns The created risk profile
   * @throws Error if validation fails
   */
  async createProfile(tenantId: string, input: RiskProfileInput): Promise<RiskProfile> {
    // Validate the profile
    const validation = this.validateProfile(input);
    if (!validation.valid) {
      throw new Error(`Invalid risk profile: ${validation.errors.join(', ')}`);
    }
    
    const now = new Date().toISOString();
    const profileId = generateUUID();
    
    const profile: RiskProfile = {
      profileId,
      tenantId,
      name: input.name,
      version: 1,
      positionLimits: input.positionLimits,
      drawdownConfig: {
        configId: generateUUID(),
        tenantId,
        ...input.drawdownConfig
      },
      volatilityConfig: {
        configId: generateUUID(),
        tenantId,
        ...input.volatilityConfig
      },
      circuitBreakers: input.circuitBreakers,
      exchangeSafeguards: input.exchangeSafeguards,
      createdAt: now,
      updatedAt: now
    };
    
    await RiskProfileRepository.putProfile(tenantId, profile);
    return profile;
  },

  /**
   * Get the latest version of a risk profile
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @returns The risk profile or null if not found
   */
  async getProfile(tenantId: string, profileId: string): Promise<RiskProfile | null> {
    return RiskProfileRepository.getLatestProfile(tenantId, profileId);
  },

  /**
   * Update a risk profile, creating a new version
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @param updates - Partial updates to apply
   * @returns The new version of the risk profile
   * @throws Error if profile not found or validation fails
   */
  async updateProfile(
    tenantId: string,
    profileId: string,
    updates: Partial<RiskProfileInput>
  ): Promise<RiskProfile> {
    const existing = await RiskProfileRepository.getLatestProfile(tenantId, profileId);
    if (!existing) {
      throw new Error(`Risk profile not found: ${profileId}`);
    }
    
    // Merge updates with existing profile
    const mergedInput: RiskProfileInput = {
      name: updates.name ?? existing.name,
      positionLimits: updates.positionLimits ?? existing.positionLimits,
      drawdownConfig: updates.drawdownConfig ?? existing.drawdownConfig,
      volatilityConfig: updates.volatilityConfig ?? existing.volatilityConfig,
      circuitBreakers: updates.circuitBreakers ?? existing.circuitBreakers,
      exchangeSafeguards: updates.exchangeSafeguards ?? existing.exchangeSafeguards
    };
    
    // Validate the merged profile
    const validation = this.validateProfile(mergedInput);
    if (!validation.valid) {
      throw new Error(`Invalid risk profile: ${validation.errors.join(', ')}`);
    }
    
    const now = new Date().toISOString();
    const newVersion = existing.version + 1;
    
    const newProfile: RiskProfile = {
      profileId,
      tenantId,
      name: mergedInput.name,
      version: newVersion,
      positionLimits: mergedInput.positionLimits,
      drawdownConfig: {
        configId: existing.drawdownConfig.configId,
        tenantId,
        ...mergedInput.drawdownConfig
      },
      volatilityConfig: {
        configId: existing.volatilityConfig.configId,
        tenantId,
        ...mergedInput.volatilityConfig
      },
      circuitBreakers: mergedInput.circuitBreakers,
      exchangeSafeguards: mergedInput.exchangeSafeguards,
      createdAt: existing.createdAt,
      updatedAt: now
    };
    
    await RiskProfileRepository.putProfile(tenantId, newProfile);
    return newProfile;
  },

  /**
   * List all risk profiles for a tenant (latest versions only)
   * 
   * @param tenantId - The tenant identifier
   * @returns List of risk profiles
   */
  async listProfiles(tenantId: string): Promise<RiskProfile[]> {
    const result = await RiskProfileRepository.listProfiles({ tenantId });
    return result.items;
  },

  /**
   * Assign a risk profile to a strategy
   * 
   * When a profile is assigned, all parameters from that profile are applied
   * to the strategy. Strategy-specific overrides can be applied via getAppliedProfile.
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param profileId - The profile identifier
   * @throws Error if profile not found
   */
  async assignToStrategy(tenantId: string, strategyId: string, profileId: string): Promise<void> {
    // Verify the profile exists
    const profile = await RiskProfileRepository.getLatestProfile(tenantId, profileId);
    if (!profile) {
      throw new Error(`Risk profile not found: ${profileId}`);
    }
    
    await RiskProfileRepository.assignProfileToStrategy(tenantId, strategyId, profileId);
  },

  /**
   * Get the version history of a risk profile
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @returns All versions of the profile, newest first
   */
  async getProfileHistory(tenantId: string, profileId: string): Promise<RiskProfile[]> {
    return RiskProfileRepository.getProfileHistory(tenantId, profileId);
  },

  /**
   * Validate a risk profile configuration
   * 
   * Validates internal consistency of all profile parameters:
   * - Position limits have valid values
   * - Drawdown warning threshold < max threshold
   * - Volatility thresholds are in ascending order
   * - Circuit breaker conditions have valid parameters
   * - Exchange safeguards have valid ranges
   * 
   * @param profile - The profile configuration to validate
   * @returns Validation result with any errors
   */
  validateProfile(profile: RiskProfileInput): ValidationResult {
    const errors: string[] = [];
    
    // Validate name
    if (!profile.name || profile.name.trim().length === 0) {
      errors.push('Profile name is required');
    }
    
    // Validate position limits
    errors.push(...validatePositionLimits(profile.positionLimits));
    
    // Validate drawdown config
    errors.push(...validateDrawdownConfig(profile.drawdownConfig));
    
    // Validate volatility config
    errors.push(...validateVolatilityConfig(profile.volatilityConfig));
    
    // Validate circuit breakers
    errors.push(...validateCircuitBreakers(profile.circuitBreakers));
    
    // Validate exchange safeguards
    errors.push(...validateExchangeSafeguards(profile.exchangeSafeguards));
    
    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Get the applied risk profile for a strategy with optional overrides
   * 
   * This method retrieves the assigned profile and applies any strategy-specific
   * overrides. Strategy overrides take precedence over profile defaults.
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param overrides - Optional strategy-specific overrides
   * @returns The applied profile with overrides, or null if no profile assigned
   */
  async getAppliedProfile(
    tenantId: string,
    strategyId: string,
    overrides?: RiskProfileOverrides
  ): Promise<AppliedRiskProfile | null> {
    // Get the strategy's profile assignment
    const assignment = await RiskProfileRepository.getStrategyAssignment(tenantId, strategyId);
    if (!assignment) {
      return null;
    }
    
    // Get the latest version of the assigned profile
    const profile = await RiskProfileRepository.getLatestProfile(tenantId, assignment.profileId);
    if (!profile) {
      return null;
    }
    
    // Apply overrides and return
    const applied = applyOverrides(profile, overrides);
    applied.strategyId = strategyId;
    
    return applied;
  },

  /**
   * Get the profile assignment for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The assignment or null if not assigned
   */
  async getStrategyAssignment(
    tenantId: string,
    strategyId: string
  ): Promise<StrategyProfileAssignment | null> {
    return RiskProfileRepository.getStrategyAssignment(tenantId, strategyId);
  }
};
