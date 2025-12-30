/**
 * Compliance Report Types
 * Requirements: 6.1, 6.2, 6.4
 */

/**
 * Report section types
 */
export type ReportSectionType = 'SUMMARY' | 'TABLE' | 'CHART' | 'TEXT';

/**
 * Report section definition
 * Requirements: 6.1
 */
export interface ReportSection {
  sectionId: string;
  title: string;
  type: ReportSectionType;
  dataQuery: string;
  formatting: Record<string, unknown>;
}

/**
 * Report template definition
 * Requirements: 6.1
 */
export interface ReportTemplate {
  templateId: string;
  name: string;
  description: string;
  sections: ReportSection[];
  format: 'PDF' | 'HTML' | 'XLSX';
  version: number;
}

/**
 * Delivery channel configuration
 * Requirements: 6.3
 */
export interface DeliveryChannel {
  type: 'EMAIL' | 'S3' | 'WEBHOOK';
  destination: string;
}

/**
 * Report schedule configuration
 * Requirements: 6.3
 */
export interface ReportSchedule {
  scheduleId: string;
  tenantId: string;
  templateId: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  deliveryChannels: DeliveryChannel[];
  filters: ReportFilters;
  enabled: boolean;
  nextRunAt: string;
}

/**
 * Report filters for customization
 * Requirements: 6.6
 */
export interface ReportFilters {
  dateRange?: { startDate: string; endDate: string };
  assetIds?: string[];
  strategyIds?: string[];
  metrics?: string[];
}

/**
 * Report summary statistics
 * Requirements: 6.4
 */
export interface ReportSummary {
  tradeCounts: { total: number; byAsset: Record<string, number> };
  volumes: { total: number; byAsset: Record<string, number> };
  pnl: { realized: number; unrealized: number; total: number };
  riskEvents: { total: number; bySeverity: Record<string, number> };
  aiUsage: { totalAnalyses: number; byModel: Record<string, number> };
}

/**
 * Generated section content
 */
export interface GeneratedSection {
  sectionId: string;
  title: string;
  type: ReportSectionType;
  content: unknown;
}

/**
 * Generated compliance report
 * Requirements: 6.2, 6.4, 6.5
 */
export interface ComplianceReport {
  reportId: string;
  tenantId: string;
  templateId: string;
  generatedAt: string;
  dateRange: { startDate: string; endDate: string };
  summary: ReportSummary;
  sections: GeneratedSection[];
  storageUrl: string;
  format: string;
}

/**
 * Compliance Report Generator Service Interface
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export interface ComplianceReportGenerator {
  saveTemplate(template: ReportTemplate): Promise<ReportTemplate>;
  generateReport(
    tenantId: string,
    templateId: string,
    filters: ReportFilters
  ): Promise<ComplianceReport>;
  scheduleReport(schedule: ReportSchedule): Promise<ReportSchedule>;
  getReportHistory(tenantId: string, templateId?: string): Promise<ComplianceReport[]>;
}
