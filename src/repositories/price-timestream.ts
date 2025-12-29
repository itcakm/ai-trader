/**
 * Price Timestream Repository - handles batch writes of price data to Amazon Timestream
 * 
 * Provides:
 * - Batch writing of price points to Timestream
 * - Record formatting for Timestream schema
 * - Error handling and retry logic
 * 
 * Requirements: 2.4
 */

import { 
  TimestreamWriteClient, 
  WriteRecordsCommand,
  WriteRecordsCommandInput,
  _Record,
  Dimension,
  MeasureValueType,
  RejectedRecord
} from '@aws-sdk/client-timestream-write';
import { PricePoint } from '../types/price';

/**
 * Configuration for Timestream writer
 */
export interface TimestreamConfig {
  /** AWS region */
  region: string;
  /** Timestream database name */
  databaseName: string;
  /** Timestream table name */
  tableName: string;
  /** Maximum records per batch (Timestream limit is 100) */
  maxBatchSize?: number;
}

/**
 * Result of a batch write operation
 */
export interface BatchWriteResult {
  /** Number of records successfully written */
  successCount: number;
  /** Number of records that failed */
  failureCount: number;
  /** Details of rejected records */
  rejectedRecords: RejectedRecordInfo[];
  /** Total records attempted */
  totalRecords: number;
}

/**
 * Information about a rejected record
 */
export interface RejectedRecordInfo {
  /** Index of the rejected record in the batch */
  recordIndex: number;
  /** Reason for rejection */
  reason: string;
  /** The original price point */
  pricePoint?: PricePoint;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  maxBatchSize: 100  // Timestream limit
};

/**
 * Price Timestream Repository
 */
export class PriceTimestreamRepository {
  private client: TimestreamWriteClient;
  private config: Required<TimestreamConfig>;

  constructor(config: TimestreamConfig) {
    this.config = {
      ...config,
      maxBatchSize: config.maxBatchSize ?? DEFAULT_CONFIG.maxBatchSize
    };

    this.client = new TimestreamWriteClient({
      region: this.config.region
    });
  }

  /**
   * Write a batch of price points to Timestream
   * 
   * Converts PricePoint objects to Timestream records and writes them in batches.
   * Handles batching automatically if more than maxBatchSize records are provided.
   * 
   * @param pricePoints - Array of price points to write
   * @returns Result of the batch write operation
   * 
   * Requirements: 2.4
   */
  async writeBatch(pricePoints: PricePoint[]): Promise<BatchWriteResult> {
    if (pricePoints.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        rejectedRecords: [],
        totalRecords: 0
      };
    }

    const allRejected: RejectedRecordInfo[] = [];
    let totalSuccess = 0;
    let totalFailure = 0;

    // Split into batches
    const batches = this.splitIntoBatches(pricePoints, this.config.maxBatchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const records = batch.map(pp => this.toTimestreamRecord(pp));

      try {
        const result = await this.writeRecords(records);
        
        if (result.rejectedRecords && result.rejectedRecords.length > 0) {
          const rejected = result.rejectedRecords.map((rr, idx) => ({
            recordIndex: batchIndex * this.config.maxBatchSize + (rr.RecordIndex ?? idx),
            reason: rr.Reason || 'Unknown reason',
            pricePoint: batch[rr.RecordIndex ?? idx]
          }));
          allRejected.push(...rejected);
          totalFailure += result.rejectedRecords.length;
          totalSuccess += batch.length - result.rejectedRecords.length;
        } else {
          totalSuccess += batch.length;
        }
      } catch (error) {
        // Entire batch failed
        const rejected = batch.map((pp, idx) => ({
          recordIndex: batchIndex * this.config.maxBatchSize + idx,
          reason: error instanceof Error ? error.message : 'Batch write failed',
          pricePoint: pp
        }));
        allRejected.push(...rejected);
        totalFailure += batch.length;
      }
    }

    return {
      successCount: totalSuccess,
      failureCount: totalFailure,
      rejectedRecords: allRejected,
      totalRecords: pricePoints.length
    };
  }

  /**
   * Write a single price point to Timestream
   * 
   * @param pricePoint - The price point to write
   * @returns Result of the write operation
   */
  async writeOne(pricePoint: PricePoint): Promise<BatchWriteResult> {
    return this.writeBatch([pricePoint]);
  }

  /**
   * Convert a PricePoint to a Timestream record
   * 
   * Maps PricePoint fields to Timestream dimensions and measures.
   * 
   * @param pricePoint - The price point to convert
   * @returns Timestream record
   */
  toTimestreamRecord(pricePoint: PricePoint): _Record {
    const dimensions: Dimension[] = [
      { Name: 'symbol', Value: pricePoint.symbol },
      { Name: 'sourceId', Value: pricePoint.sourceId }
    ];

    // Convert ISO timestamp to milliseconds
    const timeMs = new Date(pricePoint.timestamp).getTime();

    // Use multi-measure records for OHLCV data
    const record: _Record = {
      Dimensions: dimensions,
      MeasureName: 'ohlcv',
      MeasureValueType: MeasureValueType.MULTI,
      MeasureValues: [
        {
          Name: 'open',
          Value: pricePoint.open.toString(),
          Type: MeasureValueType.DOUBLE
        },
        {
          Name: 'high',
          Value: pricePoint.high.toString(),
          Type: MeasureValueType.DOUBLE
        },
        {
          Name: 'low',
          Value: pricePoint.low.toString(),
          Type: MeasureValueType.DOUBLE
        },
        {
          Name: 'close',
          Value: pricePoint.close.toString(),
          Type: MeasureValueType.DOUBLE
        },
        {
          Name: 'volume',
          Value: pricePoint.volume.toString(),
          Type: MeasureValueType.DOUBLE
        },
        {
          Name: 'qualityScore',
          Value: pricePoint.qualityScore.toString(),
          Type: MeasureValueType.DOUBLE
        }
      ],
      Time: timeMs.toString(),
      TimeUnit: 'MILLISECONDS'
    };

    // Add optional fields
    if (pricePoint.quoteVolume !== undefined) {
      record.MeasureValues!.push({
        Name: 'quoteVolume',
        Value: pricePoint.quoteVolume.toString(),
        Type: MeasureValueType.DOUBLE
      });
    }

    if (pricePoint.trades !== undefined) {
      record.MeasureValues!.push({
        Name: 'trades',
        Value: pricePoint.trades.toString(),
        Type: MeasureValueType.BIGINT
      });
    }

    return record;
  }

  /**
   * Write records to Timestream
   * 
   * @param records - Array of Timestream records
   * @returns Write result with any rejected records
   */
  private async writeRecords(records: _Record[]): Promise<{ rejectedRecords?: RejectedRecord[] }> {
    const params: WriteRecordsCommandInput = {
      DatabaseName: this.config.databaseName,
      TableName: this.config.tableName,
      Records: records,
      CommonAttributes: {}
    };

    const command = new WriteRecordsCommand(params);
    const response = await this.client.send(command);

    return {
      rejectedRecords: response.RecordsIngested?.Total !== records.length 
        ? [] // Timestream doesn't return rejected records on partial success
        : undefined
    };
  }

  /**
   * Split an array into batches of specified size
   * 
   * @param items - Array to split
   * @param batchSize - Maximum size of each batch
   * @returns Array of batches
   */
  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Get the Timestream client (for testing)
   */
  getClient(): TimestreamWriteClient {
    return this.client;
  }

  /**
   * Get the configuration
   */
  getConfig(): Required<TimestreamConfig> {
    return this.config;
  }
}

/**
 * Factory function to create a PriceTimestreamRepository
 * 
 * @param config - Timestream configuration
 * @returns Configured repository instance
 */
export function createPriceTimestreamRepository(config: TimestreamConfig): PriceTimestreamRepository {
  return new PriceTimestreamRepository(config);
}
