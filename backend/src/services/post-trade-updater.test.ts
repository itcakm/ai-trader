import * as fc from 'fast-check';
import { PostTradeUpdaterService, clearRecentPnL, clearPortfolioValues } from './post-trade-updater';
import { PositionTracker, clearPositions } from './position-tracker';
import { DrawdownService } from './drawdown';
import { CircuitBreakerService } from './circuit-breaker';
import { KillSwitchService } from './kill-switch';
import { ExecutionReport, PostTradeResult } from '../types/order';
import { RiskEvent, RiskEventInput } from '../types/risk-event';
import { DrawdownState } from '../types/drawdown';
import {
  executionReportArb,
  executionReportSequenceArb,
  cryptoSymbolArb,
  isoDateStringArb
} from '../test/generators';

// Mock dependent services
jest.mock('./drawdown');
jest.mock('./circuit-breaker');
jest.mock('./kill-switch');
jest.mock('../repositories/position-limit');

const mockDrawdownService = DrawdownService as jest.Mocked<typeof DrawdownService>;
const mockCircuitBreakerService = CircuitBreakerService as jest.Mocked<typeof CircuitBreakerService>;
const mockKillSwitchService = KillSwitchService as jest.Mocked<typeof KillSwitchService>;

describe('PostTradeUpdaterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPositions();
    clearRecentPnL();
    clearPortfolioValues();
    
    // Setup default mocks
    mockDrawdownService.monitorAndUpdate.mockResolvedValue({
      state: {
        stateId: 'state-1',
        tenantId: 'tenant-1',
        strategyId: 'strategy-1',
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
      },
      alertSent: false
    });
    
    mockCircuitBreakerService.recordEvent.mockResolvedValue();
    mockCircuitBreakerService.checkBreakers.mockResolvedValue({
      allClosed: true,
      openBreakers: [],
      halfOpenBreakers: []
    });
    
    mockKillSwitchService.checkAutoTriggers.mockResolvedValue(false);
  });

  afterEach(() => {
    clearPositions();
    clearRecentPnL();
    clearPortfolioValues();
  });

  /**
   * Property 16: Post-Trade State Updates
   * 
   * For any executed trade, the post-trade processor SHALL update: position size, 
   * realized P&L, drawdown state, and exposure metrics, AND if any threshold is 
   * breached, appropriate protective actions SHALL be triggered.
   * 
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  describe('Property 16: Post-Trade State Updates', () => {
    it('updates position size for any executed trade', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb(),
          async (execution: ExecutionReport) => {
            // Clear state before each test
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            // Setup mocks
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId: execution.tenantId,
                strategyId: execution.strategyId,
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
              },
              alertSent: false
            });

            const result = await PostTradeUpdaterService.processExecution(execution);

            // Position should be updated
            expect(result.positionUpdated).toBe(true);
            
            // Position size should reflect the trade
            if (execution.side === 'BUY') {
              expect(result.newPositionSize).toBe(execution.executedQuantity);
            } else {
              expect(result.newPositionSize).toBe(-execution.executedQuantity);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculates realized P&L for any executed trade', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb(),
          async (execution: ExecutionReport) => {
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId: execution.tenantId,
                strategyId: execution.strategyId,
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
              },
              alertSent: false
            });

            const result = await PostTradeUpdaterService.processExecution(execution);

            // Realized P&L should be calculated
            expect(typeof result.realizedPnL).toBe('number');
            expect(Number.isFinite(result.realizedPnL)).toBe(true);
            
            // For BUY orders, realized P&L is just negative commission
            if (execution.side === 'BUY') {
              expect(result.realizedPnL).toBe(-execution.commission);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('updates drawdown state for any executed trade', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb(),
          async (execution: ExecutionReport) => {
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId: execution.tenantId,
                strategyId: execution.strategyId,
                scope: 'STRATEGY',
                peakValue: 100000,
                currentValue: 95000,
                drawdownPercent: 5,
                drawdownAbsolute: 5000,
                warningThreshold: 5,
                maxThreshold: 10,
                status: 'WARNING',
                lastResetAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              },
              alertSent: false
            });

            const result = await PostTradeUpdaterService.processExecution(execution);

            // Drawdown should be updated
            expect(result.drawdownUpdated).toBe(true);
            expect(typeof result.newDrawdownPercent).toBe('number');
            
            // Verify drawdown service was called
            expect(mockDrawdownService.monitorAndUpdate).toHaveBeenCalledWith(
              execution.tenantId,
              execution.strategyId,
              expect.any(Number)
            );
          }
        ),
        { numRuns: 100 }
      );
    });


    it('triggers protective actions when drawdown threshold is breached', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb(),
          fc.double({ min: 10, max: 50, noNaN: true }),
          async (execution: ExecutionReport, drawdownPercent: number) => {
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            // Setup mock to simulate drawdown breach
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId: execution.tenantId,
                strategyId: execution.strategyId,
                scope: 'STRATEGY',
                peakValue: 100000,
                currentValue: 100000 * (1 - drawdownPercent / 100),
                drawdownPercent,
                drawdownAbsolute: 100000 * drawdownPercent / 100,
                warningThreshold: 5,
                maxThreshold: 10,
                status: drawdownPercent >= 10 ? 'CRITICAL' : 'WARNING',
                lastResetAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              },
              alertSent: true,
              alertType: drawdownPercent >= 10 ? 'CRITICAL' : 'WARNING',
              actionTaken: drawdownPercent >= 10 ? 'PAUSED' : undefined
            });

            const riskEvents: RiskEvent[] = [];
            const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
              const event: RiskEvent = {
                eventId: 'event-' + riskEvents.length,
                ...input,
                metadata: input.metadata || {},
                timestamp: new Date().toISOString()
              };
              riskEvents.push(event);
              return event;
            };

            const result = await PostTradeUpdaterService.processExecution(
              execution,
              { enableProtectiveActions: true },
              riskEventCallback
            );

            // Risk events should be triggered for threshold breach
            expect(result.riskEventsTriggered.length).toBeGreaterThan(0);
            
            // Event should be drawdown related
            const drawdownEvent = result.riskEventsTriggered.find(
              e => e.eventType === 'DRAWDOWN_WARNING' || e.eventType === 'DRAWDOWN_BREACH'
            );
            expect(drawdownEvent).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('triggers circuit breaker check after trade execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb(),
          async (execution: ExecutionReport) => {
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId: execution.tenantId,
                strategyId: execution.strategyId,
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
              },
              alertSent: false
            });

            await PostTradeUpdaterService.processExecution(execution);

            // Circuit breaker service should be called to record event
            expect(mockCircuitBreakerService.recordEvent).toHaveBeenCalledWith(
              execution.tenantId,
              expect.objectContaining({
                eventType: 'TRADE',
                strategyId: execution.strategyId,
                assetId: execution.assetId,
                success: true
              })
            );

            // Circuit breaker check should be performed
            expect(mockCircuitBreakerService.checkBreakers).toHaveBeenCalledWith(
              execution.tenantId,
              expect.objectContaining({
                strategyId: execution.strategyId,
                assetId: execution.assetId
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('triggers kill switch check when rapid loss threshold is exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb().filter(e => e.side === 'SELL'),
          fc.double({ min: 6, max: 20, noNaN: true }), // Loss percent above threshold
          async (execution: ExecutionReport, lossPercent: number) => {
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            // Set initial portfolio value
            const portfolioValue = 100000;
            PostTradeUpdaterService.setPortfolioValue(execution.tenantId, portfolioValue);
            
            // Pre-record a significant loss to trigger the rapid loss check
            const lossAmount = portfolioValue * (lossPercent / 100);
            PostTradeUpdaterService['recordPnL'](
              execution.tenantId, 
              execution.strategyId, 
              -lossAmount
            );
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId: execution.tenantId,
                strategyId: execution.strategyId,
                scope: 'STRATEGY',
                peakValue: portfolioValue,
                currentValue: portfolioValue - lossAmount,
                drawdownPercent: lossPercent,
                drawdownAbsolute: lossAmount,
                warningThreshold: 5,
                maxThreshold: 10,
                status: 'CRITICAL',
                lastResetAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              },
              alertSent: true,
              alertType: 'CRITICAL'
            });

            await PostTradeUpdaterService.processExecution(
              execution,
              { 
                enableProtectiveActions: true,
                rapidLossThreshold: 5,
                rapidLossTimeWindowMinutes: 5
              }
            );

            // Kill switch auto-trigger check should be called when loss exceeds threshold
            expect(mockKillSwitchService.checkAutoTriggers).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('accumulates position correctly for sequence of trades', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportSequenceArb(),
          async ({ tenantId, assetId, strategyId, executions }) => {
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
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
              },
              alertSent: false
            });

            // Process all executions
            let lastResult: PostTradeResult | null = null;
            for (const execution of executions) {
              lastResult = await PostTradeUpdaterService.processExecution(execution);
            }

            // Calculate expected position
            const expectedPosition = executions.reduce((pos, exec) => {
              return exec.side === 'BUY' 
                ? pos + exec.executedQuantity 
                : pos - exec.executedQuantity;
            }, 0);

            // Final position should match expected
            expect(lastResult?.newPositionSize).toBeCloseTo(expectedPosition, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns all required fields in PostTradeResult', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb(),
          async (execution: ExecutionReport) => {
            clearPositions();
            clearRecentPnL();
            clearPortfolioValues();
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId: execution.tenantId,
                strategyId: execution.strategyId,
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
              },
              alertSent: false
            });

            const result = await PostTradeUpdaterService.processExecution(execution);

            // All required fields should be present
            expect(result).toHaveProperty('positionUpdated');
            expect(result).toHaveProperty('newPositionSize');
            expect(result).toHaveProperty('realizedPnL');
            expect(result).toHaveProperty('drawdownUpdated');
            expect(result).toHaveProperty('newDrawdownPercent');
            expect(result).toHaveProperty('riskEventsTriggered');
            
            // Types should be correct
            expect(typeof result.positionUpdated).toBe('boolean');
            expect(typeof result.newPositionSize).toBe('number');
            expect(typeof result.realizedPnL).toBe('number');
            expect(typeof result.drawdownUpdated).toBe('boolean');
            expect(typeof result.newDrawdownPercent).toBe('number');
            expect(Array.isArray(result.riskEventsTriggered)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  /**
   * Property 17: Position Reconciliation
   * 
   * For any position reconciliation that reveals a discrepancy between internal 
   * state and exchange data, the system SHALL use exchange data as the source 
   * of truth, AND an alert SHALL be generated.
   * 
   * **Validates: Requirements 7.5**
   */
  describe('Property 17: Position Reconciliation', () => {
    it('uses exchange data as source of truth when discrepancy exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          fc.double({ min: 100, max: 10000, noNaN: true }),
          async (tenantId, assetId, internalQty, exchangeQty, price) => {
            // Ensure there's a meaningful discrepancy
            fc.pre(Math.abs(internalQty - exchangeQty) > 0.001);
            
            clearPositions();
            
            // Setup internal position by processing a trade
            const execution: ExecutionReport = {
              executionId: 'exec-1',
              orderId: 'order-1',
              tenantId,
              strategyId: 'strategy-1',
              assetId,
              side: 'BUY',
              executedQuantity: internalQty,
              executedPrice: price,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId,
                strategyId: 'strategy-1',
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
              },
              alertSent: false
            });
            
            // Process execution to create internal position
            await PostTradeUpdaterService.processExecution(execution, { enableProtectiveActions: false });
            
            // Reconcile with different exchange data
            const exchangeData = {
              assetId,
              quantity: exchangeQty,
              averagePrice: price,
              timestamp: new Date().toISOString()
            };
            
            const result = await PostTradeUpdaterService.reconcilePosition(
              tenantId,
              assetId,
              exchangeData
            );
            
            // Should detect discrepancy
            expect(result.discrepancy).toBeGreaterThan(0);
            expect(result.reconciled).toBe(true);
            
            // Exchange position should be recorded
            expect(result.exchangePosition).toBe(exchangeQty);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('generates alert when discrepancy is detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          async (tenantId, assetId, internalQty, exchangeQty) => {
            // Ensure there's a meaningful discrepancy
            fc.pre(Math.abs(internalQty - exchangeQty) > 0.001);
            
            clearPositions();
            
            // Setup internal position
            const execution: ExecutionReport = {
              executionId: 'exec-1',
              orderId: 'order-1',
              tenantId,
              strategyId: 'strategy-1',
              assetId,
              side: 'BUY',
              executedQuantity: internalQty,
              executedPrice: 100,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            
            mockDrawdownService.monitorAndUpdate.mockResolvedValue({
              state: {
                stateId: 'state-1',
                tenantId,
                strategyId: 'strategy-1',
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
              },
              alertSent: false
            });
            
            await PostTradeUpdaterService.processExecution(execution, { enableProtectiveActions: false });
            
            // Track alerts
            const alerts: RiskEventInput[] = [];
            const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
              alerts.push(input);
              return {
                eventId: 'event-' + alerts.length,
                ...input,
                metadata: input.metadata || {},
                timestamp: new Date().toISOString()
              };
            };
            
            // Reconcile with different exchange data
            const exchangeData = {
              assetId,
              quantity: exchangeQty,
              averagePrice: 100,
              timestamp: new Date().toISOString()
            };
            
            const result = await PostTradeUpdaterService.reconcilePosition(
              tenantId,
              assetId,
              exchangeData,
              riskEventCallback
            );
            
            // Alert should be generated
            expect(result.alertGenerated).toBe(true);
            expect(alerts.length).toBe(1);
            expect(alerts[0].eventType).toBe('EXCHANGE_ERROR');
            expect(alerts[0].severity).toBe('WARNING');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not generate alert when positions match', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          async (tenantId, assetId) => {
            clearPositions();
            
            // Track alerts
            const alerts: RiskEventInput[] = [];
            const riskEventCallback = async (input: RiskEventInput): Promise<RiskEvent> => {
              alerts.push(input);
              return {
                eventId: 'event-' + alerts.length,
                ...input,
                metadata: input.metadata || {},
                timestamp: new Date().toISOString()
              };
            };
            
            // Reconcile with exchange data when no internal position exists
            // Both should be 0, so no discrepancy
            const exchangeData = {
              assetId,
              quantity: 0, // No position on exchange either
              averagePrice: 100,
              timestamp: new Date().toISOString()
            };
            
            const result = await PostTradeUpdaterService.reconcilePosition(
              tenantId,
              assetId,
              exchangeData,
              riskEventCallback
            );
            
            // No alert should be generated when both are 0
            expect(result.alertGenerated).toBe(false);
            expect(result.reconciled).toBe(false);
            expect(alerts.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('includes discrepancy details in reconciliation result', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          async (tenantId, assetId, internalQty, exchangeQty) => {
            clearPositions();
            
            // Reconcile with exchange data (no internal position exists)
            const exchangeData = {
              assetId,
              quantity: exchangeQty,
              averagePrice: 100,
              timestamp: new Date().toISOString()
            };
            
            const result = await PostTradeUpdaterService.reconcilePosition(
              tenantId,
              assetId,
              exchangeData
            );
            
            // Result should include all required fields
            expect(result).toHaveProperty('assetId');
            expect(result).toHaveProperty('internalPosition');
            expect(result).toHaveProperty('exchangePosition');
            expect(result).toHaveProperty('discrepancy');
            expect(result).toHaveProperty('reconciled');
            expect(result).toHaveProperty('alertGenerated');
            
            // Values should be correct
            expect(result.assetId).toBe(assetId);
            expect(result.internalPosition).toBe(0); // No internal position
            expect(result.exchangePosition).toBe(exchangeQty);
            expect(result.discrepancy).toBeCloseTo(exchangeQty, 5); // Discrepancy is the full exchange qty
          }
        ),
        { numRuns: 100 }
      );
    });

    it('handles batch reconciliation for multiple assets', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.record({
              assetId: cryptoSymbolArb(),
              quantity: fc.double({ min: 1, max: 1000, noNaN: true }),
              averagePrice: fc.double({ min: 10, max: 10000, noNaN: true }),
              timestamp: isoDateStringArb()
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (tenantId, exchangePositions) => {
            clearPositions();
            
            // Batch reconcile
            const results = await PostTradeUpdaterService.batchReconcile(
              tenantId,
              exchangePositions
            );
            
            // Should return result for each position
            expect(results.length).toBe(exchangePositions.length);
            
            // Each result should have required fields
            for (let i = 0; i < results.length; i++) {
              expect(results[i].assetId).toBe(exchangePositions[i].assetId);
              expect(results[i].exchangePosition).toBe(exchangePositions[i].quantity);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
