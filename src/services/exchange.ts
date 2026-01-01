/**
 * Exchange Service
 *
 * Manages exchange configurations including registration, retrieval, updates,
 * and status management. Provides tenant-isolated access to exchange configs.
 *
 * Requirements: 1.2, 1.4, 1.5
 */

import {
  ExchangeId,
  ExchangeStatus,
  ExchangeMode,
  ExchangeConfig,
  ExchangeConfigInput,
} from '../types/exchange';
import { ExchangeRepository } from '../repositories/exchange';
import {
  validateExchangeConfig,
  ValidationResult,
  formatErrors,
} from './exchange-config-validator';
import { generateUUID } from '../utils/uuid';

/**
 * Error thrown when exchange validation fails
 */
export class ExchangeValidationError extends Error {
  constructor(
    message: string,
    public readonly validationResult: ValidationResult
  ) {
    super(message);
    this.name = 'ExchangeValidationError';
  }
}

/**
 * Error thrown when an exchange is not found
 */
export class ExchangeNotFoundError extends Error {
  constructor(tenantId: string, exchangeId: ExchangeId) {
    super(`Exchange '${exchangeId}' not found for tenant '${tenantId}'`);
    this.name = 'ExchangeNotFoundError';
  }
}

/**
 * Error thrown when an exchange is unavailable
 */
export class ExchangeUnavailableError extends Error {
  constructor(
    exchangeId: ExchangeId,
    public readonly status: ExchangeStatus
  ) {
    super(`Exchange '${exchangeId}' is unavailable (status: ${status})`);
    this.name = 'ExchangeUnavailableError';
  }
}

/**
 * Options for listing exchanges
 */
export interface ListExchangesOptions {
  status?: ExchangeStatus;
  mode?: ExchangeMode;
  limit?: number;
}


/**
 * Exchange Service - manages exchange configurations
 */
export const ExchangeService = {
  /**
   * Register a new exchange configuration
   *
   * @param tenantId - The tenant identifier
   * @param config - The exchange configuration input
   * @returns The created exchange configuration
   * @throws ExchangeValidationError if validation fails
   *
   * Requirements: 1.2, 1.5
   */
  async registerExchange(
    tenantId: string,
    config: ExchangeConfigInput
  ): Promise<ExchangeConfig> {
    // Validate the configuration
    const validationResult = validateExchangeConfig(config);
    if (!validationResult.valid) {
      throw new ExchangeValidationError(
        `Invalid exchange configuration: ${formatErrors(validationResult)}`,
        validationResult
      );
    }

    const now = new Date().toISOString();

    // Create the full exchange config
    const exchangeConfig: ExchangeConfig = {
      exchangeId: config.exchangeId,
      tenantId,
      name: config.name,
      mode: config.mode,
      restEndpoint: config.restEndpoint,
      wsEndpoint: config.wsEndpoint,
      fixEndpoint: config.fixEndpoint,
      authMethod: config.authMethod,
      credentials: config.credentials,
      supportedFeatures: config.supportedFeatures,
      rateLimits: config.rateLimits,
      status: 'ACTIVE',
      priority: config.priority ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    // Save to repository
    await ExchangeRepository.putExchange(tenantId, exchangeConfig);

    return exchangeConfig;
  },

  /**
   * Get an exchange configuration by ID
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns The exchange configuration
   * @throws ExchangeNotFoundError if not found
   *
   * Requirements: 1.2
   */
  async getExchange(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<ExchangeConfig> {
    const config = await ExchangeRepository.getExchange(tenantId, exchangeId);
    if (!config) {
      throw new ExchangeNotFoundError(tenantId, exchangeId);
    }
    return config;
  },

  /**
   * Update an existing exchange configuration
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param updates - Partial configuration updates
   * @returns The updated exchange configuration
   * @throws ExchangeNotFoundError if not found
   * @throws ExchangeValidationError if validation fails
   *
   * Requirements: 1.2, 1.5
   */
  async updateExchange(
    tenantId: string,
    exchangeId: ExchangeId,
    updates: Partial<ExchangeConfigInput>
  ): Promise<ExchangeConfig> {
    // Get existing config
    const existing = await this.getExchange(tenantId, exchangeId);

    // Merge updates with existing config
    const mergedInput: ExchangeConfigInput = {
      exchangeId: existing.exchangeId,
      name: updates.name ?? existing.name,
      mode: updates.mode ?? existing.mode,
      restEndpoint: updates.restEndpoint ?? existing.restEndpoint,
      wsEndpoint: updates.wsEndpoint ?? existing.wsEndpoint,
      fixEndpoint: updates.fixEndpoint ?? existing.fixEndpoint,
      authMethod: updates.authMethod ?? existing.authMethod,
      credentials: updates.credentials ?? existing.credentials,
      supportedFeatures: updates.supportedFeatures ?? existing.supportedFeatures,
      rateLimits: updates.rateLimits ?? existing.rateLimits,
      priority: updates.priority ?? existing.priority,
    };

    // Validate the merged configuration
    const validationResult = validateExchangeConfig(mergedInput);
    if (!validationResult.valid) {
      throw new ExchangeValidationError(
        `Invalid exchange configuration: ${formatErrors(validationResult)}`,
        validationResult
      );
    }

    const now = new Date().toISOString();

    // Create updated config
    const updatedConfig: ExchangeConfig = {
      ...existing,
      ...mergedInput,
      updatedAt: now,
    };

    // Save to repository
    await ExchangeRepository.putExchange(tenantId, updatedConfig);

    return updatedConfig;
  },

  /**
   * List all exchanges for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param options - Optional filtering options
   * @returns List of exchange configurations
   *
   * Requirements: 1.2
   */
  async listExchanges(
    tenantId: string,
    options?: ListExchangesOptions
  ): Promise<ExchangeConfig[]> {
    const exchanges = await ExchangeRepository.listExchanges(tenantId);

    // Apply filters if provided
    let filtered = exchanges;

    if (options?.status) {
      filtered = filtered.filter((e: ExchangeConfig) => e.status === options.status);
    }

    if (options?.mode) {
      filtered = filtered.filter((e: ExchangeConfig) => e.mode === options.mode);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  },

  /**
   * Set the status of an exchange
   *
   * When an exchange becomes unavailable (INACTIVE, MAINTENANCE, ERROR),
   * it should be marked accordingly to prevent new orders.
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param status - The new status
   * @throws ExchangeNotFoundError if not found
   *
   * Requirements: 1.4
   */
  async setExchangeStatus(
    tenantId: string,
    exchangeId: ExchangeId,
    status: ExchangeStatus
  ): Promise<ExchangeConfig> {
    const existing = await this.getExchange(tenantId, exchangeId);

    const now = new Date().toISOString();

    const updatedConfig: ExchangeConfig = {
      ...existing,
      status,
      updatedAt: now,
    };

    await ExchangeRepository.putExchange(tenantId, updatedConfig);

    return updatedConfig;
  },

  /**
   * Check if an exchange is available for trading
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns True if the exchange is active and available
   *
   * Requirements: 1.4
   */
  async isExchangeAvailable(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<boolean> {
    try {
      const config = await this.getExchange(tenantId, exchangeId);
      return config.status === 'ACTIVE';
    } catch (error) {
      if (error instanceof ExchangeNotFoundError) {
        return false;
      }
      throw error;
    }
  },

  /**
   * Get available exchanges for trading (status = ACTIVE)
   *
   * @param tenantId - The tenant identifier
   * @returns List of active exchange configurations sorted by priority
   *
   * Requirements: 1.4
   */
  async getAvailableExchanges(tenantId: string): Promise<ExchangeConfig[]> {
    const exchanges = await this.listExchanges(tenantId, { status: 'ACTIVE' });
    // Sort by priority (lower number = higher priority)
    return exchanges.sort((a, b) => a.priority - b.priority);
  },

  /**
   * Delete an exchange configuration
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @throws ExchangeNotFoundError if not found
   *
   * Requirements: 1.2
   */
  async deleteExchange(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<void> {
    // Verify it exists first
    await this.getExchange(tenantId, exchangeId);
    await ExchangeRepository.deleteExchange(tenantId, exchangeId);
  },

  /**
   * Check if an exchange exists for a tenant
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns True if the exchange exists
   */
  async exchangeExists(
    tenantId: string,
    exchangeId: ExchangeId
  ): Promise<boolean> {
    const config = await ExchangeRepository.getExchange(tenantId, exchangeId);
    return config !== null;
  },
};
