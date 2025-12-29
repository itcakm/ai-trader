/**
 * Backfill Service - manages historical data backfill requests and processing
 * 
 * Provides backfill management capabilities including:
 * - Requesting and processing backfills
 * - Progress tracking with percentComplete and estimatedCompletionTime
 * - Data gap detection and reporting
 * - Rate limiting to respect source limits
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { generateUUID } from '../utils/uuid';
import {
  BackfillRequest,
  BackfillRequestInput,
  BackfillProgress,
  BackfillStatus,
  DataGap
} from '../types/backfill';
import { RateLimitConfig } from '../types/data-source';
import { DataSourceRepository } from '../repositories/data-source';
import { ResourceNotFoundError, TenantAccessDeniedError } from '../db/access';

/**
 * Error thrown when backfill request is invalid
 */
export class InvalidBackfillRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBackfillRequestError';
  }
}

/**
 * Error thrown when backfill is already in progress
 */
export class BackfillAlreadyInProgressError extends Error {
  constructor(requestId: string) {
    super(`Backfill request '${requestId}' is already in progress`);
    this.name = 'BackfillAlreadyInProgressError';
  }
}

/**
 * Error thrown when backfill cannot be cancelled
 */
export class BackfillCannotBeCancelledError extends Error {
  constructor(requestId: string, status: BackfillStatus) {
    super(`Backfill request '${requestId}' cannot be cancelled in status '${status}'`);
    this.name = 'BackfillCannotBeCancelledError';
  }
}

/**
 * Rate limiter state for tracking request rates
 */
interface RateLimiterState {
  requestTimestamps: number[];
  lastRequestTime: number;
}

/**
 * In-memory backfill storage (in production, this would use BackfillRepository with DynamoDB)
 */
const backfillRequests: Map<string, BackfillRequest> = new Map();

/**
 * Rate limiter state per source
 */
const rateLimiters: Map<string, RateLimiterState> = new Map();

/**
 * Processing start times for ETA calculation
 */
const processingStartTimes: Map<string, number> = new Map();

/**
 * Generate composite key for backfill lookup
 */
function getBackfillKey(tenantId: string, requestId: string): string {
  return `${tenantId}#${requestId}`;
}

/**
 * Create initial backfill progress
 */
function createInitialProgress(): BackfillProgress {
  return {
    totalRecords: 0,
    processedRecords: 0,
    percentComplete: 0,
    gaps: []
  };
}

/**
 * Calculate estimated completion time based on processing rate
 */
function calculateEstimatedCompletionTime(
  startTime: number,
  processedRecords: number,
  totalRecords: number
): string | undefined {
  if (processedRecords === 0 || totalRecords === 0) {
    return undefined;
  }

  const elapsedMs = Date.now() - startTime;
  const recordsPerMs = processedRecords / elapsedMs;
  const remainingRecords = totalRecords - processedRecords;
  const estimatedRemainingMs = remainingRecords / recordsPerMs;
  
  const estimatedCompletionDate = new Date(Date.now() + estimatedRemainingMs);
  return estimatedCompletionDate.toISOString();
}


/**
 * Backfill Service
 */
export const BackfillService = {
  /**
   * Request a new backfill
   * 
   * Creates a new backfill request and queues it for processing.
   * Validates the request and source availability.
   * 
   * @param tenantId - The tenant ID
   * @param input - The backfill request input
   * @returns The created backfill request
   * @throws ResourceNotFoundError if source doesn't exist
   * @throws InvalidBackfillRequestError if request is invalid
   * 
   * Requirements: 9.1, 9.2
   */
  async requestBackfill(
    tenantId: string,
    input: BackfillRequestInput
  ): Promise<BackfillRequest> {
    // Validate source exists
    const source = await DataSourceRepository.getDataSource(input.sourceId);
    if (!source) {
      throw new ResourceNotFoundError('DataSource', input.sourceId);
    }

    // Validate date range
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new InvalidBackfillRequestError('Invalid date format for startTime or endTime');
    }
    
    if (startTime >= endTime) {
      throw new InvalidBackfillRequestError('startTime must be before endTime');
    }

    // Validate data type is supported by source
    if (source.type !== input.dataType) {
      throw new InvalidBackfillRequestError(
        `Source '${input.sourceId}' does not support data type '${input.dataType}'`
      );
    }

    // Validate symbol is supported by source
    if (!source.supportedSymbols.includes(input.symbol)) {
      throw new InvalidBackfillRequestError(
        `Source '${input.sourceId}' does not support symbol '${input.symbol}'`
      );
    }

    const now = new Date().toISOString();
    const requestId = generateUUID();

    const backfillRequest: BackfillRequest = {
      requestId,
      tenantId,
      sourceId: input.sourceId,
      symbol: input.symbol,
      dataType: input.dataType,
      startTime: input.startTime,
      endTime: input.endTime,
      status: 'QUEUED',
      progress: createInitialProgress(),
      createdAt: now
    };

    const key = getBackfillKey(tenantId, requestId);
    backfillRequests.set(key, backfillRequest);

    return backfillRequest;
  },

  /**
   * Process a backfill request
   * 
   * Starts processing a queued backfill request. Updates status to PROCESSING
   * and begins fetching historical data.
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The backfill request ID
   * @returns The updated backfill request
   * @throws ResourceNotFoundError if request doesn't exist
   * @throws BackfillAlreadyInProgressError if already processing
   * 
   * Requirements: 9.1, 9.2
   */
  async processBackfill(
    tenantId: string,
    requestId: string
  ): Promise<BackfillRequest> {
    const request = await this.getBackfillStatus(tenantId, requestId);
    
    if (request.status === 'PROCESSING') {
      throw new BackfillAlreadyInProgressError(requestId);
    }

    if (request.status !== 'QUEUED') {
      throw new InvalidBackfillRequestError(
        `Cannot process backfill in status '${request.status}'`
      );
    }

    const key = getBackfillKey(tenantId, requestId);
    request.status = 'PROCESSING';
    
    // Store processing start time for ETA calculation
    processingStartTimes.set(key, Date.now());
    
    backfillRequests.set(key, request);

    return request;
  },

  /**
   * Get backfill status
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The backfill request ID
   * @returns The backfill request with current status
   * @throws ResourceNotFoundError if request doesn't exist
   * 
   * Requirements: 9.1
   */
  async getBackfillStatus(
    tenantId: string,
    requestId: string
  ): Promise<BackfillRequest> {
    const key = getBackfillKey(tenantId, requestId);
    const request = backfillRequests.get(key);
    
    if (!request) {
      throw new ResourceNotFoundError('BackfillRequest', requestId);
    }

    // Verify tenant ownership
    if (request.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'backfill');
    }

    return request;
  },

  /**
   * Cancel a backfill request
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The backfill request ID
   * @throws ResourceNotFoundError if request doesn't exist
   * @throws BackfillCannotBeCancelledError if request cannot be cancelled
   * 
   * Requirements: 9.1
   */
  async cancelBackfill(
    tenantId: string,
    requestId: string
  ): Promise<void> {
    const request = await this.getBackfillStatus(tenantId, requestId);
    
    if (request.status === 'COMPLETED' || request.status === 'FAILED') {
      throw new BackfillCannotBeCancelledError(requestId, request.status);
    }

    const key = getBackfillKey(tenantId, requestId);
    request.status = 'FAILED';
    request.completedAt = new Date().toISOString();
    
    backfillRequests.set(key, request);
    processingStartTimes.delete(key);
  },

  /**
   * List all backfill requests for a tenant
   * 
   * @param tenantId - The tenant ID
   * @returns List of backfill requests
   * 
   * Requirements: 9.1
   */
  async listBackfills(tenantId: string): Promise<BackfillRequest[]> {
    const tenantBackfills: BackfillRequest[] = [];
    
    for (const [key, request] of backfillRequests.entries()) {
      if (key.startsWith(`${tenantId}#`)) {
        tenantBackfills.push(request);
      }
    }
    
    return tenantBackfills;
  },

  /**
   * Update backfill progress
   * 
   * Updates the progress of a processing backfill including percentComplete
   * and estimatedCompletionTime.
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The backfill request ID
   * @param processedRecords - Number of records processed
   * @param totalRecords - Total number of records to process
   * @returns The updated backfill request
   * 
   * Requirements: 9.4
   */
  async updateProgress(
    tenantId: string,
    requestId: string,
    processedRecords: number,
    totalRecords: number
  ): Promise<BackfillRequest> {
    const request = await this.getBackfillStatus(tenantId, requestId);
    const key = getBackfillKey(tenantId, requestId);
    
    const percentComplete = totalRecords > 0 
      ? Math.round((processedRecords / totalRecords) * 100) 
      : 0;

    const startTime = processingStartTimes.get(key);
    const estimatedCompletionTime = startTime 
      ? calculateEstimatedCompletionTime(startTime, processedRecords, totalRecords)
      : undefined;

    request.progress = {
      ...request.progress,
      processedRecords,
      totalRecords,
      percentComplete,
      estimatedCompletionTime
    };

    backfillRequests.set(key, request);

    return request;
  },

  /**
   * Report a data gap found during backfill
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The backfill request ID
   * @param gap - The data gap to report
   * @returns The updated backfill request
   * 
   * Requirements: 9.5
   */
  async reportGap(
    tenantId: string,
    requestId: string,
    gap: DataGap
  ): Promise<BackfillRequest> {
    const request = await this.getBackfillStatus(tenantId, requestId);
    const key = getBackfillKey(tenantId, requestId);
    
    request.progress.gaps.push(gap);
    backfillRequests.set(key, request);

    return request;
  },

  /**
   * Complete a backfill request
   * 
   * Marks a backfill as completed and records completion time.
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The backfill request ID
   * @returns The completed backfill request
   * 
   * Requirements: 9.1, 9.5
   */
  async completeBackfill(
    tenantId: string,
    requestId: string
  ): Promise<BackfillRequest> {
    const request = await this.getBackfillStatus(tenantId, requestId);
    const key = getBackfillKey(tenantId, requestId);
    
    request.status = 'COMPLETED';
    request.completedAt = new Date().toISOString();
    request.progress.percentComplete = 100;
    
    backfillRequests.set(key, request);
    processingStartTimes.delete(key);

    return request;
  },

  /**
   * Fail a backfill request
   * 
   * Marks a backfill as failed with an optional reason.
   * 
   * @param tenantId - The tenant ID
   * @param requestId - The backfill request ID
   * @param reason - Optional failure reason
   * @returns The failed backfill request
   * 
   * Requirements: 9.1
   */
  async failBackfill(
    tenantId: string,
    requestId: string,
    reason?: string
  ): Promise<BackfillRequest> {
    const request = await this.getBackfillStatus(tenantId, requestId);
    const key = getBackfillKey(tenantId, requestId);
    
    request.status = 'FAILED';
    request.completedAt = new Date().toISOString();
    
    if (reason) {
      request.progress.gaps.push({
        startTime: request.startTime,
        endTime: request.endTime,
        reason
      });
    }
    
    backfillRequests.set(key, request);
    processingStartTimes.delete(key);

    return request;
  },


  /**
   * Check if a request can proceed based on rate limits
   * 
   * Checks if making a request would exceed the source's rate limits.
   * 
   * @param sourceId - The data source ID
   * @param rateLimits - The rate limit configuration
   * @returns True if request can proceed, false if rate limited
   * 
   * Requirements: 9.3
   */
  canMakeRequest(sourceId: string, rateLimits: RateLimitConfig): boolean {
    const state = rateLimiters.get(sourceId) || {
      requestTimestamps: [],
      lastRequestTime: 0
    };

    const now = Date.now();
    
    // Clean up old timestamps (older than 1 day)
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    state.requestTimestamps = state.requestTimestamps.filter(ts => ts > oneDayAgo);

    // Check requests per second
    const oneSecondAgo = now - 1000;
    const requestsLastSecond = state.requestTimestamps.filter(ts => ts > oneSecondAgo).length;
    if (requestsLastSecond >= rateLimits.requestsPerSecond) {
      return false;
    }

    // Check requests per minute
    const oneMinuteAgo = now - 60 * 1000;
    const requestsLastMinute = state.requestTimestamps.filter(ts => ts > oneMinuteAgo).length;
    if (requestsLastMinute >= rateLimits.requestsPerMinute) {
      return false;
    }

    // Check requests per day
    const requestsLastDay = state.requestTimestamps.length;
    if (requestsLastDay >= rateLimits.requestsPerDay) {
      return false;
    }

    return true;
  },

  /**
   * Record a request for rate limiting
   * 
   * Records that a request was made to track against rate limits.
   * 
   * @param sourceId - The data source ID
   * 
   * Requirements: 9.3
   */
  recordRequest(sourceId: string): void {
    const state = rateLimiters.get(sourceId) || {
      requestTimestamps: [],
      lastRequestTime: 0
    };

    const now = Date.now();
    state.requestTimestamps.push(now);
    state.lastRequestTime = now;

    rateLimiters.set(sourceId, state);
  },

  /**
   * Calculate delay needed before next request
   * 
   * Returns the number of milliseconds to wait before the next request
   * can be made without exceeding rate limits.
   * 
   * @param sourceId - The data source ID
   * @param rateLimits - The rate limit configuration
   * @returns Delay in milliseconds (0 if no delay needed)
   * 
   * Requirements: 9.3
   */
  calculateRequestDelay(sourceId: string, rateLimits: RateLimitConfig): number {
    const state = rateLimiters.get(sourceId);
    if (!state || state.requestTimestamps.length === 0) {
      return 0;
    }

    const now = Date.now();
    
    // Check if we need to wait for per-second limit
    const oneSecondAgo = now - 1000;
    const requestsLastSecond = state.requestTimestamps.filter(ts => ts > oneSecondAgo);
    if (requestsLastSecond.length >= rateLimits.requestsPerSecond) {
      const oldestInSecond = Math.min(...requestsLastSecond);
      return Math.max(0, oldestInSecond + 1000 - now);
    }

    // Check if we need to wait for per-minute limit
    const oneMinuteAgo = now - 60 * 1000;
    const requestsLastMinute = state.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    if (requestsLastMinute.length >= rateLimits.requestsPerMinute) {
      const oldestInMinute = Math.min(...requestsLastMinute);
      return Math.max(0, oldestInMinute + 60 * 1000 - now);
    }

    return 0;
  },

  /**
   * Get rate limiter state for a source
   * 
   * @param sourceId - The data source ID
   * @returns The rate limiter state or undefined if not tracked
   */
  getRateLimiterState(sourceId: string): RateLimiterState | undefined {
    return rateLimiters.get(sourceId);
  },

  /**
   * Get request counts for rate limiting
   * 
   * @param sourceId - The data source ID
   * @returns Object with request counts per time period
   * 
   * Requirements: 9.3
   */
  getRequestCounts(sourceId: string): {
    perSecond: number;
    perMinute: number;
    perDay: number;
  } {
    const state = rateLimiters.get(sourceId);
    if (!state) {
      return { perSecond: 0, perMinute: 0, perDay: 0 };
    }

    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    return {
      perSecond: state.requestTimestamps.filter(ts => ts > oneSecondAgo).length,
      perMinute: state.requestTimestamps.filter(ts => ts > oneMinuteAgo).length,
      perDay: state.requestTimestamps.filter(ts => ts > oneDayAgo).length
    };
  },

  /**
   * Clear all backfill requests (for testing)
   */
  clearAllBackfills(): void {
    backfillRequests.clear();
    processingStartTimes.clear();
  },

  /**
   * Clear rate limiter state (for testing)
   */
  clearRateLimiters(): void {
    rateLimiters.clear();
  },

  /**
   * Set rate limiter state (for testing)
   */
  setRateLimiterState(sourceId: string, timestamps: number[]): void {
    // Use reduce instead of spread to avoid stack overflow with large arrays
    const lastRequestTime = timestamps.length > 0 
      ? timestamps.reduce((max, ts) => ts > max ? ts : max, timestamps[0])
      : 0;
    rateLimiters.set(sourceId, {
      requestTimestamps: timestamps,
      lastRequestTime
    });
  }
};
