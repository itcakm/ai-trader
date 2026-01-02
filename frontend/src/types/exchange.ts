/**
 * Exchange Integration types for the frontend
 */

/**
 * Exchange identifiers
 */
export type ExchangeId =
  | 'BINANCE'
  | 'COINBASE'
  | 'KRAKEN'
  | 'OKX'
  | 'BSDEX'
  | 'BISON'
  | 'FINOA'
  | 'BYBIT';

/**
 * Exchange status
 */
export type ExchangeStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'ERROR';

/**
 * Exchange mode
 */
export type ExchangeMode = 'PRODUCTION' | 'SANDBOX';

/**
 * Authentication method
 */
export type AuthMethod = 'API_KEY' | 'HMAC' | 'OAUTH' | 'FIX_CREDENTIALS';

/**
 * Order types
 */
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT' | 'STOP_MARKET' | 'TRAILING_STOP';

/**
 * Order side
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Order status
 */
export type OrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Time in force
 */
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTD';

/**
 * Exchange features
 */
export interface ExchangeFeatures {
  supportedOrderTypes: OrderType[];
  supportedAssets: string[];
  supportedTimeInForce: TimeInForce[];
  supportsOrderModification: boolean;
  supportsWebSocket: boolean;
  supportsFIX: boolean;
  maxOrderSize: number;
  minOrderSize: number;
  tickSize: number;
  lotSize: number;
}

/**
 * Exchange rate limits
 */
export interface ExchangeRateLimits {
  ordersPerSecond: number;
  ordersPerMinute: number;
  queriesPerSecond: number;
  queriesPerMinute: number;
  wsMessagesPerSecond: number;
  weightPerMinute?: number;
}

/**
 * Exchange configuration
 */
export interface ExchangeConfig {
  exchangeId: ExchangeId;
  tenantId: string;
  name: string;
  mode: ExchangeMode;
  restEndpoint: string;
  wsEndpoint?: string;
  fixEndpoint?: string;
  authMethod: AuthMethod;
  supportedFeatures: ExchangeFeatures;
  rateLimits: ExchangeRateLimits;
  status: ExchangeStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Asset balance
 */
export interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

/**
 * Order fill
 */
export interface Fill {
  fillId: string;
  executionId: string;
  quantity: number;
  price: number;
  commission: number;
  commissionAsset: string;
  timestamp: string;
}

/**
 * Order
 */
export interface Order {
  orderId: string;
  tenantId: string;
  strategyId: string;
  exchangeId: ExchangeId;
  exchangeOrderId?: string;
  assetId: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  stopPrice?: number;
  averageFilledPrice?: number;
  timeInForce: TimeInForce;
  status: OrderStatus;
  idempotencyKey: string;
  fills: Fill[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  completedAt?: string;
}

/**
 * Position
 */
export interface Position {
  positionId: string;
  tenantId: string;
  assetId: string;
  exchangeId: ExchangeId;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  totalCommissions: number;
  openedAt: string;
  updatedAt: string;
}

/**
 * Aggregated position
 */
export interface AggregatedPosition {
  tenantId: string;
  assetId: string;
  totalQuantity: number;
  weightedAveragePrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  positionsByExchange: {
    exchangeId: ExchangeId;
    quantity: number;
    averageEntryPrice: number;
    unrealizedPnL: number;
  }[];
  updatedAt: string;
}

/**
 * Exchange status badge variant mapping
 */
export const exchangeStatusVariant: Record<ExchangeStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  ACTIVE: 'success',
  INACTIVE: 'default',
  MAINTENANCE: 'warning',
  ERROR: 'error',
};

/**
 * Order status badge variant mapping
 */
export const orderStatusVariant: Record<OrderStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  PENDING: 'default',
  OPEN: 'info',
  PARTIALLY_FILLED: 'warning',
  FILLED: 'success',
  CANCELLED: 'default',
  REJECTED: 'error',
  EXPIRED: 'default',
};

/**
 * Order side badge variant mapping
 */
export const orderSideVariant: Record<OrderSide, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  BUY: 'success',
  SELL: 'error',
};
