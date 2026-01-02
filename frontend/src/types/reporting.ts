/**
 * Reporting types for the frontend
 */

/**
 * Report section types
 */
export type ReportSectionType = 'SUMMARY' | 'TABLE' | 'CHART' | 'TEXT';

/**
 * Report format
 */
export type ReportFormat = 'PDF' | 'HTML' | 'XLSX';

/**
 * Export format
 */
export type ExportFormat = 'JSON' | 'CSV' | 'PDF';

/**
 * Report section definition
 */
export interface ReportSection {
  sectionId: string;
  title: string;
  type: ReportSectionType;
  dataQuery: string;
  formatting: Record<string, unknown>;
}

/**
 * Report template
 */
export interface ReportTemplate {
  templateId: string;
  name: string;
  description: string;
  sections: ReportSection[];
  format: ReportFormat;
  version: number;
}

/**
 * Delivery channel
 */
export interface DeliveryChannel {
  type: 'EMAIL' | 'S3' | 'WEBHOOK';
  destination: string;
}

/**
 * Report schedule
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
 * Report filters
 */
export interface ReportFilters {
  dateRange?: { startDate: string; endDate: string };
  assetIds?: string[];
  strategyIds?: string[];
  metrics?: string[];
}

/**
 * Report summary statistics
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
 * Compliance report
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
 * Audit package scope
 */
export interface AuditPackageScope {
  timeRange: { startDate: string; endDate: string };
  strategyIds?: string[];
  assetIds?: string[];
  includeAll?: boolean;
}

/**
 * Package contents summary
 */
export interface PackageContents {
  tradeLifecycleLogs: number;
  aiTraces: number;
  riskEvents: number;
  dataLineageRecords: number;
}

/**
 * Audit package
 */
export interface AuditPackage {
  packageId: string;
  tenantId: string;
  generatedAt: string;
  scope: AuditPackageScope;
  format: ExportFormat;
  contents: PackageContents;
  integrityHash: string;
  hashAlgorithm: 'SHA-256';
  downloadUrl: string;
  downloadExpiresAt: string;
  sizeBytes: number;
  compressed: boolean;
}

/**
 * Report status
 */
export type ReportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

/**
 * Report status badge variant mapping
 */
export const reportStatusVariant: Record<ReportStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  PENDING: 'default',
  GENERATING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
};

/**
 * Frequency badge variant mapping
 */
export const frequencyVariant: Record<ReportSchedule['frequency'], 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  DAILY: 'info',
  WEEKLY: 'default',
  MONTHLY: 'warning',
};
