import { generateUUID } from '../utils/uuid';
import { PositionLimitRepository } from '../repositories/position-limit';
import {
  PositionLimit,
  PositionLimitInput,
  LimitCheckResult,
  LimitScope,
  LimitType
} from '../types/position-limit';
import { OrderRequest } from '../types/order';

/**
 * Position Limit Service - manages position limits and enforcement
 * 
 * Provides functionality to set, check, and update position limits at
 * asset, strategy, and portfolio levels. Supports both absolute and
 * percentage-based limits.
 * 
 * Requirements: 1.1, 1.3
 */

export interface PositionLimitServiceInterface {
  setLimit(tenantId: string, limit: PositionLimitInput): Promise<PositionLimit>;
  getLimit(tenantId: string, limitId: string): Promise<PositionLimit | null>;
  listLimits(tenantId: string, scope?: LimitScope): Promise<PositionLimit[]>;
  checkLimit(tenantId: string, order: OrderRequest, portfolioValue?: number): Promise<LimitCheckResult>;
  updateCurrentValue(tenantId: string, limitId: string, value: number, portfolioValue?: number): Promise<void>;
  checkOrderAgainstLimits(
    tenantId: string,
    order: OrderRequest,
    currentPositions: Map<string, number>,
    portfolioValue?: number
  ): Promise<LimitCheckResult[]>;
}

/**
 * Calculate the effective limit value based on limit type
 */
function calculateEffectiveLimit(limit: PositionLimit, portfolioValue?: number): number {
  if (limit.limitType === 'PERCENTAGE') {
    if (!portfolioValue || portfolioValue <= 0) {
      // If no portfolio value provided for percentage limit, treat as 0 capacity
      return 0;
    }
    return (limit.maxValue / 100) * portfolioValue;
  }
  return limit.maxValue;
}

/**
 * Calculate the current value as a percentage of portfolio if needed
 */
function calculateCurrentValueForComparison(
  currentValue: number,
  limit: PositionLimit,
  portfolioValue?: number
): number {
  if (limit.limitType === 'PERCENTAGE' && portfolioValue && portfolioValue > 0) {
    // For percentage limits, we compare the current value directly
    // The effective limit is already converted to absolute value
    return currentValue;
  }
  return currentValue;
}

export const PositionLimitService: PositionLimitServiceInterface = {
  /**
   * Set a new position limit or update an existing one
   * 
   * @param tenantId - The tenant identifier
   * @param input - The position limit configuration
   * @returns The created or updated position limit
   */
  async setLimit(tenantId: string, input: PositionLimitInput): Promise<PositionLimit> {
    const now = new Date().toISOString();
    const limitId = generateUUID();

    const limit: PositionLimit = {
      limitId,
      tenantId,
      scope: input.scope,
      assetId: input.assetId,
      strategyId: input.strategyId,
      limitType: input.limitType,
      maxValue: input.maxValue,
      currentValue: 0,
      utilizationPercent: 0,
      createdAt: now,
      updatedAt: now
    };

    await PositionLimitRepository.putLimit(tenantId, limit);
    return limit;
  },

  /**
   * Get a position limit by ID
   * 
   * @param tenantId - The tenant identifier
   * @param limitId - The limit identifier
   * @returns The position limit or null if not found
   */
  async getLimit(tenantId: string, limitId: string): Promise<PositionLimit | null> {
    return PositionLimitRepository.getLimit(tenantId, limitId);
  },

  /**
   * List all position limits for a tenant, optionally filtered by scope
   * 
   * @param tenantId - The tenant identifier
   * @param scope - Optional scope filter
   * @returns List of position limits
   */
  async listLimits(tenantId: string, scope?: LimitScope): Promise<PositionLimit[]> {
    if (scope) {
      return PositionLimitRepository.listLimitsByScope(tenantId, scope);
    }
    const result = await PositionLimitRepository.listLimits({ tenantId });
    return result.items;
  },

  /**
   * Check if an order would violate any position limits
   * 
   * This is a simplified check that looks at a single limit.
   * For comprehensive checking, use checkOrderAgainstLimits.
   * 
   * @param tenantId - The tenant identifier
   * @param order - The order to check
   * @param portfolioValue - Optional portfolio value for percentage limits
   * @returns The limit check result
   */
  async checkLimit(
    tenantId: string,
    order: OrderRequest,
    portfolioValue?: number
  ): Promise<LimitCheckResult> {
    // Find applicable limits for this order
    const limits = await PositionLimitRepository.findApplicableLimits(
      tenantId,
      order.assetId,
      order.strategyId
    );

    if (limits.length === 0) {
      // No limits configured, order is within limits
      return {
        withinLimit: true,
        currentValue: 0,
        maxValue: Infinity,
        remainingCapacity: Infinity
      };
    }

    // Check each applicable limit
    for (const limit of limits) {
      const effectiveLimit = calculateEffectiveLimit(limit, portfolioValue);
      const currentValue = limit.currentValue;
      
      // Calculate what the new position would be
      const orderValue = order.side === 'BUY' ? order.quantity : -order.quantity;
      const newValue = currentValue + orderValue;

      // For sells, we don't check against max limit (reducing position)
      if (order.side === 'SELL') {
        continue;
      }

      // Check if the new value would exceed the limit
      if (newValue > effectiveLimit) {
        return {
          withinLimit: false,
          currentValue,
          maxValue: effectiveLimit,
          remainingCapacity: Math.max(0, effectiveLimit - currentValue),
          wouldExceedBy: newValue - effectiveLimit
        };
      }
    }

    // All limits passed
    const firstLimit = limits[0];
    const effectiveLimit = calculateEffectiveLimit(firstLimit, portfolioValue);
    
    return {
      withinLimit: true,
      currentValue: firstLimit.currentValue,
      maxValue: effectiveLimit,
      remainingCapacity: Math.max(0, effectiveLimit - firstLimit.currentValue)
    };
  },

  /**
   * Update the current value of a position limit
   * 
   * @param tenantId - The tenant identifier
   * @param limitId - The limit identifier
   * @param value - The new current value
   * @param portfolioValue - Optional portfolio value for percentage calculation
   */
  async updateCurrentValue(
    tenantId: string,
    limitId: string,
    value: number,
    portfolioValue?: number
  ): Promise<void> {
    await PositionLimitRepository.updateCurrentValue(tenantId, limitId, value, portfolioValue);
  },

  /**
   * Check an order against all applicable limits with current positions
   * 
   * This is the comprehensive limit check that considers:
   * - Asset-level limits
   * - Strategy-level limits
   * - Portfolio-level limits
   * - Both absolute and percentage limit types
   * 
   * @param tenantId - The tenant identifier
   * @param order - The order to check
   * @param currentPositions - Map of assetId to current position size
   * @param portfolioValue - Optional portfolio value for percentage limits
   * @returns Array of limit check results for each applicable limit
   */
  async checkOrderAgainstLimits(
    tenantId: string,
    order: OrderRequest,
    currentPositions: Map<string, number>,
    portfolioValue?: number
  ): Promise<LimitCheckResult[]> {
    const limits = await PositionLimitRepository.findApplicableLimits(
      tenantId,
      order.assetId,
      order.strategyId
    );

    if (limits.length === 0) {
      return [{
        withinLimit: true,
        currentValue: 0,
        maxValue: Infinity,
        remainingCapacity: Infinity
      }];
    }

    const results: LimitCheckResult[] = [];

    for (const limit of limits) {
      const effectiveLimit = calculateEffectiveLimit(limit, portfolioValue);
      
      // Get current position based on limit scope
      let currentValue: number;
      switch (limit.scope) {
        case 'ASSET':
          currentValue = currentPositions.get(order.assetId) || 0;
          break;
        case 'STRATEGY':
          // Sum all positions for the strategy (simplified - in practice would need strategy positions)
          currentValue = limit.currentValue;
          break;
        case 'PORTFOLIO':
          // Sum all positions
          currentValue = Array.from(currentPositions.values()).reduce((sum, v) => sum + Math.abs(v), 0);
          break;
        default:
          currentValue = 0;
      }

      // Calculate new position after order
      const orderValue = order.side === 'BUY' ? order.quantity : -order.quantity;
      const newValue = Math.abs(currentValue + orderValue);

      // For sells that reduce position, always within limit
      if (order.side === 'SELL' && newValue <= Math.abs(currentValue)) {
        results.push({
          withinLimit: true,
          currentValue: Math.abs(currentValue),
          maxValue: effectiveLimit,
          remainingCapacity: Math.max(0, effectiveLimit - Math.abs(currentValue))
        });
        continue;
      }

      // Check if new value exceeds limit
      const withinLimit = newValue <= effectiveLimit;
      
      results.push({
        withinLimit,
        currentValue: Math.abs(currentValue),
        maxValue: effectiveLimit,
        remainingCapacity: Math.max(0, effectiveLimit - Math.abs(currentValue)),
        wouldExceedBy: withinLimit ? undefined : newValue - effectiveLimit
      });
    }

    return results;
  }
};
