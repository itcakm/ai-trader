/**
 * Exchange Endpoint Service
 *
 * Manages endpoint switching logic based on ExchangeMode.
 * Ensures sandbox configs use testnet endpoints and production configs
 * use production endpoints.
 *
 * Requirements: 1.6
 */

import { ExchangeId, ExchangeMode } from '../types/exchange';

/**
 * Exchange endpoint configuration
 */
export interface ExchangeEndpoints {
  rest: string;
  ws?: string;
  fix?: string;
}

/**
 * Production endpoints for each exchange
 */
export const PRODUCTION_ENDPOINTS: Record<ExchangeId, ExchangeEndpoints> = {
  BINANCE: {
    rest: 'https://api.binance.com',
    ws: 'wss://stream.binance.com:9443',
  },
  COINBASE: {
    rest: 'https://api.exchange.coinbase.com',
    ws: 'wss://ws-feed.exchange.coinbase.com',
    fix: 'fix.exchange.coinbase.com:4198',
  },
  KRAKEN: {
    rest: 'https://api.kraken.com',
    ws: 'wss://ws.kraken.com',
  },
  OKX: {
    rest: 'https://www.okx.com',
    ws: 'wss://ws.okx.com:8443',
  },
  BSDEX: {
    rest: 'https://api.bsdex.de',
    ws: 'wss://ws.bsdex.de',
  },
  BISON: {
    rest: 'https://api.bisonapp.com',
    ws: 'wss://ws.bisonapp.com',
  },
  FINOA: {
    rest: 'https://api.finoa.io',
    ws: 'wss://ws.finoa.io',
  },
  BYBIT: {
    rest: 'https://api.bybit.com',
    ws: 'wss://stream.bybit.com',
  },
};

/**
 * Sandbox/Testnet endpoints for each exchange
 */
export const SANDBOX_ENDPOINTS: Record<ExchangeId, ExchangeEndpoints> = {
  BINANCE: {
    rest: 'https://testnet.binance.vision',
    ws: 'wss://testnet.binance.vision',
  },
  COINBASE: {
    rest: 'https://api-public.sandbox.exchange.coinbase.com',
    ws: 'wss://ws-feed-public.sandbox.exchange.coinbase.com',
    fix: 'fix-public.sandbox.exchange.coinbase.com:4198',
  },
  KRAKEN: {
    rest: 'https://demo-futures.kraken.com',
    ws: 'wss://demo-futures.kraken.com/ws/v1',
  },
  OKX: {
    rest: 'https://www.okx.com', // OKX uses same endpoint with simulated trading flag
    ws: 'wss://wspap.okx.com:8443',
  },
  BSDEX: {
    rest: 'https://sandbox.api.bsdex.de',
    ws: 'wss://sandbox.ws.bsdex.de',
  },
  BISON: {
    rest: 'https://sandbox.api.bisonapp.com',
    ws: 'wss://sandbox.ws.bisonapp.com',
  },
  FINOA: {
    rest: 'https://sandbox.api.finoa.io',
    ws: 'wss://sandbox.ws.finoa.io',
  },
  BYBIT: {
    rest: 'https://api-testnet.bybit.com',
    ws: 'wss://stream-testnet.bybit.com',
  },
};

/**
 * Exchange Endpoint Service
 */
export const ExchangeEndpointService = {
  /**
   * Get the appropriate endpoints for an exchange based on mode
   *
   * @param exchangeId - The exchange identifier
   * @param mode - The exchange mode (PRODUCTION or SANDBOX)
   * @returns The endpoints for the exchange
   *
   * Requirements: 1.6
   */
  getEndpoints(exchangeId: ExchangeId, mode: ExchangeMode): ExchangeEndpoints {
    return mode === 'SANDBOX'
      ? SANDBOX_ENDPOINTS[exchangeId]
      : PRODUCTION_ENDPOINTS[exchangeId];
  },

  /**
   * Get the REST endpoint for an exchange based on mode
   *
   * @param exchangeId - The exchange identifier
   * @param mode - The exchange mode
   * @returns The REST endpoint URL
   */
  getRestEndpoint(exchangeId: ExchangeId, mode: ExchangeMode): string {
    return this.getEndpoints(exchangeId, mode).rest;
  },

  /**
   * Get the WebSocket endpoint for an exchange based on mode
   *
   * @param exchangeId - The exchange identifier
   * @param mode - The exchange mode
   * @returns The WebSocket endpoint URL, or undefined if not supported
   */
  getWsEndpoint(exchangeId: ExchangeId, mode: ExchangeMode): string | undefined {
    return this.getEndpoints(exchangeId, mode).ws;
  },

  /**
   * Get the FIX endpoint for an exchange based on mode
   *
   * @param exchangeId - The exchange identifier
   * @param mode - The exchange mode
   * @returns The FIX endpoint, or undefined if not supported
   */
  getFixEndpoint(exchangeId: ExchangeId, mode: ExchangeMode): string | undefined {
    return this.getEndpoints(exchangeId, mode).fix;
  },

  /**
   * Check if an endpoint is a sandbox/testnet endpoint
   *
   * @param endpoint - The endpoint URL to check
   * @returns True if the endpoint is a sandbox endpoint
   */
  isSandboxEndpoint(endpoint: string): boolean {
    const lowerEndpoint = endpoint.toLowerCase();
    return (
      lowerEndpoint.includes('testnet') ||
      lowerEndpoint.includes('sandbox') ||
      lowerEndpoint.includes('demo') ||
      lowerEndpoint.includes('simulated') ||
      lowerEndpoint.includes('api-testnet')
    );
  },

  /**
   * Check if an endpoint is a production endpoint
   *
   * @param endpoint - The endpoint URL to check
   * @returns True if the endpoint is a production endpoint
   */
  isProductionEndpoint(endpoint: string): boolean {
    return !this.isSandboxEndpoint(endpoint);
  },

  /**
   * Validate that an endpoint matches the expected mode
   *
   * @param endpoint - The endpoint URL to validate
   * @param mode - The expected mode
   * @returns True if the endpoint matches the mode
   */
  validateEndpointMode(endpoint: string, mode: ExchangeMode): boolean {
    if (mode === 'SANDBOX') {
      return this.isSandboxEndpoint(endpoint);
    }
    return this.isProductionEndpoint(endpoint);
  },

  /**
   * Get all supported exchanges
   *
   * @returns Array of all supported exchange IDs
   */
  getSupportedExchanges(): ExchangeId[] {
    return Object.keys(PRODUCTION_ENDPOINTS) as ExchangeId[];
  },

  /**
   * Check if an exchange supports WebSocket
   *
   * @param exchangeId - The exchange identifier
   * @param mode - The exchange mode
   * @returns True if WebSocket is supported
   */
  supportsWebSocket(exchangeId: ExchangeId, mode: ExchangeMode): boolean {
    return this.getWsEndpoint(exchangeId, mode) !== undefined;
  },

  /**
   * Check if an exchange supports FIX protocol
   *
   * @param exchangeId - The exchange identifier
   * @param mode - The exchange mode
   * @returns True if FIX is supported
   */
  supportsFix(exchangeId: ExchangeId, mode: ExchangeMode): boolean {
    return this.getFixEndpoint(exchangeId, mode) !== undefined;
  },
};
