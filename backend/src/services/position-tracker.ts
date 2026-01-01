import { ExecutionReport } from '../types/order';
import { PositionLimitRepository } from '../repositories/position-limit';
import { PositionLimit, LimitScope } from '../types/position-limit';

/**
 * Position Tracker Service - calculates and tracks positions from executed trades
 * 
 * Maintains real-time position sizes based on executed trades and market prices.
 * Updates position limits when trades are executed.
 * 
 * Requirements: 1.4, 1.5
 */

export interface Position {
  tenantId: string;
  assetId: string;
  strategyId?: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPnL: number;
  lastUpdated: string;
}

export interface PositionSummary {
  tenantId: string;
  positions: Position[];
  totalValue: number;
  totalUnrealizedPnL: number;
}

export interface PositionTrackerInterface {
  /**
   * Process an execution report and update positions
   */
  processExecution(execution: ExecutionReport): Promise<Position>;
  
  /**
   * Get current position for an asset
   */
  getPosition(tenantId: string, assetId: string, strategyId?: string): Promise<Position | null>;
  
  /**
   * Get all positions for a tenant
   */
  getPositions(tenantId: string): Promise<PositionSummary>;
  
  /**
   * Calculate position from a sequence of trades
   */
  calculatePositionFromTrades(trades: ExecutionReport[]): number;
  
  /**
   * Update position with current market price
   */
  updateMarketValue(tenantId: string, assetId: string, currentPrice: number): Promise<Position | null>;
  
  /**
   * Get positions by strategy
   */
  getPositionsByStrategy(tenantId: string, strategyId: string): Promise<Position[]>;
  
  /**
   * Update position limits after a trade
   */
  updatePositionLimits(
    tenantId: string,
    assetId: string,
    strategyId: string,
    newPositionSize: number
  ): Promise<void>;
}

// In-memory position store (in production, this would be backed by a database)
const positionStore: Map<string, Position> = new Map();

/**
 * Generate a unique key for a position
 */
function getPositionKey(tenantId: string, assetId: string, strategyId?: string): string {
  return strategyId 
    ? `${tenantId}:${assetId}:${strategyId}`
    : `${tenantId}:${assetId}`;
}

export const PositionTracker: PositionTrackerInterface = {
  /**
   * Process an execution report and update positions
   * 
   * @param execution - The execution report from a completed trade
   * @returns The updated position
   */
  async processExecution(execution: ExecutionReport): Promise<Position> {
    const key = getPositionKey(execution.tenantId, execution.assetId, execution.strategyId);
    const existingPosition = positionStore.get(key);
    
    const now = new Date().toISOString();
    
    // Calculate new position
    let newQuantity: number;
    let newAveragePrice: number;
    
    if (existingPosition) {
      if (execution.side === 'BUY') {
        // Buying increases position
        const totalCost = (existingPosition.quantity * existingPosition.averagePrice) + 
                         (execution.executedQuantity * execution.executedPrice);
        newQuantity = existingPosition.quantity + execution.executedQuantity;
        newAveragePrice = newQuantity > 0 ? totalCost / newQuantity : 0;
      } else {
        // Selling decreases position
        newQuantity = existingPosition.quantity - execution.executedQuantity;
        // Average price stays the same when selling
        newAveragePrice = existingPosition.averagePrice;
      }
    } else {
      // New position
      if (execution.side === 'BUY') {
        newQuantity = execution.executedQuantity;
        newAveragePrice = execution.executedPrice;
      } else {
        // Short position (selling without existing position)
        newQuantity = -execution.executedQuantity;
        newAveragePrice = execution.executedPrice;
      }
    }
    
    const marketValue = Math.abs(newQuantity) * execution.executedPrice;
    const unrealizedPnL = newQuantity * (execution.executedPrice - newAveragePrice);
    
    const updatedPosition: Position = {
      tenantId: execution.tenantId,
      assetId: execution.assetId,
      strategyId: execution.strategyId,
      quantity: newQuantity,
      averagePrice: newAveragePrice,
      marketValue,
      unrealizedPnL,
      lastUpdated: now
    };
    
    positionStore.set(key, updatedPosition);
    
    // Update position limits
    await this.updatePositionLimits(execution.tenantId, execution.assetId, execution.strategyId, Math.abs(newQuantity));
    
    return updatedPosition;
  },

  /**
   * Get current position for an asset
   */
  async getPosition(tenantId: string, assetId: string, strategyId?: string): Promise<Position | null> {
    const key = getPositionKey(tenantId, assetId, strategyId);
    return positionStore.get(key) || null;
  },

  /**
   * Get all positions for a tenant
   */
  async getPositions(tenantId: string): Promise<PositionSummary> {
    const positions: Position[] = [];
    let totalValue = 0;
    let totalUnrealizedPnL = 0;
    
    positionStore.forEach((position, key) => {
      if (key.startsWith(`${tenantId}:`)) {
        positions.push(position);
        totalValue += position.marketValue;
        totalUnrealizedPnL += position.unrealizedPnL;
      }
    });
    
    return {
      tenantId,
      positions,
      totalValue,
      totalUnrealizedPnL
    };
  },

  /**
   * Calculate position from a sequence of trades
   * 
   * Property: For any sequence of executed trades, the calculated position size
   * SHALL equal the sum of all buy quantities minus the sum of all sell quantities.
   * 
   * @param trades - Array of execution reports
   * @returns The net position size
   */
  calculatePositionFromTrades(trades: ExecutionReport[]): number {
    return trades.reduce((position, trade) => {
      if (trade.side === 'BUY') {
        return position + trade.executedQuantity;
      } else {
        return position - trade.executedQuantity;
      }
    }, 0);
  },

  /**
   * Update position with current market price
   */
  async updateMarketValue(tenantId: string, assetId: string, currentPrice: number): Promise<Position | null> {
    const key = getPositionKey(tenantId, assetId);
    const position = positionStore.get(key);
    
    if (!position) {
      return null;
    }
    
    const marketValue = Math.abs(position.quantity) * currentPrice;
    const unrealizedPnL = position.quantity * (currentPrice - position.averagePrice);
    
    const updatedPosition: Position = {
      ...position,
      marketValue,
      unrealizedPnL,
      lastUpdated: new Date().toISOString()
    };
    
    positionStore.set(key, updatedPosition);
    return updatedPosition;
  },

  /**
   * Get positions by strategy
   */
  async getPositionsByStrategy(tenantId: string, strategyId: string): Promise<Position[]> {
    const positions: Position[] = [];
    
    positionStore.forEach((position, key) => {
      if (key.startsWith(`${tenantId}:`) && position.strategyId === strategyId) {
        positions.push(position);
      }
    });
    
    return positions;
  },

  /**
   * Update position limits after a trade
   * @internal
   */
  async updatePositionLimits(
    tenantId: string,
    assetId: string,
    strategyId: string,
    newPositionSize: number
  ): Promise<void> {
    try {
      // Find and update applicable limits
      const limits = await PositionLimitRepository.findApplicableLimits(tenantId, assetId, strategyId);
      
      for (const limit of limits) {
        if (limit.scope === 'ASSET' && limit.assetId === assetId) {
          await PositionLimitRepository.updateCurrentValue(tenantId, limit.limitId, newPositionSize);
        } else if (limit.scope === 'STRATEGY' && limit.strategyId === strategyId) {
          // For strategy limits, we'd need to sum all positions for the strategy
          const strategyPositions = await this.getPositionsByStrategy(tenantId, strategyId);
          const totalStrategyPosition = strategyPositions.reduce((sum, p) => sum + Math.abs(p.quantity), 0);
          await PositionLimitRepository.updateCurrentValue(tenantId, limit.limitId, totalStrategyPosition);
        } else if (limit.scope === 'PORTFOLIO') {
          // For portfolio limits, sum all positions
          const summary = await this.getPositions(tenantId);
          const totalPortfolioPosition = summary.positions.reduce((sum, p) => sum + Math.abs(p.quantity), 0);
          await PositionLimitRepository.updateCurrentValue(tenantId, limit.limitId, totalPortfolioPosition);
        }
      }
    } catch (error) {
      // Log error but don't fail the position update
      console.error('Failed to update position limits:', error);
    }
  }
};

/**
 * Clear all positions (for testing purposes)
 */
export function clearPositions(): void {
  positionStore.clear();
}

/**
 * Get the position store (for testing purposes)
 */
export function getPositionStore(): Map<string, Position> {
  return positionStore;
}
