/**
 * Data Stream Types for Market Data Ingestion
 * Requirements: 8.1
 */

import { DataSourceType } from './data-source';

export type StreamStatus = 'STARTING' | 'ACTIVE' | 'PAUSED' | 'ERROR' | 'STOPPED';

export interface StreamMetrics {
  messagesReceived: number;
  messagesPerSecond: number;
  averageLatencyMs: number;
  errorCount: number;
  lastError?: string;
  uptime: number;
}

export interface DataStream {
  streamId: string;
  tenantId: string;
  sourceId: string;
  symbols: string[];
  type: DataSourceType;
  status: StreamStatus;
  metrics: StreamMetrics;
  createdAt: string;
  lastActivity: string;
}

export interface StreamService {
  startStream(
    tenantId: string,
    sourceId: string,
    symbols: string[]
  ): Promise<DataStream>;

  stopStream(tenantId: string, streamId: string): Promise<void>;

  pauseStream(tenantId: string, streamId: string): Promise<void>;

  resumeStream(tenantId: string, streamId: string): Promise<void>;

  getStreamStatus(tenantId: string, streamId: string): Promise<DataStream>;

  listStreams(tenantId: string): Promise<DataStream[]>;
}
