/**
 * Property-based tests for Exchange Endpoint Service
 *
 * **Property 4: Sandbox Mode Isolation**
 * *For any* Exchange_Config with mode SANDBOX, all API calls SHALL be directed to
 * the exchange's testnet/sandbox endpoints, AND no calls SHALL be made to production endpoints.
 *
 * **Validates: Requirements 1.6**
 */

import * as fc from 'fast-check';
import { ExchangeId, ExchangeMode } from '../types/exchange';
import {
  ExchangeEndpointService,
  PRODUCTION_ENDPOINTS,
  SANDBOX_ENDPOINTS,
} from './exchange-endpoint';

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

// ============================================
// Property Tests
// ============================================

describe('Exchange Endpoint Service', () => {
  describe('Property 4: Sandbox Mode Isolation', () => {
    /**
     * Feature: exchange-integration, Property 4: Sandbox Mode Isolation
     *
     * For any exchange with SANDBOX mode, getEndpoints SHALL return sandbox endpoints.
     * Note: OKX uses the same base URL for both modes (uses simulated trading flag).
     *
     * **Validates: Requirements 1.6**
     */
    it('should return sandbox endpoints for SANDBOX mode', () => {
      fc.assert(
        fc.property(exchangeIdArb(), (exchangeId) => {
          const endpoints = ExchangeEndpointService.getEndpoints(exchangeId, 'SANDBOX');

          // Should match the sandbox endpoints
          expect(endpoints).toEqual(SANDBOX_ENDPOINTS[exchangeId]);

          // REST endpoint should be a sandbox endpoint (except OKX which uses same base URL)
          if (exchangeId !== 'OKX') {
            expect(ExchangeEndpointService.isSandboxEndpoint(endpoints.rest)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 4: Sandbox Mode Isolation
     *
     * For any exchange with PRODUCTION mode, getEndpoints SHALL return production endpoints.
     *
     * **Validates: Requirements 1.6**
     */
    it('should return production endpoints for PRODUCTION mode', () => {
      fc.assert(
        fc.property(exchangeIdArb(), (exchangeId) => {
          const endpoints = ExchangeEndpointService.getEndpoints(exchangeId, 'PRODUCTION');

          // Should match the production endpoints
          expect(endpoints).toEqual(PRODUCTION_ENDPOINTS[exchangeId]);

          // REST endpoint should be a production endpoint
          expect(ExchangeEndpointService.isProductionEndpoint(endpoints.rest)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 4: Sandbox Mode Isolation
     *
     * For any exchange and mode, validateEndpointMode SHALL correctly identify
     * whether an endpoint matches the expected mode.
     * Note: OKX uses the same base URL for both modes, so this test excludes OKX.
     *
     * **Validates: Requirements 1.6**
     */
    it('should validate endpoint mode correctly', () => {
      // Exclude OKX as it uses the same base URL for both modes
      const exchangeIdWithoutOkx = (): fc.Arbitrary<ExchangeId> =>
        fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

      fc.assert(
        fc.property(exchangeIdWithoutOkx(), exchangeModeArb(), (exchangeId, mode) => {
          const endpoints = ExchangeEndpointService.getEndpoints(exchangeId, mode);

          // The endpoint should validate as matching the mode
          expect(
            ExchangeEndpointService.validateEndpointMode(endpoints.rest, mode)
          ).toBe(true);

          // The endpoint should NOT validate as matching the opposite mode
          const oppositeMode = mode === 'SANDBOX' ? 'PRODUCTION' : 'SANDBOX';
          expect(
            ExchangeEndpointService.validateEndpointMode(endpoints.rest, oppositeMode)
          ).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 4: Sandbox Mode Isolation
     *
     * Sandbox and production endpoints SHALL be different for each exchange.
     *
     * **Validates: Requirements 1.6**
     */
    it('should have different endpoints for sandbox and production', () => {
      fc.assert(
        fc.property(exchangeIdArb(), (exchangeId) => {
          const sandboxEndpoints = ExchangeEndpointService.getEndpoints(exchangeId, 'SANDBOX');
          const productionEndpoints = ExchangeEndpointService.getEndpoints(exchangeId, 'PRODUCTION');

          // REST endpoints should be different (except OKX which uses same base URL)
          if (exchangeId !== 'OKX') {
            expect(sandboxEndpoints.rest).not.toBe(productionEndpoints.rest);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Endpoint Retrieval', () => {
    /**
     * For any exchange and mode, getRestEndpoint SHALL return a valid HTTPS URL.
     */
    it('should return valid REST endpoints', () => {
      fc.assert(
        fc.property(exchangeIdArb(), exchangeModeArb(), (exchangeId, mode) => {
          const endpoint = ExchangeEndpointService.getRestEndpoint(exchangeId, mode);

          // Should be a valid HTTPS URL
          expect(endpoint.startsWith('https://')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * For any exchange and mode, getWsEndpoint SHALL return a valid WSS URL or undefined.
     */
    it('should return valid WebSocket endpoints or undefined', () => {
      fc.assert(
        fc.property(exchangeIdArb(), exchangeModeArb(), (exchangeId, mode) => {
          const endpoint = ExchangeEndpointService.getWsEndpoint(exchangeId, mode);

          if (endpoint !== undefined) {
            // Should be a valid WSS URL
            expect(endpoint.startsWith('wss://')).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * supportsWebSocket SHALL return true if and only if getWsEndpoint returns a value.
     */
    it('should correctly report WebSocket support', () => {
      fc.assert(
        fc.property(exchangeIdArb(), exchangeModeArb(), (exchangeId, mode) => {
          const wsEndpoint = ExchangeEndpointService.getWsEndpoint(exchangeId, mode);
          const supportsWs = ExchangeEndpointService.supportsWebSocket(exchangeId, mode);

          expect(supportsWs).toBe(wsEndpoint !== undefined);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * supportsFix SHALL return true if and only if getFixEndpoint returns a value.
     */
    it('should correctly report FIX support', () => {
      fc.assert(
        fc.property(exchangeIdArb(), exchangeModeArb(), (exchangeId, mode) => {
          const fixEndpoint = ExchangeEndpointService.getFixEndpoint(exchangeId, mode);
          const supportsFix = ExchangeEndpointService.supportsFix(exchangeId, mode);

          expect(supportsFix).toBe(fixEndpoint !== undefined);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Supported Exchanges', () => {
    /**
     * getSupportedExchanges SHALL return all exchange IDs.
     */
    it('should return all supported exchanges', () => {
      const supported = ExchangeEndpointService.getSupportedExchanges();

      expect(supported).toContain('BINANCE');
      expect(supported).toContain('COINBASE');
      expect(supported).toContain('KRAKEN');
      expect(supported).toContain('OKX');
      expect(supported).toContain('BSDEX');
      expect(supported).toContain('BISON');
      expect(supported).toContain('FINOA');
      expect(supported).toContain('BYBIT');
      expect(supported.length).toBe(8);
    });
  });
});
