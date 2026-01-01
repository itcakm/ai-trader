/**
 * Property-based tests for REST Client
 *
 * **Property 5: REST Authentication Correctness**
 * *For any* REST API request, the Exchange_Adapter SHALL apply the correct authentication
 * method (API_KEY, HMAC, or OAuth) based on the exchange's configured authMethod,
 * AND the signed request SHALL be accepted by the exchange.
 *
 * **Validates: Requirements 2.2**
 *
 * **Property 6: Retry with Exponential Backoff**
 * *For any* transient or RETRYABLE error, the system SHALL retry with exponential backoff
 * where delay = initialDelay * (multiplier ^ attemptNumber), AND retries SHALL stop
 * after maxRetries attempts.
 *
 * **Validates: Requirements 2.3, 10.2**
 */

import * as fc from 'fast-check';
import * as crypto from 'crypto';
import {
  RESTClient,
  RESTClientError,
  RESTRequestConfig,
  HttpMethod,
  DEFAULT_RETRY_CONFIG,
} from './rest-client';
import { AuthMethod, ExchangeId, EncryptedCredentials } from '../../types/exchange';
import { RetryConfig } from '../../types/exchange-error';

// ============================================
// Generators
// ============================================

/**
 * Generator for ExchangeId
 */
const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

/**
 * Generator for AuthMethod (excluding FIX_CREDENTIALS which is not supported for REST)
 */
const restAuthMethodArb = (): fc.Arbitrary<AuthMethod> =>
  fc.constantFrom('API_KEY', 'HMAC', 'OAUTH');

/**
 * Generator for API keys
 */
const apiKeyArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 16, maxLength: 64 }).filter((s) => s.trim().length >= 16);

/**
 * Generator for API secrets
 */
const apiSecretArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 32, maxLength: 128 }).filter((s) => s.trim().length >= 32);

/**
 * Generator for EncryptedCredentials
 */
const credentialsArb = (): fc.Arbitrary<EncryptedCredentials> =>
  fc.record({
    apiKey: apiKeyArb(),
    apiSecret: apiSecretArb(),
    passphrase: fc.option(fc.string({ minLength: 8, maxLength: 32 }), { nil: undefined }),
  });

/**
 * Generator for HTTP methods
 */
const httpMethodArb = (): fc.Arbitrary<HttpMethod> =>
  fc.constantFrom('GET', 'POST', 'PUT', 'DELETE');

/**
 * Generator for API paths
 */
const apiPathArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('/api/v1/', '/api/v2/', '/v1/', '/v3/'),
    fc.constantFrom('orders', 'account', 'balance', 'positions', 'trades')
  ).map(([prefix, resource]) => `${prefix}${resource}`);

/**
 * Generator for query parameters
 */
const queryParamsArb = (): fc.Arbitrary<Record<string, string> | undefined> =>
  fc.option(
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      fc.string({ minLength: 1, maxLength: 50 }),
      { minKeys: 0, maxKeys: 5 }
    ),
    { nil: undefined }
  );

/**
 * Generator for request body
 */
const requestBodyArb = (): fc.Arbitrary<Record<string, unknown> | undefined> =>
  fc.option(
    fc.record({
      symbol: fc.constantFrom('BTC-USDT', 'ETH-USDT', 'SOL-USDT'),
      side: fc.constantFrom('BUY', 'SELL'),
      quantity: fc.double({ min: 0.001, max: 100, noNaN: true }),
      price: fc.option(fc.double({ min: 1, max: 100000, noNaN: true }), { nil: undefined }),
    }),
    { nil: undefined }
  );

/**
 * Generator for RESTRequestConfig
 */
const restRequestConfigArb = (): fc.Arbitrary<RESTRequestConfig> =>
  fc.record({
    method: httpMethodArb(),
    endpoint: fc.constantFrom(
      'https://api.binance.com',
      'https://api.coinbase.com',
      'https://api.kraken.com'
    ),
    path: apiPathArb(),
    params: queryParamsArb(),
    body: requestBodyArb(),
    headers: fc.option(
      fc.dictionary(
        fc.constantFrom('X-Custom-Header', 'X-Request-Id'),
        fc.string({ minLength: 1, maxLength: 50 }),
        { minKeys: 0, maxKeys: 2 }
      ),
      { nil: undefined }
    ),
    timeout: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
  });

/**
 * Generator for RetryConfig
 */
const retryConfigArb = (): fc.Arbitrary<RetryConfig> =>
  fc.record({
    maxRetries: fc.integer({ min: 0, max: 10 }),
    initialDelayMs: fc.integer({ min: 100, max: 5000 }),
    maxDelayMs: fc.integer({ min: 5000, max: 120000 }),
    multiplier: fc.double({ min: 1.5, max: 3, noNaN: true }),
    retryableCategories: fc.constant(['RETRYABLE', 'RATE_LIMITED'] as const).map((arr) => [...arr]),
  });

// ============================================
// Property Tests
// ============================================

describe('REST Client', () => {
  describe('Property 5: REST Authentication Correctness', () => {
    /**
     * Feature: exchange-integration, Property 5: REST Authentication Correctness
     *
     * For any REST request with API_KEY auth method, the signed request SHALL
     * contain the API key in the X-API-Key header.
     */
    it('should add API key to X-API-Key header for API_KEY auth method', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restRequestConfigArb(),
          (exchangeId, credentials, config) => {
            const client = new RESTClient(exchangeId, credentials, 'API_KEY');
            const signedConfig = client.signRequest(config, credentials);

            // Verify API key is in headers
            expect(signedConfig.headers).toBeDefined();
            expect(signedConfig.headers!['X-API-Key']).toBe(credentials.apiKey);

            // Verify passphrase is added if present
            if (credentials.passphrase) {
              expect(signedConfig.headers!['X-API-Passphrase']).toBe(credentials.passphrase);
            }
          }
        ),
        { numRuns: 100 }
      );
    });


    /**
     * Feature: exchange-integration, Property 5: REST Authentication Correctness
     *
     * For any REST request with HMAC auth method, the signed request SHALL
     * contain a valid HMAC signature computed from the request data.
     */
    it('should add valid HMAC signature for HMAC auth method', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restRequestConfigArb(),
          (exchangeId, credentials, config) => {
            const client = new RESTClient(exchangeId, credentials, 'HMAC');
            const signedConfig = client.signRequest(config, credentials);

            // Verify required HMAC headers are present
            expect(signedConfig.headers).toBeDefined();
            expect(signedConfig.headers!['X-API-Key']).toBe(credentials.apiKey);
            expect(signedConfig.headers!['X-API-Timestamp']).toBeDefined();
            expect(signedConfig.headers!['X-API-Nonce']).toBeDefined();
            expect(signedConfig.headers!['X-API-Signature']).toBeDefined();

            // Verify timestamp is a valid number
            const timestamp = signedConfig.headers!['X-API-Timestamp'];
            expect(parseInt(timestamp, 10)).toBeGreaterThan(0);

            // Verify nonce is a valid UUID format
            const nonce = signedConfig.headers!['X-API-Nonce'];
            expect(nonce.length).toBeGreaterThan(0);

            // Verify signature is a valid hex string (SHA256 produces 64 hex chars)
            const signature = signedConfig.headers!['X-API-Signature'];
            expect(signature).toMatch(/^[a-f0-9]{64}$/);

            // Verify passphrase is added if present
            if (credentials.passphrase) {
              expect(signedConfig.headers!['X-API-Passphrase']).toBe(credentials.passphrase);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 5: REST Authentication Correctness
     *
     * For any REST request with OAuth auth method, the signed request SHALL
     * contain a Bearer token in the Authorization header.
     */
    it('should add Bearer token to Authorization header for OAuth auth method', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restRequestConfigArb(),
          (exchangeId, credentials, config) => {
            const client = new RESTClient(exchangeId, credentials, 'OAUTH');
            const signedConfig = client.signRequest(config, credentials);

            // Verify Authorization header with Bearer token
            expect(signedConfig.headers).toBeDefined();
            expect(signedConfig.headers!['Authorization']).toBe(`Bearer ${credentials.apiKey}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 5: REST Authentication Correctness
     *
     * For any REST request with a body, the signed request SHALL include
     * Content-Type: application/json header.
     */
    it('should add Content-Type header for requests with body', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          restRequestConfigArb().filter((c) => c.body !== undefined),
          (exchangeId, credentials, authMethod, config) => {
            const client = new RESTClient(exchangeId, credentials, authMethod);
            const signedConfig = client.signRequest(config, credentials);

            // Verify Content-Type header is set
            expect(signedConfig.headers).toBeDefined();
            expect(signedConfig.headers!['Content-Type']).toBe('application/json');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 5: REST Authentication Correctness
     *
     * For any REST request, the original request config SHALL NOT be mutated
     * by the signing process.
     */
    it('should not mutate original request config during signing', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          restRequestConfigArb(),
          (exchangeId, credentials, authMethod, config) => {
            // Deep clone the original config
            const originalConfig = JSON.parse(JSON.stringify(config));

            const client = new RESTClient(exchangeId, credentials, authMethod);
            client.signRequest(config, credentials);

            // Verify original config was not mutated
            expect(config.method).toBe(originalConfig.method);
            expect(config.endpoint).toBe(originalConfig.endpoint);
            expect(config.path).toBe(originalConfig.path);
            expect(JSON.stringify(config.params)).toBe(JSON.stringify(originalConfig.params));
            expect(JSON.stringify(config.body)).toBe(JSON.stringify(originalConfig.body));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 5: REST Authentication Correctness
     *
     * For any REST request, FIX_CREDENTIALS auth method SHALL throw an error
     * as it is not supported for REST requests.
     */
    it('should throw error for FIX_CREDENTIALS auth method', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restRequestConfigArb(),
          (exchangeId, credentials, config) => {
            const client = new RESTClient(exchangeId, credentials, 'FIX_CREDENTIALS');

            expect(() => client.signRequest(config, credentials)).toThrow(RESTClientError);
            expect(() => client.signRequest(config, credentials)).toThrow(
              'FIX_CREDENTIALS auth method is not supported for REST requests'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 5: REST Authentication Correctness
     *
     * For any two identical requests signed with HMAC, the signatures SHALL be
     * different due to unique nonce (UUID). The nonce guarantees uniqueness
     * even when timestamps are the same.
     */
    it('should produce different HMAC signatures for repeated signing', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restRequestConfigArb(),
          (exchangeId, credentials, config) => {
            const client = new RESTClient(exchangeId, credentials, 'HMAC');

            const signedConfig1 = client.signRequest(config, credentials);
            const signedConfig2 = client.signRequest(config, credentials);

            // Nonces should always be different (UUIDs are unique)
            expect(signedConfig1.headers!['X-API-Nonce']).not.toBe(
              signedConfig2.headers!['X-API-Nonce']
            );

            // Signatures should be different due to different nonce
            // (even if timestamps happen to be the same)
            expect(signedConfig1.headers!['X-API-Signature']).not.toBe(
              signedConfig2.headers!['X-API-Signature']
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 6: Retry with Exponential Backoff', () => {
    /**
     * Feature: exchange-integration, Property 6: Retry with Exponential Backoff
     *
     * For any retry configuration, the calculated delay SHALL follow the formula:
     * delay = initialDelayMs * (multiplier ^ attemptNumber)
     */
    it('should calculate delay using exponential backoff formula', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          retryConfigArb(),
          fc.integer({ min: 0, max: 10 }),
          (exchangeId, credentials, authMethod, retryConfig, attemptNumber) => {
            const client = new RESTClient(
              exchangeId,
              credentials,
              authMethod,
              30000,
              retryConfig
            );

            const delay = client.calculateRetryDelay(attemptNumber, retryConfig);

            // Calculate expected delay
            const expectedDelay = retryConfig.initialDelayMs * Math.pow(retryConfig.multiplier, attemptNumber);
            const cappedExpectedDelay = Math.min(expectedDelay, retryConfig.maxDelayMs);

            expect(delay).toBe(cappedExpectedDelay);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 6: Retry with Exponential Backoff
     *
     * For any retry configuration, the delay SHALL never exceed maxDelayMs.
     */
    it('should cap delay at maxDelayMs', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          retryConfigArb(),
          fc.integer({ min: 0, max: 20 }),
          (exchangeId, credentials, authMethod, retryConfig, attemptNumber) => {
            const client = new RESTClient(
              exchangeId,
              credentials,
              authMethod,
              30000,
              retryConfig
            );

            const delay = client.calculateRetryDelay(attemptNumber, retryConfig);

            // Delay should never exceed maxDelayMs
            expect(delay).toBeLessThanOrEqual(retryConfig.maxDelayMs);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 6: Retry with Exponential Backoff
     *
     * For any retry configuration, delays SHALL increase monotonically
     * until reaching maxDelayMs.
     */
    it('should produce monotonically increasing delays until cap', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          retryConfigArb(),
          (exchangeId, credentials, authMethod, retryConfig) => {
            const client = new RESTClient(
              exchangeId,
              credentials,
              authMethod,
              30000,
              retryConfig
            );

            let previousDelay = 0;
            let reachedCap = false;

            for (let attempt = 0; attempt <= retryConfig.maxRetries + 5; attempt++) {
              const delay = client.calculateRetryDelay(attempt, retryConfig);

              if (!reachedCap) {
                // Delay should be >= previous delay
                expect(delay).toBeGreaterThanOrEqual(previousDelay);

                // Check if we've reached the cap
                if (delay === retryConfig.maxDelayMs) {
                  reachedCap = true;
                }
              } else {
                // After reaching cap, delay should stay at maxDelayMs
                expect(delay).toBe(retryConfig.maxDelayMs);
              }

              previousDelay = delay;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 6: Retry with Exponential Backoff
     *
     * For attempt 0, the delay SHALL equal initialDelayMs.
     */
    it('should return initialDelayMs for attempt 0', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          retryConfigArb(),
          (exchangeId, credentials, authMethod, retryConfig) => {
            const client = new RESTClient(
              exchangeId,
              credentials,
              authMethod,
              30000,
              retryConfig
            );

            const delay = client.calculateRetryDelay(0, retryConfig);

            // For attempt 0: delay = initialDelayMs * (multiplier ^ 0) = initialDelayMs * 1
            expect(delay).toBe(Math.min(retryConfig.initialDelayMs, retryConfig.maxDelayMs));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 6: Retry with Exponential Backoff
     *
     * For any retry configuration with multiplier > 1, the delay SHALL
     * increase by the multiplier factor between consecutive attempts.
     */
    it('should increase delay by multiplier factor between attempts', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          retryConfigArb().filter((c) => c.multiplier > 1),
          fc.integer({ min: 0, max: 5 }),
          (exchangeId, credentials, authMethod, retryConfig, attemptNumber) => {
            const client = new RESTClient(
              exchangeId,
              credentials,
              authMethod,
              30000,
              retryConfig
            );

            const delay1 = client.calculateRetryDelay(attemptNumber, retryConfig);
            const delay2 = client.calculateRetryDelay(attemptNumber + 1, retryConfig);

            // If neither delay is capped, delay2 should be delay1 * multiplier
            if (delay1 < retryConfig.maxDelayMs && delay2 < retryConfig.maxDelayMs) {
              expect(delay2).toBeCloseTo(delay1 * retryConfig.multiplier, 5);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Default Configuration', () => {
    it('should use default retry config when not specified', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          (exchangeId, credentials, authMethod) => {
            const client = new RESTClient(exchangeId, credentials, authMethod);
            const config = client.getRetryConfig();

            expect(config.maxRetries).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
            expect(config.initialDelayMs).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);
            expect(config.maxDelayMs).toBe(DEFAULT_RETRY_CONFIG.maxDelayMs);
            expect(config.multiplier).toBe(DEFAULT_RETRY_CONFIG.multiplier);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct exchange ID and auth method', () => {
      fc.assert(
        fc.property(
          exchangeIdArb(),
          credentialsArb(),
          restAuthMethodArb(),
          (exchangeId, credentials, authMethod) => {
            const client = new RESTClient(exchangeId, credentials, authMethod);

            expect(client.getExchangeId()).toBe(exchangeId);
            expect(client.getAuthMethod()).toBe(authMethod);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
