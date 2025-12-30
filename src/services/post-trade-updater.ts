import { ExecutionReport, PostTradeResult } from '../types/order';
import { RiskEvent, RiskEventInput, RiskEventSeverity } from '../types/risk-event';
import { PositionTracker, Position } from './position-tracker';
import { DrawdownService } from './drawdown';
import { CircuitBreakerService } from './circuit-breaker';
import { KillSwitchService } from './kill-switch';
import { generateUUID } from '../utils/uuid';

/**
 * Post-Trade Updater Service
 * 
 * Processes executed trades and updates risk state:
 * - Updates positions
 * - Calculates realized P&L
 * - Updates drawdown state
 * - Triggers protective actions on threshold breaches
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

/**
 * Configuration for post-trade processing
 */
export interface PostTradeConfig {
  /** Enable automatic protective actions on threshold breach */
  enableProtectiveActions: boolean;
  /** Threshold for rapid loss auto-kill (percentage) */
  rapidLossThreshold?: number;
  /** Time window for rapid loss calculation (minutes) */
  rapidLossTimeWindowMinutes?: number;
}

/**
 * Exchange position data for reconciliation
 */
export interface ExchangePositionData {
  assetId: string;
  quantity: number;
  averagePrice: number;
  timestamp: string;
}

/**
 * Reconciliation result
 */
export interface ReconciliationResult {
  assetId: string;
  internalPosition: number;
  exchangePosition: number;
  discrepancy: number;
  reconciled: boolean;
  alertGenerated: boolean;
}

/**
 * Alert callback for risk events
 */
export type RiskEventCallback = (event: RiskEventInput) => Promise<RiskEvent>;

/**
 * Internal state for tracking recent P&L for rapid loss detection
 */
interface RecentPnL {
  tenantId: string;
  strategyId: string;
  pnl: number;
  timestamp: string;
}

// In-memory store for recent P&L (in production, use Redis/ElastiCache)
const recentPnLStore: Map<string, RecentPnL[]> = new Map();

// In-memory store for portfolio values (in production, use database)
const portfolioValueStore: Map<string, number> = new Map();

/**
 * Get key for P&L store
 */
function getPnLKey(tenantId: string, strategyId: string): string {
  return `${tenantId}:${strategyId}`;
}


/**
 * Post-Trade Updater Service implementation
 */
export const PostTradeUpdaterService = {
  /**
   * Process an execution report and update all risk state
   * 
   * This is the main entry point for post-trade processing.
   * It updates positions, P&L, drawdown, and triggers protective actions.
   * 
   * Requirements: 7.1, 7.2, 7.3
   * 
   * @param execution - The execution report from a completed trade
   * @param config - Optional configuration for post-trade processing
   * @param riskEventCallback - Optional callback for logging risk events
   * @returns Post-trade result with updated state and triggered events
   */
  async processExecution(
    execution: ExecutionReport,
    config?: PostTradeConfig,
    riskEventCallback?: RiskEventCallback
  ): Promise<PostTradeResult> {
    const riskEventsTriggered: RiskEvent[] = [];
    const effectiveConfig: PostTradeConfig = {
      enableProtectiveActions: config?.enableProtectiveActions ?? true,
      rapidLossThreshold: config?.rapidLossThreshold ?? 5,
      rapidLossTimeWindowMinutes: config?.rapidLossTimeWindowMinutes ?? 5
    };

    // 1. Update position
    const position = await PositionTracker.processExecution(execution);
    
    // 2. Calculate realized P&L
    const realizedPnL = this.calculateRealizedPnL(execution, position);
    
    // 3. Record P&L for rapid loss detection
    this.recordPnL(execution.tenantId, execution.strategyId, realizedPnL);
    
    // 4. Update portfolio value and drawdown
    const portfolioValue = await this.updatePortfolioValue(
      execution.tenantId,
      execution.strategyId,
      realizedPnL
    );
    
    // 5. Update drawdown state
    const drawdownResult = await DrawdownService.monitorAndUpdate(
      execution.tenantId,
      execution.strategyId,
      portfolioValue
    );
    
    // 6. Check for threshold breaches and trigger protective actions
    if (effectiveConfig.enableProtectiveActions) {
      const protectiveEvents = await this.checkAndTriggerProtectiveActions(
        execution,
        realizedPnL,
        drawdownResult.state.drawdownPercent,
        effectiveConfig,
        riskEventCallback
      );
      riskEventsTriggered.push(...protectiveEvents);
    }
    
    // 7. Log drawdown events if any
    if (drawdownResult.alertSent && riskEventCallback) {
      const drawdownEvent = await riskEventCallback({
        tenantId: execution.tenantId,
        eventType: drawdownResult.alertType === 'WARNING' ? 'DRAWDOWN_WARNING' : 'DRAWDOWN_BREACH',
        severity: drawdownResult.alertType === 'WARNING' ? 'WARNING' : 'CRITICAL',
        strategyId: execution.strategyId,
        assetId: execution.assetId,
        description: `Drawdown ${drawdownResult.alertType?.toLowerCase()}: ${drawdownResult.state.drawdownPercent.toFixed(2)}%`,
        triggerCondition: `Drawdown reached ${drawdownResult.state.drawdownPercent.toFixed(2)}%`,
        actionTaken: drawdownResult.actionTaken === 'PAUSED' ? 'Strategy paused' : 'Alert sent',
        metadata: {
          drawdownPercent: drawdownResult.state.drawdownPercent,
          peakValue: drawdownResult.state.peakValue,
          currentValue: drawdownResult.state.currentValue
        }
      });
      riskEventsTriggered.push(drawdownEvent);
    }

    return {
      positionUpdated: true,
      newPositionSize: position.quantity,
      realizedPnL,
      drawdownUpdated: true,
      newDrawdownPercent: drawdownResult.state.drawdownPercent,
      riskEventsTriggered
    };
  },

  /**
   * Calculate realized P&L from an execution
   * 
   * For SELL orders, P&L = (executedPrice - averagePrice) * executedQuantity - commission
   * For BUY orders, P&L is just the negative commission (no realized P&L until sold)
   * 
   * @param execution - The execution report
   * @param position - The updated position after execution
   * @returns The realized P&L
   */
  calculateRealizedPnL(execution: ExecutionReport, position: Position): number {
    if (execution.side === 'SELL') {
      // Realized P&L on sell = (sell price - avg cost) * quantity - commission
      const grossPnL = (execution.executedPrice - position.averagePrice) * execution.executedQuantity;
      return grossPnL - execution.commission;
    }
    // For buys, only commission is realized (negative)
    return -execution.commission;
  },

  /**
   * Record P&L for rapid loss detection
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param pnl - The realized P&L
   */
  recordPnL(tenantId: string, strategyId: string, pnl: number): void {
    const key = getPnLKey(tenantId, strategyId);
    const now = new Date().toISOString();
    
    const existing = recentPnLStore.get(key) || [];
    existing.push({ tenantId, strategyId, pnl, timestamp: now });
    
    // Keep only last hour of data
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const filtered = existing.filter(p => p.timestamp >= oneHourAgo);
    
    recentPnLStore.set(key, filtered);
  },

  /**
   * Calculate recent loss percentage within a time window
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param timeWindowMinutes - The time window in minutes
   * @returns The loss percentage (positive number for losses)
   */
  calculateRecentLossPercent(
    tenantId: string,
    strategyId: string,
    timeWindowMinutes: number
  ): number {
    const key = getPnLKey(tenantId, strategyId);
    const records = recentPnLStore.get(key) || [];
    
    const cutoff = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
    const recentRecords = records.filter(r => r.timestamp >= cutoff);
    
    const totalPnL = recentRecords.reduce((sum, r) => sum + r.pnl, 0);
    
    // Get portfolio value for percentage calculation
    const portfolioValue = portfolioValueStore.get(tenantId) || 100000;
    
    // Return loss as positive percentage
    return totalPnL < 0 ? Math.abs(totalPnL / portfolioValue) * 100 : 0;
  },


  /**
   * Update portfolio value after a trade
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param pnlChange - The P&L change from the trade
   * @returns The new portfolio value
   */
  async updatePortfolioValue(
    tenantId: string,
    strategyId: string,
    pnlChange: number
  ): Promise<number> {
    const currentValue = portfolioValueStore.get(tenantId) || 100000;
    const newValue = currentValue + pnlChange;
    portfolioValueStore.set(tenantId, newValue);
    return newValue;
  },

  /**
   * Check for threshold breaches and trigger protective actions
   * 
   * Requirements: 7.3
   * 
   * @param execution - The execution report
   * @param realizedPnL - The realized P&L
   * @param drawdownPercent - Current drawdown percentage
   * @param config - Post-trade configuration
   * @param riskEventCallback - Optional callback for logging risk events
   * @returns Array of triggered risk events
   */
  async checkAndTriggerProtectiveActions(
    execution: ExecutionReport,
    realizedPnL: number,
    drawdownPercent: number,
    config: PostTradeConfig,
    riskEventCallback?: RiskEventCallback
  ): Promise<RiskEvent[]> {
    const events: RiskEvent[] = [];
    
    // Check for rapid loss
    if (config.rapidLossThreshold && config.rapidLossTimeWindowMinutes) {
      const recentLossPercent = this.calculateRecentLossPercent(
        execution.tenantId,
        execution.strategyId,
        config.rapidLossTimeWindowMinutes
      );
      
      if (recentLossPercent >= config.rapidLossThreshold) {
        // Trigger kill switch for rapid loss
        const triggered = await KillSwitchService.checkAutoTriggers(
          execution.tenantId,
          {
            eventType: 'DRAWDOWN_BREACH',
            severity: 'CRITICAL',
            lossPercent: recentLossPercent,
            timestamp: new Date().toISOString()
          }
        );
        
        if (triggered && riskEventCallback) {
          const event = await riskEventCallback({
            tenantId: execution.tenantId,
            eventType: 'KILL_SWITCH_ACTIVATED',
            severity: 'EMERGENCY',
            strategyId: execution.strategyId,
            assetId: execution.assetId,
            description: `Kill switch activated due to rapid loss: ${recentLossPercent.toFixed(2)}%`,
            triggerCondition: `Loss of ${recentLossPercent.toFixed(2)}% in ${config.rapidLossTimeWindowMinutes} minutes`,
            actionTaken: 'All trading halted',
            metadata: {
              lossPercent: recentLossPercent,
              timeWindowMinutes: config.rapidLossTimeWindowMinutes,
              threshold: config.rapidLossThreshold
            }
          });
          events.push(event);
        }
      }
    }
    
    // Record trading event for circuit breakers
    await CircuitBreakerService.recordEvent(execution.tenantId, {
      eventType: 'TRADE',
      strategyId: execution.strategyId,
      assetId: execution.assetId,
      success: true,
      lossAmount: realizedPnL < 0 ? Math.abs(realizedPnL) : undefined,
      timestamp: execution.timestamp
    });
    
    // Check circuit breakers
    const breakerResult = await CircuitBreakerService.checkBreakers(
      execution.tenantId,
      {
        strategyId: execution.strategyId,
        assetId: execution.assetId,
        recentLossPercent: this.calculateRecentLossPercent(
          execution.tenantId,
          execution.strategyId,
          5
        )
      }
    );
    
    if (!breakerResult.allClosed && riskEventCallback) {
      for (const breaker of breakerResult.openBreakers) {
        const event = await riskEventCallback({
          tenantId: execution.tenantId,
          eventType: 'CIRCUIT_BREAKER_TRIP',
          severity: 'CRITICAL',
          strategyId: execution.strategyId,
          assetId: execution.assetId,
          description: `Circuit breaker "${breaker.name}" tripped`,
          triggerCondition: `Condition met: ${JSON.stringify(breaker.condition)}`,
          actionTaken: `Trading paused for ${breaker.scope}`,
          metadata: {
            breakerId: breaker.breakerId,
            breakerName: breaker.name,
            condition: breaker.condition,
            scope: breaker.scope
          }
        });
        events.push(event);
      }
    }
    
    return events;
  },

  /**
   * Reconcile internal position with exchange data
   * 
   * Requirements: 7.4, 7.5
   * 
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchangeData - Position data from the exchange
   * @param riskEventCallback - Optional callback for logging risk events
   * @returns Reconciliation result
   */
  async reconcilePosition(
    tenantId: string,
    assetId: string,
    exchangeData: ExchangePositionData,
    riskEventCallback?: RiskEventCallback
  ): Promise<ReconciliationResult> {
    // Get internal position
    const internalPosition = await PositionTracker.getPosition(tenantId, assetId);
    const internalQuantity = internalPosition?.quantity || 0;
    
    // Calculate discrepancy
    const discrepancy = Math.abs(internalQuantity - exchangeData.quantity);
    const hasDiscrepancy = discrepancy > 0.0001; // Small tolerance for floating point
    
    let alertGenerated = false;
    
    if (hasDiscrepancy) {
      // Use exchange data as source of truth
      // In production, this would update the position in the database
      console.log(
        `Position reconciliation: Internal=${internalQuantity}, Exchange=${exchangeData.quantity}, ` +
        `Discrepancy=${discrepancy}. Using exchange data as source of truth.`
      );
      
      // Generate alert
      if (riskEventCallback) {
        await riskEventCallback({
          tenantId,
          eventType: 'EXCHANGE_ERROR',
          severity: 'WARNING',
          assetId,
          description: `Position discrepancy detected for ${assetId}`,
          triggerCondition: `Internal: ${internalQuantity}, Exchange: ${exchangeData.quantity}`,
          actionTaken: 'Using exchange data as source of truth',
          metadata: {
            internalPosition: internalQuantity,
            exchangePosition: exchangeData.quantity,
            discrepancy,
            exchangeTimestamp: exchangeData.timestamp
          }
        });
        alertGenerated = true;
      }
    }
    
    return {
      assetId,
      internalPosition: internalQuantity,
      exchangePosition: exchangeData.quantity,
      discrepancy,
      reconciled: hasDiscrepancy,
      alertGenerated
    };
  },

  /**
   * Batch reconcile multiple positions
   * 
   * @param tenantId - The tenant identifier
   * @param exchangePositions - Array of exchange position data
   * @param riskEventCallback - Optional callback for logging risk events
   * @returns Array of reconciliation results
   */
  async batchReconcile(
    tenantId: string,
    exchangePositions: ExchangePositionData[],
    riskEventCallback?: RiskEventCallback
  ): Promise<ReconciliationResult[]> {
    const results: ReconciliationResult[] = [];
    
    for (const exchangeData of exchangePositions) {
      const result = await this.reconcilePosition(
        tenantId,
        exchangeData.assetId,
        exchangeData,
        riskEventCallback
      );
      results.push(result);
    }
    
    return results;
  },

  /**
   * Get current portfolio value for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The current portfolio value
   */
  getPortfolioValue(tenantId: string): number {
    return portfolioValueStore.get(tenantId) || 100000;
  },

  /**
   * Set portfolio value (for initialization or testing)
   * 
   * @param tenantId - The tenant identifier
   * @param value - The portfolio value
   */
  setPortfolioValue(tenantId: string, value: number): void {
    portfolioValueStore.set(tenantId, value);
  },

  /**
   * Clear all stored data (for testing)
   */
  clearAll(): void {
    recentPnLStore.clear();
    portfolioValueStore.clear();
  }
};

/**
 * Clear recent P&L store (for testing)
 */
export function clearRecentPnL(): void {
  recentPnLStore.clear();
}

/**
 * Clear portfolio value store (for testing)
 */
export function clearPortfolioValues(): void {
  portfolioValueStore.clear();
}
