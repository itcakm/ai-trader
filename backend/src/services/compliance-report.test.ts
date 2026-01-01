import * as fc from 'fast-check';
import {
  ComplianceReportService,
  ComplianceReportServiceExtended,
  validateReportTemplate,
  templatesAreEquivalent,
  validateReportSummary
} from './compliance-report';
import { ReportTemplateRepository } from '../repositories/report-template';
import { TradeLifecycleRepository } from '../repositories/trade-lifecycle';
import { AITraceRepository } from '../repositories/ai-trace';
import { RiskEventRepository } from '../repositories/risk-event';
import {
  ReportTemplate,
  ReportSchedule,
  ReportFilters,
  ComplianceReport
} from '../types/compliance-report';
import {
  reportTemplateArb,
  reportScheduleArb,
  reportFiltersArb,
  reportSummaryArb,
  complianceReportArb,
  templateAndReportArb,
  isoDateStringArb,
  validDateRangeArb
} from '../test/generators';

// Mock the repositories
jest.mock('../repositories/report-template');
jest.mock('../repositories/trade-lifecycle');
jest.mock('../repositories/ai-trace');
jest.mock('../repositories/risk-event');

const mockReportTemplateRepo = ReportTemplateRepository as jest.Mocked<typeof ReportTemplateRepository>;
const mockTradeLifecycleRepo = TradeLifecycleRepository as jest.Mocked<typeof TradeLifecycleRepository>;
const mockAITraceRepo = AITraceRepository as jest.Mocked<typeof AITraceRepository>;
const mockRiskEventRepo = RiskEventRepository as jest.Mocked<typeof RiskEventRepository>;

describe('Compliance Report Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ComplianceReportServiceExtended.clearGenerationLogs();
  });

  describe('saveTemplate', () => {
    it('should save a new template with version 1', async () => {
      const template: ReportTemplate = {
        templateId: 'template-123',
        name: 'Monthly Compliance Report',
        description: 'Standard monthly compliance report',
        sections: [
          {
            sectionId: 'section-1',
            title: 'Trade Summary',
            type: 'SUMMARY',
            dataQuery: 'trade_events',
            formatting: {}
          }
        ],
        format: 'PDF',
        version: 1
      };

      mockReportTemplateRepo.getLatestVersionNumber.mockResolvedValue(0);
      mockReportTemplateRepo.putTemplate.mockResolvedValue();

      const result = await ComplianceReportService.saveTemplate(template);

      expect(result.version).toBe(1);
      expect(result.templateId).toBe(template.templateId);
      expect(mockReportTemplateRepo.putTemplate).toHaveBeenCalledWith(expect.objectContaining({
        templateId: template.templateId,
        version: 1
      }));
    });

    it('should increment version for existing template', async () => {
      const template: ReportTemplate = {
        templateId: 'template-123',
        name: 'Monthly Compliance Report',
        description: 'Updated description',
        sections: [],
        format: 'PDF',
        version: 1
      };

      mockReportTemplateRepo.getLatestVersionNumber.mockResolvedValue(3);
      mockReportTemplateRepo.putTemplate.mockResolvedValue();

      const result = await ComplianceReportService.saveTemplate(template);

      expect(result.version).toBe(4);
    });
  });

  describe('generateReport', () => {
    it('should generate a report with summary statistics', async () => {
      const template: ReportTemplate = {
        templateId: 'template-123',
        name: 'Test Report',
        description: 'Test',
        sections: [
          {
            sectionId: 'section-1',
            title: 'Trades',
            type: 'TABLE',
            dataQuery: 'trade_events',
            formatting: {}
          }
        ],
        format: 'PDF',
        version: 1
      };

      mockReportTemplateRepo.getTemplate.mockResolvedValue(template);
      mockReportTemplateRepo.putReport.mockResolvedValue();
      mockReportTemplateRepo.getReportDownloadUrl.mockResolvedValue('https://example.com/report.pdf');
      mockTradeLifecycleRepo.listEventsByDateRange.mockResolvedValue([]);
      mockAITraceRepo.listTracesByDateRange.mockResolvedValue([]);
      mockRiskEventRepo.listEvents.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });

      const filters: ReportFilters = {
        dateRange: {
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T23:59:59.999Z'
        }
      };

      const result = await ComplianceReportService.generateReport('tenant-123', 'template-123', filters);

      expect(result.reportId).toBeDefined();
      expect(result.tenantId).toBe('tenant-123');
      expect(result.templateId).toBe('template-123');
      expect(result.generatedAt).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.sections).toHaveLength(1);
    });

    it('should throw error for non-existent template', async () => {
      mockReportTemplateRepo.getTemplate.mockResolvedValue(null);

      await expect(
        ComplianceReportService.generateReport('tenant-123', 'non-existent', {})
      ).rejects.toThrow('Template not found');
    });
  });

  describe('scheduleReport', () => {
    it('should create a schedule with generated ID', async () => {
      const schedule: ReportSchedule = {
        scheduleId: '',
        tenantId: 'tenant-123',
        templateId: 'template-123',
        frequency: 'DAILY',
        deliveryChannels: [{ type: 'EMAIL', destination: 'test@example.com' }],
        filters: {},
        enabled: true,
        nextRunAt: ''
      };

      mockReportTemplateRepo.putSchedule.mockResolvedValue();

      const result = await ComplianceReportService.scheduleReport(schedule);

      expect(result.scheduleId).toBeDefined();
      expect(result.scheduleId.length).toBeGreaterThan(0);
      expect(result.nextRunAt).toBeDefined();
    });
  });

  describe('getReportHistory', () => {
    it('should return reports for tenant', async () => {
      const reports: ComplianceReport[] = [
        {
          reportId: 'report-1',
          tenantId: 'tenant-123',
          templateId: 'template-123',
          generatedAt: '2024-01-15T10:00:00.000Z',
          dateRange: { startDate: '2024-01-01', endDate: '2024-01-15' },
          summary: {
            tradeCounts: { total: 100, byAsset: {} },
            volumes: { total: 1000000, byAsset: {} },
            pnl: { realized: 5000, unrealized: 2000, total: 7000 },
            riskEvents: { total: 5, bySeverity: {} },
            aiUsage: { totalAnalyses: 50, byModel: {} }
          },
          sections: [],
          storageUrl: 'https://example.com/report-1.pdf',
          format: 'PDF'
        }
      ];

      mockReportTemplateRepo.listReports.mockResolvedValue(reports);

      const result = await ComplianceReportService.getReportHistory('tenant-123');

      expect(result).toHaveLength(1);
      expect(result[0].reportId).toBe('report-1');
    });
  });

  describe('validateReportTemplate', () => {
    it('should return true for valid template', () => {
      const template: ReportTemplate = {
        templateId: 'template-123',
        name: 'Test',
        description: 'Test description',
        sections: [
          {
            sectionId: 'section-1',
            title: 'Section',
            type: 'SUMMARY',
            dataQuery: 'trades',
            formatting: {}
          }
        ],
        format: 'PDF',
        version: 1
      };

      expect(validateReportTemplate(template)).toBe(true);
    });

    it('should return false for missing templateId', () => {
      const template = {
        templateId: '',
        name: 'Test',
        description: 'Test',
        sections: [],
        format: 'PDF',
        version: 1
      } as ReportTemplate;

      expect(validateReportTemplate(template)).toBe(false);
    });
  });

  describe('validateReportSummary', () => {
    it('should return true for consistent summary', () => {
      const summary = {
        tradeCounts: { total: 150, byAsset: { BTC: 100, ETH: 50 } },
        volumes: { total: 1500000, byAsset: { BTC: 1000000, ETH: 500000 } },
        pnl: { realized: 5000, unrealized: 2000, total: 7000 },
        riskEvents: { total: 10, bySeverity: { WARNING: 7, CRITICAL: 3 } },
        aiUsage: { totalAnalyses: 100, byModel: { 'gpt-4': 60, 'claude': 40 } }
      };

      expect(validateReportSummary(summary)).toBe(true);
    });

    it('should return false for inconsistent trade counts', () => {
      const summary = {
        tradeCounts: { total: 100, byAsset: { BTC: 50, ETH: 30 } }, // 50+30 != 100
        volumes: { total: 0, byAsset: {} },
        pnl: { realized: 0, unrealized: 0, total: 0 },
        riskEvents: { total: 0, bySeverity: {} },
        aiUsage: { totalAnalyses: 0, byModel: {} }
      };

      expect(validateReportSummary(summary)).toBe(false);
    });
  });
});

/**
 * Property-Based Tests for Compliance Reports
 * Feature: reporting-audit
 */
describe('Compliance Report Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ComplianceReportServiceExtended.clearGenerationLogs();
  });

  /**
   * Property 16: Report Template Round-Trip
   * 
   * *For any* report template saved to the system, retrieving the template SHALL return
   * an equivalent template with all sections, formatting, and queries preserved.
   * 
   * **Validates: Requirements 6.1**
   */
  describe('Property 16: Report Template Round-Trip', () => {
    it('should preserve all template fields through save and retrieve', async () => {
      await fc.assert(
        fc.asyncProperty(reportTemplateArb(), async (template) => {
          // Mock the repository to simulate storage
          let storedTemplate: ReportTemplate | null = null;
          
          mockReportTemplateRepo.getLatestVersionNumber.mockResolvedValue(0);
          mockReportTemplateRepo.putTemplate.mockImplementation(async (t) => {
            storedTemplate = { ...t };
          });
          mockReportTemplateRepo.getTemplate.mockImplementation(async () => storedTemplate);

          // Save the template
          const savedTemplate = await ComplianceReportService.saveTemplate(template);

          // Retrieve the template
          const retrievedTemplate = await ComplianceReportServiceExtended.getTemplate(template.templateId);

          // Verify the template was stored
          expect(retrievedTemplate).not.toBeNull();
          
          if (retrievedTemplate) {
            // Verify all fields are preserved (except version which may be updated)
            expect(retrievedTemplate.templateId).toBe(template.templateId);
            expect(retrievedTemplate.name).toBe(template.name);
            expect(retrievedTemplate.description).toBe(template.description);
            expect(retrievedTemplate.format).toBe(template.format);
            expect(retrievedTemplate.sections.length).toBe(template.sections.length);

            // Verify each section is preserved
            for (let i = 0; i < template.sections.length; i++) {
              const originalSection = template.sections[i];
              const retrievedSection = retrievedTemplate.sections[i];

              expect(retrievedSection.sectionId).toBe(originalSection.sectionId);
              expect(retrievedSection.title).toBe(originalSection.title);
              expect(retrievedSection.type).toBe(originalSection.type);
              expect(retrievedSection.dataQuery).toBe(originalSection.dataQuery);
              expect(JSON.stringify(retrievedSection.formatting)).toBe(
                JSON.stringify(originalSection.formatting)
              );
            }

            // Verify templates are equivalent (using our helper function)
            expect(templatesAreEquivalent(
              { ...template, version: retrievedTemplate.version },
              retrievedTemplate
            )).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 17: Report Data Accuracy
   * 
   * *For any* compliance report generated from a template, the summary statistics
   * (trade counts, volumes, P&L, risk events, AI usage) SHALL accurately reflect
   * the underlying audit data for the specified filters.
   * 
   * **Validates: Requirements 6.4, 6.6**
   */
  describe('Property 17: Report Data Accuracy', () => {
    it('should generate internally consistent summary statistics', async () => {
      await fc.assert(
        fc.asyncProperty(reportSummaryArb(), async (summary) => {
          // Verify internal consistency of the summary
          
          // Trade counts: total should equal sum of byAsset
          const tradeCountSum = Object.values(summary.tradeCounts.byAsset).reduce((sum, count) => sum + count, 0);
          expect(summary.tradeCounts.total).toBe(tradeCountSum);

          // Volumes: total should equal sum of byAsset (with floating point tolerance)
          const volumeSum = Object.values(summary.volumes.byAsset).reduce((sum, vol) => sum + vol, 0);
          expect(Math.abs(summary.volumes.total - volumeSum)).toBeLessThan(0.01);

          // P&L: total should equal realized + unrealized
          expect(Math.abs(summary.pnl.total - (summary.pnl.realized + summary.pnl.unrealized))).toBeLessThan(0.01);

          // Risk events: total should equal sum of bySeverity
          const riskSum = Object.values(summary.riskEvents.bySeverity).reduce((sum, count) => sum + count, 0);
          expect(summary.riskEvents.total).toBe(riskSum);

          // AI usage: total should equal sum of byModel
          const aiSum = Object.values(summary.aiUsage.byModel).reduce((sum, count) => sum + count, 0);
          expect(summary.aiUsage.totalAnalyses).toBe(aiSum);

          // Validate using our helper function
          expect(validateReportSummary(summary)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate reports with valid summary statistics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          reportTemplateArb(),
          reportFiltersArb(),
          async (tenantId, template, filters) => {
            // Setup mocks
            mockReportTemplateRepo.getTemplate.mockResolvedValue(template);
            mockReportTemplateRepo.putReport.mockResolvedValue();
            mockReportTemplateRepo.getReportDownloadUrl.mockResolvedValue('https://example.com/report.pdf');
            mockTradeLifecycleRepo.listEventsByDateRange.mockResolvedValue([]);
            mockAITraceRepo.listTracesByDateRange.mockResolvedValue([]);
            mockRiskEventRepo.listEvents.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });

            const report = await ComplianceReportService.generateReport(tenantId, template.templateId, filters);

            // Verify report has required fields
            expect(report.reportId).toBeDefined();
            expect(report.tenantId).toBe(tenantId);
            expect(report.templateId).toBe(template.templateId);
            expect(report.generatedAt).toBeDefined();
            expect(report.summary).toBeDefined();

            // Verify summary is internally consistent
            expect(validateReportSummary(report.summary)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 18: Report Generation Logging
   * 
   * *For any* compliance report generated, the system SHALL create an audit log entry
   * for the generation event and store the report for future retrieval.
   * 
   * **Validates: Requirements 6.5**
   */
  describe('Property 18: Report Generation Logging', () => {
    it('should log every report generation event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          reportTemplateArb(),
          reportFiltersArb(),
          async (tenantId, template, filters) => {
            // Setup mocks
            mockReportTemplateRepo.getTemplate.mockResolvedValue(template);
            mockReportTemplateRepo.putReport.mockResolvedValue();
            mockReportTemplateRepo.getReportDownloadUrl.mockResolvedValue('https://example.com/report.pdf');
            mockTradeLifecycleRepo.listEventsByDateRange.mockResolvedValue([]);
            mockAITraceRepo.listTracesByDateRange.mockResolvedValue([]);
            mockRiskEventRepo.listEvents.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });

            // Clear logs before test
            ComplianceReportServiceExtended.clearGenerationLogs();

            // Generate the report
            const report = await ComplianceReportService.generateReport(tenantId, template.templateId, filters);

            // Verify generation was logged
            const logs = await ComplianceReportServiceExtended.getGenerationLogs(tenantId);
            
            expect(logs.length).toBeGreaterThan(0);
            
            // Find the log for this report
            const reportLog = logs.find(log => log.reportId === report.reportId);
            expect(reportLog).toBeDefined();
            
            if (reportLog) {
              expect(reportLog.tenantId).toBe(tenantId);
              expect(reportLog.templateId).toBe(template.templateId);
              expect(reportLog.generatedAt).toBeDefined();
              expect(reportLog.success).toBe(true);
              expect(reportLog.filters).toBeDefined();
            }

            // Verify report was stored (putReport was called)
            expect(mockReportTemplateRepo.putReport).toHaveBeenCalledWith(
              expect.objectContaining({
                reportId: report.reportId,
                tenantId,
                templateId: template.templateId
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should log failed report generation attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          reportFiltersArb(),
          async (tenantId, templateId, filters) => {
            // Setup mock to return null (template not found)
            mockReportTemplateRepo.getTemplate.mockResolvedValue(null);

            // Clear logs before test
            ComplianceReportServiceExtended.clearGenerationLogs();

            // Attempt to generate report (should fail)
            try {
              await ComplianceReportService.generateReport(tenantId, templateId, filters);
            } catch {
              // Expected to fail
            }

            // Verify failure was logged
            const logs = await ComplianceReportServiceExtended.getGenerationLogs(tenantId);
            
            expect(logs.length).toBeGreaterThan(0);
            
            // Find the failed log
            const failedLog = logs.find(log => !log.success);
            expect(failedLog).toBeDefined();
            
            if (failedLog) {
              expect(failedLog.tenantId).toBe(tenantId);
              expect(failedLog.templateId).toBe(templateId);
              expect(failedLog.success).toBe(false);
              expect(failedLog.errorMessage).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
