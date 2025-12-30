import * as fc from 'fast-check';
import { CircuitBreakerService, AuthenticationRequiredError, CircuitBreakerError } from './circuit-breaker';
import { CircuitBreakerRepository } from '../repositories/circuit-breaker';
import { CircuitBreaker, CircuitBreakerState, TradingContext } from '../types/circuit-breaker';
import {
  closedCircuitBreakerArb,
  openCircuitBreakerArb,
  halfOpenCircuitBreakerArb,
  circuitBreakerInputArb,
  tradingContextArb,
  triggeringLossRateScenarioArb,
  triggeringConsecutiveFailuresScenarioArb,
  triggeringPriceDeviationScenarioArb,
  nonTriggeringScenarioArb,
  breakerWithElapsedCooldownArb,
  breakerWithNonElapsedCooldownArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/circuit-breaker');

const mockCircuitBreakerRepo = CircuitBreakerRepository as jest.Mocked<typeof CircuitBreakerRepository>;

describe('CircuitBreakerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCircuitBreakerRepo.clearCache?.();
    mockCircuitBreakerRepo.clearAllEventHistory?.();
  });

  /**
   * Property 11: Circuit Breaker Rules
   * 
   * For any circuit breaker with condition type LOSS_RATE, CONSECUTIVE_FAILURES, 
   * or PRICE_DEVIATION, when the condition is met the breaker SHALL trip to OPEN state, 
   * AND trading for the affected scope SHALL be paused.
   * 
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe('Property 11: Circuit Breaker Rules', () => {
    it('LOSS_RATE condition trips breaker when threshold exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          triggeringLossRateScenarioArb(),
          async ({ breaker, context }) => {
            // Setup mocks
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(breaker);
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [breaker],
              lastEvaluatedKey: undefined
            });
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(0); // Use context value
            mockCircuitBreakerRepo.getConsecutiveFailures.mockReturnValue(0);
            mockCircuitBreakerRepo.getMaxPriceDeviation.mockReturnValue(0);
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...breaker, ...updates };
                return savedBreaker;
              }
            );

            // Check breakers - should trip
            const result = await CircuitBreakerService.checkBreakers(breaker.tenantId, context);

            // Verify breaker was tripped to OPEN state
            expect(result.openBreakers.length).toBeGreaterThan(0);
            expect(savedBreaker?.state).toBe('OPEN');
            expect(savedBreaker?.tripCount).toBe(breaker.tripCount + 1);
            expect(savedBreaker?.lastTrippedAt).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('CONSECUTIVE_FAILURES condition trips breaker when count exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          triggeringConsecutiveFailuresScenarioArb(),
          async ({ breaker, failureCount }) => {
            // Setup mocks
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(breaker);
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [breaker],
              lastEvaluatedKey: undefined
            });
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(0);
            mockCircuitBreakerRepo.getConsecutiveFailures.mockReturnValue(failureCount);
            mockCircuitBreakerRepo.getMaxPriceDeviation.mockReturnValue(0);
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...breaker, ...updates };
                return savedBreaker;
              }
            );

            const context: TradingContext = {};

            // Check breakers - should trip
            const result = await CircuitBreakerService.checkBreakers(breaker.tenantId, context);

            // Verify breaker was tripped to OPEN state
            expect(result.openBreakers.length).toBeGreaterThan(0);
            expect(savedBreaker?.state).toBe('OPEN');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PRICE_DEVIATION condition trips breaker when threshold exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          triggeringPriceDeviationScenarioArb(),
          async ({ breaker, context }) => {
            // Setup mocks
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(breaker);
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [breaker],
              lastEvaluatedKey: undefined
            });
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(0);
            mockCircuitBreakerRepo.getConsecutiveFailures.mockReturnValue(0);
            mockCircuitBreakerRepo.getMaxPriceDeviation.mockReturnValue(0); // Use context value
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...breaker, ...updates };
                return savedBreaker;
              }
            );

            // Check breakers - should trip
            const result = await CircuitBreakerService.checkBreakers(breaker.tenantId, context);

            // Verify breaker was tripped to OPEN state
            expect(result.openBreakers.length).toBeGreaterThan(0);
            expect(savedBreaker?.state).toBe('OPEN');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('breaker does not trip when conditions are not met', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonTriggeringScenarioArb(),
          async ({ breaker, context }) => {
            // Setup mocks
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(breaker);
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [breaker],
              lastEvaluatedKey: undefined
            });
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(0);
            mockCircuitBreakerRepo.getConsecutiveFailures.mockReturnValue(0);
            mockCircuitBreakerRepo.getMaxPriceDeviation.mockReturnValue(0);
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);

            // Check breakers - should NOT trip
            const result = await CircuitBreakerService.checkBreakers(breaker.tenantId, context);

            // Verify all breakers remain closed
            expect(result.allClosed).toBe(true);
            expect(result.openBreakers.length).toBe(0);
            expect(mockCircuitBreakerRepo.updateBreaker).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('tripBreaker transitions to OPEN state and increments trip count', async () => {
      await fc.assert(
        fc.asyncProperty(
          closedCircuitBreakerArb(),
          fc.string({ minLength: 5, maxLength: 100 }),
          async (breaker, reason) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(breaker);

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...breaker, ...updates };
                return savedBreaker;
              }
            );

            const alertsSent: any[] = [];
            const alertCallback = async (alert: any) => {
              alertsSent.push(alert);
            };

            const result = await CircuitBreakerService.tripBreaker(
              breaker.tenantId,
              breaker.breakerId,
              reason,
              alertCallback
            );

            // Verify state transition
            expect(result.state).toBe('OPEN');
            expect(savedBreaker?.state).toBe('OPEN');
            expect(savedBreaker?.tripCount).toBe(breaker.tripCount + 1);
            expect(savedBreaker?.lastTrippedAt).toBeDefined();

            // Verify alert was sent
            expect(alertsSent.length).toBe(1);
            expect(alertsSent[0].alertType).toBe('TRIPPED');
            expect(alertsSent[0].newState).toBe('OPEN');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('checkBreakers returns open breakers for pausing trading', async () => {
      await fc.assert(
        fc.asyncProperty(
          openCircuitBreakerArb(),
          async (openBreaker) => {
            // Create context that matches the breaker's scope
            const context: TradingContext = {
              strategyId: openBreaker.scope === 'STRATEGY' ? openBreaker.scopeId : undefined,
              assetId: openBreaker.scope === 'ASSET' ? openBreaker.scopeId : undefined
            };

            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [openBreaker],
              lastEvaluatedKey: undefined
            });

            const result = await CircuitBreakerService.checkBreakers(openBreaker.tenantId, context);

            // Verify open breakers are returned
            expect(result.allClosed).toBe(false);
            expect(result.openBreakers.length).toBe(1);
            expect(result.openBreakers[0].breakerId).toBe(openBreaker.breakerId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isTradingAllowed returns false when breakers are open', async () => {
      await fc.assert(
        fc.asyncProperty(
          openCircuitBreakerArb(),
          async (openBreaker) => {
            // Create context that matches the breaker's scope
            const context: TradingContext = {
              strategyId: openBreaker.scope === 'STRATEGY' ? openBreaker.scopeId : undefined,
              assetId: openBreaker.scope === 'ASSET' ? openBreaker.scopeId : undefined
            };

            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [openBreaker],
              lastEvaluatedKey: undefined
            });

            const allowed = await CircuitBreakerService.isTradingAllowed(openBreaker.tenantId, context);

            expect(allowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isTradingAllowed returns true when all breakers are closed', async () => {
      await fc.assert(
        fc.asyncProperty(
          closedCircuitBreakerArb(),
          async (closedBreaker) => {
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [closedBreaker],
              lastEvaluatedKey: undefined
            });
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(0);
            mockCircuitBreakerRepo.getConsecutiveFailures.mockReturnValue(0);
            mockCircuitBreakerRepo.getMaxPriceDeviation.mockReturnValue(0);
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);

            const context: TradingContext = {
              recentLossPercent: 0,
              recentErrorRate: 0,
              priceDeviation: 0
            };

            const allowed = await CircuitBreakerService.isTradingAllowed(closedBreaker.tenantId, context);

            expect(allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 12: Circuit Breaker Auto-Reset
   * 
   * For any circuit breaker in OPEN state with autoResetEnabled=true, after cooldownMinutes 
   * have elapsed the breaker SHALL transition to HALF_OPEN, AND if no new triggers occur 
   * it SHALL transition to CLOSED.
   * 
   * **Validates: Requirements 5.5**
   */
  describe('Property 12: Circuit Breaker Auto-Reset', () => {
    it('breaker with elapsed cooldown transitions OPEN -> HALF_OPEN', async () => {
      await fc.assert(
        fc.asyncProperty(
          breakerWithElapsedCooldownArb(),
          async (breaker) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(breaker);
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [breaker],
              lastEvaluatedKey: undefined
            });

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...breaker, ...updates };
                return savedBreaker;
              }
            );

            // Verify cooldown is elapsed
            expect(CircuitBreakerService.isCooldownElapsed(breaker)).toBe(true);

            // Process auto-reset
            const transitioned = await CircuitBreakerService.processAutoReset(breaker.tenantId);

            // Verify transition to HALF_OPEN
            expect(transitioned.length).toBeGreaterThan(0);
            expect(savedBreaker?.state).toBe('HALF_OPEN');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('breaker with non-elapsed cooldown remains in OPEN state', async () => {
      await fc.assert(
        fc.asyncProperty(
          breakerWithNonElapsedCooldownArb(),
          async (breaker) => {
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [breaker],
              lastEvaluatedKey: undefined
            });

            // Verify cooldown is NOT elapsed
            expect(CircuitBreakerService.isCooldownElapsed(breaker)).toBe(false);

            // Process auto-reset
            const transitioned = await CircuitBreakerService.processAutoReset(breaker.tenantId);

            // Verify no transition occurred
            expect(transitioned.length).toBe(0);
            expect(mockCircuitBreakerRepo.updateBreaker).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('HALF_OPEN breaker transitions to CLOSED when conditions clear', async () => {
      await fc.assert(
        fc.asyncProperty(
          halfOpenCircuitBreakerArb(),
          async (breaker) => {
            // Ensure autoResetEnabled
            const autoResetBreaker = { ...breaker, autoResetEnabled: true };
            
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(autoResetBreaker);
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [autoResetBreaker],
              lastEvaluatedKey: undefined
            });
            // Return values below any threshold
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(0);
            mockCircuitBreakerRepo.getConsecutiveFailures.mockReturnValue(0);
            mockCircuitBreakerRepo.getMaxPriceDeviation.mockReturnValue(0);
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);
            mockCircuitBreakerRepo.clearEventHistory.mockImplementation(() => {});

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...autoResetBreaker, ...updates };
                return savedBreaker;
              }
            );

            // Process auto-reset
            const transitioned = await CircuitBreakerService.processAutoReset(autoResetBreaker.tenantId);

            // Verify transition to CLOSED
            expect(transitioned.length).toBeGreaterThan(0);
            expect(savedBreaker?.state).toBe('CLOSED');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('HALF_OPEN breaker re-trips when conditions still triggered', async () => {
      await fc.assert(
        fc.asyncProperty(
          halfOpenCircuitBreakerArb(),
          async (breaker) => {
            // Create breaker with LOSS_RATE condition
            const lossRateBreaker: CircuitBreaker = {
              ...breaker,
              autoResetEnabled: true,
              condition: {
                type: 'LOSS_RATE',
                lossPercent: 10,
                timeWindowMinutes: 10
              }
            };
            
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(lossRateBreaker);
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [lossRateBreaker],
              lastEvaluatedKey: undefined
            });
            // Return loss rate above threshold
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(15);
            mockCircuitBreakerRepo.getConsecutiveFailures.mockReturnValue(0);
            mockCircuitBreakerRepo.getMaxPriceDeviation.mockReturnValue(0);
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...lossRateBreaker, ...updates };
                return savedBreaker;
              }
            );

            // Process auto-reset
            const transitioned = await CircuitBreakerService.processAutoReset(lossRateBreaker.tenantId);

            // Verify re-trip to OPEN
            expect(transitioned.length).toBeGreaterThan(0);
            expect(savedBreaker?.state).toBe('OPEN');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('breaker with autoResetEnabled=false does not auto-reset', async () => {
      await fc.assert(
        fc.asyncProperty(
          breakerWithElapsedCooldownArb(),
          async (breaker) => {
            // Disable auto-reset
            const noAutoResetBreaker = { ...breaker, autoResetEnabled: false };
            
            mockCircuitBreakerRepo.listBreakers.mockResolvedValue({
              items: [noAutoResetBreaker],
              lastEvaluatedKey: undefined
            });

            // Process auto-reset
            const transitioned = await CircuitBreakerService.processAutoReset(noAutoResetBreaker.tenantId);

            // Verify no transition occurred
            expect(transitioned.length).toBe(0);
            expect(mockCircuitBreakerRepo.updateBreaker).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('transitionToHalfOpen only works from OPEN state', async () => {
      await fc.assert(
        fc.asyncProperty(
          closedCircuitBreakerArb(),
          async (closedBreaker) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(closedBreaker);

            // Attempt transition from CLOSED should fail
            await expect(
              CircuitBreakerService.transitionToHalfOpen(closedBreaker.tenantId, closedBreaker.breakerId)
            ).rejects.toThrow(CircuitBreakerError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 13: Circuit Breaker Manual Override
   * 
   * For any circuit breaker manual reset, the operation SHALL require authentication 
   * if configured, AND the reset SHALL be logged with the authenticating user.
   * 
   * **Validates: Requirements 5.6**
   */
  describe('Property 13: Circuit Breaker Manual Override', () => {
    it('manual reset of OPEN breaker requires authentication', async () => {
      await fc.assert(
        fc.asyncProperty(
          openCircuitBreakerArb(),
          fc.constantFrom('', '   ', null, undefined),
          async (openBreaker, invalidToken) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(openBreaker);

            // Attempt reset with invalid token should throw
            await expect(
              CircuitBreakerService.resetBreaker(
                openBreaker.tenantId,
                openBreaker.breakerId,
                invalidToken as string
              )
            ).rejects.toThrow(AuthenticationRequiredError);

            // State should not be updated
            expect(mockCircuitBreakerRepo.updateBreaker).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('manual reset with valid token succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          openCircuitBreakerArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (openBreaker, validToken) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(openBreaker);
            mockCircuitBreakerRepo.clearEventHistory.mockImplementation(() => {});

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...openBreaker, ...updates };
                return savedBreaker;
              }
            );

            const alertsSent: any[] = [];
            const alertCallback = async (alert: any) => {
              alertsSent.push(alert);
            };

            const result = await CircuitBreakerService.resetBreaker(
              openBreaker.tenantId,
              openBreaker.breakerId,
              validToken,
              alertCallback
            );

            // Verify state is now CLOSED
            expect(result.state).toBe('CLOSED');
            expect(savedBreaker?.state).toBe('CLOSED');

            // Verify alert was sent
            expect(alertsSent.length).toBe(1);
            expect(alertsSent[0].alertType).toBe('CLOSED');
            expect(alertsSent[0].reason).toBe('Manual reset');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('reset clears event history', async () => {
      await fc.assert(
        fc.asyncProperty(
          openCircuitBreakerArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (openBreaker, validToken) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(openBreaker);
            mockCircuitBreakerRepo.updateBreaker.mockResolvedValue({ ...openBreaker, state: 'CLOSED' });

            let eventHistoryCleared = false;
            mockCircuitBreakerRepo.clearEventHistory.mockImplementation(() => {
              eventHistoryCleared = true;
            });

            await CircuitBreakerService.resetBreaker(
              openBreaker.tenantId,
              openBreaker.breakerId,
              validToken
            );

            // Verify event history was cleared
            expect(eventHistoryCleared).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('reset fails when breaker not found', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (tenantId, breakerId, validToken) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(null);

            await expect(
              CircuitBreakerService.resetBreaker(tenantId, breakerId, validToken)
            ).rejects.toThrow(CircuitBreakerError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('HALF_OPEN breaker can be reset without authentication', async () => {
      await fc.assert(
        fc.asyncProperty(
          halfOpenCircuitBreakerArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (halfOpenBreaker, token) => {
            mockCircuitBreakerRepo.getBreaker.mockResolvedValue(halfOpenBreaker);
            mockCircuitBreakerRepo.clearEventHistory.mockImplementation(() => {});

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.updateBreaker.mockImplementation(
              async (_tid: string, _bid: string, updates: Partial<CircuitBreaker>) => {
                savedBreaker = { ...halfOpenBreaker, ...updates };
                return savedBreaker;
              }
            );

            const result = await CircuitBreakerService.resetBreaker(
              halfOpenBreaker.tenantId,
              halfOpenBreaker.breakerId,
              token
            );

            // Verify state is now CLOSED
            expect(result.state).toBe('CLOSED');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('createBreaker', () => {
    it('creates breaker with CLOSED state and zero trip count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          circuitBreakerInputArb(),
          async (tenantId, input) => {
            mockCircuitBreakerRepo.putBreaker.mockResolvedValue();

            let savedBreaker: CircuitBreaker | undefined;
            mockCircuitBreakerRepo.putBreaker.mockImplementation(async (_tid: string, breaker: CircuitBreaker) => {
              savedBreaker = breaker;
            });

            const result = await CircuitBreakerService.createBreaker(tenantId, input);

            // Verify initial state
            expect(result.state).toBe('CLOSED');
            expect(result.tripCount).toBe(0);
            expect(result.tenantId).toBe(tenantId);
            expect(result.name).toBe(input.name);
            expect(result.condition).toEqual(input.condition);
            expect(result.scope).toBe(input.scope);
            expect(result.cooldownMinutes).toBe(input.cooldownMinutes);
            expect(result.autoResetEnabled).toBe(input.autoResetEnabled);

            // Verify saved
            expect(savedBreaker).toBeDefined();
            expect(savedBreaker?.breakerId).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('evaluateCondition', () => {
    it('correctly evaluates LOSS_RATE condition', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.double({ min: 5, max: 30, noNaN: true }),
          fc.integer({ min: 1, max: 60 }),
          fc.double({ min: 0, max: 50, noNaN: true }),
          (tenantId, breakerId, threshold, timeWindow, contextLoss) => {
            mockCircuitBreakerRepo.calculateLossRate.mockReturnValue(0);

            const condition = {
              type: 'LOSS_RATE' as const,
              lossPercent: threshold,
              timeWindowMinutes: timeWindow
            };

            const context: TradingContext = {
              recentLossPercent: contextLoss
            };

            const result = CircuitBreakerService.evaluateCondition(
              tenantId,
              breakerId,
              condition,
              context
            );

            // Verify evaluation
            expect(result.triggered).toBe(contextLoss >= threshold);
            expect(result.currentValue).toBe(contextLoss);
            expect(result.threshold).toBe(threshold);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('correctly evaluates ERROR_RATE condition', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.double({ min: 10, max: 80, noNaN: true }),
          fc.integer({ min: 10, max: 100 }),
          fc.double({ min: 0, max: 100, noNaN: true }),
          (tenantId, breakerId, threshold, sampleSize, contextErrorRate) => {
            mockCircuitBreakerRepo.calculateErrorRate.mockReturnValue(0);

            const condition = {
              type: 'ERROR_RATE' as const,
              errorPercent: threshold,
              sampleSize
            };

            const context: TradingContext = {
              recentErrorRate: contextErrorRate
            };

            const result = CircuitBreakerService.evaluateCondition(
              tenantId,
              breakerId,
              condition,
              context
            );

            // Verify evaluation
            expect(result.triggered).toBe(contextErrorRate >= threshold);
            expect(result.currentValue).toBe(contextErrorRate);
            expect(result.threshold).toBe(threshold);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
