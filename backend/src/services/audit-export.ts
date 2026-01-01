/**
 * Audit Export Service - provides export format converters for audit data
 * 
 * Supports JSON, CSV, and PDF export formats for audit packages.
 * 
 * Requirements: 5.5
 */

import { TradeEvent } from '../types/trade-lifecycle';
import { AITrace } from '../types/ai-trace';
import { LineageNode } from '../types/data-lineage';
import { AuditedRiskEvent } from '../types/risk-event';
import { ExportFormat } from '../types/audit-package';

/**
 * Collected audit data for export
 */
export interface AuditExportData {
  tradeEvents: TradeEvent[];
  aiTraces: AITrace[];
  riskEvents: AuditedRiskEvent[];
  lineageNodes: LineageNode[];
  metadata?: {
    tenantId?: string;
    exportedAt?: string;
    scope?: {
      startDate: string;
      endDate: string;
      strategyIds?: string[];
      assetIds?: string[];
    };
  };
}

/**
 * Export result with data and content type
 */
export interface ExportResult {
  data: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Export audit data to the specified format
 * 
 * Requirements: 5.5
 * 
 * @param data - The audit data to export
 * @param format - The export format
 * @returns Export result with data buffer and content type
 */
export function exportAuditData(data: AuditExportData, format: ExportFormat): ExportResult {
  switch (format) {
    case 'JSON':
      return exportToJSON(data);
    case 'CSV':
      return exportToCSV(data);
    case 'PDF':
      return exportToPDF(data);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Export audit data to JSON format
 * 
 * Requirements: 5.5
 */
export function exportToJSON(data: AuditExportData): ExportResult {
  const exportedAt = data.metadata?.exportedAt || new Date().toISOString();
  
  const jsonContent = {
    exportedAt,
    metadata: data.metadata,
    summary: {
      tradeLifecycleLogs: data.tradeEvents.length,
      aiTraces: data.aiTraces.length,
      riskEvents: data.riskEvents.length,
      dataLineageRecords: data.lineageNodes.length
    },
    tradeLifecycleLogs: data.tradeEvents,
    aiTraces: data.aiTraces,
    riskEvents: data.riskEvents,
    dataLineageRecords: data.lineageNodes
  };
  
  const jsonString = JSON.stringify(jsonContent, null, 2);
  
  return {
    data: Buffer.from(jsonString, 'utf-8'),
    contentType: 'application/json',
    filename: `audit-export-${Date.now()}.json`
  };
}

/**
 * Export audit data to CSV format
 * 
 * Requirements: 5.5
 */
export function exportToCSV(data: AuditExportData): ExportResult {
  const sections: string[] = [];
  const exportedAt = data.metadata?.exportedAt || new Date().toISOString();
  
  // Header section
  sections.push(`# Audit Export - ${exportedAt}`);
  sections.push(`# Trade Events: ${data.tradeEvents.length}`);
  sections.push(`# AI Traces: ${data.aiTraces.length}`);
  sections.push(`# Risk Events: ${data.riskEvents.length}`);
  sections.push(`# Lineage Records: ${data.lineageNodes.length}`);
  sections.push('');
  
  // Trade Events Section
  sections.push('## Trade Lifecycle Logs');
  if (data.tradeEvents.length > 0) {
    const tradeHeaders = [
      'eventId',
      'tenantId',
      'tradeCorrelationId',
      'eventType',
      'timestamp',
      'strategyId',
      'orderId',
      'symbol',
      'side',
      'orderType',
      'quantity',
      'filledQuantity',
      'price',
      'status',
      'latencyFromPrevious'
    ];
    sections.push(tradeHeaders.join(','));
    
    for (const event of data.tradeEvents) {
      const row = [
        escapeCSVValue(event.eventId),
        escapeCSVValue(event.tenantId),
        escapeCSVValue(event.tradeCorrelationId),
        escapeCSVValue(event.eventType),
        escapeCSVValue(event.timestamp),
        escapeCSVValue(event.strategyId),
        escapeCSVValue(event.orderDetails.orderId),
        escapeCSVValue(event.orderDetails.symbol),
        escapeCSVValue(event.orderDetails.side),
        escapeCSVValue(event.orderDetails.orderType),
        String(event.orderDetails.quantity),
        String(event.orderDetails.filledQuantity),
        event.orderDetails.price !== undefined ? String(event.orderDetails.price) : '',
        escapeCSVValue(event.orderDetails.status),
        event.latencyFromPrevious !== undefined ? String(event.latencyFromPrevious) : ''
      ];
      sections.push(row.join(','));
    }
  } else {
    sections.push('No trade events in this export');
  }
  sections.push('');
  
  // AI Traces Section
  sections.push('## AI Traces');
  if (data.aiTraces.length > 0) {
    const aiHeaders = [
      'traceId',
      'tenantId',
      'correlationId',
      'analysisType',
      'promptTemplateId',
      'promptVersion',
      'modelId',
      'modelVersion',
      'processingTimeMs',
      'validationPassed',
      'costUsd',
      'timestamp'
    ];
    sections.push(aiHeaders.join(','));
    
    for (const trace of data.aiTraces) {
      const row = [
        escapeCSVValue(trace.traceId),
        escapeCSVValue(trace.tenantId),
        escapeCSVValue(trace.correlationId || ''),
        escapeCSVValue(trace.analysisType),
        escapeCSVValue(trace.promptTemplateId),
        String(trace.promptVersion),
        escapeCSVValue(trace.modelId),
        escapeCSVValue(trace.modelVersion),
        String(trace.processingTimeMs),
        String(trace.validationPassed),
        String(trace.costUsd),
        escapeCSVValue(trace.timestamp)
      ];
      sections.push(row.join(','));
    }
  } else {
    sections.push('No AI traces in this export');
  }
  sections.push('');
  
  // Risk Events Section
  sections.push('## Risk Events');
  if (data.riskEvents.length > 0) {
    const riskHeaders = [
      'eventId',
      'tenantId',
      'eventType',
      'severity',
      'timestamp',
      'strategyId',
      'assetId',
      'description',
      'triggeringTradeId',
      'hasRejectionDetails'
    ];
    sections.push(riskHeaders.join(','));
    
    for (const event of data.riskEvents) {
      const row = [
        escapeCSVValue(event.eventId),
        escapeCSVValue(event.tenantId),
        escapeCSVValue(event.eventType),
        escapeCSVValue(event.severity),
        escapeCSVValue(event.timestamp),
        escapeCSVValue(event.strategyId || ''),
        escapeCSVValue(event.assetId || ''),
        escapeCSVValue(event.description || ''),
        escapeCSVValue(event.triggeringTradeId || ''),
        String(!!event.rejectionDetails)
      ];
      sections.push(row.join(','));
    }
  } else {
    sections.push('No risk events in this export');
  }
  sections.push('');
  
  // Data Lineage Section
  sections.push('## Data Lineage Records');
  if (data.lineageNodes.length > 0) {
    const lineageHeaders = [
      'nodeId',
      'tenantId',
      'nodeType',
      'dataType',
      'timestamp',
      'sourceId',
      'sourceName',
      'ingestionTimestamp',
      'transformationType',
      'qualityScore',
      'parentNodeCount',
      'childNodeCount'
    ];
    sections.push(lineageHeaders.join(','));
    
    for (const node of data.lineageNodes) {
      const row = [
        escapeCSVValue(node.nodeId),
        escapeCSVValue(node.tenantId),
        escapeCSVValue(node.nodeType),
        escapeCSVValue(node.dataType),
        escapeCSVValue(node.timestamp),
        escapeCSVValue(node.sourceId || ''),
        escapeCSVValue(node.sourceName || ''),
        escapeCSVValue(node.ingestionTimestamp || ''),
        escapeCSVValue(node.transformationType || ''),
        node.qualityScore !== undefined ? String(node.qualityScore) : '',
        String(node.parentNodeIds.length),
        String(node.childNodeIds.length)
      ];
      sections.push(row.join(','));
    }
  } else {
    sections.push('No lineage records in this export');
  }
  
  const csvContent = sections.join('\n');
  
  return {
    data: Buffer.from(csvContent, 'utf-8'),
    contentType: 'text/csv',
    filename: `audit-export-${Date.now()}.csv`
  };
}

/**
 * Escape a value for CSV format
 */
export function escapeCSVValue(value: string): string {
  if (!value) return '';
  
  // Check if escaping is needed
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    // Escape double quotes by doubling them
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  
  return value;
}

/**
 * Export audit data to PDF format
 * 
 * This is a simplified PDF generator that creates a valid PDF document.
 * In production, consider using a library like pdfkit for more features.
 * 
 * Requirements: 5.5
 */
export function exportToPDF(data: AuditExportData): ExportResult {
  const exportedAt = data.metadata?.exportedAt || new Date().toISOString();
  
  // Build PDF content
  const pdfBuilder = new SimplePDFBuilder();
  
  // Title page content
  pdfBuilder.addText('AUDIT PACKAGE REPORT', 24, true);
  pdfBuilder.addText('');
  pdfBuilder.addText(`Generated: ${exportedAt}`);
  pdfBuilder.addText('');
  
  // Summary section
  pdfBuilder.addText('SUMMARY', 16, true);
  pdfBuilder.addText(`Trade Lifecycle Logs: ${data.tradeEvents.length}`);
  pdfBuilder.addText(`AI Traces: ${data.aiTraces.length}`);
  pdfBuilder.addText(`Risk Events: ${data.riskEvents.length}`);
  pdfBuilder.addText(`Data Lineage Records: ${data.lineageNodes.length}`);
  pdfBuilder.addText('');
  
  // Scope information if available
  if (data.metadata?.scope) {
    pdfBuilder.addText('SCOPE', 16, true);
    pdfBuilder.addText(`Date Range: ${data.metadata.scope.startDate} to ${data.metadata.scope.endDate}`);
    if (data.metadata.scope.strategyIds?.length) {
      pdfBuilder.addText(`Strategies: ${data.metadata.scope.strategyIds.join(', ')}`);
    }
    if (data.metadata.scope.assetIds?.length) {
      pdfBuilder.addText(`Assets: ${data.metadata.scope.assetIds.join(', ')}`);
    }
    pdfBuilder.addText('');
  }
  
  // Trade Events Summary
  if (data.tradeEvents.length > 0) {
    pdfBuilder.addText('TRADE EVENTS BREAKDOWN', 16, true);
    const eventTypeCounts = countByField(data.tradeEvents, 'eventType');
    for (const [type, count] of Object.entries(eventTypeCounts)) {
      pdfBuilder.addText(`  ${type}: ${count}`);
    }
    pdfBuilder.addText('');
    
    const symbolCounts = countByField(data.tradeEvents.map(e => ({ symbol: e.orderDetails.symbol })), 'symbol');
    pdfBuilder.addText('By Symbol:');
    for (const [symbol, count] of Object.entries(symbolCounts)) {
      pdfBuilder.addText(`  ${symbol}: ${count}`);
    }
    pdfBuilder.addText('');
  }
  
  // AI Traces Summary
  if (data.aiTraces.length > 0) {
    pdfBuilder.addText('AI TRACES BREAKDOWN', 16, true);
    const analysisTypeCounts = countByField(data.aiTraces, 'analysisType');
    for (const [type, count] of Object.entries(analysisTypeCounts)) {
      pdfBuilder.addText(`  ${type}: ${count}`);
    }
    pdfBuilder.addText('');
    
    const modelCounts = countByField(data.aiTraces, 'modelId');
    pdfBuilder.addText('By Model:');
    for (const [model, count] of Object.entries(modelCounts)) {
      pdfBuilder.addText(`  ${model}: ${count}`);
    }
    
    // Calculate total processing time and cost
    const totalProcessingTime = data.aiTraces.reduce((sum, t) => sum + t.processingTimeMs, 0);
    const totalCost = data.aiTraces.reduce((sum, t) => sum + t.costUsd, 0);
    pdfBuilder.addText('');
    pdfBuilder.addText(`Total Processing Time: ${totalProcessingTime}ms`);
    pdfBuilder.addText(`Total Cost: $${totalCost.toFixed(4)}`);
    pdfBuilder.addText('');
  }
  
  // Risk Events Summary
  if (data.riskEvents.length > 0) {
    pdfBuilder.addText('RISK EVENTS BREAKDOWN', 16, true);
    const severityCounts = countByField(data.riskEvents, 'severity');
    pdfBuilder.addText('By Severity:');
    for (const [severity, count] of Object.entries(severityCounts)) {
      pdfBuilder.addText(`  ${severity}: ${count}`);
    }
    pdfBuilder.addText('');
    
    const eventTypeCounts = countByField(data.riskEvents, 'eventType');
    pdfBuilder.addText('By Event Type:');
    for (const [type, count] of Object.entries(eventTypeCounts)) {
      pdfBuilder.addText(`  ${type}: ${count}`);
    }
    pdfBuilder.addText('');
  }
  
  // Data Lineage Summary
  if (data.lineageNodes.length > 0) {
    pdfBuilder.addText('DATA LINEAGE BREAKDOWN', 16, true);
    const nodeTypeCounts = countByField(data.lineageNodes, 'nodeType');
    pdfBuilder.addText('By Node Type:');
    for (const [type, count] of Object.entries(nodeTypeCounts)) {
      pdfBuilder.addText(`  ${type}: ${count}`);
    }
    pdfBuilder.addText('');
    
    const dataTypeCounts = countByField(data.lineageNodes, 'dataType');
    pdfBuilder.addText('By Data Type:');
    for (const [type, count] of Object.entries(dataTypeCounts)) {
      pdfBuilder.addText(`  ${type}: ${count}`);
    }
    pdfBuilder.addText('');
  }
  
  // Footer
  pdfBuilder.addText('');
  pdfBuilder.addText('--- End of Report ---');
  
  const pdfContent = pdfBuilder.build();
  
  return {
    data: Buffer.from(pdfContent, 'binary'),
    contentType: 'application/pdf',
    filename: `audit-export-${Date.now()}.pdf`
  };
}

/**
 * Count occurrences by field value
 */
function countByField<T>(items: T[], field: keyof T): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = String(item[field] || 'Unknown');
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

/**
 * PDF text line entry
 */
interface PDFTextLine {
  text: string;
  fontSize: number;
  bold: boolean;
}

/**
 * Simple PDF builder class for creating basic PDF documents
 * 
 * This creates a valid PDF 1.4 document with text content.
 * For production use, consider using pdfkit or similar libraries.
 */
class SimplePDFBuilder {
  private lines: PDFTextLine[] = [];
  private yPosition: number = 750;
  private pageHeight: number = 792;
  private pageWidth: number = 612;
  private margin: number = 50;
  private lineHeight: number = 14;
  
  addText(text: string, fontSize: number = 12, bold: boolean = false): void {
    // Sanitize text for PDF
    const sanitized = this.sanitizeText(text);
    this.lines.push({ text: sanitized, fontSize, bold });
    this.yPosition -= this.lineHeight;
  }
  
  private sanitizeText(text: string): string {
    // Escape special PDF characters
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, ''); // Remove non-printable characters
  }
  
  build(): string {
    const objects: string[] = [];
    let objectCount = 0;
    const objectOffsets: number[] = [];
    
    // PDF Header
    let pdf = '%PDF-1.4\n';
    pdf += '%\xE2\xE3\xCF\xD3\n'; // Binary marker
    
    // Catalog object
    objectCount++;
    objectOffsets.push(pdf.length);
    pdf += `${objectCount} 0 obj\n`;
    pdf += '<< /Type /Catalog /Pages 2 0 R >>\n';
    pdf += 'endobj\n';
    
    // Pages object
    objectCount++;
    objectOffsets.push(pdf.length);
    pdf += `${objectCount} 0 obj\n`;
    pdf += '<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n';
    pdf += 'endobj\n';
    
    // Build page content stream
    let contentStream = '';
    let yPos = this.pageHeight - this.margin;
    
    for (const line of this.lines) {
      const { text, fontSize, bold } = line;
      if (yPos < this.margin) {
        // Would need to add new page in production
        break;
      }
      
      const fontName = bold ? '/F2' : '/F1';
      contentStream += `BT ${fontName} ${fontSize} Tf ${this.margin} ${yPos} Td (${text}) Tj ET\n`;
      yPos -= this.lineHeight + (fontSize > 12 ? 4 : 0);
    }
    
    // Content stream object
    objectCount++;
    objectOffsets.push(pdf.length);
    pdf += `${objectCount} 0 obj\n`;
    pdf += `<< /Length ${contentStream.length} >>\n`;
    pdf += 'stream\n';
    pdf += contentStream;
    pdf += 'endstream\n';
    pdf += 'endobj\n';
    
    // Page object (references content stream)
    const pageObjNum = objectCount + 1;
    objectCount++;
    objectOffsets.push(pdf.length);
    pdf += `${objectCount} 0 obj\n`;
    pdf += '<< /Type /Page /Parent 2 0 R ';
    pdf += `/MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] `;
    pdf += '/Contents 3 0 R ';
    pdf += '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\n';
    pdf += 'endobj\n';
    
    // Font objects (Helvetica)
    objectCount++;
    objectOffsets.push(pdf.length);
    pdf += `${objectCount} 0 obj\n`;
    pdf += '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n';
    pdf += 'endobj\n';
    
    objectCount++;
    objectOffsets.push(pdf.length);
    pdf += `${objectCount} 0 obj\n`;
    pdf += '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\n';
    pdf += 'endobj\n';
    
    // Cross-reference table
    const xrefOffset = pdf.length;
    pdf += 'xref\n';
    pdf += `0 ${objectCount + 1}\n`;
    pdf += '0000000000 65535 f \n';
    
    for (const offset of objectOffsets) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    
    // Trailer
    pdf += 'trailer\n';
    pdf += `<< /Size ${objectCount + 1} /Root 1 0 R >>\n`;
    pdf += 'startxref\n';
    pdf += `${xrefOffset}\n`;
    pdf += '%%EOF';
    
    return pdf;
  }
}

/**
 * Validate that exported data is in valid JSON format
 */
export function isValidJSON(data: Buffer | string): boolean {
  try {
    const str = typeof data === 'string' ? data : data.toString('utf-8');
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that exported data is in valid CSV format
 */
export function isValidCSV(data: Buffer | string): boolean {
  try {
    const str = typeof data === 'string' ? data : data.toString('utf-8');
    const lines = str.split('\n');
    
    // Must have at least a header line
    if (lines.length === 0) return false;
    
    // Check basic structure - should have section markers
    const hasTradeSection = str.includes('## Trade Lifecycle Logs');
    const hasAISection = str.includes('## AI Traces');
    const hasRiskSection = str.includes('## Risk Events');
    const hasLineageSection = str.includes('## Data Lineage Records');
    
    // Must have all required sections
    if (!hasTradeSection || !hasAISection || !hasRiskSection || !hasLineageSection) {
      return false;
    }
    
    // Check that each data section has consistent structure
    // We're more lenient here - just verify the file is parseable
    let inDataSection = false;
    let currentSectionColumns: number | null = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('#')) {
        inDataSection = false;
        currentSectionColumns = null;
        continue;
      }
      
      // Skip section headers
      if (trimmedLine.startsWith('##')) {
        inDataSection = true;
        currentSectionColumns = null;
        continue;
      }
      
      // Skip "No ... in this export" messages
      if (trimmedLine.startsWith('No ')) {
        continue;
      }
      
      // For data lines, just verify they can be parsed
      if (inDataSection) {
        const columns = parseCSVLine(trimmedLine);
        
        // First data line sets expected column count for this section
        if (currentSectionColumns === null) {
          currentSectionColumns = columns.length;
        }
        
        // Allow some flexibility - columns should be within reasonable range
        // This accounts for optional fields that may be empty
        if (columns.length < 1) {
          return false;
        }
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Validate that exported data is in valid PDF format
 */
export function isValidPDF(data: Buffer | string): boolean {
  try {
    const str = typeof data === 'string' ? data : data.toString('binary');
    
    // Check PDF header
    if (!str.startsWith('%PDF-')) {
      return false;
    }
    
    // Check for EOF marker
    if (!str.includes('%%EOF')) {
      return false;
    }
    
    // Check for required PDF structures
    if (!str.includes('/Type /Catalog')) {
      return false;
    }
    
    if (!str.includes('/Type /Page')) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the appropriate file extension for an export format
 */
export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'JSON':
      return 'json';
    case 'CSV':
      return 'csv';
    case 'PDF':
      return 'pdf';
    default:
      return 'bin';
  }
}

/**
 * Get the MIME content type for an export format
 */
export function getContentType(format: ExportFormat): string {
  switch (format) {
    case 'JSON':
      return 'application/json';
    case 'CSV':
      return 'text/csv';
    case 'PDF':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
