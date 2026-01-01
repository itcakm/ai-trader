/**
 * Data Lineage Types
 * Requirements: 4.1, 4.2, 4.4
 */

/**
 * Data lineage node types
 * Requirements: 4.1
 */
export type LineageNodeType =
  | 'SOURCE'
  | 'TRANSFORMATION'
  | 'AGGREGATION'
  | 'DECISION_INPUT';

/**
 * A node in the data lineage graph
 * Requirements: 4.1, 4.2, 4.4
 */
export interface LineageNode {
  nodeId: string;
  tenantId: string;
  nodeType: LineageNodeType;
  dataType: string;
  timestamp: string;
  sourceId?: string;
  sourceName?: string;
  ingestionTimestamp?: string;
  transformationType?: string;
  transformationParams?: Record<string, unknown>;
  qualityScore?: number;
  parentNodeIds: string[];
  childNodeIds: string[];
  metadata: Record<string, unknown>;
}

/**
 * Data lineage edge representing data flow
 * Requirements: 4.5
 */
export interface LineageEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: 'DERIVED_FROM' | 'AGGREGATED_INTO' | 'USED_BY';
  timestamp: string;
}

/**
 * Input for recording data ingestion
 * Requirements: 4.1, 4.2
 */
export interface IngestionRecord {
  tenantId: string;
  dataType: string;
  sourceId: string;
  sourceName: string;
  qualityScore?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input for recording data transformation
 * Requirements: 4.4
 */
export interface TransformationRecord {
  tenantId: string;
  dataType: string;
  transformationType: string;
  transformationParams: Record<string, unknown>;
  parentNodeIds: string[];
  qualityScore?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input for recording data usage in a decision
 * Requirements: 4.3
 */
export interface UsageRecord {
  tenantId: string;
  dataType: string;
  parentNodeIds: string[];
  decisionId: string;
  decisionType: string;
  metadata?: Record<string, unknown>;
}

/**
 * Data Lineage Tracker Service Interface
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export interface DataLineageTracker {
  recordIngestion(input: IngestionRecord): Promise<LineageNode>;
  recordTransformation(input: TransformationRecord): Promise<LineageNode>;
  recordUsage(input: UsageRecord): Promise<LineageNode>;
  getForwardLineage(nodeId: string): Promise<LineageNode[]>;
  getBackwardLineage(nodeId: string): Promise<LineageNode[]>;
}
