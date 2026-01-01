import * as fc from 'fast-check';
import { DrawdownService } from './drawdown';
import { DrawdownRepository } from '../repositories/drawdown';
import { DrawdownState, DrawdownStatus } from '../types/drawdown';
import {
  drawdownValuePairArb,
  drawdownThresholdCrossingArb,
  normalDrawdownStateArb,
  pausedDrawdownStateArb,
  drawdownStateArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository
jest.mock('../repositories/drawdown');

const mockDrawdownRepo = DrawdownRepository as jest.Mocked<typeof DrawdownRepository>;

describe('DrawdownService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateDrawdown', () => {
    it('should calculate drawdown correctly for various peak and current values', () => {
      fc.assert(
        fc.property(
          drawdownValuePairArb(),
          ({ peakValue, currentValue, expectedDrawdownPercent }) => {
            const result = DrawdownService.calculateDrawdown(peakValue, currentValue);
            
            // Allow small floating point tolerance
            expect(result.percent).toBeCloseTo(expectedDrawdownPercent, 5);
            expect(result.absolute).toBeCloseTo(peakValue - currentValue, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 drawdown when peak value is 0 or negative', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1000000, max: 0, noNaN: true }),
          fc.double({ min: 0, max: 1000000, noNaN: true }),
          (peakValue, currentValue) => {
            const result = DrawdownService.calculateDrawdown(peakValue, currentValue);
            expect(result.percent).toBe(0);
            expect(result.absolute).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp drawdown percentage between 0 and 100', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1000, max: 1000000, noNaN: true }),
          fc.double({ min: -1000000, max: 2000000, noNaN: true }),
          (peakValue, currentValue) => {
            const result = DrawdownService.calculateDrawdown(peakValue, currentValue);
            expect(result.percent).toBeGreaterThanOrEqual(0);
            expect(result.percent).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('determineStatus', () => {
    it('should return NORMAL when drawdown is below warning threshold', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 5, max: 20, noNaN: true }),
          fc.double({ min: 10, max: 50, noNaN: true }),
          (warningThreshold, maxThreshold) => {
            fc.pre(warningThreshold < maxThreshold);
            const drawdownPercent = warningThreshold - 1;
            
            const status = DrawdownService.determineStatus(
              drawdownPercent,
              warningThreshold,
              maxThreshold
            );
            
            expect(status).toBe('NORMAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return WARNING when drawdown is between warning and max threshold', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 5, max: 15, noNaN: true }),
          fc.double({ min: 20, max: 50, noNaN: true }),
          (warningThreshold, maxThreshold) => {
            const drawdownPercent = (warningThreshold + maxThreshold) / 2;
            
            const status = DrawdownService.determineStatus(
              drawdownPercent,
              warningThreshold,
              maxThreshold
            );
            
            expect(status).toBe('WARNING');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return CRITICAL when drawdown exceeds max threshold', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 5, max: 15, noNaN: true }),
          fc.double({ min: 20, max: 40, noNaN: true }),
          (warningThreshold, maxThreshold) => {
            const drawdownPercent = maxThreshold + 5;
            
            const status = DrawdownService.determineStatus(
              drawdownPercent,
              warningThreshold,
              maxThreshold
            );
            
            expect(status).toBe('CRITICAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve PAUSED status regardless of drawdown value', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100, noNaN: true }),
          fc.double({ min: 5, max: 20, noNaN: true }),
          fc.double({ min: 10, max: 50, noNaN: true }),
          (drawdownPercent, warningThreshold, maxThreshold) => {
            fc.pre(warningThreshold < maxThreshold);
            
            const status = DrawdownService.determineStatus(
              drawdownPercent,
              warningThreshold,
              maxThreshold,
              'PAUSED'
            );
            
            expect(status).toBe('PAUSED');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Drawdown Monitoring and Pause
   * 
   * For any portfolio or strategy, the drawdown percentage SHALL equal 
   * ((peakValue - currentValue) / peakValue) * 100, AND when drawdown exceeds 
   * warningThreshold an alert SHALL be sent, AND when drawdown exceeds 
   * maxThreshold trading SHALL be paused.
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   */
  describe('Property 4: Drawdown Monitoring and Pause', () => {
    it('drawdown percentage equals ((peakValue - currentValue) / peakValue) * 100', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.double({ min: 100000, max: 1000000, noNaN: true }),
          fc.double({ min: 5, max: 15, noNaN: true }),
          fc.double({ min: 20, max: 40, noNaN: true }),
          fc.double({ min: 0.5, max: 0.95, noNaN: true }), // Value as fraction of peak
          async (tenantId, strategyId, peakValue, warningThreshold, maxThreshold, valueFraction) => {
            fc.pre(warningThreshold < maxThreshold);
            
            const currentValue = peakValue * valueFraction;
            const expectedDrawdownPercent = ((peakValue - currentValue) / peakValue) * 100;

            // Setup mock to return existing state
            const existingState: DrawdownState = {
              stateId: 'state-1',
              tenantId,
              strategyId,
              scope: 'STRATEGY',
              peakValue,
              currentValue: peakValue, // Start at peak
              drawdownPercent: 0,
              drawdownAbsolute: 0,
              warningThreshold,
              maxThreshold,
              status: 'NORMAL',
              lastResetAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(existingState);
            mockDrawdownRepo.updateState.mockImplementation(async (tid, sid, updates) => ({
              ...existingState,
              ...updates,
              updatedAt: new Date().toISOString()
            }));

            const result = await DrawdownService.updateValue(tenantId, strategyId, currentValue);

            // Verify drawdown calculation formula
            expect(result.drawdownPercent).toBeCloseTo(expectedDrawdownPercent, 5);
            expect(result.drawdownAbsolute).toBeCloseTo(peakValue - currentValue, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sends warning alert when drawdown exceeds warning threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.double({ min: 100000, max: 1000000, noNaN: true }),
          fc.double({ min: 5, max: 15, noNaN: true }),
          fc.double({ min: 25, max: 40, noNaN: true }),
          async (tenantId, strategyId, peakValue, warningThreshold, maxThreshold) => {
            fc.pre(warningThreshold < maxThreshold);
            
            // Value that causes drawdown just above warning threshold
            const targetDrawdown = warningThreshold + 2;
            const newValue = peakValue * (1 - targetDrawdown / 100);

            const existingState: DrawdownState = {
              stateId: 'state-1',
              tenantId,
              strategyId,
              scope: 'STRATEGY',
              peakValue,
              currentValue: peakValue,
              drawdownPercent: 0,
              drawdownAbsolute: 0,
              warningThreshold,
              maxThreshold,
              status: 'NORMAL',
              lastResetAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(existingState);
            mockDrawdownRepo.updateState.mockImplementation(async (tid, sid, updates) => ({
              ...existingState,
              ...updates,
              updatedAt: new Date().toISOString()
            }));

            const alertsSent: any[] = [];
            const alertCallback = async (alert: any) => {
              alertsSent.push(alert);
            };

            const result = await DrawdownService.monitorAndUpdate(
              tenantId,
              strategyId,
              newValue,
              alertCallback
            );

            // Verify warning alert was sent
            expect(result.alertSent).toBe(true);
            expect(result.alertType).toBe('WARNING');
            expect(alertsSent.length).toBeGreaterThanOrEqual(1);
            expect(alertsSent[0].alertType).toBe('WARNING');
            expect(alertsSent[0].drawdownPercent).toBeGreaterThanOrEqual(warningThreshold);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('pauses trading when drawdown exceeds max threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.double({ min: 100000, max: 1000000, noNaN: true }),
          fc.double({ min: 5, max: 15, noNaN: true }),
          fc.double({ min: 20, max: 35, noNaN: true }),
          async (tenantId, strategyId, peakValue, warningThreshold, maxThreshold) => {
            fc.pre(warningThreshold < maxThreshold);
            
            // Value that causes drawdown above max threshold
            const targetDrawdown = maxThreshold + 5;
            const newValue = peakValue * (1 - targetDrawdown / 100);

            const existingState: DrawdownState = {
              stateId: 'state-1',
              tenantId,
              strategyId,
              scope: 'STRATEGY',
              peakValue,
              currentValue: peakValue,
              drawdownPercent: 0,
              drawdownAbsolute: 0,
              warningThreshold,
              maxThreshold,
              status: 'NORMAL',
              lastResetAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            let pausedState: DrawdownState | null = null;

            mockDrawdownRepo.getStateByStrategy.mockImplementation(async () => 
              pausedState ?? existingState
            );
            mockDrawdownRepo.updateState.mockImplementation(async (tid, sid, updates) => {
              const updated = {
                ...existingState,
                ...updates,
                updatedAt: new Date().toISOString()
              };
              if (updates.status === 'PAUSED') {
                pausedState = updated;
              }
              return updated;
            });

            const alertsSent: any[] = [];
            const alertCallback = async (alert: any) => {
              alertsSent.push(alert);
            };

            const result = await DrawdownService.monitorAndUpdate(
              tenantId,
              strategyId,
              newValue,
              alertCallback
            );

            // Verify strategy was paused
            expect(result.actionTaken).toBe('PAUSED');
            expect(result.alertSent).toBe(true);
            
            // Verify pause alert was sent
            const pauseAlert = alertsSent.find(a => a.alertType === 'PAUSED');
            expect(pauseAlert).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('checkDrawdown returns tradingAllowed=false when status is PAUSED or CRITICAL', async () => {
      await fc.assert(
        fc.asyncProperty(
          pausedDrawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined for this test
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);
            mockDrawdownRepo.getPortfolioState.mockResolvedValue(null);

            const result = await DrawdownService.checkDrawdown(
              testState.tenantId,
              testState.strategyId
            );

            expect(result.tradingAllowed).toBe(false);
            expect(result.status).toBe('PAUSED');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('checkDrawdown returns tradingAllowed=true when status is NORMAL or WARNING', async () => {
      await fc.assert(
        fc.asyncProperty(
          normalDrawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined for this test
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);
            mockDrawdownRepo.getPortfolioState.mockResolvedValue(null);

            const result = await DrawdownService.checkDrawdown(
              testState.tenantId,
              testState.strategyId
            );

            expect(result.tradingAllowed).toBe(true);
            expect(['NORMAL', 'WARNING']).toContain(result.status);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Drawdown Resume Requirement
   * 
   * For any strategy paused due to drawdown breach, the strategy SHALL remain paused 
   * until explicit manual resume is called with valid authentication, AND automatic 
   * resume SHALL NOT occur.
   * 
   * **Validates: Requirements 2.5**
   */
  describe('Property 5: Drawdown Resume Requirement', () => {
    it('paused strategy remains paused without explicit resume', async () => {
      await fc.assert(
        fc.asyncProperty(
          pausedDrawdownStateArb(),
          fc.array(fc.double({ min: 0.5, max: 1.5, noNaN: true }), { minLength: 1, maxLength: 10 }),
          async (state, valueMultipliers) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            let currentState = { ...testState };
            
            mockDrawdownRepo.getStateByStrategy.mockImplementation(async () => currentState);
            mockDrawdownRepo.updateState.mockImplementation(async (tid, sid, updates) => {
              currentState = { ...currentState, ...updates, updatedAt: new Date().toISOString() };
              return currentState;
            });

            // Simulate multiple value updates (market movements)
            for (const multiplier of valueMultipliers) {
              const newValue = testState.peakValue * multiplier;
              await DrawdownService.updateValue(testState.tenantId, testState.strategyId!, newValue);
            }

            // Strategy should still be paused - PAUSED status is preserved
            expect(currentState.status).toBe('PAUSED');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('resume requires valid authentication token', async () => {
      await fc.assert(
        fc.asyncProperty(
          pausedDrawdownStateArb(),
          fc.constantFrom('', '   ', null, undefined),
          async (state, invalidToken) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);

            // Attempt resume with invalid token should throw
            await expect(
              DrawdownService.resumeStrategy(
                testState.tenantId,
                testState.strategyId!,
                invalidToken as string
              )
            ).rejects.toThrow('Authentication required');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('resume with valid authentication changes status from PAUSED', async () => {
      await fc.assert(
        fc.asyncProperty(
          pausedDrawdownStateArb(),
          fc.string({ minLength: 10, maxLength: 100 }), // Valid auth token
          async (state, validToken) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            let currentState = { ...testState };
            
            mockDrawdownRepo.getStateByStrategy.mockImplementation(async () => currentState);
            mockDrawdownRepo.updateState.mockImplementation(async (tid, sid, updates) => {
              currentState = { ...currentState, ...updates, updatedAt: new Date().toISOString() };
              return currentState;
            });

            // Resume with valid token
            await DrawdownService.resumeStrategy(
              testState.tenantId,
              testState.strategyId!,
              validToken
            );

            // Status should no longer be PAUSED
            expect(currentState.status).not.toBe('PAUSED');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('automatic resume does not occur even when drawdown recovers', async () => {
      await fc.assert(
        fc.asyncProperty(
          pausedDrawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            let currentState = { ...testState };
            
            mockDrawdownRepo.getStateByStrategy.mockImplementation(async () => currentState);
            mockDrawdownRepo.updateState.mockImplementation(async (tid, sid, updates) => {
              currentState = { ...currentState, ...updates, updatedAt: new Date().toISOString() };
              return currentState;
            });

            // Simulate recovery - value goes back to peak (0% drawdown)
            await DrawdownService.updateValue(
              testState.tenantId,
              testState.strategyId!,
              testState.peakValue * 1.1 // Even higher than peak
            );

            // Strategy should STILL be paused - no automatic resume
            expect(currentState.status).toBe('PAUSED');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Drawdown Reset
   * 
   * For any drawdown reset operation (manual or scheduled), the peakValue SHALL be 
   * set to currentValue, AND drawdownPercent SHALL become 0, AND status SHALL 
   * return to NORMAL.
   * 
   * **Validates: Requirements 2.6**
   */
  describe('Property 6: Drawdown Reset', () => {
    it('reset sets peakValue to currentValue', async () => {
      await fc.assert(
        fc.asyncProperty(
          drawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            let savedState: DrawdownState | undefined;
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);
            mockDrawdownRepo.getPortfolioState.mockResolvedValue(null);
            mockDrawdownRepo.putState.mockImplementation(async (tid, s) => {
              savedState = s;
            });

            const result = await DrawdownService.resetDrawdown(
              testState.tenantId,
              testState.strategyId
            );

            // peakValue should equal currentValue after reset
            expect(result.peakValue).toBe(testState.currentValue);
            expect(savedState?.peakValue).toBe(testState.currentValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('reset sets drawdownPercent to 0', async () => {
      await fc.assert(
        fc.asyncProperty(
          drawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            let savedState: DrawdownState | undefined;
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);
            mockDrawdownRepo.getPortfolioState.mockResolvedValue(null);
            mockDrawdownRepo.putState.mockImplementation(async (tid, s) => {
              savedState = s;
            });

            const result = await DrawdownService.resetDrawdown(
              testState.tenantId,
              testState.strategyId
            );

            // drawdownPercent should be 0 after reset
            expect(result.drawdownPercent).toBe(0);
            expect(result.drawdownAbsolute).toBe(0);
            expect(savedState?.drawdownPercent).toBe(0);
            expect(savedState?.drawdownAbsolute).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('reset sets status to NORMAL', async () => {
      await fc.assert(
        fc.asyncProperty(
          drawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            let savedState: DrawdownState | undefined;
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);
            mockDrawdownRepo.getPortfolioState.mockResolvedValue(null);
            mockDrawdownRepo.putState.mockImplementation(async (tid, s) => {
              savedState = s;
            });

            const result = await DrawdownService.resetDrawdown(
              testState.tenantId,
              testState.strategyId
            );

            // status should be NORMAL after reset
            expect(result.status).toBe('NORMAL');
            expect(savedState?.status).toBe('NORMAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('reset updates lastResetAt timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          drawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            const beforeReset = new Date().toISOString();
            
            let savedState: DrawdownState | null = null;
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);
            mockDrawdownRepo.getPortfolioState.mockResolvedValue(null);
            mockDrawdownRepo.putState.mockImplementation(async (tid, s) => {
              savedState = s;
            });

            const result = await DrawdownService.resetDrawdown(
              testState.tenantId,
              testState.strategyId
            );

            // lastResetAt should be updated
            expect(new Date(result.lastResetAt).getTime()).toBeGreaterThanOrEqual(
              new Date(beforeReset).getTime()
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('reset works for any initial status including PAUSED', async () => {
      await fc.assert(
        fc.asyncProperty(
          pausedDrawdownStateArb(),
          async (state) => {
            // Ensure strategyId is defined
            const testState = {
              ...state,
              strategyId: state.strategyId ?? 'test-strategy-id'
            };
            
            mockDrawdownRepo.getStateByStrategy.mockResolvedValue(testState);
            mockDrawdownRepo.getPortfolioState.mockResolvedValue(null);
            mockDrawdownRepo.putState.mockResolvedValue();

            const result = await DrawdownService.resetDrawdown(
              testState.tenantId,
              testState.strategyId
            );

            // Even PAUSED strategies should reset to NORMAL
            expect(result.status).toBe('NORMAL');
            expect(result.drawdownPercent).toBe(0);
            expect(result.peakValue).toBe(testState.currentValue);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
