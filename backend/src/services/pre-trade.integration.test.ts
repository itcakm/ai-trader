/**
 * Pre-Trade Flow Integration Tests
 * 
 * Tests the complete pre-trade validation flow:
 * order → pre-trade checks → approve/reject
 * 
 * Requirements: 6.1
 */

import { OrderRequest, OrderSide, OrderType } from '../types/order';
import { RiskCheckResult, RiskCheckDetail, RiskCheckType } from '../types/risk-engine';
import { PositionLimit, LimitScope, LimitType, LimitCheckResult } from '../types/position-limit';
import { DrawdownState, DrawdownStatus, DrawdownCheckResult } from '../types/drawdown';
import { VolatilityState, VolatilityLevel, ThrottleCheckResult } from '../types/volatility';
import { KillSwitchState, KillSwitchScopeType, KillTriggerType } from '../types/kill-switch';
import { CircuitBreaker, CircuitBreakerState, CircuitBreakerCheckResult, TradingContext } from '../types/circuit-breaker';

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
 * In-memory mock implementation of KillSwitchStore
 */
class MockKillSwitchStore {
  private states: Map<string, KillSwitchState> = new Map();

  async getState(tenantId: string): Promise<KillSwitchState> {
    return this.states.get(tenantId) || {
      tenantId,
      active: false,
      triggerType: 'MANUAL' as KillTriggerType,
      scope: 'TENANT' as KillSwitchScopeType,
      pendingOrdersCancelled: 0
    };
  }

  async activate(tenantId: string, reason: string): Promise<KillSwitchState> {
    const state: KillSwitchState = {
      tenantId,
      active: true,
      activatedAt: new Date().toISOString(),
      activationReason: reason,
      triggerType: 'MANUAL',
      scope: 'TENANT',
      pendingOrdersCancelled: 0
    };
    this.states.set(tenantId, state);
    return state;
  }

  async deactivate(tenantId: string): Promise<KillSwitchState> {
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

  clear(): void {
    this.states.clear();
  }
}

/**
 * In-memory mock implementation of CircuitBreakerStore
 */
class MockCircuitBreakerStore {
  private breakers: Map<string, CircuitBreaker[]> = new Map();

  async getBreakers(tenantId: string): Promise<CircuitBreaker[]> {
    return this.breakers.get(tenantId) || [];
  }

  async addBreaker(tenantId: string, breaker: CircuitBreaker): Promise<void> {
    const existing = this.breakers.get(tenantId) || [];
    existing.push(breaker);
    this.breakers.set(tenantId, existing);
  }

  async tripBreaker(tenantId: string, breakerId: string): Promise<void> {
    const breakers = this.breakers.get(tenantId) || [];
    const breaker = breakers.find(b => b.breakerId === breakerId);
    if (breaker) {
      breaker.state = 'OPEN';
      breaker.tripCount++;
      breaker.lastTrippedAt = new Date().toISOString();
    }
  }

  async resetBreaker(tenantId: string, breakerId: string): Promise<void> {
    const breakers = this.breakers.get(tenantId) || [];
    const breaker = breakers.find(b => b.breakerId === breakerId);
    if (breaker) {
      breaker.state = 'CLOSED';
    }
  }

  async checkBreakers(tenantId: string, context: TradingContext): Promise<CircuitBreakerCheckResult> {
    const breakers = await this.getBreakers(tenantId);
    const openBreakers = breakers.filter(b => b.state === 'OPEN');
    const halfOpenBreakers = breakers.filter(b => b.state === 'HALF_OPEN');
    return {
      allClosed: openBreakers.length === 0 && halfOpenBreakers.length === 0,
      openBreakers,
      halfOpenBreakers
    };
  }

  clear(): void {
    this.breakers.clear();
  }
}

/**
 * In-memory mock implementation of PositionLimitStore
 */
class MockPositionLimitStore {
  private limits: Map<string, PositionLimit[]> = new Map();

  async getLimits(tenantId: string): Promise<PositionLimit[]> {
    return this.limits.get(tenantId) || [];
  }

  async addLimit(tenantId: string, limit: PositionLimit): Promise<void> {
    const existing = this.limits.get(tenantId) || [];
    existing.push(limit);
    this.limits.set(tenantId, existing);
  }

  async checkOrderAgainstLimits(
    tenantId: string,
    order: OrderRequest,
    currentPositions: Map<string, number>,
    portfolioValue?: number
  ): Promise<LimitCheckResult[]> {
    const limits = await this.getLimits(tenantId);
    const results: LimitCheckResult[] = [];

    for (const limit of limits) {
      const currentValue = currentPositions.get(order.assetId) || 0;
      const orderValue = order.side === 'BUY' ? order.quantity : -order.quantity;
      const newValue = currentValue + orderValue;

      let effectiveMax = limit.maxValue;
      if (limit.limitType === 'PERCENTAGE' && portfolioValue) {
        effectiveMax = (limit.maxValue / 100) * portfolioValue;
      }

      const withinLimit = newValue <= effectiveMax;
      results.push({
        withinLimit,
        currentValue: newValue,
        maxValue: effectiveMax,
        remainingCapacity: Math.max(0, effectiveMax - newValue),
        wouldExceedBy: withinLimit ? undefined : newValue - effectiveMax
      });
    }

    // If no limits configured, return a passing result
    if (results.length === 0) {
      results.push({
        withinLimit: true,
        currentValue: 0,
        maxValue: Infinity,
        remainingCapacity: Infinity
      });
    }

    return results;
  }

  clear(): void {
    this.limits.clear();
  }
}

/**
 * In-memory mock implementation of DrawdownStore
 */
class MockDrawdownStore {
  private states: Map<string, DrawdownState> = new Map();

  private getKey(tenantId: string, strategyId?: string): string {
    return strategyId ? `${tenantId}:${strategyId}` : tenantId;
  }

  async getState(tenantId: string, strategyId?: string): Promise<DrawdownState | null> {
    return this.states.get(this.getKey(tenantId, strategyId)) || null;
  }

  async setState(state: DrawdownState): Promise<void> {
    const key = this.getKey(state.tenantId, state.strategyId);
    this.states.set(key, state);
  }

  async checkDrawdown(tenantId: string, strategyId?: string): Promise<DrawdownCheckResult> {
    const state = await this.getState(tenantId, strategyId);
    if (!state) {
      return {
        status: 'NORMAL',
        currentDrawdownPercent: 0,
        distanceToWarning: 5,
        distanceToMax: 10,
        tradingAllowed: true
      };
    }

    const tradingAllowed = state.status !== 'PAUSED' && state.status !== 'CRITICAL';
    return {
      status: state.status,
      currentDrawdownPercent: state.drawdownPercent,
      distanceToWarning: Math.max(0, state.warningThreshold - state.drawdownPercent),
      distanceToMax: Math.max(0, state.maxThreshold - state.drawdownPercent),
      tradingAllowed
    };
  }

  clear(): void {
    this.states.clear();
  }
}

/**
 * In-memory mock implementation of VolatilityStore
 */
class MockVolatilityStore {
  private states: Map<string, VolatilityState> = new Map();

  async getState(assetId: string): Promise<VolatilityState | null> {
    return this.states.get(assetId) || null;
  }

  async setState(state: VolatilityState): Promise<void> {
    this.states.set(state.assetId, state);
  }

  async checkThrottle(tenantId: string, assetId: string): Promise<ThrottleCheckResult> {
    const state = await this.getState(assetId);
    if (!state) {
      return {
        level: 'NORMAL',
        throttlePercent: 0,
        allowNewEntries: true
      };
    }

    return {
      level: state.level,
      throttlePercent: state.throttlePercent,
      allowNewEntries: state.allowNewEntries
    };
  }

  clear(): void {
    this.states.clear();
  }
}

/**
 * Pre-Trade Checker Integration Service
 * Combines all risk checks for end-to-end testing
 */
class PreTradeCheckerIntegration {
  constructor(
    private killSwitchStore: MockKillSwitchStore,
    private circuitBreakerStore: MockCircuitBreakerStore,
    private positionLimitStore: MockPositionLimitStore,
    private drawdownStore: MockDrawdownStore,
    private volatilityStore: MockVolatilityStore
  ) {}

  /**
   * Validate an order against all risk rules
   * Requirements: 6.1, 6.2, 6.5
   */
  async validate(
    order: OrderRequest,
    config?: {
      portfolioValue?: number;
      availableCapital?: number;
      maxLeverage?: number;
      currentPositions?: Map<string, number>;
    }
  ): Promise<RiskCheckResult> {
    const startTime = Date.now();
    const checks: RiskCheckDetail[] = [];
    const timestamp = new Date().toISOString();

    // 1. Check Kill Switch
    const killSwitchCheck = await this.checkKillSwitch(order.tenantId);
    checks.push(killSwitchCheck);

    // 2. Check Circuit Breakers
    const circuitBreakerCheck = await this.checkCircuitBreakers(order);
    checks.push(circuitBreakerCheck);

    // 3. Check Position Limits
    const positionLimitCheck = await this.checkPositionLimits(order, config);
    checks.push(positionLimitCheck);

    // 4. Check Drawdown
    const drawdownCheck = await this.checkDrawdown(order);
    checks.push(drawdownCheck);

    // 5. Check Volatility
    const volatilityCheck = await this.checkVolatility(order);
    checks.push(volatilityCheck);

    // 6. Check Capital
    const capitalCheck = this.checkCapital(order, config);
    checks.push(capitalCheck);

    // 7. Check Leverage
    const leverageCheck = this.checkLeverage(order, config);
    checks.push(leverageCheck);

    const processingTimeMs = Date.now() - startTime;
    const failedChecks = checks.filter(c => !c.passed);
    const approved = failedChecks.length === 0;

    return {
      approved,
      orderId: order.orderId,
      checks,
      rejectionReason: approved ? undefined : this.buildRejectionReason(failedChecks),
      processingTimeMs,
      timestamp
    };
  }

  private async checkKillSwitch(tenantId: string): Promise<RiskCheckDetail> {
    const isActive = await this.killSwitchStore.isActive(tenantId);
    if (isActive) {
      const state = await this.killSwitchStore.getState(tenantId);
      return {
        checkType: 'KILL_SWITCH',
        passed: false,
        message: `Kill switch is active: ${state.activationReason || 'No reason provided'}`
      };
    }
    return {
      checkType: 'KILL_SWITCH',
      passed: true,
      message: 'Kill switch is not active'
    };
  }

  private async checkCircuitBreakers(order: OrderRequest): Promise<RiskCheckDetail> {
    const result = await this.circuitBreakerStore.checkBreakers(order.tenantId, {
      strategyId: order.strategyId,
      assetId: order.assetId
    });

    if (!result.allClosed) {
      const openNames = result.openBreakers.map(b => b.name).join(', ');
      return {
        checkType: 'CIRCUIT_BREAKER',
        passed: false,
        message: `Circuit breakers triggered: ${openNames}`,
        currentValue: result.openBreakers.length,
        limitValue: 0
      };
    }
    return {
      checkType: 'CIRCUIT_BREAKER',
      passed: true,
      message: 'All circuit breakers are closed'
    };
  }

  private async checkPositionLimits(
    order: OrderRequest,
    config?: { portfolioValue?: number; currentPositions?: Map<string, number> }
  ): Promise<RiskCheckDetail> {
    const results = await this.positionLimitStore.checkOrderAgainstLimits(
      order.tenantId,
      order,
      config?.currentPositions || new Map(),
      config?.portfolioValue
    );

    const exceeded = results.filter(r => !r.withinLimit);
    if (exceeded.length > 0) {
      const first = exceeded[0];
      return {
        checkType: 'POSITION_LIMIT',
        passed: false,
        message: `Position limit exceeded: current ${first.currentValue}, max ${first.maxValue}`,
        currentValue: first.currentValue,
        limitValue: first.maxValue
      };
    }

    const first = results[0];
    return {
      checkType: 'POSITION_LIMIT',
      passed: true,
      message: `Position within limits: ${first.currentValue} / ${first.maxValue}`,
      currentValue: first.currentValue,
      limitValue: first.maxValue
    };
  }

  private async checkDrawdown(order: OrderRequest): Promise<RiskCheckDetail> {
    const result = await this.drawdownStore.checkDrawdown(order.tenantId, order.strategyId);

    if (!result.tradingAllowed) {
      return {
        checkType: 'DRAWDOWN',
        passed: false,
        message: `Trading paused due to drawdown: ${result.status} (${result.currentDrawdownPercent.toFixed(2)}%)`,
        currentValue: result.currentDrawdownPercent,
        limitValue: result.distanceToMax + result.currentDrawdownPercent
      };
    }

    return {
      checkType: 'DRAWDOWN',
      passed: true,
      message: `Drawdown within limits: ${result.currentDrawdownPercent.toFixed(2)}%`,
      currentValue: result.currentDrawdownPercent,
      limitValue: result.distanceToMax + result.currentDrawdownPercent
    };
  }

  private async checkVolatility(order: OrderRequest): Promise<RiskCheckDetail> {
    const result = await this.volatilityStore.checkThrottle(order.tenantId, order.assetId);

    if (order.side === 'BUY' && !result.allowNewEntries) {
      return {
        checkType: 'VOLATILITY',
        passed: false,
        message: `New entries blocked due to ${result.level} volatility`,
        currentValue: result.throttlePercent,
        limitValue: 100
      };
    }

    return {
      checkType: 'VOLATILITY',
      passed: true,
      message: `Volatility level: ${result.level}`,
      currentValue: result.throttlePercent,
      limitValue: 100
    };
  }

  private checkCapital(
    order: OrderRequest,
    config?: { availableCapital?: number }
  ): RiskCheckDetail {
    if (!config?.availableCapital) {
      return {
        checkType: 'CAPITAL_AVAILABLE',
        passed: true,
        message: 'Capital check skipped'
      };
    }

    const orderValue = order.quantity * (order.price || 0);
    if (order.side === 'BUY' && orderValue > config.availableCapital) {
      return {
        checkType: 'CAPITAL_AVAILABLE',
        passed: false,
        message: `Insufficient capital: order ${orderValue}, available ${config.availableCapital}`,
        currentValue: orderValue,
        limitValue: config.availableCapital
      };
    }

    return {
      checkType: 'CAPITAL_AVAILABLE',
      passed: true,
      message: `Capital available: ${config.availableCapital}`,
      currentValue: orderValue,
      limitValue: config.availableCapital
    };
  }

  private checkLeverage(
    order: OrderRequest,
    config?: { maxLeverage?: number; portfolioValue?: number }
  ): RiskCheckDetail {
    if (!config?.maxLeverage || !config?.portfolioValue) {
      return {
        checkType: 'LEVERAGE',
        passed: true,
        message: 'Leverage check skipped'
      };
    }

    const orderValue = order.quantity * (order.price || 0);
    const leverage = orderValue / config.portfolioValue;

    if (leverage > config.maxLeverage) {
      return {
        checkType: 'LEVERAGE',
        passed: false,
        message: `Leverage exceeded: ${leverage.toFixed(2)}x > max ${config.maxLeverage}x`,
        currentValue: leverage,
        limitValue: config.maxLeverage
      };
    }

    return {
      checkType: 'LEVERAGE',
      passed: true,
      message: `Leverage within limits: ${leverage.toFixed(2)}x`,
      currentValue: leverage,
      limitValue: config.maxLeverage
    };
  }

  private buildRejectionReason(failedChecks: RiskCheckDetail[]): string {
    if (failedChecks.length === 1) {
      return failedChecks[0].message;
    }
    const reasons = failedChecks.map(c => `${c.checkType}: ${c.message}`);
    return `Multiple checks failed: ${reasons.join('; ')}`;
  }
}



/**
 * Integration Tests for Pre-Trade Flow
 * 
 * Tests the complete flow: order → pre-trade checks → approve/reject
 * 
 * Requirements: 6.1
 */
describe('Pre-Trade Flow Integration Tests', () => {
  let killSwitchStore: MockKillSwitchStore;
  let circuitBreakerStore: MockCircuitBreakerStore;
  let positionLimitStore: MockPositionLimitStore;
  let drawdownStore: MockDrawdownStore;
  let volatilityStore: MockVolatilityStore;
  let preTradeChecker: PreTradeCheckerIntegration;

  const tenantId = generateUUID();
  const strategyId = generateUUID();

  beforeEach(() => {
    killSwitchStore = new MockKillSwitchStore();
    circuitBreakerStore = new MockCircuitBreakerStore();
    positionLimitStore = new MockPositionLimitStore();
    drawdownStore = new MockDrawdownStore();
    volatilityStore = new MockVolatilityStore();
    preTradeChecker = new PreTradeCheckerIntegration(
      killSwitchStore,
      circuitBreakerStore,
      positionLimitStore,
      drawdownStore,
      volatilityStore
    );
  });

  afterEach(() => {
    killSwitchStore.clear();
    circuitBreakerStore.clear();
    positionLimitStore.clear();
    drawdownStore.clear();
    volatilityStore.clear();
  });

  /**
   * Helper to create a test order
   */
  function createOrder(overrides?: Partial<OrderRequest>): OrderRequest {
    return {
      orderId: generateUUID(),
      tenantId,
      strategyId,
      assetId: 'BTC',
      side: 'BUY',
      quantity: 1,
      price: 50000,
      orderType: 'LIMIT',
      exchangeId: 'binance',
      timestamp: new Date().toISOString(),
      ...overrides
    };
  }

  describe('Complete Pre-Trade Flow', () => {
    it('should approve order when all checks pass', async () => {
      const order = createOrder();

      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(true);
      expect(result.orderId).toBe(order.orderId);
      expect(result.rejectionReason).toBeUndefined();
      expect(result.checks.length).toBeGreaterThanOrEqual(7);
      expect(result.checks.every(c => c.passed)).toBe(true);
    });

    it('should reject order when kill switch is active', async () => {
      // Activate kill switch
      await killSwitchStore.activate(tenantId, 'Emergency stop');

      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(false);
      expect(result.rejectionReason).toContain('Kill switch');
      
      const killSwitchCheck = result.checks.find(c => c.checkType === 'KILL_SWITCH');
      expect(killSwitchCheck?.passed).toBe(false);
    });

    it('should reject order when circuit breaker is open', async () => {
      // Add an open circuit breaker
      await circuitBreakerStore.addBreaker(tenantId, {
        breakerId: generateUUID(),
        tenantId,
        name: 'Loss Rate Breaker',
        condition: { type: 'LOSS_RATE', lossPercent: 10, timeWindowMinutes: 5 },
        scope: 'PORTFOLIO',
        state: 'OPEN',
        tripCount: 1,
        lastTrippedAt: new Date().toISOString(),
        cooldownMinutes: 5,
        autoResetEnabled: true
      });

      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(false);
      expect(result.rejectionReason).toContain('Circuit breaker');
      
      const cbCheck = result.checks.find(c => c.checkType === 'CIRCUIT_BREAKER');
      expect(cbCheck?.passed).toBe(false);
    });

    it('should reject order when position limit is exceeded', async () => {
      // Add a position limit
      await positionLimitStore.addLimit(tenantId, {
        limitId: generateUUID(),
        tenantId,
        scope: 'ASSET',
        assetId: 'BTC',
        limitType: 'ABSOLUTE',
        maxValue: 0.5, // Max 0.5 BTC
        currentValue: 0,
        utilizationPercent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Order for 1 BTC exceeds limit
      const order = createOrder({ quantity: 1 });
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(false);
      
      const positionCheck = result.checks.find(c => c.checkType === 'POSITION_LIMIT');
      expect(positionCheck?.passed).toBe(false);
      expect(positionCheck?.currentValue).toBe(1);
      expect(positionCheck?.limitValue).toBe(0.5);
    });

    it('should reject order when drawdown threshold is breached', async () => {
      // Set drawdown state to PAUSED
      await drawdownStore.setState({
        stateId: generateUUID(),
        tenantId,
        strategyId,
        scope: 'STRATEGY',
        peakValue: 100000,
        currentValue: 85000,
        drawdownPercent: 15,
        drawdownAbsolute: 15000,
        warningThreshold: 5,
        maxThreshold: 10,
        status: 'PAUSED',
        lastResetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(false);
      
      const drawdownCheck = result.checks.find(c => c.checkType === 'DRAWDOWN');
      expect(drawdownCheck?.passed).toBe(false);
      expect(drawdownCheck?.message).toContain('PAUSED');
    });

    it('should reject BUY order when volatility blocks new entries', async () => {
      // Set extreme volatility
      await volatilityStore.setState({
        stateId: generateUUID(),
        assetId: 'BTC',
        currentIndex: 95,
        indexType: 'ATR',
        level: 'EXTREME',
        throttlePercent: 100,
        allowNewEntries: false,
        updatedAt: new Date().toISOString()
      });

      const order = createOrder({ side: 'BUY' });
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(false);
      
      const volatilityCheck = result.checks.find(c => c.checkType === 'VOLATILITY');
      expect(volatilityCheck?.passed).toBe(false);
      expect(volatilityCheck?.message).toContain('EXTREME');
    });

    it('should allow SELL order even when volatility blocks new entries', async () => {
      // Set extreme volatility
      await volatilityStore.setState({
        stateId: generateUUID(),
        assetId: 'BTC',
        currentIndex: 95,
        indexType: 'ATR',
        level: 'EXTREME',
        throttlePercent: 100,
        allowNewEntries: false,
        updatedAt: new Date().toISOString()
      });

      const order = createOrder({ side: 'SELL' });
      const result = await preTradeChecker.validate(order);

      // SELL orders should be allowed (exits are permitted)
      const volatilityCheck = result.checks.find(c => c.checkType === 'VOLATILITY');
      expect(volatilityCheck?.passed).toBe(true);
    });

    it('should reject order when insufficient capital', async () => {
      const order = createOrder({ quantity: 10, price: 50000 }); // 500,000 order value
      
      const result = await preTradeChecker.validate(order, {
        availableCapital: 100000 // Only 100,000 available
      });

      expect(result.approved).toBe(false);
      
      const capitalCheck = result.checks.find(c => c.checkType === 'CAPITAL_AVAILABLE');
      expect(capitalCheck?.passed).toBe(false);
      expect(capitalCheck?.currentValue).toBe(500000);
      expect(capitalCheck?.limitValue).toBe(100000);
    });

    it('should reject order when leverage exceeded', async () => {
      const order = createOrder({ quantity: 10, price: 50000 }); // 500,000 order value
      
      const result = await preTradeChecker.validate(order, {
        portfolioValue: 100000,
        maxLeverage: 3 // Max 3x leverage
      });

      expect(result.approved).toBe(false);
      
      const leverageCheck = result.checks.find(c => c.checkType === 'LEVERAGE');
      expect(leverageCheck?.passed).toBe(false);
      expect(leverageCheck?.currentValue).toBe(5); // 500k / 100k = 5x
      expect(leverageCheck?.limitValue).toBe(3);
    });
  });

  describe('Multiple Failure Scenarios', () => {
    it('should report all failed checks when multiple conditions fail', async () => {
      // Activate kill switch
      await killSwitchStore.activate(tenantId, 'Emergency');

      // Add open circuit breaker
      await circuitBreakerStore.addBreaker(tenantId, {
        breakerId: generateUUID(),
        tenantId,
        name: 'Test Breaker',
        condition: { type: 'LOSS_RATE', lossPercent: 10, timeWindowMinutes: 5 },
        scope: 'PORTFOLIO',
        state: 'OPEN',
        tripCount: 1,
        cooldownMinutes: 5,
        autoResetEnabled: true
      });

      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(false);
      
      const failedChecks = result.checks.filter(c => !c.passed);
      expect(failedChecks.length).toBeGreaterThanOrEqual(2);
      expect(result.rejectionReason).toContain('Multiple checks failed');
    });
  });

  describe('State Transitions', () => {
    it('should approve order after kill switch is deactivated', async () => {
      // Activate then deactivate kill switch
      await killSwitchStore.activate(tenantId, 'Test');
      await killSwitchStore.deactivate(tenantId);

      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(true);
    });

    it('should approve order after circuit breaker is reset', async () => {
      const breakerId = generateUUID();
      
      // Add and trip circuit breaker
      await circuitBreakerStore.addBreaker(tenantId, {
        breakerId,
        tenantId,
        name: 'Test Breaker',
        condition: { type: 'LOSS_RATE', lossPercent: 10, timeWindowMinutes: 5 },
        scope: 'PORTFOLIO',
        state: 'CLOSED',
        tripCount: 0,
        cooldownMinutes: 5,
        autoResetEnabled: true
      });
      await circuitBreakerStore.tripBreaker(tenantId, breakerId);

      // Verify rejection
      let order = createOrder();
      let result = await preTradeChecker.validate(order);
      expect(result.approved).toBe(false);

      // Reset breaker
      await circuitBreakerStore.resetBreaker(tenantId, breakerId);

      // Verify approval
      order = createOrder();
      result = await preTradeChecker.validate(order);
      expect(result.approved).toBe(true);
    });
  });

  describe('Processing Time and Metadata', () => {
    it('should include processing time in result', async () => {
      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('should include timestamp in result', async () => {
      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should include order ID in result', async () => {
      const order = createOrder();
      const result = await preTradeChecker.validate(order);

      expect(result.orderId).toBe(order.orderId);
    });
  });

  describe('Edge Cases', () => {
    it('should handle order with no price (market order)', async () => {
      const order = createOrder({ price: undefined, orderType: 'MARKET' });
      const result = await preTradeChecker.validate(order);

      expect(result.approved).toBe(true);
    });

    it('should handle SELL order with position limits', async () => {
      // Add a position limit
      await positionLimitStore.addLimit(tenantId, {
        limitId: generateUUID(),
        tenantId,
        scope: 'ASSET',
        assetId: 'BTC',
        limitType: 'ABSOLUTE',
        maxValue: 10,
        currentValue: 5,
        utilizationPercent: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // SELL order should reduce position
      const order = createOrder({ side: 'SELL', quantity: 2 });
      const result = await preTradeChecker.validate(order, {
        currentPositions: new Map([['BTC', 5]])
      });

      // Position after sell: 5 - 2 = 3, which is within limit of 10
      const positionCheck = result.checks.find(c => c.checkType === 'POSITION_LIMIT');
      expect(positionCheck?.passed).toBe(true);
    });

    it('should handle percentage-based position limits', async () => {
      // Add a percentage-based position limit (max 10% of portfolio)
      // With portfolio value of 100000 and 10% limit, max position quantity is 10000
      await positionLimitStore.addLimit(tenantId, {
        limitId: generateUUID(),
        tenantId,
        scope: 'ASSET',
        assetId: 'BTC',
        limitType: 'PERCENTAGE',
        maxValue: 10, // 10% of portfolio
        currentValue: 0,
        utilizationPercent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Portfolio value = 100000
      // 10% of 100000 = 10000 max position quantity
      // Order for 15000 BTC exceeds the 10000 limit
      const order = createOrder({ quantity: 15000 });
      const result = await preTradeChecker.validate(order, {
        portfolioValue: 100000
      });

      expect(result.approved).toBe(false);
      
      const positionCheck = result.checks.find(c => c.checkType === 'POSITION_LIMIT');
      expect(positionCheck?.passed).toBe(false);
    });
  });
});
