import { generateUUID } from '../utils/uuid';
import {
  CircuitBreaker,
  CircuitBreakerInput,
  CircuitBreakerState,
  CircuitBreakerCheckResult,
  CircuitBreakerCondition,
  TradingContext,
  TradingEvent
} from '../types/circuit-breaker';
import { CircuitBreakerRepository } from '../repositories/circuit-breaker';

/**
 * Error thrown when authentication is required but not provided or invalid
 */
export class AuthenticationRequiredError extends Error {
  constructor(operation: string) {
    super(`Authentication required for operation: ${operation}`);
    this.name = 'AuthenticationRequiredError';
  }
}

/**
 * Error thrown when circuit breaker operation fails
 */
export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Alert callback type for sending circuit breaker alerts
 */
export type CircuitBreakerAlertCallback = (alert: CircuitBreakerAlert) => Promise<void>;

/**
 * Circuit breaker alert information
 */
export interface CircuitBreakerAlert {
  tenantId: string;
  breakerId: string;
  breakerName: string;
  alertType: 'TRIPPED' | 'RESET' | 'HALF_OPEN' | 'CLOSED';
  reason: string;
  previousState: CircuitBreakerState;
  newState: CircuitBreakerState;
  timestamp: string;
}

/**
 * Result of condition evaluation
 */
export interface ConditionEvaluationResult {
  triggered: boolean;
  currentValue: number;
  threshold: number;
  message: string;
}

/**
 * Circuit Breaker Service - manages automatic trading pauses based on conditions
 * 
 * Circuit breakers automatically pause trading when dangerous conditions are detected:
 * - Loss rate exceeds threshold
 * - Consecutive failures exceed count
 * - Price deviation exceeds threshold
 * - Error rate exceeds threshold
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6
 */
export const CircuitBreakerService = {
  /**
   * Create a new circuit breaker
   * 
   * @param tenantId - The tenant identifier
   * @param config - The circuit breaker configuration
   * @returns The created circuit breaker
   */
  async createBreaker(tenantId: string, config: CircuitBreakerInput): Promise<CircuitBreaker> {
    const breakerId = generateUUID();
    const now = new Date().toISOString();

    const breaker: CircuitBreaker = {
      breakerId,
      tenantId,
      name: config.name,
      condition: config.condition,
      scope: config.scope,
      scopeId: config.scopeId,
      state: 'CLOSED',
      tripCount: 0,
      cooldownMinutes: config.cooldownMinutes,
      autoResetEnabled: config.autoResetEnabled
    };

    await CircuitBreakerRepository.putBreaker(tenantId, breaker);
    return breaker;
  },

  /**
   * Get a circuit breaker by ID
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @returns The circuit breaker, or null if not found
   */
  async getBreaker(tenantId: string, breakerId: string): Promise<CircuitBreaker | null> {
    return CircuitBreakerRepository.getBreaker(tenantId, breakerId);
  },

  /**
   * List all circuit breakers for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns Array of circuit breakers
   */
  async listBreakers(tenantId: string): Promise<CircuitBreaker[]> {
    const result = await CircuitBreakerRepository.listBreakers({ tenantId });
    return result.items;
  },

  /**
   * Evaluate a circuit breaker condition against current context
   * 
   * Requirements: 5.1, 5.3
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param condition - The condition to evaluate
   * @param context - The current trading context
   * @returns Evaluation result with triggered status and details
   */
  evaluateCondition(
    tenantId: string,
    breakerId: string,
    condition: CircuitBreakerCondition,
    context: TradingContext
  ): ConditionEvaluationResult {
    switch (condition.type) {
      case 'LOSS_RATE': {
        const lossRate = CircuitBreakerRepository.calculateLossRate(
          tenantId,
          breakerId,
          condition.timeWindowMinutes
        );
        // Also check context for recent loss percent
        const contextLoss = context.recentLossPercent ?? 0;
        const effectiveLoss = Math.max(lossRate, contextLoss);
        
        return {
          triggered: effectiveLoss >= condition.lossPercent,
          currentValue: effectiveLoss,
          threshold: condition.lossPercent,
          message: `Loss rate ${effectiveLoss.toFixed(2)}% ${effectiveLoss >= condition.lossPercent ? 'exceeds' : 'below'} threshold ${condition.lossPercent}%`
        };
      }

      case 'CONSECUTIVE_FAILURES': {
        const consecutiveFailures = CircuitBreakerRepository.getConsecutiveFailures(
          tenantId,
          breakerId
        );
        
        return {
          triggered: consecutiveFailures >= condition.count,
          currentValue: consecutiveFailures,
          threshold: condition.count,
          message: `Consecutive failures ${consecutiveFailures} ${consecutiveFailures >= condition.count ? 'exceeds' : 'below'} threshold ${condition.count}`
        };
      }

      case 'PRICE_DEVIATION': {
        const maxDeviation = CircuitBreakerRepository.getMaxPriceDeviation(
          tenantId,
          breakerId,
          condition.timeWindowMinutes
        );
        // Also check context for price deviation
        const contextDeviation = context.priceDeviation !== undefined 
          ? Math.abs(context.priceDeviation) 
          : 0;
        const effectiveDeviation = Math.max(maxDeviation, contextDeviation);
        
        return {
          triggered: effectiveDeviation >= condition.deviationPercent,
          currentValue: effectiveDeviation,
          threshold: condition.deviationPercent,
          message: `Price deviation ${effectiveDeviation.toFixed(2)}% ${effectiveDeviation >= condition.deviationPercent ? 'exceeds' : 'below'} threshold ${condition.deviationPercent}%`
        };
      }

      case 'ERROR_RATE': {
        const errorRate = CircuitBreakerRepository.calculateErrorRate(
          tenantId,
          breakerId,
          condition.sampleSize
        );
        // Also check context for error rate
        const contextErrorRate = context.recentErrorRate ?? 0;
        const effectiveErrorRate = Math.max(errorRate, contextErrorRate);
        
        return {
          triggered: effectiveErrorRate >= condition.errorPercent,
          currentValue: effectiveErrorRate,
          threshold: condition.errorPercent,
          message: `Error rate ${effectiveErrorRate.toFixed(2)}% ${effectiveErrorRate >= condition.errorPercent ? 'exceeds' : 'below'} threshold ${condition.errorPercent}%`
        };
      }

      default:
        return {
          triggered: false,
          currentValue: 0,
          threshold: 0,
          message: 'Unknown condition type'
        };
    }
  },

  /**
   * Check if a circuit breaker should trip based on current context
   * 
   * @param tenantId - The tenant identifier
   * @param breaker - The circuit breaker to check
   * @param context - The current trading context
   * @returns True if the breaker should trip
   */
  shouldTrip(
    tenantId: string,
    breaker: CircuitBreaker,
    context: TradingContext
  ): boolean {
    // Only check if breaker is CLOSED or HALF_OPEN
    if (breaker.state === 'OPEN') {
      return false;
    }

    // Check if context matches breaker scope
    if (!this.contextMatchesScope(breaker, context)) {
      return false;
    }

    const evaluation = this.evaluateCondition(
      tenantId,
      breaker.breakerId,
      breaker.condition,
      context
    );

    return evaluation.triggered;
  },

  /**
   * Check if trading context matches circuit breaker scope
   * 
   * @param breaker - The circuit breaker
   * @param context - The trading context
   * @returns True if context matches scope
   */
  contextMatchesScope(breaker: CircuitBreaker, context: TradingContext): boolean {
    switch (breaker.scope) {
      case 'PORTFOLIO':
        // Portfolio scope applies to all trading
        return true;
      case 'STRATEGY':
        // Strategy scope applies if strategyId matches
        return !breaker.scopeId || breaker.scopeId === context.strategyId;
      case 'ASSET':
        // Asset scope applies if assetId matches
        return !breaker.scopeId || breaker.scopeId === context.assetId;
      default:
        return true;
    }
  },

  /**
   * Check all circuit breakers for a tenant
   * 
   * Requirements: 5.2
   * 
   * @param tenantId - The tenant identifier
   * @param context - The current trading context
   * @returns Check result with open and half-open breakers
   */
  async checkBreakers(
    tenantId: string,
    context: TradingContext
  ): Promise<CircuitBreakerCheckResult> {
    const breakers = await this.listBreakers(tenantId);
    
    const openBreakers: CircuitBreaker[] = [];
    const halfOpenBreakers: CircuitBreaker[] = [];

    for (const breaker of breakers) {
      // Check if context matches scope
      if (!this.contextMatchesScope(breaker, context)) {
        continue;
      }

      if (breaker.state === 'OPEN') {
        openBreakers.push(breaker);
      } else if (breaker.state === 'HALF_OPEN') {
        halfOpenBreakers.push(breaker);
      } else if (breaker.state === 'CLOSED') {
        // Check if should trip
        if (this.shouldTrip(tenantId, breaker, context)) {
          // Trip the breaker
          const trippedBreaker = await this.tripBreaker(
            tenantId,
            breaker.breakerId,
            `Condition triggered: ${this.getConditionDescription(breaker.condition)}`
          );
          openBreakers.push(trippedBreaker);
        }
      }
    }

    return {
      allClosed: openBreakers.length === 0 && halfOpenBreakers.length === 0,
      openBreakers,
      halfOpenBreakers
    };
  },

  /**
   * Trip a circuit breaker (transition to OPEN state)
   * 
   * Requirements: 5.2
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param reason - The reason for tripping
   * @param alertCallback - Optional callback to send alerts
   * @returns The updated circuit breaker
   */
  async tripBreaker(
    tenantId: string,
    breakerId: string,
    reason: string,
    alertCallback?: CircuitBreakerAlertCallback
  ): Promise<CircuitBreaker> {
    const breaker = await CircuitBreakerRepository.getBreaker(tenantId, breakerId);
    
    if (!breaker) {
      throw new CircuitBreakerError(`Circuit breaker not found: ${breakerId}`);
    }

    const previousState = breaker.state;
    const now = new Date().toISOString();

    const updatedBreaker = await CircuitBreakerRepository.updateBreaker(
      tenantId,
      breakerId,
      {
        state: 'OPEN',
        tripCount: breaker.tripCount + 1,
        lastTrippedAt: now
      }
    );

    // Send alert if callback provided
    if (alertCallback) {
      await alertCallback({
        tenantId,
        breakerId,
        breakerName: breaker.name,
        alertType: 'TRIPPED',
        reason,
        previousState,
        newState: 'OPEN',
        timestamp: now
      });
    }

    console.log(`Circuit breaker ${breaker.name} tripped: ${reason}`);

    return updatedBreaker;
  },

  /**
   * Get human-readable description of a condition
   * 
   * @param condition - The circuit breaker condition
   * @returns Human-readable description
   */
  getConditionDescription(condition: CircuitBreakerCondition): string {
    switch (condition.type) {
      case 'LOSS_RATE':
        return `Loss rate >= ${condition.lossPercent}% in ${condition.timeWindowMinutes} minutes`;
      case 'CONSECUTIVE_FAILURES':
        return `${condition.count} consecutive failures`;
      case 'PRICE_DEVIATION':
        return `Price deviation >= ${condition.deviationPercent}% in ${condition.timeWindowMinutes} minutes`;
      case 'ERROR_RATE':
        return `Error rate >= ${condition.errorPercent}% in last ${condition.sampleSize} events`;
      default:
        return 'Unknown condition';
    }
  },

  /**
   * Record a trading event for condition evaluation
   * 
   * @param tenantId - The tenant identifier
   * @param event - The trading event to record
   */
  async recordEvent(tenantId: string, event: TradingEvent): Promise<void> {
    // Get all breakers that might be affected by this event
    const breakers = await this.listBreakers(tenantId);

    for (const breaker of breakers) {
      // Check if event matches breaker scope
      const context: TradingContext = {
        strategyId: event.strategyId,
        assetId: event.assetId
      };

      if (this.contextMatchesScope(breaker, context)) {
        await CircuitBreakerRepository.recordEvent(tenantId, breaker.breakerId, event);
      }
    }
  },

  /**
   * Reset a circuit breaker (transition to CLOSED state)
   * 
   * Requirements: 5.6
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param authToken - Optional authentication token (required if configured)
   * @param alertCallback - Optional callback to send alerts
   * @returns The updated circuit breaker
   */
  async resetBreaker(
    tenantId: string,
    breakerId: string,
    authToken?: string,
    alertCallback?: CircuitBreakerAlertCallback
  ): Promise<CircuitBreaker> {
    const breaker = await CircuitBreakerRepository.getBreaker(tenantId, breakerId);
    
    if (!breaker) {
      throw new CircuitBreakerError(`Circuit breaker not found: ${breakerId}`);
    }

    // If breaker requires authentication for manual reset
    // For now, we require auth if the breaker is in OPEN state
    if (breaker.state === 'OPEN' && (!authToken || authToken.trim() === '')) {
      throw new AuthenticationRequiredError('resetCircuitBreaker');
    }

    const previousState = breaker.state;
    const now = new Date().toISOString();

    const updatedBreaker = await CircuitBreakerRepository.updateBreaker(
      tenantId,
      breakerId,
      {
        state: 'CLOSED'
      }
    );

    // Clear event history on reset
    CircuitBreakerRepository.clearEventHistory(tenantId, breakerId);

    // Send alert if callback provided
    if (alertCallback) {
      await alertCallback({
        tenantId,
        breakerId,
        breakerName: breaker.name,
        alertType: 'CLOSED',
        reason: 'Manual reset',
        previousState,
        newState: 'CLOSED',
        timestamp: now
      });
    }

    console.log(`Circuit breaker ${breaker.name} reset to CLOSED`);

    return updatedBreaker;
  },

  /**
   * Transition circuit breaker to HALF_OPEN state
   * 
   * Requirements: 5.5
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param alertCallback - Optional callback to send alerts
   * @returns The updated circuit breaker
   */
  async transitionToHalfOpen(
    tenantId: string,
    breakerId: string,
    alertCallback?: CircuitBreakerAlertCallback
  ): Promise<CircuitBreaker> {
    const breaker = await CircuitBreakerRepository.getBreaker(tenantId, breakerId);
    
    if (!breaker) {
      throw new CircuitBreakerError(`Circuit breaker not found: ${breakerId}`);
    }

    if (breaker.state !== 'OPEN') {
      throw new CircuitBreakerError(`Cannot transition to HALF_OPEN from state: ${breaker.state}`);
    }

    const previousState = breaker.state;
    const now = new Date().toISOString();

    const updatedBreaker = await CircuitBreakerRepository.updateBreaker(
      tenantId,
      breakerId,
      {
        state: 'HALF_OPEN'
      }
    );

    // Send alert if callback provided
    if (alertCallback) {
      await alertCallback({
        tenantId,
        breakerId,
        breakerName: breaker.name,
        alertType: 'HALF_OPEN',
        reason: 'Cooldown period elapsed',
        previousState,
        newState: 'HALF_OPEN',
        timestamp: now
      });
    }

    console.log(`Circuit breaker ${breaker.name} transitioned to HALF_OPEN`);

    return updatedBreaker;
  },

  /**
   * Check if a circuit breaker's cooldown period has elapsed
   * 
   * @param breaker - The circuit breaker to check
   * @returns True if cooldown has elapsed
   */
  isCooldownElapsed(breaker: CircuitBreaker): boolean {
    if (breaker.state !== 'OPEN' || !breaker.lastTrippedAt) {
      return false;
    }

    const trippedAt = new Date(breaker.lastTrippedAt).getTime();
    const cooldownMs = breaker.cooldownMinutes * 60 * 1000;
    const now = Date.now();

    return now >= trippedAt + cooldownMs;
  },

  /**
   * Process auto-reset for circuit breakers
   * 
   * Requirements: 5.5
   * 
   * This should be called periodically to check for breakers that should auto-reset.
   * Transitions: OPEN → HALF_OPEN (after cooldown) → CLOSED (if no new triggers)
   * 
   * @param tenantId - The tenant identifier
   * @param alertCallback - Optional callback to send alerts
   * @returns Array of breakers that were transitioned
   */
  async processAutoReset(
    tenantId: string,
    alertCallback?: CircuitBreakerAlertCallback
  ): Promise<CircuitBreaker[]> {
    const breakers = await this.listBreakers(tenantId);
    const transitionedBreakers: CircuitBreaker[] = [];

    for (const breaker of breakers) {
      if (!breaker.autoResetEnabled) {
        continue;
      }

      if (breaker.state === 'OPEN' && this.isCooldownElapsed(breaker)) {
        // Transition OPEN → HALF_OPEN
        const updated = await this.transitionToHalfOpen(tenantId, breaker.breakerId, alertCallback);
        transitionedBreakers.push(updated);
      } else if (breaker.state === 'HALF_OPEN') {
        // Check if conditions are still triggered
        const context: TradingContext = {};
        const evaluation = this.evaluateCondition(
          tenantId,
          breaker.breakerId,
          breaker.condition,
          context
        );

        if (!evaluation.triggered) {
          // Transition HALF_OPEN → CLOSED
          const updated = await this.resetBreaker(
            tenantId,
            breaker.breakerId,
            'auto-reset', // Auto-reset uses a special token
            alertCallback
          );
          transitionedBreakers.push(updated);
        } else {
          // Re-trip the breaker
          const updated = await this.tripBreaker(
            tenantId,
            breaker.breakerId,
            'Condition still triggered during HALF_OPEN check',
            alertCallback
          );
          transitionedBreakers.push(updated);
        }
      }
    }

    return transitionedBreakers;
  },

  /**
   * Delete a circuit breaker
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   */
  async deleteBreaker(tenantId: string, breakerId: string): Promise<void> {
    await CircuitBreakerRepository.deleteBreaker(tenantId, breakerId);
  },

  /**
   * Update a circuit breaker configuration
   * 
   * @param tenantId - The tenant identifier
   * @param breakerId - The circuit breaker identifier
   * @param updates - The fields to update
   * @returns The updated circuit breaker
   */
  async updateBreaker(
    tenantId: string,
    breakerId: string,
    updates: Partial<CircuitBreakerInput>
  ): Promise<CircuitBreaker> {
    const breaker = await CircuitBreakerRepository.getBreaker(tenantId, breakerId);
    
    if (!breaker) {
      throw new CircuitBreakerError(`Circuit breaker not found: ${breakerId}`);
    }

    return CircuitBreakerRepository.updateBreaker(tenantId, breakerId, {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.condition !== undefined && { condition: updates.condition }),
      ...(updates.scope !== undefined && { scope: updates.scope }),
      ...(updates.scopeId !== undefined && { scopeId: updates.scopeId }),
      ...(updates.cooldownMinutes !== undefined && { cooldownMinutes: updates.cooldownMinutes }),
      ...(updates.autoResetEnabled !== undefined && { autoResetEnabled: updates.autoResetEnabled })
    });
  },

  /**
   * Check if trading is allowed based on circuit breaker state
   * 
   * @param tenantId - The tenant identifier
   * @param context - The trading context
   * @returns True if trading is allowed (all relevant breakers are CLOSED)
   */
  async isTradingAllowed(tenantId: string, context: TradingContext): Promise<boolean> {
    const result = await this.checkBreakers(tenantId, context);
    return result.allClosed;
  }
};
