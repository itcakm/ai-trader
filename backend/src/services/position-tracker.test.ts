import * as fc from 'fast-check';
import { PositionTracker, clearPositions, Position } from './position-tracker';
import { PositionLimitRepository } from '../repositories/position-limit';
import { ExecutionReport } from '../types/order';
import {
  executionReportArb,
  executionReportSequenceArb,
  isoDateStringArb,
  cryptoSymbolArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/position-limit');

const mockPositionLimitRepo = PositionLimitRepository as jest.Mocked<typeof PositionLimitRepository>;

describe('PositionTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPositions();
    mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([]);
    mockPositionLimitRepo.updateCurrentValue.mockResolvedValue({} as any);
  });

  /**
   * Property 2: Position Tracking Accuracy
   * 
   * For any sequence of executed trades, the calculated position size SHALL equal
   * the sum of all buy quantities minus the sum of all sell quantities, AND position
   * updates SHALL be reflected in subsequent limit checks.
   * 
   * **Feature: risk-controls, Property 2: Position Tracking Accuracy**
   * **Validates: Requirements 1.4, 1.5**
   */
  describe('Property 2: Position Tracking Accuracy', () => {
    it('should calculate position as sum of buys minus sum of sells', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportSequenceArb(),
          async ({ tenantId, assetId, strategyId, executions }) => {
            // Calculate expected position
            const expectedPosition = executions.reduce((pos, exec) => {
              if (exec.side === 'BUY') {
                return pos + exec.executedQuantity;
              } else {
                return pos - exec.executedQuantity;
              }
            }, 0);
            
            // Process all executions
            let finalPosition: Position | null = null;
            for (const execution of executions) {
              finalPosition = await PositionTracker.processExecution(execution);
            }
            
            // Verify position matches expected
            expect(finalPosition).not.toBeNull();
            expect(finalPosition!.quantity).toBeCloseTo(expectedPosition, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reflect position updates in subsequent queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportSequenceArb(),
          async ({ tenantId, assetId, strategyId, executions }) => {
            // Process all executions
            for (const execution of executions) {
              await PositionTracker.processExecution(execution);
            }
            
            // Query the position
            const position = await PositionTracker.getPosition(tenantId, assetId, strategyId);
            
            // Calculate expected position
            const expectedPosition = executions.reduce((pos, exec) => {
              if (exec.side === 'BUY') {
                return pos + exec.executedQuantity;
              } else {
                return pos - exec.executedQuantity;
              }
            }, 0);
            
            // Verify queried position matches expected
            expect(position).not.toBeNull();
            expect(position!.quantity).toBeCloseTo(expectedPosition, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate position correctly using calculatePositionFromTrades', async () => {
      await fc.assert(
        fc.property(
          executionReportSequenceArb(),
          ({ executions }) => {
            // Calculate using the service method
            const calculatedPosition = PositionTracker.calculatePositionFromTrades(executions);
            
            // Calculate expected position manually
            const expectedPosition = executions.reduce((pos, exec) => {
              if (exec.side === 'BUY') {
                return pos + exec.executedQuantity;
              } else {
                return pos - exec.executedQuantity;
              }
            }, 0);
            
            // Verify they match
            expect(calculatedPosition).toBeCloseTo(expectedPosition, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty trade sequence', async () => {
      const position = PositionTracker.calculatePositionFromTrades([]);
      expect(position).toBe(0);
    });

    it('should handle single buy trade', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb().filter(e => e.side === 'BUY'),
          async (execution) => {
            const position = await PositionTracker.processExecution(execution);
            
            expect(position.quantity).toBe(execution.executedQuantity);
            expect(position.averagePrice).toBe(execution.executedPrice);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle single sell trade (short position)', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionReportArb().filter(e => e.side === 'SELL'),
          async (execution) => {
            const position = await PositionTracker.processExecution(execution);
            
            // Selling without existing position creates short position
            expect(position.quantity).toBe(-execution.executedQuantity);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain correct average price on buys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          cryptoSymbolArb(),
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          async (tenantId, strategyId, assetId, qty1, price1, qty2, price2) => {
            const exec1: ExecutionReport = {
              executionId: 'exec-1',
              orderId: 'order-1',
              tenantId,
              strategyId,
              assetId,
              side: 'BUY',
              executedQuantity: qty1,
              executedPrice: price1,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            
            const exec2: ExecutionReport = {
              executionId: 'exec-2',
              orderId: 'order-2',
              tenantId,
              strategyId,
              assetId,
              side: 'BUY',
              executedQuantity: qty2,
              executedPrice: price2,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            
            await PositionTracker.processExecution(exec1);
            const position = await PositionTracker.processExecution(exec2);
            
            // Expected average price = (qty1 * price1 + qty2 * price2) / (qty1 + qty2)
            const expectedAvgPrice = (qty1 * price1 + qty2 * price2) / (qty1 + qty2);
            
            expect(position.quantity).toBeCloseTo(qty1 + qty2, 10);
            expect(position.averagePrice).toBeCloseTo(expectedAvgPrice, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain average price on sells (not change it)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          cryptoSymbolArb(),
          fc.double({ min: 10, max: 100, noNaN: true }),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          fc.double({ min: 1, max: 5, noNaN: true }),
          async (tenantId, strategyId, assetId, buyQty, buyPrice, sellQty) => {
            const buyExec: ExecutionReport = {
              executionId: 'exec-1',
              orderId: 'order-1',
              tenantId,
              strategyId,
              assetId,
              side: 'BUY',
              executedQuantity: buyQty,
              executedPrice: buyPrice,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            
            const sellExec: ExecutionReport = {
              executionId: 'exec-2',
              orderId: 'order-2',
              tenantId,
              strategyId,
              assetId,
              side: 'SELL',
              executedQuantity: sellQty,
              executedPrice: buyPrice * 1.1, // Sell at higher price
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            
            await PositionTracker.processExecution(buyExec);
            const position = await PositionTracker.processExecution(sellExec);
            
            // Average price should remain the same after selling
            expect(position.averagePrice).toBeCloseTo(buyPrice, 10);
            expect(position.quantity).toBeCloseTo(buyQty - sellQty, 10);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getPositions', () => {
    it('should return all positions for a tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (tenantId, assets) => {
            // Create positions for each asset
            for (const assetId of assets) {
              const execution: ExecutionReport = {
                executionId: `exec-${assetId}`,
                orderId: `order-${assetId}`,
                tenantId,
                strategyId: 'strategy-1',
                assetId,
                side: 'BUY',
                executedQuantity: 10,
                executedPrice: 100,
                commission: 0,
                exchangeId: 'binance',
                timestamp: new Date().toISOString()
              };
              await PositionTracker.processExecution(execution);
            }
            
            const summary = await PositionTracker.getPositions(tenantId);
            
            // Should have positions for all unique assets
            const uniqueAssets = [...new Set(assets)];
            expect(summary.positions.length).toBe(uniqueAssets.length);
            expect(summary.tenantId).toBe(tenantId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('updateMarketValue', () => {
    it('should update market value and unrealized P&L', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          async (tenantId, assetId, quantity, buyPrice, currentPrice) => {
            // Create initial position without strategyId (updateMarketValue doesn't support strategyId)
            const execution: ExecutionReport = {
              executionId: 'exec-1',
              orderId: 'order-1',
              tenantId,
              strategyId: '', // Empty strategyId so position key matches updateMarketValue lookup
              assetId,
              side: 'BUY',
              executedQuantity: quantity,
              executedPrice: buyPrice,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            await PositionTracker.processExecution(execution);
            
            // Update market value
            const updatedPosition = await PositionTracker.updateMarketValue(tenantId, assetId, currentPrice);
            
            expect(updatedPosition).not.toBeNull();
            expect(updatedPosition!.marketValue).toBeCloseTo(quantity * currentPrice, 10);
            expect(updatedPosition!.unrealizedPnL).toBeCloseTo(quantity * (currentPrice - buyPrice), 10);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
