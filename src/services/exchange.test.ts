/**
 * Property-based tests for Exchange Service
 *
 * **Property 3: Exchange Unavailability Handling**
 * *For any* Exchange marked with status INACTIVE or ERROR, all order submissions
 * to that exchange SHALL be rejected with an appropriate error, AND the Order_Router
 * SHALL route to the next available exchange by priority.
 *
 * **Validates: Requirements 1.4, 6.4**
 *
 * **Property 4: Sandbox Mode Isolation**
 * *For any* Exchange_Config with mode SANDBOX, all API calls SHALL be directed to
 * the exchange's testnet/sandbox endpoints, AND no calls SHALL be made to production endpoints.
 *
 * **Validates: Requirements 1.6**
 */

import * as fc from 'fast-check';
import {
  ExchangeId,
  ExchangeMode,
  ExchangeStatus,
  ExchangeConfig,
  ExchangeConfigInput,
  ExchangeFeatures,
  ExchangeRateLimits,
  EncryptedCredentials,
  AuthMethod,
} from '../types/exchange';
import { OrderType, TimeInForce } from '../types/exchange-order';
import {
  ExchangeService,
  ExchangeNotFoundError,
  ExchangeUnavailableError,
  ExchangeValidationError,
} from './exchange';
import { ExchangeRepository } from '../repositories/exchange';

// ============================================
// Mock Repository
// ============================================

// In-memory store for testing
let mockStore: Map<string, ExchangeConfig>;

// Mock the repository
jest.mock('../repositories/exchange', () => ({
  ExchangeRepository: {
    getExchange: jest.fn(async (tenantId: string, exchangeId: ExchangeId) => {
      const key = `${tenantId}:${exchangeId}`;
      return mockStore.get(key) || null;
    }),
    putExchange: jest.fn(async (tenantId: string, config: ExchangeConfig) => {
      const key = `${tenantId}:${config.exchangeId}`;
      mockStore.set(key, config);
    }),
    listExchanges: jest.fn(async (tenantId: string) => {
      const results: ExchangeConfig[] = [];
      mockStore.forEach((config, key) => {
        if (key.startsWith(`${tenantId}:`)) {
          results.push(config);
        }
      });
      return results;
    }),
    deleteExchange: jest.fn(async (tenantId: string, exchangeId: ExchangeId) => {
      const key = `${tenantId}:${exchangeId}`;
      mockStore.delete(key);
    }),
  },
}));

// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for ExchangeMode
 */
const exchangeModeArb = (): fc.Arbitrary<ExchangeMode> =>
  fc.constantFrom('PRODUCTION', 'SANDBOX');

/**
 * Generator for ExchangeStatus
 */
const exchangeStatusArb = (): fc.Arbitrary<ExchangeStatus> =>
  fc.constantFrom('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR');

/**
 * Generator for unavailable exchange statuses
 */
const unavailableStatusArb = (): fc.Arbitrary<ExchangeStatus> =>
  fc.constantFrom('INACTIVE', 'MAINTENANCE', 'ERROR');

/**
 * Generator for AuthMethod
 */
const authMethodArb = (): fc.Arbitrary<AuthMethod> =>
  fc.constantFrom('API_KEY', 'HMAC', 'OAUTH', 'FIX_CREDENTIALS');


/**
 * Generator for EncryptedCredentials
 */
const credentialsArb = (authMethod?: AuthMethod): fc.Arbitrary<EncryptedCredentials> =>
  fc.record({
    apiKey: fc.string({ minLength: 10, maxLength: 64 }).filter((s) => s.trim().length >= 10),
    apiSecret: fc.string({ minLength: 10, maxLength: 64 }).filter((s) => s.trim().length >= 10),
    passphrase: fc.option(fc.string({ minLength: 5, maxLength: 32 }), { nil: undefined }),
    fixSenderCompId:
      authMethod === 'FIX_CREDENTIALS'
        ? fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length >= 3)
        : fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
    fixTargetCompId:
      authMethod === 'FIX_CREDENTIALS'
        ? fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length >= 3)
        : fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
  });

/**
 * Generator for ExchangeFeatures
 */
const exchangeFeaturesArb = (): fc.Arbitrary<ExchangeFeatures> =>
  fc.record({
    supportedOrderTypes: fc.array(
      fc.constantFrom('MARKET', 'LIMIT', 'STOP_LIMIT', 'STOP_MARKET', 'TRAILING_STOP') as fc.Arbitrary<OrderType>,
      { minLength: 1, maxLength: 5 }
    ),
    supportedAssets: fc.array(
      fc.constantFrom('BTC', 'ETH', 'SOL', 'ADA', 'XRP'),
      { minLength: 1, maxLength: 10 }
    ),
    supportedTimeInForce: fc.array(
      fc.constantFrom('GTC', 'IOC', 'FOK', 'GTD') as fc.Arbitrary<TimeInForce>,
      { minLength: 1, maxLength: 4 }
    ),
    supportsOrderModification: fc.boolean(),
    supportsWebSocket: fc.boolean(),
    supportsFIX: fc.boolean(),
    maxOrderSize: fc.double({ min: 1000, max: 1000000, noNaN: true }),
    minOrderSize: fc.double({ min: 0.0001, max: 1, noNaN: true }),
    tickSize: fc.double({ min: 0.00001, max: 0.01, noNaN: true }),
    lotSize: fc.double({ min: 0.00001, max: 0.01, noNaN: true }),
  });

/**
 * Generator for ExchangeRateLimits
 * Ensures consistency: per-second * 60 <= per-minute * 2 (allowing burst)
 */
const exchangeRateLimitsArb = (): fc.Arbitrary<ExchangeRateLimits> =>
  fc.integer({ min: 10, max: 100 }).chain((ordersPerSecond) =>
    fc.integer({ min: 10, max: 100 }).chain((queriesPerSecond) =>
      fc.record({
        ordersPerSecond: fc.constant(ordersPerSecond),
        ordersPerMinute: fc.constant(ordersPerSecond * 60), // Consistent with per-second
        queriesPerSecond: fc.constant(queriesPerSecond),
        queriesPerMinute: fc.constant(queriesPerSecond * 60), // Consistent with per-second
        wsMessagesPerSecond: fc.integer({ min: 1, max: 100 }),
        weightPerMinute: fc.option(fc.integer({ min: 100, max: 10000 }), { nil: undefined }),
      })
    )
  );

/**
 * Generator for production REST endpoints
 */
const productionEndpointArb = (exchangeId: ExchangeId): fc.Arbitrary<string> => {
  const endpoints: Record<ExchangeId, string> = {
    BINANCE: 'https://api.binance.com',
    COINBASE: 'https://api.coinbase.com',
    KRAKEN: 'https://api.kraken.com',
    OKX: 'https://api.okx.com',
    BSDEX: 'https://api.bsdex.de',
    BISON: 'https://api.bisonapp.com',
    FINOA: 'https://api.finoa.io',
    BYBIT: 'https://api.bybit.com',
  };
  return fc.constant(endpoints[exchangeId]);
};

/**
 * Generator for sandbox REST endpoints
 */
const sandboxEndpointArb = (exchangeId: ExchangeId): fc.Arbitrary<string> => {
  const endpoints: Record<ExchangeId, string> = {
    BINANCE: 'https://testnet.binance.vision',
    COINBASE: 'https://api-public.sandbox.exchange.coinbase.com',
    KRAKEN: 'https://demo-futures.kraken.com',
    OKX: 'https://www.okx.com/api/v5/public/simulated',
    BSDEX: 'https://sandbox.api.bsdex.de',
    BISON: 'https://sandbox.api.bisonapp.com',
    FINOA: 'https://sandbox.api.finoa.io',
    BYBIT: 'https://api-testnet.bybit.com',
  };
  return fc.constant(endpoints[exchangeId]);
};

/**
 * Generator for ExchangeConfigInput with specific mode
 */
const exchangeConfigInputArb = (mode?: ExchangeMode): fc.Arbitrary<ExchangeConfigInput> =>
  exchangeIdArb().chain((exchangeId) =>
    authMethodArb().chain((authMethod) =>
      fc.record({
        exchangeId: fc.constant(exchangeId),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        mode: mode ? fc.constant(mode) : exchangeModeArb(),
        restEndpoint: mode === 'SANDBOX' 
          ? sandboxEndpointArb(exchangeId) 
          : mode === 'PRODUCTION' 
            ? productionEndpointArb(exchangeId)
            : fc.oneof(productionEndpointArb(exchangeId), sandboxEndpointArb(exchangeId)),
        wsEndpoint: fc.option(fc.constant('wss://stream.binance.com:9443'), { nil: undefined }),
        fixEndpoint: fc.option(fc.constant('fix.exchange.com:4567'), { nil: undefined }),
        authMethod: fc.constant(authMethod),
        credentials: credentialsArb(authMethod),
        supportedFeatures: exchangeFeaturesArb(),
        rateLimits: exchangeRateLimitsArb(),
        priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
      })
    )
  );

/**
 * Generator for a complete ExchangeConfig
 */
const exchangeConfigArb = (status?: ExchangeStatus, mode?: ExchangeMode): fc.Arbitrary<ExchangeConfig> =>
  exchangeConfigInputArb(mode).chain((input) =>
    fc.record({
      ...input,
      exchangeId: fc.constant(input.exchangeId),
      tenantId: fc.uuid(),
      name: fc.constant(input.name),
      mode: fc.constant(input.mode),
      restEndpoint: fc.constant(input.restEndpoint),
      wsEndpoint: fc.constant(input.wsEndpoint),
      fixEndpoint: fc.constant(input.fixEndpoint),
      authMethod: fc.constant(input.authMethod),
      credentials: fc.constant(input.credentials),
      supportedFeatures: fc.constant(input.supportedFeatures),
      rateLimits: fc.constant(input.rateLimits),
      status: status ? fc.constant(status) : exchangeStatusArb(),
      priority: fc.constant(input.priority ?? 0),
      createdAt: fc.date().map((d) => d.toISOString()),
      updatedAt: fc.date().map((d) => d.toISOString()),
    })
  );

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  mockStore = new Map();
  jest.clearAllMocks();
});

// ============================================
// Property Tests
// ============================================

describe('Exchange Service', () => {
  describe('Property 3: Exchange Unavailability Handling', () => {
    /**
     * Feature: exchange-integration, Property 3: Exchange Unavailability Handling
     *
     * For any exchange marked with status INACTIVE, MAINTENANCE, or ERROR,
     * isExchangeAvailable SHALL return false.
     *
     * **Validates: Requirements 1.4, 6.4**
     */
    it('should return false for unavailable exchanges', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeConfigArb(),
          unavailableStatusArb(),
          async (config, unavailableStatus) => {
            // Set up the exchange with unavailable status
            const configWithStatus: ExchangeConfig = {
              ...config,
              status: unavailableStatus,
            };
            mockStore.set(`${config.tenantId}:${config.exchangeId}`, configWithStatus);

            // Check availability
            const isAvailable = await ExchangeService.isExchangeAvailable(
              config.tenantId,
              config.exchangeId
            );

            // Should be unavailable
            expect(isAvailable).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 3: Exchange Unavailability Handling
     *
     * For any exchange marked with status ACTIVE, isExchangeAvailable SHALL return true.
     *
     * **Validates: Requirements 1.4, 6.4**
     */
    it('should return true for active exchanges', async () => {
      await fc.assert(
        fc.asyncProperty(exchangeConfigArb('ACTIVE'), async (config) => {
          // Set up the exchange with ACTIVE status
          mockStore.set(`${config.tenantId}:${config.exchangeId}`, config);

          // Check availability
          const isAvailable = await ExchangeService.isExchangeAvailable(
            config.tenantId,
            config.exchangeId
          );

          // Should be available
          expect(isAvailable).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 3: Exchange Unavailability Handling
     *
     * getAvailableExchanges SHALL only return exchanges with ACTIVE status,
     * sorted by priority.
     *
     * **Validates: Requirements 1.4, 6.4**
     */
    it('should only return active exchanges sorted by priority', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(exchangeConfigArb(), { minLength: 1, maxLength: 5 }),
          async (tenantId, configs) => {
            // Assign unique exchange IDs and set up configs with the same tenant
            const exchangeIds: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BYBIT'];
            const configsWithTenant = configs.slice(0, exchangeIds.length).map((config, index) => ({
              ...config,
              tenantId,
              exchangeId: exchangeIds[index],
              priority: Math.floor(Math.random() * 100),
            }));

            // Store all configs
            for (const config of configsWithTenant) {
              mockStore.set(`${tenantId}:${config.exchangeId}`, config);
            }

            // Get available exchanges
            const available = await ExchangeService.getAvailableExchanges(tenantId);

            // All returned exchanges should be ACTIVE
            for (const exchange of available) {
              expect(exchange.status).toBe('ACTIVE');
            }

            // Should be sorted by priority (ascending)
            for (let i = 1; i < available.length; i++) {
              expect(available[i].priority).toBeGreaterThanOrEqual(available[i - 1].priority);
            }

            // Count should match active exchanges
            const activeCount = configsWithTenant.filter((c) => c.status === 'ACTIVE').length;
            expect(available.length).toBe(activeCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 3: Exchange Unavailability Handling
     *
     * setExchangeStatus SHALL correctly update the exchange status.
     *
     * **Validates: Requirements 1.4**
     */
    it('should correctly update exchange status', async () => {
      await fc.assert(
        fc.asyncProperty(
          exchangeConfigArb('ACTIVE'),
          unavailableStatusArb(),
          async (config, newStatus) => {
            // Set up the exchange
            mockStore.set(`${config.tenantId}:${config.exchangeId}`, config);

            // Update status
            const updated = await ExchangeService.setExchangeStatus(
              config.tenantId,
              config.exchangeId,
              newStatus
            );

            // Verify status was updated
            expect(updated.status).toBe(newStatus);

            // Verify it's now unavailable
            const isAvailable = await ExchangeService.isExchangeAvailable(
              config.tenantId,
              config.exchangeId
            );
            expect(isAvailable).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 4: Sandbox Mode Isolation', () => {
    /**
     * Feature: exchange-integration, Property 4: Sandbox Mode Isolation
     *
     * For any exchange config with mode SANDBOX, the restEndpoint SHALL be
     * a sandbox/testnet endpoint.
     *
     * **Validates: Requirements 1.6**
     */
    it('should use sandbox endpoints for sandbox mode exchanges', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeConfigInputArb('SANDBOX'),
          async (tenantId, input) => {
            // Register the exchange
            const config = await ExchangeService.registerExchange(tenantId, input);

            // Verify mode is SANDBOX
            expect(config.mode).toBe('SANDBOX');

            // Verify endpoint is a sandbox endpoint (contains testnet, sandbox, or simulated)
            const endpoint = config.restEndpoint.toLowerCase();
            const isSandboxEndpoint =
              endpoint.includes('testnet') ||
              endpoint.includes('sandbox') ||
              endpoint.includes('demo') ||
              endpoint.includes('simulated') ||
              endpoint.includes('api-testnet');

            expect(isSandboxEndpoint).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 4: Sandbox Mode Isolation
     *
     * For any exchange config with mode PRODUCTION, the restEndpoint SHALL NOT
     * be a sandbox/testnet endpoint.
     *
     * **Validates: Requirements 1.6**
     */
    it('should use production endpoints for production mode exchanges', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeConfigInputArb('PRODUCTION'),
          async (tenantId, input) => {
            // Register the exchange
            const config = await ExchangeService.registerExchange(tenantId, input);

            // Verify mode is PRODUCTION
            expect(config.mode).toBe('PRODUCTION');

            // Verify endpoint is NOT a sandbox endpoint
            const endpoint = config.restEndpoint.toLowerCase();
            const isSandboxEndpoint =
              endpoint.includes('testnet') ||
              endpoint.includes('sandbox') ||
              endpoint.includes('demo') ||
              endpoint.includes('simulated') ||
              endpoint.includes('api-testnet');

            expect(isSandboxEndpoint).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 4: Sandbox Mode Isolation
     *
     * Updating an exchange from PRODUCTION to SANDBOX mode SHALL require
     * updating the endpoint to a sandbox endpoint.
     *
     * **Validates: Requirements 1.6**
     */
    it('should maintain mode-endpoint consistency after updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeConfigInputArb('PRODUCTION'),
          async (tenantId, input) => {
            // Register production exchange
            const config = await ExchangeService.registerExchange(tenantId, input);
            expect(config.mode).toBe('PRODUCTION');

            // Get the sandbox endpoint for this exchange
            const sandboxEndpoints: Record<ExchangeId, string> = {
              BINANCE: 'https://testnet.binance.vision',
              COINBASE: 'https://api-public.sandbox.exchange.coinbase.com',
              KRAKEN: 'https://demo-futures.kraken.com',
              OKX: 'https://www.okx.com/api/v5/public/simulated',
              BSDEX: 'https://sandbox.api.bsdex.de',
              BISON: 'https://sandbox.api.bisonapp.com',
              FINOA: 'https://sandbox.api.finoa.io',
              BYBIT: 'https://api-testnet.bybit.com',
            };

            // Update to sandbox mode with sandbox endpoint
            const updated = await ExchangeService.updateExchange(tenantId, input.exchangeId, {
              mode: 'SANDBOX',
              restEndpoint: sandboxEndpoints[input.exchangeId],
            });

            // Verify mode and endpoint are consistent
            expect(updated.mode).toBe('SANDBOX');
            const endpoint = updated.restEndpoint.toLowerCase();
            const isSandboxEndpoint =
              endpoint.includes('testnet') ||
              endpoint.includes('sandbox') ||
              endpoint.includes('demo') ||
              endpoint.includes('simulated') ||
              endpoint.includes('api-testnet');

            expect(isSandboxEndpoint).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Exchange Registration and Retrieval', () => {
    /**
     * For any valid exchange configuration, registration SHALL succeed
     * and the exchange SHALL be retrievable.
     */
    it('should register and retrieve exchanges correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeConfigInputArb(),
          async (tenantId, input) => {
            // Register the exchange
            const registered = await ExchangeService.registerExchange(tenantId, input);

            // Verify registration
            expect(registered.exchangeId).toBe(input.exchangeId);
            expect(registered.tenantId).toBe(tenantId);
            expect(registered.name).toBe(input.name);
            expect(registered.mode).toBe(input.mode);
            expect(registered.status).toBe('ACTIVE');

            // Retrieve the exchange
            const retrieved = await ExchangeService.getExchange(tenantId, input.exchangeId);

            // Verify retrieval matches registration
            expect(retrieved.exchangeId).toBe(registered.exchangeId);
            expect(retrieved.tenantId).toBe(registered.tenantId);
            expect(retrieved.name).toBe(registered.name);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * For any non-existent exchange, getExchange SHALL throw ExchangeNotFoundError.
     */
    it('should throw ExchangeNotFoundError for non-existent exchanges', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), exchangeIdArb(), async (tenantId, exchangeId) => {
          // Ensure the exchange doesn't exist
          mockStore.delete(`${tenantId}:${exchangeId}`);

          // Attempt to get the exchange
          await expect(
            ExchangeService.getExchange(tenantId, exchangeId)
          ).rejects.toThrow(ExchangeNotFoundError);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Exchange Updates', () => {
    /**
     * For any registered exchange, updates SHALL be applied correctly.
     */
    it('should update exchanges correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          exchangeConfigInputArb(),
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
          async (tenantId, input, newName) => {
            // Register the exchange
            await ExchangeService.registerExchange(tenantId, input);

            // Update the exchange
            const updated = await ExchangeService.updateExchange(tenantId, input.exchangeId, {
              name: newName,
            });

            // Verify update
            expect(updated.name).toBe(newName);
            expect(updated.exchangeId).toBe(input.exchangeId);
            expect(updated.tenantId).toBe(tenantId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Exchange Listing', () => {
    /**
     * listExchanges SHALL return all exchanges for a tenant.
     */
    it('should list all exchanges for a tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(exchangeConfigInputArb(), { minLength: 1, maxLength: 3 }),
          async (tenantId, inputs) => {
            // Clear the store for this tenant first
            const keysToDelete: string[] = [];
            mockStore.forEach((_, key) => {
              if (key.startsWith(`${tenantId}:`)) {
                keysToDelete.push(key);
              }
            });
            keysToDelete.forEach((key) => mockStore.delete(key));

            // Assign unique exchange IDs
            const exchangeIds: ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN'];
            const uniqueInputs = inputs.slice(0, exchangeIds.length).map((input, index) => ({
              ...input,
              exchangeId: exchangeIds[index],
            }));

            // Register exchanges
            for (const input of uniqueInputs) {
              await ExchangeService.registerExchange(tenantId, input);
            }

            // List exchanges
            const listed = await ExchangeService.listExchanges(tenantId);

            // Verify count
            expect(listed.length).toBe(uniqueInputs.length);

            // Verify all registered exchanges are in the list
            for (const input of uniqueInputs) {
              const found = listed.find((e) => e.exchangeId === input.exchangeId);
              expect(found).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
