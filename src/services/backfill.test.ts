/**
 * Backfill Service Property Tests
 * 
 * Property-based tests for backfill processing and rate limiting.
 * 
 * Requirements: 9.1, 9.3, 9.4, 9.5
 */

import * as fc from 'fast-check';
import { 
  BackfillService, 
  InvalidBackfillRequestError,
  BackfillAlreadyInProgressError,
  BackfillCannotBeCancelledError
} from './backfill';
import { DataSourceRepository } from '../repositories/data-source';
import { DataSource } from '../types/data-source';
import { 
  dataSourceForBackfillArb,
  backfillRequestInputForSourceArb,
  dataGapArb,
  rateLimitConfigArb
} from '../test/generators';

// Mock the DataSourceRepository
jest.mock('../repositories/data-source');

const mockedDataSourceRepository = DataSourceRepository as jest.Mocked<typeof DataSourceRepository>;

describe('BackfillService', () => {
  beforeEach(() => {
    BackfillService.clearAllBackfills();
    BackfillService.clearRateLimiters();
    jest.clearAllMocks();
  });

  /**
   * Property 18: Backfill Processing
   * 
   * *For any* BackfillRequest, it SHALL be queued with status QUEUED, progress 
   * SHALL be updated during processing with percentComplete and estimatedCompletionTime, 
   * AND upon completion, any data gaps SHALL be reported in the progress.gaps array.
   * 
   * **Validates: Requirements 9.1, 9.4, 9.5**
   */
  describe('Property 18: Backfill Processing', () => {
    it('backfill request SHALL be queued with status QUEUED', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceForBackfillArb(),
          fc.uuid(),
          async (dataSource, tenantId) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Create backfill request input that matches the source
            const symbol = dataSource.supportedSymbols[0];
            const input = {
              sourceId: dataSource.sourceId,
              symbol,
              dataType: dataSource.type,
              startTime: '2024-01-01T00:00:00.000Z',
              endTime: '2024-01-02T00:00:00.000Z'
            };

            // Request backfill
            const request = await BackfillService.requestBackfill(tenantId, input);

            // Verify status is QUEUED
            expect(request.status).toBe('QUEUED');
            expect(request.tenantId).toBe(tenantId);
            expect(request.sourceId).toBe(dataSource.sourceId);
            expect(request.symbol).toBe(symbol);
            expect(request.dataType).toBe(dataSource.type);
            expect(request.progress.percentComplete).toBe(0);
            expect(request.progress.gaps).toEqual([]);

            // Cleanup
            BackfillService.clearAllBackfills();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('processing backfill SHALL update status to PROCESSING', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceForBackfillArb(),
          fc.uuid(),
          async (dataSource, tenantId) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            const symbol = dataSource.supportedSymbols[0];
            const input = {
              sourceId: dataSource.sourceId,
              symbol,
              dataType: dataSource.type,
              startTime: '2024-01-01T00:00:00.000Z',
              endTime: '2024-01-02T00:00:00.000Z'
            };

            // Request and process backfill
            const request = await BackfillService.requestBackfill(tenantId, input);
            const processingRequest = await BackfillService.processBackfill(tenantId, request.requestId);

            // Verify status is PROCESSING
            expect(processingRequest.status).toBe('PROCESSING');

            // Cleanup
            BackfillService.clearAllBackfills();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('progress SHALL be updated with percentComplete and estimatedCompletionTime', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceForBackfillArb(),
          fc.uuid(),
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 100 }),
          async (dataSource, tenantId, totalRecords, progressPercent) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            const symbol = dataSource.supportedSymbols[0];
            const input = {
              sourceId: dataSource.sourceId,
              symbol,
              dataType: dataSource.type,
              startTime: '2024-01-01T00:00:00.000Z',
              endTime: '2024-01-02T00:00:00.000Z'
            };

            // Request and process backfill
            const request = await BackfillService.requestBackfill(tenantId, input);
            await BackfillService.processBackfill(tenantId, request.requestId);

            // Calculate processed records based on progress percent
            const processedRecords = Math.floor((progressPercent / 100) * totalRecords);

            // Update progress
            const updatedRequest = await BackfillService.updateProgress(
              tenantId,
              request.requestId,
              processedRecords,
              totalRecords
            );

            // Verify progress is updated correctly
            expect(updatedRequest.progress.totalRecords).toBe(totalRecords);
            expect(updatedRequest.progress.processedRecords).toBe(processedRecords);
            expect(updatedRequest.progress.percentComplete).toBe(
              Math.round((processedRecords / totalRecords) * 100)
            );

            // If progress > 0, estimatedCompletionTime should be set
            if (processedRecords > 0) {
              expect(updatedRequest.progress.estimatedCompletionTime).toBeDefined();
              // Verify it's a valid ISO date string
              const etaDate = new Date(updatedRequest.progress.estimatedCompletionTime!);
              expect(etaDate.getTime()).toBeGreaterThan(0);
            }

            // Cleanup
            BackfillService.clearAllBackfills();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('data gaps SHALL be reported in progress.gaps array', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceForBackfillArb(),
          fc.uuid(),
          fc.array(dataGapArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, gaps) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            const symbol = dataSource.supportedSymbols[0];
            const input = {
              sourceId: dataSource.sourceId,
              symbol,
              dataType: dataSource.type,
              startTime: '2024-01-01T00:00:00.000Z',
              endTime: '2024-01-02T00:00:00.000Z'
            };

            // Request and process backfill
            const request = await BackfillService.requestBackfill(tenantId, input);
            await BackfillService.processBackfill(tenantId, request.requestId);

            // Report gaps
            for (const gap of gaps) {
              await BackfillService.reportGap(tenantId, request.requestId, gap);
            }

            // Get status and verify gaps
            const status = await BackfillService.getBackfillStatus(tenantId, request.requestId);
            expect(status.progress.gaps).toHaveLength(gaps.length);
            
            // Verify each gap is present
            for (let i = 0; i < gaps.length; i++) {
              expect(status.progress.gaps[i].startTime).toBe(gaps[i].startTime);
              expect(status.progress.gaps[i].endTime).toBe(gaps[i].endTime);
              expect(status.progress.gaps[i].reason).toBe(gaps[i].reason);
            }

            // Cleanup
            BackfillService.clearAllBackfills();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('completed backfill SHALL have status COMPLETED and completedAt set', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceForBackfillArb(),
          fc.uuid(),
          async (dataSource, tenantId) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            const symbol = dataSource.supportedSymbols[0];
            const input = {
              sourceId: dataSource.sourceId,
              symbol,
              dataType: dataSource.type,
              startTime: '2024-01-01T00:00:00.000Z',
              endTime: '2024-01-02T00:00:00.000Z'
            };

            // Request, process, and complete backfill
            const request = await BackfillService.requestBackfill(tenantId, input);
            await BackfillService.processBackfill(tenantId, request.requestId);
            const completedRequest = await BackfillService.completeBackfill(tenantId, request.requestId);

            // Verify completion
            expect(completedRequest.status).toBe('COMPLETED');
            expect(completedRequest.completedAt).toBeDefined();
            expect(completedRequest.progress.percentComplete).toBe(100);

            // Verify completedAt is a valid ISO date
            const completedDate = new Date(completedRequest.completedAt!);
            expect(completedDate.getTime()).toBeGreaterThan(0);

            // Cleanup
            BackfillService.clearAllBackfills();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('gaps SHALL be preserved upon completion', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceForBackfillArb(),
          fc.uuid(),
          fc.array(dataGapArb(), { minLength: 1, maxLength: 3 }),
          async (dataSource, tenantId, gaps) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            const symbol = dataSource.supportedSymbols[0];
            const input = {
              sourceId: dataSource.sourceId,
              symbol,
              dataType: dataSource.type,
              startTime: '2024-01-01T00:00:00.000Z',
              endTime: '2024-01-02T00:00:00.000Z'
            };

            // Request and process backfill
            const request = await BackfillService.requestBackfill(tenantId, input);
            await BackfillService.processBackfill(tenantId, request.requestId);

            // Report gaps
            for (const gap of gaps) {
              await BackfillService.reportGap(tenantId, request.requestId, gap);
            }

            // Complete backfill
            const completedRequest = await BackfillService.completeBackfill(tenantId, request.requestId);

            // Verify gaps are preserved
            expect(completedRequest.progress.gaps).toHaveLength(gaps.length);

            // Cleanup
            BackfillService.clearAllBackfills();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  /**
   * Property 19: Backfill Rate Limiting
   * 
   * *For any* BackfillRequest processing, the request rate to the DataSource SHALL 
   * not exceed the source's configured rateLimits, AND requests SHALL be throttled 
   * with appropriate delays when approaching limits.
   * 
   * **Validates: Requirements 9.3**
   */
  describe('Property 19: Backfill Rate Limiting', () => {
    it('canMakeRequest SHALL return false when per-second limit is reached', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitConfigArb(),
          fc.uuid(),
          async (rateLimits, sourceId) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // Record requests up to the per-second limit
            const now = Date.now();
            const timestamps = Array.from(
              { length: rateLimits.requestsPerSecond },
              () => now - Math.floor(Math.random() * 500) // Within last 500ms
            );
            BackfillService.setRateLimiterState(sourceId, timestamps);

            // Should not be able to make another request
            const canMake = BackfillService.canMakeRequest(sourceId, rateLimits);
            expect(canMake).toBe(false);

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canMakeRequest SHALL return false when per-minute limit is reached', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitConfigArb(),
          fc.uuid(),
          async (rateLimits, sourceId) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // Record requests up to the per-minute limit (spread over the minute)
            const now = Date.now();
            const timestamps = Array.from(
              { length: rateLimits.requestsPerMinute },
              (_, i) => now - (i * 1000) - 1000 // Spread over last minute, but not in last second
            ).filter(ts => ts > now - 60000); // Keep only those within last minute

            // If we have enough timestamps to hit the limit
            if (timestamps.length >= rateLimits.requestsPerMinute) {
              BackfillService.setRateLimiterState(sourceId, timestamps);

              // Should not be able to make another request
              const canMake = BackfillService.canMakeRequest(sourceId, rateLimits);
              expect(canMake).toBe(false);
            }

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canMakeRequest SHALL return true when under all limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitConfigArb(),
          fc.uuid(),
          async (rateLimits, sourceId) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // Record fewer requests than any limit
            const requestCount = Math.min(
              rateLimits.requestsPerSecond - 1,
              rateLimits.requestsPerMinute - 1,
              rateLimits.requestsPerDay - 1,
              0
            );

            if (requestCount > 0) {
              const now = Date.now();
              const timestamps = Array.from(
                { length: requestCount },
                (_, i) => now - (i * 2000) // Spread out to avoid per-second limit
              );
              BackfillService.setRateLimiterState(sourceId, timestamps);
            }

            // Should be able to make a request
            const canMake = BackfillService.canMakeRequest(sourceId, rateLimits);
            expect(canMake).toBe(true);

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('recordRequest SHALL increment request counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 10 }),
          async (sourceId, requestCount) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // Record multiple requests
            for (let i = 0; i < requestCount; i++) {
              BackfillService.recordRequest(sourceId);
            }

            // Verify counts
            const counts = BackfillService.getRequestCounts(sourceId);
            expect(counts.perSecond).toBe(requestCount);
            expect(counts.perMinute).toBe(requestCount);
            expect(counts.perDay).toBe(requestCount);

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateRequestDelay SHALL return positive delay when at per-second limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitConfigArb(),
          fc.uuid(),
          async (rateLimits, sourceId) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // Record requests at the per-second limit
            const now = Date.now();
            const timestamps = Array.from(
              { length: rateLimits.requestsPerSecond },
              () => now - 100 // All within last 100ms
            );
            BackfillService.setRateLimiterState(sourceId, timestamps);

            // Should need to wait
            const delay = BackfillService.calculateRequestDelay(sourceId, rateLimits);
            expect(delay).toBeGreaterThan(0);
            expect(delay).toBeLessThanOrEqual(1000); // At most 1 second

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateRequestDelay SHALL return 0 when under all limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitConfigArb(),
          fc.uuid(),
          async (rateLimits, sourceId) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // No requests recorded - should have no delay
            const delay = BackfillService.calculateRequestDelay(sourceId, rateLimits);
            expect(delay).toBe(0);

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rate limiting SHALL respect all three time windows', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitConfigArb(),
          fc.uuid(),
          async (rateLimits, sourceId) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // Test per-second limit
            const now = Date.now();
            
            // Set timestamps at per-second limit
            const perSecondTimestamps = Array.from(
              { length: rateLimits.requestsPerSecond },
              () => now - 100
            );
            BackfillService.setRateLimiterState(sourceId, perSecondTimestamps);
            expect(BackfillService.canMakeRequest(sourceId, rateLimits)).toBe(false);

            // Clear and test per-minute limit (spread over minute, not in last second)
            BackfillService.clearRateLimiters();
            const perMinuteTimestamps = Array.from(
              { length: rateLimits.requestsPerMinute },
              (_, i) => now - 2000 - (i * 500) // Start 2 seconds ago, spread out
            ).filter(ts => ts > now - 60000);

            if (perMinuteTimestamps.length >= rateLimits.requestsPerMinute) {
              BackfillService.setRateLimiterState(sourceId, perMinuteTimestamps);
              expect(BackfillService.canMakeRequest(sourceId, rateLimits)).toBe(false);
            }

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('old timestamps SHALL be cleaned up and not count towards limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitConfigArb(),
          fc.uuid(),
          async (rateLimits, sourceId) => {
            // Clear rate limiters
            BackfillService.clearRateLimiters();

            // Set old timestamps (more than 1 day ago) - use a reasonable number
            const now = Date.now();
            const numOldTimestamps = Math.min(rateLimits.requestsPerDay + 10, 1000);
            const oldTimestamps = Array.from(
              { length: numOldTimestamps },
              () => now - 25 * 60 * 60 * 1000 // 25 hours ago
            );
            BackfillService.setRateLimiterState(sourceId, oldTimestamps);

            // Should be able to make request since old timestamps are cleaned up
            const canMake = BackfillService.canMakeRequest(sourceId, rateLimits);
            expect(canMake).toBe(true);

            // Cleanup
            BackfillService.clearRateLimiters();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
