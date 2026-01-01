import { generateUUID } from '../utils/uuid';
import {
  VolatilityState,
  VolatilityConfig,
  VolatilityLevel,
  VolatilityIndexType,
  ThrottleCheckResult
} from '../types/volatility';
import { VolatilityRepository } from '../repositories/volatility';

/**
 * Default volatility configuration values
 */
const DEFAULT_NORMAL_THRESHOLD = 20;      // Below this = LOW/NORMAL
const DEFAULT_HIGH_THRESHOLD = 50;        // Above this = HIGH
const DEFAULT_EXTREME_THRESHOLD = 80;     // Above this = EXTREME
const DEFAULT_HIGH_THROTTLE_PERCENT = 50; // 50% reduction at HIGH
const DEFAULT_EXTREME_THROTTLE_PERCENT = 100; // 100% = no new entries at EXTREME
const DEFAULT_COOLDOWN_MINUTES = 30;

/**
 * Input for creating a new volatility state
 */
export interface CreateVolatilityStateInput {
  assetId: string;
  indexType: VolatilityIndexType;
  initialIndex?: number;
}

/**
 * Input for creating a new volatility config
 */
export interface CreateVolatilityConfigInput {
  assetId?: string;
  indexType: VolatilityIndexType;
  normalThreshold?: number;
  highThreshold?: number;
  extremeThreshold?: number;
  highThrottlePercent?: number;
  extremeThrottlePercent?: number;
  cooldownMinutes?: number;
}

/**
 * Price data point for volatility calculation
 */
export interface PriceDataPoint {
  timestamp: string;
  high: number;
  low: number;
  close: number;
}

/**
 * Volatility calculation result
 */
export interface VolatilityCalculationResult {
  indexValue: number;
  indexType: VolatilityIndexType;
  dataPoints: number;
}

/**
 * Cooldown tracking for volatility restoration
 */
interface CooldownState {
  assetId: string;
  startedAt: string;
  previousLevel: VolatilityLevel;
  cooldownMinutes: number;
}

// In-memory cooldown tracking (in production, this would be in ElastiCache)
const cooldownStates: Map<string, CooldownState> = new Map();

/**
 * Volatility Service - manages volatility tracking, calculation, and throttling
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export const VolatilityService = {
  /**
   * Calculate Average True Range (ATR) volatility index
   * 
   * ATR = Average of True Range over N periods
   * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
   * 
   * @param priceData - Array of price data points (must be sorted by timestamp ascending)
   * @param period - Number of periods for averaging (default 14)
   * @returns The ATR value
   */
  calculateATR(priceData: PriceDataPoint[], period: number = 14): number {
    if (priceData.length < 2) {
      return 0;
    }

    const trueRanges: number[] = [];

    for (let i = 1; i < priceData.length; i++) {
      const current = priceData[i];
      const previous = priceData[i - 1];

      const highLow = current.high - current.low;
      const highPrevClose = Math.abs(current.high - previous.close);
      const lowPrevClose = Math.abs(current.low - previous.close);

      const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);
      trueRanges.push(trueRange);
    }

    // Calculate average of last N true ranges
    const relevantRanges = trueRanges.slice(-period);
    if (relevantRanges.length === 0) {
      return 0;
    }

    const sum = relevantRanges.reduce((acc, val) => acc + val, 0);
    return sum / relevantRanges.length;
  },

  /**
   * Calculate Standard Deviation volatility index
   * 
   * @param prices - Array of closing prices
   * @param period - Number of periods for calculation (default 20)
   * @returns The standard deviation value
   */
  calculateStdDev(prices: number[], period: number = 20): number {
    if (prices.length < 2) {
      return 0;
    }

    const relevantPrices = prices.slice(-period);
    const mean = relevantPrices.reduce((acc, val) => acc + val, 0) / relevantPrices.length;
    
    const squaredDiffs = relevantPrices.map(price => Math.pow(price - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / relevantPrices.length;
    
    return Math.sqrt(variance);
  },

  /**
   * Calculate Realized Volatility (annualized)
   * 
   * @param returns - Array of log returns
   * @param annualizationFactor - Factor to annualize (default 252 for daily data)
   * @returns The realized volatility as a percentage
   */
  calculateRealizedVol(returns: number[], annualizationFactor: number = 252): number {
    if (returns.length < 2) {
      return 0;
    }

    const mean = returns.reduce((acc, val) => acc + val, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / (returns.length - 1);
    
    return Math.sqrt(variance * annualizationFactor) * 100;
  },

  /**
   * Calculate volatility index based on the specified type
   * 
   * Requirements: 3.1
   * 
   * @param indexType - The type of volatility index to calculate
   * @param priceData - Price data for calculation
   * @returns The calculated volatility index value
   */
  calculateVolatilityIndex(
    indexType: VolatilityIndexType,
    priceData: PriceDataPoint[]
  ): VolatilityCalculationResult {
    let indexValue: number;

    switch (indexType) {
      case 'ATR':
        indexValue = this.calculateATR(priceData);
        break;
      case 'STD_DEV':
        const closePrices = priceData.map(p => p.close);
        indexValue = this.calculateStdDev(closePrices);
        break;
      case 'REALIZED_VOL':
        // Calculate log returns
        const returns: number[] = [];
        for (let i = 1; i < priceData.length; i++) {
          const logReturn = Math.log(priceData[i].close / priceData[i - 1].close);
          returns.push(logReturn);
        }
        indexValue = this.calculateRealizedVol(returns);
        break;
      case 'IMPLIED_VOL':
        // Implied volatility would come from options data - use placeholder
        // In production, this would be fetched from an options data source
        indexValue = 0;
        break;
      default:
        indexValue = 0;
    }

    return {
      indexValue,
      indexType,
      dataPoints: priceData.length
    };
  },

  /**
   * Determine volatility level based on index value and thresholds
   * 
   * @param indexValue - The current volatility index value
   * @param normalThreshold - Threshold below which volatility is LOW/NORMAL
   * @param highThreshold - Threshold above which volatility is HIGH
   * @param extremeThreshold - Threshold above which volatility is EXTREME
   * @returns The volatility level
   */
  determineLevel(
    indexValue: number,
    normalThreshold: number,
    highThreshold: number,
    extremeThreshold: number
  ): VolatilityLevel {
    if (indexValue >= extremeThreshold) {
      return 'EXTREME';
    }
    if (indexValue >= highThreshold) {
      return 'HIGH';
    }
    if (indexValue >= normalThreshold) {
      return 'NORMAL';
    }
    return 'LOW';
  },

  /**
   * Get throttle percent based on volatility level
   * 
   * @param level - The volatility level
   * @param highThrottlePercent - Throttle percent for HIGH level
   * @param extremeThrottlePercent - Throttle percent for EXTREME level
   * @returns The throttle percentage (0-100)
   */
  getThrottlePercent(
    level: VolatilityLevel,
    highThrottlePercent: number = DEFAULT_HIGH_THROTTLE_PERCENT,
    extremeThrottlePercent: number = DEFAULT_EXTREME_THROTTLE_PERCENT
  ): number {
    switch (level) {
      case 'EXTREME':
        return extremeThrottlePercent;
      case 'HIGH':
        return highThrottlePercent;
      case 'NORMAL':
      case 'LOW':
      default:
        return 0;
    }
  },

  /**
   * Determine if new entries are allowed based on volatility level
   * 
   * Requirements: 3.3 - Block new entries at EXTREME, allow exits
   * 
   * @param level - The volatility level
   * @returns True if new entries are allowed
   */
  allowNewEntries(level: VolatilityLevel): boolean {
    return level !== 'EXTREME';
  },

  /**
   * Get volatility state for an asset
   * 
   * @param assetId - The asset identifier
   * @returns The volatility state, or null if not found
   */
  async getVolatilityState(assetId: string): Promise<VolatilityState | null> {
    return VolatilityRepository.getStateByAsset(assetId);
  },

  /**
   * Create a new volatility state for an asset
   * 
   * @param input - The volatility state input
   * @returns The created volatility state
   */
  async createVolatilityState(input: CreateVolatilityStateInput): Promise<VolatilityState> {
    const now = new Date().toISOString();
    const stateId = generateUUID();

    const state: VolatilityState = {
      stateId,
      assetId: input.assetId,
      currentIndex: input.initialIndex ?? 0,
      indexType: input.indexType,
      level: 'NORMAL',
      throttlePercent: 0,
      allowNewEntries: true,
      updatedAt: now
    };

    await VolatilityRepository.putState(state);
    return state;
  },

  /**
   * Update volatility index for an asset and recalculate level/throttle
   * 
   * Requirements: 3.1, 3.2
   * 
   * @param assetId - The asset identifier
   * @param indexValue - The new volatility index value
   * @param config - Optional config to use for thresholds
   * @returns The updated volatility state
   */
  async updateVolatilityIndex(
    assetId: string,
    indexValue: number,
    config?: VolatilityConfig
  ): Promise<VolatilityState> {
    let state = await VolatilityRepository.getStateByAsset(assetId);

    if (!state) {
      // Create new state if it doesn't exist
      state = await this.createVolatilityState({
        assetId,
        indexType: config?.indexType ?? 'ATR',
        initialIndex: indexValue
      });
    }

    // Use config thresholds or defaults
    const normalThreshold = config?.normalThreshold ?? DEFAULT_NORMAL_THRESHOLD;
    const highThreshold = config?.highThreshold ?? DEFAULT_HIGH_THRESHOLD;
    const extremeThreshold = config?.extremeThreshold ?? DEFAULT_EXTREME_THRESHOLD;
    const highThrottlePercent = config?.highThrottlePercent ?? DEFAULT_HIGH_THROTTLE_PERCENT;
    const extremeThrottlePercent = config?.extremeThrottlePercent ?? DEFAULT_EXTREME_THROTTLE_PERCENT;

    // Determine new level
    const newLevel = this.determineLevel(indexValue, normalThreshold, highThreshold, extremeThreshold);
    const previousLevel = state.level;

    // Check for cooldown if transitioning from high/extreme to lower
    if (this.isInCooldown(assetId, newLevel, previousLevel, config?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES)) {
      // During cooldown, maintain previous throttle settings
      const updatedState = await VolatilityRepository.updateState(state.stateId, {
        currentIndex: indexValue
        // Keep level, throttlePercent, and allowNewEntries unchanged
      });
      return updatedState;
    }

    // Calculate throttle and entry permissions
    const throttlePercent = this.getThrottlePercent(newLevel, highThrottlePercent, extremeThrottlePercent);
    const allowNewEntries = this.allowNewEntries(newLevel);

    // Update state
    const updatedState = await VolatilityRepository.updateState(state.stateId, {
      currentIndex: indexValue,
      level: newLevel,
      throttlePercent,
      allowNewEntries
    });

    // Start cooldown if transitioning to lower level
    if (this.shouldStartCooldown(previousLevel, newLevel)) {
      this.startCooldown(assetId, previousLevel, config?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES);
    }

    return updatedState;
  },


  /**
   * Check if asset is in cooldown period
   * 
   * Requirements: 3.5 - Cooldown before restoring normal parameters
   * 
   * @param assetId - The asset identifier
   * @param newLevel - The new volatility level
   * @param previousLevel - The previous volatility level
   * @param cooldownMinutes - Cooldown duration in minutes
   * @returns True if in cooldown and should maintain previous settings
   */
  isInCooldown(
    assetId: string,
    newLevel: VolatilityLevel,
    previousLevel: VolatilityLevel,
    cooldownMinutes: number
  ): boolean {
    const cooldown = cooldownStates.get(assetId);
    if (!cooldown) {
      return false;
    }

    // Only apply cooldown when trying to restore to lower level
    if (!this.isLowerLevel(newLevel, cooldown.previousLevel)) {
      // Clear cooldown if volatility increased again
      cooldownStates.delete(assetId);
      return false;
    }

    const cooldownStart = new Date(cooldown.startedAt).getTime();
    const cooldownEnd = cooldownStart + (cooldown.cooldownMinutes * 60 * 1000);
    const now = Date.now();

    if (now >= cooldownEnd) {
      // Cooldown expired
      cooldownStates.delete(assetId);
      return false;
    }

    return true;
  },

  /**
   * Check if we should start a cooldown period
   * 
   * @param previousLevel - The previous volatility level
   * @param newLevel - The new volatility level
   * @returns True if cooldown should start
   */
  shouldStartCooldown(previousLevel: VolatilityLevel, newLevel: VolatilityLevel): boolean {
    // Start cooldown when transitioning from HIGH/EXTREME to a lower level
    return (previousLevel === 'HIGH' || previousLevel === 'EXTREME') &&
           this.isLowerLevel(newLevel, previousLevel);
  },

  /**
   * Start a cooldown period for an asset
   * 
   * @param assetId - The asset identifier
   * @param previousLevel - The level we're transitioning from
   * @param cooldownMinutes - Cooldown duration in minutes
   */
  startCooldown(assetId: string, previousLevel: VolatilityLevel, cooldownMinutes: number): void {
    cooldownStates.set(assetId, {
      assetId,
      startedAt: new Date().toISOString(),
      previousLevel,
      cooldownMinutes
    });
  },

  /**
   * Check if one level is lower than another
   * 
   * @param level - The level to check
   * @param comparedTo - The level to compare against
   * @returns True if level is lower than comparedTo
   */
  isLowerLevel(level: VolatilityLevel, comparedTo: VolatilityLevel): boolean {
    const levelOrder: Record<VolatilityLevel, number> = {
      'LOW': 0,
      'NORMAL': 1,
      'HIGH': 2,
      'EXTREME': 3
    };
    return levelOrder[level] < levelOrder[comparedTo];
  },

  /**
   * Get remaining cooldown time for an asset
   * 
   * @param assetId - The asset identifier
   * @returns Remaining cooldown in milliseconds, or 0 if not in cooldown
   */
  getCooldownRemaining(assetId: string): number {
    const cooldown = cooldownStates.get(assetId);
    if (!cooldown) {
      return 0;
    }

    const cooldownStart = new Date(cooldown.startedAt).getTime();
    const cooldownEnd = cooldownStart + (cooldown.cooldownMinutes * 60 * 1000);
    const now = Date.now();

    return Math.max(0, cooldownEnd - now);
  },

  /**
   * Clear cooldown for an asset (for testing or manual override)
   * 
   * @param assetId - The asset identifier
   */
  clearCooldown(assetId: string): void {
    cooldownStates.delete(assetId);
  },

  /**
   * Check throttle status for an asset
   * 
   * Requirements: 3.2, 3.3, 3.4
   * 
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @returns Throttle check result with level, throttle percent, and entry permissions
   */
  async checkThrottle(tenantId: string, assetId: string): Promise<ThrottleCheckResult> {
    const state = await VolatilityRepository.getStateByAsset(assetId);

    if (!state) {
      // No state means no throttling
      return {
        level: 'NORMAL',
        throttlePercent: 0,
        allowNewEntries: true
      };
    }

    const cooldownRemainingMs = this.getCooldownRemaining(assetId);

    return {
      level: state.level,
      throttlePercent: state.throttlePercent,
      allowNewEntries: state.allowNewEntries,
      cooldownRemainingMs: cooldownRemainingMs > 0 ? cooldownRemainingMs : undefined
    };
  },

  /**
   * Apply throttle to an order by reducing position size
   * 
   * Requirements: 3.2 - Reduce position sizes at high threshold
   * 
   * @param orderQuantity - The original order quantity
   * @param throttlePercent - The throttle percentage (0-100)
   * @returns The adjusted order quantity
   */
  applyThrottle(orderQuantity: number, throttlePercent: number): number {
    if (throttlePercent <= 0) {
      return orderQuantity;
    }

    if (throttlePercent >= 100) {
      return 0;
    }

    const reductionFactor = 1 - (throttlePercent / 100);
    return orderQuantity * reductionFactor;
  },

  /**
   * Calculate adjusted max size based on throttle
   * 
   * @param maxSize - The original maximum position size
   * @param throttlePercent - The throttle percentage
   * @returns The adjusted maximum size
   */
  calculateAdjustedMaxSize(maxSize: number, throttlePercent: number): number {
    return this.applyThrottle(maxSize, throttlePercent);
  },

  /**
   * Create a new volatility config
   * 
   * @param tenantId - The tenant identifier
   * @param input - The volatility config input
   * @returns The created volatility config
   */
  async createVolatilityConfig(
    tenantId: string,
    input: CreateVolatilityConfigInput
  ): Promise<VolatilityConfig> {
    const configId = generateUUID();

    const config: VolatilityConfig = {
      configId,
      tenantId,
      assetId: input.assetId,
      indexType: input.indexType,
      normalThreshold: input.normalThreshold ?? DEFAULT_NORMAL_THRESHOLD,
      highThreshold: input.highThreshold ?? DEFAULT_HIGH_THRESHOLD,
      extremeThreshold: input.extremeThreshold ?? DEFAULT_EXTREME_THRESHOLD,
      highThrottlePercent: input.highThrottlePercent ?? DEFAULT_HIGH_THROTTLE_PERCENT,
      extremeThrottlePercent: input.extremeThrottlePercent ?? DEFAULT_EXTREME_THROTTLE_PERCENT,
      cooldownMinutes: input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES
    };

    await VolatilityRepository.putConfig(tenantId, config);
    return config;
  },

  /**
   * Get volatility config for a tenant, optionally filtered by asset
   * 
   * @param tenantId - The tenant identifier
   * @param assetId - Optional asset identifier
   * @returns The volatility config
   */
  async getVolatilityConfig(tenantId: string, assetId?: string): Promise<VolatilityConfig | null> {
    if (assetId) {
      const assetConfig = await VolatilityRepository.getConfigByAsset(tenantId, assetId);
      if (assetConfig) {
        return assetConfig;
      }
    }
    // Fall back to default config
    return VolatilityRepository.getDefaultConfig(tenantId);
  },

  /**
   * Check if trading is allowed based on volatility
   * 
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param isEntry - Whether this is a new entry (vs exit)
   * @returns True if trading is allowed
   */
  async isTradingAllowed(tenantId: string, assetId: string, isEntry: boolean): Promise<boolean> {
    const result = await this.checkThrottle(tenantId, assetId);
    
    // Exits are always allowed
    if (!isEntry) {
      return true;
    }

    // For entries, check if new entries are allowed
    return result.allowNewEntries;
  },

  /**
   * Get all assets with high or extreme volatility
   * 
   * @returns List of volatility states with HIGH or EXTREME level
   */
  async getHighVolatilityAssets(): Promise<VolatilityState[]> {
    const result = await VolatilityRepository.listStates();
    return result.items.filter(state => 
      state.level === 'HIGH' || state.level === 'EXTREME'
    );
  },

  /**
   * Batch update volatility for multiple assets
   * 
   * @param updates - Array of asset volatility updates
   * @param tenantId - The tenant identifier for config lookup
   * @returns Array of updated volatility states
   */
  async batchUpdateVolatility(
    updates: Array<{ assetId: string; indexValue: number }>,
    tenantId: string
  ): Promise<VolatilityState[]> {
    const results: VolatilityState[] = [];

    for (const update of updates) {
      const config = await this.getVolatilityConfig(tenantId, update.assetId);
      const state = await this.updateVolatilityIndex(
        update.assetId,
        update.indexValue,
        config ?? undefined
      );
      results.push(state);
    }

    return results;
  },

  /**
   * Log volatility throttle event
   * 
   * Requirements: 3.6 - Log all throttling events
   * 
   * @param assetId - The asset identifier
   * @param level - The volatility level
   * @param indexValue - The triggering index value
   * @param action - The action taken
   */
  logThrottleEvent(
    assetId: string,
    level: VolatilityLevel,
    indexValue: number,
    action: 'THROTTLE_APPLIED' | 'ENTRIES_BLOCKED' | 'NORMAL_RESTORED'
  ): void {
    // In production, this would emit to a risk event service
    console.log(`Volatility event: ${action} for ${assetId} - Level: ${level}, Index: ${indexValue}`);
  }
};
