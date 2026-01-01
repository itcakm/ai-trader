import * as fc from 'fast-check';
import {
  PassiveBreachHandler,
  clearFlaggedPositions,
  clearReductionOrders,
  BreachCheckResult,
  FlaggedPosition,
  PassiveBreachConfig
} from './passive-breach-handler';
import { PositionTracker, clearPositions } from './position-tracker';
import { PositionLimitRepository } from '../repositories/position-limit';
import { PositionLimit, LimitScope } from '../types/position-limit';
import { ExecutionReport } from '../types/order';
import {
  positionLimitArb,
  cryptoSymbolArb,
  isoDateStringArb,
  limitTypeArb,
  breachingPositionScenarioArb,
  nonBreachingPositionScenarioArb,
  passiveBreachConfigArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/position-limit');

const mockPositionLimitRepo = PositionLimitRepository as jest.Mocked<typeof PositionLimitRepository>;

describe('PassiveBreachHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPositions();
    clearFlaggedPositions();
    clearReductionOrders();
    mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([]);
    mockPositionLimitRepo.getLimit.mockResolvedValue(null);
    mockPositionLimitRepo.updateCurrentValue.mockResolvedValue({} as any);
  });

  /**
   * Property 3: Passive Limit Breach Handling
   * 
   * For any position that exceeds its limit due to market price movement (not a new trade),
   * the position SHALL be flagged with status BREACH, AND if auto-reduction is enabled,
   * a reduction order SHALL be queued.
   * 
   * **Feature: risk-controls, Property 3: Passive Limit Breach Handling**
   * **Validates: Requirements 1.6**
   */
  describe('Property 3: Passive Limit Breach Handling', () => {
    it('should detect breach when price movement causes position to exceed limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          breachingPositionScenarioArb(),
          async ({ tenantId, assetId, strategyId, limit, positionQuantity, initialPrice, breachingPrice, portfolioValue }) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            // Setup mock BEFORE processing execution
            mockPositionLimitRepo.findApplicableLimits.mockImplementation(async (tid, aid) => {
              if (tid === tenantId && aid === assetId) {
                return [limit];
              }
              return [];
            });
            
            // Setup: Create a position at initial price (within limit)
            const execution: ExecutionReport = {
              executionId: 'exec-1',
              orderId: 'order-1',
              tenantId,
              strategyId,
              assetId,
              side: 'BUY',
              executedQuantity: positionQuantity,
              executedPrice: initialPrice,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };

            await PositionTracker.processExecution(execution);

            // Act: Check for breach at the higher price
            const breaches = await PassiveBreachHandler.checkForPassiveBreach(
              tenantId,
              assetId,
              breachingPrice,
              portfolioValue,
              strategyId
            );

            // Assert: Should detect a breach
            const breachResult = breaches.find(b => b.limitId === limit.limitId);
            expect(breachResult).toBeDefined();
            expect(breachResult!.status).toBe('BREACH');
            expect(breachResult!.breachAmount).toBeGreaterThan(0);
            expect(breachResult!.breachPercent).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should flag position with BREACH status when limit is exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          fc.uuid(),
          fc.double({ min: 100, max: 10000, noNaN: true }),
          fc.double({ min: 10, max: 100, noNaN: true }),
          fc.boolean(),
          async (tenantId, assetId, limitId, breachAmount, maxValue, autoReductionEnabled) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            // Setup mock
            const limit: PositionLimit = {
              limitId,
              tenantId,
              scope: 'ASSET',
              assetId,
              limitType: 'ABSOLUTE',
              maxValue,
              currentValue: maxValue + breachAmount,
              utilizationPercent: 100,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            mockPositionLimitRepo.getLimit.mockResolvedValue(limit);

            // Act: Flag the position
            const flagged = await PassiveBreachHandler.flagPosition(
              tenantId,
              assetId,
              limitId,
              breachAmount,
              autoReductionEnabled
            );

            // Assert: Position should be flagged with BREACH status
            expect(flagged.status).toBe('BREACH');
            expect(flagged.tenantId).toBe(tenantId);
            expect(flagged.assetId).toBe(assetId);
            expect(flagged.limitId).toBe(limitId);
            expect(flagged.breachAmount).toBe(breachAmount);
            expect(flagged.autoReductionEnabled).toBe(autoReductionEnabled);
            expect(flagged.flaggedAt).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should queue reduction order when auto-reduction is enabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          fc.uuid(),
          fc.uuid(),
          fc.double({ min: 1, max: 1000, noNaN: true }),
          async (tenantId, assetId, strategyId, limitId, reductionQuantity) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            // Setup mock
            const limit: PositionLimit = {
              limitId,
              tenantId,
              scope: 'ASSET',
              assetId,
              limitType: 'ABSOLUTE',
              maxValue: 1000,
              currentValue: 1500,
              utilizationPercent: 150,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            mockPositionLimitRepo.getLimit.mockResolvedValue(limit);

            // First flag the position
            await PassiveBreachHandler.flagPosition(
              tenantId,
              assetId,
              limitId,
              500,
              true
            );

            // Act: Queue reduction order
            const order = await PassiveBreachHandler.queueReductionOrder(
              tenantId,
              assetId,
              strategyId,
              limitId,
              reductionQuantity
            );

            // Assert: Reduction order should be queued
            expect(order.status).toBe('QUEUED');
            expect(order.side).toBe('SELL');
            expect(order.quantity).toBe(reductionQuantity);
            expect(order.tenantId).toBe(tenantId);
            expect(order.assetId).toBe(assetId);
            expect(order.limitId).toBe(limitId);
            expect(order.reason).toContain('Passive limit breach');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not flag position when within limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonBreachingPositionScenarioArb(),
          async ({ tenantId, assetId, strategyId, limit, positionQuantity, currentPrice, portfolioValue }) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            // Setup mock BEFORE processing execution
            mockPositionLimitRepo.findApplicableLimits.mockImplementation(async (tid, aid) => {
              if (tid === tenantId && aid === assetId) {
                return [limit];
              }
              return [];
            });
            
            // Setup: Create a position within limit
            const execution: ExecutionReport = {
              executionId: 'exec-1',
              orderId: 'order-1',
              tenantId,
              strategyId,
              assetId,
              side: 'BUY',
              executedQuantity: positionQuantity,
              executedPrice: currentPrice,
              commission: 0,
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };

            await PositionTracker.processExecution(execution);

            // Act: Check for breach
            const breaches = await PassiveBreachHandler.checkForPassiveBreach(
              tenantId,
              assetId,
              currentPrice,
              portfolioValue,
              strategyId
            );

            // Assert: Should not detect a breach
            const breachResult = breaches.find(b => b.limitId === limit.limitId);
            if (breachResult) {
              expect(breachResult.status).not.toBe('BREACH');
              expect(breachResult.breachAmount).toBeUndefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should process all positions and flag breaches with auto-reduction', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 3 }),
          fc.uuid(),
          async (tenantId, assets, strategyId) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            // Setup: Create positions for each asset
            const uniqueAssets = [...new Set(assets)];
            const limits: PositionLimit[] = [];
            const prices = new Map<string, number>();

            for (const assetId of uniqueAssets) {
              const price = 100;
              const quantity = 10;
              const maxValue = quantity * price * 0.8; // Set limit below current value to trigger breach

              const limit: PositionLimit = {
                limitId: `limit-${assetId}`,
                tenantId,
                scope: 'ASSET',
                assetId,
                limitType: 'ABSOLUTE',
                maxValue,
                currentValue: quantity * price,
                utilizationPercent: 125,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };

              limits.push(limit);
              prices.set(assetId, price);
            }

            // Setup mocks BEFORE processing executions
            mockPositionLimitRepo.findApplicableLimits.mockImplementation(async (tid, aid) => {
              if (tid === tenantId) {
                return limits.filter(l => l.assetId === aid);
              }
              return [];
            });
            mockPositionLimitRepo.getLimit.mockImplementation(async (tid, lid) => {
              return limits.find(l => l.limitId === lid && l.tenantId === tid) || null;
            });

            // Now process executions
            for (const assetId of uniqueAssets) {
              const execution: ExecutionReport = {
                executionId: `exec-${assetId}`,
                orderId: `order-${assetId}`,
                tenantId,
                strategyId,
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

            // Act: Process passive breaches with auto-reduction enabled
            const config: PassiveBreachConfig = {
              tenantId,
              autoReductionEnabled: true,
              warningThresholdPercent: 90,
              reductionTargetPercent: 80
            };

            const result = await PassiveBreachHandler.processPassiveBreaches(
              tenantId,
              prices,
              undefined,
              config
            );

            // Assert: Should have breaches, flagged positions, and queued orders
            expect(result.breaches.length).toBeGreaterThanOrEqual(uniqueAssets.length);
            
            const breachCount = result.breaches.filter(b => b.status === 'BREACH').length;
            expect(result.flaggedPositions.length).toBe(breachCount);
            expect(result.queuedOrders.length).toBe(breachCount);

            // All flagged positions should have BREACH status
            for (const flagged of result.flaggedPositions) {
              expect(flagged.status).toBe('BREACH');
              expect(flagged.autoReductionEnabled).toBe(true);
              expect(flagged.reductionOrderQueued).toBe(true);
            }

            // All queued orders should be SELL orders
            for (const order of result.queuedOrders) {
              expect(order.side).toBe('SELL');
              expect(order.status).toBe('QUEUED');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct reduction quantity to bring position within target', async () => {
      await fc.assert(
        fc.property(
          fc.double({ min: 1000, max: 100000, noNaN: true }),
          fc.double({ min: 500, max: 50000, noNaN: true }),
          fc.double({ min: 50, max: 95, noNaN: true }),
          (currentValue, maxValue, targetPercent) => {
            // Ensure currentValue > maxValue for breach scenario
            const adjustedCurrentValue = Math.max(currentValue, maxValue * 1.1);
            
            const reductionQuantity = PassiveBreachHandler.calculateReductionQuantity(
              adjustedCurrentValue,
              maxValue,
              targetPercent
            );

            // After reduction, value should be at or below target
            const targetValue = maxValue * (targetPercent / 100);
            const valueAfterReduction = adjustedCurrentValue - reductionQuantity;

            expect(reductionQuantity).toBeGreaterThanOrEqual(0);
            expect(valueAfterReduction).toBeLessThanOrEqual(targetValue + 0.01); // Small tolerance for floating point
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not queue reduction order when auto-reduction is disabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 2 }),
          fc.uuid(),
          async (tenantId, assets, strategyId) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            // Setup: Create positions that breach limits
            const uniqueAssets = [...new Set(assets)];
            const limits: PositionLimit[] = [];
            const prices = new Map<string, number>();

            for (const assetId of uniqueAssets) {
              const price = 100;
              const quantity = 10;
              const maxValue = quantity * price * 0.8;

              const limit: PositionLimit = {
                limitId: `limit-${assetId}`,
                tenantId,
                scope: 'ASSET',
                assetId,
                limitType: 'ABSOLUTE',
                maxValue,
                currentValue: quantity * price,
                utilizationPercent: 125,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };

              limits.push(limit);
              prices.set(assetId, price);
            }

            // Setup mocks BEFORE processing executions
            mockPositionLimitRepo.findApplicableLimits.mockImplementation(async (tid, aid) => {
              if (tid === tenantId) {
                return limits.filter(l => l.assetId === aid);
              }
              return [];
            });
            mockPositionLimitRepo.getLimit.mockImplementation(async (tid, lid) => {
              return limits.find(l => l.limitId === lid && l.tenantId === tid) || null;
            });

            // Now process executions
            for (const assetId of uniqueAssets) {
              const execution: ExecutionReport = {
                executionId: `exec-${assetId}`,
                orderId: `order-${assetId}`,
                tenantId,
                strategyId,
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

            // Act: Process with auto-reduction DISABLED
            const config: PassiveBreachConfig = {
              tenantId,
              autoReductionEnabled: false,
              warningThresholdPercent: 90,
              reductionTargetPercent: 80
            };

            const result = await PassiveBreachHandler.processPassiveBreaches(
              tenantId,
              prices,
              undefined,
              config
            );

            // Assert: Should have breaches and flagged positions, but NO queued orders
            expect(result.breaches.length).toBeGreaterThan(0);
            expect(result.flaggedPositions.length).toBeGreaterThan(0);
            expect(result.queuedOrders.length).toBe(0);

            // Flagged positions should have autoReductionEnabled = false
            for (const flagged of result.flaggedPositions) {
              expect(flagged.autoReductionEnabled).toBe(false);
              expect(flagged.reductionOrderQueued).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getFlaggedPositions', () => {
    it('should return all flagged positions for a tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (tenantId, assets) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            const uniqueAssets = [...new Set(assets)];
            
            // Setup: Flag multiple positions
            for (const assetId of uniqueAssets) {
              const limitId = `limit-${assetId}`;
              const limit: PositionLimit = {
                limitId,
                tenantId,
                scope: 'ASSET',
                assetId,
                limitType: 'ABSOLUTE',
                maxValue: 1000,
                currentValue: 1500,
                utilizationPercent: 150,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              mockPositionLimitRepo.getLimit.mockResolvedValue(limit);

              await PassiveBreachHandler.flagPosition(
                tenantId,
                assetId,
                limitId,
                500,
                false
              );
            }

            // Act: Get flagged positions
            const flagged = await PassiveBreachHandler.getFlaggedPositions(tenantId);

            // Assert: Should return all flagged positions
            expect(flagged.length).toBe(uniqueAssets.length);
            for (const position of flagged) {
              expect(position.tenantId).toBe(tenantId);
              expect(position.status).toBe('BREACH');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('clearFlaggedPosition', () => {
    it('should remove flagged position when cleared', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoSymbolArb(),
          fc.uuid(),
          async (tenantId, assetId, limitId) => {
            // Clear state for each test iteration
            clearPositions();
            clearFlaggedPositions();
            clearReductionOrders();
            
            // Setup: Flag a position
            const limit: PositionLimit = {
              limitId,
              tenantId,
              scope: 'ASSET',
              assetId,
              limitType: 'ABSOLUTE',
              maxValue: 1000,
              currentValue: 1500,
              utilizationPercent: 150,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            mockPositionLimitRepo.getLimit.mockResolvedValue(limit);

            const flagged = await PassiveBreachHandler.flagPosition(
              tenantId,
              assetId,
              limitId,
              500,
              false
            );

            // Verify it was flagged
            let positions = await PassiveBreachHandler.getFlaggedPositions(tenantId);
            expect(positions.length).toBe(1);

            // Act: Clear the flagged position
            await PassiveBreachHandler.clearFlaggedPosition(tenantId, flagged.positionId);

            // Assert: Position should be removed
            positions = await PassiveBreachHandler.getFlaggedPositions(tenantId);
            expect(positions.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
