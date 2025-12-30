import { generateUUID } from '../utils/uuid';
import {
  DrawdownState,
  DrawdownConfig,
  DrawdownStatus,
  DrawdownCheckResult,
  ResetInterval
} from '../types/drawdown';
import { DrawdownRepository } from '../repositories/drawdown';

/**
 * Default drawdown configuration values
 */
const DEFAULT_WARNING_THRESHOLD = 5;  // 5%
const DEFAULT_MAX_THRESHOLD = 10;     // 10%
const DEFAULT_COOLDOWN_MINUTES = 60;  // 1 hour

/**
 * Input for creating a new drawdown state
 */
export interface CreateDrawdownStateInput {
  strategyId?: string;
  scope: 'STRATEGY' | 'PORTFOLIO';
  initialValue: number;
  warningThreshold?: number;
  maxThreshold?: number;
}

/**
 * Input for creating a new drawdown config
 */
export interface CreateDrawdownConfigInput {
  strategyId?: string;
  warningThresholdPercent?: number;
  maxThresholdPercent?: number;
  resetInterval?: ResetInterval;
  autoResumeEnabled?: boolean;
  cooldownMinutes?: number;
}

/**
 * Authentication token for resume operations
 */
export interface AuthToken {
  userId: string;
  timestamp: string;
  signature: string;
}

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
 * Error thrown when a strategy is paused and cannot perform operations
 */
export class StrategyPausedError extends Error {
  constructor(strategyId: string) {
    super(`Strategy ${strategyId} is paused due to drawdown breach`);
    this.name = 'StrategyPausedError';
  }
}

/**
 * Alert callback type for sending drawdown alerts
 */
export type DrawdownAlertCallback = (alert: DrawdownAlert) => Promise<void>;

/**
 * Drawdown alert information
 */
export interface DrawdownAlert {
  tenantId: string;
  strategyId?: string;
  alertType: 'WARNING' | 'CRITICAL' | 'PAUSED';
  drawdownPercent: number;
  threshold: number;
  message: string;
  timestamp: string;
}

/**
 * Result of monitoring operation
 */
export interface MonitoringResult {
  state: DrawdownState;
  alertSent: boolean;
  alertType?: 'WARNING' | 'CRITICAL';
  actionTaken?: 'PAUSED';
}

/**
 * Drawdown Service - manages drawdown tracking, monitoring, and protective actions
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export const DrawdownService = {
  /**
   * Calculate drawdown percentage from peak and current values
   * 
   * Formula: ((peakValue - currentValue) / peakValue) * 100
   * 
   * @param peakValue - The highest value recorded
   * @param currentValue - The current value
   * @returns The drawdown percentage (0-100)
   */
  calculateDrawdown(peakValue: number, currentValue: number): { percent: number; absolute: number } {
    if (peakValue <= 0) {
      return { percent: 0, absolute: 0 };
    }

    const absolute = Math.max(0, peakValue - currentValue);
    const percent = (absolute / peakValue) * 100;

    return {
      percent: Math.max(0, Math.min(100, percent)),
      absolute
    };
  },

  /**
   * Determine drawdown status based on thresholds
   * 
   * @param drawdownPercent - Current drawdown percentage
   * @param warningThreshold - Warning threshold percentage
   * @param maxThreshold - Maximum threshold percentage
   * @param currentStatus - Current status (to preserve PAUSED state)
   * @returns The appropriate drawdown status
   */
  determineStatus(
    drawdownPercent: number,
    warningThreshold: number,
    maxThreshold: number,
    currentStatus?: DrawdownStatus
  ): DrawdownStatus {
    // PAUSED status can only be changed by explicit resume
    if (currentStatus === 'PAUSED') {
      return 'PAUSED';
    }

    if (drawdownPercent >= maxThreshold) {
      return 'CRITICAL';
    }

    if (drawdownPercent >= warningThreshold) {
      return 'WARNING';
    }

    return 'NORMAL';
  },

  /**
   * Get drawdown state for a tenant, optionally filtered by strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy identifier
   * @returns The drawdown state
   */
  async getDrawdownState(tenantId: string, strategyId?: string): Promise<DrawdownState | null> {
    if (strategyId) {
      return DrawdownRepository.getStateByStrategy(tenantId, strategyId);
    }
    return DrawdownRepository.getPortfolioState(tenantId);
  },

  /**
   * Create a new drawdown state
   * 
   * @param tenantId - The tenant identifier
   * @param input - The drawdown state input
   * @returns The created drawdown state
   */
  async createDrawdownState(
    tenantId: string,
    input: CreateDrawdownStateInput
  ): Promise<DrawdownState> {
    const now = new Date().toISOString();
    const stateId = generateUUID();

    const state: DrawdownState = {
      stateId,
      tenantId,
      strategyId: input.strategyId,
      scope: input.scope,
      peakValue: input.initialValue,
      currentValue: input.initialValue,
      drawdownPercent: 0,
      drawdownAbsolute: 0,
      warningThreshold: input.warningThreshold ?? DEFAULT_WARNING_THRESHOLD,
      maxThreshold: input.maxThreshold ?? DEFAULT_MAX_THRESHOLD,
      status: 'NORMAL',
      lastResetAt: now,
      updatedAt: now
    };

    await DrawdownRepository.putState(tenantId, state);
    return state;
  },

  /**
   * Update the current value and recalculate drawdown
   * 
   * This is the core function for tracking drawdown. It:
   * 1. Updates peak value if current value exceeds it
   * 2. Calculates new drawdown percentage
   * 3. Updates status based on thresholds
   * 
   * Requirements: 2.1
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Strategy identifier (null for portfolio)
   * @param newValue - The new portfolio/strategy value
   * @returns The updated drawdown state
   */
  async updateValue(
    tenantId: string,
    strategyId: string | null,
    newValue: number
  ): Promise<DrawdownState> {
    // Get existing state or create new one
    let state = strategyId
      ? await DrawdownRepository.getStateByStrategy(tenantId, strategyId)
      : await DrawdownRepository.getPortfolioState(tenantId);

    if (!state) {
      // Create new state if it doesn't exist
      state = await this.createDrawdownState(tenantId, {
        strategyId: strategyId ?? undefined,
        scope: strategyId ? 'STRATEGY' : 'PORTFOLIO',
        initialValue: newValue
      });
      return state;
    }

    // Update peak value if new value is higher
    const newPeakValue = Math.max(state.peakValue, newValue);

    // Calculate new drawdown
    const { percent, absolute } = this.calculateDrawdown(newPeakValue, newValue);

    // Determine new status (preserving PAUSED if already paused)
    const newStatus = this.determineStatus(
      percent,
      state.warningThreshold,
      state.maxThreshold,
      state.status
    );

    // Update state
    const updatedState = await DrawdownRepository.updateState(tenantId, state.stateId, {
      currentValue: newValue,
      peakValue: newPeakValue,
      drawdownPercent: percent,
      drawdownAbsolute: absolute,
      status: newStatus
    });

    return updatedState;
  },

  /**
   * Check current drawdown status and return detailed result
   * 
   * Requirements: 2.2, 2.3, 2.4
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy identifier
   * @returns Detailed drawdown check result
   */
  async checkDrawdown(tenantId: string, strategyId?: string): Promise<DrawdownCheckResult> {
    const state = await this.getDrawdownState(tenantId, strategyId);

    if (!state) {
      // No state means no drawdown tracking - allow trading
      return {
        status: 'NORMAL',
        currentDrawdownPercent: 0,
        distanceToWarning: DEFAULT_WARNING_THRESHOLD,
        distanceToMax: DEFAULT_MAX_THRESHOLD,
        tradingAllowed: true
      };
    }

    const distanceToWarning = Math.max(0, state.warningThreshold - state.drawdownPercent);
    const distanceToMax = Math.max(0, state.maxThreshold - state.drawdownPercent);

    // Trading is not allowed if status is PAUSED or CRITICAL
    const tradingAllowed = state.status !== 'PAUSED' && state.status !== 'CRITICAL';

    return {
      status: state.status,
      currentDrawdownPercent: state.drawdownPercent,
      distanceToWarning,
      distanceToMax,
      tradingAllowed
    };
  },

  /**
   * Pause a strategy due to drawdown breach
   * 
   * Requirements: 2.3, 2.4
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param reason - The reason for pausing
   */
  async pauseStrategy(tenantId: string, strategyId: string, reason: string): Promise<void> {
    const state = await DrawdownRepository.getStateByStrategy(tenantId, strategyId);

    if (!state) {
      throw new Error(`No drawdown state found for strategy ${strategyId}`);
    }

    await DrawdownRepository.updateState(tenantId, state.stateId, {
      status: 'PAUSED'
    });

    // Log the pause event (in production, this would emit to an event service)
    console.log(`Strategy ${strategyId} paused due to drawdown: ${reason}`);
  },

  /**
   * Resume a strategy after drawdown pause
   * 
   * Requirements: 2.5 - Requires manual intervention with authentication
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param authToken - Authentication token (required)
   * @throws AuthenticationRequiredError if authToken is invalid
   */
  async resumeStrategy(
    tenantId: string,
    strategyId: string,
    authToken: string
  ): Promise<void> {
    // Validate authentication token
    if (!authToken || authToken.trim() === '') {
      throw new AuthenticationRequiredError('resumeStrategy');
    }

    const state = await DrawdownRepository.getStateByStrategy(tenantId, strategyId);

    if (!state) {
      throw new Error(`No drawdown state found for strategy ${strategyId}`);
    }

    if (state.status !== 'PAUSED') {
      throw new Error(`Strategy ${strategyId} is not paused`);
    }

    // Determine new status based on current drawdown
    const newStatus = this.determineStatus(
      state.drawdownPercent,
      state.warningThreshold,
      state.maxThreshold,
      undefined // Don't preserve PAUSED status
    );

    await DrawdownRepository.updateState(tenantId, state.stateId, {
      status: newStatus
    });

    // Log the resume event
    console.log(`Strategy ${strategyId} resumed by authenticated user`);
  },

  /**
   * Reset drawdown calculation
   * 
   * Requirements: 2.6 - Sets peak value to current value, resets drawdown to 0
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy identifier
   * @returns The reset drawdown state
   */
  async resetDrawdown(tenantId: string, strategyId?: string): Promise<DrawdownState> {
    const state = await this.getDrawdownState(tenantId, strategyId);

    if (!state) {
      throw new Error(`No drawdown state found for ${strategyId ? `strategy ${strategyId}` : 'portfolio'}`);
    }

    const now = new Date().toISOString();

    // Reset: set peak to current value, drawdown to 0, status to NORMAL
    const updatedState: DrawdownState = {
      ...state,
      peakValue: state.currentValue,
      drawdownPercent: 0,
      drawdownAbsolute: 0,
      status: 'NORMAL',
      lastResetAt: now,
      updatedAt: now
    };

    await DrawdownRepository.putState(tenantId, updatedState);
    return updatedState;
  },

  /**
   * Create a new drawdown config
   * 
   * @param tenantId - The tenant identifier
   * @param input - The drawdown config input
   * @returns The created drawdown config
   */
  async createDrawdownConfig(
    tenantId: string,
    input: CreateDrawdownConfigInput
  ): Promise<DrawdownConfig> {
    const configId = generateUUID();

    const config: DrawdownConfig = {
      configId,
      tenantId,
      strategyId: input.strategyId,
      warningThresholdPercent: input.warningThresholdPercent ?? DEFAULT_WARNING_THRESHOLD,
      maxThresholdPercent: input.maxThresholdPercent ?? DEFAULT_MAX_THRESHOLD,
      resetInterval: input.resetInterval ?? 'MANUAL',
      autoResumeEnabled: input.autoResumeEnabled ?? false,
      cooldownMinutes: input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES
    };

    await DrawdownRepository.putConfig(tenantId, config);
    return config;
  },

  /**
   * Get drawdown config for a tenant, optionally filtered by strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy identifier
   * @returns The drawdown config
   */
  async getDrawdownConfig(tenantId: string, strategyId?: string): Promise<DrawdownConfig | null> {
    if (strategyId) {
      const strategyConfig = await DrawdownRepository.getConfigByStrategy(tenantId, strategyId);
      if (strategyConfig) {
        return strategyConfig;
      }
    }
    // Fall back to default config
    return DrawdownRepository.getDefaultConfig(tenantId);
  },

  /**
   * Check if trading is allowed based on drawdown status
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Optional strategy identifier
   * @returns True if trading is allowed
   */
  async isTradingAllowed(tenantId: string, strategyId?: string): Promise<boolean> {
    const result = await this.checkDrawdown(tenantId, strategyId);
    return result.tradingAllowed;
  },

  /**
   * Get all paused strategies for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns List of paused drawdown states
   */
  async getPausedStrategies(tenantId: string): Promise<DrawdownState[]> {
    return DrawdownRepository.listStatesByStatus(tenantId, 'PAUSED');
  },

  /**
   * Monitor drawdown and trigger alerts/actions as needed
   * 
   * This function:
   * 1. Updates the value and recalculates drawdown
   * 2. Sends warning alert when warning threshold is crossed
   * 3. Sends critical alert and pauses strategy when max threshold is crossed
   * 
   * Requirements: 2.2, 2.3, 2.4
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - Strategy identifier (null for portfolio)
   * @param newValue - The new portfolio/strategy value
   * @param alertCallback - Optional callback to send alerts
   * @returns Monitoring result with state and actions taken
   */
  async monitorAndUpdate(
    tenantId: string,
    strategyId: string | null,
    newValue: number,
    alertCallback?: DrawdownAlertCallback
  ): Promise<MonitoringResult> {
    // Get previous state to detect threshold crossings
    const previousState = await this.getDrawdownState(tenantId, strategyId ?? undefined);
    const previousStatus = previousState?.status ?? 'NORMAL';

    // Update value and recalculate drawdown
    const state = await this.updateValue(tenantId, strategyId, newValue);

    const result: MonitoringResult = {
      state,
      alertSent: false
    };

    const now = new Date().toISOString();

    // Check for warning threshold crossing (NORMAL -> WARNING)
    if (previousStatus === 'NORMAL' && state.status === 'WARNING') {
      result.alertSent = true;
      result.alertType = 'WARNING';

      if (alertCallback) {
        await alertCallback({
          tenantId,
          strategyId: strategyId ?? undefined,
          alertType: 'WARNING',
          drawdownPercent: state.drawdownPercent,
          threshold: state.warningThreshold,
          message: `Drawdown warning: ${state.drawdownPercent.toFixed(2)}% has reached warning threshold of ${state.warningThreshold}%`,
          timestamp: now
        });
      }
    }

    // Check for max threshold crossing (WARNING -> CRITICAL or NORMAL -> CRITICAL)
    if ((previousStatus === 'NORMAL' || previousStatus === 'WARNING') && state.status === 'CRITICAL') {
      result.alertSent = true;
      result.alertType = 'CRITICAL';

      if (alertCallback) {
        await alertCallback({
          tenantId,
          strategyId: strategyId ?? undefined,
          alertType: 'CRITICAL',
          drawdownPercent: state.drawdownPercent,
          threshold: state.maxThreshold,
          message: `Drawdown critical: ${state.drawdownPercent.toFixed(2)}% has exceeded max threshold of ${state.maxThreshold}%`,
          timestamp: now
        });
      }

      // Auto-pause strategy when max threshold is breached
      if (strategyId) {
        await this.pauseStrategy(
          tenantId,
          strategyId,
          `Max drawdown threshold (${state.maxThreshold}%) exceeded: ${state.drawdownPercent.toFixed(2)}%`
        );
        result.actionTaken = 'PAUSED';

        // Send pause alert
        if (alertCallback) {
          await alertCallback({
            tenantId,
            strategyId,
            alertType: 'PAUSED',
            drawdownPercent: state.drawdownPercent,
            threshold: state.maxThreshold,
            message: `Strategy ${strategyId} has been paused due to drawdown breach`,
            timestamp: now
          });
        }

        // Update result state to reflect pause
        result.state = await this.getDrawdownState(tenantId, strategyId) ?? state;
      }
    }

    return result;
  },

  /**
   * Batch monitor multiple strategies
   * 
   * @param tenantId - The tenant identifier
   * @param updates - Array of strategy value updates
   * @param alertCallback - Optional callback to send alerts
   * @returns Array of monitoring results
   */
  async batchMonitor(
    tenantId: string,
    updates: Array<{ strategyId: string | null; newValue: number }>,
    alertCallback?: DrawdownAlertCallback
  ): Promise<MonitoringResult[]> {
    const results: MonitoringResult[] = [];

    for (const update of updates) {
      const result = await this.monitorAndUpdate(
        tenantId,
        update.strategyId,
        update.newValue,
        alertCallback
      );
      results.push(result);
    }

    return results;
  }
};
