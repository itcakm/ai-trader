/**
 * Tests for Exchange Adapter Factory
 *
 * Tests adapter creation and registry management.
 */

import {
  ExchangeAdapterFactory,
  AdapterCreationError,
  AdapterNotFoundError,
} from './exchange-adapter-factory';
import { ExchangeConfig, ExchangeId } from '../types/exchange';

describe('ExchangeAdapterFactory', () => {
  beforeEach(() => {
    ExchangeAdapterFactory.clearRegistry();
  });

  const createMockConfig = (exchangeId: ExchangeId): ExchangeConfig => ({
    exchangeId,
    tenantId: 'test-tenant',
    name: `${exchangeId} Exchange`,
    mode: 'SANDBOX',
    restEndpoint: `https://api.${exchangeId.toLowerCase()}.com`,
    wsEndpoint: `wss://ws.${exchangeId.toLowerCase()}.com`,
    authMethod: 'HMAC',
    credentials: {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      passphrase: 'test-passphrase',
    },
    supportedFeatures: {
      supportedOrderTypes: ['MARKET', 'LIMIT'],
      supportedAssets: ['BTC', 'ETH'],
      supportedTimeInForce: ['GTC', 'IOC'],
      supportsOrderModification: true,
      supportsWebSocket: true,
      supportsFIX: false,
      maxOrderSize: 1000000,
      minOrderSize: 0.001,
      tickSize: 0.01,
      lotSize: 0.001,
    },
    rateLimits: {
      ordersPerSecond: 10,
      ordersPerMinute: 600,
      queriesPerSecond: 20,
      queriesPerMinute: 1200,
      wsMessagesPerSecond: 5,
    },
    status: 'ACTIVE',
    priority: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  describe('createAdapter', () => {
    it('should create a Binance adapter', () => {
      const config = createMockConfig('BINANCE');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      expect(adapter).toBeDefined();
      expect(adapter.exchangeId).toBe('BINANCE');
      expect(adapter.mode).toBe('SANDBOX');
    });

    it('should create a Coinbase adapter with passphrase', () => {
      const config = createMockConfig('COINBASE');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      expect(adapter).toBeDefined();
      expect(adapter.exchangeId).toBe('COINBASE');
    });

    it('should throw error for Coinbase without passphrase', () => {
      const config = createMockConfig('COINBASE');
      config.credentials.passphrase = undefined;

      expect(() => ExchangeAdapterFactory.createAdapter(config)).toThrow(
        AdapterCreationError
      );
    });

    it('should create BSDEX adapter', () => {
      const config = createMockConfig('BSDEX');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      expect(adapter).toBeDefined();
      expect(adapter.exchangeId).toBe('BSDEX');
    });

    it('should create BISON adapter', () => {
      const config = createMockConfig('BISON');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      expect(adapter).toBeDefined();
      expect(adapter.exchangeId).toBe('BISON');
    });

    it('should create Finoa adapter', () => {
      const config = createMockConfig('FINOA');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      expect(adapter).toBeDefined();
      expect(adapter.exchangeId).toBe('FINOA');
    });

    it('should create Bybit adapter', () => {
      const config = createMockConfig('BYBIT');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      expect(adapter).toBeDefined();
      expect(adapter.exchangeId).toBe('BYBIT');
    });

    it('should throw error for unimplemented exchanges', () => {
      const config = createMockConfig('KRAKEN');

      expect(() => ExchangeAdapterFactory.createAdapter(config)).toThrow(
        AdapterCreationError
      );
    });
  });

  describe('registry operations', () => {
    it('should register and retrieve an adapter', () => {
      const config = createMockConfig('BINANCE');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      ExchangeAdapterFactory.registerAdapter('test-tenant', 'BINANCE', adapter);

      const retrieved = ExchangeAdapterFactory.getAdapter('test-tenant', 'BINANCE');
      expect(retrieved).toBe(adapter);
    });

    it('should return undefined for non-existent adapter', () => {
      const adapter = ExchangeAdapterFactory.getAdapter('test-tenant', 'BINANCE');
      expect(adapter).toBeUndefined();
    });

    it('should throw when using getAdapterOrThrow for non-existent adapter', () => {
      expect(() =>
        ExchangeAdapterFactory.getAdapterOrThrow('test-tenant', 'BINANCE')
      ).toThrow(AdapterNotFoundError);
    });

    it('should check if adapter exists', () => {
      const config = createMockConfig('BINANCE');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      expect(ExchangeAdapterFactory.hasAdapter('test-tenant', 'BINANCE')).toBe(false);

      ExchangeAdapterFactory.registerAdapter('test-tenant', 'BINANCE', adapter);

      expect(ExchangeAdapterFactory.hasAdapter('test-tenant', 'BINANCE')).toBe(true);
    });

    it('should remove an adapter', () => {
      const config = createMockConfig('BINANCE');
      const adapter = ExchangeAdapterFactory.createAdapter(config);

      ExchangeAdapterFactory.registerAdapter('test-tenant', 'BINANCE', adapter);
      expect(ExchangeAdapterFactory.hasAdapter('test-tenant', 'BINANCE')).toBe(true);

      const removed = ExchangeAdapterFactory.removeAdapter('test-tenant', 'BINANCE');
      expect(removed).toBe(true);
      expect(ExchangeAdapterFactory.hasAdapter('test-tenant', 'BINANCE')).toBe(false);
    });

    it('should get all adapters for a tenant', () => {
      const binanceConfig = createMockConfig('BINANCE');
      const coinbaseConfig = createMockConfig('COINBASE');

      const binanceAdapter = ExchangeAdapterFactory.createAdapter(binanceConfig);
      const coinbaseAdapter = ExchangeAdapterFactory.createAdapter(coinbaseConfig);

      ExchangeAdapterFactory.registerAdapter('test-tenant', 'BINANCE', binanceAdapter);
      ExchangeAdapterFactory.registerAdapter('test-tenant', 'COINBASE', coinbaseAdapter);
      ExchangeAdapterFactory.registerAdapter('other-tenant', 'BINANCE', binanceAdapter);

      const adapters = ExchangeAdapterFactory.getAdaptersForTenant('test-tenant');
      expect(adapters).toHaveLength(2);
    });

    it('should get registered exchange IDs for a tenant', () => {
      const binanceConfig = createMockConfig('BINANCE');
      const coinbaseConfig = createMockConfig('COINBASE');

      const binanceAdapter = ExchangeAdapterFactory.createAdapter(binanceConfig);
      const coinbaseAdapter = ExchangeAdapterFactory.createAdapter(coinbaseConfig);

      ExchangeAdapterFactory.registerAdapter('test-tenant', 'BINANCE', binanceAdapter);
      ExchangeAdapterFactory.registerAdapter('test-tenant', 'COINBASE', coinbaseAdapter);

      const exchangeIds = ExchangeAdapterFactory.getRegisteredExchangeIds('test-tenant');
      expect(exchangeIds).toContain('BINANCE');
      expect(exchangeIds).toContain('COINBASE');
    });

    it('should create and register adapter in one call', () => {
      const config = createMockConfig('BINANCE');

      const adapter = ExchangeAdapterFactory.createAndRegisterAdapter(config);

      expect(adapter).toBeDefined();
      expect(ExchangeAdapterFactory.hasAdapter('test-tenant', 'BINANCE')).toBe(true);
    });

    it('should clear registry', () => {
      const config = createMockConfig('BINANCE');
      ExchangeAdapterFactory.createAndRegisterAdapter(config);

      expect(ExchangeAdapterFactory.getRegistrySize()).toBe(1);

      ExchangeAdapterFactory.clearRegistry();

      expect(ExchangeAdapterFactory.getRegistrySize()).toBe(0);
    });
  });
});
