/**
 * Base AI Adapter - provides common functionality for all AI provider adapters
 * 
 * This abstract class implements common functionality shared by all AI adapters:
 * - Request/response logging
 * - Error handling with retry logic
 * - Rate limit tracking
 * - Response validation
 * 
 * Requirements: 1.3
 */

import { ProviderType } from '../../types/provider';
import {
  AIProviderAdapter,
  HealthCheckResult,
  QuotaStatus,
} from '../../types/adapter';
import {
  RegimeClassificationRequest,
  RegimeClassificationResponse,
  ExplanationRequest,
  ExplanationResponse,
  ParameterSuggestionRequest,
  ParameterSuggestionResponse,
} from '../../types/analysis';

/**
 * Configuration for an AI adapter
 */
export interface AIAdapterConfig {
  apiKey: string;
  apiEndpoint: string;
  modelId: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Request log entry for audit purposes
 */
export interface RequestLogEntry {
  timestamp: string;
  requestType: string;
  modelId: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Error thrown when an AI provider request fails
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly providerType: ProviderType,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Abstract base class for AI provider adapters
 */
export abstract class BaseAIAdapter implements AIProviderAdapter {
  abstract readonly providerType: ProviderType;

  protected config: AIAdapterConfig;
  protected requestLogs: RequestLogEntry[] = [];
  protected readonly maxLogEntries = 1000;

  constructor(config: AIAdapterConfig) {
    this.config = {
      timeoutMs: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  /**
   * Execute a request with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    requestType: string
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const result = await operation();
        this.logRequest(requestType, Date.now() - startTime, true);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === this.config.maxRetries) {
          this.logRequest(requestType, Date.now() - startTime, false, lastError.message);
          throw error;
        }

        // Exponential backoff
        const delay = this.config.retryDelayMs! * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Determine if an error is retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof AIProviderError) {
      return error.retryable;
    }
    
    // Retry on network errors or 5xx status codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504')
      );
    }
    
    return false;
  }

  /**
   * Log a request for audit purposes
   */
  protected logRequest(
    requestType: string,
    durationMs: number,
    success: boolean,
    errorMessage?: string,
    tokenUsage?: RequestLogEntry['tokenUsage']
  ): void {
    const entry: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      requestType,
      modelId: this.config.modelId,
      durationMs,
      success,
      errorMessage,
      tokenUsage,
    };

    this.requestLogs.push(entry);

    // Keep log size bounded
    if (this.requestLogs.length > this.maxLogEntries) {
      this.requestLogs = this.requestLogs.slice(-this.maxLogEntries);
    }
  }

  /**
   * Get recent request logs
   */
  getRequestLogs(limit?: number): RequestLogEntry[] {
    const logs = [...this.requestLogs];
    return limit ? logs.slice(-limit) : logs;
  }

  /**
   * Sleep for a specified duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a timeout promise
   */
  protected createTimeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new AIProviderError(message, this.providerType, undefined, true)), ms);
    });
  }

  /**
   * Execute with timeout
   */
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    const timeout = timeoutMs ?? this.config.timeoutMs!;
    return Promise.race([
      promise,
      this.createTimeout<T>(timeout, `Request timed out after ${timeout}ms`),
    ]);
  }

  /**
   * Build common headers for API requests
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  // Abstract methods to be implemented by specific adapters
  abstract classifyMarketRegime(request: RegimeClassificationRequest): Promise<RegimeClassificationResponse>;
  abstract generateExplanation(request: ExplanationRequest): Promise<ExplanationResponse>;
  abstract suggestParameters(request: ParameterSuggestionRequest): Promise<ParameterSuggestionResponse>;
  abstract healthCheck(): Promise<HealthCheckResult>;
  abstract getRemainingQuota(): Promise<QuotaStatus>;
}
