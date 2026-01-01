/**
 * REST Client for Exchange Integration
 *
 * Provides HTTP request functionality with:
 * - Multiple authentication methods (API_KEY, HMAC, OAuth)
 * - Timeout handling
 * - Error categorization
 * - Retry logic with exponential backoff
 *
 * Requirements: 2.1, 2.2, 2.3, 10.2
 */

import * as crypto from 'crypto';
import { AuthMethod, ExchangeId, EncryptedCredentials } from '../../types/exchange';
import { ErrorCategory, RetryConfig } from '../../types/exchange-error';
import { generateUUID } from '../../utils/uuid';

/**
 * HTTP methods supported by the REST client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Configuration for a REST request
 */
export interface RESTRequestConfig {
  method: HttpMethod;
  endpoint: string;
  path: string;
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Response from a REST request
 */
export interface RESTResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  latencyMs: number;
}

/**
 * Error thrown by REST client operations
 */
export class RESTClientError extends Error {
  constructor(
    message: string,
    public readonly exchangeId: ExchangeId,
    public readonly category: ErrorCategory,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'RESTClientError';
  }
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  retryableCategories: ['RETRYABLE', 'RATE_LIMITED'],
};

/**
 * REST Client for exchange API communication
 *
 * Handles HTTP requests with authentication, timeout, and error handling.
 */
export class RESTClient {
  private readonly exchangeId: ExchangeId;
  private readonly credentials: EncryptedCredentials;
  private readonly authMethod: AuthMethod;
  private readonly defaultTimeout: number;
  private readonly retryConfig: RetryConfig;

  constructor(
    exchangeId: ExchangeId,
    credentials: EncryptedCredentials,
    authMethod: AuthMethod,
    defaultTimeout: number = 30000,
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.exchangeId = exchangeId;
    this.credentials = credentials;
    this.authMethod = authMethod;
    this.defaultTimeout = defaultTimeout;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Execute a REST request with timeout and error handling
   *
   * @param config - Request configuration
   * @returns Response with data, status, headers, and latency
   */
  async request<T>(config: RESTRequestConfig): Promise<RESTResponse<T>> {
    const startTime = Date.now();
    const timeout = config.timeout ?? this.defaultTimeout;

    // Sign the request based on auth method
    const signedConfig = this.signRequest(config, this.credentials);

    // Build the full URL
    const url = this.buildUrl(signedConfig.endpoint, signedConfig.path, signedConfig.params);

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: signedConfig.method,
      headers: signedConfig.headers,
      body: signedConfig.body ? JSON.stringify(signedConfig.body) : undefined,
    };

    try {
      // Execute request with timeout
      const response = await this.fetchWithTimeout(url, fetchOptions, timeout);
      const latencyMs = Date.now() - startTime;

      // Parse response headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      // Handle non-2xx responses
      if (!response.ok) {
        const errorBody = await this.safeParseJson(response);
        throw this.createErrorFromResponse(response.status, errorBody, headers);
      }

      // Parse successful response
      const data = await response.json() as T;

      return {
        data,
        status: response.status,
        headers,
        latencyMs,
      };
    } catch (error) {
      if (error instanceof RESTClientError) {
        throw error;
      }

      // Handle timeout and network errors
      const latencyMs = Date.now() - startTime;
      throw this.categorizeError(error, latencyMs);
    }
  }


  /**
   * Execute a request with retry logic and exponential backoff
   *
   * Formula: delay = initialDelayMs * (multiplier ^ attemptNumber)
   *
   * @param config - Request configuration
   * @param retryConfig - Optional override for retry configuration
   * @returns Response with data, status, headers, and latency
   */
  async requestWithRetry<T>(
    config: RESTRequestConfig,
    retryConfig?: Partial<RetryConfig>
  ): Promise<RESTResponse<T>> {
    const effectiveConfig = { ...this.retryConfig, ...retryConfig };
    let lastError: RESTClientError | undefined;

    for (let attempt = 0; attempt <= effectiveConfig.maxRetries; attempt++) {
      try {
        return await this.request<T>(config);
      } catch (error) {
        if (!(error instanceof RESTClientError)) {
          throw error;
        }

        lastError = error;

        // Check if we should retry
        if (!this.shouldRetry(error, attempt, effectiveConfig)) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateRetryDelay(attempt, effectiveConfig);

        // If rate limited with retry-after, use that instead
        if (error.retryAfterMs && error.retryAfterMs > delay) {
          await this.sleep(error.retryAfterMs);
        } else {
          await this.sleep(delay);
        }
      }
    }

    // Should not reach here, but throw last error if we do
    throw lastError ?? new RESTClientError(
      'Max retries exceeded',
      this.exchangeId,
      'RETRYABLE',
      undefined,
      false
    );
  }

  /**
   * Sign a request based on the configured authentication method
   *
   * Supports:
   * - API_KEY: Adds API key to headers
   * - HMAC: Creates HMAC signature of request
   * - OAUTH: Adds Bearer token to Authorization header
   * - FIX_CREDENTIALS: Not applicable for REST (throws error)
   *
   * @param config - Request configuration to sign
   * @param credentials - Credentials to use for signing
   * @returns Signed request configuration
   */
  signRequest(
    config: RESTRequestConfig,
    credentials: EncryptedCredentials
  ): RESTRequestConfig {
    const signedConfig = { ...config };
    signedConfig.headers = { ...config.headers };

    // Always add content-type for requests with body
    if (config.body) {
      signedConfig.headers['Content-Type'] = 'application/json';
    }

    switch (this.authMethod) {
      case 'API_KEY':
        return this.signWithApiKey(signedConfig, credentials);

      case 'HMAC':
        return this.signWithHmac(signedConfig, credentials);

      case 'OAUTH':
        return this.signWithOAuth(signedConfig, credentials);

      case 'FIX_CREDENTIALS':
        throw new RESTClientError(
          'FIX_CREDENTIALS auth method is not supported for REST requests',
          this.exchangeId,
          'INVALID_REQUEST',
          undefined,
          false
        );

      default:
        throw new RESTClientError(
          `Unknown auth method: ${this.authMethod}`,
          this.exchangeId,
          'INVALID_REQUEST',
          undefined,
          false
        );
    }
  }

  /**
   * Sign request with API key authentication
   * Adds API key to X-API-Key header
   */
  private signWithApiKey(
    config: RESTRequestConfig,
    credentials: EncryptedCredentials
  ): RESTRequestConfig {
    config.headers = config.headers ?? {};
    config.headers['X-API-Key'] = credentials.apiKey;

    // Some exchanges also require the passphrase
    if (credentials.passphrase) {
      config.headers['X-API-Passphrase'] = credentials.passphrase;
    }

    return config;
  }

  /**
   * Sign request with HMAC authentication
   * Creates signature from request data using API secret
   */
  private signWithHmac(
    config: RESTRequestConfig,
    credentials: EncryptedCredentials
  ): RESTRequestConfig {
    const timestamp = Date.now().toString();
    const nonce = generateUUID();

    // Build the message to sign
    const message = this.buildHmacMessage(config, timestamp, nonce);

    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', credentials.apiSecret)
      .update(message)
      .digest('hex');

    config.headers = config.headers ?? {};
    config.headers['X-API-Key'] = credentials.apiKey;
    config.headers['X-API-Timestamp'] = timestamp;
    config.headers['X-API-Nonce'] = nonce;
    config.headers['X-API-Signature'] = signature;

    // Some exchanges also require the passphrase
    if (credentials.passphrase) {
      config.headers['X-API-Passphrase'] = credentials.passphrase;
    }

    return config;
  }

  /**
   * Build the message string for HMAC signing
   */
  private buildHmacMessage(
    config: RESTRequestConfig,
    timestamp: string,
    nonce: string
  ): string {
    const parts = [
      timestamp,
      nonce,
      config.method,
      config.path,
    ];

    // Add query string if present
    if (config.params && Object.keys(config.params).length > 0) {
      const queryString = new URLSearchParams(config.params).toString();
      parts.push(queryString);
    }

    // Add body if present
    if (config.body) {
      parts.push(JSON.stringify(config.body));
    }

    return parts.join('');
  }

  /**
   * Sign request with OAuth authentication
   * Adds Bearer token to Authorization header
   */
  private signWithOAuth(
    config: RESTRequestConfig,
    credentials: EncryptedCredentials
  ): RESTRequestConfig {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${credentials.apiKey}`;

    return config;
  }


  /**
   * Calculate retry delay using exponential backoff
   *
   * Formula: delay = initialDelayMs * (multiplier ^ attemptNumber)
   * Capped at maxDelayMs
   *
   * @param attemptNumber - Current attempt number (0-indexed)
   * @param config - Retry configuration
   * @returns Delay in milliseconds
   */
  calculateRetryDelay(attemptNumber: number, config: RetryConfig = this.retryConfig): number {
    const delay = config.initialDelayMs * Math.pow(config.multiplier, attemptNumber);
    return Math.min(delay, config.maxDelayMs);
  }

  /**
   * Determine if an error should be retried
   *
   * @param error - The error that occurred
   * @param attemptNumber - Current attempt number
   * @param config - Retry configuration
   * @returns True if the request should be retried
   */
  private shouldRetry(
    error: RESTClientError,
    attemptNumber: number,
    config: RetryConfig
  ): boolean {
    // Don't retry if we've exceeded max retries
    if (attemptNumber >= config.maxRetries) {
      return false;
    }

    // Check if the error category is retryable
    return config.retryableCategories.includes(error.category);
  }

  /**
   * Build full URL from endpoint, path, and query parameters
   */
  private buildUrl(
    endpoint: string,
    path: string,
    params?: Record<string, string>
  ): string {
    // Ensure endpoint doesn't end with slash and path starts with slash
    const baseUrl = endpoint.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    let url = `${baseUrl}${normalizedPath}`;

    // Add query parameters
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    }

    return url;
  }

  /**
   * Execute fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Safely parse JSON from response
   */
  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Create an error from HTTP response
   */
  private createErrorFromResponse(
    status: number,
    body: unknown,
    headers: Record<string, string>
  ): RESTClientError {
    const category = this.categorizeStatusCode(status);
    const message = this.extractErrorMessage(body, status);
    const retryAfterMs = this.parseRetryAfter(headers);

    return new RESTClientError(
      message,
      this.exchangeId,
      category,
      status,
      category === 'RETRYABLE' || category === 'RATE_LIMITED',
      retryAfterMs,
      body
    );
  }

  /**
   * Categorize HTTP status code into error category
   */
  private categorizeStatusCode(status: number): ErrorCategory {
    if (status === 429) {
      return 'RATE_LIMITED';
    }

    if (status >= 400 && status < 500) {
      // 401/403 are typically fatal (auth issues)
      if (status === 401 || status === 403) {
        return 'FATAL';
      }
      return 'INVALID_REQUEST';
    }

    if (status >= 500) {
      // 5xx errors are typically retryable
      return 'RETRYABLE';
    }

    return 'EXCHANGE_ERROR';
  }

  /**
   * Extract error message from response body
   */
  private extractErrorMessage(body: unknown, status: number): string {
    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;

      // Try common error message fields
      if (typeof errorBody.message === 'string') {
        return errorBody.message;
      }
      if (typeof errorBody.error === 'string') {
        return errorBody.error;
      }
      if (typeof errorBody.msg === 'string') {
        return errorBody.msg;
      }
      if (errorBody.error && typeof errorBody.error === 'object') {
        const nestedError = errorBody.error as Record<string, unknown>;
        if (typeof nestedError.message === 'string') {
          return nestedError.message;
        }
      }
    }

    return `HTTP ${status} error`;
  }

  /**
   * Parse retry-after header value
   * Returns milliseconds to wait, or undefined if not present
   */
  private parseRetryAfter(headers: Record<string, string>): number | undefined {
    const retryAfter = headers['retry-after'];
    if (!retryAfter) {
      return undefined;
    }

    // Try parsing as seconds (integer)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      const delayMs = date.getTime() - Date.now();
      return delayMs > 0 ? delayMs : undefined;
    }

    return undefined;
  }

  /**
   * Categorize non-HTTP errors (timeout, network, etc.)
   */
  private categorizeError(error: unknown, latencyMs: number): RESTClientError {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Timeout errors
      if (message.includes('abort') || message.includes('timeout')) {
        return new RESTClientError(
          `Request timed out after ${latencyMs}ms`,
          this.exchangeId,
          'RETRYABLE',
          undefined,
          true,
          undefined,
          error
        );
      }

      // Network errors
      if (
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('fetch failed')
      ) {
        return new RESTClientError(
          `Network error: ${error.message}`,
          this.exchangeId,
          'RETRYABLE',
          undefined,
          true,
          undefined,
          error
        );
      }
    }

    // Unknown error
    return new RESTClientError(
      error instanceof Error ? error.message : 'Unknown error',
      this.exchangeId,
      'EXCHANGE_ERROR',
      undefined,
      false,
      undefined,
      error
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the exchange ID
   */
  getExchangeId(): ExchangeId {
    return this.exchangeId;
  }

  /**
   * Get the authentication method
   */
  getAuthMethod(): AuthMethod {
    return this.authMethod;
  }

  /**
   * Get the retry configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }
}
