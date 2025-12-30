/**
 * Audit Query Service
 * 
 * Provides search and aggregation capabilities for audit data.
 * Supports filtering, pagination, full-text search, and query logging.
 * 
 * Requirements: 7.1, 7.3, 7.4, 7.5, 7.6
 */

import {
  AuditQueryFilters,
  AggregationOptions,
  AggregationResult,
  PaginatedResult,
  AuditRecord,
  AuditQueryEngine
} from '../types/audit-query';
import { AccessLogInput } from '../types/audit-access';
import { AuditIndexRepository } from '../repositories/audit-index';
import { generateUUID } from '../utils/uuid';

/**
 * Configuration for the Audit Query Service
 */
export interface AuditQueryServiceConfig {
  /** Maximum page size for queries */
  maxPageSize: number;
  /** Default page size */
  defaultPageSize: number;
  /** Query timeout in milliseconds */
  queryTimeoutMs: number;
  /** Enable query logging */
  enableQueryLogging: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AuditQueryServiceConfig = {
  maxPageSize: 1000,
  defaultPageSize: 100,
  queryTimeoutMs: 5000,
  enableQueryLogging: true
};

/**
 * Query log entry for meta-auditing
 * Requirements: 7.6
 */
export interface QueryLogEntry {
  queryId: string;
  tenantId: string;
  userId: string;
  queryType: 'QUERY' | 'AGGREGATE' | 'SEARCH';
  filters: AuditQueryFilters;
  aggregationOptions?: AggregationOptions;
  searchText?: string;
  resultCount: number;
  executionTimeMs: number;
  timestamp: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * In-memory query log storage (for testing)
 * In production, this would be stored in the audit system
 */
const queryLogs: Map<string, QueryLogEntry[]> = new Map();

/**
 * Get query logs for a tenant
 */
function getTenantQueryLogs(tenantId: string): QueryLogEntry[] {
  if (!queryLogs.has(tenantId)) {
    queryLogs.set(tenantId, []);
  }
  return queryLogs.get(tenantId)!;
}


/**
 * Validate query filters
 */
function validateFilters(filters: AuditQueryFilters): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate time range
  if (filters.timeRange) {
    const startDate = new Date(filters.timeRange.startDate);
    const endDate = new Date(filters.timeRange.endDate);
    
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid start date');
    }
    if (isNaN(endDate.getTime())) {
      errors.push('Invalid end date');
    }
    if (startDate > endDate) {
      errors.push('Start date must be before end date');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Audit Query Service
 * 
 * Provides comprehensive query capabilities for audit records.
 * All queries are logged for meta-auditing purposes.
 * 
 * Requirements: 7.1, 7.3, 7.4, 7.5, 7.6
 */
export const AuditQueryService: AuditQueryEngine & {
  config: AuditQueryServiceConfig;
  configure: (config: Partial<AuditQueryServiceConfig>) => void;
  resetConfig: () => void;
  getQueryLogs: (tenantId: string) => QueryLogEntry[];
  clearQueryLogs: (tenantId?: string) => void;
  logQuery: (entry: QueryLogEntry) => void;
} = {
  config: { ...DEFAULT_CONFIG } as AuditQueryServiceConfig,

  /**
   * Configure the service
   */
  configure(config: Partial<AuditQueryServiceConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  },

  /**
   * Log a query for meta-auditing
   * Requirements: 7.6
   */
  logQuery(entry: QueryLogEntry): void {
    if (this.config.enableQueryLogging) {
      const logs = getTenantQueryLogs(entry.tenantId);
      logs.push(entry);
    }
  },

  /**
   * Get query logs for a tenant
   * Requirements: 7.6
   */
  getQueryLogs(tenantId: string): QueryLogEntry[] {
    return getTenantQueryLogs(tenantId);
  },

  /**
   * Clear query logs
   */
  clearQueryLogs(tenantId?: string): void {
    if (tenantId) {
      queryLogs.delete(tenantId);
    } else {
      queryLogs.clear();
    }
  },

  /**
   * Query audit records with filters
   * 
   * Requirements: 7.1, 7.4, 7.6
   * 
   * @param tenantId - The tenant ID
   * @param filters - Query filters
   * @param pageSize - Number of results per page
   * @param pageToken - Token for pagination
   * @returns Paginated query results
   */
  async query(
    tenantId: string,
    filters: AuditQueryFilters,
    pageSize?: number,
    pageToken?: string
  ): Promise<PaginatedResult<AuditRecord>> {
    const startTime = Date.now();
    const queryId = generateUUID();
    const effectivePageSize = Math.min(
      pageSize ?? this.config.defaultPageSize,
      this.config.maxPageSize
    );
    
    // Validate filters
    const validation = validateFilters(filters);
    if (!validation.valid) {
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system', // Would be passed from context in real implementation
        queryType: 'QUERY',
        filters,
        resultCount: 0,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: validation.errors.join(', ')
      };
      this.logQuery(logEntry);
      throw new Error(`Invalid query filters: ${validation.errors.join(', ')}`);
    }
    
    try {
      const result = await AuditIndexRepository.query(
        tenantId,
        filters,
        effectivePageSize,
        pageToken
      );
      
      // Log the query
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system',
        queryType: 'QUERY',
        filters,
        resultCount: result.totalCount,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: true
      };
      this.logQuery(logEntry);
      
      return result;
    } catch (error) {
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system',
        queryType: 'QUERY',
        filters,
        resultCount: 0,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
      this.logQuery(logEntry);
      throw error;
    }
  },

  /**
   * Aggregate audit data for trends
   * 
   * Requirements: 7.3, 7.6
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
    const startTime = Date.now();
    const queryId = generateUUID();
    
    // Validate filters
    const validation = validateFilters(filters);
    if (!validation.valid) {
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system',
        queryType: 'AGGREGATE',
        filters,
        aggregationOptions: options,
        resultCount: 0,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: validation.errors.join(', ')
      };
      this.logQuery(logEntry);
      throw new Error(`Invalid query filters: ${validation.errors.join(', ')}`);
    }
    
    try {
      const result = await AuditIndexRepository.aggregate(
        tenantId,
        filters,
        options
      );
      
      // Log the query
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system',
        queryType: 'AGGREGATE',
        filters,
        aggregationOptions: options,
        resultCount: result.totalCount,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: true
      };
      this.logQuery(logEntry);
      
      return result;
    } catch (error) {
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system',
        queryType: 'AGGREGATE',
        filters,
        aggregationOptions: options,
        resultCount: 0,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
      this.logQuery(logEntry);
      throw error;
    }
  },

  /**
   * Full-text search in audit records
   * 
   * Requirements: 7.5, 7.6
   * 
   * @param tenantId - The tenant ID
   * @param searchText - Text to search for
   * @param filters - Optional additional filters
   * @returns Paginated search results
   */
  async search(
    tenantId: string,
    searchText: string,
    filters?: AuditQueryFilters
  ): Promise<PaginatedResult<AuditRecord>> {
    const startTime = Date.now();
    const queryId = generateUUID();
    
    // Validate filters if provided
    if (filters) {
      const validation = validateFilters(filters);
      if (!validation.valid) {
        const logEntry: QueryLogEntry = {
          queryId,
          tenantId,
          userId: 'system',
          queryType: 'SEARCH',
          filters: filters || { timeRange: { startDate: '', endDate: '' } },
          searchText,
          resultCount: 0,
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          success: false,
          errorMessage: validation.errors.join(', ')
        };
        this.logQuery(logEntry);
        throw new Error(`Invalid query filters: ${validation.errors.join(', ')}`);
      }
    }
    
    try {
      const result = await AuditIndexRepository.search(
        tenantId,
        searchText,
        filters,
        this.config.defaultPageSize
      );
      
      // Log the query
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system',
        queryType: 'SEARCH',
        filters: filters || { timeRange: { startDate: '', endDate: '' } },
        searchText,
        resultCount: result.totalCount,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: true
      };
      this.logQuery(logEntry);
      
      return result;
    } catch (error) {
      const logEntry: QueryLogEntry = {
        queryId,
        tenantId,
        userId: 'system',
        queryType: 'SEARCH',
        filters: filters || { timeRange: { startDate: '', endDate: '' } },
        searchText,
        resultCount: 0,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
      this.logQuery(logEntry);
      throw error;
    }
  }
};
