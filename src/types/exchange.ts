/**
 * Exchange Integration Type Definitions
 * Requirements: 1.1, 1.2, 1.5
 */

// Exchange identifiers for supported exchanges
export type ExchangeId =
  | 'BINANCE'
  | 'COINBASE'
  | 'KRAKEN'
  | 'OKX'
  | 'BSDEX'
  | 'BISON'
  | 'FINOA'
  | 'BYBIT';

// Exchange operational status
export type ExchangeStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'ERROR';

// Exchange mode for production vs testing
export type ExchangeMode = 'PRODUCTION' | 'SANDBOX';

// Authentication methods supported by exchanges
export type AuthMethod = 'API_KEY' | 'HMAC' | 'OAUTH' | 'FIX_CREDENTIALS';

// Encrypted credentials for exchange authentication
export interface EncryptedCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // For exchanges like Coinbase
  fixSenderCompId?: string;
  fixTargetCompId?: string;
}

// Exchange-specific features and capabilities
export interface ExchangeFeatures {
  supportedOrderTypes: import('./exchange-order').OrderType[];
  supportedAssets: string[];
  supportedTimeInForce: import('./exchange-order').TimeInForce[];
  supportsOrderModification: boolean;
  supportsWebSocket: boolean;
  supportsFIX: boolean;
  maxOrderSize: number;
  minOrderSize: number;
  tickSize: number;
  lotSize: number;
}

// Exchange rate limit configuration
export interface ExchangeRateLimits {
  ordersPerSecond: number;
  ordersPerMinute: number;
  queriesPerSecond: number;
  queriesPerMinute: number;
  wsMessagesPerSecond: number;
  weightPerMinute?: number; // For weight-based limits like Binance
}

// Complete exchange configuration
export interface ExchangeConfig {
  exchangeId: ExchangeId;
  tenantId: string;
  name: string;
  mode: ExchangeMode;
  restEndpoint: string;
  wsEndpoint?: string;
  fixEndpoint?: string;
  authMethod: AuthMethod;
  credentials: EncryptedCredentials;
  supportedFeatures: ExchangeFeatures;
  rateLimits: ExchangeRateLimits;
  status: ExchangeStatus;
  priority: number; // For failover ordering
  createdAt: string;
  updatedAt: string;
}

// Input type for registering/updating exchange config
export interface ExchangeConfigInput {
  exchangeId: ExchangeId;
  name: string;
  mode: ExchangeMode;
  restEndpoint: string;
  wsEndpoint?: string;
  fixEndpoint?: string;
  authMethod: AuthMethod;
  credentials: EncryptedCredentials;
  supportedFeatures: ExchangeFeatures;
  rateLimits: ExchangeRateLimits;
  priority?: number;
}

// Result of credential validation
export interface CredentialValidationResult {
  valid: boolean;
  exchangeId: ExchangeId;
  errorMessage?: string;
  validatedAt: string;
}

// Exchange health check result
export interface ExchangeHealthResult {
  exchangeId: ExchangeId;
  healthy: boolean;
  latencyMs: number;
  lastCheckedAt: string;
  errorMessage?: string;
}

// Rate limit status for an exchange
export interface RateLimitStatus {
  exchangeId: ExchangeId;
  ordersRemaining: number;
  queriesRemaining: number;
  wsMessagesRemaining: number;
  weightRemaining?: number;
  resetsAt: string;
}

// Subscription handle for real-time updates
export interface SubscriptionHandle {
  id: string;
  exchangeId: ExchangeId;
  channel: string;
  createdAt: string;
}

// Balance response from exchange
export interface BalanceResponse {
  exchangeId: ExchangeId;
  balances: AssetBalance[];
  timestamp: string;
}

// Individual asset balance
export interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

// Position response from exchange
export interface PositionResponse {
  exchangeId: ExchangeId;
  assetId: string;
  quantity: number;
  averageEntryPrice: number;
  unrealizedPnL: number;
  timestamp: string;
}
