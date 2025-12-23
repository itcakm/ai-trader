/**
 * Failover Service Property Tests
 * 
 * Feature: market-data-ingestion
 * Property 2: Data Source Failover
 * Validates: Requirements 1.4
 */

import * as fc from 'fast-check';
import { FailoverService } from './failover';
import { DataSourceService } from './data-source';
import { DataSourceRepository } from '../repositories/data-source';
import { DataSource, DataSourceType, DataSourceStatus } from '../types/data-source';
import { dataSourceArb, dataSourceTypeArb } from '../test/generators';

// Mock the repository and service
jest.mock('../repositories/data-source');
jest.mock('./data-source');

const mockedRepository = DataSourceRepository as jest.Mocked<typeof DataSourceRepository>;
const mockedService = DataSourceService as jest.Mocked<typeof DataSourceService>;

describe('FailoverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 2: Data Source Failover
   * 
   * For any DataSource marked as INACTIVE or ERROR, all data requests SHALL be 
   * routed to the next available fallback source (by priority), AND no requests 
   * SHALL be sent to the unavailable source.
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 2: Data Source Failover', () => {
    it('should route requests to highest priority active source', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceTypeArb(),
          fc.array(dataSourceArb(), { minLength: 1, maxLength: 5 }),
          async (type: DataSourceType, sources: DataSource[]) => {
            // Normalize sources to have the same type and ensure unique IDs
            const normalizedSources = sources.map((s, i) => ({
              ...s,
              sourceId: `source-${i}`,
              type,
              status: 'ACTIVE' as DataSourceStatus,
              priority: i + 1 // Ensure unique priorities
            }));

            // Sort by priority (ascending)
            const sortedSources = [...normalizedSources].sort((a, b) => a.priority - b.priority);

            mockedRepository.getActiveSourcesByType.mockResolvedValue(sortedSources);

            // Act
            const result = await FailoverService.getActiveSource(type);

            // Assert: should return the highest priority (lowest number) source
            expect(result).not.toBeNull();
            expect(result!.sourceId).toBe(sortedSources[0].sourceId);
            expect(result!.priority).toBe(sortedSources[0].priority);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not route requests to unavailable sources', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceTypeArb(),
          fc.array(dataSourceArb(), { minLength: 2, maxLength: 5 }),
          async (type: DataSourceType, sources: DataSource[]) => {
            // Create a mix of active and inactive sources
            const normalizedSources = sources.map((s, i) => ({
              ...s,
              sourceId: `source-${i}`,
              type,
              // First source is inactive, rest are active
              status: (i === 0 ? 'INACTIVE' : 'ACTIVE') as DataSourceStatus,
              priority: i + 1
            }));

            // Only return active sources (simulating repository behavior)
            const activeSources = normalizedSources
              .filter(s => s.status === 'ACTIVE')
              .sort((a, b) => a.priority - b.priority);

            mockedRepository.getActiveSourcesByType.mockResolvedValue(activeSources);

            // Act
            const result = await FailoverService.getActiveSource(type);

            // Assert: should not return the inactive source
            if (result) {
              expect(result.status).toBe('ACTIVE');
              expect(result.sourceId).not.toBe('source-0'); // The inactive one
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should switch to fallback when source fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(dataSourceArb(), { minLength: 2, maxLength: 5 }),
          fc.constantFrom('Connection failed', 'Timeout', 'Rate limited', 'Server error'),
          async (sources: DataSource[], reason: string) => {
            // Normalize sources with same type
            const type: DataSourceType = 'PRICE';
            const normalizedSources = sources.map((s, i) => ({
              ...s,
              sourceId: `source-${i}`,
              type,
              status: 'ACTIVE' as DataSourceStatus,
              priority: i + 1
            }));

            const failingSource = normalizedSources[0];
            const fallbackSources = normalizedSources.slice(1).sort((a, b) => a.priority - b.priority);

            // Mock repository calls
            mockedRepository.getDataSource.mockResolvedValue(failingSource);
            mockedRepository.getActiveSourcesByType.mockResolvedValue(fallbackSources);
            mockedService.updateStatus.mockResolvedValue({
              ...failingSource,
              status: 'INACTIVE'
            });

            // Act
            const result = await FailoverService.switchToFallback(failingSource.sourceId, reason);

            // Assert: should switch to the next available source
            expect(result).not.toBeNull();
            expect(result!.previousSourceId).toBe(failingSource.sourceId);
            expect(result!.newSourceId).toBe(fallbackSources[0].sourceId);
            expect(result!.reason).toBe(reason);

            // Assert: the failing source was marked as inactive
            expect(mockedService.updateStatus).toHaveBeenCalledWith(
              failingSource.sourceId,
              'INACTIVE'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should exclude specified sources from routing', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceTypeArb(),
          fc.array(dataSourceArb(), { minLength: 3, maxLength: 5 }),
          async (type: DataSourceType, sources: DataSource[]) => {
            // Normalize sources
            const normalizedSources = sources.map((s, i) => ({
              ...s,
              sourceId: `source-${i}`,
              type,
              status: 'ACTIVE' as DataSourceStatus,
              priority: i + 1
            }));

            const sortedSources = [...normalizedSources].sort((a, b) => a.priority - b.priority);
            mockedRepository.getActiveSourcesByType.mockResolvedValue(sortedSources);

            // Exclude the first source
            const excludeIds = [sortedSources[0].sourceId];

            // Act
            const result = await FailoverService.routeRequest(type, excludeIds);

            // Assert: should not return excluded source
            expect(result).not.toBeNull();
            expect(excludeIds).not.toContain(result!.sourceId);
            // Should return the next highest priority source
            expect(result!.sourceId).toBe(sortedSources[1].sourceId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null when no active sources available', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceTypeArb(),
          async (type: DataSourceType) => {
            // No active sources
            mockedRepository.getActiveSourcesByType.mockResolvedValue([]);

            // Act
            const result = await FailoverService.getActiveSource(type);

            // Assert: should return null
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null when failover has no fallback available', async () => {
      await fc.assert(
        fc.asyncProperty(
          dataSourceArb(),
          async (source: DataSource) => {
            const normalizedSource = {
              ...source,
              status: 'ACTIVE' as DataSourceStatus
            };

            mockedRepository.getDataSource.mockResolvedValue(normalizedSource);
            mockedRepository.getActiveSourcesByType.mockResolvedValue([]); // No fallbacks
            mockedService.updateStatus.mockResolvedValue({
              ...normalizedSource,
              status: 'INACTIVE'
            });

            // Act
            const result = await FailoverService.switchToFallback(
              normalizedSource.sourceId,
              'Connection failed'
            );

            // Assert: should return null when no fallback available
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isSourceAvailable', () => {
    it('should return true for active sources', async () => {
      const source: DataSource = {
        sourceId: 'test-source',
        type: 'PRICE',
        name: 'Test',
        apiEndpoint: 'https://api.test.com',
        authMethod: 'API_KEY',
        supportedSymbols: ['BTC'],
        rateLimits: { requestsPerSecond: 10, requestsPerMinute: 100, requestsPerDay: 10000 },
        status: 'ACTIVE',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockedRepository.getDataSource.mockResolvedValue(source);

      const result = await FailoverService.isSourceAvailable('test-source');

      expect(result).toBe(true);
    });

    it('should return false for inactive sources', async () => {
      const source: DataSource = {
        sourceId: 'test-source',
        type: 'PRICE',
        name: 'Test',
        apiEndpoint: 'https://api.test.com',
        authMethod: 'API_KEY',
        supportedSymbols: ['BTC'],
        rateLimits: { requestsPerSecond: 10, requestsPerMinute: 100, requestsPerDay: 10000 },
        status: 'INACTIVE',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockedRepository.getDataSource.mockResolvedValue(source);

      const result = await FailoverService.isSourceAvailable('test-source');

      expect(result).toBe(false);
    });
  });

  describe('recoverSource', () => {
    it('should set source status back to ACTIVE', async () => {
      const sourceId = 'test-source';
      const recoveredSource: DataSource = {
        sourceId,
        type: 'PRICE',
        name: 'Test',
        apiEndpoint: 'https://api.test.com',
        authMethod: 'API_KEY',
        supportedSymbols: ['BTC'],
        rateLimits: { requestsPerSecond: 10, requestsPerMinute: 100, requestsPerDay: 10000 },
        status: 'ACTIVE',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockedService.updateStatus.mockResolvedValue(recoveredSource);

      const result = await FailoverService.recoverSource(sourceId);

      expect(mockedService.updateStatus).toHaveBeenCalledWith(sourceId, 'ACTIVE');
      expect(result.status).toBe('ACTIVE');
    });
  });
});
