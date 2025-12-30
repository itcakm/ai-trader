/**
 * Audit Query Types
 * Requirements: 7.1, 7.3, 7.4
 */

/**
 * Audit query filters
 * Requirements: 7.1
 */
export interface AuditQueryFilters {
  timeRange: { startDate: string; endDate: string };
  eventTypes?: string[];
  strategyIds?: string[];
  assetIds?: string[];
  severities?: string[];
  searchText?: string;
}

/**
 * Aggregation group by options
 * Requirements: 7.3
 */
export type AggregationGroupBy = 'DAY' | 'HOUR' | 'EVENT_TYPE' | 'STRATEGY' | 'ASSET';

/**
 * Aggregation metric types
 * Requirements: 7.3
 */
export type AggregationMetric = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

/**
 * Aggregation options
 * Requirements: 7.3
 */
export interface AggregationOptions {
  groupBy: AggregationGroupBy;
  metrics: AggregationMetric[];
  field?: string;
}

/**
 * Aggregation result bucket
 */
export interface AggregationBucket {
  key: string;
  count: number;
  metrics: Record<string, number>;
}

/**
 * Aggregation result
 * Requirements: 7.3
 */
export interface AggregationResult {
  groupBy: AggregationGroupBy;
  buckets: AggregationBucket[];
  totalCount: number;
}

/**
 * Paginated query result
 * Requirements: 7.4
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  pageSize: number;
  pageToken?: string;
  hasMore: boolean;
}

/**
 * Generic audit record for query results
 */
export interface AuditRecord {
  recordId: string;
  tenantId: string;
  recordType: string;
  timestamp: string;
  eventType?: string;
  severity?: string;
  strategyId?: string;
  assetId?: string;
  correlationId?: string;
  description?: string;
  metadata: Record<string, unknown>;
}

/**
 * Audit Query Engine Service Interface
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
export interface AuditQueryEngine {
  query(
    tenantId: string,
    filters: AuditQueryFilters,
    pageSize?: number,
    pageToken?: string
  ): Promise<PaginatedResult<AuditRecord>>;
  aggregate(
    tenantId: string,
    filters: AuditQueryFilters,
    options: AggregationOptions
  ): Promise<AggregationResult>;
  search(
    tenantId: string,
    searchText: string,
    filters?: AuditQueryFilters
  ): Promise<PaginatedResult<AuditRecord>>;
}
