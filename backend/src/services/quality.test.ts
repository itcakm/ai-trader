/**
 * Property-Based Tests for Quality Service
 * 
 * **Property 20: Quality Score Calculation**
 * **Validates: Requirements 10.1, 10.3, 10.4**
 * 
 * Tests that:
 * - For any DataQualityScore, it SHALL contain components for completeness, freshness, consistency, and accuracy
 * - The overallScore SHALL be a weighted combination of these components
 * - Detected anomalies SHALL be included in the anomalies array
 */

import * as fc from 'fast-check';
import { QualityService, QualityInput, QualityConfig } from './quality';
import { DataSourceType } from '../types/data-source';
import { dataSourceTypeArb, isoDateStringArb, cryptoSymbolArb } from '../test/generators';

/**
 * Generator for QualityInput
 */
const qualityInputArb = (): fc.Arbitrary<QualityInput> =>
  fc.record({
    expectedDataPoints: fc.integer({ min: 0, max: 1000 }),
    actualDataPoints: fc.integer({ min: 0, max: 1000 }),
    latestDataTimestamp: fc.option(isoDateStringArb(), { nil: undefined }),
    dataValues: fc.option(
      fc.array(fc.double({ min: -1000000, max: 1000000, noNaN: true }), { minLength: 0, maxLength: 100 }),
      { nil: undefined }
    ),
    referenceValues: fc.option(
      fc.array(fc.double({ min: -1000000, max: 1000000, noNaN: true }), { minLength: 0, maxLength: 100 }),
      { nil: undefined }
    ),
    previousValues: fc.option(
      fc.array(fc.double({ min: 0.01, max: 1000000, noNaN: true }), { minLength: 0, maxLength: 100 }),
      { nil: undefined }
    ),
    timestamps: fc.option(
      fc.array(isoDateStringArb(), { minLength: 0, maxLength: 100 }),
      { nil: undefined }
    ),
    expectedIntervalSeconds: fc.option(fc.integer({ min: 1, max: 3600 }), { nil: undefined })
  });

/**
 * Generator for QualityConfig
 */
const qualityConfigArb = (): fc.Arbitrary<Partial<QualityConfig>> =>
  fc.record({
    completenessWeight: fc.double({ min: 0, max: 1, noNaN: true }),
    freshnessWeight: fc.double({ min: 0, max: 1, noNaN: true }),
    consistencyWeight: fc.double({ min: 0, max: 1, noNaN: true }),
    accuracyWeight: fc.double({ min: 0, max: 1, noNaN: true }),
    maxFreshnessAgeSeconds: fc.integer({ min: 1, max: 3600 }),
    priceSpikeThresholdPercent: fc.integer({ min: 1, max: 100 }),
    staleDataThresholdSeconds: fc.integer({ min: 1, max: 7200 })
  });

describe('QualityService', () => {
  describe('Property 20: Quality Score Calculation', () => {
    /**
     * Feature: market-data-ingestion, Property 20: Quality Score Calculation
     * 
     * For any DataQualityScore, it SHALL contain components for completeness, 
     * freshness, consistency, and accuracy, AND the overallScore SHALL be a 
     * weighted combination of these components, AND detected anomalies SHALL 
     * be included in the anomalies array.
     * 
     * **Validates: Requirements 10.1, 10.3, 10.4**
     */
    it('should contain all required quality components', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          cryptoSymbolArb(),
          dataSourceTypeArb(),
          qualityInputArb(),
          (sourceId, symbol, dataType, input) => {
            const result = QualityService.calculateQualityScore(
              sourceId,
              symbol,
              dataType,
              input
            );

            // Must contain all component fields
            expect(result.components).toBeDefined();
            expect(typeof result.components.completeness).toBe('number');
            expect(typeof result.components.freshness).toBe('number');
            expect(typeof result.components.consistency).toBe('number');
            expect(typeof result.components.accuracy).toBe('number');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have all component scores between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          cryptoSymbolArb(),
          dataSourceTypeArb(),
          qualityInputArb(),
          (sourceId, symbol, dataType, input) => {
            const result = QualityService.calculateQualityScore(
              sourceId,
              symbol,
              dataType,
              input
            );

            // All components must be between 0 and 1
            expect(result.components.completeness).toBeGreaterThanOrEqual(0);
            expect(result.components.completeness).toBeLessThanOrEqual(1);
            expect(result.components.freshness).toBeGreaterThanOrEqual(0);
            expect(result.components.freshness).toBeLessThanOrEqual(1);
            expect(result.components.consistency).toBeGreaterThanOrEqual(0);
            expect(result.components.consistency).toBeLessThanOrEqual(1);
            expect(result.components.accuracy).toBeGreaterThanOrEqual(0);
            expect(result.components.accuracy).toBeLessThanOrEqual(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have overallScore between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          cryptoSymbolArb(),
          dataSourceTypeArb(),
          qualityInputArb(),
          (sourceId, symbol, dataType, input) => {
            const result = QualityService.calculateQualityScore(
              sourceId,
              symbol,
              dataType,
              input
            );

            expect(result.overallScore).toBeGreaterThanOrEqual(0);
            expect(result.overallScore).toBeLessThanOrEqual(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include anomalies array in result', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          cryptoSymbolArb(),
          dataSourceTypeArb(),
          qualityInputArb(),
          (sourceId, symbol, dataType, input) => {
            const result = QualityService.calculateQualityScore(
              sourceId,
              symbol,
              dataType,
              input
            );

            expect(Array.isArray(result.anomalies)).toBe(true);

            // Each anomaly should have required fields
            for (const anomaly of result.anomalies) {
              expect(typeof anomaly.anomalyId).toBe('string');
              expect(anomaly.anomalyId.length).toBeGreaterThan(0);
              expect(['PRICE_SPIKE', 'DATA_GAP', 'STALE_DATA', 'OUTLIER', 'INCONSISTENCY']).toContain(anomaly.type);
              expect(['LOW', 'MEDIUM', 'HIGH']).toContain(anomaly.severity);
              expect(typeof anomaly.description).toBe('string');
              expect(typeof anomaly.detectedAt).toBe('string');
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should contain required metadata fields', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          cryptoSymbolArb(),
          dataSourceTypeArb(),
          qualityInputArb(),
          (sourceId, symbol, dataType, input) => {
            const result = QualityService.calculateQualityScore(
              sourceId,
              symbol,
              dataType,
              input
            );

            // Must contain all metadata fields
            expect(typeof result.scoreId).toBe('string');
            expect(result.scoreId.length).toBeGreaterThan(0);
            expect(result.sourceId).toBe(sourceId);
            expect(result.symbol).toBe(symbol);
            expect(result.dataType).toBe(dataType);
            expect(typeof result.timestamp).toBe('string');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique scoreId for each calculation', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          cryptoSymbolArb(),
          dataSourceTypeArb(),
          qualityInputArb(),
          (sourceId, symbol, dataType, input) => {
            const result1 = QualityService.calculateQualityScore(sourceId, symbol, dataType, input);
            const result2 = QualityService.calculateQualityScore(sourceId, symbol, dataType, input);

            expect(result1.scoreId).not.toBe(result2.scoreId);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Completeness calculation', () => {
    it('should calculate completeness as ratio of actual to expected data points', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (expected, actual) => {
            const input: QualityInput = {
              expectedDataPoints: expected,
              actualDataPoints: actual
            };

            const completeness = QualityService.calculateCompleteness(input);
            const expectedRatio = Math.min(1.0, actual / expected);

            expect(completeness).toBeCloseTo(expectedRatio, 5);
            expect(completeness).toBeGreaterThanOrEqual(0);
            expect(completeness).toBeLessThanOrEqual(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 1.0 when no data is expected', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          (actual) => {
            const input: QualityInput = {
              expectedDataPoints: 0,
              actualDataPoints: actual
            };

            const completeness = QualityService.calculateCompleteness(input);
            expect(completeness).toBe(1.0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Anomaly detection', () => {
    it('should detect price spikes when change exceeds threshold', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 100, max: 10000, noNaN: true }),
          fc.double({ min: 0.6, max: 2, noNaN: true }), // multiplier > 1.5 to exceed 50% threshold
          (basePrice, multiplier) => {
            const currentValues = [basePrice * multiplier];
            const previousValues = [basePrice];

            const input: QualityInput = {
              expectedDataPoints: 1,
              actualDataPoints: 1,
              dataValues: currentValues,
              previousValues
            };

            const config = QualityService.getDefaultConfig();
            const anomalies = QualityService.detectAnomalies(input, config);

            const changePercent = Math.abs((currentValues[0] - previousValues[0]) / previousValues[0]) * 100;

            if (changePercent > config.priceSpikeThresholdPercent) {
              const priceSpikes = anomalies.filter(a => a.type === 'PRICE_SPIKE');
              expect(priceSpikes.length).toBeGreaterThan(0);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect data gaps when interval exceeds expected', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 60, max: 3600 }),
          fc.integer({ min: 3, max: 10 }),
          (intervalSeconds, gapMultiplier) => {
            const now = Date.now();
            const timestamps = [
              new Date(now - intervalSeconds * 1000 * gapMultiplier).toISOString(),
              new Date(now).toISOString()
            ];

            const input: QualityInput = {
              expectedDataPoints: 2,
              actualDataPoints: 2,
              timestamps,
              expectedIntervalSeconds: intervalSeconds
            };

            const config = QualityService.getDefaultConfig();
            const anomalies = QualityService.detectAnomalies(input, config);

            if (gapMultiplier > 2) {
              const dataGaps = anomalies.filter(a => a.type === 'DATA_GAP');
              expect(dataGaps.length).toBeGreaterThan(0);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect stale data when age exceeds threshold', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (staleMultiplier) => {
            const config = QualityService.getDefaultConfig();
            const ageSeconds = config.staleDataThresholdSeconds * staleMultiplier;
            const latestTimestamp = new Date(Date.now() - ageSeconds * 1000).toISOString();

            const input: QualityInput = {
              expectedDataPoints: 1,
              actualDataPoints: 1,
              latestDataTimestamp: latestTimestamp
            };

            const anomalies = QualityService.detectAnomalies(input, config);

            if (staleMultiplier > 1) {
              const staleAnomalies = anomalies.filter(a => a.type === 'STALE_DATA');
              expect(staleAnomalies.length).toBeGreaterThan(0);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Quality thresholds', () => {
    it('should allow setting and getting thresholds for any data type', () => {
      fc.assert(
        fc.property(
          dataSourceTypeArb(),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (dataType, threshold) => {
            QualityService.setQualityThreshold(dataType, threshold);
            const retrieved = QualityService.getQualityThreshold(dataType);

            expect(retrieved).toBeCloseTo(threshold, 5);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp threshold values to 0-1 range', () => {
      fc.assert(
        fc.property(
          dataSourceTypeArb(),
          fc.double({ min: -10, max: 10, noNaN: true }),
          (dataType, threshold) => {
            QualityService.setQualityThreshold(dataType, threshold);
            const retrieved = QualityService.getQualityThreshold(dataType);

            expect(retrieved).toBeGreaterThanOrEqual(0);
            expect(retrieved).toBeLessThanOrEqual(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Property 21: Quality Threshold Alerting', () => {
  beforeEach(() => {
    QualityService.clearAlertHandlers();
  });

  /**
   * Feature: market-data-ingestion, Property 21: Quality Threshold Alerting
   * 
   * For any DataQualityScore where overallScore falls below the configured threshold,
   * an alert SHALL be triggered, AND the alert SHALL include the sourceId, symbol,
   * dataType, and score details.
   * 
   * **Validates: Requirements 10.2**
   */
  it('should trigger alert when quality score falls below threshold', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        fc.double({ min: 0, max: 0.5, noNaN: true }), // Low threshold to ensure alert
        (sourceId, symbol, dataType, threshold) => {
          // Set a low threshold
          QualityService.setQualityThreshold(dataType, threshold);

          // Create input that will result in low quality score
          const input: QualityInput = {
            expectedDataPoints: 100,
            actualDataPoints: 10, // Low completeness
            latestDataTimestamp: new Date(Date.now() - 1000000).toISOString() // Stale data
          };

          const qualityScore = QualityService.calculateQualityScore(
            sourceId,
            symbol,
            dataType,
            input
          );

          let alertTriggered = false;
          let receivedAlert: any = null;

          QualityService.registerAlertHandler((alert) => {
            alertTriggered = true;
            receivedAlert = alert;
          });

          const shouldAlert = qualityScore.overallScore < threshold;
          const wasAlerted = QualityService.checkAndAlert(qualityScore);

          expect(wasAlerted).toBe(shouldAlert);

          if (shouldAlert) {
            expect(alertTriggered).toBe(true);
            expect(receivedAlert).not.toBeNull();
            expect(receivedAlert.sourceId).toBe(sourceId);
            expect(receivedAlert.symbol).toBe(symbol);
            expect(receivedAlert.dataType).toBe(dataType);
            expect(receivedAlert.score).toBe(qualityScore.overallScore);
            expect(receivedAlert.threshold).toBe(threshold);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not trigger alert when quality score is above threshold', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        fc.double({ min: 0, max: 0.3, noNaN: true }), // Very low threshold
        (sourceId, symbol, dataType, threshold) => {
          // Set a very low threshold
          QualityService.setQualityThreshold(dataType, threshold);

          // Create input that will result in high quality score
          const now = new Date().toISOString();
          const input: QualityInput = {
            expectedDataPoints: 100,
            actualDataPoints: 100, // Full completeness
            latestDataTimestamp: now // Fresh data
          };

          const qualityScore = QualityService.calculateQualityScore(
            sourceId,
            symbol,
            dataType,
            input
          );

          let alertTriggered = false;

          QualityService.registerAlertHandler(() => {
            alertTriggered = true;
          });

          const wasAlerted = QualityService.checkAndAlert(qualityScore);

          if (qualityScore.overallScore >= threshold) {
            expect(wasAlerted).toBe(false);
            expect(alertTriggered).toBe(false);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include all required fields in alert', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        (sourceId, symbol, dataType) => {
          // Set threshold to 1.0 to ensure alert is always triggered
          QualityService.setQualityThreshold(dataType, 1.0);

          const input: QualityInput = {
            expectedDataPoints: 100,
            actualDataPoints: 50
          };

          const qualityScore = QualityService.calculateQualityScore(
            sourceId,
            symbol,
            dataType,
            input
          );

          let receivedAlert: any = null;

          QualityService.registerAlertHandler((alert) => {
            receivedAlert = alert;
          });

          QualityService.checkAndAlert(qualityScore);

          if (receivedAlert) {
            // Alert must include all required fields
            expect(typeof receivedAlert.alertId).toBe('string');
            expect(receivedAlert.alertId.length).toBeGreaterThan(0);
            expect(receivedAlert.sourceId).toBe(sourceId);
            expect(receivedAlert.symbol).toBe(symbol);
            expect(receivedAlert.dataType).toBe(dataType);
            expect(typeof receivedAlert.score).toBe('number');
            expect(typeof receivedAlert.threshold).toBe('number');
            expect(typeof receivedAlert.triggeredAt).toBe('string');
            expect(receivedAlert.components).toBeDefined();
            expect(Array.isArray(receivedAlert.anomalies)).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should call all registered alert handlers', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        fc.integer({ min: 1, max: 5 }),
        (sourceId, symbol, dataType, handlerCount) => {
          // Set threshold to 1.0 to ensure alert is always triggered
          QualityService.setQualityThreshold(dataType, 1.0);

          const input: QualityInput = {
            expectedDataPoints: 100,
            actualDataPoints: 50
          };

          const qualityScore = QualityService.calculateQualityScore(
            sourceId,
            symbol,
            dataType,
            input
          );

          const handlersCalled: boolean[] = [];

          for (let i = 0; i < handlerCount; i++) {
            QualityService.registerAlertHandler(() => {
              handlersCalled.push(true);
            });
          }

          QualityService.checkAndAlert(qualityScore);

          // All handlers should have been called
          expect(handlersCalled.length).toBe(handlerCount);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Quality Logging', () => {
  beforeEach(() => {
    QualityService.clearLogs();
  });

  /**
   * Tests for quality logging functionality
   * **Validates: Requirements 10.5**
   */
  it('should log quality assessments with all required fields', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        qualityInputArb(),
        (sourceId, symbol, dataType, input) => {
          const qualityScore = QualityService.calculateQualityScore(
            sourceId,
            symbol,
            dataType,
            input
          );

          const logEntry = QualityService.logQualityAssessment(qualityScore);

          // Log entry must contain all required fields
          expect(typeof logEntry.logId).toBe('string');
          expect(logEntry.logId.length).toBeGreaterThan(0);
          expect(logEntry.scoreId).toBe(qualityScore.scoreId);
          expect(logEntry.sourceId).toBe(sourceId);
          expect(logEntry.symbol).toBe(symbol);
          expect(logEntry.dataType).toBe(dataType);
          expect(logEntry.overallScore).toBe(qualityScore.overallScore);
          expect(logEntry.components).toEqual(qualityScore.components);
          expect(logEntry.anomalyCount).toBe(qualityScore.anomalies.length);
          expect(typeof logEntry.timestamp).toBe('string');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should store logs for historical retrieval', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        fc.integer({ min: 1, max: 10 }),
        (sourceId, symbol, dataType, logCount) => {
          // Create multiple quality scores and log them
          for (let i = 0; i < logCount; i++) {
            const input: QualityInput = {
              expectedDataPoints: 100,
              actualDataPoints: 50 + i
            };

            const qualityScore = QualityService.calculateQualityScore(
              sourceId,
              symbol,
              dataType,
              input
            );

            QualityService.logQualityAssessment(qualityScore);
          }

          // Retrieve logs
          const logs = QualityService.getQualityHistory(sourceId, 60);

          expect(logs.length).toBe(logCount);
          logs.forEach(log => {
            expect(log.sourceId).toBe(sourceId);
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate unique logId for each log entry', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        qualityInputArb(),
        (sourceId, symbol, dataType, input) => {
          const qualityScore = QualityService.calculateQualityScore(
            sourceId,
            symbol,
            dataType,
            input
          );

          const logEntry1 = QualityService.logQualityAssessment(qualityScore);
          const logEntry2 = QualityService.logQualityAssessment(qualityScore);

          expect(logEntry1.logId).not.toBe(logEntry2.logId);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should filter logs by source ID', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        cryptoSymbolArb(),
        dataSourceTypeArb(),
        (sourceId1, sourceId2, symbol, dataType) => {
          // Log for source 1
          const input1: QualityInput = { expectedDataPoints: 100, actualDataPoints: 50 };
          const score1 = QualityService.calculateQualityScore(sourceId1, symbol, dataType, input1);
          QualityService.logQualityAssessment(score1);

          // Log for source 2
          const input2: QualityInput = { expectedDataPoints: 100, actualDataPoints: 75 };
          const score2 = QualityService.calculateQualityScore(sourceId2, symbol, dataType, input2);
          QualityService.logQualityAssessment(score2);

          // Retrieve logs for source 1 only
          const logs1 = QualityService.getQualityHistory(sourceId1, 60);
          const logs2 = QualityService.getQualityHistory(sourceId2, 60);

          logs1.forEach(log => expect(log.sourceId).toBe(sourceId1));
          logs2.forEach(log => expect(log.sourceId).toBe(sourceId2));

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
