/**
 * Data Source Types for Market Data Ingestion
 * Requirements: 1.1, 1.3
 */

export type DataSourceType = 'PRICE' | 'NEWS' | 'SENTIMENT' | 'ON_CHAIN';

export type DataSourceStatus = 'ACTIVE' | 'INACTIVE' | 'RATE_LIMITED' | 'ERROR';

export type AuthMethod = 'API_KEY' | 'OAUTH' | 'HMAC';

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerDay: number;
}

export interface DataSource {
  sourceId: string;
  type: DataSourceType;
  name: string;
  apiEndpoint: string;
  authMethod: AuthMethod;
  supportedSymbols: string[];
  rateLimits: RateLimitConfig;
  status: DataSourceStatus;
  priority: number;
  costPerRequest?: number;
  createdAt: string;
  updatedAt: string;
}
