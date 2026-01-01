/**
 * Property-based tests for Validation Failure Tracker Service
 * Feature: ai-assisted-intelligence, Property 19: Validation Failure Tracking
 * Validates: Requirements 9.4
 */

import * as fc from 'fast-check';
import { ValidationFailureTracker } from './failure-tracker';

// Generators
const modelConfigIdArb = (): fc.Arbitrary<string> => fc.uuid();

const alertThresholdArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 20 });

const failureReasonArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 200 });

const failureCountArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 50 });

describe('ValidationFailureTracker', () => {
  describe('Property 19: Validation Failure Tracking', () => {
    /**
     * Property 19: Validation Failure Tracking
     * For any ModelConfiguration with consecutiveFailures exceeding alertThreshold,
     * an alert SHALL be triggered, AND the failure counter SHALL accurately reflect
     * the number of consecutive validation failures.
     * Validates: Requirements 9.4
     */

    it('should accurately count consecutive failures', () => {
      fc.assert(
        fc.property(
          modelConfigIdArb(),
          failureCountArb(),
          (modelConfigId, failureCount) => {
            const tracker = new ValidationFailureTracker();

            // Record failures
            for (let i = 0; i < failureCount; i++) {
              tracker.recordFailure(modelConfigId);
            }

            // Verify count matches
            expect(tracker.getConsecutiveFailures(modelConfigId)).toBe(failureCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trigger alert exactly when threshold is reached', () => {
      fc.assert(
        fc.property(
          modelConfigIdArb(),
          alertThresholdArb(),
          (modelConfigId, threshold) => {
            let alertTriggered = false;
            let alertedModelId: string | null = null;
            let alertedFailureCount = 0;

            const tracker = new ValidationFailureTracker({
              alertThreshold: threshold,
              onAlert: (id, count) => {
                alertTriggered = true;
                alertedModelId = id;
                alertedFailureCount = count;
              }
            });

            // Record failures up to threshold - 1
            for (let i = 0; i < threshold - 1; i++) {
              tracker.recordFailure(modelConfigId);
            }

            // Alert should not have triggered yet
            expect(alertTriggered).toBe(false);
            expect(tracker.isAboveThreshold(modelConfigId)).toBe(false);

            // Record one more failure to reach threshold
            tracker.recordFailure(modelConfigId);

            // Alert should now be triggered
            expect(alertTriggered).toBe(true);
            expect(alertedModelId).toBe(modelConfigId);
            expect(alertedFailureCount).toBe(threshold);
            expect(tracker.isAboveThreshold(modelConfigId)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only trigger alert once per model until reset', () => {
      fc.assert(
        fc.property(
          modelConfigIdArb(),
          alertThresholdArb(),
          fc.integer({ min: 1, max: 10 }),
          (modelConfigId, threshold, extraFailures) => {
            let alertCount = 0;

            const tracker = new ValidationFailureTracker({
              alertThreshold: threshold,
              onAlert: () => {
                alertCount++;
              }
            });

            // Record failures to reach threshold
            for (let i = 0; i < threshold; i++) {
              tracker.recordFailure(modelConfigId);
            }

            expect(alertCount).toBe(1);

            // Record more failures
            for (let i = 0; i < extraFailures; i++) {
              tracker.recordFailure(modelConfigId);
            }

            // Alert should still only have been triggered once
            expect(alertCount).toBe(1);
            expect(tracker.hasAlertTriggered(modelConfigId)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reset failure count on success', () => {
      fc.assert(
        fc.property(
          modelConfigIdArb(),
          failureCountArb(),
          (modelConfigId, failureCount) => {
            const tracker = new ValidationFailureTracker();

            // Record failures
            for (let i = 0; i < failureCount; i++) {
              tracker.recordFailure(modelConfigId);
            }

            expect(tracker.getConsecutiveFailures(modelConfigId)).toBe(failureCount);

            // Record success
            tracker.recordSuccess(modelConfigId);

            // Count should be reset
            expect(tracker.getConsecutiveFailures(modelConfigId)).toBe(0);
            expect(tracker.getFailureRecord(modelConfigId)).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track failures independently per model', () => {
      fc.assert(
        fc.property(
          fc.array(modelConfigIdArb(), { minLength: 2, maxLength: 5 }),
          fc.array(failureCountArb(), { minLength: 2, maxLength: 5 }),
          (modelIds, failureCounts) => {
            // Ensure unique model IDs
            const uniqueModelIds = [...new Set(modelIds)];
            if (uniqueModelIds.length < 2) return; // Skip if not enough unique IDs

            const tracker = new ValidationFailureTracker();

            // Record different failure counts for each model
            uniqueModelIds.forEach((modelId, index) => {
              const count = failureCounts[index % failureCounts.length];
              for (let i = 0; i < count; i++) {
                tracker.recordFailure(modelId);
              }
            });

            // Verify each model has correct count
            uniqueModelIds.forEach((modelId, index) => {
              const expectedCount = failureCounts[index % failureCounts.length];
              expect(tracker.getConsecutiveFailures(modelId)).toBe(expectedCount);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should store failure reason with record', () => {
      fc.assert(
        fc.property(
          modelConfigIdArb(),
          failureReasonArb(),
          (modelConfigId, reason) => {
            const tracker = new ValidationFailureTracker();

            tracker.recordFailure(modelConfigId, reason);

            const record = tracker.getFailureRecord(modelConfigId);
            expect(record).toBeDefined();
            expect(record?.lastFailureReason).toBe(reason);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify models above threshold', () => {
      fc.assert(
        fc.property(
          fc.array(modelConfigIdArb(), { minLength: 1, maxLength: 5 }),
          alertThresholdArb(),
          (modelIds, threshold) => {
            const uniqueModelIds = [...new Set(modelIds)];
            const tracker = new ValidationFailureTracker({ alertThreshold: threshold });

            // Put half the models above threshold
            const aboveThresholdModels = uniqueModelIds.slice(0, Math.ceil(uniqueModelIds.length / 2));
            const belowThresholdModels = uniqueModelIds.slice(Math.ceil(uniqueModelIds.length / 2));

            // Record failures for above-threshold models
            aboveThresholdModels.forEach(modelId => {
              for (let i = 0; i < threshold; i++) {
                tracker.recordFailure(modelId);
              }
            });

            // Record fewer failures for below-threshold models
            belowThresholdModels.forEach(modelId => {
              for (let i = 0; i < threshold - 1; i++) {
                tracker.recordFailure(modelId);
              }
            });

            // Verify getModelsAboveThreshold returns correct models
            const modelsAbove = tracker.getModelsAboveThreshold();
            expect(modelsAbove.sort()).toEqual(aboveThresholdModels.sort());

            // Verify isAboveThreshold for each model
            aboveThresholdModels.forEach(modelId => {
              expect(tracker.isAboveThreshold(modelId)).toBe(true);
            });
            belowThresholdModels.forEach(modelId => {
              expect(tracker.isAboveThreshold(modelId)).toBe(false);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow alert to trigger again after reset', () => {
      fc.assert(
        fc.property(
          modelConfigIdArb(),
          alertThresholdArb(),
          (modelConfigId, threshold) => {
            let alertCount = 0;

            const tracker = new ValidationFailureTracker({
              alertThreshold: threshold,
              onAlert: () => {
                alertCount++;
              }
            });

            // First round: reach threshold
            for (let i = 0; i < threshold; i++) {
              tracker.recordFailure(modelConfigId);
            }
            expect(alertCount).toBe(1);

            // Reset
            tracker.reset(modelConfigId);
            expect(tracker.getConsecutiveFailures(modelConfigId)).toBe(0);

            // Second round: reach threshold again
            for (let i = 0; i < threshold; i++) {
              tracker.recordFailure(modelConfigId);
            }

            // Alert should trigger again
            expect(alertCount).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
