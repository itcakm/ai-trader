import * as fc from 'fast-check';
import { PositionLimitService } from './position-limit';
import { PositionLimitRepository } from '../repositories/position-limit';
import { PositionLimit, LimitCheckResult, LimitScope, LimitType } from '../types/position-limit';
import { OrderRequest } from '../types/order';
import {
  positionLimitArb,
  positionLimitInputArb,
  orderRequestArb,
  limitExceedingOrderArb,
  limitWithinOrderArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/position-limit');

const mockPositionLimitRepo = PositionLimitRepository as jest.Mocked<typeof PositionLimitRepository>;

describe('PositionLimitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Position Limit Enforcement
   * 
   * For any order that would cause a position to exceed its configured Position_Limit
   * (at asset, strategy, or portfolio level), the Risk_Engine SHALL reject the order,
   * AND the rejection SHALL include the limit type, current value, max value, and exceeded amount.
   * 
   * **Feature: risk-controls, Property 1: Position Limit Enforcement**
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  describe('Property 1: Position Limit Enforcement', () => {
    it('should reject orders that would exceed position limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          limitExceedingOrderArb(),
          async ({ limit, order, portfolioValue }) => {
            // Setup mock to return the limit
            mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([limit]);
            
            const result = await PositionLimitService.checkLimit(
              order.tenantId,
              order,
              portfolioValue
            );
            
            // Order should be rejected (not within limit)
            expect(result.withinLimit).toBe(false);
            
            // Rejection should include required details
            expect(result.currentValue).toBeDefined();
            expect(result.maxValue).toBeDefined();
            expect(result.wouldExceedBy).toBeDefined();
            expect(result.wouldExceedBy).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should approve orders that stay within position limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          limitWithinOrderArb(),
          async ({ limit, order, portfolioValue }) => {
            // Setup mock to return the limit
            mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([limit]);
            
            const result = await PositionLimitService.checkLimit(
              order.tenantId,
              order,
              portfolioValue
            );
            
            // Order should be approved (within limit)
            expect(result.withinLimit).toBe(true);
            
            // Should include current and max values
            expect(result.currentValue).toBeDefined();
            expect(result.maxValue).toBeDefined();
            expect(result.remainingCapacity).toBeGreaterThanOrEqual(0);
            
            // Should not have exceeded amount
            expect(result.wouldExceedBy).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce limits at all three levels: asset, strategy, and portfolio', async () => {
      const scopes: LimitScope[] = ['ASSET', 'STRATEGY', 'PORTFOLIO'];
      
      for (const scope of scopes) {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.uuid(),
            fc.uuid(),
            fc.double({ min: 100, max: 10000, noNaN: true }),
            fc.double({ min: 0, max: 50, noNaN: true }),
            async (tenantId, assetId, strategyId, maxValue, currentPercent) => {
              const currentValue = maxValue * (currentPercent / 100);
              const remaining = maxValue - currentValue;
              
              const limit: PositionLimit = {
                limitId: 'test-limit',
                tenantId,
                scope,
                assetId: scope === 'ASSET' ? assetId : undefined,
                strategyId: scope === 'STRATEGY' ? strategyId : undefined,
                limitType: 'ABSOLUTE',
                maxValue,
                currentValue,
                utilizationPercent: currentPercent,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              
              // Create order that exceeds remaining capacity
              const exceedingOrder: OrderRequest = {
                orderId: 'order-1',
                tenantId,
                strategyId,
                assetId,
                side: 'BUY',
                quantity: remaining + 100, // Exceeds by 100
                orderType: 'MARKET',
                exchangeId: 'binance',
                timestamp: new Date().toISOString()
              };
              
              mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([limit]);
              
              const result = await PositionLimitService.checkLimit(tenantId, exceedingOrder);
              
              // Should reject the order
              expect(result.withinLimit).toBe(false);
              expect(result.wouldExceedBy).toBeGreaterThan(0);
            }
          ),
          { numRuns: 100 }
        );
      }
    });

    it('should support both absolute and percentage limit types', async () => {
      const limitTypes: LimitType[] = ['ABSOLUTE', 'PERCENTAGE'];
      
      for (const limitType of limitTypes) {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.uuid(),
            fc.double({ min: 10, max: 100, noNaN: true }), // maxValue (% or absolute)
            fc.double({ min: 100000, max: 1000000, noNaN: true }), // portfolioValue
            async (tenantId, assetId, maxValue, portfolioValue) => {
              const effectiveMax = limitType === 'PERCENTAGE' 
                ? (maxValue / 100) * portfolioValue 
                : maxValue;
              
              const currentValue = effectiveMax * 0.3; // 30% utilized
              
              const limit: PositionLimit = {
                limitId: 'test-limit',
                tenantId,
                scope: 'ASSET',
                assetId,
                limitType,
                maxValue,
                currentValue: limitType === 'PERCENTAGE' ? currentValue : currentValue,
                utilizationPercent: 30,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              
              // Create order that exceeds the limit
              const exceedingOrder: OrderRequest = {
                orderId: 'order-1',
                tenantId,
                strategyId: 'strategy-1',
                assetId,
                side: 'BUY',
                quantity: effectiveMax + 100, // Exceeds the effective max
                orderType: 'MARKET',
                exchangeId: 'binance',
                timestamp: new Date().toISOString()
              };
              
              mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([limit]);
              
              const result = await PositionLimitService.checkLimit(
                tenantId,
                exceedingOrder,
                limitType === 'PERCENTAGE' ? portfolioValue : undefined
              );
              
              // Should reject the order
              expect(result.withinLimit).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    });

    it('should allow orders when no limits are configured', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          async (order) => {
            // No limits configured
            mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([]);
            
            const result = await PositionLimitService.checkLimit(order.tenantId, order);
            
            // Should approve the order
            expect(result.withinLimit).toBe(true);
            expect(result.maxValue).toBe(Infinity);
            expect(result.remainingCapacity).toBe(Infinity);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always allow sell orders (position reduction)', async () => {
      await fc.assert(
        fc.asyncProperty(
          positionLimitArb(),
          async (limit) => {
            // Create a sell order
            const sellOrder: OrderRequest = {
              orderId: 'order-1',
              tenantId: limit.tenantId,
              strategyId: limit.strategyId || 'strategy-1',
              assetId: limit.assetId || 'BTC',
              side: 'SELL',
              quantity: limit.maxValue * 2, // Large sell
              orderType: 'MARKET',
              exchangeId: 'binance',
              timestamp: new Date().toISOString()
            };
            
            mockPositionLimitRepo.findApplicableLimits.mockResolvedValue([limit]);
            
            const result = await PositionLimitService.checkLimit(limit.tenantId, sellOrder);
            
            // Sell orders should always be allowed (reducing position)
            expect(result.withinLimit).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('setLimit', () => {
    it('should create a new position limit with correct properties', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          positionLimitInputArb(),
          async (tenantId, input) => {
            mockPositionLimitRepo.putLimit.mockResolvedValue();
            
            const result = await PositionLimitService.setLimit(tenantId, input);
            
            // Verify the limit was created with correct properties
            expect(result.tenantId).toBe(tenantId);
            expect(result.scope).toBe(input.scope);
            expect(result.limitType).toBe(input.limitType);
            expect(result.maxValue).toBe(input.maxValue);
            expect(result.currentValue).toBe(0);
            expect(result.utilizationPercent).toBe(0);
            expect(result.limitId).toBeDefined();
            expect(result.createdAt).toBeDefined();
            expect(result.updatedAt).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('listLimits', () => {
    it('should return all limits for a tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(positionLimitArb(), { minLength: 0, maxLength: 10 }),
          async (tenantId, limits) => {
            const tenantLimits = limits.map(l => ({ ...l, tenantId }));
            mockPositionLimitRepo.listLimits.mockResolvedValue({ items: tenantLimits });
            
            const result = await PositionLimitService.listLimits(tenantId);
            
            expect(result).toHaveLength(tenantLimits.length);
            result.forEach(limit => {
              expect(limit.tenantId).toBe(tenantId);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should filter limits by scope when provided', async () => {
      const scopes: LimitScope[] = ['ASSET', 'STRATEGY', 'PORTFOLIO'];
      
      for (const scope of scopes) {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.array(positionLimitArb(), { minLength: 1, maxLength: 10 }),
            async (tenantId, limits) => {
              const scopedLimits = limits
                .map(l => ({ ...l, tenantId, scope }))
                .filter(l => l.scope === scope);
              
              mockPositionLimitRepo.listLimitsByScope.mockResolvedValue(scopedLimits);
              
              const result = await PositionLimitService.listLimits(tenantId, scope);
              
              result.forEach(limit => {
                expect(limit.scope).toBe(scope);
              });
            }
          ),
          { numRuns: 100 }
        );
      }
    });
  });

  describe('updateCurrentValue', () => {
    it('should update the current value of a limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          positionLimitArb(),
          fc.double({ min: 0, max: 1000000, noNaN: true }),
          async (limit, newValue) => {
            mockPositionLimitRepo.updateCurrentValue.mockResolvedValue({
              ...limit,
              currentValue: newValue,
              updatedAt: new Date().toISOString()
            });
            
            // Should not throw
            await expect(
              PositionLimitService.updateCurrentValue(limit.tenantId, limit.limitId, newValue)
            ).resolves.not.toThrow();
            
            // Verify repository was called
            expect(mockPositionLimitRepo.updateCurrentValue).toHaveBeenCalledWith(
              limit.tenantId,
              limit.limitId,
              newValue,
              undefined
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
