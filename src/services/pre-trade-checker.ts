import { OrderRequest } from '../types/order';
import {
  RiskCheckResult,
  RiskCheckDetail,
  RiskCheckType
} from '../types/risk-engine';
import { PositionLimitService } from './position-limit';
import { DrawdownService } from './drawdown';
import { VolatilityService } from './volatility';
import { KillSwitchService } from './kill-switch';
import { CircuitBreakerService } from './circuit-breaker';
import { TradingContext } from '../types/circuit-breaker';

/**
 * Pre-Trade Checker Service
 * 
 * Validates all orders against risk rules before submission to an exchange.
 * Implements atomic pass/fail - either all checks pass or the order is rejected.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.5, 6.6
 */

/**
 * Configuration for pre-trade checks
 */
export interface PreTradeConfig {
  /** Maximum leverage allowed (e.g., 10 = 10x) */
  maxLeverage?: number;
  /** Portfolio value for percentage-based limit calculations */
  portfolioValue?: number;
  /** Available capital for the tenant */
  availableCapital?: number;
  /** Current positions map (assetId -> position size) */
  currentPositions?: Map<string, number>;
}

/**
 * Logging callback for pre-trade check events
 */
export type PreTradeLogCallback = (log: PreTradeLog) => Promise<void>;

/**
 * Pre-trade check log entry
 */
export interface PreTradeLog {
  orderId: string;
  tenantId: string;
  strategyId: string;
  assetId: string;
  checks: RiskCheckDetail[];
  approved: boolean;
  rejectionReason?: string;
  processingTimeMs: number;
  timestamp: string;
}

/**
 * Error thrown when pre-trade validation fails
 */
export class PreTradeValidationError extends Error {
  constructor(
    message: string,
    public readonly checks: RiskCheckDetail[],
    public readonly orderId: string
  ) {
    super(message);
    this.name = 'PreTradeValidationError';
  }
}


/**
 * Pre-Trade Checker Service Implementation
 * 
 * Orchestrates all risk checks for order validation:
 * - Kill switch status
 * - Circuit breaker status
 * - Position limits
 * - Drawdown status
 * - Volatility throttling
 * - Capital availability
 * - Leverage limits
 * 
 * Requirements: 6.1, 6.2, 6.5
 */
export const PreTradeCheckerService = {
  /**
   * Validate an order against all risk rules
   * 
   * This is the main entry point for pre-trade validation.
   * All checks are performed and the order is approved only if ALL checks pass.
   * 
   * Requirements: 6.1, 6.2, 6.5
   * 
   * @param order - The order to validate
   * @param config - Optional configuration for checks
   * @param logCallback - Optional callback for logging
   * @returns RiskCheckResult with approval status and check details
   */
  async validate(
    order: OrderRequest,
    config?: PreTradeConfig,
    logCallback?: PreTradeLogCallback
  ): Promise<RiskCheckResult> {
    const startTime = Date.now();
    const checks: RiskCheckDetail[] = [];
    const timestamp = new Date().toISOString();

    // 1. Check Kill Switch (highest priority - immediate rejection)
    const killSwitchCheck = await this.checkKillSwitch(order.tenantId);
    checks.push(killSwitchCheck);

    // 2. Check Circuit Breakers
    const circuitBreakerCheck = await this.checkCircuitBreakers(order);
    checks.push(circuitBreakerCheck);

    // 3. Check Position Limits
    const positionLimitCheck = await this.checkPositionLimits(order, config);
    checks.push(positionLimitCheck);

    // 4. Check Drawdown Status
    const drawdownCheck = await this.checkDrawdown(order);
    checks.push(drawdownCheck);

    // 5. Check Volatility Throttling
    const volatilityCheck = await this.checkVolatility(order);
    checks.push(volatilityCheck);

    // 6. Check Capital Availability
    const capitalCheck = this.checkCapitalAvailable(order, config);
    checks.push(capitalCheck);

    // 7. Check Leverage Limits
    const leverageCheck = this.checkLeverage(order, config);
    checks.push(leverageCheck);

    const processingTimeMs = Date.now() - startTime;

    // Determine overall approval - ALL checks must pass
    const failedChecks = checks.filter(c => !c.passed);
    const approved = failedChecks.length === 0;

    // Build rejection reason from failed checks
    const rejectionReason = approved
      ? undefined
      : this.buildRejectionReason(failedChecks);

    const result: RiskCheckResult = {
      approved,
      orderId: order.orderId,
      checks,
      rejectionReason,
      processingTimeMs,
      timestamp
    };

    // Create log entry
    const logEntry: PreTradeLog = {
      orderId: order.orderId,
      tenantId: order.tenantId,
      strategyId: order.strategyId,
      assetId: order.assetId,
      checks,
      approved,
      rejectionReason,
      processingTimeMs,
      timestamp
    };

    // Log the check result via callback if provided
    if (logCallback) {
      await logCallback(logEntry);
    }

    // Always log to console for debugging/audit trail
    this.logToConsole(logEntry);

    return result;
  },

  /**
   * Log pre-trade check result to console
   * 
   * Requirements: 6.6 - Log all checks with pass/fail status
   * 
   * @param log - The pre-trade log entry
   */
  logToConsole(log: PreTradeLog): void {
    const checkSummary = log.checks
      .map(c => `${c.checkType}:${c.passed ? 'PASS' : 'FAIL'}`)
      .join(', ');

    const logLevel = log.approved ? 'info' : 'warn';
    const message = `Pre-trade check [${log.orderId}] ${log.approved ? 'APPROVED' : 'REJECTED'} - ${checkSummary} (${log.processingTimeMs}ms)`;

    if (logLevel === 'warn') {
      console.warn(message, { rejectionReason: log.rejectionReason });
    } else {
      console.log(message);
    }
  },

  /**
   * Check if kill switch is active
   * 
   * Requirements: 6.2 - Check active restrictions
   * 
   * @param tenantId - The tenant identifier
   * @returns RiskCheckDetail for kill switch status
   */
  async checkKillSwitch(tenantId: string): Promise<RiskCheckDetail> {
    try {
      const isActive = await KillSwitchService.isActive(tenantId);

      if (isActive) {
        const state = await KillSwitchService.getState(tenantId);
        return {
          checkType: 'KILL_SWITCH',
          passed: false,
          message: `Kill switch is active: ${state.activationReason || 'No reason provided'}`,
          currentValue: 1,
          limitValue: 0
        };
      }

      return {
        checkType: 'KILL_SWITCH',
        passed: true,
        message: 'Kill switch is not active'
      };
    } catch (error) {
      // Fail-safe: if we can't check kill switch, reject the order
      return {
        checkType: 'KILL_SWITCH',
        passed: false,
        message: `Kill switch check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },

  /**
   * Check circuit breaker status
   * 
   * Requirements: 6.2 - Check active restrictions
   * 
   * @param order - The order to check
   * @returns RiskCheckDetail for circuit breaker status
   */
  async checkCircuitBreakers(order: OrderRequest): Promise<RiskCheckDetail> {
    try {
      const context: TradingContext = {
        strategyId: order.strategyId,
        assetId: order.assetId
      };

      const result = await CircuitBreakerService.checkBreakers(order.tenantId, context);

      if (!result.allClosed) {
        const openBreakerNames = result.openBreakers.map(b => b.name).join(', ');
        const halfOpenBreakerNames = result.halfOpenBreakers.map(b => b.name).join(', ');
        
        let message = 'Circuit breakers triggered: ';
        if (result.openBreakers.length > 0) {
          message += `OPEN: ${openBreakerNames}`;
        }
        if (result.halfOpenBreakers.length > 0) {
          message += result.openBreakers.length > 0 ? `, HALF_OPEN: ${halfOpenBreakerNames}` : `HALF_OPEN: ${halfOpenBreakerNames}`;
        }

        return {
          checkType: 'CIRCUIT_BREAKER',
          passed: false,
          message,
          currentValue: result.openBreakers.length + result.halfOpenBreakers.length,
          limitValue: 0
        };
      }

      return {
        checkType: 'CIRCUIT_BREAKER',
        passed: true,
        message: 'All circuit breakers are closed'
      };
    } catch (error) {
      // Fail-safe: if we can't check circuit breakers, reject the order
      return {
        checkType: 'CIRCUIT_BREAKER',
        passed: false,
        message: `Circuit breaker check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },


  /**
   * Check position limits
   * 
   * Requirements: 6.2 - Check position limits
   * 
   * @param order - The order to check
   * @param config - Optional configuration with current positions and portfolio value
   * @returns RiskCheckDetail for position limit status
   */
  async checkPositionLimits(
    order: OrderRequest,
    config?: PreTradeConfig
  ): Promise<RiskCheckDetail> {
    try {
      const currentPositions = config?.currentPositions ?? new Map<string, number>();
      const portfolioValue = config?.portfolioValue;

      const limitResults = await PositionLimitService.checkOrderAgainstLimits(
        order.tenantId,
        order,
        currentPositions,
        portfolioValue
      );

      // Check if any limit was exceeded
      const exceededLimits = limitResults.filter(r => !r.withinLimit);

      if (exceededLimits.length > 0) {
        const firstExceeded = exceededLimits[0];
        return {
          checkType: 'POSITION_LIMIT',
          passed: false,
          message: `Position limit exceeded: current ${firstExceeded.currentValue}, max ${firstExceeded.maxValue}, would exceed by ${firstExceeded.wouldExceedBy}`,
          currentValue: firstExceeded.currentValue,
          limitValue: firstExceeded.maxValue
        };
      }

      // All limits passed
      const firstResult = limitResults[0];
      return {
        checkType: 'POSITION_LIMIT',
        passed: true,
        message: `Position within limits: ${firstResult.currentValue} / ${firstResult.maxValue}`,
        currentValue: firstResult.currentValue,
        limitValue: firstResult.maxValue
      };
    } catch (error) {
      // Fail-safe: if we can't check position limits, reject the order
      return {
        checkType: 'POSITION_LIMIT',
        passed: false,
        message: `Position limit check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },

  /**
   * Check drawdown status
   * 
   * Requirements: 6.2 - Check active restrictions
   * 
   * @param order - The order to check
   * @returns RiskCheckDetail for drawdown status
   */
  async checkDrawdown(order: OrderRequest): Promise<RiskCheckDetail> {
    try {
      const result = await DrawdownService.checkDrawdown(order.tenantId, order.strategyId);

      if (!result.tradingAllowed) {
        return {
          checkType: 'DRAWDOWN',
          passed: false,
          message: `Trading paused due to drawdown: ${result.status} (${result.currentDrawdownPercent.toFixed(2)}%)`,
          currentValue: result.currentDrawdownPercent,
          limitValue: result.distanceToMax + result.currentDrawdownPercent
        };
      }

      return {
        checkType: 'DRAWDOWN',
        passed: true,
        message: `Drawdown within limits: ${result.currentDrawdownPercent.toFixed(2)}% (${result.status})`,
        currentValue: result.currentDrawdownPercent,
        limitValue: result.distanceToMax + result.currentDrawdownPercent
      };
    } catch (error) {
      // If no drawdown state exists, allow trading
      if (error instanceof Error && error.message.includes('No drawdown state')) {
        return {
          checkType: 'DRAWDOWN',
          passed: true,
          message: 'No drawdown tracking configured'
        };
      }

      // Fail-safe: if we can't check drawdown, reject the order
      return {
        checkType: 'DRAWDOWN',
        passed: false,
        message: `Drawdown check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },

  /**
   * Check volatility throttling
   * 
   * Requirements: 6.2 - Check active restrictions
   * 
   * @param order - The order to check
   * @returns RiskCheckDetail for volatility status
   */
  async checkVolatility(order: OrderRequest): Promise<RiskCheckDetail> {
    try {
      const isEntry = order.side === 'BUY';
      const result = await VolatilityService.checkThrottle(order.tenantId, order.assetId);

      // Check if new entries are blocked (EXTREME volatility)
      if (isEntry && !result.allowNewEntries) {
        return {
          checkType: 'VOLATILITY',
          passed: false,
          message: `New entries blocked due to ${result.level} volatility`,
          currentValue: result.throttlePercent,
          limitValue: 100
        };
      }

      // For exits or when entries are allowed
      return {
        checkType: 'VOLATILITY',
        passed: true,
        message: `Volatility level: ${result.level} (throttle: ${result.throttlePercent}%)`,
        currentValue: result.throttlePercent,
        limitValue: 100
      };
    } catch (error) {
      // If no volatility state exists, allow trading
      return {
        checkType: 'VOLATILITY',
        passed: true,
        message: 'No volatility tracking configured'
      };
    }
  },

  /**
   * Check capital availability
   * 
   * Requirements: 6.2 - Check available capital
   * 
   * @param order - The order to check
   * @param config - Configuration with available capital
   * @returns RiskCheckDetail for capital availability
   */
  checkCapitalAvailable(order: OrderRequest, config?: PreTradeConfig): RiskCheckDetail {
    // If no capital config provided, skip this check
    if (!config?.availableCapital) {
      return {
        checkType: 'CAPITAL_AVAILABLE',
        passed: true,
        message: 'Capital check skipped (no capital config)'
      };
    }

    const orderValue = order.quantity * (order.price ?? 0);
    
    // Only check capital for buy orders
    if (order.side === 'BUY' && orderValue > config.availableCapital) {
      return {
        checkType: 'CAPITAL_AVAILABLE',
        passed: false,
        message: `Insufficient capital: order value ${orderValue}, available ${config.availableCapital}`,
        currentValue: orderValue,
        limitValue: config.availableCapital
      };
    }

    return {
      checkType: 'CAPITAL_AVAILABLE',
      passed: true,
      message: `Capital available: ${config.availableCapital}`,
      currentValue: orderValue,
      limitValue: config.availableCapital
    };
  },

  /**
   * Check leverage limits
   * 
   * Requirements: 6.2 - Check leverage limits
   * 
   * @param order - The order to check
   * @param config - Configuration with max leverage and portfolio value
   * @returns RiskCheckDetail for leverage status
   */
  checkLeverage(order: OrderRequest, config?: PreTradeConfig): RiskCheckDetail {
    // If no leverage config provided, skip this check
    if (!config?.maxLeverage || !config?.portfolioValue) {
      return {
        checkType: 'LEVERAGE',
        passed: true,
        message: 'Leverage check skipped (no leverage config)'
      };
    }

    const orderValue = order.quantity * (order.price ?? 0);
    const currentLeverage = orderValue / config.portfolioValue;

    if (currentLeverage > config.maxLeverage) {
      return {
        checkType: 'LEVERAGE',
        passed: false,
        message: `Leverage exceeded: ${currentLeverage.toFixed(2)}x > max ${config.maxLeverage}x`,
        currentValue: currentLeverage,
        limitValue: config.maxLeverage
      };
    }

    return {
      checkType: 'LEVERAGE',
      passed: true,
      message: `Leverage within limits: ${currentLeverage.toFixed(2)}x / ${config.maxLeverage}x`,
      currentValue: currentLeverage,
      limitValue: config.maxLeverage
    };
  },


  /**
   * Build a human-readable rejection reason from failed checks
   * 
   * Requirements: 6.3 - Return detailed failure reasons
   * 
   * @param failedChecks - Array of failed check details
   * @returns Human-readable rejection reason
   */
  buildRejectionReason(failedChecks: RiskCheckDetail[]): string {
    if (failedChecks.length === 0) {
      return '';
    }

    if (failedChecks.length === 1) {
      return failedChecks[0].message;
    }

    const reasons = failedChecks.map(c => `${c.checkType}: ${c.message}`);
    return `Multiple checks failed: ${reasons.join('; ')}`;
  },

  /**
   * Get detailed rejection information for a failed check
   * 
   * Requirements: 6.3 - Return detailed failure reasons
   * 
   * @param check - The failed check detail
   * @returns Detailed rejection information
   */
  getDetailedRejection(check: RiskCheckDetail): {
    checkType: RiskCheckType;
    message: string;
    currentValue?: number;
    limitValue?: number;
    exceededBy?: number;
  } {
    const result: {
      checkType: RiskCheckType;
      message: string;
      currentValue?: number;
      limitValue?: number;
      exceededBy?: number;
    } = {
      checkType: check.checkType,
      message: check.message
    };

    if (check.currentValue !== undefined) {
      result.currentValue = check.currentValue;
    }

    if (check.limitValue !== undefined) {
      result.limitValue = check.limitValue;
    }

    if (check.currentValue !== undefined && check.limitValue !== undefined) {
      result.exceededBy = check.currentValue - check.limitValue;
    }

    return result;
  },

  /**
   * Validate order and throw if rejected
   * 
   * Convenience method that throws PreTradeValidationError on rejection.
   * 
   * @param order - The order to validate
   * @param config - Optional configuration for checks
   * @param logCallback - Optional callback for logging
   * @throws PreTradeValidationError if order is rejected
   */
  async validateOrThrow(
    order: OrderRequest,
    config?: PreTradeConfig,
    logCallback?: PreTradeLogCallback
  ): Promise<RiskCheckResult> {
    const result = await this.validate(order, config, logCallback);

    if (!result.approved) {
      throw new PreTradeValidationError(
        result.rejectionReason || 'Order rejected by pre-trade checks',
        result.checks,
        order.orderId
      );
    }

    return result;
  },

  /**
   * Check if trading is allowed for a tenant/strategy
   * 
   * Quick check without full order validation.
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy identifier
   * @returns True if trading is allowed
   */
  async isTradingAllowed(tenantId: string, strategyId?: string): Promise<boolean> {
    // Check kill switch
    const killSwitchActive = await KillSwitchService.isActive(tenantId);
    if (killSwitchActive) {
      return false;
    }

    // Check drawdown
    const drawdownAllowed = await DrawdownService.isTradingAllowed(tenantId, strategyId);
    if (!drawdownAllowed) {
      return false;
    }

    // Check circuit breakers
    const context: TradingContext = { strategyId };
    const breakerResult = await CircuitBreakerService.checkBreakers(tenantId, context);
    if (!breakerResult.allClosed) {
      return false;
    }

    return true;
  },

  /**
   * Get all active restrictions for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns Array of active restriction descriptions
   */
  async getActiveRestrictions(tenantId: string): Promise<string[]> {
    const restrictions: string[] = [];

    // Check kill switch
    const killSwitchState = await KillSwitchService.getState(tenantId);
    if (killSwitchState.active) {
      restrictions.push(`Kill switch active: ${killSwitchState.activationReason || 'No reason'}`);
    }

    // Check circuit breakers
    const breakerResult = await CircuitBreakerService.checkBreakers(tenantId, {});
    for (const breaker of breakerResult.openBreakers) {
      restrictions.push(`Circuit breaker OPEN: ${breaker.name}`);
    }
    for (const breaker of breakerResult.halfOpenBreakers) {
      restrictions.push(`Circuit breaker HALF_OPEN: ${breaker.name}`);
    }

    // Check paused strategies
    const pausedStrategies = await DrawdownService.getPausedStrategies(tenantId);
    for (const state of pausedStrategies) {
      restrictions.push(`Strategy paused (drawdown): ${state.strategyId || 'portfolio'}`);
    }

    return restrictions;
  },

  /**
   * Create a standard logger callback that stores logs in an array
   * 
   * Useful for testing and batch processing of logs.
   * 
   * Requirements: 6.6 - Log all checks with pass/fail status
   * 
   * @returns Object with logger callback and logs array
   */
  createArrayLogger(): { logger: PreTradeLogCallback; logs: PreTradeLog[] } {
    const logs: PreTradeLog[] = [];
    const logger: PreTradeLogCallback = async (log: PreTradeLog) => {
      logs.push(log);
    };
    return { logger, logs };
  },

  /**
   * Format a pre-trade log entry as a structured JSON string
   * 
   * Requirements: 6.6 - Log all checks with pass/fail status
   * 
   * @param log - The pre-trade log entry
   * @returns JSON string representation
   */
  formatLogAsJson(log: PreTradeLog): string {
    return JSON.stringify({
      type: 'PRE_TRADE_CHECK',
      orderId: log.orderId,
      tenantId: log.tenantId,
      strategyId: log.strategyId,
      assetId: log.assetId,
      approved: log.approved,
      rejectionReason: log.rejectionReason,
      processingTimeMs: log.processingTimeMs,
      timestamp: log.timestamp,
      checks: log.checks.map(c => ({
        type: c.checkType,
        passed: c.passed,
        message: c.message,
        currentValue: c.currentValue,
        limitValue: c.limitValue
      }))
    });
  }
};
