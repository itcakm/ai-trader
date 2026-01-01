/**
 * Exchange Order Router Service
 *
 * Selects the optimal exchange for order execution based on configurable criteria.
 * Supports order splitting across multiple exchanges for large orders.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import {
  ExchangeId,
  ExchangeConfig,
} from '../types/exchange';
import { OrderRequest } from '../types/exchange-order';
import { ExchangeService } from './exchange';
import { RoutingConfigRepository } from '../repositories/routing-config';
import { generateUUID } from '../utils/uuid';

/**
 * Routing criteria for order execution
 */
export type RoutingCriteria = 'BEST_PRICE' | 'LOWEST_FEES' | 'HIGHEST_LIQUIDITY' | 'USER_PREFERENCE';

/**
 * Exchange priority configuration
 */
export interface ExchangePriority {
  exchangeId: ExchangeId;
  priority: number;
  enabled: boolean;
}

/**
 * Routing configuration per tenant
 */
export interface RoutingConfig {
  configId: string;
  tenantId: string;
  defaultCriteria: RoutingCriteria;
  exchangePriorities: ExchangePriority[];
  enableOrderSplitting: boolean;
  maxSplitExchanges: number;
  minSplitSize: number;
}

/**
 * Input for creating/updating routing config
 */
export interface RoutingConfigInput {
  defaultCriteria?: RoutingCriteria;
  exchangePriorities?: ExchangePriority[];
  enableOrderSplitting?: boolean;
  maxSplitExchanges?: number;
  minSplitSize?: number;
}

/**
 * Price comparison data for routing decisions
 */
export interface PriceComparison {
  exchangeId: ExchangeId;
  bidPrice: number;
  askPrice: number;
  spread: number;
}

/**
 * Liquidity analysis for routing decisions
 */
export interface LiquidityAnalysis {
  exchangeId: ExchangeId;
  bidDepth: number;
  askDepth: number;
  estimatedSlippage: number;
}

/**
 * Fee comparison for routing decisions
 */
export interface FeeComparison {
  exchangeId: ExchangeId;
  makerFee: number;
  takerFee: number;
  estimatedCost: number;
}

/**
 * Exchange availability status
 */
export interface ExchangeAvailability {
  exchangeId: ExchangeId;
  available: boolean;
  reason?: string;
}


/**
 * Split order details
 */
export interface SplitOrder {
  exchangeId: ExchangeId;
  quantity: number;
  estimatedPrice: number;
}

/**
 * Reasoning behind routing decision
 */
export interface RoutingReasoning {
  priceComparison?: PriceComparison[];
  liquidityAnalysis?: LiquidityAnalysis[];
  feeComparison?: FeeComparison[];
  availabilityCheck: ExchangeAvailability[];
}

/**
 * Complete routing decision
 */
export interface RoutingDecision {
  decisionId: string;
  orderId: string;
  criteria: RoutingCriteria;
  selectedExchange: ExchangeId;
  alternativeExchanges: ExchangeId[];
  reasoning: RoutingReasoning;
  splitOrders?: SplitOrder[];
  timestamp: string;
}

/**
 * Order book summary for an exchange
 */
export interface OrderBookSummary {
  exchangeId: ExchangeId;
  assetId: string;
  bestBid: number;
  bestAsk: number;
  bidDepth: number;
  askDepth: number;
  spread: number;
  spreadPercent: number;
  timestamp: string;
}

/**
 * Routing outcome for tracking
 */
export interface RoutingOutcome {
  decisionId: string;
  success: boolean;
  actualExchange: ExchangeId;
  actualPrice: number;
  slippage: number;
  executionTimeMs: number;
}

/**
 * Error thrown when routing fails
 */
export class RoutingError extends Error {
  constructor(
    message: string,
    public readonly orderId: string,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

/**
 * Error thrown when no exchange is available
 */
export class NoExchangeAvailableError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly assetId: string
  ) {
    super(`No exchange available for order '${orderId}' with asset '${assetId}'`);
    this.name = 'NoExchangeAvailableError';
  }
}

/**
 * Error thrown when order size constraints are violated
 */
export class OrderSizeConstraintError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly exchangeId: ExchangeId,
    public readonly constraint: 'minOrderSize' | 'lotSize',
    public readonly value: number,
    public readonly limit: number
  ) {
    super(
      `Order '${orderId}' violates ${constraint} constraint on ${exchangeId}: ${value} (limit: ${limit})`
    );
    this.name = 'OrderSizeConstraintError';
  }
}

/**
 * Default fee rates per exchange (in percentage)
 */
const DEFAULT_FEE_RATES: Record<ExchangeId, { maker: number; taker: number }> = {
  BINANCE: { maker: 0.1, taker: 0.1 },
  COINBASE: { maker: 0.4, taker: 0.6 },
  KRAKEN: { maker: 0.16, taker: 0.26 },
  OKX: { maker: 0.08, taker: 0.1 },
  BSDEX: { maker: 0.2, taker: 0.35 },
  BISON: { maker: 0.75, taker: 0.75 },
  FINOA: { maker: 0.15, taker: 0.25 },
  BYBIT: { maker: 0.1, taker: 0.1 },
};


/**
 * In-memory order book cache for routing decisions
 * In production, this would be populated by real-time market data
 */
let orderBookCache: Map<string, OrderBookSummary> = new Map();

/**
 * In-memory routing decision store for tracking
 */
let routingDecisionStore: Map<string, RoutingDecision> = new Map();

/**
 * Exchange Order Router Service
 *
 * Provides intelligent order routing based on configurable criteria.
 */
export const ExchangeOrderRouter = {
  /**
   * Route an order to the optimal exchange
   *
   * Selects the best exchange based on the configured routing criteria,
   * considering order book data, fees, and exchange availability.
   *
   * Requirements: 6.1, 6.2, 6.4, 6.5
   *
   * @param order - The order request to route
   * @returns The routing decision
   * @throws NoExchangeAvailableError if no exchange is available
   * @throws OrderSizeConstraintError if order violates size constraints
   */
  async routeOrder(order: OrderRequest): Promise<RoutingDecision> {
    const decisionId = generateUUID();
    const timestamp = new Date().toISOString();

    // Get routing config for tenant
    const routingConfig = await this.getRoutingConfig(order.tenantId);

    // Get available exchanges
    const availableExchanges = await ExchangeService.getAvailableExchanges(order.tenantId);

    // Check availability for each exchange
    const availabilityCheck: ExchangeAvailability[] = await this.checkExchangeAvailability(
      order.tenantId,
      order.assetId,
      availableExchanges
    );

    // Filter to only available exchanges
    const eligibleExchanges = availableExchanges.filter((ex) => {
      const availability = availabilityCheck.find((a) => a.exchangeId === ex.exchangeId);
      return availability?.available;
    });

    if (eligibleExchanges.length === 0) {
      throw new NoExchangeAvailableError(order.orderId, order.assetId);
    }

    // Validate order size constraints for all eligible exchanges
    const validExchanges = await this.validateSizeConstraints(order, eligibleExchanges);

    if (validExchanges.length === 0) {
      throw new NoExchangeAvailableError(order.orderId, order.assetId);
    }

    // Determine routing criteria
    const criteria = routingConfig.defaultCriteria;

    // Get order book data for routing decisions
    const orderBookData = await this.getOrderBookSummaries(order.assetId, validExchanges);

    // Build routing reasoning
    const reasoning: RoutingReasoning = {
      availabilityCheck,
    };

    // Select exchange based on criteria
    let selectedExchange: ExchangeId;
    let alternativeExchanges: ExchangeId[];

    switch (criteria) {
      case 'BEST_PRICE':
        const priceResult = this.selectByBestPrice(order, validExchanges, orderBookData);
        selectedExchange = priceResult.selected;
        alternativeExchanges = priceResult.alternatives;
        reasoning.priceComparison = priceResult.comparison;
        break;

      case 'LOWEST_FEES':
        const feeResult = this.selectByLowestFees(order, validExchanges);
        selectedExchange = feeResult.selected;
        alternativeExchanges = feeResult.alternatives;
        reasoning.feeComparison = feeResult.comparison;
        break;

      case 'HIGHEST_LIQUIDITY':
        const liquidityResult = this.selectByHighestLiquidity(order, validExchanges, orderBookData);
        selectedExchange = liquidityResult.selected;
        alternativeExchanges = liquidityResult.alternatives;
        reasoning.liquidityAnalysis = liquidityResult.analysis;
        break;

      case 'USER_PREFERENCE':
      default:
        const preferenceResult = this.selectByUserPreference(validExchanges, routingConfig);
        selectedExchange = preferenceResult.selected;
        alternativeExchanges = preferenceResult.alternatives;
        break;
    }

    // Check if order splitting is needed and enabled
    let splitOrders: SplitOrder[] | undefined;
    if (routingConfig.enableOrderSplitting && order.quantity >= routingConfig.minSplitSize) {
      splitOrders = await this.calculateOrderSplits(
        order,
        validExchanges,
        orderBookData,
        routingConfig
      );
    }

    // Create routing decision
    const decision: RoutingDecision = {
      decisionId,
      orderId: order.orderId,
      criteria,
      selectedExchange,
      alternativeExchanges,
      reasoning,
      splitOrders,
      timestamp,
    };

    // Store decision for tracking
    routingDecisionStore.set(decisionId, decision);

    return decision;
  },


  /**
   * Get routing configuration for a tenant
   *
   * Requirements: 6.1
   *
   * @param tenantId - The tenant identifier
   * @returns The routing configuration
   */
  async getRoutingConfig(tenantId: string): Promise<RoutingConfig> {
    const config = await RoutingConfigRepository.getRoutingConfig(tenantId);
    if (config) {
      return config;
    }

    // Return default config if none exists
    return {
      configId: generateUUID(),
      tenantId,
      defaultCriteria: 'USER_PREFERENCE',
      exchangePriorities: [],
      enableOrderSplitting: false,
      maxSplitExchanges: 3,
      minSplitSize: 10000,
    };
  },

  /**
   * Update routing configuration for a tenant
   *
   * Requirements: 6.1
   *
   * @param tenantId - The tenant identifier
   * @param updates - The configuration updates
   * @returns The updated routing configuration
   */
  async updateRoutingConfig(
    tenantId: string,
    updates: Partial<RoutingConfigInput>
  ): Promise<RoutingConfig> {
    const existing = await this.getRoutingConfig(tenantId);

    const updated: RoutingConfig = {
      ...existing,
      defaultCriteria: updates.defaultCriteria ?? existing.defaultCriteria,
      exchangePriorities: updates.exchangePriorities ?? existing.exchangePriorities,
      enableOrderSplitting: updates.enableOrderSplitting ?? existing.enableOrderSplitting,
      maxSplitExchanges: updates.maxSplitExchanges ?? existing.maxSplitExchanges,
      minSplitSize: updates.minSplitSize ?? existing.minSplitSize,
    };

    await RoutingConfigRepository.putRoutingConfig(tenantId, updated);

    return updated;
  },

  /**
   * Get order book summaries for an asset across exchanges
   *
   * Requirements: 6.2
   *
   * @param assetId - The asset identifier
   * @param exchanges - The exchanges to query
   * @returns Order book summaries
   */
  async getOrderBookSummaries(
    assetId: string,
    exchanges: ExchangeConfig[]
  ): Promise<OrderBookSummary[]> {
    const summaries: OrderBookSummary[] = [];

    for (const exchange of exchanges) {
      const cacheKey = `${exchange.exchangeId}:${assetId}`;
      const cached = orderBookCache.get(cacheKey);

      if (cached) {
        summaries.push(cached);
      } else {
        // Generate simulated order book data for testing
        // In production, this would fetch real data from exchanges
        const summary = this.generateSimulatedOrderBook(exchange.exchangeId, assetId);
        orderBookCache.set(cacheKey, summary);
        summaries.push(summary);
      }
    }

    return summaries;
  },

  /**
   * Track routing outcome for optimization
   *
   * Requirements: 6.5
   *
   * @param decisionId - The routing decision ID
   * @param outcome - The routing outcome
   */
  async trackRoutingOutcome(decisionId: string, outcome: RoutingOutcome): Promise<void> {
    const decision = routingDecisionStore.get(decisionId);
    if (!decision) {
      return;
    }

    // Log the outcome for analysis
    console.log('[RoutingOutcome]', {
      decisionId,
      orderId: decision.orderId,
      criteria: decision.criteria,
      selectedExchange: decision.selectedExchange,
      actualExchange: outcome.actualExchange,
      success: outcome.success,
      slippage: outcome.slippage,
      executionTimeMs: outcome.executionTimeMs,
    });
  },


  /**
   * Check exchange availability for an asset
   *
   * Requirements: 6.4
   *
   * @param tenantId - The tenant identifier
   * @param assetId - The asset identifier
   * @param exchanges - The exchanges to check
   * @returns Availability status for each exchange
   */
  async checkExchangeAvailability(
    tenantId: string,
    assetId: string,
    exchanges: ExchangeConfig[]
  ): Promise<ExchangeAvailability[]> {
    const availability: ExchangeAvailability[] = [];

    for (const exchange of exchanges) {
      // Check if exchange is active
      const isAvailable = await ExchangeService.isExchangeAvailable(tenantId, exchange.exchangeId);

      if (!isAvailable) {
        availability.push({
          exchangeId: exchange.exchangeId,
          available: false,
          reason: 'Exchange is not active',
        });
        continue;
      }

      // Check if exchange supports the asset
      if (!exchange.supportedFeatures.supportedAssets.includes(assetId)) {
        availability.push({
          exchangeId: exchange.exchangeId,
          available: false,
          reason: `Asset '${assetId}' not supported`,
        });
        continue;
      }

      availability.push({
        exchangeId: exchange.exchangeId,
        available: true,
      });
    }

    return availability;
  },

  /**
   * Validate order size constraints against exchange limits
   *
   * Requirements: 6.6
   *
   * @param order - The order request
   * @param exchanges - The exchanges to validate against
   * @returns Exchanges that pass size validation
   */
  async validateSizeConstraints(
    order: OrderRequest,
    exchanges: ExchangeConfig[]
  ): Promise<ExchangeConfig[]> {
    const validExchanges: ExchangeConfig[] = [];

    for (const exchange of exchanges) {
      const features = exchange.supportedFeatures;

      // Check minimum order size
      if (order.quantity < features.minOrderSize) {
        continue;
      }

      // Check lot size (quantity must be a multiple of lot size)
      const remainder = order.quantity % features.lotSize;
      // Allow small floating point errors - use a tolerance relative to lot size
      const tolerance = features.lotSize * 0.01; // 1% tolerance
      if (remainder > tolerance && (features.lotSize - remainder) > tolerance) {
        continue;
      }

      validExchanges.push(exchange);
    }

    return validExchanges;
  },

  /**
   * Validate order against a specific exchange's size constraints
   *
   * Requirements: 6.6
   *
   * @param order - The order request
   * @param exchange - The exchange to validate against
   * @throws OrderSizeConstraintError if validation fails
   */
  validateOrderSizeForExchange(order: OrderRequest, exchange: ExchangeConfig): void {
    const features = exchange.supportedFeatures;

    // Check minimum order size
    if (order.quantity < features.minOrderSize) {
      throw new OrderSizeConstraintError(
        order.orderId,
        exchange.exchangeId,
        'minOrderSize',
        order.quantity,
        features.minOrderSize
      );
    }

    // Check lot size
    const remainder = order.quantity % features.lotSize;
    // Allow small floating point errors - use a tolerance relative to lot size
    const tolerance = features.lotSize * 0.01; // 1% tolerance
    if (remainder > tolerance && (features.lotSize - remainder) > tolerance) {
      throw new OrderSizeConstraintError(
        order.orderId,
        exchange.exchangeId,
        'lotSize',
        order.quantity,
        features.lotSize
      );
    }
  },


  /**
   * Select exchange by best price
   *
   * Requirements: 6.1, 6.2
   *
   * @param order - The order request
   * @param exchanges - Available exchanges
   * @param orderBooks - Order book data
   * @returns Selected exchange and alternatives
   */
  selectByBestPrice(
    order: OrderRequest,
    exchanges: ExchangeConfig[],
    orderBooks: OrderBookSummary[]
  ): { selected: ExchangeId; alternatives: ExchangeId[]; comparison: PriceComparison[] } {
    const comparison: PriceComparison[] = [];

    for (const exchange of exchanges) {
      const orderBook = orderBooks.find((ob) => ob.exchangeId === exchange.exchangeId);
      if (orderBook) {
        comparison.push({
          exchangeId: exchange.exchangeId,
          bidPrice: orderBook.bestBid,
          askPrice: orderBook.bestAsk,
          spread: orderBook.spread,
        });
      }
    }

    // Sort by best price (lowest ask for BUY, highest bid for SELL)
    const sorted = [...comparison].sort((a, b) => {
      if (order.side === 'BUY') {
        return a.askPrice - b.askPrice; // Lower ask is better for buying
      } else {
        return b.bidPrice - a.bidPrice; // Higher bid is better for selling
      }
    });

    const selected = sorted[0]?.exchangeId || exchanges[0].exchangeId;
    const alternatives = sorted.slice(1).map((c) => c.exchangeId);

    return { selected, alternatives, comparison };
  },

  /**
   * Select exchange by lowest fees
   *
   * Requirements: 6.1
   *
   * @param order - The order request
   * @param exchanges - Available exchanges
   * @returns Selected exchange and alternatives
   */
  selectByLowestFees(
    order: OrderRequest,
    exchanges: ExchangeConfig[]
  ): { selected: ExchangeId; alternatives: ExchangeId[]; comparison: FeeComparison[] } {
    const comparison: FeeComparison[] = [];

    for (const exchange of exchanges) {
      const fees = DEFAULT_FEE_RATES[exchange.exchangeId];
      const estimatedValue = order.quantity * (order.price || 50000); // Use price or default
      const feeRate = order.orderType === 'LIMIT' ? fees.maker : fees.taker;
      const estimatedCost = estimatedValue * (feeRate / 100);

      comparison.push({
        exchangeId: exchange.exchangeId,
        makerFee: fees.maker,
        takerFee: fees.taker,
        estimatedCost,
      });
    }

    // Sort by lowest estimated cost
    const sorted = [...comparison].sort((a, b) => a.estimatedCost - b.estimatedCost);

    const selected = sorted[0]?.exchangeId || exchanges[0].exchangeId;
    const alternatives = sorted.slice(1).map((c) => c.exchangeId);

    return { selected, alternatives, comparison };
  },

  /**
   * Select exchange by highest liquidity
   *
   * Requirements: 6.1, 6.2
   *
   * @param order - The order request
   * @param exchanges - Available exchanges
   * @param orderBooks - Order book data
   * @returns Selected exchange and alternatives
   */
  selectByHighestLiquidity(
    order: OrderRequest,
    exchanges: ExchangeConfig[],
    orderBooks: OrderBookSummary[]
  ): { selected: ExchangeId; alternatives: ExchangeId[]; analysis: LiquidityAnalysis[] } {
    const analysis: LiquidityAnalysis[] = [];

    for (const exchange of exchanges) {
      const orderBook = orderBooks.find((ob) => ob.exchangeId === exchange.exchangeId);
      if (orderBook) {
        // Estimate slippage based on order size vs depth
        const relevantDepth = order.side === 'BUY' ? orderBook.askDepth : orderBook.bidDepth;
        const estimatedSlippage = order.quantity > relevantDepth 
          ? (order.quantity / relevantDepth - 1) * 100 
          : 0;

        analysis.push({
          exchangeId: exchange.exchangeId,
          bidDepth: orderBook.bidDepth,
          askDepth: orderBook.askDepth,
          estimatedSlippage,
        });
      }
    }

    // Sort by lowest slippage (highest liquidity)
    const sorted = [...analysis].sort((a, b) => a.estimatedSlippage - b.estimatedSlippage);

    const selected = sorted[0]?.exchangeId || exchanges[0].exchangeId;
    const alternatives = sorted.slice(1).map((a) => a.exchangeId);

    return { selected, alternatives, analysis };
  },


  /**
   * Select exchange by user preference (priority)
   *
   * Requirements: 6.1
   *
   * @param exchanges - Available exchanges
   * @param config - Routing configuration
   * @returns Selected exchange and alternatives
   */
  selectByUserPreference(
    exchanges: ExchangeConfig[],
    config: RoutingConfig
  ): { selected: ExchangeId; alternatives: ExchangeId[] } {
    // Sort by user-defined priority, then by exchange priority
    const sorted = [...exchanges].sort((a, b) => {
      const aPriority = config.exchangePriorities.find((p) => p.exchangeId === a.exchangeId);
      const bPriority = config.exchangePriorities.find((p) => p.exchangeId === b.exchangeId);

      const aValue = aPriority?.enabled ? aPriority.priority : a.priority;
      const bValue = bPriority?.enabled ? bPriority.priority : b.priority;

      return aValue - bValue;
    });

    const selected = sorted[0].exchangeId;
    const alternatives = sorted.slice(1).map((e) => e.exchangeId);

    return { selected, alternatives };
  },

  /**
   * Calculate order splits across multiple exchanges
   *
   * Requirements: 6.3
   *
   * @param order - The order request
   * @param exchanges - Available exchanges
   * @param orderBooks - Order book data
   * @param config - Routing configuration
   * @returns Split orders
   */
  async calculateOrderSplits(
    order: OrderRequest,
    exchanges: ExchangeConfig[],
    orderBooks: OrderBookSummary[],
    config: RoutingConfig
  ): Promise<SplitOrder[]> {
    const splits: SplitOrder[] = [];
    let remainingQuantity = order.quantity;

    // Limit to maxSplitExchanges
    const exchangesToUse = exchanges.slice(0, config.maxSplitExchanges);

    // Sort exchanges by liquidity (depth)
    const sortedExchanges = [...exchangesToUse].sort((a, b) => {
      const aBook = orderBooks.find((ob) => ob.exchangeId === a.exchangeId);
      const bBook = orderBooks.find((ob) => ob.exchangeId === b.exchangeId);
      const aDepth = order.side === 'BUY' ? (aBook?.askDepth || 0) : (aBook?.bidDepth || 0);
      const bDepth = order.side === 'BUY' ? (bBook?.askDepth || 0) : (bBook?.bidDepth || 0);
      return bDepth - aDepth; // Higher depth first
    });

    // Calculate total available depth
    const totalDepth = sortedExchanges.reduce((sum, ex) => {
      const book = orderBooks.find((ob) => ob.exchangeId === ex.exchangeId);
      return sum + (order.side === 'BUY' ? (book?.askDepth || 0) : (book?.bidDepth || 0));
    }, 0);

    // Distribute order proportionally to depth
    for (const exchange of sortedExchanges) {
      if (remainingQuantity <= 0) break;

      const book = orderBooks.find((ob) => ob.exchangeId === exchange.exchangeId);
      const depth = order.side === 'BUY' ? (book?.askDepth || 0) : (book?.bidDepth || 0);
      const proportion = totalDepth > 0 ? depth / totalDepth : 1 / sortedExchanges.length;

      // Calculate quantity for this exchange
      let splitQuantity = Math.min(order.quantity * proportion, remainingQuantity);

      // Ensure minimum order size
      if (splitQuantity < exchange.supportedFeatures.minOrderSize) {
        continue;
      }

      // Round to lot size
      const lotSize = exchange.supportedFeatures.lotSize;
      splitQuantity = Math.floor(splitQuantity / lotSize) * lotSize;

      if (splitQuantity > 0) {
        const estimatedPrice = order.side === 'BUY' 
          ? (book?.bestAsk || order.price || 50000)
          : (book?.bestBid || order.price || 50000);

        splits.push({
          exchangeId: exchange.exchangeId,
          quantity: splitQuantity,
          estimatedPrice,
        });

        remainingQuantity -= splitQuantity;
      }
    }

    // If there's remaining quantity, add it to the first split
    if (remainingQuantity > 0 && splits.length > 0) {
      splits[0].quantity += remainingQuantity;
    }

    return splits;
  },


  /**
   * Generate simulated order book data for testing
   *
   * @param exchangeId - The exchange identifier
   * @param assetId - The asset identifier
   * @returns Simulated order book summary
   */
  generateSimulatedOrderBook(exchangeId: ExchangeId, assetId: string): OrderBookSummary {
    // Base price varies slightly by exchange
    const basePrices: Record<string, number> = {
      BTC: 50000,
      ETH: 3000,
      SOL: 100,
      ADA: 0.5,
      XRP: 0.6,
    };

    const basePrice = basePrices[assetId] || 100;
    const exchangeOffset = exchangeId.charCodeAt(0) % 10; // Small variation per exchange
    const spreadPercent = 0.05 + (exchangeOffset * 0.01); // 0.05% to 0.14% spread

    const bestBid = basePrice * (1 - spreadPercent / 200);
    const bestAsk = basePrice * (1 + spreadPercent / 200);
    const spread = bestAsk - bestBid;

    // Depth varies by exchange
    const depthMultiplier = 1 + (exchangeOffset * 0.1);
    const bidDepth = 100 * depthMultiplier;
    const askDepth = 100 * depthMultiplier;

    return {
      exchangeId,
      assetId,
      bestBid,
      bestAsk,
      bidDepth,
      askDepth,
      spread,
      spreadPercent: (spread / basePrice) * 100,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Update order book cache with new data
   *
   * @param summary - The order book summary to cache
   */
  updateOrderBookCache(summary: OrderBookSummary): void {
    const cacheKey = `${summary.exchangeId}:${summary.assetId}`;
    orderBookCache.set(cacheKey, summary);
  },

  /**
   * Clear order book cache
   */
  clearOrderBookCache(): void {
    orderBookCache.clear();
  },

  /**
   * Get routing decision by ID
   *
   * @param decisionId - The decision identifier
   * @returns The routing decision, or undefined if not found
   */
  getRoutingDecision(decisionId: string): RoutingDecision | undefined {
    return routingDecisionStore.get(decisionId);
  },

  /**
   * Clear routing decision store (for testing)
   */
  clearRoutingDecisions(): void {
    routingDecisionStore.clear();
  },

  /**
   * Verify that split order quantities sum to original quantity
   *
   * Requirements: 6.3
   *
   * @param originalQuantity - The original order quantity
   * @param splits - The split orders
   * @returns True if quantities match
   */
  verifySplitQuantities(originalQuantity: number, splits: SplitOrder[]): boolean {
    const totalSplitQuantity = splits.reduce((sum, split) => sum + split.quantity, 0);
    // Allow small floating point tolerance
    return Math.abs(totalSplitQuantity - originalQuantity) < 0.0001;
  },
};
