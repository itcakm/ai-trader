import { S3 } from 'aws-sdk';
import { LineageNode, LineageEdge } from '../types/data-lineage';
import { generateUUID } from '../utils/uuid';

/**
 * S3 client configuration
 */
const s3Config: S3.ClientConfiguration = {
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.S3_ENDPOINT && {
    endpoint: process.env.S3_ENDPOINT,
    s3ForcePathStyle: true
  })
};

const s3Client = new S3(s3Config);

/**
 * S3 bucket for audit data
 */
const AUDIT_BUCKET = process.env.AUDIT_BUCKET || 'audit-data';

/**
 * Data Lineage Repository - manages lineage node and edge persistence with S3 storage
 * 
 * Uses S3 with tenant-partitioned paths for graph storage.
 * Nodes and edges are stored separately to enable efficient traversal.
 * 
 * Storage path format:
 * - Nodes: audit/{tenantId}/lineage-nodes/{year}/{month}/{day}/{nodeId}.json
 * - Edges: audit/{tenantId}/lineage-edges/{year}/{month}/{day}/{edgeId}.json
 * 
 * Requirements: 4.1, 4.5
 */
export const DataLineageRepository = {
  /**
   * Generate S3 key for a lineage node
   * Uses tenant-partitioned paths for isolation
   */
  generateNodeKey(tenantId: string, timestamp: string, nodeId: string): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    return `audit/${tenantId}/lineage-nodes/${year}/${month}/${day}/${nodeId}.json`;
  },

  /**
   * Generate S3 key for a lineage edge
   */
  generateEdgeKey(tenantId: string, timestamp: string, edgeId: string): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    return `audit/${tenantId}/lineage-edges/${year}/${month}/${day}/${edgeId}.json`;
  },

  /**
   * Generate prefix for listing nodes by tenant
   */
  generateNodePrefix(tenantId: string, year?: number, month?: number, day?: number): string {
    let prefix = `audit/${tenantId}/lineage-nodes/`;
    if (year !== undefined) {
      prefix += `${year}/`;
      if (month !== undefined) {
        prefix += `${String(month).padStart(2, '0')}/`;
        if (day !== undefined) {
          prefix += `${String(day).padStart(2, '0')}/`;
        }
      }
    }
    return prefix;
  },

  /**
   * Generate prefix for listing edges by tenant
   */
  generateEdgePrefix(tenantId: string, year?: number, month?: number, day?: number): string {
    let prefix = `audit/${tenantId}/lineage-edges/`;
    if (year !== undefined) {
      prefix += `${year}/`;
      if (month !== undefined) {
        prefix += `${String(month).padStart(2, '0')}/`;
        if (day !== undefined) {
          prefix += `${String(day).padStart(2, '0')}/`;
        }
      }
    }
    return prefix;
  },


  /**
   * Store a lineage node in S3
   * 
   * Requirements: 4.1
   */
  async putNode(node: LineageNode): Promise<LineageNode> {
    const key = this.generateNodeKey(node.tenantId, node.timestamp, node.nodeId);
    
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify(node),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': node.tenantId,
        'x-amz-meta-node-id': node.nodeId,
        'x-amz-meta-node-type': node.nodeType,
        'x-amz-meta-data-type': node.dataType
      }
    }).promise();

    return node;
  },

  /**
   * Store a lineage edge in S3
   * 
   * Requirements: 4.5
   */
  async putEdge(tenantId: string, edge: LineageEdge): Promise<LineageEdge> {
    const key = this.generateEdgeKey(tenantId, edge.timestamp, edge.edgeId);
    
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: key,
      Body: JSON.stringify({ ...edge, tenantId }),
      ContentType: 'application/json',
      Metadata: {
        'x-amz-meta-immutable': 'true',
        'x-amz-meta-tenant-id': tenantId,
        'x-amz-meta-edge-id': edge.edgeId,
        'x-amz-meta-source-node': edge.sourceNodeId,
        'x-amz-meta-target-node': edge.targetNodeId,
        'x-amz-meta-relationship': edge.relationship
      }
    }).promise();

    return edge;
  },

  /**
   * Get a lineage node by ID
   */
  async getNode(tenantId: string, timestamp: string, nodeId: string): Promise<LineageNode | null> {
    const key = this.generateNodeKey(tenantId, timestamp, nodeId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const node = JSON.parse(result.Body.toString()) as LineageNode;
      
      // Defense in depth: verify tenant ownership
      if (node.tenantId !== tenantId) {
        throw new Error(`Tenant access denied: ${tenantId}`);
      }

      return node;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Find a node by ID across all dates (for when timestamp is unknown)
   */
  async findNodeById(tenantId: string, nodeId: string): Promise<LineageNode | null> {
    const prefix = this.generateNodePrefix(tenantId);
    
    let continuationToken: string | undefined;
    
    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: AUDIT_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key) continue;
          
          // Check if this key contains the nodeId
          if (obj.Key.includes(`/${nodeId}.json`)) {
            try {
              const getResult = await s3Client.getObject({
                Bucket: AUDIT_BUCKET,
                Key: obj.Key
              }).promise();

              if (getResult.Body) {
                const node = JSON.parse(getResult.Body.toString()) as LineageNode;
                if (node.nodeId === nodeId && node.tenantId === tenantId) {
                  return node;
                }
              }
            } catch {
              continue;
            }
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    return null;
  },


  /**
   * List all nodes for a tenant
   */
  async listNodes(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number
  ): Promise<LineageNode[]> {
    const nodes: LineageNode[] = [];
    const prefix = this.generateNodePrefix(tenantId);
    
    let continuationToken: string | undefined;
    
    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: AUDIT_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key) continue;
          if (limit && nodes.length >= limit) break;
          
          // Filter by date range from key path
          if (startDate || endDate) {
            const keyParts = obj.Key.split('/');
            if (keyParts.length >= 6) {
              const nodeDate = new Date(`${keyParts[3]}-${keyParts[4]}-${keyParts[5]}`);
              if (startDate && nodeDate < startDate) continue;
              if (endDate && nodeDate > endDate) continue;
            }
          }

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const node = JSON.parse(getResult.Body.toString()) as LineageNode;
              if (node.tenantId === tenantId) {
                nodes.push(node);
              }
            }
          } catch {
            continue;
          }
        }
      }

      if (limit && nodes.length >= limit) break;
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    return nodes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },

  /**
   * List all edges for a tenant
   */
  async listEdges(
    tenantId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<(LineageEdge & { tenantId: string })[]> {
    const edges: (LineageEdge & { tenantId: string })[] = [];
    const prefix = this.generateEdgePrefix(tenantId);
    
    let continuationToken: string | undefined;
    
    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: AUDIT_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key) continue;
          
          // Filter by date range from key path
          if (startDate || endDate) {
            const keyParts = obj.Key.split('/');
            if (keyParts.length >= 6) {
              const edgeDate = new Date(`${keyParts[3]}-${keyParts[4]}-${keyParts[5]}`);
              if (startDate && edgeDate < startDate) continue;
              if (endDate && edgeDate > endDate) continue;
            }
          }

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const edge = JSON.parse(getResult.Body.toString()) as LineageEdge & { tenantId: string };
              if (edge.tenantId === tenantId) {
                edges.push(edge);
              }
            }
          } catch {
            continue;
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    return edges.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },


  /**
   * Find edges where the given node is the source (for forward lineage)
   * 
   * Requirements: 4.5
   */
  async findEdgesBySourceNode(tenantId: string, sourceNodeId: string): Promise<LineageEdge[]> {
    const allEdges = await this.listEdges(tenantId);
    return allEdges.filter(edge => edge.sourceNodeId === sourceNodeId);
  },

  /**
   * Find edges where the given node is the target (for backward lineage)
   * 
   * Requirements: 4.5
   */
  async findEdgesByTargetNode(tenantId: string, targetNodeId: string): Promise<LineageEdge[]> {
    const allEdges = await this.listEdges(tenantId);
    return allEdges.filter(edge => edge.targetNodeId === targetNodeId);
  },

  /**
   * Update a node's child node IDs (when a new child is added)
   */
  async updateNodeChildren(tenantId: string, nodeId: string, childNodeId: string): Promise<void> {
    const node = await this.findNodeById(tenantId, nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (!node.childNodeIds.includes(childNodeId)) {
      node.childNodeIds.push(childNodeId);
      await this.putNode(node);
    }
  },

  /**
   * Check if a node exists
   */
  async nodeExists(tenantId: string, timestamp: string, nodeId: string): Promise<boolean> {
    const key = this.generateNodeKey(tenantId, timestamp, nodeId);
    
    try {
      await s3Client.headObject({
        Bucket: AUDIT_BUCKET,
        Key: key
      }).promise();
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NotFound') {
        return false;
      }
      throw error;
    }
  },

  /**
   * Get the S3 bucket name (for testing)
   */
  getBucketName(): string {
    return AUDIT_BUCKET;
  },

  /**
   * Get the S3 client (for testing)
   */
  getS3Client(): S3 {
    return s3Client;
  }
};
