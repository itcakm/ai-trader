/**
 * Price Feed Reconnection Service - manages reconnection with exponential backoff
 * 
 * Provides:
 * - Exponential backoff reconnection strategy
 * - Fallback source switching after max retries
 * - Connection state tracking
 * 
 * Requirements: 2.6
 */

import { DataSource } from '../types/data-source';
import { FailoverService } from './failover';

/**
 * Configuration for reconnection behavior
 */
export interface ReconnectConfig {
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in milliseconds (default: 60000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Maximum number of retry attempts (default: 5) */
  maxRetries: number;
  /** Jitter factor (0-1) to add randomness to delays (default: 0.1) */
  jitterFactor: number;
}

/**
 * Default reconnection configuration
 */
const DEFAULT_CONFIG: ReconnectConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  maxRetries: 5,
  jitterFactor: 0.1
};

/**
 * State of a reconnection attempt
 */
export interface ReconnectState {
  /** Source ID being reconnected */
  sourceId: string;
  /** Current attempt number (1-based) */
  attemptNumber: number;
  /** Current delay in milliseconds */
  currentDelayMs: number;
  /** Whether reconnection is in progress */
  isReconnecting: boolean;
  /** Last error message */
  lastError?: string;
  /** Timestamp of last attempt */
  lastAttemptAt?: string;
  /** Whether max retries have been exhausted */
  maxRetriesExhausted: boolean;
}

/**
 * Result of a reconnection attempt
 */
export interface ReconnectResult {
  /** Whether reconnection was successful */
  success: boolean;
  /** The source that is now active (original or fallback) */
  activeSource: DataSource | null;
  /** Whether a fallback source was used */
  usedFallback: boolean;
  /** Total attempts made */
  totalAttempts: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Callback for connection attempts
 */
export type ConnectCallback = () => Promise<boolean>;

/**
 * In-memory state tracking for reconnection attempts
 */
const reconnectStates: Map<string, ReconnectState> = new Map();

/**
 * Price Reconnect Service
 */
export const PriceReconnectService = {
  /**
   * Calculate the delay for a given attempt using exponential backoff
   * 
   * Formula: min(maxDelay, initialDelay * (multiplier ^ (attempt - 1))) + jitter
   * 
   * @param attemptNumber - The current attempt number (1-based)
   * @param config - Reconnection configuration
   * @returns Delay in milliseconds
   * 
   * Requirements: 2.6
   */
  calculateDelay(attemptNumber: number, config: Partial<ReconnectConfig> = {}): number {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    
    // Calculate base delay with exponential backoff
    const baseDelay = fullConfig.initialDelayMs * 
      Math.pow(fullConfig.backoffMultiplier, attemptNumber - 1);
    
    // Cap at maximum delay
    const cappedDelay = Math.min(baseDelay, fullConfig.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * fullConfig.jitterFactor * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  },

  /**
   * Get the sequence of delays for all retry attempts
   * 
   * @param config - Reconnection configuration
   * @returns Array of delays in milliseconds
   */
  getDelaySequence(config: Partial<ReconnectConfig> = {}): number[] {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const delays: number[] = [];
    
    for (let i = 1; i <= fullConfig.maxRetries; i++) {
      // Calculate without jitter for predictable sequence
      const baseDelay = fullConfig.initialDelayMs * 
        Math.pow(fullConfig.backoffMultiplier, i - 1);
      delays.push(Math.min(baseDelay, fullConfig.maxDelayMs));
    }
    
    return delays;
  },

  /**
   * Attempt to reconnect to a price feed with exponential backoff
   * 
   * Will retry up to maxRetries times with increasing delays.
   * If all retries fail, will attempt to switch to a fallback source.
   * 
   * @param sourceId - The source ID to reconnect
   * @param connectFn - Function that attempts to connect (returns true on success)
   * @param config - Reconnection configuration
   * @returns Reconnection result
   * 
   * Requirements: 2.6
   */
  async attemptReconnect(
    sourceId: string,
    connectFn: ConnectCallback,
    config: Partial<ReconnectConfig> = {}
  ): Promise<ReconnectResult> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize state
    const state: ReconnectState = {
      sourceId,
      attemptNumber: 0,
      currentDelayMs: 0,
      isReconnecting: true,
      maxRetriesExhausted: false
    };
    reconnectStates.set(sourceId, state);

    try {
      // Attempt reconnection with exponential backoff
      for (let attempt = 1; attempt <= fullConfig.maxRetries; attempt++) {
        state.attemptNumber = attempt;
        state.currentDelayMs = this.calculateDelay(attempt, fullConfig);
        state.lastAttemptAt = new Date().toISOString();
        reconnectStates.set(sourceId, state);

        try {
          const connected = await connectFn();
          
          if (connected) {
            state.isReconnecting = false;
            reconnectStates.set(sourceId, state);
            
            // Get the source to return
            const source = await FailoverService.getActiveSource('PRICE');
            
            return {
              success: true,
              activeSource: source,
              usedFallback: false,
              totalAttempts: attempt
            };
          }
        } catch (error) {
          state.lastError = error instanceof Error ? error.message : 'Unknown error';
          reconnectStates.set(sourceId, state);
        }

        // Wait before next attempt (unless this was the last attempt)
        if (attempt < fullConfig.maxRetries) {
          await this.delay(state.currentDelayMs);
        }
      }

      // Max retries exhausted, attempt fallback
      state.maxRetriesExhausted = true;
      reconnectStates.set(sourceId, state);

      return await this.switchToFallback(sourceId, state.lastError || 'Max retries exhausted');
    } finally {
      state.isReconnecting = false;
      reconnectStates.set(sourceId, state);
    }
  },

  /**
   * Switch to a fallback source after reconnection fails
   * 
   * @param sourceId - The failing source ID
   * @param reason - Reason for the switch
   * @returns Reconnection result with fallback source
   * 
   * Requirements: 2.6
   */
  async switchToFallback(sourceId: string, reason: string): Promise<ReconnectResult> {
    const state = reconnectStates.get(sourceId);
    const totalAttempts = state?.attemptNumber || 0;

    try {
      const failoverResult = await FailoverService.switchToFallback(
        sourceId,
        reason,
        'ERROR'
      );

      if (failoverResult) {
        const fallbackSource = await FailoverService.getActiveSource('PRICE');
        
        return {
          success: true,
          activeSource: fallbackSource,
          usedFallback: true,
          totalAttempts
        };
      }

      return {
        success: false,
        activeSource: null,
        usedFallback: false,
        totalAttempts,
        error: 'No fallback source available'
      };
    } catch (error) {
      return {
        success: false,
        activeSource: null,
        usedFallback: false,
        totalAttempts,
        error: error instanceof Error ? error.message : 'Fallback switch failed'
      };
    }
  },

  /**
   * Get the current reconnection state for a source
   * 
   * @param sourceId - The source ID
   * @returns Current reconnection state, or null if not reconnecting
   */
  getReconnectState(sourceId: string): ReconnectState | null {
    return reconnectStates.get(sourceId) || null;
  },

  /**
   * Check if a source is currently reconnecting
   * 
   * @param sourceId - The source ID
   * @returns True if reconnection is in progress
   */
  isReconnecting(sourceId: string): boolean {
    const state = reconnectStates.get(sourceId);
    return state?.isReconnecting || false;
  },

  /**
   * Cancel an ongoing reconnection attempt
   * 
   * @param sourceId - The source ID
   */
  cancelReconnect(sourceId: string): void {
    const state = reconnectStates.get(sourceId);
    if (state) {
      state.isReconnecting = false;
      reconnectStates.set(sourceId, state);
    }
  },

  /**
   * Clear all reconnection states (for testing)
   */
  clearStates(): void {
    reconnectStates.clear();
  },

  /**
   * Utility function to delay execution
   * 
   * @param ms - Milliseconds to delay
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Validate that delays follow exponential backoff pattern
   * 
   * @param delays - Array of delays to validate
   * @param config - Configuration to validate against
   * @returns True if delays follow the pattern
   */
  validateDelayPattern(delays: number[], config: Partial<ReconnectConfig> = {}): boolean {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    
    if (delays.length === 0) return true;
    
    for (let i = 1; i < delays.length; i++) {
      const expectedRatio = fullConfig.backoffMultiplier;
      const actualRatio = delays[i] / delays[i - 1];
      
      // Allow for some tolerance due to max cap and jitter
      if (delays[i] < fullConfig.maxDelayMs && 
          Math.abs(actualRatio - expectedRatio) > 0.5) {
        return false;
      }
    }
    
    // All delays should be <= maxDelayMs
    return delays.every(d => d <= fullConfig.maxDelayMs);
  }
};
