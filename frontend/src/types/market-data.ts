/**
 * Market Data types for the frontend
 */

/**
 * Price point data
 */
export interface PricePoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Volume point data
 */
export interface VolumePoint {
  timestamp: string;
  volume: number;
}

/**
 * Market data snapshot
 */
export interface MarketDataSnapshot {
  symbol: string;
  prices: PricePoint[];
  volume: VolumePoint[];
  timestamp: string;
}

/**
 * Data source types
 */
export type DataSourceType = 'PRICE' | 'NEWS' | 'SENTIMENT' | 'ON_CHAIN';

/**
 * Data source status
 */
export type DataSourceStatus = 'ACTIVE' | 'INACTIVE' | 'RATE_LIMITED' | 'ERROR';

/**
 * Authentication method
 */
export type AuthMethod = 'API_KEY' | 'OAUTH' | 'HMAC';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerDay: number;
}

/**
 * Data source configuration
 */
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

/**
 * Anomaly types
 */
export type AnomalyType =
  | 'PRICE_SPIKE'
  | 'DATA_GAP'
  | 'STALE_DATA'
  | 'OUTLIER'
  | 'INCONSISTENCY';

/**
 * Anomaly severity levels
 */
export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Quality score components
 */
export interface QualityComponents {
  completeness: number;
  freshness: number;
  consistency: number;
  accuracy: number;
}

/**
 * Data anomaly record
 */
export interface DataAnomaly {
  anomalyId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  detectedAt: string;
  dataPoint?: unknown;
}

/**
 * Data quality score
 */
export interface DataQualityScore {
  scoreId: string;
  sourceId: string;
  symbol: string;
  dataType: DataSourceType;
  timestamp: string;
  overallScore: number;
  components: QualityComponents;
  anomalies: DataAnomaly[];
}

/**
 * Data feed entry for display
 */
export interface DataFeedEntry {
  id: string;
  symbol: string;
  source: string;
  type: DataSourceType;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  timestamp: string;
}

/**
 * Status badge variant mapping
 */
export const dataSourceStatusVariant: Record<DataSourceStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  ACTIVE: 'success',
  INACTIVE: 'default',
  RATE_LIMITED: 'warning',
  ERROR: 'error',
};

/**
 * Anomaly severity variant mapping
 */
export const anomalySeverityVariant: Record<AnomalySeverity, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'error',
};
