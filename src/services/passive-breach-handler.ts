import { PositionLimitRepository } from '../repositories/position-limit';
import { PositionTracker, Position } from './position-tracker';
import { PositionLimit, LimitScope } from '../types/position-limit';
import { OrderRequest } from '../types/order';
import { generateUUID } from '../utils/uuid';

/**
 * Passive Breach Handler Service
 * 
 * Detects position limit breaches caused by market price movements (not new trades)
 * and handles them by flagging positions and optionally queuing reduction orders.
 * 
 * Requirements: 1.6
 */

export type BreachStatus = 'NORMAL' | 'BREACH' | 'WARNING';

export interface BreachCheckResult {
  limitId: string;
  tenantId: string;
  scope: LimitScope;
  assetId?: string;
  strategyId?: string;
  status: BreachStatus;
  currentValue: number;
  maxValue: number;
  breachAmount?: number;
  breachPercent?: number;
  timestamp: string;
}

export interface FlaggedPosition {
  positionId: string;
  tenantId: string;
  assetId: string;
  strategyId?: string;
  limitId: string;
  status: BreachStatus;
  currentValue: number;
  maxValue: number;
  breachAmount: number;
  breachPercent: number;
  flaggedAt: string;
  autoReductionEnabled: boolean;
  reductionOrderQueued: boolean;
  reductionOrderId?: string;
}

export interface ReductionOrder {
  orderId: string;
  tenantId: string;
  assetId: string;
  strategyId?: string;
  limitId: string;
  side: 'SELL';
  quantity: number;
  reason: string;
  queuedAt: string;
  status: 'QUEUED' | 'SUBMITTED' | 'FILLED' | 'CANCELLED';
}

export interface PassiveBreachConfig {
  tenantId: string;
  autoReductionEnabled: boolean;
  warningThresholdPercent: number; // e.g., 90% of limit triggers warning
  reductionTargetPercent: number;  // e.g., reduce to 80% of limit
}

export interface PassiveBreachHandlerInterface {
  /**
   * Check if a position has breached its limit due to price movement
   */
  checkForPassiveBreach(
    tenantId: string,
    assetId: string,
    currentPrice: number,
    portfolioValue?: number,
    strategyId?: string
  ): Promise<BreachCheckResult[]>;

  /**
   * Flag a position that has breached its limit
   */
  flagPosition(
    tenantId: string,
    assetId: string,
    limitId: string,
    breachAmount: number,
    autoReductionEnabled: boolean
  ): Promise<FlaggedPosition>;

  /**
   * Get all flagged positions for a tenant
   */
  getFlaggedPositions(tenantId: string): Promise<FlaggedPosition[]>;

  /**
   * Queue a reduction order to bring position back within limits
   */
  queueReductionOrder(
    tenantId: string,
    assetId: string,
    strategyId: string | undefined,
    limitId: string,
    reductionQuantity: number
  ): Promise<ReductionOrder>;

  /**
   * Get queued reduction orders for a tenant
   */
  getQueuedReductionOrders(tenantId: string): Promise<ReductionOrder[]>;

  /**
   * Process passive breaches for all positions of a tenant
   */
  processPassiveBreaches(
    tenantId: string,
    currentPrices: Map<string, number>,
    portfolioValue?: number,
    config?: PassiveBreachConfig
  ): Promise<{
    breaches: BreachCheckResult[];
    flaggedPositions: FlaggedPosition[];
    queuedOrders: ReductionOrder[];
  }>;

  /**
   * Clear a flagged position (when breach is resolved)
   */
  clearFlaggedPosition(tenantId: string, positionId: string): Promise<void>;

  /**
   * Calculate the reduction quantity needed to bring position within limit
   */
  calculateReductionQuantity(
    currentValue: number,
    maxValue: number,
    targetPercent: number
  ): number;
}

// In-memory stores (in production, these would be backed by a database)
const flaggedPositionsStore: Map<string, FlaggedPosition> = new Map();
const reductionOrdersStore: Map<string, ReductionOrder> = new Map();

/**
 * Generate a unique key for a flagged position
 */
function getFlaggedPositionKey(tenantId: string, assetId: string, limitId: string): string {
  return `${tenantId}:${assetId}:${limitId}`;
}

/**
 * Calculate effective limit value based on limit type
 */
function calculateEffectiveLimit(limit: PositionLimit, portfolioValue?: number): number {
  if (limit.limitType === 'PERCENTAGE') {
    if (!portfolioValue || portfolioValue <= 0) {
      return 0;
    }
    return (limit.maxValue / 100) * portfolioValue;
  }
  return limit.maxValue;
}

export const PassiveBreachHandler: PassiveBreachHandlerInterface = {
  /**
   * Check if a position has breached its limit due to price movement
   */
  async checkForPassiveBreach(
    tenantId: string,
    assetId: string,
    currentPrice: number,
    portfolioValue?: number,
    strategyId?: string
  ): Promise<BreachCheckResult[]> {
    const results: BreachCheckResult[] = [];
    const now = new Date().toISOString();

    // Get the current position - try with strategyId first, then without
    let position = strategyId 
      ? await PositionTracker.getPosition(tenantId, assetId, strategyId)
      : await PositionTracker.getPosition(tenantId, assetId);
    
    // If no position found with strategyId, try without
    if (!position && strategyId) {
      position = await PositionTracker.getPosition(tenantId, assetId);
    }
    
    if (!position) {
      return results;
    }

    // Calculate current position value at current price
    const currentPositionValue = Math.abs(position.quantity) * currentPrice;

    // Find all applicable limits for this asset
    const limits = await PositionLimitRepository.findApplicableLimits(
      tenantId,
      assetId,
      position.strategyId || ''
    );

    for (const limit of limits) {
      const effectiveLimit = calculateEffectiveLimit(limit, portfolioValue);
      
      // Determine the value to check based on limit scope
      let valueToCheck: number;
      switch (limit.scope) {
        case 'ASSET':
          valueToCheck = currentPositionValue;
          break;
        case 'STRATEGY':
          // For strategy scope, we'd need to sum all positions for the strategy
          const strategyPositions = position.strategyId 
            ? await PositionTracker.getPositionsByStrategy(tenantId, position.strategyId)
            : [];
          valueToCheck = strategyPositions.reduce((sum, p) => sum + Math.abs(p.quantity) * currentPrice, 0);
          break;
        case 'PORTFOLIO':
          // For portfolio scope, sum all positions
          const summary = await PositionTracker.getPositions(tenantId);
          valueToCheck = summary.totalValue;
          break;
        default:
          valueToCheck = currentPositionValue;
      }

      // Check if breached
      const breachAmount = valueToCheck - effectiveLimit;
      const breachPercent = effectiveLimit > 0 ? (breachAmount / effectiveLimit) * 100 : 0;

      let status: BreachStatus = 'NORMAL';
      if (breachAmount > 0) {
        status = 'BREACH';
      } else if (valueToCheck >= effectiveLimit * 0.9) {
        status = 'WARNING';
      }

      results.push({
        limitId: limit.limitId,
        tenantId,
        scope: limit.scope,
        assetId: limit.assetId,
        strategyId: limit.strategyId,
        status,
        currentValue: valueToCheck,
        maxValue: effectiveLimit,
        breachAmount: breachAmount > 0 ? breachAmount : undefined,
        breachPercent: breachAmount > 0 ? breachPercent : undefined,
        timestamp: now
      });
    }

    return results;
  },

  /**
   * Flag a position that has breached its limit
   */
  async flagPosition(
    tenantId: string,
    assetId: string,
    limitId: string,
    breachAmount: number,
    autoReductionEnabled: boolean
  ): Promise<FlaggedPosition> {
    const now = new Date().toISOString();
    const positionId = generateUUID();

    // Get the limit details
    const limit = await PositionLimitRepository.getLimit(tenantId, limitId);
    if (!limit) {
      throw new Error(`Position limit not found: ${limitId}`);
    }

    // Get the current position
    const position = await PositionTracker.getPosition(tenantId, assetId);
    const currentValue = position ? Math.abs(position.quantity) : 0;
    const maxValue = limit.maxValue;
    const breachPercent = maxValue > 0 ? (breachAmount / maxValue) * 100 : 0;

    const flaggedPosition: FlaggedPosition = {
      positionId,
      tenantId,
      assetId,
      strategyId: position?.strategyId,
      limitId,
      status: 'BREACH',
      currentValue,
      maxValue,
      breachAmount,
      breachPercent,
      flaggedAt: now,
      autoReductionEnabled,
      reductionOrderQueued: false
    };

    const key = getFlaggedPositionKey(tenantId, assetId, limitId);
    flaggedPositionsStore.set(key, flaggedPosition);

    return flaggedPosition;
  },

  /**
   * Get all flagged positions for a tenant
   */
  async getFlaggedPositions(tenantId: string): Promise<FlaggedPosition[]> {
    const positions: FlaggedPosition[] = [];
    
    flaggedPositionsStore.forEach((position, key) => {
      if (key.startsWith(`${tenantId}:`)) {
        positions.push(position);
      }
    });

    return positions;
  },

  /**
   * Queue a reduction order to bring position back within limits
   */
  async queueReductionOrder(
    tenantId: string,
    assetId: string,
    strategyId: string | undefined,
    limitId: string,
    reductionQuantity: number
  ): Promise<ReductionOrder> {
    const now = new Date().toISOString();
    const orderId = generateUUID();

    const reductionOrder: ReductionOrder = {
      orderId,
      tenantId,
      assetId,
      strategyId,
      limitId,
      side: 'SELL',
      quantity: reductionQuantity,
      reason: 'Passive limit breach - automatic reduction',
      queuedAt: now,
      status: 'QUEUED'
    };

    reductionOrdersStore.set(orderId, reductionOrder);

    // Update the flagged position to indicate order was queued
    const key = getFlaggedPositionKey(tenantId, assetId, limitId);
    const flaggedPosition = flaggedPositionsStore.get(key);
    if (flaggedPosition) {
      flaggedPosition.reductionOrderQueued = true;
      flaggedPosition.reductionOrderId = orderId;
      flaggedPositionsStore.set(key, flaggedPosition);
    }

    return reductionOrder;
  },

  /**
   * Get queued reduction orders for a tenant
   */
  async getQueuedReductionOrders(tenantId: string): Promise<ReductionOrder[]> {
    const orders: ReductionOrder[] = [];
    
    reductionOrdersStore.forEach((order) => {
      if (order.tenantId === tenantId && order.status === 'QUEUED') {
        orders.push(order);
      }
    });

    return orders;
  },

  /**
   * Process passive breaches for all positions of a tenant
   */
  async processPassiveBreaches(
    tenantId: string,
    currentPrices: Map<string, number>,
    portfolioValue?: number,
    config?: PassiveBreachConfig
  ): Promise<{
    breaches: BreachCheckResult[];
    flaggedPositions: FlaggedPosition[];
    queuedOrders: ReductionOrder[];
  }> {
    const breaches: BreachCheckResult[] = [];
    const flaggedPositions: FlaggedPosition[] = [];
    const queuedOrders: ReductionOrder[] = [];

    const autoReductionEnabled = config?.autoReductionEnabled ?? false;
    const reductionTargetPercent = config?.reductionTargetPercent ?? 80;

    // Get all positions for the tenant
    const summary = await PositionTracker.getPositions(tenantId);

    // Check each position for breaches
    for (const position of summary.positions) {
      const currentPrice = currentPrices.get(position.assetId);
      if (!currentPrice) {
        continue;
      }

      const positionBreaches = await this.checkForPassiveBreach(
        tenantId,
        position.assetId,
        currentPrice,
        portfolioValue,
        position.strategyId
      );

      for (const breach of positionBreaches) {
        breaches.push(breach);

        if (breach.status === 'BREACH' && breach.breachAmount) {
          // Flag the position
          const flagged = await this.flagPosition(
            tenantId,
            position.assetId,
            breach.limitId,
            breach.breachAmount,
            autoReductionEnabled
          );
          flaggedPositions.push(flagged);

          // Queue reduction order if auto-reduction is enabled
          if (autoReductionEnabled) {
            const reductionQuantity = this.calculateReductionQuantity(
              breach.currentValue,
              breach.maxValue,
              reductionTargetPercent
            );

            if (reductionQuantity > 0) {
              const order = await this.queueReductionOrder(
                tenantId,
                position.assetId,
                position.strategyId,
                breach.limitId,
                reductionQuantity
              );
              queuedOrders.push(order);
            }
          }
        }
      }
    }

    return { breaches, flaggedPositions, queuedOrders };
  },

  /**
   * Clear a flagged position (when breach is resolved)
   */
  async clearFlaggedPosition(tenantId: string, positionId: string): Promise<void> {
    // Find and remove the flagged position
    flaggedPositionsStore.forEach((position, key) => {
      if (position.positionId === positionId && position.tenantId === tenantId) {
        flaggedPositionsStore.delete(key);
      }
    });
  },

  /**
   * Calculate the reduction quantity needed to bring position within limit
   * 
   * @param currentValue - Current position value
   * @param maxValue - Maximum allowed value (limit)
   * @param targetPercent - Target percentage of limit to reduce to (e.g., 80%)
   * @returns The quantity to reduce by
   */
  calculateReductionQuantity(
    currentValue: number,
    maxValue: number,
    targetPercent: number
  ): number {
    const targetValue = maxValue * (targetPercent / 100);
    const reductionNeeded = currentValue - targetValue;
    return Math.max(0, reductionNeeded);
  }
};

/**
 * Clear all flagged positions (for testing purposes)
 */
export function clearFlaggedPositions(): void {
  flaggedPositionsStore.clear();
}

/**
 * Clear all reduction orders (for testing purposes)
 */
export function clearReductionOrders(): void {
  reductionOrdersStore.clear();
}

/**
 * Get the flagged positions store (for testing purposes)
 */
export function getFlaggedPositionsStore(): Map<string, FlaggedPosition> {
  return flaggedPositionsStore;
}

/**
 * Get the reduction orders store (for testing purposes)
 */
export function getReductionOrdersStore(): Map<string, ReductionOrder> {
  return reductionOrdersStore;
}
