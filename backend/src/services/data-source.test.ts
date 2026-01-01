/**
 * Data Source Service Property Tests
 * 
 * Feature: market-data-ingestion
 * Property 1: Data Source Registration Completeness
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import * as fc from 'fast-check';
import { DataSourceService, RegisterDataSourceInput } from './data-source';
import { DataSourceRepository } from '../repositories/data-source';
import { DataSource, DataSourceType } from '../types/data-source';
import { registerDataSourceInputArb } from '../test/generators';

// Mock the repository
jest.mock('../repositories/data-source');

const mockedRepository = DataSourceRepository as jest.Mocked<typeof DataSourceRepository>;

describe('DataSourceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DataSourceService.clearUsageTracking();
    
    // Default mock implementations
    mockedRepository.putDataSource.mockResolvedValue(undefined);
    mockedRepository.getDataSource.mockResolvedValue(null);
    mockedRepository.updateDataSource.mockImplementation(async (sourceId, updates) => {
      return {
        sourceId,
        type: 'PRICE',
        name: 'Test Source',
        apiEndpoint: 'https://api.test.com/v1',
        authMethod: 'API_KEY',
        supportedSymbols: ['BTC'],
        rateLimits: { requestsPerSecond: 10, requestsPerMinute: 100, requestsPerDay: 10000 },
        status: updates.status || 'ACTIVE',
        priority: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...updates
      } as DataSource;
    });
  });

  /**
   * Property 1: Data Source Registration Completeness
   * 
   * For any registered DataSource, it SHALL have a valid sourceId, type (PRICE, NEWS, 
   * SENTIMENT, or ON_CHAIN), apiEndpoint, authMethod, supportedSymbols array, and 
   * rateLimits configuration.
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  describe('Property 1: Data Source Registration Completeness', () => {
    it('should register data sources with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          registerDataSourceInputArb(),
          async (input: RegisterDataSourceInput) => {
            // Act
            const result = await DataSourceService.registerSource(input);

            // Assert: sourceId is a valid UUID
            expect(result.sourceId).toMatch(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );

            // Assert: type is one of the valid types
            expect(['PRICE', 'NEWS', 'SENTIMENT', 'ON_CHAIN']).toContain(result.type);
            expect(result.type).toBe(input.type);

            // Assert: apiEndpoint is present and matches input
            expect(result.apiEndpoint).toBe(input.apiEndpoint);
            expect(result.apiEndpoint.length).toBeGreaterThan(0);

            // Assert: authMethod is one of the valid methods
            expect(['API_KEY', 'OAUTH', 'HMAC']).toContain(result.authMethod);
            expect(result.authMethod).toBe(input.authMethod);

            // Assert: supportedSymbols is a non-empty array
            expect(Array.isArray(result.supportedSymbols)).toBe(true);
            expect(result.supportedSymbols.length).toBeGreaterThan(0);
            expect(result.supportedSymbols).toEqual(input.supportedSymbols);

            // Assert: rateLimits has all required fields
            expect(result.rateLimits).toBeDefined();
            expect(typeof result.rateLimits.requestsPerSecond).toBe('number');
            expect(typeof result.rateLimits.requestsPerMinute).toBe('number');
            expect(typeof result.rateLimits.requestsPerDay).toBe('number');
            expect(result.rateLimits.requestsPerSecond).toBeGreaterThan(0);
            expect(result.rateLimits.requestsPerMinute).toBeGreaterThan(0);
            expect(result.rateLimits.requestsPerDay).toBeGreaterThan(0);

            // Assert: status is ACTIVE for new registrations
            expect(result.status).toBe('ACTIVE');

            // Assert: timestamps are set
            expect(result.createdAt).toBeDefined();
            expect(result.updatedAt).toBeDefined();

            // Assert: priority is set (default or provided)
            expect(typeof result.priority).toBe('number');

            // Assert: repository was called with the data source
            expect(mockedRepository.putDataSource).toHaveBeenCalledWith(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all input fields in registered data source', async () => {
      await fc.assert(
        fc.asyncProperty(
          registerDataSourceInputArb(),
          async (input: RegisterDataSourceInput) => {
            const result = await DataSourceService.registerSource(input);

            // All input fields should be preserved
            expect(result.type).toBe(input.type);
            expect(result.name).toBe(input.name);
            expect(result.apiEndpoint).toBe(input.apiEndpoint);
            expect(result.authMethod).toBe(input.authMethod);
            expect(result.supportedSymbols).toEqual(input.supportedSymbols);
            expect(result.rateLimits).toEqual(input.rateLimits);
            
            // Optional fields
            if (input.priority !== undefined) {
              expect(result.priority).toBe(input.priority);
            }
            if (input.costPerRequest !== undefined) {
              expect(result.costPerRequest).toBe(input.costPerRequest);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique sourceIds for each registration', async () => {
      const sourceIds = new Set<string>();
      
      await fc.assert(
        fc.asyncProperty(
          registerDataSourceInputArb(),
          async (input: RegisterDataSourceInput) => {
            const result = await DataSourceService.registerSource(input);
            
            // Each sourceId should be unique
            expect(sourceIds.has(result.sourceId)).toBe(false);
            sourceIds.add(result.sourceId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('updateStatus', () => {
    it('should update data source status', async () => {
      const sourceId = 'test-source-id';
      
      const result = await DataSourceService.updateStatus(sourceId, 'INACTIVE');
      
      expect(mockedRepository.updateDataSource).toHaveBeenCalledWith(sourceId, { status: 'INACTIVE' });
      expect(result.status).toBe('INACTIVE');
    });
  });

  describe('trackUsage', () => {
    it('should track usage and calculate cost', async () => {
      const sourceId = 'test-source-id';
      const costPerRequest = 0.001;
      
      mockedRepository.getDataSource.mockResolvedValue({
        sourceId,
        type: 'PRICE',
        name: 'Test Source',
        apiEndpoint: 'https://api.test.com/v1',
        authMethod: 'API_KEY',
        supportedSymbols: ['BTC'],
        rateLimits: { requestsPerSecond: 100, requestsPerMinute: 1000, requestsPerDay: 100000 },
        status: 'ACTIVE',
        priority: 100,
        costPerRequest,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const result = await DataSourceService.trackUsage(sourceId, 5);

      expect(result.sourceId).toBe(sourceId);
      expect(result.requestCount).toBe(5);
      expect(result.totalCost).toBe(costPerRequest * 5);
    });
  });
});
