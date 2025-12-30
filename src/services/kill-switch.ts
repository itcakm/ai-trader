import { generateUUID } from '../utils/uuid';
import {
  KillSwitchState,
  KillSwitchConfig,
  KillSwitchScope,
  KillSwitchScopeType,
  KillTriggerType,
  KillTriggerCondition,
  AutoKillTrigger
} from '../types/kill-switch';
import { RiskEvent, RiskEventType } from '../types/risk-event';
import { KillSwitchRepository } from '../repositories/kill-switch';

/**
 * Default kill switch configuration values
 */
const DEFAULT_REQUIRE_AUTH_FOR_DEACTIVATION = true;

/**
 * Input for creating a new kill switch config
 */
export interface CreateKillSwitchConfigInput {
  autoTriggers?: AutoKillTrigger[];
  requireAuthForDeactivation?: boolean;
  notificationChannels?: string[];
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
 * Error thrown when kill switch is already in the requested state
 */
export class KillSwitchStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KillSwitchStateError';
  }
}

/**
 * Alert callback type for sending kill switch alerts
 */
export type KillSwitchAlertCallback = (alert: KillSwitchAlert) => Promise<void>;

/**
 * Kill switch alert information
 */
export interface KillSwitchAlert {
  tenantId: string;
  alertType: 'ACTIVATED' | 'DEACTIVATED' | 'AUTO_TRIGGERED';
  reason: string;
  triggerType: KillTriggerType;
  scope: KillSwitchScopeType;
  scopeId?: string;
  activatedBy?: string;
  pendingOrdersCancelled: number;
  timestamp: string;
}

/**
 * Order cancellation callback type
 */
export type OrderCancellationCallback = (tenantId: string, scope: KillSwitchScope) => Promise<number>;

/**
 * Result of activation operation
 */
export interface ActivationResult {
  state: KillSwitchState;
  ordersCancelled: number;
  alertSent: boolean;
}

/**
 * Risk event for auto-trigger evaluation
 */
export interface RiskEventForTrigger {
  eventType: RiskEventType;
  severity: string;
  lossPercent?: number;
  errorRate?: number;
  errorType?: string;
  timestamp: string;
}

/**
 * Kill Switch Service - manages emergency trading halt functionality
 * 
 * The kill switch is a critical safety mechanism that:
 * 1. Immediately halts all trading activity when activated
 * 2. Cancels all pending orders
 * 3. Blocks new orders until explicitly deactivated
 * 4. Can be triggered manually or automatically based on conditions
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.5
 */
export const KillSwitchService = {
  /**
   * Activate the kill switch
   * 
   * This is the primary safety mechanism. When activated:
   * 1. All pending orders are cancelled
   * 2. All new orders are blocked
   * 3. The activation is logged with full context
   * 
   * Requirements: 4.1, 4.2, 4.3
   * 
   * @param tenantId - The tenant identifier
   * @param reason - The reason for activation
   * @param scope - Optional scope (defaults to TENANT-wide)
   * @param activatedBy - Optional user identifier who activated
   * @param triggerType - Whether manual or automatic (defaults to MANUAL)
   * @param cancelOrdersCallback - Optional callback to cancel pending orders
   * @param alertCallback - Optional callback to send alerts
   * @returns The activation result with state and orders cancelled
   */
  async activate(
    tenantId: string,
    reason: string,
    scope?: KillSwitchScope,
    activatedBy?: string,
    triggerType: KillTriggerType = 'MANUAL',
    cancelOrdersCallback?: OrderCancellationCallback,
    alertCallback?: KillSwitchAlertCallback
  ): Promise<ActivationResult> {
    const now = new Date().toISOString();
    const effectiveScope: KillSwitchScope = scope ?? { type: 'TENANT' };

    // Check if already active
    const existingState = await KillSwitchRepository.getState(tenantId);
    if (existingState?.active) {
      // Already active - return current state
      return {
        state: existingState,
        ordersCancelled: 0,
        alertSent: false
      };
    }

    // Cancel pending orders if callback provided
    let ordersCancelled = 0;
    if (cancelOrdersCallback) {
      ordersCancelled = await cancelOrdersCallback(tenantId, effectiveScope);
    }

    // Create new kill switch state
    const state: KillSwitchState = {
      tenantId,
      active: true,
      activatedAt: now,
      activatedBy,
      activationReason: reason,
      triggerType,
      scope: effectiveScope.type,
      scopeId: effectiveScope.id,
      pendingOrdersCancelled: ordersCancelled
    };

    // Save state (dual-write to cache and DynamoDB)
    await KillSwitchRepository.putState(tenantId, state);

    // Send alert if callback provided
    let alertSent = false;
    if (alertCallback) {
      await alertCallback({
        tenantId,
        alertType: triggerType === 'AUTOMATIC' ? 'AUTO_TRIGGERED' : 'ACTIVATED',
        reason,
        triggerType,
        scope: effectiveScope.type,
        scopeId: effectiveScope.id,
        activatedBy,
        pendingOrdersCancelled: ordersCancelled,
        timestamp: now
      });
      alertSent = true;
    }

    // Log the activation
    console.log(`Kill switch activated for tenant ${tenantId}: ${reason} (${triggerType})`);

    return {
      state,
      ordersCancelled,
      alertSent
    };
  },

  /**
   * Deactivate the kill switch
   * 
   * Requirements: 4.5 - Requires explicit manual deactivation with authentication
   * 
   * @param tenantId - The tenant identifier
   * @param authToken - Authentication token (required)
   * @param alertCallback - Optional callback to send alerts
   * @returns The updated kill switch state
   * @throws AuthenticationRequiredError if authToken is invalid
   * @throws KillSwitchStateError if kill switch is not active
   */
  async deactivate(
    tenantId: string,
    authToken: string,
    alertCallback?: KillSwitchAlertCallback
  ): Promise<KillSwitchState> {
    // Validate authentication token
    if (!authToken || authToken.trim() === '') {
      throw new AuthenticationRequiredError('deactivateKillSwitch');
    }

    // Get current state
    const existingState = await KillSwitchRepository.getState(tenantId);
    
    if (!existingState) {
      throw new KillSwitchStateError('No kill switch state found for tenant');
    }

    if (!existingState.active) {
      throw new KillSwitchStateError('Kill switch is not active');
    }

    // Check if config requires auth for deactivation
    const config = await KillSwitchRepository.getDefaultConfig(tenantId);
    if (config?.requireAuthForDeactivation) {
      // In production, validate the auth token against an auth service
      // For now, we just check it's not empty
      if (!authToken || authToken.trim() === '') {
        throw new AuthenticationRequiredError('deactivateKillSwitch');
      }
    }

    const now = new Date().toISOString();

    // Update state to inactive
    const updatedState: KillSwitchState = {
      ...existingState,
      active: false
    };

    await KillSwitchRepository.putState(tenantId, updatedState);

    // Send alert if callback provided
    if (alertCallback) {
      await alertCallback({
        tenantId,
        alertType: 'DEACTIVATED',
        reason: 'Manual deactivation',
        triggerType: 'MANUAL',
        scope: existingState.scope,
        scopeId: existingState.scopeId,
        pendingOrdersCancelled: 0,
        timestamp: now
      });
    }

    // Log the deactivation
    console.log(`Kill switch deactivated for tenant ${tenantId}`);

    return updatedState;
  },

  /**
   * Get the current kill switch state
   * 
   * @param tenantId - The tenant identifier
   * @returns The kill switch state, or a default inactive state if none exists
   */
  async getState(tenantId: string): Promise<KillSwitchState> {
    const state = await KillSwitchRepository.getState(tenantId);
    
    if (!state) {
      // Return default inactive state
      return {
        tenantId,
        active: false,
        triggerType: 'MANUAL',
        scope: 'TENANT',
        pendingOrdersCancelled: 0
      };
    }

    return state;
  },

  /**
   * Check if kill switch is active (fast path)
   * 
   * This is optimized for pre-trade checks and uses cache for sub-millisecond response.
   * 
   * @param tenantId - The tenant identifier
   * @returns True if kill switch is active
   */
  async isActive(tenantId: string): Promise<boolean> {
    return KillSwitchRepository.isActive(tenantId);
  },

  /**
   * Check auto-triggers against a risk event
   * 
   * Evaluates configured auto-trigger conditions against the provided event.
   * If any trigger condition is met, the kill switch is automatically activated.
   * 
   * Requirements: 4.3
   * 
   * @param tenantId - The tenant identifier
   * @param event - The risk event to evaluate
   * @param cancelOrdersCallback - Optional callback to cancel pending orders
   * @param alertCallback - Optional callback to send alerts
   * @returns True if kill switch was triggered
   */
  async checkAutoTriggers(
    tenantId: string,
    event: RiskEventForTrigger,
    cancelOrdersCallback?: OrderCancellationCallback,
    alertCallback?: KillSwitchAlertCallback
  ): Promise<boolean> {
    // Get config with auto-triggers
    const config = await KillSwitchRepository.getDefaultConfig(tenantId);
    
    if (!config || !config.autoTriggers || config.autoTriggers.length === 0) {
      return false;
    }

    // Check if already active
    const isActive = await this.isActive(tenantId);
    if (isActive) {
      return false; // Already triggered
    }

    // Evaluate each enabled trigger
    for (const trigger of config.autoTriggers) {
      if (!trigger.enabled) {
        continue;
      }

      const triggered = this.evaluateTriggerCondition(trigger.condition, event);
      
      if (triggered) {
        // Activate kill switch automatically
        await this.activate(
          tenantId,
          `Auto-triggered: ${this.getTriggerDescription(trigger.condition)}`,
          { type: 'TENANT' },
          'SYSTEM',
          'AUTOMATIC',
          cancelOrdersCallback,
          alertCallback
        );

        return true;
      }
    }

    return false;
  },

  /**
   * Evaluate a single trigger condition against an event
   * 
   * @param condition - The trigger condition to evaluate
   * @param event - The risk event to check against
   * @returns True if the condition is met
   */
  evaluateTriggerCondition(condition: KillTriggerCondition, event: RiskEventForTrigger): boolean {
    switch (condition.type) {
      case 'RAPID_LOSS':
        // Check if loss percent exceeds threshold
        if (event.lossPercent !== undefined) {
          return event.lossPercent >= condition.lossPercent;
        }
        return false;

      case 'ERROR_RATE':
        // Check if error rate exceeds threshold
        if (event.errorRate !== undefined) {
          return event.errorRate >= condition.errorPercent;
        }
        return false;

      case 'SYSTEM_ERROR':
        // Check if error type matches any in the list
        if (event.errorType) {
          return condition.errorTypes.includes(event.errorType);
        }
        return false;

      default:
        return false;
    }
  },

  /**
   * Get human-readable description of a trigger condition
   * 
   * @param condition - The trigger condition
   * @returns Human-readable description
   */
  getTriggerDescription(condition: KillTriggerCondition): string {
    switch (condition.type) {
      case 'RAPID_LOSS':
        return `Rapid loss of ${condition.lossPercent}% within ${condition.timeWindowMinutes} minutes`;
      case 'ERROR_RATE':
        return `Error rate of ${condition.errorPercent}% within ${condition.timeWindowMinutes} minutes`;
      case 'SYSTEM_ERROR':
        return `System error: ${condition.errorTypes.join(', ')}`;
      default:
        return 'Unknown trigger condition';
    }
  },

  /**
   * Create a new kill switch config
   * 
   * @param tenantId - The tenant identifier
   * @param input - The config input
   * @returns The created config
   */
  async createConfig(
    tenantId: string,
    input: CreateKillSwitchConfigInput
  ): Promise<KillSwitchConfig> {
    const configId = generateUUID();

    const config: KillSwitchConfig = {
      configId,
      tenantId,
      autoTriggers: input.autoTriggers ?? [],
      requireAuthForDeactivation: input.requireAuthForDeactivation ?? DEFAULT_REQUIRE_AUTH_FOR_DEACTIVATION,
      notificationChannels: input.notificationChannels ?? []
    };

    await KillSwitchRepository.putConfig(tenantId, config);
    return config;
  },

  /**
   * Get kill switch config for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The kill switch config, or null if not found
   */
  async getConfig(tenantId: string): Promise<KillSwitchConfig | null> {
    return KillSwitchRepository.getDefaultConfig(tenantId);
  },

  /**
   * Update kill switch config
   * 
   * @param tenantId - The tenant identifier
   * @param configId - The config identifier
   * @param updates - The fields to update
   * @returns The updated config
   */
  async updateConfig(
    tenantId: string,
    configId: string,
    updates: Partial<CreateKillSwitchConfigInput>
  ): Promise<KillSwitchConfig> {
    const existing = await KillSwitchRepository.getConfig(tenantId, configId);
    
    if (!existing) {
      throw new Error(`Kill switch config not found: ${configId}`);
    }

    const updatedConfig: KillSwitchConfig = {
      ...existing,
      ...(updates.autoTriggers !== undefined && { autoTriggers: updates.autoTriggers }),
      ...(updates.requireAuthForDeactivation !== undefined && { requireAuthForDeactivation: updates.requireAuthForDeactivation }),
      ...(updates.notificationChannels !== undefined && { notificationChannels: updates.notificationChannels })
    };

    await KillSwitchRepository.putConfig(tenantId, updatedConfig);
    return updatedConfig;
  },

  /**
   * Add an auto-trigger to the config
   * 
   * @param tenantId - The tenant identifier
   * @param trigger - The auto-trigger to add
   * @returns The updated config
   */
  async addAutoTrigger(
    tenantId: string,
    trigger: AutoKillTrigger
  ): Promise<KillSwitchConfig> {
    let config = await KillSwitchRepository.getDefaultConfig(tenantId);
    
    if (!config) {
      // Create new config with the trigger
      return this.createConfig(tenantId, {
        autoTriggers: [trigger]
      });
    }

    // Add trigger to existing config
    const updatedConfig: KillSwitchConfig = {
      ...config,
      autoTriggers: [...config.autoTriggers, trigger]
    };

    await KillSwitchRepository.putConfig(tenantId, updatedConfig);
    return updatedConfig;
  },

  /**
   * Remove an auto-trigger from the config
   * 
   * @param tenantId - The tenant identifier
   * @param triggerId - The trigger identifier to remove
   * @returns The updated config
   */
  async removeAutoTrigger(
    tenantId: string,
    triggerId: string
  ): Promise<KillSwitchConfig | null> {
    const config = await KillSwitchRepository.getDefaultConfig(tenantId);
    
    if (!config) {
      return null;
    }

    const updatedConfig: KillSwitchConfig = {
      ...config,
      autoTriggers: config.autoTriggers.filter(t => t.triggerId !== triggerId)
    };

    await KillSwitchRepository.putConfig(tenantId, updatedConfig);
    return updatedConfig;
  },

  /**
   * Enable or disable an auto-trigger
   * 
   * @param tenantId - The tenant identifier
   * @param triggerId - The trigger identifier
   * @param enabled - Whether to enable or disable
   * @returns The updated config
   */
  async setAutoTriggerEnabled(
    tenantId: string,
    triggerId: string,
    enabled: boolean
  ): Promise<KillSwitchConfig | null> {
    const config = await KillSwitchRepository.getDefaultConfig(tenantId);
    
    if (!config) {
      return null;
    }

    const updatedConfig: KillSwitchConfig = {
      ...config,
      autoTriggers: config.autoTriggers.map(t =>
        t.triggerId === triggerId ? { ...t, enabled } : t
      )
    };

    await KillSwitchRepository.putConfig(tenantId, updatedConfig);
    return updatedConfig;
  }
};
