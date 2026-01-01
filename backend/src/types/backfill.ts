/**
 * Backfill Types for Market Data Ingestion
 * Requirements: 9.1
 */

import { DataSourceType } from './data-source';

export type BackfillStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface DataGap {
  startTime: string;
  endTime: string;
  reason: string;
}

export interface BackfillProgress {
  totalRecords: number;
  processedRecords: number;
  percentComplete: number;
  estimatedCompletionTime?: string;
  gaps: DataGap[];
}

export interface BackfillRequest {
  requestId: string;
  tenantId: string;
  sourceId: string;
  symbol: string;
  dataType: DataSourceType;
  startTime: string;
  endTime: string;
  status: BackfillStatus;
  progress: BackfillProgress;
  createdAt: string;
  completedAt?: string;
}

export interface BackfillRequestInput {
  sourceId: string;
  symbol: string;
  dataType: DataSourceType;
  startTime: string;
  endTime: string;
}

export interface BackfillService {
  requestBackfill(
    tenantId: string,
    request: BackfillRequestInput
  ): Promise<BackfillRequest>;

  getBackfillStatus(tenantId: string, requestId: string): Promise<BackfillRequest>;

  cancelBackfill(tenantId: string, requestId: string): Promise<void>;

  listBackfills(tenantId: string): Promise<BackfillRequest[]>;
}
