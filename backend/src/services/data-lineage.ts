import { 
  LineageNode, 
  LineageEdge, 
  LineageNodeType,
  IngestionRecord, 
  TransformationRecord, 
  UsageRecord 
} from '../types/data-lineage';
import { DataLineageRepository } from '../repositories/data-lineage';
import { generateUUID } from '../utils/uuid';

/**
 * Data Lineage Service - tracks data from source through transformations to final use
 * 
 * Provides methods to record data ingestion, transformations, and usage in decisions.
 * Supports forward and backward lineage traversal for audit purposes.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export const DataLineageService = {
  /**
   * Record data ingestion from a source
   * Creates a SOURCE node in the lineage graph
   * 
   * Requirements: 4.1, 4.2
   */
  async recordIngestion(input: IngestionRecord): Promise<LineageNode> {
    const nodeId = generateUUID();
    const timestamp = new Date().toISOString();

    const node: LineageNode = {
      nodeId,
      tenantId: input.tenantId,
      nodeType: 'SOURCE',
      dataType: input.dataType,
      timestamp,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      ingestionTimestamp: timestamp,
      qualityScore: input.qualityScore,
      parentNodeIds: [], // SOURCE nodes have no parents
      childNodeIds: [],
      metadata: input.metadata || {}
    };

    return DataLineageRepository.putNode(node);
  },

  /**
   * Record data transformation
   * Creates a TRANSFORMATION or AGGREGATION node linked to parent nodes
   * 
   * Requirements: 4.4
   */
  async recordTransformation(input: TransformationRecord): Promise<LineageNode> {
    const nodeId = generateUUID();
    const timestamp = new Date().toISOString();

    // Determine node type based on transformation type
    const nodeType: LineageNodeType = input.transformationType.toLowerCase().includes('aggregat') 
      ? 'AGGREGATION' 
      : 'TRANSFORMATION';

    const node: LineageNode = {
      nodeId,
      tenantId: input.tenantId,
      nodeType,
      dataType: input.dataType,
      timestamp,
      transformationType: input.transformationType,
      transformationParams: input.transformationParams,
      qualityScore: input.qualityScore,
      parentNodeIds: input.parentNodeIds,
      childNodeIds: [],
      metadata: input.metadata || {}
    };

    // Store the node
    const storedNode = await DataLineageRepository.putNode(node);

    // Create edges from parent nodes to this node
    for (const parentNodeId of input.parentNodeIds) {
      const edge: LineageEdge = {
        edgeId: generateUUID(),
        sourceNodeId: parentNodeId,
        targetNodeId: nodeId,
        relationship: nodeType === 'AGGREGATION' ? 'AGGREGATED_INTO' : 'DERIVED_FROM',
        timestamp
      };
      await DataLineageRepository.putEdge(input.tenantId, edge);

      // Update parent node's childNodeIds
      try {
        await DataLineageRepository.updateNodeChildren(input.tenantId, parentNodeId, nodeId);
      } catch {
        // Parent node may not exist yet in some cases, continue
      }
    }

    return storedNode;
  },


  /**
   * Record data usage in a decision
   * Creates a DECISION_INPUT node linked to the data nodes used
   * 
   * Requirements: 4.3
   */
  async recordUsage(input: UsageRecord): Promise<LineageNode> {
    const nodeId = generateUUID();
    const timestamp = new Date().toISOString();

    const node: LineageNode = {
      nodeId,
      tenantId: input.tenantId,
      nodeType: 'DECISION_INPUT',
      dataType: input.dataType,
      timestamp,
      parentNodeIds: input.parentNodeIds,
      childNodeIds: [],
      metadata: {
        ...input.metadata,
        decisionId: input.decisionId,
        decisionType: input.decisionType
      }
    };

    // Store the node
    const storedNode = await DataLineageRepository.putNode(node);

    // Create edges from parent nodes to this node
    for (const parentNodeId of input.parentNodeIds) {
      const edge: LineageEdge = {
        edgeId: generateUUID(),
        sourceNodeId: parentNodeId,
        targetNodeId: nodeId,
        relationship: 'USED_BY',
        timestamp
      };
      await DataLineageRepository.putEdge(input.tenantId, edge);

      // Update parent node's childNodeIds
      try {
        await DataLineageRepository.updateNodeChildren(input.tenantId, parentNodeId, nodeId);
      } catch {
        // Parent node may not exist yet in some cases, continue
      }
    }

    return storedNode;
  },

  /**
   * Get forward lineage (what used this data)
   * Traverses the graph from the given node to all downstream nodes
   * 
   * Requirements: 4.5
   */
  async getForwardLineage(tenantId: string, nodeId: string): Promise<LineageNode[]> {
    const visited = new Set<string>();
    const result: LineageNode[] = [];

    const traverse = async (currentNodeId: string): Promise<void> => {
      if (visited.has(currentNodeId)) {
        return;
      }
      visited.add(currentNodeId);

      // Find the current node
      const node = await DataLineageRepository.findNodeById(tenantId, currentNodeId);
      if (!node) {
        return;
      }

      // Add to result (except the starting node)
      if (currentNodeId !== nodeId) {
        result.push(node);
      }

      // Find all edges where this node is the source
      const edges = await DataLineageRepository.findEdgesBySourceNode(tenantId, currentNodeId);
      
      // Traverse to all target nodes
      for (const edge of edges) {
        await traverse(edge.targetNodeId);
      }

      // Also traverse using childNodeIds stored in the node
      for (const childId of node.childNodeIds) {
        await traverse(childId);
      }
    };

    await traverse(nodeId);

    // Sort by timestamp
    return result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },

  /**
   * Get backward lineage (where did this data come from)
   * Traverses the graph from the given node to all upstream nodes
   * 
   * Requirements: 4.5
   */
  async getBackwardLineage(tenantId: string, nodeId: string): Promise<LineageNode[]> {
    const visited = new Set<string>();
    const result: LineageNode[] = [];

    const traverse = async (currentNodeId: string): Promise<void> => {
      if (visited.has(currentNodeId)) {
        return;
      }
      visited.add(currentNodeId);

      // Find the current node
      const node = await DataLineageRepository.findNodeById(tenantId, currentNodeId);
      if (!node) {
        return;
      }

      // Add to result (except the starting node)
      if (currentNodeId !== nodeId) {
        result.push(node);
      }

      // Find all edges where this node is the target
      const edges = await DataLineageRepository.findEdgesByTargetNode(tenantId, currentNodeId);
      
      // Traverse to all source nodes
      for (const edge of edges) {
        await traverse(edge.sourceNodeId);
      }

      // Also traverse using parentNodeIds stored in the node
      for (const parentId of node.parentNodeIds) {
        await traverse(parentId);
      }
    };

    await traverse(nodeId);

    // Sort by timestamp (oldest first for backward lineage)
    return result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },


  /**
   * Get a node by ID
   */
  async getNode(tenantId: string, nodeId: string): Promise<LineageNode | null> {
    return DataLineageRepository.findNodeById(tenantId, nodeId);
  },

  /**
   * List all nodes for a tenant within a date range
   */
  async listNodes(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number
  ): Promise<LineageNode[]> {
    return DataLineageRepository.listNodes(tenantId, startDate, endDate, limit);
  }
};

/**
 * Check if a lineage node has all required fields for completeness
 * 
 * Requirements: 4.2, 4.4
 */
export function hasRequiredFields(node: LineageNode): boolean {
  // Basic required fields
  if (!node.nodeId || !node.tenantId || !node.nodeType || !node.dataType || !node.timestamp) {
    return false;
  }

  // SOURCE nodes must have source information
  if (node.nodeType === 'SOURCE') {
    if (!node.sourceId || !node.sourceName || !node.ingestionTimestamp) {
      return false;
    }
  }

  // TRANSFORMATION and AGGREGATION nodes must have transformation info
  if (node.nodeType === 'TRANSFORMATION' || node.nodeType === 'AGGREGATION') {
    if (!node.transformationType || !node.transformationParams) {
      return false;
    }
    // Must have at least one parent
    if (!node.parentNodeIds || node.parentNodeIds.length === 0) {
      return false;
    }
  }

  // DECISION_INPUT nodes must have parent nodes and decision info
  if (node.nodeType === 'DECISION_INPUT') {
    if (!node.parentNodeIds || node.parentNodeIds.length === 0) {
      return false;
    }
    if (!node.metadata?.decisionId || !node.metadata?.decisionType) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a lineage node has quality score information
 * 
 * Requirements: 4.2
 */
export function hasQualityScore(node: LineageNode): boolean {
  return node.qualityScore !== undefined && node.qualityScore >= 0 && node.qualityScore <= 1;
}

/**
 * Verify that forward and backward lineage form a connected graph
 * 
 * Requirements: 4.5
 */
export function verifyLineageConnectivity(
  startNode: LineageNode,
  forwardNodes: LineageNode[],
  backwardNodes: LineageNode[]
): boolean {
  // All forward nodes should be reachable from start node
  const forwardIds = new Set(forwardNodes.map(n => n.nodeId));
  
  // All backward nodes should lead to start node
  const backwardIds = new Set(backwardNodes.map(n => n.nodeId));

  // Check that forward nodes have the start node in their backward lineage
  for (const node of forwardNodes) {
    // The node should have the start node as an ancestor
    if (!node.parentNodeIds.some(pid => pid === startNode.nodeId || backwardIds.has(pid) || forwardIds.has(pid))) {
      // This is okay if it's directly connected to start node
      if (!node.parentNodeIds.includes(startNode.nodeId)) {
        // Check if any parent is in the forward set (indirect connection)
        const hasConnection = node.parentNodeIds.some(pid => forwardIds.has(pid));
        if (!hasConnection && node.parentNodeIds.length > 0) {
          // Allow if parentNodeIds includes the start node or any forward node
          const connected = node.parentNodeIds.some(pid => 
            pid === startNode.nodeId || forwardIds.has(pid)
          );
          if (!connected) {
            return false;
          }
        }
      }
    }
  }

  // Check that backward nodes have the start node as a descendant
  for (const node of backwardNodes) {
    // The node should have the start node as a descendant
    if (!node.childNodeIds.some(cid => cid === startNode.nodeId || forwardIds.has(cid) || backwardIds.has(cid))) {
      // This is okay if it's directly connected to start node
      if (!node.childNodeIds.includes(startNode.nodeId)) {
        // Check if any child is in the backward set (indirect connection)
        const hasConnection = node.childNodeIds.some(cid => backwardIds.has(cid));
        if (!hasConnection && node.childNodeIds.length > 0) {
          // Allow if childNodeIds includes the start node or any backward node
          const connected = node.childNodeIds.some(cid => 
            cid === startNode.nodeId || backwardIds.has(cid)
          );
          if (!connected) {
            return false;
          }
        }
      }
    }
  }

  return true;
}
