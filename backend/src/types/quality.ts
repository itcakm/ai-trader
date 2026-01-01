/**
 * Data Quality Types for Market Data Ingestion
 * Requirements: 10.1, 10.3
 */

import { DataSourceType } from './data-source';

export type AnomalyType =
  | 'PRICE_SPIKE'
  | 'DATA_GAP'
  | 'STALE_DATA'
  | 'OUTLIER'
  | 'INCONSISTENCY';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface QualityComponents {
  completeness: number;
  freshness: number;
  consistency: number;
  accuracy: number;
}

export interface DataAnomaly {
  anomalyId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  detectedAt: string;
  dataPoint?: unknown;
}

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

export interface QualityService {
  calculateQualityScore(
    sourceId: string,
    symbol: string,
    dataType: DataSourceType
  ): Promise<DataQualityScore>;

  detectAnomalies(data: unknown[]): Promise<DataAnomaly[]>;

  getQualityHistory(sourceId: string, period: string): Promise<DataQualityScore[]>;

  setQualityThreshold(dataType: DataSourceType, threshold: number): Promise<void>;
}
