/**
 * Exchange Integration Service
 *
 * Wires together all exchange-related services and adapters:
 * - ExchangeService with adapters via AdapterFactory
 * - OrderManager with OrderRouter and adapters
 * - PositionManager with OrderManager for fill events
 * - ConnectionManager with adapters
 * - RateLimiter with REST and WebSocket clients
 *
 * Requirements: 1.1, 5.1, 6.1, 7.2, 8.1, 9.1, 9.2
 */

import { ExchangeId, ExchangeConfig } from '../types/exchange';
import { ExecutionUpdate, Fill } from '../types/exchange-order';
import { ExchangeService } from './exchange';
import { ExchangeAdapterFactory, AdapterNotFoundError } from './exchange-adapter-factory';
import { ExchangeOrderManager, ExchangeAdapterInterface } from './exchange-order-manager';
import { ExchangeOrderRouter, RoutingDecision } from './exchange-order-router';
import { ExchangePositionManager } from './exchange-position-manager';
import { ExchangeConnectionManager, connectionManager } from './exchange-connection-manager';
import { ExchangeRateLimiter } from './exchange-rate-limiter';
import { BaseExchangeAdapter } from '../adapters/exchange/base-exchange-adapter';
import { generateUUID } from '../utils/uuid';

/**
 * Integration configuration options
 */
export interface IntegrationConfig {
  /** Enable automatic position updates from fills */
  autoUpdatePositions: boolean;
  /** Enable rate limiting for all exchange calls */
  enableRateLimiting: boolean;
  /** Enable connection management */
  enableConnectionManagement: boolean;
  /** Auto-connect adapters on registration */
  autoConnectAdapters: boolean;
}

/**
 * Default integration configuration
 */
const DEFAULT_CONFIG: IntegrationConfig = {
  autoUpdatePositions: true,
  enableRateLimiting: true,
  enableConnectionManagement: true,
  autoConnectAdapters: false,
};

/**
 * Fill event handler type
 */
type FillEventHandler = (tenantId: string, fill: ExecutionUpdate) => Promise<void>;

/**
 * In-memory fill event handlers
 */
const fillEventHandlers: FillEventHandler[] = [];

/**
 * Exchange Integration Service
 *
 * Provides unified integration of all exchange-related services.
 */
export const ExchangeIntegration = {
  /**
   * Current configuration
   */
  config: { ...DEFAULT_CONFIG } as IntegrationConfig,

  /**
   * Connection manager instance
   */
  connectionManager: connectionManager as ExchangeConnectionManager,

  /**
   * Configure the integration service
   *
   * @param config - Partial configuration to apply
   */
  configure(config: Partial<IntegrationConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Initialize exchange integration for a tenant
   *
   * Loads all exchange configurations and creates adapters.
   *
   * @param tenantId - The tenant identifier
   * @returns Array of initialized exchange IDs
   *
   * Requirements: 1.1
   */
  async initializeForTenant(tenantId: string): Promise<ExchangeId[]> {
    const exchanges = await ExchangeService.listExchanges(tenantId);
    const initializedExchanges: ExchangeId[] = [];

    for (const exchangeConfig of exchanges) {
      try {
        await this.initializeExchange(tenantId, exchangeConfig);
        initializedExchanges.push(exchangeConfig.exchangeId);
      } catch (error) {
        console.error(
          `Failed to initialize exchange ${exchangeConfig.exchangeId}:`,
          error
        );
      }
    }

    return initializedExchanges;
  },

  /**
   * Initialize a single exchange
   *
   * Creates adapter, registers with services, and optionally connects.
   *
   * @param tenantId - The tenant identifier
   * @param config - The exchange configuration
   *
   * Requirements: 1.1, 8.1, 9.1
   */
  async initializeExchange(tenantId: string, config: ExchangeConfig): Promise<void> {
    // Create and register adapter
    const adapter = ExchangeAdapterFactory.createAndRegisterAdapter(config);

    // Register adapter with order manager
    this.registerAdapterWithOrderManager(tenantId, config.exchangeId, adapter);

    // Register adapter with position manager for reconciliation
    ExchangePositionManager.registerAdapter(tenantId, config.exchangeId, adapter);

    // Configure rate limits
    if (this.config.enableRateLimiting) {
      ExchangeRateLimiter.configure({
        exchangeId: config.exchangeId,
        limits: [
          {
            category: 'ORDERS',
            requestsPerSecond: config.rateLimits.ordersPerSecond,
            requestsPerMinute: config.rateLimits.ordersPerMinute,
          },
          {
            category: 'QUERIES',
            requestsPerSecond: config.rateLimits.queriesPerSecond,
            requestsPerMinute: config.rateLimits.queriesPerMinute,
          },
          {
            category: 'WEBSOCKET',
            requestsPerSecond: config.rateLimits.wsMessagesPerSecond,
            requestsPerMinute: config.rateLimits.wsMessagesPerSecond * 60,
          },
          {
            category: 'WEIGHT',
            requestsPerSecond: config.rateLimits.weightPerMinute
              ? config.rateLimits.weightPerMinute / 60
              : 100,
            requestsPerMinute: config.rateLimits.weightPerMinute ?? 6000,
            weight: 1,
          },
        ],
        criticalReservationPercent: 10,
        warningThresholdPercent: 80,
        burstAllowed: true,
      });
    }

    // Auto-connect if configured
    if (this.config.autoConnectAdapters) {
      await adapter.connect();
    }
  },

  /**
   * Register an adapter with the order manager
   *
   * Wraps the adapter to integrate with rate limiting.
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @param adapter - The exchange adapter
   *
   * Requirements: 5.1, 9.1, 9.2
   */
  registerAdapterWithOrderManager(
    tenantId: string,
    exchangeId: ExchangeId,
    adapter: BaseExchangeAdapter
  ): void {
    // Create a wrapper that integrates rate limiting
    const wrappedAdapter: ExchangeAdapterInterface = {
      submitOrder: async (order) => {
        if (this.config.enableRateLimiting) {
          const result = await ExchangeRateLimiter.executeWithRateLimit(
            exchangeId,
            tenantId,
            'ORDERS',
            'HIGH',
            () => adapter.submitOrder(order)
          );
          if (result.executed) {
            return result.result;
          }
          throw new Error(`Order queued due to rate limiting. Request ID: ${result.requestId}`);
        }
        return adapter.submitOrder(order);
      },

      cancelOrder: async (orderId, exchangeOrderId) => {
        if (this.config.enableRateLimiting) {
          // Cancellations are critical operations
          const result = await ExchangeRateLimiter.executeWithRateLimit(
            exchangeId,
            tenantId,
            'ORDERS',
            'CRITICAL',
            () => adapter.cancelOrder(orderId, exchangeOrderId)
          );
          if (result.executed) {
            return result.result;
          }
          throw new Error(`Cancel queued due to rate limiting. Request ID: ${result.requestId}`);
        }
        return adapter.cancelOrder(orderId, exchangeOrderId);
      },

      modifyOrder: async (orderId, modifications) => {
        if (this.config.enableRateLimiting) {
          const result = await ExchangeRateLimiter.executeWithRateLimit(
            exchangeId,
            tenantId,
            'ORDERS',
            'HIGH',
            () => adapter.modifyOrder(orderId, modifications)
          );
          if (result.executed) {
            return result.result;
          }
          throw new Error(`Modify queued due to rate limiting. Request ID: ${result.requestId}`);
        }
        return adapter.modifyOrder(orderId, modifications);
      },

      getOrderStatus: async (orderId, exchangeOrderId) => {
        if (this.config.enableRateLimiting) {
          const result = await ExchangeRateLimiter.executeWithRateLimit(
            exchangeId,
            tenantId,
            'QUERIES',
            'NORMAL',
            () => adapter.getOrderStatus(orderId, exchangeOrderId)
          );
          if (result.executed) {
            return result.result;
          }
          throw new Error(`Query queued due to rate limiting. Request ID: ${result.requestId}`);
        }
        return adapter.getOrderStatus(orderId, exchangeOrderId);
      },
    };

    ExchangeOrderManager.registerAdapter(tenantId, exchangeId, wrappedAdapter);
  },

  /**
   * Get an adapter for an exchange
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   * @returns The adapter
   * @throws AdapterNotFoundError if not found
   */
  getAdapter(tenantId: string, exchangeId: ExchangeId): BaseExchangeAdapter {
    return ExchangeAdapterFactory.getAdapterOrThrow(tenantId, exchangeId);
  },

  /**
   * Route and submit an order
   *
   * Uses the order router to select the best exchange, then submits via order manager.
   *
   * @param order - The order request (without exchangeId)
   * @returns The routing decision and order response
   *
   * Requirements: 5.1, 6.1
   */
  async routeAndSubmitOrder(order: Parameters<typeof ExchangeOrderManager.submitOrder>[0]): Promise<{
    routingDecision: RoutingDecision;
    orderResponse: Awaited<ReturnType<typeof ExchangeOrderManager.submitOrder>>;
  }> {
    // Route the order to select the best exchange
    const routingDecision = await ExchangeOrderRouter.routeOrder(order);

    // Submit the order with the selected exchange
    const orderWithExchange = {
      ...order,
      exchangeId: routingDecision.selectedExchange,
    };

    const orderResponse = await ExchangeOrderManager.submitOrder(orderWithExchange);

    // Track routing outcome
    await ExchangeOrderRouter.trackRoutingOutcome(routingDecision.decisionId, {
      decisionId: routingDecision.decisionId,
      success: orderResponse.status !== 'REJECTED',
      actualExchange: routingDecision.selectedExchange,
      actualPrice: orderResponse.averagePrice ?? 0,
      slippage: 0, // Would need to calculate based on expected vs actual price
      executionTimeMs: 0, // Would need to track timing
    });

    return { routingDecision, orderResponse };
  },

  /**
   * Process a fill event and update positions
   *
   * Called when an execution/fill is received from an exchange.
   *
   * @param tenantId - The tenant identifier
   * @param fill - The execution update
   *
   * Requirements: 7.2
   */
  async processFillEvent(tenantId: string, fill: ExecutionUpdate): Promise<void> {
    // Update position from fill
    if (this.config.autoUpdatePositions) {
      await ExchangePositionManager.updatePositionFromFill(tenantId, fill);
    }

    // Notify all registered fill event handlers
    for (const handler of fillEventHandlers) {
      try {
        await handler(tenantId, fill);
      } catch (error) {
        console.error('Fill event handler error:', error);
      }
    }
  },

  /**
   * Register a fill event handler
   *
   * @param handler - The handler function
   */
  onFillEvent(handler: FillEventHandler): void {
    fillEventHandlers.push(handler);
  },

  /**
   * Subscribe to order updates for an exchange
   *
   * Sets up WebSocket subscription and routes updates to order manager and position manager.
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   *
   * Requirements: 7.2
   */
  async subscribeToOrderUpdates(tenantId: string, exchangeId: ExchangeId): Promise<void> {
    const adapter = this.getAdapter(tenantId, exchangeId);

    // Subscribe to order updates
    await adapter.subscribeToOrderUpdates(async (update) => {
      try {
        await ExchangeOrderManager.updateOrderStatus(
          tenantId,
          update.orderId,
          update.status
        );
      } catch (error) {
        console.error('Error processing order update:', error);
      }
    });

    // Subscribe to execution updates
    await adapter.subscribeToExecutions(async (execution) => {
      try {
        // Create fill record
        const fill: Fill = {
          fillId: generateUUID(),
          executionId: execution.executionId,
          quantity: execution.quantity,
          price: execution.price,
          commission: execution.commission,
          commissionAsset: execution.commissionAsset,
          timestamp: execution.timestamp,
        };

        // Add fill to order
        await ExchangeOrderManager.addFillToOrder(tenantId, execution.orderId, fill);

        // Process fill event for position updates
        await this.processFillEvent(tenantId, execution);
      } catch (error) {
        console.error('Error processing execution update:', error);
      }
    });
  },

  /**
   * Connect an adapter and set up subscriptions
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   *
   * Requirements: 8.1
   */
  async connectExchange(tenantId: string, exchangeId: ExchangeId): Promise<void> {
    const adapter = this.getAdapter(tenantId, exchangeId);

    // Connect the adapter
    await adapter.connect();

    // Create connection in connection manager
    if (this.config.enableConnectionManagement) {
      await this.connectionManager.createConnection(tenantId, exchangeId, 'REST');
      
      // Create WebSocket connection if supported
      const config = await ExchangeService.getExchange(tenantId, exchangeId);
      if (config.wsEndpoint) {
        await this.connectionManager.createConnection(tenantId, exchangeId, 'WEBSOCKET');
      }
    }

    // Subscribe to updates
    await this.subscribeToOrderUpdates(tenantId, exchangeId);
  },

  /**
   * Disconnect an exchange
   *
   * @param tenantId - The tenant identifier
   * @param exchangeId - The exchange identifier
   *
   * Requirements: 8.1
   */
  async disconnectExchange(tenantId: string, exchangeId: ExchangeId): Promise<void> {
    const adapter = ExchangeAdapterFactory.getAdapter(tenantId, exchangeId);

    if (adapter && adapter.isConnected()) {
      await adapter.disconnect();
    }

    // Close connections in connection manager
    if (this.config.enableConnectionManagement) {
      await this.connectionManager.gracefulShutdown(tenantId, exchangeId);
    }
  },

  /**
   * Shutdown all exchanges for a tenant
   *
   * @param tenantId - The tenant identifier
   */
  async shutdownForTenant(tenantId: string): Promise<void> {
    // Disconnect all adapters
    await ExchangeAdapterFactory.disconnectAllForTenant(tenantId);

    // Shutdown connection manager
    if (this.config.enableConnectionManagement) {
      await this.connectionManager.gracefulShutdown(tenantId);
    }

    // Reset rate limiters
    const exchangeIds = ExchangeAdapterFactory.getRegisteredExchangeIds(tenantId);
    for (const exchangeId of exchangeIds) {
      ExchangeRateLimiter.reset(exchangeId);
    }
  },

  /**
   * Get health status for all exchanges
   *
   * @param tenantId - The tenant identifier
   * @returns Health status for each exchange
   */
  async getHealthStatus(tenantId: string): Promise<Map<ExchangeId, {
    connected: boolean;
    healthy: boolean;
    latencyMs?: number;
    errorMessage?: string;
  }>> {
    const status = new Map<ExchangeId, {
      connected: boolean;
      healthy: boolean;
      latencyMs?: number;
      errorMessage?: string;
    }>();

    const adapters = ExchangeAdapterFactory.getAdaptersForTenant(tenantId);

    for (const adapter of adapters) {
      const exchangeId = adapter.exchangeId;
      const connected = adapter.isConnected();

      if (connected) {
        try {
          const healthResult = await adapter.healthCheck();
          status.set(exchangeId, {
            connected: true,
            healthy: healthResult.healthy,
            latencyMs: healthResult.latencyMs,
            errorMessage: healthResult.errorMessage,
          });
        } catch (error) {
          status.set(exchangeId, {
            connected: true,
            healthy: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      } else {
        status.set(exchangeId, {
          connected: false,
          healthy: false,
        });
      }
    }

    return status;
  },

  /**
   * Clear all fill event handlers (for testing)
   */
  clearFillEventHandlers(): void {
    fillEventHandlers.length = 0;
  },

  /**
   * Reset integration state (for testing)
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.clearFillEventHandlers();
    ExchangeAdapterFactory.clearRegistry();
    ExchangeRateLimiter.resetAll();
    ExchangePositionManager.clearStores();
  },
};
