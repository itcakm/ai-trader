import * as fc from 'fast-check';
import { PreTradeCheckerService, PreTradeConfig } from './pre-trade-checker';
import { KillSwitchService } from './kill-switch';
import { CircuitBreakerService } from './circuit-breaker';
import { PositionLimitService } from './position-limit';
import { DrawdownService } from './drawdown';
import { VolatilityService } from './volatility';
import { OrderRequest } from '../types/order';
import { RiskCheckType } from '../types/risk-engine';
import {
  orderRequestArb,
  activeKillSwitchStateArb,
  inactiveKillSwitchStateArb,
  openCircuitBreakerArb,
  closedCircuitBreakerArb
} from '../test/generators';

// Mock all dependent services
jest.mock('./kill-switch');
jest.mock('./circuit-breaker');
jest.mock('./position-limit');
jest.mock('./drawdown');
jest.mock('./volatility');

const mockKillSwitchService = KillSwitchService as jest.Mocked<typeof KillSwitchService>;
const mockCircuitBreakerService = CircuitBreakerService as jest.Mocked<typeof CircuitBreakerService>;
const mockPositionLimitService = PositionLimitService as jest.Mocked<typeof PositionLimitService>;
const mockDrawdownService = DrawdownService as jest.Mocked<typeof DrawdownService>;
const mockVolatilityService = VolatilityService as jest.Mocked<typeof VolatilityService>;

describe('PreTradeCheckerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to setup all mocks for a passing scenario
   */
  const setupPassingMocks = () => {
    mockKillSwitchService.isActive.mockResolvedValue(false);
    mockKillSwitchService.getState.mockResolvedValue({
      tenantId: 'test-tenant',
      active: false,
      triggerType: 'MANUAL',
      scope: 'TENANT',
      pendingOrdersCancelled: 0
    });

    mockCircuitBreakerService.checkBreakers.mockResolvedValue({
      allClosed: true,
      openBreakers: [],
      halfOpenBreakers: []
    });

    mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
      withinLimit: true,
      currentValue: 0,
      maxValue: 100,
      remainingCapacity: 100
    }]);

    mockDrawdownService.checkDrawdown.mockResolvedValue({
      status: 'NORMAL',
      currentDrawdownPercent: 0,
      distanceToWarning: 5,
      distanceToMax: 10,
      tradingAllowed: true
    });

    mockVolatilityService.checkThrottle.mockResolvedValue({
      level: 'NORMAL',
      throttlePercent: 0,
      allowNewEntries: true
    });
  };


  /**
   * Property 14: Pre-Trade Check Completeness
   * 
   * For any order submitted for pre-trade validation, the Risk_Engine SHALL check 
   * position limits, available capital, leverage limits, kill switch status, and 
   * circuit breaker status, AND the order SHALL be approved only if ALL checks pass.
   * 
   * **Validates: Requirements 6.1, 6.2, 6.5**
   */
  describe('Property 14: Pre-Trade Check Completeness', () => {
    it('validates all required check types are performed for any order', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          async (order: OrderRequest) => {
            // Setup all mocks to pass
            setupPassingMocks();

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Verify all required check types are present
            const checkTypes = result.checks.map(c => c.checkType);
            
            // Must include all required checks
            expect(checkTypes).toContain('KILL_SWITCH');
            expect(checkTypes).toContain('CIRCUIT_BREAKER');
            expect(checkTypes).toContain('POSITION_LIMIT');
            expect(checkTypes).toContain('DRAWDOWN');
            expect(checkTypes).toContain('VOLATILITY');
            expect(checkTypes).toContain('CAPITAL_AVAILABLE');
            expect(checkTypes).toContain('LEVERAGE');

            // Verify minimum number of checks
            expect(result.checks.length).toBeGreaterThanOrEqual(7);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('approves order only when ALL checks pass', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          async (order: OrderRequest) => {
            // Setup all mocks to pass
            setupPassingMocks();

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // All checks should pass
            const allPassed = result.checks.every(c => c.passed);
            
            // Order should be approved if and only if all checks pass
            expect(result.approved).toBe(allPassed);
            
            // If approved, no rejection reason
            if (result.approved) {
              expect(result.rejectionReason).toBeUndefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects order when kill switch is active', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          activeKillSwitchStateArb(),
          async (order: OrderRequest, killSwitchState) => {
            // Setup mocks - kill switch active, others pass
            mockKillSwitchService.isActive.mockResolvedValue(true);
            mockKillSwitchService.getState.mockResolvedValue(killSwitchState);

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: true,
              openBreakers: [],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: true,
              currentValue: 0,
              maxValue: 100,
              remainingCapacity: 100
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status: 'NORMAL',
              currentDrawdownPercent: 0,
              distanceToWarning: 5,
              distanceToMax: 10,
              tradingAllowed: true
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'NORMAL',
              throttlePercent: 0,
              allowNewEntries: true
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Order should be rejected
            expect(result.approved).toBe(false);
            
            // Kill switch check should fail
            const killSwitchCheck = result.checks.find(c => c.checkType === 'KILL_SWITCH');
            expect(killSwitchCheck?.passed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects order when circuit breaker is open', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          openCircuitBreakerArb(),
          async (order: OrderRequest, openBreaker) => {
            // Setup mocks - circuit breaker open, others pass
            mockKillSwitchService.isActive.mockResolvedValue(false);
            mockKillSwitchService.getState.mockResolvedValue({
              tenantId: order.tenantId,
              active: false,
              triggerType: 'MANUAL',
              scope: 'TENANT',
              pendingOrdersCancelled: 0
            });

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: false,
              openBreakers: [openBreaker],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: true,
              currentValue: 0,
              maxValue: 100,
              remainingCapacity: 100
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status: 'NORMAL',
              currentDrawdownPercent: 0,
              distanceToWarning: 5,
              distanceToMax: 10,
              tradingAllowed: true
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'NORMAL',
              throttlePercent: 0,
              allowNewEntries: true
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Order should be rejected
            expect(result.approved).toBe(false);
            
            // Circuit breaker check should fail
            const cbCheck = result.checks.find(c => c.checkType === 'CIRCUIT_BREAKER');
            expect(cbCheck?.passed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });


    it('rejects order when position limit is exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          fc.double({ min: 50, max: 99, noNaN: true }),
          async (order: OrderRequest, currentValue: number, maxValue: number) => {
            // Setup mocks - position limit exceeded, others pass
            mockKillSwitchService.isActive.mockResolvedValue(false);
            mockKillSwitchService.getState.mockResolvedValue({
              tenantId: order.tenantId,
              active: false,
              triggerType: 'MANUAL',
              scope: 'TENANT',
              pendingOrdersCancelled: 0
            });

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: true,
              openBreakers: [],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: false,
              currentValue,
              maxValue,
              remainingCapacity: 0,
              wouldExceedBy: currentValue - maxValue
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status: 'NORMAL',
              currentDrawdownPercent: 0,
              distanceToWarning: 5,
              distanceToMax: 10,
              tradingAllowed: true
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'NORMAL',
              throttlePercent: 0,
              allowNewEntries: true
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Order should be rejected
            expect(result.approved).toBe(false);
            
            // Position limit check should fail
            const positionCheck = result.checks.find(c => c.checkType === 'POSITION_LIMIT');
            expect(positionCheck?.passed).toBe(false);
            expect(positionCheck?.currentValue).toBe(currentValue);
            expect(positionCheck?.limitValue).toBe(maxValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects order when drawdown threshold is breached', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          fc.constantFrom<'CRITICAL' | 'PAUSED'>('CRITICAL', 'PAUSED'),
          fc.double({ min: 10, max: 50, noNaN: true }),
          async (order: OrderRequest, status: 'CRITICAL' | 'PAUSED', drawdownPercent: number) => {
            // Setup mocks - drawdown breached, others pass
            mockKillSwitchService.isActive.mockResolvedValue(false);
            mockKillSwitchService.getState.mockResolvedValue({
              tenantId: order.tenantId,
              active: false,
              triggerType: 'MANUAL',
              scope: 'TENANT',
              pendingOrdersCancelled: 0
            });

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: true,
              openBreakers: [],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: true,
              currentValue: 0,
              maxValue: 100,
              remainingCapacity: 100
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status,
              currentDrawdownPercent: drawdownPercent,
              distanceToWarning: 0,
              distanceToMax: 0,
              tradingAllowed: false
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'NORMAL',
              throttlePercent: 0,
              allowNewEntries: true
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Order should be rejected
            expect(result.approved).toBe(false);
            
            // Drawdown check should fail
            const drawdownCheck = result.checks.find(c => c.checkType === 'DRAWDOWN');
            expect(drawdownCheck?.passed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects BUY order when volatility blocks new entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb().filter(o => o.side === 'BUY'),
          async (order: OrderRequest) => {
            // Setup mocks - volatility extreme, others pass
            mockKillSwitchService.isActive.mockResolvedValue(false);
            mockKillSwitchService.getState.mockResolvedValue({
              tenantId: order.tenantId,
              active: false,
              triggerType: 'MANUAL',
              scope: 'TENANT',
              pendingOrdersCancelled: 0
            });

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: true,
              openBreakers: [],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: true,
              currentValue: 0,
              maxValue: 100,
              remainingCapacity: 100
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status: 'NORMAL',
              currentDrawdownPercent: 0,
              distanceToWarning: 5,
              distanceToMax: 10,
              tradingAllowed: true
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'EXTREME',
              throttlePercent: 100,
              allowNewEntries: false
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Order should be rejected
            expect(result.approved).toBe(false);
            
            // Volatility check should fail
            const volatilityCheck = result.checks.find(c => c.checkType === 'VOLATILITY');
            expect(volatilityCheck?.passed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('includes processing time in result', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          async (order: OrderRequest) => {
            setupPassingMocks();

            const result = await PreTradeCheckerService.validate(order);

            // Processing time should be a non-negative number
            expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
            expect(typeof result.processingTimeMs).toBe('number');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('includes timestamp in result', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          async (order: OrderRequest) => {
            setupPassingMocks();

            const result = await PreTradeCheckerService.validate(order);

            // Timestamp should be a valid ISO string
            expect(result.timestamp).toBeDefined();
            expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15: Pre-Trade Rejection Details
   * 
   * For any order rejected by pre-trade checks, the rejection response SHALL include 
   * the specific check(s) that failed, the current value, the limit value, and a 
   * human-readable message.
   * 
   * **Validates: Requirements 6.3**
   */
  describe('Property 15: Pre-Trade Rejection Details', () => {
    it('includes specific check type for each failed check', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          fc.constantFrom<RiskCheckType>('KILL_SWITCH', 'CIRCUIT_BREAKER', 'POSITION_LIMIT', 'DRAWDOWN'),
          async (order: OrderRequest, failingCheckType: RiskCheckType) => {
            // Setup mocks based on which check should fail
            setupMocksWithOneFailure(failingCheckType, order);

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Order should be rejected
            expect(result.approved).toBe(false);

            // Find the failed check
            const failedChecks = result.checks.filter(c => !c.passed);
            expect(failedChecks.length).toBeGreaterThan(0);

            // The failing check should have the expected type
            const targetCheck = failedChecks.find(c => c.checkType === failingCheckType);
            expect(targetCheck).toBeDefined();
            expect(targetCheck?.checkType).toBe(failingCheckType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('includes specific check type for volatility failures on BUY orders', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb().filter(o => o.side === 'BUY'),
          async (order: OrderRequest) => {
            // Setup mocks - volatility blocks new entries
            setupMocksWithOneFailure('VOLATILITY', order);

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Order should be rejected for BUY orders
            expect(result.approved).toBe(false);

            // Find the failed check
            const failedChecks = result.checks.filter(c => !c.passed);
            expect(failedChecks.length).toBeGreaterThan(0);

            // The volatility check should have failed
            const volatilityCheck = failedChecks.find(c => c.checkType === 'VOLATILITY');
            expect(volatilityCheck).toBeDefined();
            expect(volatilityCheck?.checkType).toBe('VOLATILITY');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('includes current value and limit value for position limit failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          fc.double({ min: 100, max: 1000, noNaN: true }),
          fc.double({ min: 50, max: 99, noNaN: true }),
          async (order: OrderRequest, currentValue: number, maxValue: number) => {
            // Setup mocks - position limit exceeded
            mockKillSwitchService.isActive.mockResolvedValue(false);
            mockKillSwitchService.getState.mockResolvedValue({
              tenantId: order.tenantId,
              active: false,
              triggerType: 'MANUAL',
              scope: 'TENANT',
              pendingOrdersCancelled: 0
            });

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: true,
              openBreakers: [],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: false,
              currentValue,
              maxValue,
              remainingCapacity: 0,
              wouldExceedBy: currentValue - maxValue
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status: 'NORMAL',
              currentDrawdownPercent: 0,
              distanceToWarning: 5,
              distanceToMax: 10,
              tradingAllowed: true
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'NORMAL',
              throttlePercent: 0,
              allowNewEntries: true
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Find the position limit check
            const positionCheck = result.checks.find(c => c.checkType === 'POSITION_LIMIT');
            
            // Should include current value and limit value
            expect(positionCheck?.currentValue).toBe(currentValue);
            expect(positionCheck?.limitValue).toBe(maxValue);
            expect(positionCheck?.message).toContain(currentValue.toString());
            expect(positionCheck?.message).toContain(maxValue.toString());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('includes human-readable message for all failed checks', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb(),
          async (order: OrderRequest) => {
            // Setup mocks - multiple failures
            mockKillSwitchService.isActive.mockResolvedValue(true);
            mockKillSwitchService.getState.mockResolvedValue({
              tenantId: order.tenantId,
              active: true,
              activatedAt: new Date().toISOString(),
              activationReason: 'Test activation',
              triggerType: 'MANUAL',
              scope: 'TENANT',
              pendingOrdersCancelled: 0
            });

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: true,
              openBreakers: [],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: true,
              currentValue: 0,
              maxValue: 100,
              remainingCapacity: 100
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status: 'NORMAL',
              currentDrawdownPercent: 0,
              distanceToWarning: 5,
              distanceToMax: 10,
              tradingAllowed: true
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'NORMAL',
              throttlePercent: 0,
              allowNewEntries: true
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // All checks should have a message
            for (const check of result.checks) {
              expect(check.message).toBeDefined();
              expect(check.message.length).toBeGreaterThan(0);
            }

            // Rejection reason should be present
            expect(result.rejectionReason).toBeDefined();
            expect(result.rejectionReason!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('combines multiple failures into rejection reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          orderRequestArb().filter(o => o.side === 'BUY'),
          async (order: OrderRequest) => {
            // Setup mocks - multiple failures
            mockKillSwitchService.isActive.mockResolvedValue(true);
            mockKillSwitchService.getState.mockResolvedValue({
              tenantId: order.tenantId,
              active: true,
              activatedAt: new Date().toISOString(),
              activationReason: 'Test activation',
              triggerType: 'MANUAL',
              scope: 'TENANT',
              pendingOrdersCancelled: 0
            });

            mockCircuitBreakerService.checkBreakers.mockResolvedValue({
              allClosed: false,
              openBreakers: [{
                breakerId: 'test-breaker',
                tenantId: order.tenantId,
                name: 'Test Breaker',
                condition: { type: 'LOSS_RATE', lossPercent: 10, timeWindowMinutes: 5 },
                scope: 'PORTFOLIO',
                state: 'OPEN',
                tripCount: 1,
                cooldownMinutes: 5,
                autoResetEnabled: true
              }],
              halfOpenBreakers: []
            });

            mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
              withinLimit: true,
              currentValue: 0,
              maxValue: 100,
              remainingCapacity: 100
            }]);

            mockDrawdownService.checkDrawdown.mockResolvedValue({
              status: 'NORMAL',
              currentDrawdownPercent: 0,
              distanceToWarning: 5,
              distanceToMax: 10,
              tradingAllowed: true
            });

            mockVolatilityService.checkThrottle.mockResolvedValue({
              level: 'NORMAL',
              throttlePercent: 0,
              allowNewEntries: true
            });

            // Validate the order
            const result = await PreTradeCheckerService.validate(order);

            // Should have multiple failed checks
            const failedChecks = result.checks.filter(c => !c.passed);
            expect(failedChecks.length).toBeGreaterThanOrEqual(2);

            // Rejection reason should mention multiple failures
            expect(result.rejectionReason).toContain('Multiple checks failed');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('provides detailed rejection info via getDetailedRejection', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 100, max: 1000, noNaN: true }),
          fc.double({ min: 50, max: 99, noNaN: true }),
          async (currentValue: number, limitValue: number) => {
            const failedCheck = {
              checkType: 'POSITION_LIMIT' as RiskCheckType,
              passed: false,
              message: `Position limit exceeded: current ${currentValue}, max ${limitValue}`,
              currentValue,
              limitValue
            };

            const detailed = PreTradeCheckerService.getDetailedRejection(failedCheck);

            // Should include all details
            expect(detailed.checkType).toBe('POSITION_LIMIT');
            expect(detailed.message).toContain(currentValue.toString());
            expect(detailed.currentValue).toBe(currentValue);
            expect(detailed.limitValue).toBe(limitValue);
            expect(detailed.exceededBy).toBe(currentValue - limitValue);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Helper function to setup mocks with one specific check failing
 */
function setupMocksWithOneFailure(failingCheck: RiskCheckType, order: OrderRequest) {
  // Default all to pass
  mockKillSwitchService.isActive.mockResolvedValue(false);
  mockKillSwitchService.getState.mockResolvedValue({
    tenantId: order.tenantId,
    active: false,
    triggerType: 'MANUAL',
    scope: 'TENANT',
    pendingOrdersCancelled: 0
  });

  mockCircuitBreakerService.checkBreakers.mockResolvedValue({
    allClosed: true,
    openBreakers: [],
    halfOpenBreakers: []
  });

  mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
    withinLimit: true,
    currentValue: 0,
    maxValue: 100,
    remainingCapacity: 100
  }]);

  mockDrawdownService.checkDrawdown.mockResolvedValue({
    status: 'NORMAL',
    currentDrawdownPercent: 0,
    distanceToWarning: 5,
    distanceToMax: 10,
    tradingAllowed: true
  });

  mockVolatilityService.checkThrottle.mockResolvedValue({
    level: 'NORMAL',
    throttlePercent: 0,
    allowNewEntries: true
  });

  // Now set the specific check to fail
  switch (failingCheck) {
    case 'KILL_SWITCH':
      mockKillSwitchService.isActive.mockResolvedValue(true);
      mockKillSwitchService.getState.mockResolvedValue({
        tenantId: order.tenantId,
        active: true,
        activatedAt: new Date().toISOString(),
        activationReason: 'Test activation',
        triggerType: 'MANUAL',
        scope: 'TENANT',
        pendingOrdersCancelled: 0
      });
      break;

    case 'CIRCUIT_BREAKER':
      mockCircuitBreakerService.checkBreakers.mockResolvedValue({
        allClosed: false,
        openBreakers: [{
          breakerId: 'test-breaker',
          tenantId: order.tenantId,
          name: 'Test Breaker',
          condition: { type: 'LOSS_RATE', lossPercent: 10, timeWindowMinutes: 5 },
          scope: 'PORTFOLIO',
          state: 'OPEN',
          tripCount: 1,
          cooldownMinutes: 5,
          autoResetEnabled: true
        }],
        halfOpenBreakers: []
      });
      break;

    case 'POSITION_LIMIT':
      mockPositionLimitService.checkOrderAgainstLimits.mockResolvedValue([{
        withinLimit: false,
        currentValue: 150,
        maxValue: 100,
        remainingCapacity: 0,
        wouldExceedBy: 50
      }]);
      break;

    case 'DRAWDOWN':
      mockDrawdownService.checkDrawdown.mockResolvedValue({
        status: 'PAUSED',
        currentDrawdownPercent: 15,
        distanceToWarning: 0,
        distanceToMax: 0,
        tradingAllowed: false
      });
      break;

    case 'VOLATILITY':
      mockVolatilityService.checkThrottle.mockResolvedValue({
        level: 'EXTREME',
        throttlePercent: 100,
        allowNewEntries: false
      });
      break;
  }
}
