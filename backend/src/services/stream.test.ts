/**
 * Stream Service Property Tests
 * 
 * Property-based tests for stream lifecycle management and tenant limits.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.5
 */

import * as fc from 'fast-check';
import { 
  StreamService, 
  StreamLimitExceededError, 
  InvalidStreamStateError 
} from './stream';
import { DataSourceRepository } from '../repositories/data-source';
import { DataSource, DataSourceType } from '../types/data-source';
import { 
  dataSourceArb, 
  cryptoSymbolArb,
  streamMetricsArb
} from '../test/generators';

// Mock the DataSourceRepository
jest.mock('../repositories/data-source');

const mockedDataSourceRepository = DataSourceRepository as jest.Mocked<typeof DataSourceRepository>;

describe('StreamService', () => {
  beforeEach(() => {
    StreamService.clearAllStreams();
    StreamService.clearTenantConfigs();
    jest.clearAllMocks();
  });

  /**
   * Property 16: Stream Lifecycle Management
   * 
   * *For any* DataStream, starting SHALL set status to ACTIVE, stopping SHALL set 
   * status to STOPPED, AND while ACTIVE the stream SHALL track messagesReceived, 
   * messagesPerSecond, averageLatencyMs, and errorCount metrics.
   * 
   * **Validates: Requirements 8.1, 8.2, 8.5**
   */
  describe('Property 16: Stream Lifecycle Management', () => {
    it('starting a stream SHALL set status to ACTIVE', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start stream
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );

            // Verify status is ACTIVE
            expect(stream.status).toBe('ACTIVE');
            expect(stream.tenantId).toBe(tenantId);
            expect(stream.sourceId).toBe(dataSource.sourceId);
            expect(stream.symbols).toEqual(symbols);
            expect(stream.type).toBe(dataSource.type);

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('stopping a stream SHALL set status to STOPPED', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start and then stop stream
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );
            
            await StreamService.stopStream(tenantId, stream.streamId);
            
            // Verify status is STOPPED
            const stoppedStream = await StreamService.getStreamStatus(tenantId, stream.streamId);
            expect(stoppedStream.status).toBe('STOPPED');

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });


    it('pausing an ACTIVE stream SHALL set status to PAUSED', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start and then pause stream
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );
            
            await StreamService.pauseStream(tenantId, stream.streamId);
            
            // Verify status is PAUSED
            const pausedStream = await StreamService.getStreamStatus(tenantId, stream.streamId);
            expect(pausedStream.status).toBe('PAUSED');

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('resuming a PAUSED stream SHALL set status to ACTIVE', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start, pause, then resume stream
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );
            
            await StreamService.pauseStream(tenantId, stream.streamId);
            await StreamService.resumeStream(tenantId, stream.streamId);
            
            // Verify status is ACTIVE again
            const resumedStream = await StreamService.getStreamStatus(tenantId, stream.streamId);
            expect(resumedStream.status).toBe('ACTIVE');

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('ACTIVE streams SHALL track all required metrics', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          fc.array(fc.double({ min: 1, max: 500, noNaN: true }), { minLength: 1, maxLength: 10 }),
          async (dataSource, tenantId, symbols, latencies) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start stream
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );

            // Record messages with latencies
            for (const latency of latencies) {
              await StreamService.recordMessage(tenantId, stream.streamId, latency);
            }

            // Get stream status and verify metrics are tracked
            const updatedStream = await StreamService.getStreamStatus(tenantId, stream.streamId);
            
            // Verify all required metrics exist
            expect(updatedStream.metrics).toHaveProperty('messagesReceived');
            expect(updatedStream.metrics).toHaveProperty('messagesPerSecond');
            expect(updatedStream.metrics).toHaveProperty('averageLatencyMs');
            expect(updatedStream.metrics).toHaveProperty('errorCount');
            expect(updatedStream.metrics).toHaveProperty('uptime');

            // Verify message count matches
            expect(updatedStream.metrics.messagesReceived).toBe(latencies.length);

            // Verify average latency is calculated correctly
            const expectedAvgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            expect(updatedStream.metrics.averageLatencyMs).toBeCloseTo(expectedAvgLatency, 5);

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('error recording SHALL increment errorCount and track lastError', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          fc.array(fc.string({ minLength: 5, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, symbols, errors) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start stream
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );

            // Record errors
            for (const error of errors) {
              await StreamService.recordError(tenantId, stream.streamId, error);
            }

            // Get stream status and verify error tracking
            const updatedStream = await StreamService.getStreamStatus(tenantId, stream.streamId);
            
            expect(updatedStream.metrics.errorCount).toBe(errors.length);
            expect(updatedStream.metrics.lastError).toBe(errors[errors.length - 1]);

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('pausing a non-ACTIVE stream SHALL throw InvalidStreamStateError', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start and stop stream
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );
            await StreamService.stopStream(tenantId, stream.streamId);

            // Attempting to pause a STOPPED stream should throw
            await expect(
              StreamService.pauseStream(tenantId, stream.streamId)
            ).rejects.toThrow(InvalidStreamStateError);

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('resuming a non-PAUSED stream SHALL throw InvalidStreamStateError', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Start stream (status is ACTIVE, not PAUSED)
            const stream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );

            // Attempting to resume an ACTIVE stream should throw
            await expect(
              StreamService.resumeStream(tenantId, stream.streamId)
            ).rejects.toThrow(InvalidStreamStateError);

            // Cleanup
            StreamService.clearAllStreams();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  /**
   * Property 17: Stream Tenant Limits
   * 
   * *For any* Tenant, the number of concurrent ACTIVE streams SHALL not exceed 
   * the tenant's configured maxStreams limit, AND attempts to start additional 
   * streams SHALL be rejected with a limit exceeded error.
   * 
   * **Validates: Requirements 8.3**
   */
  describe('Property 17: Stream Tenant Limits', () => {
    it('number of concurrent ACTIVE streams SHALL not exceed maxStreams limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.integer({ min: 1, max: 10 }),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, maxStreams, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Set tenant limit
            StreamService.setTenantConfig(tenantId, { maxConcurrentStreams: maxStreams });

            // Start streams up to the limit
            const startedStreams: string[] = [];
            for (let i = 0; i < maxStreams; i++) {
              const stream = await StreamService.startStream(
                tenantId,
                dataSource.sourceId,
                symbols
              );
              startedStreams.push(stream.streamId);
            }

            // Verify we have exactly maxStreams active
            const activeCount = await StreamService.getActiveStreamCount(tenantId);
            expect(activeCount).toBe(maxStreams);

            // Cleanup
            StreamService.clearAllStreams();
            StreamService.clearTenantConfigs();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('attempts to start additional streams SHALL be rejected with limit exceeded error', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, maxStreams, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Set tenant limit
            StreamService.setTenantConfig(tenantId, { maxConcurrentStreams: maxStreams });

            // Start streams up to the limit
            for (let i = 0; i < maxStreams; i++) {
              await StreamService.startStream(
                tenantId,
                dataSource.sourceId,
                symbols
              );
            }

            // Attempting to start one more should throw StreamLimitExceededError
            await expect(
              StreamService.startStream(tenantId, dataSource.sourceId, symbols)
            ).rejects.toThrow(StreamLimitExceededError);

            // Cleanup
            StreamService.clearAllStreams();
            StreamService.clearTenantConfigs();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('stopping a stream SHALL allow starting a new one within limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, maxStreams, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Set tenant limit
            StreamService.setTenantConfig(tenantId, { maxConcurrentStreams: maxStreams });

            // Start streams up to the limit
            const streams: string[] = [];
            for (let i = 0; i < maxStreams; i++) {
              const stream = await StreamService.startStream(
                tenantId,
                dataSource.sourceId,
                symbols
              );
              streams.push(stream.streamId);
            }

            // Stop one stream
            await StreamService.stopStream(tenantId, streams[0]);

            // Now we should be able to start a new one
            const newStream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );
            expect(newStream.status).toBe('ACTIVE');

            // Verify we're still at the limit
            const activeCount = await StreamService.getActiveStreamCount(tenantId);
            expect(activeCount).toBe(maxStreams);

            // Cleanup
            StreamService.clearAllStreams();
            StreamService.clearTenantConfigs();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('paused streams SHALL still count towards the limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.integer({ min: 2, max: 5 }),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, maxStreams, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Set tenant limit
            StreamService.setTenantConfig(tenantId, { maxConcurrentStreams: maxStreams });

            // Start streams up to the limit
            const streams: string[] = [];
            for (let i = 0; i < maxStreams; i++) {
              const stream = await StreamService.startStream(
                tenantId,
                dataSource.sourceId,
                symbols
              );
              streams.push(stream.streamId);
            }

            // Pause one stream (it should still count as active for limit purposes)
            await StreamService.pauseStream(tenantId, streams[0]);

            // Verify paused stream is not counted as ACTIVE
            const activeCount = await StreamService.getActiveStreamCount(tenantId);
            expect(activeCount).toBe(maxStreams - 1);

            // We should be able to start one more since paused doesn't count
            const newStream = await StreamService.startStream(
              tenantId,
              dataSource.sourceId,
              symbols
            );
            expect(newStream.status).toBe('ACTIVE');

            // Cleanup
            StreamService.clearAllStreams();
            StreamService.clearTenantConfigs();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('different tenants SHALL have independent stream limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 5 }),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId1, tenantId2, maxStreams1, maxStreams2, symbols) => {
            // Ensure different tenants
            fc.pre(tenantId1 !== tenantId2);

            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Set different limits for each tenant
            StreamService.setTenantConfig(tenantId1, { maxConcurrentStreams: maxStreams1 });
            StreamService.setTenantConfig(tenantId2, { maxConcurrentStreams: maxStreams2 });

            // Start streams for tenant 1 up to their limit
            for (let i = 0; i < maxStreams1; i++) {
              await StreamService.startStream(tenantId1, dataSource.sourceId, symbols);
            }

            // Start streams for tenant 2 up to their limit
            for (let i = 0; i < maxStreams2; i++) {
              await StreamService.startStream(tenantId2, dataSource.sourceId, symbols);
            }

            // Verify each tenant has their own count
            const count1 = await StreamService.getActiveStreamCount(tenantId1);
            const count2 = await StreamService.getActiveStreamCount(tenantId2);
            
            expect(count1).toBe(maxStreams1);
            expect(count2).toBe(maxStreams2);

            // Cleanup
            StreamService.clearAllStreams();
            StreamService.clearTenantConfigs();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canStartStream SHALL return false when at limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 5 }),
          async (dataSource, tenantId, maxStreams, symbols) => {
            // Setup mock
            mockedDataSourceRepository.getDataSource.mockResolvedValue(dataSource);

            // Set tenant limit
            StreamService.setTenantConfig(tenantId, { maxConcurrentStreams: maxStreams });

            // Initially should be able to start
            let canStart = await StreamService.canStartStream(tenantId);
            expect(canStart).toBe(true);

            // Start streams up to the limit
            for (let i = 0; i < maxStreams; i++) {
              await StreamService.startStream(tenantId, dataSource.sourceId, symbols);
            }

            // Now should not be able to start
            canStart = await StreamService.canStartStream(tenantId);
            expect(canStart).toBe(false);

            // Cleanup
            StreamService.clearAllStreams();
            StreamService.clearTenantConfigs();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
