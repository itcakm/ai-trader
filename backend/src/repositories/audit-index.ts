/**
 * Audit Index Repository
 * 
 * Provides OpenSearch/Elasticsearch integration for fast audit record queries.
 * Supports full-text search, filtering, and aggregations.
 * 
 * Requirements: 7.5
 */

import {
  AuditQueryFilters,
  AggregationOptions,
  AggregationResult,
  AggregationBucket,
  PaginatedResult,
  AuditRecord
} from '../types/audit-query';

/**
 * Index document structure for audit records
 */
export interface AuditIndexDocument {
  id: string;
  tenantId: string;
  recordType: string;
  timestamp: string;
  eventType?: string;
  severity?: string;
  strategyId?: string;
  assetId?: string;
  correlationId?: string;
  description?: string;
  searchableText: string;
  metadata: Record<string, unknown>;
}

/**
 * Search query options
 */
export interface SearchQueryOptions {
  from?: number;
  size?: number;
  sort?: { field: string; order: 'asc' | 'desc' }[];
}

/**
 * Index configuration
 */
export interface AuditIndexConfig {
  endpoint: string;
  indexName: string;
  region?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AuditIndexConfig = {
  endpoint: process.env.OPENSEARCH_ENDPOINT || 'http://localhost:9200',
  indexName: process.env.AUDIT_INDEX_NAME || 'audit-records',
  region: process.env.AWS_REGION || 'us-east-1'
};


/**
 * In-memory index storage for testing and development
 * In production, this would be replaced with actual OpenSearch/Elasticsearch calls
 */
const inMemoryIndex: Map<string, Map<string, AuditIndexDocument>> = new Map();

/**
 * Get tenant index (creates if not exists)
 */
function getTenantIndex(tenantId: string): Map<string, AuditIndexDocument> {
  if (!inMemoryIndex.has(tenantId)) {
    inMemoryIndex.set(tenantId, new Map());
  }
  return inMemoryIndex.get(tenantId)!;
}

/**
 * Build searchable text from audit record
 */
export function buildSearchableText(record: Partial<AuditRecord>): string {
  const parts: string[] = [];
  
  if (record.recordType) parts.push(record.recordType);
  if (record.eventType) parts.push(record.eventType);
  if (record.severity) parts.push(record.severity);
  if (record.description) parts.push(record.description);
  if (record.strategyId) parts.push(record.strategyId);
  if (record.assetId) parts.push(record.assetId);
  if (record.correlationId) parts.push(record.correlationId);
  
  // Add metadata values
  if (record.metadata) {
    for (const value of Object.values(record.metadata)) {
      if (typeof value === 'string') {
        parts.push(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        parts.push(String(value));
      }
    }
  }
  
  return parts.join(' ').toLowerCase();
}

/**
 * Convert AuditRecord to index document
 */
export function toIndexDocument(record: AuditRecord): AuditIndexDocument {
  return {
    id: record.recordId,
    tenantId: record.tenantId,
    recordType: record.recordType,
    timestamp: record.timestamp,
    eventType: record.eventType,
    severity: record.severity,
    strategyId: record.strategyId,
    assetId: record.assetId,
    correlationId: record.correlationId,
    description: record.description,
    searchableText: buildSearchableText(record),
    metadata: record.metadata
  };
}

/**
 * Convert index document back to AuditRecord
 */
export function fromIndexDocument(doc: AuditIndexDocument): AuditRecord {
  return {
    recordId: doc.id,
    tenantId: doc.tenantId,
    recordType: doc.recordType,
    timestamp: doc.timestamp,
    eventType: doc.eventType,
    severity: doc.severity,
    strategyId: doc.strategyId,
    assetId: doc.assetId,
    correlationId: doc.correlationId,
    description: doc.description,
    metadata: doc.metadata
  };
}

/**
 * Check if document matches filters
 */
export function matchesFilters(doc: AuditIndexDocument, filters: AuditQueryFilters): boolean {
  // Time range filter
  if (filters.timeRange) {
    const docTime = new Date(doc.timestamp).getTime();
    const startTime = new Date(filters.timeRange.startDate).getTime();
    const endTime = new Date(filters.timeRange.endDate).getTime();
    if (docTime < startTime || docTime > endTime) {
      return false;
    }
  }
  
  // Event type filter
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    if (!doc.eventType || !filters.eventTypes.includes(doc.eventType)) {
      return false;
    }
  }
  
  // Strategy filter
  if (filters.strategyIds && filters.strategyIds.length > 0) {
    if (!doc.strategyId || !filters.strategyIds.includes(doc.strategyId)) {
      return false;
    }
  }
  
  // Asset filter
  if (filters.assetIds && filters.assetIds.length > 0) {
    if (!doc.assetId || !filters.assetIds.includes(doc.assetId)) {
      return false;
    }
  }
  
  // Severity filter
  if (filters.severities && filters.severities.length > 0) {
    if (!doc.severity || !filters.severities.includes(doc.severity)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if document matches search text
 */
export function matchesSearchText(doc: AuditIndexDocument, searchText: string): boolean {
  if (!searchText || searchText.trim() === '') {
    return true;
  }
  
  const normalizedSearch = searchText.toLowerCase().trim();
  return doc.searchableText.includes(normalizedSearch);
}


/**
 * Get group key for aggregation
 */
function getGroupKey(doc: AuditIndexDocument, groupBy: AggregationOptions['groupBy']): string {
  switch (groupBy) {
    case 'DAY': {
      const date = new Date(doc.timestamp);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    }
    case 'HOUR': {
      const date = new Date(doc.timestamp);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}`;
    }
    case 'EVENT_TYPE':
      return doc.eventType || 'UNKNOWN';
    case 'STRATEGY':
      return doc.strategyId || 'UNKNOWN';
    case 'ASSET':
      return doc.assetId || 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Calculate metrics for a group of documents
 */
function calculateMetrics(
  docs: AuditIndexDocument[],
  metrics: AggregationOptions['metrics'],
  field?: string
): Record<string, number> {
  const result: Record<string, number> = {};
  
  for (const metric of metrics) {
    switch (metric) {
      case 'COUNT':
        result.count = docs.length;
        break;
      case 'SUM':
      case 'AVG':
      case 'MIN':
      case 'MAX':
        if (field) {
          const values = docs
            .map(d => {
              const val = d.metadata[field];
              return typeof val === 'number' ? val : NaN;
            })
            .filter(v => !isNaN(v));
          
          if (values.length > 0) {
            switch (metric) {
              case 'SUM':
                result.sum = values.reduce((a, b) => a + b, 0);
                break;
              case 'AVG':
                result.avg = values.reduce((a, b) => a + b, 0) / values.length;
                break;
              case 'MIN':
                result.min = Math.min(...values);
                break;
              case 'MAX':
                result.max = Math.max(...values);
                break;
            }
          }
        }
        break;
    }
  }
  
  return result;
}

/**
 * Audit Index Repository
 * 
 * Provides search index operations for audit records.
 * Uses in-memory storage for testing, can be replaced with OpenSearch in production.
 * 
 * Requirements: 7.5
 */
export const AuditIndexRepository = {
  config: { ...DEFAULT_CONFIG } as AuditIndexConfig,

  /**
   * Configure the repository
   */
  configure(config: Partial<AuditIndexConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  },

  /**
   * Index an audit record
   * 
   * @param record - The audit record to index
   */
  async indexRecord(record: AuditRecord): Promise<void> {
    const doc = toIndexDocument(record);
    const tenantIndex = getTenantIndex(record.tenantId);
    tenantIndex.set(doc.id, doc);
  },

  /**
   * Index multiple audit records
   * 
   * @param records - The audit records to index
   */
  async bulkIndex(records: AuditRecord[]): Promise<void> {
    for (const record of records) {
      await this.indexRecord(record);
    }
  },

  /**
   * Delete an indexed record
   * 
   * @param tenantId - The tenant ID
   * @param recordId - The record ID to delete
   */
  async deleteRecord(tenantId: string, recordId: string): Promise<void> {
    const tenantIndex = getTenantIndex(tenantId);
    tenantIndex.delete(recordId);
  },

  /**
   * Query audit records with filters
   * 
   * Requirements: 7.1, 7.4
   * 
   * @param tenantId - The tenant ID
   * @param filters - Query filters
   * @param pageSize - Number of results per page
   * @param pageToken - Token for pagination (offset as string)
   * @returns Paginated query results
   */
  async query(
    tenantId: string,
    filters: AuditQueryFilters,
    pageSize: number = 100,
    pageToken?: string
  ): Promise<PaginatedResult<AuditRecord>> {
    const tenantIndex = getTenantIndex(tenantId);
    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    
    // Filter documents
    const allDocs = Array.from(tenantIndex.values());
    const filteredDocs = allDocs.filter(doc => matchesFilters(doc, filters));
    
    // Sort by timestamp descending
    filteredDocs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Apply pagination
    const paginatedDocs = filteredDocs.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < filteredDocs.length;
    
    return {
      items: paginatedDocs.map(fromIndexDocument),
      totalCount: filteredDocs.length,
      pageSize,
      pageToken: hasMore ? String(offset + pageSize) : undefined,
      hasMore
    };
  },

  /**
   * Aggregate audit records
   * 
   * Requirements: 7.3
   * 
   * @param tenantId - The tenant ID
   * @param filters - Query filters
   * @param options - Aggregation options
   * @returns Aggregation results
   */
  async aggregate(
    tenantId: string,
    filters: AuditQueryFilters,
    options: AggregationOptions
  ): Promise<AggregationResult> {
    const tenantIndex = getTenantIndex(tenantId);
    
    // Filter documents
    const allDocs = Array.from(tenantIndex.values());
    const filteredDocs = allDocs.filter(doc => matchesFilters(doc, filters));
    
    // Group documents
    const groups = new Map<string, AuditIndexDocument[]>();
    for (const doc of filteredDocs) {
      const key = getGroupKey(doc, options.groupBy);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(doc);
    }
    
    // Calculate metrics for each group
    const buckets: AggregationBucket[] = [];
    for (const [key, docs] of groups) {
      buckets.push({
        key,
        count: docs.length,
        metrics: calculateMetrics(docs, options.metrics, options.field)
      });
    }
    
    // Sort buckets by key
    buckets.sort((a, b) => a.key.localeCompare(b.key));
    
    return {
      groupBy: options.groupBy,
      buckets,
      totalCount: filteredDocs.length
    };
  },

  /**
   * Full-text search in audit records
   * 
   * Requirements: 7.5
   * 
   * @param tenantId - The tenant ID
   * @param searchText - Text to search for
   * @param filters - Optional additional filters
   * @param pageSize - Number of results per page
   * @param pageToken - Token for pagination
   * @returns Paginated search results
   */
  async search(
    tenantId: string,
    searchText: string,
    filters?: AuditQueryFilters,
    pageSize: number = 100,
    pageToken?: string
  ): Promise<PaginatedResult<AuditRecord>> {
    const tenantIndex = getTenantIndex(tenantId);
    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    
    // Filter and search documents
    const allDocs = Array.from(tenantIndex.values());
    const matchedDocs = allDocs.filter(doc => {
      // Apply search text filter
      if (!matchesSearchText(doc, searchText)) {
        return false;
      }
      // Apply additional filters if provided
      if (filters && !matchesFilters(doc, filters)) {
        return false;
      }
      return true;
    });
    
    // Sort by timestamp descending
    matchedDocs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Apply pagination
    const paginatedDocs = matchedDocs.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < matchedDocs.length;
    
    return {
      items: paginatedDocs.map(fromIndexDocument),
      totalCount: matchedDocs.length,
      pageSize,
      pageToken: hasMore ? String(offset + pageSize) : undefined,
      hasMore
    };
  },

  /**
   * Get a single record by ID
   * 
   * @param tenantId - The tenant ID
   * @param recordId - The record ID
   * @returns The audit record or null
   */
  async getRecord(tenantId: string, recordId: string): Promise<AuditRecord | null> {
    const tenantIndex = getTenantIndex(tenantId);
    const doc = tenantIndex.get(recordId);
    return doc ? fromIndexDocument(doc) : null;
  },

  /**
   * Count records matching filters
   * 
   * @param tenantId - The tenant ID
   * @param filters - Query filters
   * @returns Count of matching records
   */
  async count(tenantId: string, filters: AuditQueryFilters): Promise<number> {
    const tenantIndex = getTenantIndex(tenantId);
    const allDocs = Array.from(tenantIndex.values());
    return allDocs.filter(doc => matchesFilters(doc, filters)).length;
  },

  /**
   * Clear all indexed records for a tenant (for testing)
   * 
   * @param tenantId - The tenant ID
   */
  async clearTenantIndex(tenantId: string): Promise<void> {
    inMemoryIndex.delete(tenantId);
  },

  /**
   * Clear all indexed records (for testing)
   */
  async clearAllIndexes(): Promise<void> {
    inMemoryIndex.clear();
  }
};
