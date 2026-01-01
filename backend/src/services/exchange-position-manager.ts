/**
 * Exchange Position Manager Service
 *
 * Manages position tracking per asset, per exchange, and aggregated across exchanges.
 * Handles position updates from fills, reconciliation with exchange data, and P&L calculations.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import {
  Position,
  AggregatedPosition,
  ExchangePosition,
  PositionHistory,
  PositionEventType,
  PositionReconciliationResult,
  PositionDiscrepancy,
  PositionAdjustment,
} from '../types/exchange-position';
import { ExecutionUpdate, OrderSide } from '../types/exchange-order';
import { ExchangeId, PositionResponse } from '../types/exchange';
import { generateUUID } from '../utils/uuid';

/**
 * Error thrown when a position is not found
 */
export class PositionNotFoundError extends Error {
  constructor(tenantId: string, assetId: string, exchangeId?: ExchangeId) {
    const location = exchangeId ? `on ${exchangeId}` : 'aggregated';
    super(`Position for '${assetId}' ${location} not found for tenant '${tenantId}'`);
    this.name = 'PositionNotFoundError';
  }
}

/**
 * Error thrown when position update fails
 */
export class PositionUpdateError extends Error {
  constructor(message: string, public readonly assetId: string, public readonly exchangeId?: ExchangeId) {
    super(message);
    this.name = 'PositionUpdateError';
  }
}

/**
 * Interface for position repository operations
 */
export interface PositionRepository {
  getPosition(tenantId: string, assetId: string, exchangeId: ExchangeId): Promise<Position | null>;
  putPosition(tenantId: string, position: Position): Promise<void>;
  listPositions(tenantId: string, exchangeId?: ExchangeId): Promise<Position[]>;
  deletePosition(tenantId: string, assetId: string, exchangeId: ExchangeId): Promise<void>;
  addPositionHistory(tenantId: string, history: PositionHistory): Promise<void>;
  getPositionHistory(
    tenantId: string,
    assetId: string,
    startTime: string,
    endTime: string
  ): Promise<PositionHistory[]>;
}

/**
 * Interface for exchange adapter operations (for reconciliation)
 */
export interface ExchangeAdapterForPositions {
  getPositions(): Promise<PositionResponse[]>;
}

/**
 * Alert callback type for discrepancy notifications
 */
export type DiscrepancyAlertCallback = (
  tenantId: string,
  exchangeId: ExchangeId,
  discrepancies: PositionDiscrepancy[]
) => Promise<void>;

/**
 * In-memory position store for testing/development
 */
let positionStore: Map<string, Position> = new Map();
let positionHistoryStore: Map<string, PositionHistory[]> = new Map();

/**
 * Default position repository implementation (in-memory)
 */
const defaultRepository: PositionRepository = {
  async getPosition(tenantId: string, assetId: string, exchangeId: ExchangeId): Promise<Position | null> {
    const key = `${tenantId}:${assetId}:${exchangeId}`;
    return positionStore.get(key) || null;
  },

  async putPosition(tenantId: string, position: Position): Promise<void> {
    const key = `${tenantId}:${position.assetId}:${position.exchangeId}`;
    positionStore.set(key, position);
  },

  async listPositions(tenantId: string, exchangeId?: ExchangeId): Promise<Position[]> {
    const results: Position[] = [];
    positionStore.forEach((position, key) => {
      if (key.startsWith(`${tenantId}:`)) {
        if (!exchangeId || position.exchangeId === exchangeId) {
          results.push(position);
        }
      }
    });
    return results;
  },

  async deletePosition(tenantId: string, assetId: string, exchangeId: ExchangeId): Promise<void> {
    const key = `${tenantId}:${assetId}:${exchangeId}`;
    positionStore.delete(key);
  },

  async addPositionHistory(tenantId: string, history: PositionHistory): Promise<void> {
    const key = `${tenantId}:${history.assetId}`;
    const existing = positionHistoryStore.get(key) || [];
    existing.push(history);
    positionHistoryStore.set(key, existing);
  },

  async getPositionHistory(
    tenantId: string,
    assetId: string,
    startTime: string,
    endTime: string
  ): Promise<PositionHistory[]> {
    const key = `${tenantId}:${assetId}`;
    const history = positionHistoryStore.get(key) || [];
    return history.filter(h => h.timestamp >= startTime && h.timestamp <= endTime);
  },
};


/**
 * Exchange Position Manager Service
 *
 * Manages the complete lifecycle of positions including tracking, updates from fills,
 * reconciliation, and P&L calculations.
 */
export const ExchangePositionManager = {
  /**
   * Repository for position persistence
   */
  repository: defaultRepository as PositionRepository,

  /**
   * Registry of exchange adapters for reconciliation
   */
  adapters: new Map<string, ExchangeAdapterForPositions>(),

  /**
   * Alert callback for discrepancy notifications
   */
  alertCallback: null as DiscrepancyAlertCallback | null,

  /**
   * Set the position repository
   */
  setRepository(repo: PositionRepository): void {
    this.repository = repo;
  },

  /**
   * Register an exchange adapter for reconciliation
   */
  registerAdapter(tenantId: string, exchangeId: ExchangeId, adapter: ExchangeAdapterForPositions): void {
    const key = `${tenantId}:${exchangeId}`;
    this.adapters.set(key, adapter);
  },

  /**
   * Set the alert callback for discrepancy notifications
   */
  setAlertCallback(callback: DiscrepancyAlertCallback): void {
    this.alertCallback = callback;
  },

  /**
   * Clear all stores (for testing)
   */
  clearStores(): void {
    positionStore = new Map();
    positionHistoryStore = new Map();
    this.adapters.clear();
  },

  /**
   * Get a position for a specific asset on a specific exchange
   *
   * Requirements: 7.1
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeId - The exchange identifier
   * @returns The position, or null if not found
   */
  async getPosition(
    tenantId: string,
    assetId: string,
    exchangeId: ExchangeId
  ): Promise<Position | null> {
    return this.repository.getPosition(tenantId, assetId, exchangeId);
  },

  /**
   * Get aggregated position across all exchanges for an asset
   *
   * Requirements: 7.1
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @returns The aggregated position
   */
  async getAggregatedPosition(tenantId: string, assetId: string): Promise<AggregatedPosition> {
    const allPositions = await this.repository.listPositions(tenantId);
    const assetPositions = allPositions.filter(p => p.assetId === assetId);

    if (assetPositions.length === 0) {
      return {
        tenantId,
        assetId,
        totalQuantity: 0,
        weightedAveragePrice: 0,
        unrealizedPnL: 0,
        realizedPnL: 0,
        positionsByExchange: [],
        updatedAt: new Date().toISOString(),
      };
    }

    // Calculate aggregated values
    let totalQuantity = 0;
    let totalValue = 0;
    let totalUnrealizedPnL = 0;
    let totalRealizedPnL = 0;
    const positionsByExchange: ExchangePosition[] = [];

    for (const position of assetPositions) {
      totalQuantity += position.quantity;
      totalValue += position.quantity * position.averageEntryPrice;
      totalUnrealizedPnL += position.unrealizedPnL;
      totalRealizedPnL += position.realizedPnL;

      positionsByExchange.push({
        exchangeId: position.exchangeId,
        quantity: position.quantity,
        averageEntryPrice: position.averageEntryPrice,
        unrealizedPnL: position.unrealizedPnL,
      });
    }

    const weightedAveragePrice = totalQuantity > 0 ? totalValue / totalQuantity : 0;

    return {
      tenantId,
      assetId,
      totalQuantity,
      weightedAveragePrice,
      unrealizedPnL: totalUnrealizedPnL,
      realizedPnL: totalRealizedPnL,
      positionsByExchange,
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * List all positions for a tenant, optionally filtered by exchange
   *
   * Requirements: 7.1
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - Optional exchange filter
   * @returns List of positions
   */
  async listPositions(tenantId: string, exchangeId?: ExchangeId): Promise<Position[]> {
    return this.repository.listPositions(tenantId, exchangeId);
  },


  /**
   * Update position from a fill/execution
   *
   * Updates quantity (add for BUY, subtract for SELL), recalculates average entry price
   * using weighted average, and calculates unrealized P&L.
   *
   * Requirements: 7.2, 7.5
   *
   * @param tenantId - The tenant identifier
   * @param fill - The execution update
   * @returns The updated position
   */
  async updatePositionFromFill(tenantId: string, fill: ExecutionUpdate): Promise<Position> {
    const { exchangeId, side, quantity, price, commission } = fill;
    const assetId = fill.orderId.split(':')[1] || 'UNKNOWN'; // Extract asset from order context

    // Get existing position or create new one
    let position = await this.repository.getPosition(tenantId, assetId, exchangeId);
    const now = new Date().toISOString();

    const previousQuantity = position?.quantity || 0;
    const previousAvgPrice = position?.averageEntryPrice || 0;

    let newQuantity: number;
    let newAvgPrice: number;
    let eventType: PositionEventType;

    if (side === 'BUY') {
      // Add to position
      newQuantity = previousQuantity + quantity;
      // Weighted average price calculation
      if (newQuantity > 0) {
        newAvgPrice = (previousQuantity * previousAvgPrice + quantity * price) / newQuantity;
      } else {
        newAvgPrice = price;
      }
      eventType = previousQuantity === 0 ? 'OPEN' : 'INCREASE';
    } else {
      // Subtract from position (SELL)
      newQuantity = previousQuantity - quantity;
      // Average price stays the same for sells (realized P&L is calculated separately)
      newAvgPrice = previousAvgPrice;
      eventType = newQuantity <= 0 ? 'CLOSE' : 'DECREASE';
    }

    // Calculate unrealized P&L
    const currentPrice = position?.currentPrice || price;
    const unrealizedPnL = newQuantity * (currentPrice - newAvgPrice);
    const unrealizedPnLPercent = newAvgPrice > 0 ? ((currentPrice - newAvgPrice) / newAvgPrice) * 100 : 0;

    // Calculate realized P&L for sells
    let realizedPnL = position?.realizedPnL || 0;
    if (side === 'SELL' && previousAvgPrice > 0) {
      realizedPnL += quantity * (price - previousAvgPrice) - commission;
    }

    const totalCommissions = (position?.totalCommissions || 0) + commission;

    if (newQuantity <= 0) {
      // Position closed - delete it
      if (position) {
        await this.repository.deletePosition(tenantId, assetId, exchangeId);
      }

      // Create history record
      const history: PositionHistory = {
        historyId: generateUUID(),
        positionId: position?.positionId || generateUUID(),
        tenantId,
        assetId,
        exchangeId,
        eventType: 'CLOSE',
        previousQuantity,
        newQuantity: 0,
        previousAvgPrice,
        newAvgPrice: 0,
        fillId: fill.executionId,
        timestamp: now,
      };
      await this.repository.addPositionHistory(tenantId, history);

      // Return a closed position representation
      return {
        positionId: position?.positionId || generateUUID(),
        tenantId,
        assetId,
        exchangeId,
        quantity: 0,
        averageEntryPrice: 0,
        currentPrice,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        realizedPnL,
        totalCommissions,
        openedAt: position?.openedAt || now,
        updatedAt: now,
      };
    }

    // Update or create position
    const updatedPosition: Position = {
      positionId: position?.positionId || generateUUID(),
      tenantId,
      assetId,
      exchangeId,
      quantity: newQuantity,
      averageEntryPrice: newAvgPrice,
      currentPrice,
      unrealizedPnL,
      unrealizedPnLPercent,
      realizedPnL,
      totalCommissions,
      openedAt: position?.openedAt || now,
      updatedAt: now,
    };

    await this.repository.putPosition(tenantId, updatedPosition);

    // Create history record
    const history: PositionHistory = {
      historyId: generateUUID(),
      positionId: updatedPosition.positionId,
      tenantId,
      assetId,
      exchangeId,
      eventType,
      previousQuantity,
      newQuantity,
      previousAvgPrice,
      newAvgPrice,
      fillId: fill.executionId,
      timestamp: now,
    };
    await this.repository.addPositionHistory(tenantId, history);

    return updatedPosition;
  },

  /**
   * Update position directly (for manual adjustments or reconciliation)
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeId - The exchange identifier
   * @param updates - The updates to apply
   * @param eventType - The type of event causing the update
   * @returns The updated position
   */
  async updatePosition(
    tenantId: string,
    assetId: string,
    exchangeId: ExchangeId,
    updates: Partial<Position>,
    eventType: PositionEventType = 'RECONCILE'
  ): Promise<Position> {
    const existing = await this.repository.getPosition(tenantId, assetId, exchangeId);
    const now = new Date().toISOString();

    const previousQuantity = existing?.quantity || 0;
    const previousAvgPrice = existing?.averageEntryPrice || 0;

    const updatedPosition: Position = {
      positionId: existing?.positionId || generateUUID(),
      tenantId,
      assetId,
      exchangeId,
      quantity: updates.quantity ?? existing?.quantity ?? 0,
      averageEntryPrice: updates.averageEntryPrice ?? existing?.averageEntryPrice ?? 0,
      currentPrice: updates.currentPrice ?? existing?.currentPrice ?? 0,
      unrealizedPnL: updates.unrealizedPnL ?? existing?.unrealizedPnL ?? 0,
      unrealizedPnLPercent: updates.unrealizedPnLPercent ?? existing?.unrealizedPnLPercent ?? 0,
      realizedPnL: updates.realizedPnL ?? existing?.realizedPnL ?? 0,
      totalCommissions: updates.totalCommissions ?? existing?.totalCommissions ?? 0,
      openedAt: existing?.openedAt || now,
      updatedAt: now,
    };

    await this.repository.putPosition(tenantId, updatedPosition);

    // Create history record
    const history: PositionHistory = {
      historyId: generateUUID(),
      positionId: updatedPosition.positionId,
      tenantId,
      assetId,
      exchangeId,
      eventType,
      previousQuantity,
      newQuantity: updatedPosition.quantity,
      previousAvgPrice,
      newAvgPrice: updatedPosition.averageEntryPrice,
      timestamp: now,
    };
    await this.repository.addPositionHistory(tenantId, history);

    return updatedPosition;
  },


  /**
   * Reconcile positions with exchange data
   *
   * Compares internal state with exchange data and uses exchange data as source of truth
   * on discrepancy. Generates alerts for discrepancies.
   *
   * Requirements: 7.3, 7.4
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns The reconciliation result
   */
  async reconcilePositions(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<PositionReconciliationResult> {
    const now = new Date().toISOString();
    const discrepancies: PositionDiscrepancy[] = [];
    const adjustmentsMade: PositionAdjustment[] = [];

    // Get internal positions
    const internalPositions = await this.repository.listPositions(tenantId, exchangeId);
    const internalPositionMap = new Map<string, Position>();
    for (const pos of internalPositions) {
      internalPositionMap.set(pos.assetId, pos);
    }

    // Get exchange positions
    const adapterKey = `${tenantId}:${exchangeId}`;
    const adapter = this.adapters.get(adapterKey);
    
    let exchangePositions: PositionResponse[] = [];
    if (adapter) {
      try {
        exchangePositions = await adapter.getPositions();
      } catch (error) {
        // If we can't get exchange positions, return empty result
        return {
          exchangeId,
          positionsChecked: internalPositions.length,
          discrepancies: [],
          adjustmentsMade: [],
          timestamp: now,
        };
      }
    }

    const exchangePositionMap = new Map<string, PositionResponse>();
    for (const pos of exchangePositions) {
      exchangePositionMap.set(pos.assetId, pos);
    }

    // Check all internal positions against exchange
    for (const [assetId, internalPos] of internalPositionMap) {
      const exchangePos = exchangePositionMap.get(assetId);
      
      if (!exchangePos) {
        // Position exists internally but not on exchange
        if (internalPos.quantity > 0) {
          discrepancies.push({
            assetId,
            internalQuantity: internalPos.quantity,
            exchangeQuantity: 0,
            difference: internalPos.quantity,
          });

          // Use exchange as source of truth - delete internal position
          await this.repository.deletePosition(tenantId, assetId, exchangeId);
          
          adjustmentsMade.push({
            assetId,
            previousQuantity: internalPos.quantity,
            adjustedQuantity: 0,
            reason: 'Position not found on exchange',
          });

          // Create history record
          const history: PositionHistory = {
            historyId: generateUUID(),
            positionId: internalPos.positionId,
            tenantId,
            assetId,
            exchangeId,
            eventType: 'RECONCILE',
            previousQuantity: internalPos.quantity,
            newQuantity: 0,
            previousAvgPrice: internalPos.averageEntryPrice,
            newAvgPrice: 0,
            timestamp: now,
          };
          await this.repository.addPositionHistory(tenantId, history);
        }
      } else {
        // Compare quantities
        const diff = Math.abs(internalPos.quantity - exchangePos.quantity);
        if (diff > 0.00000001) { // Allow for floating point tolerance
          discrepancies.push({
            assetId,
            internalQuantity: internalPos.quantity,
            exchangeQuantity: exchangePos.quantity,
            difference: internalPos.quantity - exchangePos.quantity,
          });

          // Use exchange as source of truth
          const previousQuantity = internalPos.quantity;
          await this.updatePosition(
            tenantId,
            assetId,
            exchangeId,
            {
              quantity: exchangePos.quantity,
              averageEntryPrice: exchangePos.averageEntryPrice,
              unrealizedPnL: exchangePos.unrealizedPnL,
            },
            'RECONCILE'
          );

          adjustmentsMade.push({
            assetId,
            previousQuantity,
            adjustedQuantity: exchangePos.quantity,
            reason: 'Quantity mismatch with exchange',
          });
        }
      }
    }

    // Check for positions on exchange that don't exist internally
    for (const [assetId, exchangePos] of exchangePositionMap) {
      if (!internalPositionMap.has(assetId) && exchangePos.quantity > 0) {
        discrepancies.push({
          assetId,
          internalQuantity: 0,
          exchangeQuantity: exchangePos.quantity,
          difference: -exchangePos.quantity,
        });

        // Create internal position from exchange data
        const newPosition: Position = {
          positionId: generateUUID(),
          tenantId,
          assetId,
          exchangeId,
          quantity: exchangePos.quantity,
          averageEntryPrice: exchangePos.averageEntryPrice,
          currentPrice: exchangePos.averageEntryPrice,
          unrealizedPnL: exchangePos.unrealizedPnL,
          unrealizedPnLPercent: 0,
          realizedPnL: 0,
          totalCommissions: 0,
          openedAt: now,
          updatedAt: now,
        };

        await this.repository.putPosition(tenantId, newPosition);

        adjustmentsMade.push({
          assetId,
          previousQuantity: 0,
          adjustedQuantity: exchangePos.quantity,
          reason: 'Position found on exchange but not internally',
        });

        // Create history record
        const history: PositionHistory = {
          historyId: generateUUID(),
          positionId: newPosition.positionId,
          tenantId,
          assetId,
          exchangeId,
          eventType: 'RECONCILE',
          previousQuantity: 0,
          newQuantity: exchangePos.quantity,
          previousAvgPrice: 0,
          newAvgPrice: exchangePos.averageEntryPrice,
          timestamp: now,
        };
        await this.repository.addPositionHistory(tenantId, history);
      }
    }

    // Alert on discrepancies
    if (discrepancies.length > 0 && this.alertCallback) {
      await this.alertCallback(tenantId, exchangeId, discrepancies);
    }

    return {
      exchangeId,
      positionsChecked: internalPositionMap.size + exchangePositionMap.size,
      discrepancies,
      adjustmentsMade,
      timestamp: now,
    };
  },

  /**
   * Calculate unrealized P&L for a position
   *
   * Requirements: 7.5
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param currentPrice - The current market price
   * @returns The unrealized P&L
   */
  async calculateUnrealizedPnL(
    tenantId: string,
    assetId: string,
    currentPrice: number
  ): Promise<number> {
    const allPositions = await this.repository.listPositions(tenantId);
    const assetPositions = allPositions.filter(p => p.assetId === assetId);

    let totalUnrealizedPnL = 0;
    for (const position of assetPositions) {
      const pnl = position.quantity * (currentPrice - position.averageEntryPrice);
      totalUnrealizedPnL += pnl;

      // Update position with new current price and P&L
      await this.repository.putPosition(tenantId, {
        ...position,
        currentPrice,
        unrealizedPnL: pnl,
        unrealizedPnLPercent: position.averageEntryPrice > 0
          ? ((currentPrice - position.averageEntryPrice) / position.averageEntryPrice) * 100
          : 0,
        updatedAt: new Date().toISOString(),
      });
    }

    return totalUnrealizedPnL;
  },

  /**
   * Get position history for an asset
   *
   * Requirements: 7.6
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @returns List of position history records
   */
  async getPositionHistory(
    tenantId: string,
    assetId: string,
    startTime: string,
    endTime: string
  ): Promise<PositionHistory[]> {
    return this.repository.getPositionHistory(tenantId, assetId, startTime, endTime);
  },

  /**
   * Update current price for all positions of an asset
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param currentPrice - The current market price
   */
  async updateCurrentPrice(tenantId: string, assetId: string, currentPrice: number): Promise<void> {
    const allPositions = await this.repository.listPositions(tenantId);
    const assetPositions = allPositions.filter(p => p.assetId === assetId);

    for (const position of assetPositions) {
      const unrealizedPnL = position.quantity * (currentPrice - position.averageEntryPrice);
      const unrealizedPnLPercent = position.averageEntryPrice > 0
        ? ((currentPrice - position.averageEntryPrice) / position.averageEntryPrice) * 100
        : 0;

      await this.repository.putPosition(tenantId, {
        ...position,
        currentPrice,
        unrealizedPnL,
        unrealizedPnLPercent,
        updatedAt: new Date().toISOString(),
      });
    }
  },
};
