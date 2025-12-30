import { ReportTemplateRepository } from '../repositories/report-template';
import { TradeLifecycleRepository } from '../repositories/trade-lifecycle';
import { AITraceRepository } from '../repositories/ai-trace';
import { RiskEventRepository } from '../repositories/risk-event';
import { AuditRepository } from '../repositories/audit';
import {
  ReportTemplate,
  ReportSection,
  ReportSchedule,
  ReportFilters,
  ReportSummary,
  ComplianceReport,
  GeneratedSection,
  ComplianceReportGenerator
} from '../types/compliance-report';
import { generateUUID } from '../utils/uuid';

/**
 * Report generation log entry for audit purposes
 * Requirements: 6.5
 */
export interface ReportGenerationLog {
  logId: string;
  tenantId: string;
  reportId: string;
  templateId: string;
  generatedAt: string;
  filters: ReportFilters;
  success: boolean;
  errorMessage?: string;
}

/**
 * In-memory storage for report generation logs (for testing)
 * In production, this would be stored in S3 or a database
 */
const reportGenerationLogs: Map<string, ReportGenerationLog[]> = new Map();

/**
 * Compliance Report Service - manages report template and report generation
 * 
 * Implements the ComplianceReportGenerator interface for saving templates,
 * generating reports, scheduling reports, and retrieving report history.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export const ComplianceReportService: ComplianceReportGenerator = {
  /**
   * Create or update a report template
   * 
   * Requirements: 6.1
   * 
   * @param template - The template to save
   * @returns The saved template with updated version
   */
  async saveTemplate(template: ReportTemplate): Promise<ReportTemplate> {
    // Check if template already exists
    const existingVersion = await ReportTemplateRepository.getLatestVersionNumber(template.templateId);
    
    let savedTemplate: ReportTemplate;
    
    if (existingVersion === 0) {
      // New template - save as version 1
      savedTemplate = {
        ...template,
        version: 1
      };
    } else {
      // Existing template - increment version
      savedTemplate = {
        ...template,
        version: existingVersion + 1
      };
    }
    
    await ReportTemplateRepository.putTemplate(savedTemplate);
    return savedTemplate;
  },

  /**
   * Generate a compliance report from a template
   * 
   * Requirements: 6.2, 6.4, 6.6
   * 
   * @param tenantId - The tenant identifier
   * @param templateId - The template to use
   * @param filters - Report customization filters
   * @returns The generated compliance report
   */
  async generateReport(
    tenantId: string,
    templateId: string,
    filters: ReportFilters
  ): Promise<ComplianceReport> {
    const reportId = generateUUID();
    const generatedAt = new Date().toISOString();
    
    // Get the template
    const template = await ReportTemplateRepository.getTemplate(templateId);
    if (!template) {
      // Log the failure
      await logReportGeneration(tenantId, reportId, templateId, generatedAt, filters, false, 'Template not found');
      throw new Error(`Template not found: ${templateId}`);
    }
    
    // Determine date range from filters or default to last 30 days
    const dateRange = filters.dateRange || getDefaultDateRange();
    
    try {
      // Calculate summary statistics
      const summary = await calculateSummaryStatistics(tenantId, dateRange, filters);
      
      // Generate sections based on template
      const sections = await generateSections(tenantId, template.sections, dateRange, filters);
      
      // Create the report
      const report: ComplianceReport = {
        reportId,
        tenantId,
        templateId,
        generatedAt,
        dateRange,
        summary,
        sections,
        storageUrl: '', // Will be set after storage
        format: template.format
      };
      
      // Store the report
      await ReportTemplateRepository.putReport(report);
      
      // Update storage URL
      report.storageUrl = await ReportTemplateRepository.getReportDownloadUrl(
        tenantId,
        reportId,
        generatedAt
      );
      
      // Log successful generation
      await logReportGeneration(tenantId, reportId, templateId, generatedAt, filters, true);
      
      return report;
    } catch (error) {
      // Log the failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await logReportGeneration(tenantId, reportId, templateId, generatedAt, filters, false, errorMessage);
      throw error;
    }
  },

  /**
   * Schedule recurring report generation
   * 
   * Requirements: 6.3
   * 
   * @param schedule - The schedule configuration
   * @returns The saved schedule
   */
  async scheduleReport(schedule: ReportSchedule): Promise<ReportSchedule> {
    // Generate schedule ID if not provided
    const savedSchedule: ReportSchedule = {
      ...schedule,
      scheduleId: schedule.scheduleId || generateUUID()
    };
    
    // Calculate next run time if not set
    if (!savedSchedule.nextRunAt) {
      savedSchedule.nextRunAt = calculateNextRunTime(savedSchedule.frequency);
    }
    
    await ReportTemplateRepository.putSchedule(savedSchedule);
    return savedSchedule;
  },

  /**
   * Get report history for a tenant
   * 
   * Requirements: 6.5
   * 
   * @param tenantId - The tenant identifier
   * @param templateId - Optional template filter
   * @returns List of generated reports
   */
  async getReportHistory(tenantId: string, templateId?: string): Promise<ComplianceReport[]> {
    return ReportTemplateRepository.listReports(tenantId, templateId);
  }
};

/**
 * Extended Compliance Report Service with additional utility methods
 */
export const ComplianceReportServiceExtended = {
  ...ComplianceReportService,

  /**
   * Get a specific template by ID
   * 
   * @param templateId - The template identifier
   * @returns The template or null if not found
   */
  async getTemplate(templateId: string): Promise<ReportTemplate | null> {
    return ReportTemplateRepository.getTemplate(templateId);
  },

  /**
   * Get a specific template version
   * 
   * @param templateId - The template identifier
   * @param version - The version number
   * @returns The template or null if not found
   */
  async getTemplateVersion(templateId: string, version: number): Promise<ReportTemplate | null> {
    return ReportTemplateRepository.getTemplateVersion(templateId, version);
  },

  /**
   * List all templates
   * 
   * @returns List of templates
   */
  async listTemplates(): Promise<ReportTemplate[]> {
    return ReportTemplateRepository.listTemplates();
  },

  /**
   * Get a specific report
   * 
   * @param tenantId - The tenant identifier
   * @param reportId - The report identifier
   * @param generatedAt - The report generation timestamp
   * @returns The report or null if not found
   */
  async getReport(tenantId: string, reportId: string, generatedAt: string): Promise<ComplianceReport | null> {
    return ReportTemplateRepository.getReport(tenantId, reportId, generatedAt);
  },

  /**
   * Get schedules for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns List of schedules
   */
  async getSchedules(tenantId: string): Promise<ReportSchedule[]> {
    return ReportTemplateRepository.listSchedules(tenantId);
  },

  /**
   * Get a specific schedule
   * 
   * @param tenantId - The tenant identifier
   * @param scheduleId - The schedule identifier
   * @returns The schedule or null if not found
   */
  async getSchedule(tenantId: string, scheduleId: string): Promise<ReportSchedule | null> {
    return ReportTemplateRepository.getSchedule(tenantId, scheduleId);
  },

  /**
   * Get report generation logs for a tenant
   * 
   * Requirements: 6.5
   * 
   * @param tenantId - The tenant identifier
   * @returns List of generation logs
   */
  async getGenerationLogs(tenantId: string): Promise<ReportGenerationLog[]> {
    return reportGenerationLogs.get(tenantId) || [];
  },

  /**
   * Clear generation logs (for testing)
   */
  clearGenerationLogs(): void {
    reportGenerationLogs.clear();
  }
};

/**
 * Calculate summary statistics for a report
 * 
 * Requirements: 6.4
 * 
 * @param tenantId - The tenant identifier
 * @param dateRange - The date range for the report
 * @param filters - Optional filters
 * @returns Report summary statistics
 */
export async function calculateSummaryStatistics(
  tenantId: string,
  dateRange: { startDate: string; endDate: string },
  filters?: ReportFilters
): Promise<ReportSummary> {
  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);
  
  // Get trade events
  const tradeEvents = await TradeLifecycleRepository.listEventsByDateRange(
    tenantId,
    startDate,
    endDate,
    10000
  );
  
  // Filter by strategy/asset if specified
  const filteredTrades = tradeEvents.filter(event => {
    if (filters?.strategyIds && filters.strategyIds.length > 0) {
      if (!filters.strategyIds.includes(event.strategyId)) {
        return false;
      }
    }
    if (filters?.assetIds && filters.assetIds.length > 0) {
      if (!filters.assetIds.includes(event.orderDetails.symbol)) {
        return false;
      }
    }
    return true;
  });
  
  // Calculate trade counts by asset
  const tradeCountsByAsset: Record<string, number> = {};
  const volumesByAsset: Record<string, number> = {};
  
  for (const event of filteredTrades) {
    const symbol = event.orderDetails.symbol;
    tradeCountsByAsset[symbol] = (tradeCountsByAsset[symbol] || 0) + 1;
    
    // Calculate volume (quantity * price for filled orders)
    if (event.eventType === 'COMPLETE_FILL' || event.eventType === 'PARTIAL_FILL') {
      const volume = event.orderDetails.filledQuantity * (event.orderDetails.price || 0);
      volumesByAsset[symbol] = (volumesByAsset[symbol] || 0) + volume;
    }
  }
  
  const totalTrades = Object.values(tradeCountsByAsset).reduce((sum, count) => sum + count, 0);
  const totalVolume = Object.values(volumesByAsset).reduce((sum, vol) => sum + vol, 0);
  
  // Get risk events
  const riskEventsResult = await RiskEventRepository.listEvents(tenantId, {
    startTime: dateRange.startDate,
    endTime: dateRange.endDate,
    limit: 10000
  });
  
  // Count risk events by severity
  const riskEventsBySeverity: Record<string, number> = {};
  for (const event of riskEventsResult.items) {
    riskEventsBySeverity[event.severity] = (riskEventsBySeverity[event.severity] || 0) + 1;
  }
  const totalRiskEvents = riskEventsResult.items.length;
  
  // Get AI traces
  const aiTraces = await AITraceRepository.listTracesByDateRange(
    tenantId,
    startDate,
    endDate,
    10000
  );
  
  // Count AI usage by model
  const aiUsageByModel: Record<string, number> = {};
  for (const trace of aiTraces) {
    aiUsageByModel[trace.modelId] = (aiUsageByModel[trace.modelId] || 0) + 1;
  }
  const totalAIAnalyses = aiTraces.length;
  
  // Calculate P&L (simplified - in production this would be more sophisticated)
  // For now, we'll use placeholder values since actual P&L calculation requires
  // position tracking and market data
  const pnl = {
    realized: 0,
    unrealized: 0,
    total: 0
  };
  
  return {
    tradeCounts: {
      total: totalTrades,
      byAsset: tradeCountsByAsset
    },
    volumes: {
      total: totalVolume,
      byAsset: volumesByAsset
    },
    pnl,
    riskEvents: {
      total: totalRiskEvents,
      bySeverity: riskEventsBySeverity
    },
    aiUsage: {
      totalAnalyses: totalAIAnalyses,
      byModel: aiUsageByModel
    }
  };
}

/**
 * Generate report sections based on template
 * 
 * @param tenantId - The tenant identifier
 * @param sections - Template sections
 * @param dateRange - The date range
 * @param filters - Optional filters
 * @returns Generated sections
 */
async function generateSections(
  tenantId: string,
  sections: ReportSection[],
  dateRange: { startDate: string; endDate: string },
  filters?: ReportFilters
): Promise<GeneratedSection[]> {
  const generatedSections: GeneratedSection[] = [];
  
  for (const section of sections) {
    const content = await generateSectionContent(tenantId, section, dateRange, filters);
    
    generatedSections.push({
      sectionId: section.sectionId,
      title: section.title,
      type: section.type,
      content
    });
  }
  
  return generatedSections;
}

/**
 * Generate content for a single section
 * 
 * @param tenantId - The tenant identifier
 * @param section - The section definition
 * @param dateRange - The date range
 * @param filters - Optional filters
 * @returns Section content
 */
async function generateSectionContent(
  tenantId: string,
  section: ReportSection,
  dateRange: { startDate: string; endDate: string },
  filters?: ReportFilters
): Promise<unknown> {
  // Parse the data query to determine what data to fetch
  const query = section.dataQuery.toLowerCase();
  
  if (query.includes('trade') || query.includes('lifecycle')) {
    const events = await TradeLifecycleRepository.listEventsByDateRange(
      tenantId,
      new Date(dateRange.startDate),
      new Date(dateRange.endDate),
      1000
    );
    return formatSectionData(section.type, events, section.formatting);
  }
  
  if (query.includes('risk')) {
    const result = await RiskEventRepository.listEvents(tenantId, {
      startTime: dateRange.startDate,
      endTime: dateRange.endDate,
      limit: 1000
    });
    return formatSectionData(section.type, result.items, section.formatting);
  }
  
  if (query.includes('ai') || query.includes('trace')) {
    const traces = await AITraceRepository.listTracesByDateRange(
      tenantId,
      new Date(dateRange.startDate),
      new Date(dateRange.endDate),
      1000
    );
    return formatSectionData(section.type, traces, section.formatting);
  }
  
  // Default: return empty content
  return null;
}

/**
 * Format section data based on section type
 * 
 * @param type - The section type
 * @param data - The raw data
 * @param formatting - Formatting options
 * @returns Formatted content
 */
function formatSectionData(
  type: ReportSection['type'],
  data: unknown[],
  formatting: Record<string, unknown>
): unknown {
  switch (type) {
    case 'SUMMARY':
      return {
        count: data.length,
        data: data.slice(0, 10) // First 10 items for summary
      };
    case 'TABLE':
      return {
        rows: data,
        columns: formatting.columns || []
      };
    case 'CHART':
      return {
        dataPoints: data,
        chartType: formatting.chartType || 'line'
      };
    case 'TEXT':
      return {
        text: `Generated from ${data.length} records`,
        details: formatting.details || {}
      };
    default:
      return data;
  }
}

/**
 * Get default date range (last 30 days)
 * 
 * @returns Default date range
 */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  };
}

/**
 * Calculate next run time based on frequency
 * 
 * @param frequency - The schedule frequency
 * @returns Next run time as ISO string
 */
function calculateNextRunTime(frequency: ReportSchedule['frequency']): string {
  const now = new Date();
  let nextRun: Date;
  
  switch (frequency) {
    case 'DAILY':
      nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'WEEKLY':
      nextRun = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'MONTHLY':
      nextRun = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      break;
    default:
      nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  
  return nextRun.toISOString();
}

/**
 * Log report generation event
 * 
 * Requirements: 6.5
 * 
 * @param tenantId - The tenant identifier
 * @param reportId - The report identifier
 * @param templateId - The template identifier
 * @param generatedAt - Generation timestamp
 * @param filters - Filters used
 * @param success - Whether generation succeeded
 * @param errorMessage - Optional error message
 */
async function logReportGeneration(
  tenantId: string,
  reportId: string,
  templateId: string,
  generatedAt: string,
  filters: ReportFilters,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  const log: ReportGenerationLog = {
    logId: generateUUID(),
    tenantId,
    reportId,
    templateId,
    generatedAt,
    filters,
    success,
    errorMessage
  };
  
  // Store in memory (in production, this would go to S3 or a database)
  const tenantLogs = reportGenerationLogs.get(tenantId) || [];
  tenantLogs.push(log);
  reportGenerationLogs.set(tenantId, tenantLogs);
}

/**
 * Validate that a report template has all required fields
 * 
 * Requirements: 6.1
 * 
 * @param template - The template to validate
 * @returns True if valid
 */
export function validateReportTemplate(template: ReportTemplate): boolean {
  if (!template.templateId) return false;
  if (!template.name) return false;
  if (!template.description) return false;
  if (!Array.isArray(template.sections)) return false;
  if (!template.format) return false;
  if (typeof template.version !== 'number') return false;
  
  // Validate each section
  for (const section of template.sections) {
    if (!section.sectionId) return false;
    if (!section.title) return false;
    if (!section.type) return false;
    if (!section.dataQuery) return false;
    if (!section.formatting) return false;
  }
  
  return true;
}

/**
 * Check if two templates are equivalent (ignoring version)
 * 
 * Requirements: 6.1
 * 
 * @param a - First template
 * @param b - Second template
 * @returns True if equivalent
 */
export function templatesAreEquivalent(a: ReportTemplate, b: ReportTemplate): boolean {
  if (a.templateId !== b.templateId) return false;
  if (a.name !== b.name) return false;
  if (a.description !== b.description) return false;
  if (a.format !== b.format) return false;
  if (a.sections.length !== b.sections.length) return false;
  
  // Compare sections
  for (let i = 0; i < a.sections.length; i++) {
    const sectionA = a.sections[i];
    const sectionB = b.sections[i];
    
    if (sectionA.sectionId !== sectionB.sectionId) return false;
    if (sectionA.title !== sectionB.title) return false;
    if (sectionA.type !== sectionB.type) return false;
    if (sectionA.dataQuery !== sectionB.dataQuery) return false;
    if (JSON.stringify(sectionA.formatting) !== JSON.stringify(sectionB.formatting)) return false;
  }
  
  return true;
}

/**
 * Validate report summary statistics accuracy
 * 
 * Requirements: 6.4
 * 
 * @param summary - The summary to validate
 * @returns True if summary is internally consistent
 */
export function validateReportSummary(summary: ReportSummary): boolean {
  // Validate trade counts
  const totalFromByAsset = Object.values(summary.tradeCounts.byAsset).reduce((sum, count) => sum + count, 0);
  if (totalFromByAsset !== summary.tradeCounts.total) return false;
  
  // Validate volumes
  const volumeFromByAsset = Object.values(summary.volumes.byAsset).reduce((sum, vol) => sum + vol, 0);
  if (Math.abs(volumeFromByAsset - summary.volumes.total) > 0.01) return false;
  
  // Validate P&L
  if (Math.abs(summary.pnl.realized + summary.pnl.unrealized - summary.pnl.total) > 0.01) return false;
  
  // Validate risk events
  const riskFromBySeverity = Object.values(summary.riskEvents.bySeverity).reduce((sum, count) => sum + count, 0);
  if (riskFromBySeverity !== summary.riskEvents.total) return false;
  
  // Validate AI usage
  const aiFromByModel = Object.values(summary.aiUsage.byModel).reduce((sum, count) => sum + count, 0);
  if (aiFromByModel !== summary.aiUsage.totalAnalyses) return false;
  
  return true;
}
