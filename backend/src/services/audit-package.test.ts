import * as fc from 'fast-check';
import * as crypto from 'crypto';
import {
  AuditPackageService,
  calculateSHA256,
  verifyPackageHash,
  isWithinScope,
  CollectedAuditData
} from './audit-package';
import {
  exportAuditData,
  exportToJSON,
  exportToCSV,
  exportToPDF,
  isValidJSON,
  isValidCSV,
  isValidPDF,
  AuditExportData
} from './audit-export';
import { AuditPackageRepository } from '../repositories/audit-package';
import { TradeLifecycleRepository } from '../repositories/trade-lifecycle';
import { AITraceRepository } from '../repositories/ai-trace';
import { DataLineageRepository } from '../repositories/data-lineage';
import { RiskEventRepository } from '../repositories/risk-event';
import { AuditPackage, AuditPackageScope, ExportFormat } from '../types/audit-package';
import { TradeEvent } from '../types/trade-lifecycle';
import { AITrace } from '../types/ai-trace';
import { LineageNode } from '../types/data-lineage';
import { AuditedRiskEvent } from '../types/risk-event';
import {
  auditPackageScopeArb,
  exportFormatArb,
  tradeEventArb,
  aiTraceArb,
  lineageNodeArb,
  auditedRiskEventArb,
  isoDateStringArb,
  validDateRangeArb,
  cryptoSymbolArb
} from '../test/generators';

// Mock the repositories
jest.mock('../repositories/audit-package');
jest.mock('../repositories/trade-lifecycle');
jest.mock('../repositories/ai-trace');
jest.mock('../repositories/data-lineage');
jest.mock('../repositories/risk-event');

const mockAuditPackageRepo = AuditPackageRepository as jest.Mocked<typeof AuditPackageRepository>;
const mockTradeLifecycleRepo = TradeLifecycleRepository as jest.Mocked<typeof TradeLifecycleRepository>;
const mockAITraceRepo = AITraceRepository as jest.Mocked<typeof AITraceRepository>;
const mockDataLineageRepo = DataLineageRepository as jest.Mocked<typeof DataLineageRepository>;
const mockRiskEventRepo = RiskEventRepository as jest.Mocked<typeof RiskEventRepository>;

describe('Audit Package Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateSHA256', () => {
    it('should calculate correct SHA-256 hash for string input', () => {
      const input = 'test data';
      const expectedHash = crypto.createHash('sha256').update(input).digest('hex');
      
      expect(calculateSHA256(input)).toBe(expectedHash);
    });

    it('should calculate correct SHA-256 hash for buffer input', () => {
      const input = Buffer.from('test data');
      const expectedHash = crypto.createHash('sha256').update(input).digest('hex');
      
      expect(calculateSHA256(input)).toBe(expectedHash);
    });
  });

  describe('verifyPackageHash', () => {
    it('should return true for matching hash', () => {
      const data = 'test data';
      const hash = calculateSHA256(data);
      
      expect(verifyPackageHash(data, hash)).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const data = 'test data';
      const wrongHash = 'wrong-hash';
      
      expect(verifyPackageHash(data, wrongHash)).toBe(false);
    });
  });

  describe('isWithinScope', () => {
    it('should return true for timestamp within range', () => {
      const scope: AuditPackageScope = {
        timeRange: {
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-12-31T23:59:59.999Z'
        }
      };
      
      expect(isWithinScope('2024-06-15T12:00:00.000Z', undefined, undefined, scope)).toBe(true);
    });

    it('should return false for timestamp outside range', () => {
      const scope: AuditPackageScope = {
        timeRange: {
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-12-31T23:59:59.999Z'
        }
      };
      
      expect(isWithinScope('2023-06-15T12:00:00.000Z', undefined, undefined, scope)).toBe(false);
    });

    it('should filter by strategy ID when specified', () => {
      const scope: AuditPackageScope = {
        timeRange: {
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-12-31T23:59:59.999Z'
        },
        strategyIds: ['strategy-1', 'strategy-2']
      };
      
      expect(isWithinScope('2024-06-15T12:00:00.000Z', 'strategy-1', undefined, scope)).toBe(true);
      expect(isWithinScope('2024-06-15T12:00:00.000Z', 'strategy-3', undefined, scope)).toBe(false);
    });

    it('should filter by asset ID when specified', () => {
      const scope: AuditPackageScope = {
        timeRange: {
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-12-31T23:59:59.999Z'
        },
        assetIds: ['BTC', 'ETH']
      };
      
      expect(isWithinScope('2024-06-15T12:00:00.000Z', undefined, 'BTC', scope)).toBe(true);
      expect(isWithinScope('2024-06-15T12:00:00.000Z', undefined, 'SOL', scope)).toBe(false);
    });
  });
});


describe('Audit Export Service', () => {
  describe('exportToJSON', () => {
    it('should export valid JSON format', () => {
      const data: AuditExportData = {
        tradeEvents: [],
        aiTraces: [],
        riskEvents: [],
        lineageNodes: []
      };
      
      const result = exportToJSON(data);
      
      expect(result.contentType).toBe('application/json');
      expect(result.filename).toContain('.json');
      expect(isValidJSON(result.data)).toBe(true);
    });
  });

  describe('exportToCSV', () => {
    it('should export valid CSV format', () => {
      const data: AuditExportData = {
        tradeEvents: [],
        aiTraces: [],
        riskEvents: [],
        lineageNodes: []
      };
      
      const result = exportToCSV(data);
      
      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toContain('.csv');
      expect(isValidCSV(result.data)).toBe(true);
    });
  });

  describe('exportToPDF', () => {
    it('should export valid PDF format', () => {
      const data: AuditExportData = {
        tradeEvents: [],
        aiTraces: [],
        riskEvents: [],
        lineageNodes: []
      };
      
      const result = exportToPDF(data);
      
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toContain('.pdf');
      expect(isValidPDF(result.data)).toBe(true);
    });
  });
});

/**
 * Property-Based Tests for Audit Packages
 * Feature: reporting-audit
 */
describe('Audit Package Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 13: Audit Package Completeness and Scope
   * 
   * *For any* audit package generated with a specified scope (time range, strategies, assets),
   * the package SHALL contain all matching trade lifecycle logs, AI traces, risk events,
   * and data lineage records—and no records outside the scope.
   * 
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe('Property 13: Audit Package Completeness and Scope', () => {
    it('should include only records within the specified scope', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // tenantId
          auditPackageScopeArb(),
          fc.array(tradeEventArb(), { minLength: 0, maxLength: 5 }),
          fc.array(aiTraceArb(), { minLength: 0, maxLength: 5 }),
          fc.array(auditedRiskEventArb(), { minLength: 0, maxLength: 5 }),
          fc.array(lineageNodeArb(), { minLength: 0, maxLength: 5 }),
          async (tenantId, scope, tradeEvents, aiTraces, riskEvents, lineageNodes) => {
            // Filter events to those within scope for expected results
            const startTime = new Date(scope.timeRange.startDate).getTime();
            const endTime = new Date(scope.timeRange.endDate).getTime();
            
            const expectedTradeEvents = tradeEvents.filter(e => {
              const eventTime = new Date(e.timestamp).getTime();
              if (eventTime < startTime || eventTime > endTime) return false;
              if (scope.strategyIds?.length && !scope.strategyIds.includes(e.strategyId)) return false;
              if (scope.assetIds?.length && !scope.assetIds.includes(e.orderDetails.symbol)) return false;
              return true;
            });
            
            const expectedAITraces = aiTraces.filter(t => {
              const traceTime = new Date(t.timestamp).getTime();
              return traceTime >= startTime && traceTime <= endTime;
            });
            
            const expectedRiskEvents = riskEvents.filter(e => {
              const eventTime = new Date(e.timestamp).getTime();
              if (eventTime < startTime || eventTime > endTime) return false;
              // If strategyIds filter is specified, only include events that have a matching strategyId
              if (scope.strategyIds?.length) {
                if (!e.strategyId || !scope.strategyIds.includes(e.strategyId)) return false;
              }
              return true;
            });
            
            const expectedLineageNodes = lineageNodes.filter(n => {
              const nodeTime = new Date(n.timestamp).getTime();
              return nodeTime >= startTime && nodeTime <= endTime;
            });
            
            // Mock repositories to return filtered data
            mockTradeLifecycleRepo.listEventsByDateRange.mockResolvedValue(expectedTradeEvents);
            mockAITraceRepo.listTracesByDateRange.mockResolvedValue(expectedAITraces);
            mockRiskEventRepo.listAuditedEvents.mockResolvedValue({ items: expectedRiskEvents });
            mockDataLineageRepo.listNodes.mockResolvedValue(expectedLineageNodes);
            mockAuditPackageRepo.generateDownloadUrl.mockResolvedValue('https://example.com/download');
            mockAuditPackageRepo.putPackage.mockImplementation(async (_, metadata) => metadata);
            
            const result = await AuditPackageService.generatePackage(tenantId, scope, 'JSON');
            
            // Verify contents match expected counts
            expect(result.contents.tradeLifecycleLogs).toBe(expectedTradeEvents.length);
            expect(result.contents.aiTraces).toBe(expectedAITraces.length);
            expect(result.contents.riskEvents).toBe(expectedRiskEvents.length);
            expect(result.contents.dataLineageRecords).toBe(expectedLineageNodes.length);
            
            // Verify scope is preserved
            expect(result.scope).toEqual(scope);
            expect(result.tenantId).toBe(tenantId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 14: Package Integrity Hash Verification
   * 
   * *For any* audit package, recomputing the SHA-256 hash of the package contents
   * SHALL produce the same hash stored in the package metadata.
   * 
   * **Validates: Requirements 5.4**
   */
  describe('Property 14: Package Integrity Hash Verification', () => {
    it('should produce consistent SHA-256 hashes for any data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 10000 }),
          async (data) => {
            const buffer = Buffer.from(data, 'utf-8');
            
            // Calculate hash
            const hash1 = calculateSHA256(buffer);
            const hash2 = calculateSHA256(buffer);
            
            // Hash should be consistent
            expect(hash1).toBe(hash2);
            
            // Hash should be 64 hex characters (256 bits)
            expect(hash1.length).toBe(64);
            expect(/^[0-9a-f]+$/.test(hash1)).toBe(true);
            
            // Verification should pass
            expect(verifyPackageHash(buffer, hash1)).toBe(true);
            
            // Different data should produce different hash
            const differentData = data + 'x';
            const differentHash = calculateSHA256(Buffer.from(differentData, 'utf-8'));
            expect(differentHash).not.toBe(hash1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect tampering via hash mismatch', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (originalData, tamperedSuffix) => {
            const originalBuffer = Buffer.from(originalData, 'utf-8');
            const originalHash = calculateSHA256(originalBuffer);
            
            // Tamper with data
            const tamperedData = originalData + tamperedSuffix;
            const tamperedBuffer = Buffer.from(tamperedData, 'utf-8');
            
            // Original hash should not verify tampered data
            if (tamperedSuffix.length > 0) {
              expect(verifyPackageHash(tamperedBuffer, originalHash)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15: Export Format Validity
   * 
   * *For any* audit package exported in JSON, CSV, or PDF format, the output SHALL be
   * valid according to the format specification and parseable by standard tools.
   * 
   * **Validates: Requirements 5.5**
   */
  describe('Property 15: Export Format Validity', () => {
    it('should produce valid JSON for any audit data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tradeEventArb(), { minLength: 0, maxLength: 5 }),
          fc.array(aiTraceArb(), { minLength: 0, maxLength: 5 }),
          fc.array(auditedRiskEventArb(), { minLength: 0, maxLength: 5 }),
          fc.array(lineageNodeArb(), { minLength: 0, maxLength: 5 }),
          async (tradeEvents, aiTraces, riskEvents, lineageNodes) => {
            const data: AuditExportData = {
              tradeEvents,
              aiTraces,
              riskEvents,
              lineageNodes
            };
            
            const result = exportToJSON(data);
            
            // Should be valid JSON
            expect(isValidJSON(result.data)).toBe(true);
            
            // Should be parseable
            const parsed = JSON.parse(result.data.toString('utf-8'));
            expect(parsed.tradeLifecycleLogs).toBeDefined();
            expect(parsed.aiTraces).toBeDefined();
            expect(parsed.riskEvents).toBeDefined();
            expect(parsed.dataLineageRecords).toBeDefined();
            
            // Counts should match
            expect(parsed.tradeLifecycleLogs.length).toBe(tradeEvents.length);
            expect(parsed.aiTraces.length).toBe(aiTraces.length);
            expect(parsed.riskEvents.length).toBe(riskEvents.length);
            expect(parsed.dataLineageRecords.length).toBe(lineageNodes.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce valid CSV for any audit data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tradeEventArb(), { minLength: 0, maxLength: 5 }),
          fc.array(aiTraceArb(), { minLength: 0, maxLength: 5 }),
          fc.array(auditedRiskEventArb(), { minLength: 0, maxLength: 5 }),
          fc.array(lineageNodeArb(), { minLength: 0, maxLength: 5 }),
          async (tradeEvents, aiTraces, riskEvents, lineageNodes) => {
            const data: AuditExportData = {
              tradeEvents,
              aiTraces,
              riskEvents,
              lineageNodes
            };
            
            const result = exportToCSV(data);
            
            // Should be valid CSV
            expect(isValidCSV(result.data)).toBe(true);
            
            // Should contain section headers
            const csvContent = result.data.toString('utf-8');
            expect(csvContent).toContain('## Trade Lifecycle Logs');
            expect(csvContent).toContain('## AI Traces');
            expect(csvContent).toContain('## Risk Events');
            expect(csvContent).toContain('## Data Lineage Records');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce valid PDF for any audit data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tradeEventArb(), { minLength: 0, maxLength: 3 }),
          fc.array(aiTraceArb(), { minLength: 0, maxLength: 3 }),
          fc.array(auditedRiskEventArb(), { minLength: 0, maxLength: 3 }),
          fc.array(lineageNodeArb(), { minLength: 0, maxLength: 3 }),
          async (tradeEvents, aiTraces, riskEvents, lineageNodes) => {
            const data: AuditExportData = {
              tradeEvents,
              aiTraces,
              riskEvents,
              lineageNodes
            };
            
            const result = exportToPDF(data);
            
            // Should be valid PDF
            expect(isValidPDF(result.data)).toBe(true);
            
            // Should have correct content type
            expect(result.contentType).toBe('application/pdf');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should support all export formats', async () => {
      await fc.assert(
        fc.asyncProperty(
          exportFormatArb(),
          async (format) => {
            const data: AuditExportData = {
              tradeEvents: [],
              aiTraces: [],
              riskEvents: [],
              lineageNodes: []
            };
            
            const result = exportAuditData(data, format);
            
            // Should produce valid output for any format
            expect(result.data).toBeDefined();
            expect(result.data.length).toBeGreaterThan(0);
            expect(result.contentType).toBeDefined();
            expect(result.filename).toBeDefined();
            
            // Validate format-specific requirements
            switch (format) {
              case 'JSON':
                expect(isValidJSON(result.data)).toBe(true);
                expect(result.contentType).toBe('application/json');
                break;
              case 'CSV':
                expect(isValidCSV(result.data)).toBe(true);
                expect(result.contentType).toBe('text/csv');
                break;
              case 'PDF':
                expect(isValidPDF(result.data)).toBe(true);
                expect(result.contentType).toBe('application/pdf');
                break;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
