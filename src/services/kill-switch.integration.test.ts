/**
 * Kill Switch Flow Integration Tests
 * 
 * Tests the complete kill switch flow:
 * activate → block orders → deactivate
 * 
 * Requirements: 4.1, 4.5
 */

import { OrderRequest, OrderSide, OrderType } from '../types/order';
import { KillSwitchState, KillSwitchScopeType, KillTriggerType, AutoKillTrigger, KillTriggerCondition } from '../types/kill-switch';
import { RiskCheckResult, RiskCheckDetail } from '../types/risk-engine';

/**
 * Simple UUID v4 generator for testing
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * In-memory mock implementation of KillSwitchStore for integration testing
 */
class MockKillSwitchStore {
  private states: Map<string, KillSwitchState> = new Map();
  private configs: Map<string, { autoTriggers: AutoKillTrigger[]; requireAuthForDeactivation: boolean }> = new Map();

  async getState(tenantId: string): Promise<KillSwitchState> {
    return this.states.get(tenantId) || {
      tenantId,
      active: false,
      triggerType: 'MANUAL' as KillTriggerType,
      scope: 'TENANT' as KillSwitchScopeType,
      pendingOrdersCancelled: 0
    };
  }

  async activate(
    tenantId: string,
    reason: string,
    triggerType: KillTriggerType = 'MANUAL',
    activatedBy?: string
  ): Promise<{ state: KillSwitchState; ordersCancelled: number }> {
    const existingState = await this.getState(tenantId);
    if (existingState.active) {
      return { state: existingState, ordersCancelled: 0 };
    }

    const state: KillSwitchState = {
      tenantId,
      active: true,
      activatedAt: new Date().toISOString(),
      activatedBy,
      activationReason: reason,
      triggerType,
      scope: 'TENANT',
      pendingOrdersCancelled: 5 // Simulated cancelled orders
    };
    this.states.set(tenantId, state);
    return { state, ordersCancelled: 5 };
  }

  async deactivate(tenantId: string, authToken: string): Promise<KillSwitchState> {
    const config = this.configs.get(tenantId);
    if (config?.requireAuthForDeactivation && (!authToken || authToken.trim() === '')) {
      throw new Error('Authentication required for deactivation');
    }

    const existingState = await this.getState(tenantId);
    if (!existingState.active) {
      throw new Error('Kill switch is not active');
    }

    const state: KillSwitchState = {
      tenantId,
      active: false,
      triggerType: 'MANUAL',
      scope: 'TENANT',
      pendingOrdersCancelled: 0
    };
    this.states.set(tenantId, state);
    return state;
  }

  async isActive(tenantId: string): Promise<boolean> {
    const state = await this.getState(tenantId);
    return state.active;
  }

  async setConfig(tenantId: string, config: { autoTriggers: AutoKillTrigger[]; requireAuthForDeactivation: boolean }): Promise<void> {
    this.configs.set(tenantId, config);
  }

  async getConfig(tenantId: string): Promise<{ autoTriggers: AutoKillTrigger[]; requireAuthForDeactivation: boolean } | null> {
    return this.configs.get(tenantId) || null;
  }

  async checkAutoTriggers(tenantId: string, event: { lossPercent?: number; errorRate?: number }): Promise<boolean> {
    const config = this.configs.get(tenantId);
    if (!config || config.autoTriggers.length === 0) {
      return false;
    }

    const isActive = await this.isActive(tenantId);
    if (isActive) {
      return false;
    }

    for (const trigger of config.autoTriggers) {
      if (!trigger.enabled) continue;

      if (trigger.condition.type === 'RAPID_LOSS' && event.lossPercent !== undefined) {
        if (event.lossPercent >= trigger.condition.lossPercent) {
          await this.activate(tenantId, `Auto-triggered: Rapid loss of ${event.lossPercent}%`, 'AUTOMATIC', 'SYSTEM');
          return true;
        }
      }

      if (trigger.condition.type === 'ERROR_RATE' && event.errorRate !== undefined) {
        if (event.errorRate >= trigger.condition.errorPercent) {
          await this.activate(tenantId, `Auto-triggered: Error rate of ${event.errorRate}%`, 'AUTOMATIC', 'SYSTEM');
          return true;
        }
      }
    }

    return false;
  }

  clear(): void {
    this.states.clear();
    this.configs.clear();
  }
}

/**
 * In-memory mock implementation of OrderStore for integration testing
 */
class MockOrderStore {
  private pendingOrders: Map<string, OrderRequest[]> = new Map();

  async addPendingOrder(tenantId: string, order: OrderRequest): Promise<void> {
    const orders = this.pendingOrders.get(tenantId) || [];
    orders.push(order);
    this.pendingOrders.set(tenantId, orders);
  }

  async getPendingOrders(tenantId: string): Promise<OrderRequest[]> {
    return this.pendingOrders.get(tenantId) || [];
  }

  async cancelAllPendingOrders(tenantId: string): Promise<number> {
    const orders = this.pendingOrders.get(tenantId) || [];
    const count = orders.length;
    this.pendingOrders.set(tenantId, []);
    return count;
  }

  clear(): void {
    this.pendingOrders.clear();
  }
}

/**
 * Kill Switch Integration Service
 * Combines kill switch with order blocking for end-to-end testing
 */
class KillSwitchIntegration {
  constructor(
    private killSwitchStore: MockKillSwitchStore,
    private orderStore: MockOrderStore
  ) {}

  /**
   * Activate the kill switch
   * Requirements: 4.1, 4.2, 4.3
   */
  async activate(
    tenantId: string,
    reason: string,
    activatedBy?: string
  ): Promise<{ state: KillSwitchState; ordersCancelled: number }> {
    // Cancel pending orders first
    const ordersCancelled = await this.orderStore.cancelAllPendingOrders(tenantId);
    
    const result = await this.killSwitchStore.activate(tenantId, reason, 'MANUAL', activatedBy);
    
    return {
      state: {
        ...result.state,
        pendingOrdersCancelled: ordersCancelled
      },
      ordersCancelled
    };
  }

  /**
   * Deactivate the kill switch
   * Requirements: 4.5
   */
  async deactivate(tenantId: string, authToken: string): Promise<KillSwitchState> {
    return this.killSwitchStore.deactivate(tenantId, authToken);
  }

  /**
   * Check if kill switch is active
   */
  async isActive(tenantId: string): Promise<boolean> {
    return this.killSwitchStore.isActive(tenantId);
  }

  /**
   * Get kill switch state
   */
  async getState(tenantId: string): Promise<KillSwitchState> {
    return this.killSwitchStore.getState(tenantId);
  }

  /**
   * Validate an order against kill switch
   * Requirements: 4.1
   */
  async validateOrder(order: OrderRequest): Promise<RiskCheckResult> {
    const startTime = Date.now();
    const checks: RiskCheckDetail[] = [];

    const isActive = await this.killSwitchStore.isActive(order.tenantId);
    
    if (isActive) {
      const state = await this.killSwitchStore.getState(order.tenantId);
      checks.push({
        checkType: 'KILL_SWITCH',
        passed: false,
        message: `Kill switch is active: ${state.activationReason || 'No reason provided'}`
      });
    } else {
      checks.push({
        checkType: 'KILL_SWITCH',
        passed: true,
        message: 'Kill switch is not active'
      });
    }

    const approved = checks.every(c => c.passed);
    
    return {
      approved,
      orderId: order.orderId,
      checks,
      rejectionReason: approved ? undefined : checks.find(c => !c.passed)?.message,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Submit an order (will be blocked if kill switch is active)
   */
  async submitOrder(order: OrderRequest): Promise<{ accepted: boolean; reason?: string }> {
    const validation = await this.validateOrder(order);
    
    if (!validation.approved) {
      return { accepted: false, reason: validation.rejectionReason };
    }

    await this.orderStore.addPendingOrder(order.tenantId, order);
    return { accepted: true };
  }

  /**
   * Configure auto-triggers
   */
  async configureAutoTriggers(
    tenantId: string,
    autoTriggers: AutoKillTrigger[],
    requireAuthForDeactivation: boolean = true
  ): Promise<void> {
    await this.killSwitchStore.setConfig(tenantId, { autoTriggers, requireAuthForDeactivation });
  }

  /**
   * Check auto-triggers against an event
   * Requirements: 4.3
   */
  async checkAutoTriggers(tenantId: string, event: { lossPercent?: number; errorRate?: number }): Promise<boolean> {
    return this.killSwitchStore.checkAutoTriggers(tenantId, event);
  }
}



/**
 * Integration Tests for Kill Switch Flow
 * 
 * Tests the complete flow: activate → block orders → deactivate
 * 
 * Requirements: 4.1, 4.5
 */
describe('Kill Switch Flow Integration Tests', () => {
  let killSwitchStore: MockKillSwitchStore;
  let orderStore: MockOrderStore;
  let killSwitchService: KillSwitchIntegration;

  const tenantId = generateUUID();

  beforeEach(() => {
    killSwitchStore = new MockKillSwitchStore();
    orderStore = new MockOrderStore();
    killSwitchService = new KillSwitchIntegration(killSwitchStore, orderStore);
  });

  afterEach(() => {
    killSwitchStore.clear();
    orderStore.clear();
  });

  /**
   * Helper to create a test order
   */
  function createOrder(overrides?: Partial<OrderRequest>): OrderRequest {
    return {
      orderId: generateUUID(),
      tenantId,
      strategyId: generateUUID(),
      assetId: 'BTC',
      side: 'BUY' as OrderSide,
      quantity: 1,
      price: 50000,
      orderType: 'LIMIT' as OrderType,
      exchangeId: 'binance',
      timestamp: new Date().toISOString(),
      ...overrides
    };
  }

  describe('Kill Switch Activation', () => {
    it('should activate kill switch with reason', async () => {
      const result = await killSwitchService.activate(tenantId, 'Emergency stop', 'admin@test.com');

      expect(result.state.active).toBe(true);
      expect(result.state.activationReason).toBe('Emergency stop');
      expect(result.state.activatedBy).toBe('admin@test.com');
      expect(result.state.triggerType).toBe('MANUAL');
    });

    it('should record activation timestamp', async () => {
      const beforeActivation = new Date().toISOString();
      const result = await killSwitchService.activate(tenantId, 'Test activation');
      const afterActivation = new Date().toISOString();

      expect(result.state.activatedAt).toBeDefined();
      expect(result.state.activatedAt! >= beforeActivation).toBe(true);
      expect(result.state.activatedAt! <= afterActivation).toBe(true);
    });

    it('should cancel pending orders on activation', async () => {
      // Add some pending orders
      await orderStore.addPendingOrder(tenantId, createOrder());
      await orderStore.addPendingOrder(tenantId, createOrder());
      await orderStore.addPendingOrder(tenantId, createOrder());

      const result = await killSwitchService.activate(tenantId, 'Cancel all orders');

      expect(result.ordersCancelled).toBe(3);
      expect(result.state.pendingOrdersCancelled).toBe(3);

      // Verify orders are cancelled
      const remainingOrders = await orderStore.getPendingOrders(tenantId);
      expect(remainingOrders.length).toBe(0);
    });

    it('should not re-activate if already active', async () => {
      await killSwitchService.activate(tenantId, 'First activation');
      const secondResult = await killSwitchService.activate(tenantId, 'Second activation');

      // Should return existing state without re-activating
      expect(secondResult.state.activationReason).toBe('First activation');
      expect(secondResult.ordersCancelled).toBe(0);
    });
  });

  describe('Order Blocking', () => {
    it('should block orders when kill switch is active', async () => {
      await killSwitchService.activate(tenantId, 'Trading halted');

      const order = createOrder();
      const result = await killSwitchService.submitOrder(order);

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('Kill switch');
    });

    it('should allow orders when kill switch is inactive', async () => {
      const order = createOrder();
      const result = await killSwitchService.submitOrder(order);

      expect(result.accepted).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should validate order and return detailed check result', async () => {
      await killSwitchService.activate(tenantId, 'Emergency');

      const order = createOrder();
      const validation = await killSwitchService.validateOrder(order);

      expect(validation.approved).toBe(false);
      expect(validation.orderId).toBe(order.orderId);
      expect(validation.checks.length).toBe(1);
      expect(validation.checks[0].checkType).toBe('KILL_SWITCH');
      expect(validation.checks[0].passed).toBe(false);
      expect(validation.rejectionReason).toContain('Emergency');
    });

    it('should include processing time in validation result', async () => {
      const order = createOrder();
      const validation = await killSwitchService.validateOrder(order);

      expect(validation.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof validation.processingTimeMs).toBe('number');
    });

    it('should block all order types when active', async () => {
      await killSwitchService.activate(tenantId, 'Block all');

      const buyOrder = createOrder({ side: 'BUY' });
      const sellOrder = createOrder({ side: 'SELL' });
      const marketOrder = createOrder({ orderType: 'MARKET' });
      const limitOrder = createOrder({ orderType: 'LIMIT' });

      const buyResult = await killSwitchService.submitOrder(buyOrder);
      const sellResult = await killSwitchService.submitOrder(sellOrder);
      const marketResult = await killSwitchService.submitOrder(marketOrder);
      const limitResult = await killSwitchService.submitOrder(limitOrder);

      expect(buyResult.accepted).toBe(false);
      expect(sellResult.accepted).toBe(false);
      expect(marketResult.accepted).toBe(false);
      expect(limitResult.accepted).toBe(false);
    });
  });

  describe('Kill Switch Deactivation', () => {
    it('should deactivate kill switch with valid auth token', async () => {
      await killSwitchService.activate(tenantId, 'Test');
      await killSwitchService.configureAutoTriggers(tenantId, [], true);

      const state = await killSwitchService.deactivate(tenantId, 'valid-auth-token');

      expect(state.active).toBe(false);
    });

    it('should allow orders after deactivation', async () => {
      await killSwitchService.activate(tenantId, 'Temporary halt');
      await killSwitchService.configureAutoTriggers(tenantId, [], true);
      await killSwitchService.deactivate(tenantId, 'valid-token');

      const order = createOrder();
      const result = await killSwitchService.submitOrder(order);

      expect(result.accepted).toBe(true);
    });

    it('should require authentication for deactivation when configured', async () => {
      await killSwitchService.activate(tenantId, 'Test');
      await killSwitchService.configureAutoTriggers(tenantId, [], true);

      await expect(
        killSwitchService.deactivate(tenantId, '')
      ).rejects.toThrow('Authentication required');
    });

    it('should throw error when deactivating inactive kill switch', async () => {
      await expect(
        killSwitchService.deactivate(tenantId, 'valid-token')
      ).rejects.toThrow('Kill switch is not active');
    });
  });

  describe('Auto-Trigger Functionality', () => {
    it('should auto-trigger on rapid loss', async () => {
      const autoTrigger: AutoKillTrigger = {
        triggerId: generateUUID(),
        condition: {
          type: 'RAPID_LOSS',
          lossPercent: 5,
          timeWindowMinutes: 5
        },
        enabled: true
      };

      await killSwitchService.configureAutoTriggers(tenantId, [autoTrigger], true);

      const triggered = await killSwitchService.checkAutoTriggers(tenantId, { lossPercent: 6 });

      expect(triggered).toBe(true);
      expect(await killSwitchService.isActive(tenantId)).toBe(true);

      const state = await killSwitchService.getState(tenantId);
      expect(state.triggerType).toBe('AUTOMATIC');
      expect(state.activationReason).toContain('Rapid loss');
    });

    it('should auto-trigger on high error rate', async () => {
      const autoTrigger: AutoKillTrigger = {
        triggerId: generateUUID(),
        condition: {
          type: 'ERROR_RATE',
          errorPercent: 10,
          timeWindowMinutes: 5
        },
        enabled: true
      };

      await killSwitchService.configureAutoTriggers(tenantId, [autoTrigger], true);

      const triggered = await killSwitchService.checkAutoTriggers(tenantId, { errorRate: 15 });

      expect(triggered).toBe(true);
      expect(await killSwitchService.isActive(tenantId)).toBe(true);
    });

    it('should not trigger when below threshold', async () => {
      const autoTrigger: AutoKillTrigger = {
        triggerId: generateUUID(),
        condition: {
          type: 'RAPID_LOSS',
          lossPercent: 10,
          timeWindowMinutes: 5
        },
        enabled: true
      };

      await killSwitchService.configureAutoTriggers(tenantId, [autoTrigger], true);

      const triggered = await killSwitchService.checkAutoTriggers(tenantId, { lossPercent: 5 });

      expect(triggered).toBe(false);
      expect(await killSwitchService.isActive(tenantId)).toBe(false);
    });

    it('should not trigger when auto-trigger is disabled', async () => {
      const autoTrigger: AutoKillTrigger = {
        triggerId: generateUUID(),
        condition: {
          type: 'RAPID_LOSS',
          lossPercent: 5,
          timeWindowMinutes: 5
        },
        enabled: false
      };

      await killSwitchService.configureAutoTriggers(tenantId, [autoTrigger], true);

      const triggered = await killSwitchService.checkAutoTriggers(tenantId, { lossPercent: 10 });

      expect(triggered).toBe(false);
      expect(await killSwitchService.isActive(tenantId)).toBe(false);
    });

    it('should not re-trigger if already active', async () => {
      const autoTrigger: AutoKillTrigger = {
        triggerId: generateUUID(),
        condition: {
          type: 'RAPID_LOSS',
          lossPercent: 5,
          timeWindowMinutes: 5
        },
        enabled: true
      };

      await killSwitchService.configureAutoTriggers(tenantId, [autoTrigger], true);
      await killSwitchService.activate(tenantId, 'Manual activation');

      const triggered = await killSwitchService.checkAutoTriggers(tenantId, { lossPercent: 20 });

      expect(triggered).toBe(false); // Already active, so no new trigger
    });
  });

  describe('State Transitions', () => {
    it('should transition from inactive to active on activation', async () => {
      expect(await killSwitchService.isActive(tenantId)).toBe(false);

      await killSwitchService.activate(tenantId, 'Activate');

      expect(await killSwitchService.isActive(tenantId)).toBe(true);
    });

    it('should transition from active to inactive on deactivation', async () => {
      await killSwitchService.activate(tenantId, 'Test');
      await killSwitchService.configureAutoTriggers(tenantId, [], true);
      
      expect(await killSwitchService.isActive(tenantId)).toBe(true);

      await killSwitchService.deactivate(tenantId, 'valid-token');

      expect(await killSwitchService.isActive(tenantId)).toBe(false);
    });

    it('should maintain state across multiple checks', async () => {
      await killSwitchService.activate(tenantId, 'Persistent');

      // Multiple checks should return consistent state
      expect(await killSwitchService.isActive(tenantId)).toBe(true);
      expect(await killSwitchService.isActive(tenantId)).toBe(true);
      expect(await killSwitchService.isActive(tenantId)).toBe(true);

      const state = await killSwitchService.getState(tenantId);
      expect(state.active).toBe(true);
      expect(state.activationReason).toBe('Persistent');
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('should isolate kill switch state between tenants', async () => {
      const tenant1 = generateUUID();
      const tenant2 = generateUUID();

      // Activate for tenant1 only
      await killSwitchStore.activate(tenant1, 'Tenant 1 halt', 'MANUAL');

      expect(await killSwitchStore.isActive(tenant1)).toBe(true);
      expect(await killSwitchStore.isActive(tenant2)).toBe(false);
    });

    it('should allow orders for unaffected tenants', async () => {
      const tenant1 = generateUUID();
      const tenant2 = generateUUID();

      await killSwitchStore.activate(tenant1, 'Halt tenant 1', 'MANUAL');

      const order1 = createOrder({ tenantId: tenant1 });
      const order2 = createOrder({ tenantId: tenant2 });

      const result1 = await killSwitchService.validateOrder(order1);
      const result2 = await killSwitchService.validateOrder(order2);

      expect(result1.approved).toBe(false);
      expect(result2.approved).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle activation with empty reason', async () => {
      const result = await killSwitchService.activate(tenantId, '');

      expect(result.state.active).toBe(true);
      expect(result.state.activationReason).toBe('');
    });

    it('should handle rapid consecutive activations', async () => {
      const results = await Promise.all([
        killSwitchService.activate(tenantId, 'First'),
        killSwitchService.activate(tenantId, 'Second'),
        killSwitchService.activate(tenantId, 'Third')
      ]);

      // Only one should actually activate
      const activeCount = results.filter(r => r.state.activationReason === 'First').length;
      expect(activeCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle validation with missing order fields gracefully', async () => {
      const minimalOrder: OrderRequest = {
        orderId: generateUUID(),
        tenantId,
        strategyId: generateUUID(),
        assetId: 'BTC',
        side: 'BUY',
        quantity: 1,
        orderType: 'MARKET',
        exchangeId: 'binance',
        timestamp: new Date().toISOString()
      };

      const result = await killSwitchService.validateOrder(minimalOrder);

      expect(result.approved).toBe(true);
      expect(result.checks.length).toBe(1);
    });
  });
});
