import * as fc from 'fast-check';
import { KillSwitchService, AuthenticationRequiredError, KillSwitchStateError } from './kill-switch';
import { KillSwitchRepository } from '../repositories/kill-switch';
import { KillSwitchState, KillSwitchConfig, KillSwitchScope } from '../types/kill-switch';
import {
  activeKillSwitchStateArb,
  inactiveKillSwitchStateArb,
  killSwitchConfigArb,
  killSwitchScopeArb,
  triggeringAutoKillScenarioArb,
  nonTriggeringAutoKillScenarioArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/kill-switch');

const mockKillSwitchRepo = KillSwitchRepository as jest.Mocked<typeof KillSwitchRepository>;

describe('KillSwitchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the in-memory cache before each test
    mockKillSwitchRepo.clearCache?.();
  });

  /**
   * Property 9: Kill Switch Behavior
   * 
   * For any kill switch activation (manual or automatic), all pending orders SHALL be 
   * cancelled, all new orders SHALL be rejected, AND the activation SHALL be logged 
   * with timestamp, reason, and trigger type.
   * 
   * **Validates: Requirements 4.1, 4.2, 4.3**
   */
  describe('Property 9: Kill Switch Behavior', () => {
    it('activation cancels pending orders and blocks new orders', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 200 }),
          killSwitchScopeArb(),
          fc.integer({ min: 0, max: 100 }),
          async (tenantId, reason, scope, pendingOrderCount) => {
            // Setup: no existing active kill switch
            mockKillSwitchRepo.getState.mockResolvedValue(null);
            mockKillSwitchRepo.putState.mockResolvedValue();
            mockKillSwitchRepo.isActive.mockResolvedValue(false);

            let savedState: KillSwitchState | undefined;
            mockKillSwitchRepo.putState.mockImplementation(async (_tid: string, state: KillSwitchState) => {
              savedState = state;
            });

            // Track cancelled orders
            let ordersCancelled = 0;
            const cancelOrdersCallback = async (_tid: string, _s: KillSwitchScope) => {
              ordersCancelled = pendingOrderCount;
              return pendingOrderCount;
            };

            // Track alerts
            const alertsSent: any[] = [];
            const alertCallback = async (alert: any) => {
              alertsSent.push(alert);
            };

            // Activate kill switch
            const result = await KillSwitchService.activate(
              tenantId,
              reason,
              scope,
              'user-123',
              'MANUAL',
              cancelOrdersCallback,
              alertCallback
            );

            // Verify pending orders were cancelled
            expect(result.ordersCancelled).toBe(pendingOrderCount);
            expect(ordersCancelled).toBe(pendingOrderCount);

            // Verify state is active
            expect(result.state.active).toBe(true);
            expect(savedState!.active).toBe(true);

            // Verify activation is logged with required fields
            expect(savedState!.activatedAt).toBeDefined();
            expect(savedState!.activationReason).toBe(reason);
            expect(savedState!.triggerType).toBe('MANUAL');
            expect(savedState!.scope).toBe(scope.type);

            // Verify alert was sent
            expect(alertsSent.length).toBe(1);
            expect(alertsSent[0].alertType).toBe('ACTIVATED');
            expect(alertsSent[0].reason).toBe(reason);
            expect(alertsSent[0].triggerType).toBe('MANUAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('automatic activation logs trigger type as AUTOMATIC', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 5, maxLength: 200 }),
          async (tenantId, reason) => {
            mockKillSwitchRepo.getState.mockResolvedValue(null);
            mockKillSwitchRepo.putState.mockResolvedValue();
            mockKillSwitchRepo.isActive.mockResolvedValue(false);

            let savedState: KillSwitchState | undefined;
            mockKillSwitchRepo.putState.mockImplementation(async (_tid: string, state: KillSwitchState) => {
              savedState = state;
            });

            const alertsSent: any[] = [];
            const alertCallback = async (alert: any) => {
              alertsSent.push(alert);
            };

            // Activate with AUTOMATIC trigger type
            const result = await KillSwitchService.activate(
              tenantId,
              reason,
              { type: 'TENANT' },
              'SYSTEM',
              'AUTOMATIC',
              undefined,
              alertCallback
            );

            // Verify trigger type is AUTOMATIC
            expect(result.state.triggerType).toBe('AUTOMATIC');
            expect(savedState!.triggerType).toBe('AUTOMATIC');

            // Verify alert indicates auto-trigger
            expect(alertsSent[0].alertType).toBe('AUTO_TRIGGERED');
            expect(alertsSent[0].triggerType).toBe('AUTOMATIC');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isActive returns true when kill switch is active', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeKillSwitchStateArb(),
          async (activeState) => {
            mockKillSwitchRepo.isActive.mockResolvedValue(true);

            const isActive = await KillSwitchService.isActive(activeState.tenantId);

            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isActive returns false when kill switch is inactive', async () => {
      await fc.assert(
        fc.asyncProperty(
          inactiveKillSwitchStateArb(),
          async (inactiveState) => {
            mockKillSwitchRepo.isActive.mockResolvedValue(false);

            const isActive = await KillSwitchService.isActive(inactiveState.tenantId);

            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('activation is idempotent - already active returns current state', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeKillSwitchStateArb(),
          fc.string({ minLength: 5, maxLength: 200 }),
          async (existingState, newReason) => {
            mockKillSwitchRepo.getState.mockResolvedValue(existingState);

            const result = await KillSwitchService.activate(
              existingState.tenantId,
              newReason
            );

            // Should return existing state without changes
            expect(result.state).toEqual(existingState);
            expect(result.ordersCancelled).toBe(0);
            expect(result.alertSent).toBe(false);

            // putState should not be called
            expect(mockKillSwitchRepo.putState).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('auto-triggers activate kill switch when conditions are met', async () => {
      await fc.assert(
        fc.asyncProperty(
          triggeringAutoKillScenarioArb(),
          async ({ config, event }) => {
            mockKillSwitchRepo.getDefaultConfig.mockResolvedValue(config);
            mockKillSwitchRepo.isActive.mockResolvedValue(false);
            mockKillSwitchRepo.getState.mockResolvedValue(null);
            mockKillSwitchRepo.putState.mockResolvedValue();

            let wasActivated = false;
            mockKillSwitchRepo.putState.mockImplementation(async (tid, state) => {
              if (state.active) {
                wasActivated = true;
              }
            });

            const triggered = await KillSwitchService.checkAutoTriggers(
              config.tenantId,
              event
            );

            expect(triggered).toBe(true);
            expect(wasActivated).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('auto-triggers do not activate when conditions are not met', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonTriggeringAutoKillScenarioArb(),
          async ({ config, event }) => {
            mockKillSwitchRepo.getDefaultConfig.mockResolvedValue(config);
            mockKillSwitchRepo.isActive.mockResolvedValue(false);

            const triggered = await KillSwitchService.checkAutoTriggers(
              config.tenantId,
              event
            );

            expect(triggered).toBe(false);
            expect(mockKillSwitchRepo.putState).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Kill Switch Deactivation Authentication
   * 
   * For any kill switch deactivation attempt, the operation SHALL require valid 
   * authentication, AND deactivation without authentication SHALL be rejected.
   * 
   * **Validates: Requirements 4.5**
   */
  describe('Property 10: Kill Switch Deactivation Authentication', () => {
    it('deactivation requires valid authentication token', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeKillSwitchStateArb(),
          fc.constantFrom('', '   ', null, undefined),
          async (activeState, invalidToken) => {
            mockKillSwitchRepo.getState.mockResolvedValue(activeState);

            // Attempt deactivation with invalid token should throw
            await expect(
              KillSwitchService.deactivate(
                activeState.tenantId,
                invalidToken as string
              )
            ).rejects.toThrow(AuthenticationRequiredError);

            // State should not be updated
            expect(mockKillSwitchRepo.putState).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deactivation with valid token succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeKillSwitchStateArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (activeState, validToken) => {
            mockKillSwitchRepo.getState.mockResolvedValue(activeState);
            mockKillSwitchRepo.getDefaultConfig.mockResolvedValue(null);

            let savedState: KillSwitchState | undefined;
            mockKillSwitchRepo.putState.mockImplementation(async (_tid: string, state: KillSwitchState) => {
              savedState = state;
            });

            const result = await KillSwitchService.deactivate(
              activeState.tenantId,
              validToken
            );

            // Verify state is now inactive
            expect(result.active).toBe(false);
            expect(savedState!.active).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deactivation fails when kill switch is not active', async () => {
      await fc.assert(
        fc.asyncProperty(
          inactiveKillSwitchStateArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (inactiveState, validToken) => {
            mockKillSwitchRepo.getState.mockResolvedValue(inactiveState);

            await expect(
              KillSwitchService.deactivate(
                inactiveState.tenantId,
                validToken
              )
            ).rejects.toThrow(KillSwitchStateError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deactivation fails when no state exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (tenantId, validToken) => {
            mockKillSwitchRepo.getState.mockResolvedValue(null);

            await expect(
              KillSwitchService.deactivate(tenantId, validToken)
            ).rejects.toThrow(KillSwitchStateError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deactivation sends alert when callback provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeKillSwitchStateArb(),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (activeState, validToken) => {
            mockKillSwitchRepo.getState.mockResolvedValue(activeState);
            mockKillSwitchRepo.getDefaultConfig.mockResolvedValue(null);
            mockKillSwitchRepo.putState.mockResolvedValue();

            const alertsSent: any[] = [];
            const alertCallback = async (alert: any) => {
              alertsSent.push(alert);
            };

            await KillSwitchService.deactivate(
              activeState.tenantId,
              validToken,
              alertCallback
            );

            expect(alertsSent.length).toBe(1);
            expect(alertsSent[0].alertType).toBe('DEACTIVATED');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getState', () => {
    it('returns default inactive state when no state exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (tenantId) => {
            mockKillSwitchRepo.getState.mockResolvedValue(null);

            const state = await KillSwitchService.getState(tenantId);

            expect(state.tenantId).toBe(tenantId);
            expect(state.active).toBe(false);
            expect(state.scope).toBe('TENANT');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns existing state when present', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeKillSwitchStateArb(),
          async (existingState) => {
            mockKillSwitchRepo.getState.mockResolvedValue(existingState);

            const state = await KillSwitchService.getState(existingState.tenantId);

            expect(state).toEqual(existingState);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('evaluateTriggerCondition', () => {
    it('RAPID_LOSS triggers when loss exceeds threshold', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 5, max: 50, noNaN: true }),
          fc.integer({ min: 1, max: 60 }),
          (threshold, timeWindow) => {
            const condition = {
              type: 'RAPID_LOSS' as const,
              lossPercent: threshold,
              timeWindowMinutes: timeWindow
            };

            // Event with loss above threshold
            const triggeringEvent = {
              eventType: 'DRAWDOWN_BREACH' as const,
              severity: 'CRITICAL',
              lossPercent: threshold + 5,
              timestamp: new Date().toISOString()
            };

            // Event with loss below threshold
            const nonTriggeringEvent = {
              eventType: 'DRAWDOWN_WARNING' as const,
              severity: 'WARNING',
              lossPercent: threshold - 1,
              timestamp: new Date().toISOString()
            };

            expect(KillSwitchService.evaluateTriggerCondition(condition, triggeringEvent)).toBe(true);
            expect(KillSwitchService.evaluateTriggerCondition(condition, nonTriggeringEvent)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('ERROR_RATE triggers when error rate exceeds threshold', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 10, max: 80, noNaN: true }),
          fc.integer({ min: 1, max: 60 }),
          (threshold, timeWindow) => {
            const condition = {
              type: 'ERROR_RATE' as const,
              errorPercent: threshold,
              timeWindowMinutes: timeWindow
            };

            // Event with error rate above threshold
            const triggeringEvent = {
              eventType: 'EXCHANGE_ERROR' as const,
              severity: 'CRITICAL',
              errorRate: threshold + 10,
              timestamp: new Date().toISOString()
            };

            // Event with error rate below threshold
            const nonTriggeringEvent = {
              eventType: 'EXCHANGE_ERROR' as const,
              severity: 'WARNING',
              errorRate: threshold - 5,
              timestamp: new Date().toISOString()
            };

            expect(KillSwitchService.evaluateTriggerCondition(condition, triggeringEvent)).toBe(true);
            expect(KillSwitchService.evaluateTriggerCondition(condition, nonTriggeringEvent)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('SYSTEM_ERROR triggers when error type matches', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom('CONNECTION_LOST', 'EXCHANGE_ERROR', 'DATA_CORRUPTION', 'TIMEOUT'),
            { minLength: 1, maxLength: 4 }
          ),
          (errorTypes) => {
            const condition = {
              type: 'SYSTEM_ERROR' as const,
              errorTypes
            };

            // Event with matching error type
            const triggeringEvent = {
              eventType: 'EXCHANGE_ERROR' as const,
              severity: 'EMERGENCY',
              errorType: errorTypes[0],
              timestamp: new Date().toISOString()
            };

            // Event with non-matching error type
            const nonTriggeringEvent = {
              eventType: 'EXCHANGE_ERROR' as const,
              severity: 'WARNING',
              errorType: 'UNKNOWN_ERROR',
              timestamp: new Date().toISOString()
            };

            expect(KillSwitchService.evaluateTriggerCondition(condition, triggeringEvent)).toBe(true);
            expect(KillSwitchService.evaluateTriggerCondition(condition, nonTriggeringEvent)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
