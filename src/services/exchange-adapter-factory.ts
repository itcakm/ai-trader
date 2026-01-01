/**
 * Exchange Adapter Factory
 *
 * Creates and manages exchange adapters based on exchange configuration.
 * Provides a unified interface for obtaining adapters by exchange ID.
 *
 * Requirements: 1.1
 */

import { ExchangeId, ExchangeConfig } from '../types/exchange';
import {
  BaseExchangeAdapter,
  ExchangeAdapterConfig,
} from '../adapters/exchange/base-exchange-adapter';
import { BinanceAdapter, BinanceAdapterConfig } from '../adapters/exchange/binance-adapter';
import { CoinbaseAdapter, CoinbaseAdapterConfig } from '../adapters/exchange/coinbase-adapter';
import { BSDEXAdapter, BSDEXAdapterConfig } from '../adapters/exchange/bsdex-adapter';
import { BISONAdapter, BISONAdapterConfig } from '../adapters/exchange/bison-adapter';
import { FinoaAdapter, FinoaAdapterConfig } from '../adapters/exchange/finoa-adapter';
import { BybitAdapter, BybitAdapterConfig } from '../adapters/exchange/bybit-adapter';

/**
 * Error thrown when adapter creation fails
 */
export class AdapterCreationError extends Error {
  constructor(
    message: string,
    public readonly exchangeId: ExchangeId,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AdapterCreationError';
  }
}

/**
 * Error thrown when adapter is not found
 */
export class AdapterNotFoundError extends Error {
  constructor(tenantId: string, exchangeId: ExchangeId) {
    super(`Adapter for exchange '${exchangeId}' not found for tenant '${tenantId}'`);
    this.name = 'AdapterNotFoundError';
  }
}

/**
 * Registry key for adapter storage
 */
function getAdapterKey(tenantId: string, exchangeId: ExchangeId): string {
  return `${tenantId}:${exchangeId}`;
}

/**
 * In-memory adapter registry
 */
const adapterRegistry = new Map<string, BaseExchangeAdapter>();

/**
 * Exchange Adapter Factory
 *
 * Creates and manages exchange adapters for different exchanges.
 */
export const ExchangeAdapterFactory = {
  /**
   * Create an adapter from exchange configuration
   *
   * @param config - The exchange configuration
   * @returns The created adapter
   * @throws AdapterCreationError if creation fails
   *
   * Requirements: 1.1
   */
  createAdapter(config: ExchangeConfig): BaseExchangeAdapter {
    const baseConfig: ExchangeAdapterConfig = {
      exchangeId: config.exchangeId,
      tenantId: config.tenantId,
      mode: config.mode,
      restEndpoint: config.restEndpoint,
      wsEndpoint: config.wsEndpoint,
      fixEndpoint: config.fixEndpoint,
      apiKey: config.credentials.apiKey,
      apiSecret: config.credentials.apiSecret,
      passphrase: config.credentials.passphrase,
    };

    try {
      switch (config.exchangeId) {
        case 'BINANCE':
          return new BinanceAdapter(baseConfig as BinanceAdapterConfig);

        case 'COINBASE':
          if (!config.credentials.passphrase) {
            throw new AdapterCreationError(
              'Coinbase requires a passphrase',
              config.exchangeId
            );
          }
          return new CoinbaseAdapter({
            ...baseConfig,
            passphrase: config.credentials.passphrase,
          } as CoinbaseAdapterConfig);

        case 'BSDEX':
          return new BSDEXAdapter(baseConfig as BSDEXAdapterConfig);

        case 'BISON':
          return new BISONAdapter(baseConfig as BISONAdapterConfig);

        case 'FINOA':
          return new FinoaAdapter(baseConfig as FinoaAdapterConfig);

        case 'BYBIT':
          return new BybitAdapter(baseConfig as BybitAdapterConfig);

        case 'KRAKEN':
        case 'OKX':
          // These adapters are not yet implemented
          throw new AdapterCreationError(
            `Adapter for ${config.exchangeId} is not yet implemented`,
            config.exchangeId
          );

        default:
          throw new AdapterCreationError(
            `Unknown exchange: ${config.exchangeId}`,
            config.exchangeId
          );
      }
    } catch (error) {
      if (error instanceof AdapterCreationError) {
        throw error;
      }
      throw new AdapterCreationError(
        `Failed to create adapter for ${config.exchangeId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        config.exchangeId,
        error
      );
    }
  },

  /**
   * Register an adapter in the registry
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param adapter - The adapter to register
   */
  registerAdapter(
    tenantId: string,
    exchangeId: ExchangeId,
    adapter: BaseExchangeAdapter
  ): void {
    const key = getAdapterKey(tenantId, exchangeId);
    adapterRegistry.set(key, adapter);
  },

  /**
   * Get an adapter from the registry
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns The adapter, or undefined if not found
   */
  getAdapter(tenantId: string, exchangeId: ExchangeId): BaseExchangeAdapter | undefined {
    const key = getAdapterKey(tenantId, exchangeId);
    return adapterRegistry.get(key);
  },

  /**
   * Get an adapter, throwing if not found
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns The adapter
   * @throws AdapterNotFoundError if not found
   */
  getAdapterOrThrow(tenantId: string, exchangeId: ExchangeId): BaseExchangeAdapter {
    const adapter = this.getAdapter(tenantId, exchangeId);
    if (!adapter) {
      throw new AdapterNotFoundError(tenantId, exchangeId);
    }
    return adapter;
  },

  /**
   * Check if an adapter exists in the registry
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns True if the adapter exists
   */
  hasAdapter(tenantId: string, exchangeId: ExchangeId): boolean {
    const key = getAdapterKey(tenantId, exchangeId);
    return adapterRegistry.has(key);
  },

  /**
   * Remove an adapter from the registry
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns True if the adapter was removed
   */
  removeAdapter(tenantId: string, exchangeId: ExchangeId): boolean {
    const key = getAdapterKey(tenantId, exchangeId);
    return adapterRegistry.delete(key);
  },

  /**
   * Get all adapters for a tenant
   *
   * @param tenantId - The tenant identifier
   * @returns Array of adapters
   */
  getAdaptersForTenant(tenantId: string): BaseExchangeAdapter[] {
    const adapters: BaseExchangeAdapter[] = [];
    adapterRegistry.forEach((adapter, key) => {
      if (key.startsWith(`${tenantId}:`)) {
        adapters.push(adapter);
      }
    });
    return adapters;
  },

  /**
   * Get all registered exchange IDs for a tenant
   *
   * @param tenantId - The tenant identifier
   * @returns Array of exchange IDs
   */
  getRegisteredExchangeIds(tenantId: string): ExchangeId[] {
    const exchangeIds: ExchangeId[] = [];
    adapterRegistry.forEach((_, key) => {
      if (key.startsWith(`${tenantId}:`)) {
        const exchangeId = key.split(':')[1] as ExchangeId;
        exchangeIds.push(exchangeId);
      }
    });
    return exchangeIds;
  },

  /**
   * Create and register an adapter from exchange configuration
   *
   * @param config - The exchange configuration
   * @returns The created and registered adapter
   */
  createAndRegisterAdapter(config: ExchangeConfig): BaseExchangeAdapter {
    const adapter = this.createAdapter(config);
    this.registerAdapter(config.tenantId, config.exchangeId, adapter);
    return adapter;
  },

  /**
   * Clear all adapters from the registry (for testing)
   */
  clearRegistry(): void {
    adapterRegistry.clear();
  },

  /**
   * Get the number of registered adapters
   *
   * @returns The count of registered adapters
   */
  getRegistrySize(): number {
    return adapterRegistry.size;
  },

  /**
   * Disconnect and remove all adapters for a tenant
   *
   * @param tenantId - The tenant identifier
   */
  async disconnectAllForTenant(tenantId: string): Promise<void> {
    const adapters = this.getAdaptersForTenant(tenantId);
    
    for (const adapter of adapters) {
      try {
        if (adapter.isConnected()) {
          await adapter.disconnect();
        }
      } catch (error) {
        // Log but don't throw - continue disconnecting other adapters
        console.error(`Error disconnecting adapter: ${error}`);
      }
    }

    // Remove all adapters for tenant
    const keysToRemove: string[] = [];
    adapterRegistry.forEach((_, key) => {
      if (key.startsWith(`${tenantId}:`)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(key => adapterRegistry.delete(key));
  },
};
