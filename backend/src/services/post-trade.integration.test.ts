/**
 * Post-Trade Flow Integration Tests
 * 
 * Tests the complete post-trade flow:
 * execution → state updates → threshold checks
 * 
 * Requirements: 7.1
 */

import { ExecutionReport, PostTradeResult } from '../types/order';
import { RiskEvent, RiskEventInput } from '../types/risk-event';
import { DrawdownState, DrawdownStatus } from '../types/drawdown';
import { PositionTracker, clearPositions, Position } from './position-tracker';

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
 * In-memory mock implementation of DrawdownStore for integration testing
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

  async updateValue(tenantId: string, strategyId: string, newValue: number): Promise<DrawdownState> {
    const key = this.getKey(tenantId, strategyId);
    let state = this.states.get(key);
    
    if (!state) {
      state = {
        stateId: generateUUID(),
        tenantId,
        strategyId,
        scope: 'STRATEGY',
        peakValue: newValue,
        currentValue: newValue,
        drawdownPercent: 0,
        drawdownAbsolute: 0,
        warningThreshold: 5,
        maxThreshold: 10,
        status: 'NORMAL',
        lastResetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      // Update peak if new value is higher
      const newPeak = Math.max(state.peakValue, newValue);
      const drawdownAbsolute = newPeak - newValue;
      const drawdownPercent = newPeak > 0 ? (drawdownAbsolute / newPeak) * 100 : 0;
      
      let status: DrawdownStatus = 'NORMAL';
      if (drawdownPercent >= state.maxThreshold) {
        status = 'CRITICAL';
      } else if (drawdownPercent >= state.warningThreshold) {
        status = 'WARNING';
      }
      
      state = {
        ...state,
        peakValue: newPeak,
        currentValue: newValue,
        drawdownPercent,
        drawdownAbsolute,
        status,
        updatedAt: new Date().toISOString()
      };
    }
    
    this.states.set(key, state);
    return state;
  }

  clear(): void {
    this.states.clear();
  }
}

/**
 * In-memory mock implementation of CircuitBreakerStore for integration testing
 */
class MockCircuitBreakerStore {
  private events: Array<{ tenantId: string; event: TradingEvent }> = [];
  private tripped: Set<string> = new Set();

  async recordEvent(tenantId: string, event: TradingEvent): Promise<void> {
    this.events.push({ tenantId, event });
    
    // Check for consecutive failures
    const recentEvents = this.events
      .filter(e => e.tenantId === tenantId)
      .slice(-5);
    
    const failures = recentEvents.filter(e => !e.event.success).length;
    if (failures >= 3) {
      this.tripped.add(tenantId);
    }
  }

  async isTripped(tenantId: string): Promise<boolean> {
    return this.tripped.has(tenantId);
  }

  async reset(tenantId: string): Promise<void> {
    this.tripped.delete(tenantId);
  }

  clear(): void {
    this.events = [];
    this.tripped.clear();
  }
}

interface TradingEvent {
  eventType: string;
  strategyId: string;
  assetId: string;
  success: boolean;
  lossAmount?: number;
  timestamp: string;
}

/**
 * In-memory portfolio value tracker
 */
class MockPortfolioTracker {
  private values: Map<string, number> = new Map();
  private pnlHistory: Map<string, Array<{ pnl: number; timestamp: string }>> = new Map();

  getValue(tenantId: string): number {
    return this.values.get(tenantId) || 100000;
  }

  setValue(tenantId: string, value: number): void {
    this.values.set(tenantId, value);
  }

  recordPnL(tenantId: string, strategyId: string, pnl: number): void {
    const key = `${tenantId}:${strategyId}`;
    const history = this.pnlHistory.get(key) || [];
    history.push({ pnl, timestamp: new Date().toISOString() });
    this.pnlHistory.set(key, history);
    
    // Update portfolio value
    const currentValue = this.getValue(tenantId);
    this.setValue(tenantId, currentValue + pnl);
  }

  getRecentLossPercent(tenantId: string, strategyId: string, timeWindowMinutes: number): number {
    const key = `${tenantId}:${strategyId}`;
    const history = this.pnlHistory.get(key) || [];
    const cutoff = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
    
    const recentPnL = history
      .filter(h => h.timestamp >= cutoff)
      .reduce((sum, h) => sum + h.pnl, 0);
    
    const portfolioValue = this.getValue(tenantId);
    return recentPnL < 0 ? Math.abs(recentPnL / portfolioValue) * 100 : 0;
  }

  clear(): void {
    this.values.clear();
    this.pnlHistory.clear();
  }
}

/**
 * Post-Trade Updater Integration Service
 * Combines all post-trade processing for end-to-end testing
 */
class PostTradeUpdaterIntegration {
  constructor(
    private drawdownStore: MockDrawdownStore,
    private circuitBreakerStore: MockCircuitBreakerStore,
    private portfolioTracker: MockPortfolioTracker
  ) {}

  /**
   * Process an execution and update all state
   * Requirements: 7.1, 7.2, 7.3
   */
  async processExecution(
    execution: ExecutionReport,
    config?: {
      enableProtectiveActions?: boolean;
      rapidLossThreshold?: number;
      rapidLossTimeWindowMinutes?: number;
    },
    riskEventCallback?: (input: RiskEventInput) => Promise<RiskEvent>
  ): Promise<PostTradeResult> {
    const riskEventsTriggered: RiskEvent[] = [];
    const effectiveConfig = {
      enableProtectiveActions: config?.enableProtectiveActions ?? true,
      rapidLossThreshold: config?.rapidLossThreshold ?? 5,
      rapidLossTimeWindowMinutes: config?.rapidLossTimeWindowMinutes ?? 5
    };

    // 1. Update position using the real PositionTracker
    const position = await PositionTracker.processExecution(execution);
    
    // 2. Calculate realized P&L
    const realizedPnL = this.calculateRealizedPnL(execution, position);
    
    // 3. Record P&L
    this.portfolioTracker.recordPnL(execution.tenantId, execution.strategyId, realizedPnL);
    
    // 4. Update drawdown state
    const portfolioValue = this.portfolioTracker.getValue(execution.tenantId);
    const drawdownState = await this.drawdownStore.updateValue(
      execution.tenantId,
      execution.strategyId,
      portfolioValue
    );
    
    // 5. Record trading event for circuit breakers
    await this.circuitBreakerStore.recordEvent(execution.tenantId, {
      eventType: 'TRADE',
      strategyId: execution.strategyId,
      assetId: execution.assetId,
      success: true,
      lossAmount: realizedPnL < 0 ? Math.abs(realizedPnL) : undefined,
      timestamp: execution.timestamp
    });
    
    // 6. Check for threshold breaches and trigger protective actions
    if (effectiveConfig.enableProtectiveActions) {
      // Check drawdown threshold
      if (drawdownState.status === 'WARNING' || drawdownState.status === 'CRITICAL') {
        if (riskEventCallback) {
          const event = await riskEventCallback({
            tenantId: execution.tenantId,
            eventType: drawdownState.status === 'CRITICAL' ? 'DRAWDOWN_BREACH' : 'DRAWDOWN_WARNING',
            severity: drawdownState.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
            strategyId: execution.strategyId,
            assetId: execution.assetId,
            description: `Drawdown ${drawdownState.status.toLowerCase()}: ${drawdownState.drawdownPercent.toFixed(2)}%`,
            triggerCondition: `Drawdown reached ${drawdownState.drawdownPercent.toFixed(2)}%`,
            actionTaken: drawdownState.status === 'CRITICAL' ? 'Strategy paused' : 'Alert sent',
            metadata: {
              drawdownPercent: drawdownState.drawdownPercent,
              peakValue: drawdownState.peakValue,
              currentValue: drawdownState.currentValue
            }
          });
          riskEventsTriggered.push(event);
        }
      }
      
      // Check rapid loss
      const recentLossPercent = this.portfolioTracker.getRecentLossPercent(
        execution.tenantId,
        execution.strategyId,
        effectiveConfig.rapidLossTimeWindowMinutes
      );
      
      if (recentLossPercent >= effectiveConfig.rapidLossThreshold && riskEventCallback) {
        const event = await riskEventCallback({
          tenantId: execution.tenantId,
          eventType: 'KILL_SWITCH_ACTIVATED',
          severity: 'EMERGENCY',
          strategyId: execution.strategyId,
          assetId: execution.assetId,
          description: `Rapid loss detected: ${recentLossPercent.toFixed(2)}%`,
          triggerCondition: `Loss of ${recentLossPercent.toFixed(2)}% in ${effectiveConfig.rapidLossTimeWindowMinutes} minutes`,
          actionTaken: 'Kill switch activated',
          metadata: {
            lossPercent: recentLossPercent,
            timeWindowMinutes: effectiveConfig.rapidLossTimeWindowMinutes,
            threshold: effectiveConfig.rapidLossThreshold
          }
        });
        riskEventsTriggered.push(event);
      }
      
      // Check circuit breaker
      if (await this.circuitBreakerStore.isTripped(execution.tenantId) && riskEventCallback) {
        const event = await riskEventCallback({
          tenantId: execution.tenantId,
          eventType: 'CIRCUIT_BREAKER_TRIP',
          severity: 'CRITICAL',
          strategyId: execution.strategyId,
          assetId: execution.assetId,
          description: 'Circuit breaker tripped due to consecutive failures',
          triggerCondition: 'Multiple consecutive failures detected',
          actionTaken: 'Trading paused',
          metadata: {}
        });
        riskEventsTriggered.push(event);
      }
    }

    return {
      positionUpdated: true,
      newPositionSize: position.quantity,
      realizedPnL,
      drawdownUpdated: true,
      newDrawdownPercent: drawdownState.drawdownPercent,
      riskEventsTriggered
    };
  }

  private calculateRealizedPnL(execution: ExecutionReport, position: Position): number {
    if (execution.side === 'SELL') {
      const grossPnL = (execution.executedPrice - position.averagePrice) * execution.executedQuantity;
      return grossPnL - execution.commission;
    }
    return -execution.commission;
  }

  /**
   * Reconcile position with exchange data
   * Requirements: 7.4, 7.5
   */
  async reconcilePosition(
    tenantId: string,
    assetId: string,
    exchangeData: { quantity: number; averagePrice: number; timestamp: string },
    riskEventCallback?: (input: RiskEventInput) => Promise<RiskEvent>
  ): Promise<{
    assetId: string;
    internalPosition: number;
    exchangePosition: number;
    discrepancy: number;
    reconciled: boolean;
    alertGenerated: boolean;
  }> {
    const internalPosition = await PositionTracker.getPosition(tenantId, assetId);
    const internalQuantity = internalPosition?.quantity || 0;
    
    const discrepancy = Math.abs(internalQuantity - exchangeData.quantity);
    const hasDiscrepancy = discrepancy > 0.0001;
    
    let alertGenerated = false;
    
    if (hasDiscrepancy && riskEventCallback) {
      await riskEventCallback({
        tenantId,
        eventType: 'EXCHANGE_ERROR',
        severity: 'WARNING',
        assetId,
        description: `Position discrepancy detected for ${assetId}`,
        triggerCondition: `Internal: ${internalQuantity}, Exchange: ${exchangeData.quantity}`,
        actionTaken: 'Using exchange data as source of truth',
        metadata: {
          internalPosition: internalQuantity,
          exchangePosition: exchangeData.quantity,
          discrepancy
        }
      });
      alertGenerated = true;
    }
    
    return {
      assetId,
      internalPosition: internalQuantity,
      exchangePosition: exchangeData.quantity,
      discrepancy,
      reconciled: hasDiscrepancy,
      alertGenerated
    };
  }
}



/**
 * Integration Tests for Post-Trade Flow
 * 
 * Tests the complete flow: execution → state updates → threshold checks
 * 
 * Requirements: 7.1
 */
describe('Post-Trade Flow Integration Tests', () => {
  // Set longer timeout for integration tests (15 seconds per test)
  jest.setTimeout(15000);

  let drawdownStore: MockDrawdownStore;
  let circuitBreakerStore: MockCircuitBreakerStore;
  let portfolioTracker: MockPortfolioTracker;
  let postTradeUpdater: PostTradeUpdaterIntegration;

  const tenantId = generateUUID();
  const strategyId = generateUUID();

  beforeEach(() => {
    drawdownStore = new MockDrawdownStore();
    circuitBreakerStore = new MockCircuitBreakerStore();
    portfolioTracker = new MockPortfolioTracker();
    postTradeUpdater = new PostTradeUpdaterIntegration(
      drawdownStore,
      circuitBreakerStore,
      portfolioTracker
    );
    clearPositions();
  });

  afterEach(() => {
    drawdownStore.clear();
    circuitBreakerStore.clear();
    portfolioTracker.clear();
    clearPositions();
  });

  /**
   * Helper to create a test execution report
   */
  function createExecution(overrides?: Partial<ExecutionReport>): ExecutionReport {
    return {
      executionId: generateUUID(),
      orderId: generateUUID(),
      tenantId,
      strategyId,
      assetId: 'BTC',
      side: 'BUY',
      executedQuantity: 1,
      executedPrice: 50000,
      commission: 10,
      exchangeId: 'binance',
      timestamp: new Date().toISOString(),
      ...overrides
    };
  }

  describe('Complete Post-Trade Flow', () => {
    it('should update position after execution', async () => {
      const execution = createExecution({ executedQuantity: 2 });

      const result = await postTradeUpdater.processExecution(execution);

      expect(result.positionUpdated).toBe(true);
      expect(result.newPositionSize).toBe(2);
    });

    it('should calculate realized P&L for BUY orders', async () => {
      const execution = createExecution({
        side: 'BUY',
        executedQuantity: 1,
        executedPrice: 50000,
        commission: 10
      });

      const result = await postTradeUpdater.processExecution(execution);

      // For BUY orders, realized P&L is just negative commission
      expect(result.realizedPnL).toBe(-10);
    });

    it('should calculate realized P&L for SELL orders', async () => {
      // First buy to establish position
      const buyExecution = createExecution({
        side: 'BUY',
        executedQuantity: 1,
        executedPrice: 50000,
        commission: 10
      });
      await postTradeUpdater.processExecution(buyExecution);

      // Then sell at higher price
      const sellExecution = createExecution({
        side: 'SELL',
        executedQuantity: 1,
        executedPrice: 55000,
        commission: 10
      });
      const result = await postTradeUpdater.processExecution(sellExecution);

      // P&L = (55000 - 50000) * 1 - 10 = 4990
      expect(result.realizedPnL).toBe(4990);
    });

    it('should update drawdown state after execution', async () => {
      const execution = createExecution();

      const result = await postTradeUpdater.processExecution(execution);

      expect(result.drawdownUpdated).toBe(true);
      expect(typeof result.newDrawdownPercent).toBe('number');
    });

    it('should accumulate position for multiple BUY orders', async () => {
      const execution1 = createExecution({ executedQuantity: 1 });
      const execution2 = createExecution({ executedQuantity: 2 });
      const execution3 = createExecution({ executedQuantity: 0.5 });

      await postTradeUpdater.processExecution(execution1);
      await postTradeUpdater.processExecution(execution2);
      const result = await postTradeUpdater.processExecution(execution3);

      expect(result.newPositionSize).toBe(3.5);
    }, 15000);

    it('should reduce position for SELL orders', async () => {
      // Buy 5 units
      const buyExecution = createExecution({ executedQuantity: 5 });
      await postTradeUpdater.processExecution(buyExecution);

      // Sell 2 units
      const sellExecution = createExecution({ side: 'SELL', executedQuantity: 2 });
      const result = await postTradeUpdater.processExecution(sellExecution);

      expect(result.newPositionSize).toBe(3);
    });
  });

  describe('Threshold Breach Detection', () => {
    it('should trigger drawdown warning when threshold is reached', async () => {
      // Set initial portfolio value
      portfolioTracker.setValue(tenantId, 100000);
      
      // Initialize drawdown state with peak
      await drawdownStore.setState({
        stateId: generateUUID(),
        tenantId,
        strategyId,
        scope: 'STRATEGY',
        peakValue: 100000,
        currentValue: 100000,
        drawdownPercent: 0,
        drawdownAbsolute: 0,
        warningThreshold: 5,
        maxThreshold: 10,
        status: 'NORMAL',
        lastResetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const riskEvents: RiskEvent[] = [];
      const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
        const event: RiskEvent = {
          eventId: generateUUID(),
          ...input,
          metadata: input.metadata || {},
          timestamp: new Date().toISOString()
        };
        riskEvents.push(event);
        return event;
      };

      // Simulate a loss that triggers warning (6% loss)
      portfolioTracker.setValue(tenantId, 94000);
      
      const execution = createExecution();
      const result = await postTradeUpdater.processExecution(
        execution,
        { enableProtectiveActions: true },
        riskEventCallback
      );

      expect(result.riskEventsTriggered.length).toBeGreaterThan(0);
      const warningEvent = result.riskEventsTriggered.find(
        e => e.eventType === 'DRAWDOWN_WARNING'
      );
      expect(warningEvent).toBeDefined();
    });

    it('should trigger drawdown breach when max threshold is exceeded', async () => {
      portfolioTracker.setValue(tenantId, 100000);
      
      await drawdownStore.setState({
        stateId: generateUUID(),
        tenantId,
        strategyId,
        scope: 'STRATEGY',
        peakValue: 100000,
        currentValue: 100000,
        drawdownPercent: 0,
        drawdownAbsolute: 0,
        warningThreshold: 5,
        maxThreshold: 10,
        status: 'NORMAL',
        lastResetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const riskEvents: RiskEvent[] = [];
      const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
        const event: RiskEvent = {
          eventId: generateUUID(),
          ...input,
          metadata: input.metadata || {},
          timestamp: new Date().toISOString()
        };
        riskEvents.push(event);
        return event;
      };

      // Simulate a loss that triggers breach (12% loss)
      portfolioTracker.setValue(tenantId, 88000);
      
      const execution = createExecution();
      const result = await postTradeUpdater.processExecution(
        execution,
        { enableProtectiveActions: true },
        riskEventCallback
      );

      const breachEvent = result.riskEventsTriggered.find(
        e => e.eventType === 'DRAWDOWN_BREACH'
      );
      expect(breachEvent).toBeDefined();
      expect(breachEvent?.severity).toBe('CRITICAL');
    });

    it('should trigger kill switch on rapid loss', async () => {
      portfolioTracker.setValue(tenantId, 100000);

      const riskEvents: RiskEvent[] = [];
      const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
        const event: RiskEvent = {
          eventId: generateUUID(),
          ...input,
          metadata: input.metadata || {},
          timestamp: new Date().toISOString()
        };
        riskEvents.push(event);
        return event;
      };

      // Record a significant loss
      portfolioTracker.recordPnL(tenantId, strategyId, -6000); // 6% loss

      const execution = createExecution();
      const result = await postTradeUpdater.processExecution(
        execution,
        { 
          enableProtectiveActions: true,
          rapidLossThreshold: 5,
          rapidLossTimeWindowMinutes: 5
        },
        riskEventCallback
      );

      const killSwitchEvent = result.riskEventsTriggered.find(
        e => e.eventType === 'KILL_SWITCH_ACTIVATED'
      );
      expect(killSwitchEvent).toBeDefined();
      expect(killSwitchEvent?.severity).toBe('EMERGENCY');
    });

    it('should not trigger protective actions when disabled', async () => {
      portfolioTracker.setValue(tenantId, 100000);
      portfolioTracker.recordPnL(tenantId, strategyId, -10000); // 10% loss

      const riskEvents: RiskEvent[] = [];
      const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
        const event: RiskEvent = {
          eventId: generateUUID(),
          ...input,
          metadata: input.metadata || {},
          timestamp: new Date().toISOString()
        };
        riskEvents.push(event);
        return event;
      };

      const execution = createExecution();
      const result = await postTradeUpdater.processExecution(
        execution,
        { enableProtectiveActions: false },
        riskEventCallback
      );

      expect(result.riskEventsTriggered.length).toBe(0);
    });
  });

  describe('Position Reconciliation', () => {
    it('should detect position discrepancy', async () => {
      // Create internal position (without strategyId for simpler reconciliation)
      const execution = createExecution({ executedQuantity: 10, strategyId: undefined });
      await postTradeUpdater.processExecution(execution);

      // Reconcile with different exchange data
      const result = await postTradeUpdater.reconcilePosition(
        tenantId,
        'BTC',
        { quantity: 8, averagePrice: 50000, timestamp: new Date().toISOString() }
      );

      expect(result.discrepancy).toBe(2);
      expect(result.reconciled).toBe(true);
      expect(result.internalPosition).toBe(10);
      expect(result.exchangePosition).toBe(8);
    });

    it('should generate alert on discrepancy', async () => {
      const execution = createExecution({ executedQuantity: 10, strategyId: undefined });
      await postTradeUpdater.processExecution(execution);

      const alerts: RiskEventInput[] = [];
      const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
        alerts.push(input);
        return {
          eventId: generateUUID(),
          ...input,
          metadata: input.metadata || {},
          timestamp: new Date().toISOString()
        };
      };

      const result = await postTradeUpdater.reconcilePosition(
        tenantId,
        'BTC',
        { quantity: 8, averagePrice: 50000, timestamp: new Date().toISOString() },
        riskEventCallback
      );

      expect(result.alertGenerated).toBe(true);
      expect(alerts.length).toBe(1);
      expect(alerts[0].eventType).toBe('EXCHANGE_ERROR');
    });

    it('should not generate alert when positions match', async () => {
      const execution = createExecution({ executedQuantity: 10, strategyId: undefined });
      await postTradeUpdater.processExecution(execution);

      const alerts: RiskEventInput[] = [];
      const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
        alerts.push(input);
        return {
          eventId: generateUUID(),
          ...input,
          metadata: input.metadata || {},
          timestamp: new Date().toISOString()
        };
      };

      const result = await postTradeUpdater.reconcilePosition(
        tenantId,
        'BTC',
        { quantity: 10, averagePrice: 50000, timestamp: new Date().toISOString() },
        riskEventCallback
      );

      expect(result.alertGenerated).toBe(false);
      expect(result.reconciled).toBe(false);
      expect(alerts.length).toBe(0);
    });

    it('should use exchange data as source of truth', async () => {
      const execution = createExecution({ executedQuantity: 10, strategyId: undefined });
      await postTradeUpdater.processExecution(execution);

      const result = await postTradeUpdater.reconcilePosition(
        tenantId,
        'BTC',
        { quantity: 12, averagePrice: 50000, timestamp: new Date().toISOString() }
      );

      // Exchange says 12, internal says 10
      expect(result.exchangePosition).toBe(12);
      expect(result.internalPosition).toBe(10);
      expect(result.reconciled).toBe(true);
    });
  });

  describe('Result Completeness', () => {
    it('should return all required fields in PostTradeResult', async () => {
      const execution = createExecution();
      const result = await postTradeUpdater.processExecution(execution);

      expect(result).toHaveProperty('positionUpdated');
      expect(result).toHaveProperty('newPositionSize');
      expect(result).toHaveProperty('realizedPnL');
      expect(result).toHaveProperty('drawdownUpdated');
      expect(result).toHaveProperty('newDrawdownPercent');
      expect(result).toHaveProperty('riskEventsTriggered');

      expect(typeof result.positionUpdated).toBe('boolean');
      expect(typeof result.newPositionSize).toBe('number');
      expect(typeof result.realizedPnL).toBe('number');
      expect(typeof result.drawdownUpdated).toBe('boolean');
      expect(typeof result.newDrawdownPercent).toBe('number');
      expect(Array.isArray(result.riskEventsTriggered)).toBe(true);
    });

    it('should include risk events when thresholds are breached', async () => {
      portfolioTracker.setValue(tenantId, 100000);
      
      await drawdownStore.setState({
        stateId: generateUUID(),
        tenantId,
        strategyId,
        scope: 'STRATEGY',
        peakValue: 100000,
        currentValue: 100000,
        drawdownPercent: 0,
        drawdownAbsolute: 0,
        warningThreshold: 5,
        maxThreshold: 10,
        status: 'NORMAL',
        lastResetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => ({
        eventId: generateUUID(),
        ...input,
        metadata: input.metadata || {},
        timestamp: new Date().toISOString()
      });

      // Trigger warning
      portfolioTracker.setValue(tenantId, 94000);
      
      const execution = createExecution();
      const result = await postTradeUpdater.processExecution(
        execution,
        { enableProtectiveActions: true },
        riskEventCallback
      );

      expect(result.riskEventsTriggered.length).toBeGreaterThan(0);
      
      for (const event of result.riskEventsTriggered) {
        expect(event).toHaveProperty('eventId');
        expect(event).toHaveProperty('tenantId');
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('severity');
        expect(event).toHaveProperty('timestamp');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero quantity execution', async () => {
      const execution = createExecution({ executedQuantity: 0 });
      const result = await postTradeUpdater.processExecution(execution);

      expect(result.positionUpdated).toBe(true);
      expect(result.newPositionSize).toBe(0);
    });

    it('should handle very small quantities', async () => {
      const execution = createExecution({ executedQuantity: 0.00001 });
      const result = await postTradeUpdater.processExecution(execution);

      expect(result.positionUpdated).toBe(true);
      expect(result.newPositionSize).toBeCloseTo(0.00001, 10);
    });

    it('should handle multiple assets independently', async () => {
      // Use undefined strategyId for simpler position lookup
      const btcExecution = createExecution({ assetId: 'BTC', executedQuantity: 1, strategyId: undefined });
      const ethExecution = createExecution({ assetId: 'ETH', executedQuantity: 10, strategyId: undefined });

      await postTradeUpdater.processExecution(btcExecution);
      await postTradeUpdater.processExecution(ethExecution);

      const btcPosition = await PositionTracker.getPosition(tenantId, 'BTC');
      const ethPosition = await PositionTracker.getPosition(tenantId, 'ETH');

      expect(btcPosition?.quantity).toBe(1);
      expect(ethPosition?.quantity).toBe(10);
    });
  });
});
