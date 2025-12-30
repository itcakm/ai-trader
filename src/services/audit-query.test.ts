/**
 * Audit Query Service Tests
 * 
 * Property-based tests for the Audit Query Engine.
 * 
 * Requirements: 7.1, 7.3, 7.4, 7.5, 7.6
 */

import * as fc from 'fast-check';
import { AuditQueryService } from './audit-query';
import { AuditIndexRepository } from '../repositories/audit-index';
import {
  AuditQueryFilters,
  AggregationOptions,
  AuditRecord,
  AggregationGroupBy,
  AggregationMetric
} from '../types/audit-query';

/**
 * Generator for valid ISO date strings
 */
const isoDateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Generator for valid date range (start < end)
 */
const validDateRangeArb = (): fc.Arbitrary<{ startDate: string; endDate: string }> =>
  fc.tuple(
    fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
    fc.integer({ min: 1, max: 365 })
  ).map(([start, daysOffset]) => {
    const end = new Date(start.getTime() + daysOffset * 24 * 60 * 60 * 1000);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  });

/**
 * Generator for event types
 */
const eventTypeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'TRADE_SIGNAL',
    'ORDER_CREATED',
    'ORDER_FILLED',
    'RISK_BREACH',
    'AI_ANALYSIS',
    'PARAMETER_CHANGE'
  );

/**
 * Generator for severity levels
 */
const severityArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('INFO', 'WARNING', 'ERROR', 'CRITICAL');

/**
 * Generator for crypto symbols
 */
const cryptoSymbolArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOGE');


/**
 * Generator for AuditRecord
 */
const auditRecordArb = (): fc.Arbitrary<AuditRecord> =>
  fc.record({
    recordId: fc.uuid(),
    tenantId: fc.uuid(),
    recordType: fc.constantFrom('TRADE_EVENT', 'AI_TRACE', 'RISK_EVENT', 'DATA_LINEAGE'),
    timestamp: isoDateStringArb(),
    eventType: fc.option(eventTypeArb(), { nil: undefined }),
    severity: fc.option(severityArb(), { nil: undefined }),
    strategyId: fc.option(fc.uuid(), { nil: undefined }),
    assetId: fc.option(cryptoSymbolArb(), { nil: undefined }),
    correlationId: fc.option(fc.uuid(), { nil: undefined }),
    description: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    metadata: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue(), { minKeys: 0, maxKeys: 5 })
  });

/**
 * Generator for AuditRecord with specific tenant
 */
const auditRecordWithTenantArb = (tenantId: string): fc.Arbitrary<AuditRecord> =>
  auditRecordArb().map(record => ({ ...record, tenantId }));

/**
 * Generator for AuditQueryFilters
 */
const auditQueryFiltersArb = (): fc.Arbitrary<AuditQueryFilters> =>
  validDateRangeArb().chain(timeRange =>
    fc.record({
      timeRange: fc.constant(timeRange),
      eventTypes: fc.option(fc.array(eventTypeArb(), { minLength: 1, maxLength: 3 }), { nil: undefined }),
      strategyIds: fc.option(fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }), { nil: undefined }),
      assetIds: fc.option(fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 3 }), { nil: undefined }),
      severities: fc.option(fc.array(severityArb(), { minLength: 1, maxLength: 3 }), { nil: undefined }),
      searchText: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
    })
  );

/**
 * Generator for AggregationGroupBy
 */
const aggregationGroupByArb = (): fc.Arbitrary<AggregationGroupBy> =>
  fc.constantFrom('DAY', 'HOUR', 'EVENT_TYPE', 'STRATEGY', 'ASSET');

/**
 * Generator for AggregationMetric
 */
const aggregationMetricArb = (): fc.Arbitrary<AggregationMetric> =>
  fc.constantFrom('COUNT', 'SUM', 'AVG', 'MIN', 'MAX');

/**
 * Generator for AggregationOptions
 */
const aggregationOptionsArb = (): fc.Arbitrary<AggregationOptions> =>
  fc.record({
    groupBy: aggregationGroupByArb(),
    metrics: fc.array(aggregationMetricArb(), { minLength: 1, maxLength: 5 }),
    field: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
  });

describe('AuditQueryService', () => {
  const testTenantId = 'test-tenant-001';
  
  beforeEach(async () => {
    // Clear indexes and query logs before each test
    await AuditIndexRepository.clearAllIndexes();
    AuditQueryService.clearQueryLogs();
    AuditQueryService.resetConfig();
  });

  afterEach(async () => {
    await AuditIndexRepository.clearAllIndexes();
    AuditQueryService.clearQueryLogs();
  });


  /**
   * Property 19: Query Filter Correctness
   * 
   * For any audit query with filters (time range, event type, strategy, asset, severity),
   * all returned records SHALL match all specified filters, and no matching records SHALL be omitted.
   * 
   * Feature: reporting-audit, Property 19: Query Filter Correctness
   * Validates: Requirements 7.1
   */
  describe('Property 19: Query Filter Correctness', () => {
    it('all returned records should match all specified filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 20 }),
          auditQueryFiltersArb(),
          async (records, filters) => {
            // Clear index before each iteration
            await AuditIndexRepository.clearTenantIndex(testTenantId);
            
            // Index all records
            await AuditIndexRepository.bulkIndex(records);
            
            // Execute query
            const result = await AuditQueryService.query(testTenantId, filters);
            
            // Verify all returned records match filters
            for (const record of result.items) {
              // Check time range
              const recordTime = new Date(record.timestamp).getTime();
              const startTime = new Date(filters.timeRange.startDate).getTime();
              const endTime = new Date(filters.timeRange.endDate).getTime();
              expect(recordTime).toBeGreaterThanOrEqual(startTime);
              expect(recordTime).toBeLessThanOrEqual(endTime);
              
              // Check event type filter
              if (filters.eventTypes && filters.eventTypes.length > 0) {
                expect(record.eventType).toBeDefined();
                expect(filters.eventTypes).toContain(record.eventType);
              }
              
              // Check strategy filter
              if (filters.strategyIds && filters.strategyIds.length > 0) {
                expect(record.strategyId).toBeDefined();
                expect(filters.strategyIds).toContain(record.strategyId);
              }
              
              // Check asset filter
              if (filters.assetIds && filters.assetIds.length > 0) {
                expect(record.assetId).toBeDefined();
                expect(filters.assetIds).toContain(record.assetId);
              }
              
              // Check severity filter
              if (filters.severities && filters.severities.length > 0) {
                expect(record.severity).toBeDefined();
                expect(filters.severities).toContain(record.severity);
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no matching records should be omitted from results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 20 }),
          validDateRangeArb(),
          async (records, timeRange) => {
            // Clear index before each iteration
            await AuditIndexRepository.clearTenantIndex(testTenantId);
            
            // Index all records
            await AuditIndexRepository.bulkIndex(records);
            
            // Query with just time range filter
            const filters: AuditQueryFilters = { timeRange };
            const result = await AuditQueryService.query(testTenantId, filters, 1000);
            
            // Count records that should match
            const expectedMatches = records.filter(r => {
              const recordTime = new Date(r.timestamp).getTime();
              const startTime = new Date(timeRange.startDate).getTime();
              const endTime = new Date(timeRange.endDate).getTime();
              return recordTime >= startTime && recordTime <= endTime;
            });
            
            // Verify count matches
            expect(result.totalCount).toBe(expectedMatches.length);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 20: Aggregation Accuracy
   * 
   * For any aggregation query (grouping by day, hour, event type, strategy, or asset),
   * the aggregated counts and metrics SHALL equal the sum of individual records in each group.
   * 
   * Feature: reporting-audit, Property 20: Aggregation Accuracy
   * Validates: Requirements 7.3
   */
  describe('Property 20: Aggregation Accuracy', () => {
    it('aggregated counts should equal sum of individual records in each group', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 30 }),
          validDateRangeArb(),
          aggregationGroupByArb(),
          async (records, timeRange, groupBy) => {
            // Clear index before each iteration
            await AuditIndexRepository.clearTenantIndex(testTenantId);
            
            // Index all records
            await AuditIndexRepository.bulkIndex(records);
            
            // Execute aggregation
            const filters: AuditQueryFilters = { timeRange };
            const options: AggregationOptions = {
              groupBy,
              metrics: ['COUNT']
            };
            const result = await AuditQueryService.aggregate(testTenantId, filters, options);
            
            // Calculate expected total from buckets
            const bucketTotal = result.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
            
            // Verify total matches
            expect(bucketTotal).toBe(result.totalCount);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('each bucket count should match actual records in that group', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 20 }),
          validDateRangeArb(),
          async (records, timeRange) => {
            // Clear index before each iteration
            await AuditIndexRepository.clearTenantIndex(testTenantId);
            
            // Index all records
            await AuditIndexRepository.bulkIndex(records);
            
            // Aggregate by EVENT_TYPE
            const filters: AuditQueryFilters = { timeRange };
            const options: AggregationOptions = {
              groupBy: 'EVENT_TYPE',
              metrics: ['COUNT']
            };
            const result = await AuditQueryService.aggregate(testTenantId, filters, options);
            
            // For each bucket, verify count matches actual records
            for (const bucket of result.buckets) {
              // Count matching records manually
              const matchingRecords = records.filter(r => {
                const recordTime = new Date(r.timestamp).getTime();
                const startTime = new Date(timeRange.startDate).getTime();
                const endTime = new Date(timeRange.endDate).getTime();
                const inTimeRange = recordTime >= startTime && recordTime <= endTime;
                
                if (bucket.key === 'UNKNOWN') {
                  return inTimeRange && !r.eventType;
                }
                return inTimeRange && r.eventType === bucket.key;
              });
              
              expect(bucket.count).toBe(matchingRecords.length);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 21: Pagination Completeness
   * 
   * For any query result set, iterating through all pages SHALL return exactly the same records
   * as a non-paginated query (if supported), with no duplicates and no omissions.
   * 
   * Feature: reporting-audit, Property 21: Pagination Completeness
   * Validates: Requirements 7.4
   */
  describe('Property 21: Pagination Completeness', () => {
    it('iterating through all pages should return all records with no duplicates', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 50 }),
          validDateRangeArb(),
          fc.integer({ min: 5, max: 20 }),
          async (records, timeRange, pageSize) => {
            // Clear index before each iteration
            await AuditIndexRepository.clearTenantIndex(testTenantId);
            
            // Index all records
            await AuditIndexRepository.bulkIndex(records);
            
            const filters: AuditQueryFilters = { timeRange };
            
            // Collect all records through pagination
            const allPaginatedRecords: AuditRecord[] = [];
            let pageToken: string | undefined;
            let iterations = 0;
            const maxIterations = 100; // Safety limit
            
            do {
              const result = await AuditQueryService.query(testTenantId, filters, pageSize, pageToken);
              allPaginatedRecords.push(...result.items);
              pageToken = result.pageToken;
              iterations++;
            } while (pageToken && iterations < maxIterations);
            
            // Get all records in one query (large page size)
            const fullResult = await AuditQueryService.query(testTenantId, filters, 1000);
            
            // Verify counts match
            expect(allPaginatedRecords.length).toBe(fullResult.totalCount);
            
            // Verify no duplicates
            const recordIds = allPaginatedRecords.map(r => r.recordId);
            const uniqueIds = new Set(recordIds);
            expect(uniqueIds.size).toBe(recordIds.length);
            
            // Verify all records from full result are in paginated results
            const paginatedIds = new Set(recordIds);
            for (const record of fullResult.items) {
              expect(paginatedIds.has(record.recordId)).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('page size should be respected in results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 10, maxLength: 30 }),
          validDateRangeArb(),
          fc.integer({ min: 3, max: 10 }),
          async (records, timeRange, pageSize) => {
            // Clear index before each iteration
            await AuditIndexRepository.clearTenantIndex(testTenantId);
            
            // Index all records
            await AuditIndexRepository.bulkIndex(records);
            
            const filters: AuditQueryFilters = { timeRange };
            const result = await AuditQueryService.query(testTenantId, filters, pageSize);
            
            // Verify page size is respected (unless fewer records exist)
            expect(result.items.length).toBeLessThanOrEqual(pageSize);
            expect(result.pageSize).toBe(pageSize);
            
            // If there are more records, hasMore should be true
            if (result.totalCount > pageSize) {
              expect(result.hasMore).toBe(true);
              expect(result.pageToken).toBeDefined();
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 22: Full-Text Search Recall
   * 
   * For any audit record containing a specific text string in its description or metadata,
   * a full-text search for that string SHALL return the record in the results.
   * 
   * Feature: reporting-audit, Property 22: Full-Text Search Recall
   * Validates: Requirements 7.5
   */
  describe('Property 22: Full-Text Search Recall', () => {
    it('search should find records containing the search text in description', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
          async (searchTerm) => {
            // Create a record with the search term in description
            const record: AuditRecord = {
              recordId: `record-${Date.now()}`,
              tenantId: testTenantId,
              recordType: 'TRADE_EVENT',
              timestamp: new Date().toISOString(),
              eventType: 'ORDER_CREATED',
              description: `This is a test description containing ${searchTerm} for search`,
              metadata: {}
            };
            
            // Index the record
            await AuditIndexRepository.indexRecord(record);
            
            // Search for the term
            const result = await AuditQueryService.search(testTenantId, searchTerm);
            
            // Verify the record is found
            const foundRecord = result.items.find(r => r.recordId === record.recordId);
            expect(foundRecord).toBeDefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('search should find records containing the search text in event type', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventTypeArb(),
          async (eventType) => {
            // Create a record with the event type
            const record: AuditRecord = {
              recordId: `record-${Date.now()}-${Math.random()}`,
              tenantId: testTenantId,
              recordType: 'TRADE_EVENT',
              timestamp: new Date().toISOString(),
              eventType,
              metadata: {}
            };
            
            // Index the record
            await AuditIndexRepository.indexRecord(record);
            
            // Search for the event type
            const result = await AuditQueryService.search(testTenantId, eventType);
            
            // Verify the record is found
            const foundRecord = result.items.find(r => r.recordId === record.recordId);
            expect(foundRecord).toBeDefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('search should be case-insensitive', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 15 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          async (searchTerm) => {
            // Create a record with lowercase term
            const record: AuditRecord = {
              recordId: `record-${Date.now()}-${Math.random()}`,
              tenantId: testTenantId,
              recordType: 'TRADE_EVENT',
              timestamp: new Date().toISOString(),
              description: `Contains ${searchTerm.toLowerCase()} here`,
              metadata: {}
            };
            
            // Index the record
            await AuditIndexRepository.indexRecord(record);
            
            // Search with uppercase
            const result = await AuditQueryService.search(testTenantId, searchTerm.toUpperCase());
            
            // Verify the record is found
            const foundRecord = result.items.find(r => r.recordId === record.recordId);
            expect(foundRecord).toBeDefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 23: Query Meta-Auditing
   * 
   * For any audit query executed, the system SHALL create an access log entry
   * containing the query parameters, user, and timestamp.
   * 
   * Feature: reporting-audit, Property 23: Query Meta-Auditing
   * Validates: Requirements 7.6
   */
  describe('Property 23: Query Meta-Auditing', () => {
    it('every query should be logged with parameters and timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 10 }),
          auditQueryFiltersArb(),
          async (records, filters) => {
            // Clear previous logs
            AuditQueryService.clearQueryLogs(testTenantId);
            
            // Index records
            await AuditIndexRepository.bulkIndex(records);
            
            // Execute query
            await AuditQueryService.query(testTenantId, filters);
            
            // Verify query was logged
            const logs = AuditQueryService.getQueryLogs(testTenantId);
            expect(logs.length).toBeGreaterThan(0);
            
            const lastLog = logs[logs.length - 1];
            expect(lastLog.tenantId).toBe(testTenantId);
            expect(lastLog.queryType).toBe('QUERY');
            expect(lastLog.filters).toEqual(filters);
            expect(lastLog.timestamp).toBeDefined();
            expect(new Date(lastLog.timestamp).getTime()).not.toBeNaN();
            expect(lastLog.success).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('every aggregation should be logged with options', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 10 }),
          validDateRangeArb(),
          aggregationOptionsArb(),
          async (records, timeRange, options) => {
            // Clear previous logs
            AuditQueryService.clearQueryLogs(testTenantId);
            
            // Index records
            await AuditIndexRepository.bulkIndex(records);
            
            // Execute aggregation
            const filters: AuditQueryFilters = { timeRange };
            await AuditQueryService.aggregate(testTenantId, filters, options);
            
            // Verify aggregation was logged
            const logs = AuditQueryService.getQueryLogs(testTenantId);
            expect(logs.length).toBeGreaterThan(0);
            
            const lastLog = logs[logs.length - 1];
            expect(lastLog.tenantId).toBe(testTenantId);
            expect(lastLog.queryType).toBe('AGGREGATE');
            expect(lastLog.aggregationOptions).toEqual(options);
            expect(lastLog.timestamp).toBeDefined();
            expect(lastLog.success).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('every search should be logged with search text', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditRecordWithTenantArb(testTenantId), { minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 3, maxLength: 30 }),
          async (records, searchText) => {
            // Clear previous logs
            AuditQueryService.clearQueryLogs(testTenantId);
            
            // Index records
            await AuditIndexRepository.bulkIndex(records);
            
            // Execute search
            await AuditQueryService.search(testTenantId, searchText);
            
            // Verify search was logged
            const logs = AuditQueryService.getQueryLogs(testTenantId);
            expect(logs.length).toBeGreaterThan(0);
            
            const lastLog = logs[logs.length - 1];
            expect(lastLog.tenantId).toBe(testTenantId);
            expect(lastLog.queryType).toBe('SEARCH');
            expect(lastLog.searchText).toBe(searchText);
            expect(lastLog.timestamp).toBeDefined();
            expect(lastLog.success).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('failed queries should be logged with error message', async () => {
      // Clear previous logs
      AuditQueryService.clearQueryLogs(testTenantId);
      
      // Execute query with invalid filters (end date before start date)
      const invalidFilters: AuditQueryFilters = {
        timeRange: {
          startDate: '2025-12-31T00:00:00.000Z',
          endDate: '2020-01-01T00:00:00.000Z'
        }
      };
      
      try {
        await AuditQueryService.query(testTenantId, invalidFilters);
      } catch (error) {
        // Expected to fail
      }
      
      // Verify failed query was logged
      const logs = AuditQueryService.getQueryLogs(testTenantId);
      expect(logs.length).toBeGreaterThan(0);
      
      const lastLog = logs[logs.length - 1];
      expect(lastLog.success).toBe(false);
      expect(lastLog.errorMessage).toBeDefined();
    });
  });
});
