/**
 * Data Source Service - manages data source registration, status updates, and usage tracking
 * 
 * Provides business logic for data source management including:
 * - Registration of new data sources
 * - Status updates (ACTIVE, INACTIVE, RATE_LIMITED, ERROR)
 * - API usage and cost tracking
 * 
 * Requirements: 1.1, 1.2, 1.5
 */

import { generateUUID } from '../utils/uuid';
import { 
  DataSource, 
  DataSourceType, 
  DataSourceStatus, 
  RateLimitConfig,
  AuthMethod 
} from '../types/data-source';
import { DataSourceRepository } from '../repositories/data-source';
import { ResourceNotFoundError } from '../db/access';

/**
 * Input for registering a new data source
 */
export interface RegisterDataSourceInput {
  type: DataSourceType;
  name: string;
  apiEndpoint: string;
  authMethod: AuthMethod;
  supportedSymbols: string[];
  rateLimits: RateLimitConfig;
  priority?: number;
  costPerRequest?: number;
}

/**
 * Usage tracking record for a data source
 */
export interface UsageRecord {
  sourceId: string;
  timestamp: string;
  requestCount: number;
  totalCost: number;
  period: 'SECOND' | 'MINUTE' | 'DAY';
}

/**
 * In-memory usage tracking (in production, this would be Redis/ElastiCache)
 */
const usageTracking: Map<string, UsageRecord[]> = new Map();

/**
 * Data Source Service
 */
export const DataSourceService = {
  /**
   * Register a new data source
   * 
   * Creates a new data source with ACTIVE status and stores it in the repository.
   * Generates a unique sourceId and sets timestamps.
   * 
   * @param input - The data source registration input
   * @returns The registered data source
   * 
   * Requirements: 1.1, 1.2
   */
  async registerSource(input: RegisterDataSourceInput): Promise<DataSource> {
    const now = new Date().toISOString();
    
    const dataSource: DataSource = {
      sourceId: generateUUID(),
      type: input.type,
      name: input.name,
      apiEndpoint: input.apiEndpoint,
      authMethod: input.authMethod,
      supportedSymbols: input.supportedSymbols,
      rateLimits: input.rateLimits,
      status: 'ACTIVE',
      priority: input.priority ?? 100,
      costPerRequest: input.costPerRequest,
      createdAt: now,
      updatedAt: now
    };

    await DataSourceRepository.putDataSource(dataSource);

    return dataSource;
  },

  /**
   * Update the status of a data source
   * 
   * @param sourceId - The unique identifier of the data source
   * @param status - The new status
   * @returns The updated data source
   * @throws ResourceNotFoundError if data source doesn't exist
   * 
   * Requirements: 1.2
   */
  async updateStatus(sourceId: string, status: DataSourceStatus): Promise<DataSource> {
    return DataSourceRepository.updateDataSource(sourceId, { status });
  },

  /**
   * Track API usage for a data source
   * 
   * Records the number of requests made to a data source and calculates cost.
   * Used for monitoring and rate limit enforcement.
   * 
   * @param sourceId - The unique identifier of the data source
   * @param requestCount - Number of requests made
   * @returns The usage record
   * 
   * Requirements: 1.5
   */
  async trackUsage(sourceId: string, requestCount: number = 1): Promise<UsageRecord> {
    const dataSource = await DataSourceRepository.getDataSource(sourceId);
    if (!dataSource) {
      throw new ResourceNotFoundError('DataSource', sourceId);
    }

    const now = new Date().toISOString();
    const totalCost = (dataSource.costPerRequest ?? 0) * requestCount;

    const record: UsageRecord = {
      sourceId,
      timestamp: now,
      requestCount,
      totalCost,
      period: 'SECOND'
    };

    // Store in memory (in production, this would be persisted)
    const existingRecords = usageTracking.get(sourceId) || [];
    existingRecords.push(record);
    
    // Keep only last 1000 records per source
    if (existingRecords.length > 1000) {
      existingRecords.shift();
    }
    
    usageTracking.set(sourceId, existingRecords);

    // Check if we need to rate limit
    await this.checkRateLimits(sourceId, dataSource);

    return record;
  },

  /**
   * Get usage statistics for a data source
   * 
   * @param sourceId - The unique identifier of the data source
   * @param periodMinutes - The time period to aggregate (default: 60 minutes)
   * @returns Aggregated usage statistics
   */
  async getUsageStats(sourceId: string, periodMinutes: number = 60): Promise<{
    totalRequests: number;
    totalCost: number;
    averageRequestsPerMinute: number;
  }> {
    const records = usageTracking.get(sourceId) || [];
    const cutoff = new Date(Date.now() - periodMinutes * 60 * 1000).toISOString();
    
    const recentRecords = records.filter(r => r.timestamp >= cutoff);
    
    const totalRequests = recentRecords.reduce((sum, r) => sum + r.requestCount, 0);
    const totalCost = recentRecords.reduce((sum, r) => sum + r.totalCost, 0);
    
    return {
      totalRequests,
      totalCost,
      averageRequestsPerMinute: totalRequests / periodMinutes
    };
  },

  /**
   * Check rate limits and update status if exceeded
   * 
   * @param sourceId - The unique identifier of the data source
   * @param dataSource - The data source to check
   */
  async checkRateLimits(sourceId: string, dataSource: DataSource): Promise<void> {
    const records = usageTracking.get(sourceId) || [];
    const now = Date.now();
    
    // Check requests per second
    const oneSecondAgo = new Date(now - 1000).toISOString();
    const requestsLastSecond = records
      .filter(r => r.timestamp >= oneSecondAgo)
      .reduce((sum, r) => sum + r.requestCount, 0);
    
    // Check requests per minute
    const oneMinuteAgo = new Date(now - 60000).toISOString();
    const requestsLastMinute = records
      .filter(r => r.timestamp >= oneMinuteAgo)
      .reduce((sum, r) => sum + r.requestCount, 0);

    // If rate limits exceeded, update status
    if (
      requestsLastSecond >= dataSource.rateLimits.requestsPerSecond ||
      requestsLastMinute >= dataSource.rateLimits.requestsPerMinute
    ) {
      if (dataSource.status !== 'RATE_LIMITED') {
        await this.updateStatus(sourceId, 'RATE_LIMITED');
      }
    }
  },

  /**
   * Get a data source by ID
   * 
   * @param sourceId - The unique identifier of the data source
   * @returns The data source, or null if not found
   */
  async getSource(sourceId: string): Promise<DataSource | null> {
    return DataSourceRepository.getDataSource(sourceId);
  },

  /**
   * List all data sources
   * 
   * @param type - Optional filter by type
   * @returns List of data sources
   */
  async listSources(type?: DataSourceType): Promise<DataSource[]> {
    const result = await DataSourceRepository.listDataSources({ type });
    return result.items;
  },

  /**
   * Delete a data source
   * 
   * @param sourceId - The unique identifier of the data source to delete
   */
  async deleteSource(sourceId: string): Promise<void> {
    await DataSourceRepository.deleteDataSource(sourceId);
    usageTracking.delete(sourceId);
  },

  /**
   * Clear usage tracking (for testing)
   */
  clearUsageTracking(): void {
    usageTracking.clear();
  }
};
