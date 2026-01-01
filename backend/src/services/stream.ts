/**
 * Stream Service - manages data stream lifecycle and operations
 * 
 * Provides stream management capabilities including:
 * - Starting and stopping data streams
 * - Pausing and resuming streams
 * - Stream health monitoring and metrics tracking
 * - Tenant stream limit enforcement
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.5
 */

import { generateUUID } from '../utils/uuid';
import { DataStream, StreamStatus, StreamMetrics } from '../types/stream';
import { DataSourceType } from '../types/data-source';
import { DataSourceRepository } from '../repositories/data-source';
import { ResourceNotFoundError, TenantAccessDeniedError } from '../db/access';

/**
 * Configuration for tenant stream limits
 */
export interface TenantStreamConfig {
  maxConcurrentStreams: number;
}

/**
 * Default tenant configuration
 */
const DEFAULT_TENANT_CONFIG: TenantStreamConfig = {
  maxConcurrentStreams: 10
};

/**
 * Error thrown when tenant exceeds stream limit
 */
export class StreamLimitExceededError extends Error {
  constructor(tenantId: string, currentCount: number, maxCount: number) {
    super(`Stream limit exceeded for tenant '${tenantId}': ${currentCount}/${maxCount} streams active`);
    this.name = 'StreamLimitExceededError';
  }
}

/**
 * Error thrown when stream operation is invalid for current state
 */
export class InvalidStreamStateError extends Error {
  constructor(streamId: string, currentState: StreamStatus, operation: string) {
    super(`Cannot ${operation} stream '${streamId}' in state '${currentState}'`);
    this.name = 'InvalidStreamStateError';
  }
}

/**
 * Stream health status result
 * Requirements: 8.2
 */
export interface StreamHealthStatus {
  healthy: boolean;
  issues: string[];
  connectionHealthy: boolean;
  dataFresh: boolean;
  errorRate: number;
  lastActivityMs: number;
  metrics: StreamMetrics;
}

/**
 * Comprehensive stream metrics report
 * Requirements: 8.5
 */
export interface StreamMetricsReport {
  streamId: string;
  status: StreamStatus;
  messagesReceived: number;
  messagesPerSecond: number;
  averageLatencyMs: number;
  errorCount: number;
  errorRate: number;
  lastError?: string;
  uptime: number;
  lastActivity: string;
  createdAt: string;
}


/**
 * In-memory stream storage (in production, this would use StreamRepository with DynamoDB)
 */
const streams: Map<string, DataStream> = new Map();

/**
 * Tenant configuration storage
 */
const tenantConfigs: Map<string, TenantStreamConfig> = new Map();

/**
 * Stream start times for uptime calculation
 */
const streamStartTimes: Map<string, number> = new Map();

/**
 * Create initial stream metrics
 */
function createInitialMetrics(): StreamMetrics {
  return {
    messagesReceived: 0,
    messagesPerSecond: 0,
    averageLatencyMs: 0,
    errorCount: 0,
    uptime: 0
  };
}

/**
 * Generate composite key for stream lookup
 */
function getStreamKey(tenantId: string, streamId: string): string {
  return `${tenantId}#${streamId}`;
}

/**
 * Stream Service
 */
export const StreamService = {
  /**
   * Start a new data stream
   * 
   * Creates and starts a new stream for the specified symbols from the given source.
   * Enforces tenant stream limits before creating.
   * 
   * @param tenantId - The tenant ID
   * @param sourceId - The data source ID
   * @param symbols - Array of symbols to stream
   * @returns The created data stream
   * @throws StreamLimitExceededError if tenant has reached max streams
   * @throws ResourceNotFoundError if source doesn't exist
   * 
   * Requirements: 8.1, 8.3
   */
  async startStream(
    tenantId: string,
    sourceId: string,
    symbols: string[]
  ): Promise<DataStream> {
    // Verify source exists
    const source = await DataSourceRepository.getDataSource(sourceId);
    if (!source) {
      throw new ResourceNotFoundError('DataSource', sourceId);
    }

    // Check tenant stream limits
    const config = this.getTenantConfig(tenantId);
    const activeStreams = await this.listActiveStreams(tenantId);
    
    if (activeStreams.length >= config.maxConcurrentStreams) {
      throw new StreamLimitExceededError(
        tenantId,
        activeStreams.length,
        config.maxConcurrentStreams
      );
    }

    const now = new Date().toISOString();
    const streamId = generateUUID();

    const stream: DataStream = {
      streamId,
      tenantId,
      sourceId,
      symbols,
      type: source.type,
      status: 'ACTIVE',
      metrics: createInitialMetrics(),
      createdAt: now,
      lastActivity: now
    };

    const key = getStreamKey(tenantId, streamId);
    streams.set(key, stream);
    streamStartTimes.set(key, Date.now());

    return stream;
  },

  /**
   * Stop a data stream
   * 
   * Stops and removes a stream. Can be called on any stream state.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @throws ResourceNotFoundError if stream doesn't exist
   * @throws TenantAccessDeniedError if stream belongs to different tenant
   * 
   * Requirements: 8.1
   */
  async stopStream(tenantId: string, streamId: string): Promise<void> {
    const stream = await this.getStream(tenantId, streamId);
    
    const key = getStreamKey(tenantId, streamId);
    stream.status = 'STOPPED';
    stream.lastActivity = new Date().toISOString();
    streams.set(key, stream);
    streamStartTimes.delete(key);
  },

  /**
   * Pause a data stream
   * 
   * Temporarily pauses a stream. Can only be called on ACTIVE streams.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @throws ResourceNotFoundError if stream doesn't exist
   * @throws InvalidStreamStateError if stream is not ACTIVE
   * 
   * Requirements: 8.1
   */
  async pauseStream(tenantId: string, streamId: string): Promise<void> {
    const stream = await this.getStream(tenantId, streamId);
    
    if (stream.status !== 'ACTIVE') {
      throw new InvalidStreamStateError(streamId, stream.status, 'pause');
    }

    const key = getStreamKey(tenantId, streamId);
    stream.status = 'PAUSED';
    stream.lastActivity = new Date().toISOString();
    streams.set(key, stream);
  },

  /**
   * Resume a paused data stream
   * 
   * Resumes a paused stream. Can only be called on PAUSED streams.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @throws ResourceNotFoundError if stream doesn't exist
   * @throws InvalidStreamStateError if stream is not PAUSED
   * 
   * Requirements: 8.1
   */
  async resumeStream(tenantId: string, streamId: string): Promise<void> {
    const stream = await this.getStream(tenantId, streamId);
    
    if (stream.status !== 'PAUSED') {
      throw new InvalidStreamStateError(streamId, stream.status, 'resume');
    }

    const key = getStreamKey(tenantId, streamId);
    stream.status = 'ACTIVE';
    stream.lastActivity = new Date().toISOString();
    streams.set(key, stream);
  },


  /**
   * Get stream status
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @returns The data stream with current status and metrics
   * @throws ResourceNotFoundError if stream doesn't exist
   * 
   * Requirements: 8.1
   */
  async getStreamStatus(tenantId: string, streamId: string): Promise<DataStream> {
    return this.getStream(tenantId, streamId);
  },

  /**
   * List all streams for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns List of all streams for the tenant
   * 
   * Requirements: 8.1
   */
  async listStreams(tenantId: string): Promise<DataStream[]> {
    const tenantStreams: DataStream[] = [];
    
    for (const [key, stream] of streams.entries()) {
      if (key.startsWith(`${tenantId}#`)) {
        // Update uptime for active streams
        if (stream.status === 'ACTIVE') {
          const startTime = streamStartTimes.get(key);
          if (startTime) {
            stream.metrics.uptime = Math.floor((Date.now() - startTime) / 1000);
          }
        }
        tenantStreams.push(stream);
      }
    }
    
    return tenantStreams;
  },

  /**
   * List active streams for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns List of active streams
   */
  async listActiveStreams(tenantId: string): Promise<DataStream[]> {
    const allStreams = await this.listStreams(tenantId);
    return allStreams.filter(s => s.status === 'ACTIVE');
  },

  /**
   * Get a stream by ID with tenant verification
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @returns The data stream
   * @throws ResourceNotFoundError if stream doesn't exist
   */
  async getStream(tenantId: string, streamId: string): Promise<DataStream> {
    const key = getStreamKey(tenantId, streamId);
    const stream = streams.get(key);
    
    if (!stream) {
      throw new ResourceNotFoundError('DataStream', streamId);
    }

    // Update uptime for active streams
    if (stream.status === 'ACTIVE') {
      const startTime = streamStartTimes.get(key);
      if (startTime) {
        stream.metrics.uptime = Math.floor((Date.now() - startTime) / 1000);
      }
    }

    return stream;
  },

  /**
   * Update stream metrics
   * 
   * Updates the metrics for a stream (called by data ingestion handlers).
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @param metricsUpdate - Partial metrics to update
   * @returns The updated stream
   * 
   * Requirements: 8.2, 8.5
   */
  async updateMetrics(
    tenantId: string,
    streamId: string,
    metricsUpdate: Partial<StreamMetrics>
  ): Promise<DataStream> {
    const stream = await this.getStream(tenantId, streamId);
    const key = getStreamKey(tenantId, streamId);

    stream.metrics = {
      ...stream.metrics,
      ...metricsUpdate
    };
    stream.lastActivity = new Date().toISOString();
    
    streams.set(key, stream);
    return stream;
  },

  /**
   * Record a message received on a stream
   * 
   * Increments message count and updates metrics.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @param latencyMs - The latency of the message in milliseconds
   * 
   * Requirements: 8.2, 8.5
   */
  async recordMessage(
    tenantId: string,
    streamId: string,
    latencyMs: number
  ): Promise<void> {
    const stream = await this.getStream(tenantId, streamId);
    const key = getStreamKey(tenantId, streamId);

    const newMessageCount = stream.metrics.messagesReceived + 1;
    
    // Calculate running average latency
    const newAverageLatency = stream.metrics.messagesReceived === 0
      ? latencyMs
      : (stream.metrics.averageLatencyMs * stream.metrics.messagesReceived + latencyMs) / newMessageCount;

    stream.metrics.messagesReceived = newMessageCount;
    stream.metrics.averageLatencyMs = newAverageLatency;
    stream.lastActivity = new Date().toISOString();
    
    streams.set(key, stream);
  },

  /**
   * Record an error on a stream
   * 
   * Increments error count and optionally sets stream to ERROR state.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @param error - The error message
   * @param setErrorState - Whether to set stream status to ERROR
   * 
   * Requirements: 8.2, 8.5
   */
  async recordError(
    tenantId: string,
    streamId: string,
    error: string,
    setErrorState: boolean = false
  ): Promise<void> {
    const stream = await this.getStream(tenantId, streamId);
    const key = getStreamKey(tenantId, streamId);

    stream.metrics.errorCount += 1;
    stream.metrics.lastError = error;
    stream.lastActivity = new Date().toISOString();
    
    if (setErrorState) {
      stream.status = 'ERROR';
    }
    
    streams.set(key, stream);
  },


  /**
   * Set tenant stream configuration
   * 
   * @param tenantId - The tenant ID
   * @param config - The tenant configuration
   * 
   * Requirements: 8.3
   */
  setTenantConfig(tenantId: string, config: TenantStreamConfig): void {
    tenantConfigs.set(tenantId, config);
  },

  /**
   * Get tenant stream configuration
   * 
   * @param tenantId - The tenant ID
   * @returns The tenant configuration (or default if not set)
   */
  getTenantConfig(tenantId: string): TenantStreamConfig {
    return tenantConfigs.get(tenantId) || DEFAULT_TENANT_CONFIG;
  },

  /**
   * Get count of active streams for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns The count of active streams
   * 
   * Requirements: 8.3
   */
  async getActiveStreamCount(tenantId: string): Promise<number> {
    const activeStreams = await this.listActiveStreams(tenantId);
    return activeStreams.length;
  },

  /**
   * Check if tenant can start a new stream
   * 
   * @param tenantId - The tenant ID
   * @returns True if tenant can start a new stream
   * 
   * Requirements: 8.3
   */
  async canStartStream(tenantId: string): Promise<boolean> {
    const config = this.getTenantConfig(tenantId);
    const activeCount = await this.getActiveStreamCount(tenantId);
    return activeCount < config.maxConcurrentStreams;
  },

  /**
   * Update messages per second metric
   * 
   * Should be called periodically to update the rate metric.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @param messagesPerSecond - The current messages per second rate
   * 
   * Requirements: 8.5
   */
  async updateMessageRate(
    tenantId: string,
    streamId: string,
    messagesPerSecond: number
  ): Promise<void> {
    const stream = await this.getStream(tenantId, streamId);
    const key = getStreamKey(tenantId, streamId);

    stream.metrics.messagesPerSecond = messagesPerSecond;
    stream.lastActivity = new Date().toISOString();
    
    streams.set(key, stream);
  },

  /**
   * Check stream health
   * 
   * Returns health status based on error rate and data freshness.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @returns Health status object
   * 
   * Requirements: 8.2
   */
  async checkHealth(
    tenantId: string,
    streamId: string
  ): Promise<StreamHealthStatus> {
    const stream = await this.getStream(tenantId, streamId);
    const issues: string[] = [];

    // Check if stream is in error state
    if (stream.status === 'ERROR') {
      issues.push('Stream is in ERROR state');
    }

    // Check error rate (more than 10% errors is unhealthy)
    let errorRate = 0;
    if (stream.metrics.messagesReceived > 0) {
      errorRate = stream.metrics.errorCount / stream.metrics.messagesReceived;
      if (errorRate > 0.1) {
        issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    // Check data freshness (no activity in last 60 seconds is stale)
    const lastActivityTime = new Date(stream.lastActivity).getTime();
    const staleness = Date.now() - lastActivityTime;
    const dataFresh = staleness <= 60000 || stream.status !== 'ACTIVE';
    
    if (!dataFresh) {
      issues.push(`Data is stale: no activity for ${Math.floor(staleness / 1000)} seconds`);
    }

    // Check latency (average > 1000ms is concerning)
    if (stream.metrics.averageLatencyMs > 1000) {
      issues.push(`High latency: ${stream.metrics.averageLatencyMs.toFixed(0)}ms average`);
    }

    // Determine connection health based on status
    const connectionHealthy = stream.status === 'ACTIVE' || stream.status === 'PAUSED';

    return {
      healthy: issues.length === 0,
      issues,
      connectionHealthy,
      dataFresh,
      errorRate,
      lastActivityMs: staleness,
      metrics: stream.metrics
    };
  },

  /**
   * Get comprehensive stream metrics
   * 
   * Returns all metrics for a stream including calculated values.
   * 
   * @param tenantId - The tenant ID
   * @param streamId - The stream ID
   * @returns Stream metrics with additional calculated fields
   * 
   * Requirements: 8.5
   */
  async getStreamMetrics(
    tenantId: string,
    streamId: string
  ): Promise<StreamMetricsReport> {
    const stream = await this.getStream(tenantId, streamId);
    const key = getStreamKey(tenantId, streamId);
    const startTime = streamStartTimes.get(key);
    
    const uptime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const errorRate = stream.metrics.messagesReceived > 0
      ? stream.metrics.errorCount / stream.metrics.messagesReceived
      : 0;

    return {
      streamId,
      status: stream.status,
      messagesReceived: stream.metrics.messagesReceived,
      messagesPerSecond: stream.metrics.messagesPerSecond,
      averageLatencyMs: stream.metrics.averageLatencyMs,
      errorCount: stream.metrics.errorCount,
      errorRate,
      lastError: stream.metrics.lastError,
      uptime,
      lastActivity: stream.lastActivity,
      createdAt: stream.createdAt
    };
  },

  /**
   * Clear all streams (for testing)
   */
  clearAllStreams(): void {
    streams.clear();
    streamStartTimes.clear();
  },

  /**
   * Clear tenant configuration (for testing)
   */
  clearTenantConfigs(): void {
    tenantConfigs.clear();
  }
};
