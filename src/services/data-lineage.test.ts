import * as fc from 'fast-check';
import {
  DataLineageService,
  hasRequiredFields,
  hasQualityScore,
  verifyLineageConnectivity
} from './data-lineage';
import { DataLineageRepository } from '../repositories/data-lineage';
import { LineageNode, LineageEdge, IngestionRecord, TransformationRecord, UsageRecord } from '../types/data-lineage';
import {
  ingestionRecordArb,
  transformationRecordArb,
  usageRecordArb,
  sourceLineageNodeArb,
  transformationLineageNodeArb,
  decisionInputLineageNodeArb,
  lineageNodeArb,
  lineageChainArb,
  isoDateStringArb
} from '../test/generators';

// Mock the repository for unit testing
jest.mock('../repositories/data-lineage');

const mockRepository = DataLineageRepository as jest.Mocked<typeof DataLineageRepository>;

describe('Data Lineage Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordIngestion', () => {
    it('should record data ingestion with all required fields', async () => {
      const input: IngestionRecord = {
        tenantId: 'tenant-123',
        dataType: 'PRICE',
        sourceId: 'source-456',
        sourceName: 'Binance',
        qualityScore: 0.95,
        metadata: { symbol: 'BTC' }
      };

      mockRepository.putNode.mockImplementation(async (node) => node);

      const result = await DataLineageService.recordIngestion(input);

      expect(result.nodeId).toBeDefined();
      expect(result.tenantId).toBe(input.tenantId);
      expect(result.nodeType).toBe('SOURCE');
      expect(result.dataType).toBe(input.dataType);
      expect(result.sourceId).toBe(input.sourceId);
      expect(result.sourceName).toBe(input.sourceName);
      expect(result.qualityScore).toBe(input.qualityScore);
      expect(result.ingestionTimestamp).toBeDefined();
      expect(result.parentNodeIds).toEqual([]);
      expect(result.childNodeIds).toEqual([]);
      expect(mockRepository.putNode).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: input.tenantId,
        nodeType: 'SOURCE'
      }));
    });
  });

  describe('recordTransformation', () => {
    it('should record data transformation with parent links', async () => {
      const input: TransformationRecord = {
        tenantId: 'tenant-123',
        dataType: 'PRICE',
        transformationType: 'NORMALIZE',
        transformationParams: { method: 'z-score' },
        parentNodeIds: ['parent-1', 'parent-2'],
        qualityScore: 0.9
      };

      mockRepository.putNode.mockImplementation(async (node) => node);
      mockRepository.putEdge.mockImplementation(async (_, edge) => edge);
      mockRepository.updateNodeChildren.mockResolvedValue();

      const result = await DataLineageService.recordTransformation(input);

      expect(result.nodeId).toBeDefined();
      expect(result.tenantId).toBe(input.tenantId);
      expect(result.nodeType).toBe('TRANSFORMATION');
      expect(result.dataType).toBe(input.dataType);
      expect(result.transformationType).toBe(input.transformationType);
      expect(result.transformationParams).toEqual(input.transformationParams);
      expect(result.parentNodeIds).toEqual(input.parentNodeIds);
      expect(mockRepository.putEdge).toHaveBeenCalledTimes(2);
    });

    it('should create AGGREGATION node for aggregation transformations', async () => {
      const input: TransformationRecord = {
        tenantId: 'tenant-123',
        dataType: 'PRICE',
        transformationType: 'AGGREGATE',
        transformationParams: { method: 'mean' },
        parentNodeIds: ['parent-1']
      };

      mockRepository.putNode.mockImplementation(async (node) => node);
      mockRepository.putEdge.mockImplementation(async (_, edge) => edge);
      mockRepository.updateNodeChildren.mockResolvedValue();

      const result = await DataLineageService.recordTransformation(input);

      expect(result.nodeType).toBe('AGGREGATION');
    });
  });

  describe('recordUsage', () => {
    it('should record data usage in a decision', async () => {
      const input: UsageRecord = {
        tenantId: 'tenant-123',
        dataType: 'PRICE',
        parentNodeIds: ['data-1', 'data-2'],
        decisionId: 'decision-789',
        decisionType: 'TRADE_SIGNAL'
      };

      mockRepository.putNode.mockImplementation(async (node) => node);
      mockRepository.putEdge.mockImplementation(async (_, edge) => edge);
      mockRepository.updateNodeChildren.mockResolvedValue();

      const result = await DataLineageService.recordUsage(input);

      expect(result.nodeId).toBeDefined();
      expect(result.tenantId).toBe(input.tenantId);
      expect(result.nodeType).toBe('DECISION_INPUT');
      expect(result.dataType).toBe(input.dataType);
      expect(result.parentNodeIds).toEqual(input.parentNodeIds);
      expect(result.metadata.decisionId).toBe(input.decisionId);
      expect(result.metadata.decisionType).toBe(input.decisionType);
      expect(mockRepository.putEdge).toHaveBeenCalledTimes(2);
    });
  });


  describe('getForwardLineage', () => {
    it('should return all downstream nodes', async () => {
      const tenantId = 'tenant-123';
      const sourceNodeId = 'source-1';
      
      const sourceNode: LineageNode = {
        nodeId: sourceNodeId,
        tenantId,
        nodeType: 'SOURCE',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:00:00.000Z',
        sourceId: 'src-1',
        sourceName: 'Binance',
        ingestionTimestamp: '2024-01-01T10:00:00.000Z',
        parentNodeIds: [],
        childNodeIds: ['transform-1'],
        metadata: {}
      };

      const transformNode: LineageNode = {
        nodeId: 'transform-1',
        tenantId,
        nodeType: 'TRANSFORMATION',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:01:00.000Z',
        transformationType: 'NORMALIZE',
        transformationParams: { method: 'z-score' },
        parentNodeIds: [sourceNodeId],
        childNodeIds: ['decision-1'],
        metadata: {}
      };

      const decisionNode: LineageNode = {
        nodeId: 'decision-1',
        tenantId,
        nodeType: 'DECISION_INPUT',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:02:00.000Z',
        parentNodeIds: ['transform-1'],
        childNodeIds: [],
        metadata: { decisionId: 'd-1', decisionType: 'TRADE_SIGNAL' }
      };

      mockRepository.findNodeById.mockImplementation(async (tid, nodeId) => {
        if (nodeId === sourceNodeId) return sourceNode;
        if (nodeId === 'transform-1') return transformNode;
        if (nodeId === 'decision-1') return decisionNode;
        return null;
      });

      mockRepository.findEdgesBySourceNode.mockImplementation(async (tid, nodeId) => {
        if (nodeId === sourceNodeId) {
          return [{ edgeId: 'e1', sourceNodeId, targetNodeId: 'transform-1', relationship: 'DERIVED_FROM', timestamp: '2024-01-01T10:01:00.000Z' }];
        }
        if (nodeId === 'transform-1') {
          return [{ edgeId: 'e2', sourceNodeId: 'transform-1', targetNodeId: 'decision-1', relationship: 'USED_BY', timestamp: '2024-01-01T10:02:00.000Z' }];
        }
        return [];
      });

      const result = await DataLineageService.getForwardLineage(tenantId, sourceNodeId);

      expect(result).toHaveLength(2);
      expect(result.map(n => n.nodeId)).toContain('transform-1');
      expect(result.map(n => n.nodeId)).toContain('decision-1');
    });
  });

  describe('getBackwardLineage', () => {
    it('should return all upstream nodes', async () => {
      const tenantId = 'tenant-123';
      const decisionNodeId = 'decision-1';
      
      const sourceNode: LineageNode = {
        nodeId: 'source-1',
        tenantId,
        nodeType: 'SOURCE',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:00:00.000Z',
        sourceId: 'src-1',
        sourceName: 'Binance',
        ingestionTimestamp: '2024-01-01T10:00:00.000Z',
        parentNodeIds: [],
        childNodeIds: ['transform-1'],
        metadata: {}
      };

      const transformNode: LineageNode = {
        nodeId: 'transform-1',
        tenantId,
        nodeType: 'TRANSFORMATION',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:01:00.000Z',
        transformationType: 'NORMALIZE',
        transformationParams: { method: 'z-score' },
        parentNodeIds: ['source-1'],
        childNodeIds: [decisionNodeId],
        metadata: {}
      };

      const decisionNode: LineageNode = {
        nodeId: decisionNodeId,
        tenantId,
        nodeType: 'DECISION_INPUT',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:02:00.000Z',
        parentNodeIds: ['transform-1'],
        childNodeIds: [],
        metadata: { decisionId: 'd-1', decisionType: 'TRADE_SIGNAL' }
      };

      mockRepository.findNodeById.mockImplementation(async (tid, nodeId) => {
        if (nodeId === 'source-1') return sourceNode;
        if (nodeId === 'transform-1') return transformNode;
        if (nodeId === decisionNodeId) return decisionNode;
        return null;
      });

      mockRepository.findEdgesByTargetNode.mockImplementation(async (tid, nodeId) => {
        if (nodeId === decisionNodeId) {
          return [{ edgeId: 'e2', sourceNodeId: 'transform-1', targetNodeId: decisionNodeId, relationship: 'USED_BY', timestamp: '2024-01-01T10:02:00.000Z' }];
        }
        if (nodeId === 'transform-1') {
          return [{ edgeId: 'e1', sourceNodeId: 'source-1', targetNodeId: 'transform-1', relationship: 'DERIVED_FROM', timestamp: '2024-01-01T10:01:00.000Z' }];
        }
        return [];
      });

      const result = await DataLineageService.getBackwardLineage(tenantId, decisionNodeId);

      expect(result).toHaveLength(2);
      expect(result.map(n => n.nodeId)).toContain('source-1');
      expect(result.map(n => n.nodeId)).toContain('transform-1');
    });
  });

  describe('hasRequiredFields', () => {
    it('should return true for valid SOURCE node', () => {
      const node: LineageNode = {
        nodeId: 'node-1',
        tenantId: 'tenant-123',
        nodeType: 'SOURCE',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:00:00.000Z',
        sourceId: 'src-1',
        sourceName: 'Binance',
        ingestionTimestamp: '2024-01-01T10:00:00.000Z',
        parentNodeIds: [],
        childNodeIds: [],
        metadata: {}
      };

      expect(hasRequiredFields(node)).toBe(true);
    });

    it('should return false for SOURCE node missing sourceId', () => {
      const node: LineageNode = {
        nodeId: 'node-1',
        tenantId: 'tenant-123',
        nodeType: 'SOURCE',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:00:00.000Z',
        sourceName: 'Binance',
        ingestionTimestamp: '2024-01-01T10:00:00.000Z',
        parentNodeIds: [],
        childNodeIds: [],
        metadata: {}
      };

      expect(hasRequiredFields(node)).toBe(false);
    });

    it('should return true for valid TRANSFORMATION node', () => {
      const node: LineageNode = {
        nodeId: 'node-1',
        tenantId: 'tenant-123',
        nodeType: 'TRANSFORMATION',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:00:00.000Z',
        transformationType: 'NORMALIZE',
        transformationParams: { method: 'z-score' },
        parentNodeIds: ['parent-1'],
        childNodeIds: [],
        metadata: {}
      };

      expect(hasRequiredFields(node)).toBe(true);
    });

    it('should return false for TRANSFORMATION node without parents', () => {
      const node: LineageNode = {
        nodeId: 'node-1',
        tenantId: 'tenant-123',
        nodeType: 'TRANSFORMATION',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:00:00.000Z',
        transformationType: 'NORMALIZE',
        transformationParams: { method: 'z-score' },
        parentNodeIds: [],
        childNodeIds: [],
        metadata: {}
      };

      expect(hasRequiredFields(node)).toBe(false);
    });

    it('should return true for valid DECISION_INPUT node', () => {
      const node: LineageNode = {
        nodeId: 'node-1',
        tenantId: 'tenant-123',
        nodeType: 'DECISION_INPUT',
        dataType: 'PRICE',
        timestamp: '2024-01-01T10:00:00.000Z',
        parentNodeIds: ['parent-1'],
        childNodeIds: [],
        metadata: { decisionId: 'd-1', decisionType: 'TRADE_SIGNAL' }
      };

      expect(hasRequiredFields(node)).toBe(true);
    });
  });
});


/**
 * Property-Based Tests for Data Lineage
 * Feature: reporting-audit
 */
describe('Data Lineage Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 11: Data Lineage Completeness
   * 
   * *For any* data used in a trading decision, the lineage record SHALL contain:
   * data source, ingestion timestamp, all transformations applied (with type and parameters),
   * and quality score.
   * 
   * **Validates: Requirements 4.2, 4.4**
   */
  describe('Property 11: Data Lineage Completeness', () => {
    it('should ensure all SOURCE nodes have complete source information', async () => {
      await fc.assert(
        fc.asyncProperty(ingestionRecordArb(), async (input) => {
          mockRepository.putNode.mockImplementation(async (node) => node);

          const result = await DataLineageService.recordIngestion(input);

          // Verify SOURCE node completeness (Requirements: 4.2)
          expect(result.nodeId).toBeDefined();
          expect(result.nodeId.length).toBeGreaterThan(0);
          expect(result.tenantId).toBe(input.tenantId);
          expect(result.nodeType).toBe('SOURCE');
          expect(result.dataType).toBe(input.dataType);
          expect(result.timestamp).toBeDefined();
          
          // Source information (Requirements: 4.2)
          expect(result.sourceId).toBe(input.sourceId);
          expect(result.sourceName).toBe(input.sourceName);
          expect(result.ingestionTimestamp).toBeDefined();
          
          // Quality score if provided (Requirements: 4.2)
          if (input.qualityScore !== undefined) {
            expect(result.qualityScore).toBe(input.qualityScore);
          }

          // Verify hasRequiredFields returns true
          expect(hasRequiredFields(result)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should ensure all TRANSFORMATION nodes have complete transformation information', async () => {
      await fc.assert(
        fc.asyncProperty(transformationRecordArb(), async (input) => {
          mockRepository.putNode.mockImplementation(async (node) => node);
          mockRepository.putEdge.mockImplementation(async (_, edge) => edge);
          mockRepository.updateNodeChildren.mockResolvedValue();

          const result = await DataLineageService.recordTransformation(input);

          // Verify TRANSFORMATION node completeness (Requirements: 4.4)
          expect(result.nodeId).toBeDefined();
          expect(result.nodeId.length).toBeGreaterThan(0);
          expect(result.tenantId).toBe(input.tenantId);
          expect(['TRANSFORMATION', 'AGGREGATION']).toContain(result.nodeType);
          expect(result.dataType).toBe(input.dataType);
          expect(result.timestamp).toBeDefined();
          
          // Transformation information (Requirements: 4.4)
          expect(result.transformationType).toBe(input.transformationType);
          expect(result.transformationParams).toEqual(input.transformationParams);
          
          // Parent links (Requirements: 4.4)
          expect(result.parentNodeIds).toEqual(input.parentNodeIds);
          expect(result.parentNodeIds.length).toBeGreaterThan(0);
          
          // Quality score if provided (Requirements: 4.2)
          if (input.qualityScore !== undefined) {
            expect(result.qualityScore).toBe(input.qualityScore);
          }

          // Verify hasRequiredFields returns true
          expect(hasRequiredFields(result)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should ensure all DECISION_INPUT nodes have complete decision information', async () => {
      await fc.assert(
        fc.asyncProperty(usageRecordArb(), async (input) => {
          mockRepository.putNode.mockImplementation(async (node) => node);
          mockRepository.putEdge.mockImplementation(async (_, edge) => edge);
          mockRepository.updateNodeChildren.mockResolvedValue();

          const result = await DataLineageService.recordUsage(input);

          // Verify DECISION_INPUT node completeness (Requirements: 4.3)
          expect(result.nodeId).toBeDefined();
          expect(result.nodeId.length).toBeGreaterThan(0);
          expect(result.tenantId).toBe(input.tenantId);
          expect(result.nodeType).toBe('DECISION_INPUT');
          expect(result.dataType).toBe(input.dataType);
          expect(result.timestamp).toBeDefined();
          
          // Parent links (data used in decision)
          expect(result.parentNodeIds).toEqual(input.parentNodeIds);
          expect(result.parentNodeIds.length).toBeGreaterThan(0);
          
          // Decision information
          expect(result.metadata.decisionId).toBe(input.decisionId);
          expect(result.metadata.decisionType).toBe(input.decisionType);

          // Verify hasRequiredFields returns true
          expect(hasRequiredFields(result)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 12: Bidirectional Lineage Traversal
   * 
   * *For any* lineage node, forward lineage queries SHALL return all nodes that used this data,
   * and backward lineage queries SHALL return all nodes this data was derived from—
   * the union of forward and backward traversals SHALL form a connected graph.
   * 
   * **Validates: Requirements 4.5**
   */
  describe('Property 12: Bidirectional Lineage Traversal', () => {
    it('should return all downstream nodes in forward lineage', async () => {
      await fc.assert(
        fc.asyncProperty(lineageChainArb(), async ({ tenantId, sourceNode, transformationNode, decisionNode, edges }) => {
          // Setup mock to return the chain nodes
          mockRepository.findNodeById.mockImplementation(async (tid, nodeId) => {
            if (tid !== tenantId) return null;
            if (nodeId === sourceNode.nodeId) return sourceNode;
            if (nodeId === transformationNode.nodeId) return transformationNode;
            if (nodeId === decisionNode.nodeId) return decisionNode;
            return null;
          });

          mockRepository.findEdgesBySourceNode.mockImplementation(async (tid, nodeId) => {
            if (tid !== tenantId) return [];
            return edges.filter(e => e.sourceNodeId === nodeId);
          });

          const forwardFromSource = await DataLineageService.getForwardLineage(tenantId, sourceNode.nodeId);

          // Forward lineage from source should include transformation and decision nodes
          const forwardIds = forwardFromSource.map(n => n.nodeId);
          expect(forwardIds).toContain(transformationNode.nodeId);
          expect(forwardIds).toContain(decisionNode.nodeId);
          expect(forwardIds).not.toContain(sourceNode.nodeId); // Should not include starting node
        }),
        { numRuns: 100 }
      );
    });

    it('should return all upstream nodes in backward lineage', async () => {
      await fc.assert(
        fc.asyncProperty(lineageChainArb(), async ({ tenantId, sourceNode, transformationNode, decisionNode, edges }) => {
          // Setup mock to return the chain nodes
          mockRepository.findNodeById.mockImplementation(async (tid, nodeId) => {
            if (tid !== tenantId) return null;
            if (nodeId === sourceNode.nodeId) return sourceNode;
            if (nodeId === transformationNode.nodeId) return transformationNode;
            if (nodeId === decisionNode.nodeId) return decisionNode;
            return null;
          });

          mockRepository.findEdgesByTargetNode.mockImplementation(async (tid, nodeId) => {
            if (tid !== tenantId) return [];
            return edges.filter(e => e.targetNodeId === nodeId);
          });

          const backwardFromDecision = await DataLineageService.getBackwardLineage(tenantId, decisionNode.nodeId);

          // Backward lineage from decision should include transformation and source nodes
          const backwardIds = backwardFromDecision.map(n => n.nodeId);
          expect(backwardIds).toContain(transformationNode.nodeId);
          expect(backwardIds).toContain(sourceNode.nodeId);
          expect(backwardIds).not.toContain(decisionNode.nodeId); // Should not include starting node
        }),
        { numRuns: 100 }
      );
    });

    it('should form a connected graph with forward and backward traversals', async () => {
      await fc.assert(
        fc.asyncProperty(lineageChainArb(), async ({ tenantId, sourceNode, transformationNode, decisionNode, edges }) => {
          // Setup mock to return the chain nodes
          mockRepository.findNodeById.mockImplementation(async (tid, nodeId) => {
            if (tid !== tenantId) return null;
            if (nodeId === sourceNode.nodeId) return sourceNode;
            if (nodeId === transformationNode.nodeId) return transformationNode;
            if (nodeId === decisionNode.nodeId) return decisionNode;
            return null;
          });

          mockRepository.findEdgesBySourceNode.mockImplementation(async (tid, nodeId) => {
            if (tid !== tenantId) return [];
            return edges.filter(e => e.sourceNodeId === nodeId);
          });

          mockRepository.findEdgesByTargetNode.mockImplementation(async (tid, nodeId) => {
            if (tid !== tenantId) return [];
            return edges.filter(e => e.targetNodeId === nodeId);
          });

          // Get forward lineage from transformation node
          const forwardFromTransform = await DataLineageService.getForwardLineage(tenantId, transformationNode.nodeId);
          
          // Get backward lineage from transformation node
          const backwardFromTransform = await DataLineageService.getBackwardLineage(tenantId, transformationNode.nodeId);

          // Forward should include decision node
          const forwardIds = forwardFromTransform.map(n => n.nodeId);
          expect(forwardIds).toContain(decisionNode.nodeId);

          // Backward should include source node
          const backwardIds = backwardFromTransform.map(n => n.nodeId);
          expect(backwardIds).toContain(sourceNode.nodeId);

          // Union of forward and backward should cover all nodes except the starting node
          const allTraversedIds = new Set([...forwardIds, ...backwardIds]);
          expect(allTraversedIds.has(sourceNode.nodeId)).toBe(true);
          expect(allTraversedIds.has(decisionNode.nodeId)).toBe(true);
          expect(allTraversedIds.has(transformationNode.nodeId)).toBe(false); // Starting node not included
        }),
        { numRuns: 100 }
      );
    });

    it('should handle empty lineage for isolated nodes', async () => {
      await fc.assert(
        fc.asyncProperty(sourceLineageNodeArb(), async (isolatedNode) => {
          // Setup mock for an isolated node with no connections
          const nodeWithNoChildren = { ...isolatedNode, childNodeIds: [] };
          
          mockRepository.findNodeById.mockImplementation(async (tid, nodeId) => {
            if (nodeId === nodeWithNoChildren.nodeId) return nodeWithNoChildren;
            return null;
          });

          mockRepository.findEdgesBySourceNode.mockResolvedValue([]);
          mockRepository.findEdgesByTargetNode.mockResolvedValue([]);

          const forwardLineage = await DataLineageService.getForwardLineage(
            nodeWithNoChildren.tenantId, 
            nodeWithNoChildren.nodeId
          );
          
          const backwardLineage = await DataLineageService.getBackwardLineage(
            nodeWithNoChildren.tenantId, 
            nodeWithNoChildren.nodeId
          );

          // Isolated SOURCE node should have empty forward and backward lineage
          expect(forwardLineage).toHaveLength(0);
          expect(backwardLineage).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });
  });
});
