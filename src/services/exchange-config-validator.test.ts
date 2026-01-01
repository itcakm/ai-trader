/**
 * Property-based tests for Exchange Configuration Validator
 *
 * **Property 2: Exchange Registration Completeness**
 * *For any* Exchange_Config after registration, it SHALL contain valid exchangeId,
 * tenantId, mode, restEndpoint, authMethod, credentials, supportedFeatures, and
 * rateLimits, AND all required fields SHALL be retrievable.
 *
 * **Validates: Requirements 1.2, 1.5**
 */

import * as fc from 'fast-check';
import {
  validateExchangeConfig,
  validateCredentials,
  validateFeatures,
  validateRateLimits,
  ValidationResult,
  formatErrors,
} from './exchange-config-validator';
import {
  ExchangeId,
  ExchangeMode,
  AuthMethod,
  ExchangeConfigInput,
  EncryptedCredentials,
  ExchangeFeatures,
  ExchangeRateLimits,
} from '../types/exchange';
import { OrderType, TimeInForce } from '../types/exchange-order';

// ============================================
// Generators for Valid Configurations
// ============================================

/**
 * Generator for valid ExchangeId
 */
const validExchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for valid ExchangeMode
 */
const validModeArb = (): fc.Arbitrary<ExchangeMode> =>
  fc.constantFrom('PRODUCTION', 'SANDBOX');

/**
 * Generator for valid AuthMethod
 */
const validAuthMethodArb = (): fc.Arbitrary<AuthMethod> =>
  fc.constantFrom('API_KEY', 'HMAC', 'OAUTH', 'FIX_CREDENTIALS');

/**
 * Generator for valid non-FIX AuthMethod
 */
const validNonFixAuthMethodArb = (): fc.Arbitrary<AuthMethod> =>
  fc.constantFrom('API_KEY', 'HMAC', 'OAUTH');

/**
 * Generator for valid API key (at least 8 characters)
 */
const validApiKeyArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 8, maxLength: 64 }).filter((s) => s.trim().length >= 8);

/**
 * Generator for valid HTTPS URL
 */
const validHttpsUrlArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'https://api.binance.com',
    'https://api.coinbase.com',
    'https://api.kraken.com',
    'https://api.okx.com',
    'https://api.bsdex.de',
    'https://api.bisonapp.com',
    'https://api.finoa.io',
    'https://api.bybit.com'
  );

/**
 * Generator for valid WSS URL
 */
const validWssUrlArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'wss://stream.binance.com',
    'wss://ws-feed.exchange.coinbase.com',
    'wss://ws.kraken.com',
    'wss://ws.okx.com'
  );

/**
 * Generator for valid FIX endpoint (host:port)
 */
const validFixEndpointArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('fix.exchange.com', 'fix.broker.net', 'fix-gateway.trading.io'),
    fc.integer({ min: 1024, max: 65535 })
  ).map(([host, port]) => `${host}:${port}`);

/**
 * Generator for valid OrderType array
 */
const validOrderTypesArb = (): fc.Arbitrary<OrderType[]> =>
  fc.array(
    fc.constantFrom('MARKET', 'LIMIT', 'STOP_LIMIT', 'STOP_MARKET', 'TRAILING_STOP'),
    { minLength: 1, maxLength: 5 }
  ).map((arr) => [...new Set(arr)] as OrderType[]);

/**
 * Generator for valid TimeInForce array
 */
const validTimeInForceArb = (): fc.Arbitrary<TimeInForce[]> =>
  fc.array(fc.constantFrom('GTC', 'IOC', 'FOK', 'GTD'), { minLength: 1, maxLength: 4 }).map(
    (arr) => [...new Set(arr)] as TimeInForce[]
  );

/**
 * Generator for valid asset symbols
 */
const validAssetsArb = (): fc.Arbitrary<string[]> =>
  fc.array(fc.constantFrom('BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'ADA-USDT', 'XRP-USDT'), {
    minLength: 1,
    maxLength: 10,
  }).map((arr) => [...new Set(arr)]);

/**
 * Generator for valid EncryptedCredentials (non-FIX)
 */
const validCredentialsArb = (): fc.Arbitrary<EncryptedCredentials> =>
  fc.record({
    apiKey: validApiKeyArb(),
    apiSecret: validApiKeyArb(),
    passphrase: fc.option(fc.string({ minLength: 5, maxLength: 32 }), { nil: undefined }),
    fixSenderCompId: fc.constant(undefined),
    fixTargetCompId: fc.constant(undefined),
  });

/**
 * Generator for valid EncryptedCredentials (FIX)
 */
const validFixCredentialsArb = (): fc.Arbitrary<EncryptedCredentials> =>
  fc.record({
    apiKey: validApiKeyArb(),
    apiSecret: validApiKeyArb(),
    passphrase: fc.option(fc.string({ minLength: 5, maxLength: 32 }), { nil: undefined }),
    fixSenderCompId: fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length > 0),
    fixTargetCompId: fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length > 0),
  });


/**
 * Generator for valid ExchangeFeatures
 */
const validFeaturesArb = (): fc.Arbitrary<ExchangeFeatures> =>
  fc.record({
    supportedOrderTypes: validOrderTypesArb(),
    supportedAssets: validAssetsArb(),
    supportedTimeInForce: validTimeInForceArb(),
    supportsOrderModification: fc.boolean(),
    supportsWebSocket: fc.boolean(),
    supportsFIX: fc.boolean(),
    maxOrderSize: fc.double({ min: 100, max: 1000000, noNaN: true }),
    minOrderSize: fc.double({ min: 0.0001, max: 1, noNaN: true }),
    tickSize: fc.double({ min: 0.00001, max: 1, noNaN: true }),
    lotSize: fc.double({ min: 0.00001, max: 1, noNaN: true }),
  });

/**
 * Generator for valid ExchangeRateLimits
 * Ensures per-second limits are consistent with per-minute limits
 */
const validRateLimitsArb = (): fc.Arbitrary<ExchangeRateLimits> =>
  fc.tuple(
    fc.integer({ min: 60, max: 6000 }), // ordersPerMinute
    fc.integer({ min: 60, max: 6000 }), // queriesPerMinute
    fc.integer({ min: 1, max: 100 }), // wsMessagesPerSecond
    fc.option(fc.integer({ min: 100, max: 10000 }), { nil: undefined }) // weightPerMinute
  ).map(([ordersPerMinute, queriesPerMinute, wsMessagesPerSecond, weightPerMinute]) => ({
    // Ensure per-second is at most per-minute / 30 to avoid inconsistency warning
    ordersPerSecond: Math.max(1, Math.floor(ordersPerMinute / 60)),
    ordersPerMinute,
    queriesPerSecond: Math.max(1, Math.floor(queriesPerMinute / 60)),
    queriesPerMinute,
    wsMessagesPerSecond,
    weightPerMinute,
  }));

/**
 * Generator for valid ExchangeConfigInput (non-FIX auth)
 */
const validConfigInputArb = (): fc.Arbitrary<ExchangeConfigInput> =>
  fc.record({
    exchangeId: validExchangeIdArb(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    mode: validModeArb(),
    restEndpoint: validHttpsUrlArb(),
    wsEndpoint: fc.option(validWssUrlArb(), { nil: undefined }),
    fixEndpoint: fc.option(validFixEndpointArb(), { nil: undefined }),
    authMethod: validNonFixAuthMethodArb(),
    credentials: validCredentialsArb(),
    supportedFeatures: validFeaturesArb(),
    rateLimits: validRateLimitsArb(),
    priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  });

/**
 * Generator for valid ExchangeConfigInput with FIX auth
 */
const validFixConfigInputArb = (): fc.Arbitrary<ExchangeConfigInput> =>
  fc.record({
    exchangeId: validExchangeIdArb(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    mode: validModeArb(),
    restEndpoint: validHttpsUrlArb(),
    wsEndpoint: fc.option(validWssUrlArb(), { nil: undefined }),
    fixEndpoint: fc.option(validFixEndpointArb(), { nil: undefined }),
    authMethod: fc.constant('FIX_CREDENTIALS' as AuthMethod),
    credentials: validFixCredentialsArb(),
    supportedFeatures: validFeaturesArb(),
    rateLimits: validRateLimitsArb(),
    priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  });

// ============================================
// Generators for Invalid Configurations
// ============================================

/**
 * Generator for invalid exchange ID
 */
const invalidExchangeIdArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('INVALID', 'UNKNOWN', 'TEST', '', 'binance', 'Binance');

/**
 * Generator for invalid URL
 */
const invalidUrlArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'http://insecure.com', // Not HTTPS
    'ftp://wrong-protocol.com',
    'not-a-url',
    '',
    'api.binance.com' // Missing protocol
  );

/**
 * Generator for invalid credentials (too short)
 */
const invalidCredentialsArb = (): fc.Arbitrary<EncryptedCredentials> =>
  fc.record({
    apiKey: fc.constantFrom('', 'short', '       '), // Empty or too short
    apiSecret: fc.constantFrom('', 'short', '       '),
    passphrase: fc.constant(undefined),
    fixSenderCompId: fc.constant(undefined),
    fixTargetCompId: fc.constant(undefined),
  });

// ============================================
// Property Tests
// ============================================

describe('Exchange Configuration Validator', () => {
  describe('Property 2: Exchange Registration Completeness', () => {
    /**
     * Feature: exchange-integration, Property 2: Exchange Registration Completeness
     *
     * For any valid exchange configuration, validation SHALL pass and all
     * required fields SHALL be present.
     */
    it('should validate any complete and valid configuration', () => {
      fc.assert(
        fc.property(validConfigInputArb(), (config) => {
          const result = validateExchangeConfig(config);

          // Valid config should pass validation
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);

          // All required fields should be present
          expect(config.exchangeId).toBeDefined();
          expect(config.name).toBeDefined();
          expect(config.mode).toBeDefined();
          expect(config.restEndpoint).toBeDefined();
          expect(config.authMethod).toBeDefined();
          expect(config.credentials).toBeDefined();
          expect(config.supportedFeatures).toBeDefined();
          expect(config.rateLimits).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 2: Exchange Registration Completeness
     *
     * For any valid FIX configuration, validation SHALL pass and FIX-specific
     * credentials SHALL be present.
     */
    it('should validate any complete FIX configuration', () => {
      fc.assert(
        fc.property(validFixConfigInputArb(), (config) => {
          const result = validateExchangeConfig(config);

          // Valid FIX config should pass validation
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);

          // FIX-specific fields should be present
          expect(config.authMethod).toBe('FIX_CREDENTIALS');
          expect(config.credentials.fixSenderCompId).toBeDefined();
          expect(config.credentials.fixTargetCompId).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });


    /**
     * Feature: exchange-integration, Property 2: Exchange Registration Completeness
     *
     * For any configuration missing required fields, validation SHALL fail
     * with appropriate error messages.
     */
    it('should reject configurations with missing exchangeId', () => {
      fc.assert(
        fc.property(validConfigInputArb(), (config) => {
          const invalidConfig = { ...config, exchangeId: undefined as unknown as ExchangeId };
          const result = validateExchangeConfig(invalidConfig);

          expect(result.valid).toBe(false);
          expect(result.errors.some((e) => e.field === 'exchangeId')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject configurations with invalid exchangeId', () => {
      fc.assert(
        fc.property(validConfigInputArb(), invalidExchangeIdArb(), (config, invalidId) => {
          const invalidConfig = { ...config, exchangeId: invalidId as ExchangeId };
          const result = validateExchangeConfig(invalidConfig);

          expect(result.valid).toBe(false);
          expect(result.errors.some((e) => e.field === 'exchangeId')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject configurations with missing name', () => {
      fc.assert(
        fc.property(validConfigInputArb(), (config) => {
          const invalidConfig = { ...config, name: '' };
          const result = validateExchangeConfig(invalidConfig);

          expect(result.valid).toBe(false);
          expect(result.errors.some((e) => e.field === 'name')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject configurations with invalid REST endpoint', () => {
      fc.assert(
        fc.property(validConfigInputArb(), invalidUrlArb(), (config, invalidUrl) => {
          const invalidConfig = { ...config, restEndpoint: invalidUrl };
          const result = validateExchangeConfig(invalidConfig);

          expect(result.valid).toBe(false);
          expect(result.errors.some((e) => e.field === 'restEndpoint')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject configurations with missing credentials', () => {
      fc.assert(
        fc.property(validConfigInputArb(), (config) => {
          const invalidConfig = {
            ...config,
            credentials: undefined as unknown as EncryptedCredentials,
          };
          const result = validateExchangeConfig(invalidConfig);

          expect(result.valid).toBe(false);
          expect(result.errors.some((e) => e.field === 'credentials')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject configurations with invalid credentials', () => {
      fc.assert(
        fc.property(validConfigInputArb(), invalidCredentialsArb(), (config, invalidCreds) => {
          const invalidConfig = { ...config, credentials: invalidCreds };
          const result = validateExchangeConfig(invalidConfig);

          expect(result.valid).toBe(false);
          expect(
            result.errors.some(
              (e) =>
                e.field === 'credentials.apiKey' || e.field === 'credentials.apiSecret'
            )
          ).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject FIX configurations without FIX credentials', () => {
      fc.assert(
        fc.property(validConfigInputArb(), (config) => {
          // Use FIX auth but without FIX-specific credentials
          const invalidConfig = {
            ...config,
            authMethod: 'FIX_CREDENTIALS' as AuthMethod,
            credentials: {
              ...config.credentials,
              fixSenderCompId: undefined,
              fixTargetCompId: undefined,
            },
          };
          const result = validateExchangeConfig(invalidConfig);

          expect(result.valid).toBe(false);
          expect(
            result.errors.some(
              (e) =>
                e.field === 'credentials.fixSenderCompId' ||
                e.field === 'credentials.fixTargetCompId'
            )
          ).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Credentials Validation', () => {
    it('should validate any valid credentials', () => {
      fc.assert(
        fc.property(validCredentialsArb(), validNonFixAuthMethodArb(), (creds, authMethod) => {
          const errors = validateCredentials(creds, authMethod);
          expect(errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should validate any valid FIX credentials', () => {
      fc.assert(
        fc.property(validFixCredentialsArb(), (creds) => {
          const errors = validateCredentials(creds, 'FIX_CREDENTIALS');
          expect(errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Features Validation', () => {
    it('should validate any valid features configuration', () => {
      fc.assert(
        fc.property(validFeaturesArb(), (features) => {
          const errors = validateFeatures(features);
          expect(errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject features with empty order types', () => {
      fc.assert(
        fc.property(validFeaturesArb(), (features) => {
          const invalidFeatures = { ...features, supportedOrderTypes: [] };
          const errors = validateFeatures(invalidFeatures);
          expect(errors.some((e) => e.field === 'supportedFeatures.supportedOrderTypes')).toBe(
            true
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should reject features with invalid min/max order size', () => {
      fc.assert(
        fc.property(validFeaturesArb(), (features) => {
          // Make min > max
          const invalidFeatures = {
            ...features,
            minOrderSize: 1000,
            maxOrderSize: 1,
          };
          const errors = validateFeatures(invalidFeatures);
          expect(errors.some((e) => e.field === 'supportedFeatures.minOrderSize')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Rate Limits Validation', () => {
    it('should validate any valid rate limits configuration', () => {
      fc.assert(
        fc.property(validRateLimitsArb(), (rateLimits) => {
          const errors = validateRateLimits(rateLimits);
          expect(errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject negative rate limits', () => {
      fc.assert(
        fc.property(validRateLimitsArb(), (rateLimits) => {
          const invalidLimits = { ...rateLimits, ordersPerSecond: -1 };
          const errors = validateRateLimits(invalidLimits);
          expect(errors.some((e) => e.field === 'rateLimits.ordersPerSecond')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Error Formatting', () => {
    it('should format errors correctly', () => {
      fc.assert(
        fc.property(validConfigInputArb(), (config) => {
          const invalidConfig = { ...config, exchangeId: 'INVALID' as ExchangeId };
          const result = validateExchangeConfig(invalidConfig);

          const formatted = formatErrors(result);
          expect(formatted.length).toBeGreaterThan(0);
          expect(formatted).toContain('exchangeId');
        }),
        { numRuns: 100 }
      );
    });

    it('should return empty string for valid configs', () => {
      fc.assert(
        fc.property(validConfigInputArb(), (config) => {
          const result = validateExchangeConfig(config);
          const formatted = formatErrors(result);
          expect(formatted).toBe('');
        }),
        { numRuns: 100 }
      );
    });
  });
});
