import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { AuditPackageRepository } from '../repositories/audit-package';
import { TradeLifecycleRepository } from '../repositories/trade-lifecycle';
import { AITraceRepository } from '../repositories/ai-trace';
import { DataLineageRepository } from '../repositories/data-lineage';
import { RiskEventRepository } from '../repositories/risk-event';
import {
  AuditPackage,
  AuditPackageScope,
  ExportFormat,
  PackageContents,
  AuditPackageGenerator
} from '../types/audit-package';
import { TradeEvent } from '../types/trade-lifecycle';
import { AITrace } from '../types/ai-trace';
import { LineageNode } from '../types/data-lineage';
import { AuditedRiskEvent } from '../types/risk-event';
import { generateUUID } from '../utils/uuid';

const gzip = promisify(zlib.gzip);

/**
 * Default URL expiration in seconds (1 hour)
 */
const DEFAULT_URL_EXPIRATION_SECONDS = 3600;

/**
 * Compression threshold in bytes (compress if larger than 1MB)
 */
const COMPRESSION_THRESHOLD_BYTES = 1024 * 1024;

/**
 * Collected audit data for package generation
 */
export interface CollectedAuditData {
  tradeEvents: TradeEvent[];
  aiTraces: AITrace[];
  riskEvents: AuditedRiskEvent[];
  lineageNodes: LineageNode[];
}

/**
 * Audit Package Service - generates downloadable audit packages with integrity verification
 * 
 * Implements the AuditPackageGenerator interface for creating audit packages,
 * verifying integrity, and generating download URLs.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export const AuditPackageService: AuditPackageGenerator = {
  /**
   * Generate an audit package containing all audit records for a specified scope
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4
   * 
   * @param tenantId - The tenant identifier
   * @param scope - The scope of the audit package
   * @param format - The export format
   * @returns The generated audit package metadata
   */
  async generatePackage(
    tenantId: string,
    scope: AuditPackageScope,
    format: ExportFormat
  ): Promise<AuditPackage> {
    const packageId = generateUUID();
    const generatedAt = new Date().toISOString();
    
    // Collect all audit data within scope (Requirements: 5.2)
    const auditData = await collectAuditData(tenantId, scope);
    
    // Convert to requested format
    const { data: formattedData, contentType } = await formatAuditData(auditData, format);
    
    // Calculate integrity hash (Requirements: 5.4)
    const integrityHash = calculateSHA256(formattedData);
    
    // Compress if large (Requirements: 5.6)
    const shouldCompress = formattedData.length > COMPRESSION_THRESHOLD_BYTES;
    const packageData = shouldCompress 
      ? await gzip(formattedData)
      : Buffer.from(formattedData);
    
    // Calculate download URL expiration
    const downloadExpiresAt = new Date(
      Date.now() + DEFAULT_URL_EXPIRATION_SECONDS * 1000
    ).toISOString();
    
    // Generate download URL
    const downloadUrl = await AuditPackageRepository.generateDownloadUrl(
      tenantId,
      generatedAt,
      packageId,
      format,
      DEFAULT_URL_EXPIRATION_SECONDS
    );
    
    // Create package metadata
    const packageMetadata: AuditPackage = {
      packageId,
      tenantId,
      generatedAt,
      scope,
      format,
      contents: {
        tradeLifecycleLogs: auditData.tradeEvents.length,
        aiTraces: auditData.aiTraces.length,
        riskEvents: auditData.riskEvents.length,
        dataLineageRecords: auditData.lineageNodes.length
      },
      integrityHash,
      hashAlgorithm: 'SHA-256',
      downloadUrl,
      downloadExpiresAt,
      sizeBytes: packageData.length,
      compressed: shouldCompress
    };
    
    // Store the package
    await AuditPackageRepository.putPackage(packageData, packageMetadata);
    
    return packageMetadata;
  },

  /**
   * Verify the integrity of an audit package
   * 
   * Requirements: 5.4
   * 
   * @param packageId - The package identifier
   * @returns True if the package integrity is valid
   */
  async verifyIntegrity(packageId: string): Promise<boolean> {
    // Find the package metadata
    const metadata = await findPackageMetadata(packageId);
    if (!metadata) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    // Get the package data
    const packageData = await AuditPackageRepository.getPackageData(
      metadata.tenantId,
      metadata.generatedAt,
      metadata.packageId,
      metadata.format
    );
    
    if (!packageData) {
      throw new Error(`Package data not found: ${packageId}`);
    }
    
    // Decompress if needed
    let rawData: Buffer;
    if (metadata.compressed) {
      rawData = await promisify(zlib.gunzip)(packageData);
    } else {
      rawData = packageData;
    }
    
    // Calculate hash and compare
    const calculatedHash = calculateSHA256(rawData);
    return calculatedHash === metadata.integrityHash;
  },

  /**
   * Get a download URL for an audit package
   * 
   * Requirements: 5.6
   * 
   * @param packageId - The package identifier
   * @returns Pre-signed download URL
   */
  async getDownloadUrl(packageId: string): Promise<string> {
    // Find the package metadata
    const metadata = await findPackageMetadata(packageId);
    if (!metadata) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    // Generate a fresh download URL
    const url = await AuditPackageRepository.generateDownloadUrl(
      metadata.tenantId,
      metadata.generatedAt,
      metadata.packageId,
      metadata.format,
      DEFAULT_URL_EXPIRATION_SECONDS
    );
    
    return url;
  }
};

/**
 * Find package metadata by ID (searches across all tenants for internal use)
 * Note: In production, this should be scoped to a specific tenant
 */
async function findPackageMetadata(packageId: string): Promise<AuditPackage | null> {
  // This is a simplified implementation - in production, you'd need tenant context
  // For now, we'll search using a known tenant pattern
  // The actual implementation would require tenant ID to be passed or stored in a lookup table
  
  // Try to find the package by searching the repository
  // This is a workaround - in production, maintain a packageId -> tenantId index
  return null; // Will be enhanced when tenant context is available
}

/**
 * Collect all audit data within the specified scope
 * 
 * Requirements: 5.2, 5.3
 */
async function collectAuditData(
  tenantId: string,
  scope: AuditPackageScope
): Promise<CollectedAuditData> {
  const startDate = new Date(scope.timeRange.startDate);
  const endDate = new Date(scope.timeRange.endDate);
  
  // Collect trade events
  let tradeEvents = await TradeLifecycleRepository.listEventsByDateRange(
    tenantId,
    startDate,
    endDate
  );
  
  // Filter by strategy if specified (Requirements: 5.3)
  if (scope.strategyIds && scope.strategyIds.length > 0) {
    tradeEvents = tradeEvents.filter(event => 
      scope.strategyIds!.includes(event.strategyId)
    );
  }
  
  // Filter by asset if specified (Requirements: 5.3)
  if (scope.assetIds && scope.assetIds.length > 0) {
    tradeEvents = tradeEvents.filter(event => 
      scope.assetIds!.includes(event.orderDetails.symbol)
    );
  }
  
  // Collect AI traces
  const aiTraces = await AITraceRepository.listTracesByDateRange(
    tenantId,
    startDate,
    endDate
  );
  
  // Collect risk events
  const riskEventsResult = await RiskEventRepository.listAuditedEvents(tenantId, {
    startTime: scope.timeRange.startDate,
    endTime: scope.timeRange.endDate
  });
  let riskEvents = riskEventsResult.items;
  
  // Filter risk events by strategy if specified
  if (scope.strategyIds && scope.strategyIds.length > 0) {
    riskEvents = riskEvents.filter(event => 
      event.strategyId && scope.strategyIds!.includes(event.strategyId)
    );
  }
  
  // Collect lineage nodes
  const lineageNodes = await DataLineageRepository.listNodes(
    tenantId,
    startDate,
    endDate
  );
  
  return {
    tradeEvents,
    aiTraces,
    riskEvents,
    lineageNodes
  };
}

/**
 * Format audit data into the requested export format
 * 
 * Requirements: 5.5
 */
async function formatAuditData(
  data: CollectedAuditData,
  format: ExportFormat
): Promise<{ data: Buffer; contentType: string }> {
  switch (format) {
    case 'JSON':
      return formatAsJSON(data);
    case 'CSV':
      return formatAsCSV(data);
    case 'PDF':
      return formatAsPDF(data);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Format audit data as JSON
 */
function formatAsJSON(data: CollectedAuditData): { data: Buffer; contentType: string } {
  const jsonData = JSON.stringify({
    exportedAt: new Date().toISOString(),
    tradeLifecycleLogs: data.tradeEvents,
    aiTraces: data.aiTraces,
    riskEvents: data.riskEvents,
    dataLineageRecords: data.lineageNodes
  }, null, 2);
  
  return {
    data: Buffer.from(jsonData, 'utf-8'),
    contentType: 'application/json'
  };
}

/**
 * Format audit data as CSV
 */
function formatAsCSV(data: CollectedAuditData): { data: Buffer; contentType: string } {
  const sections: string[] = [];
  
  // Trade Events Section
  sections.push('# Trade Lifecycle Logs');
  if (data.tradeEvents.length > 0) {
    const tradeHeaders = [
      'eventId', 'tenantId', 'tradeCorrelationId', 'eventType', 
      'timestamp', 'strategyId', 'orderId', 'symbol', 'side', 
      'orderType', 'quantity', 'filledQuantity', 'status'
    ];
    sections.push(tradeHeaders.join(','));
    
    for (const event of data.tradeEvents) {
      const row = [
        escapeCSV(event.eventId),
        escapeCSV(event.tenantId),
        escapeCSV(event.tradeCorrelationId),
        escapeCSV(event.eventType),
        escapeCSV(event.timestamp),
        escapeCSV(event.strategyId),
        escapeCSV(event.orderDetails.orderId),
        escapeCSV(event.orderDetails.symbol),
        escapeCSV(event.orderDetails.side),
        escapeCSV(event.orderDetails.orderType),
        String(event.orderDetails.quantity),
        String(event.orderDetails.filledQuantity),
        escapeCSV(event.orderDetails.status)
      ];
      sections.push(row.join(','));
    }
  }
  sections.push('');
  
  // AI Traces Section
  sections.push('# AI Traces');
  if (data.aiTraces.length > 0) {
    const aiHeaders = [
      'traceId', 'tenantId', 'correlationId', 'analysisType',
      'promptTemplateId', 'promptVersion', 'modelId', 'modelVersion',
      'processingTimeMs', 'validationPassed', 'timestamp'
    ];
    sections.push(aiHeaders.join(','));
    
    for (const trace of data.aiTraces) {
      const row = [
        escapeCSV(trace.traceId),
        escapeCSV(trace.tenantId),
        escapeCSV(trace.correlationId || ''),
        escapeCSV(trace.analysisType),
        escapeCSV(trace.promptTemplateId),
        String(trace.promptVersion),
        escapeCSV(trace.modelId),
        escapeCSV(trace.modelVersion),
        String(trace.processingTimeMs),
        String(trace.validationPassed),
        escapeCSV(trace.timestamp)
      ];
      sections.push(row.join(','));
    }
  }
  sections.push('');
  
  // Risk Events Section
  sections.push('# Risk Events');
  if (data.riskEvents.length > 0) {
    const riskHeaders = [
      'eventId', 'tenantId', 'eventType', 'severity',
      'timestamp', 'strategyId', 'assetId', 'description'
    ];
    sections.push(riskHeaders.join(','));
    
    for (const event of data.riskEvents) {
      const row = [
        escapeCSV(event.eventId),
        escapeCSV(event.tenantId),
        escapeCSV(event.eventType),
        escapeCSV(event.severity),
        escapeCSV(event.timestamp),
        escapeCSV(event.strategyId || ''),
        escapeCSV(event.assetId || ''),
        escapeCSV(event.description || '')
      ];
      sections.push(row.join(','));
    }
  }
  sections.push('');
  
  // Data Lineage Section
  sections.push('# Data Lineage Records');
  if (data.lineageNodes.length > 0) {
    const lineageHeaders = [
      'nodeId', 'tenantId', 'nodeType', 'dataType',
      'timestamp', 'sourceId', 'sourceName', 'qualityScore'
    ];
    sections.push(lineageHeaders.join(','));
    
    for (const node of data.lineageNodes) {
      const row = [
        escapeCSV(node.nodeId),
        escapeCSV(node.tenantId),
        escapeCSV(node.nodeType),
        escapeCSV(node.dataType),
        escapeCSV(node.timestamp),
        escapeCSV(node.sourceId || ''),
        escapeCSV(node.sourceName || ''),
        String(node.qualityScore ?? '')
      ];
      sections.push(row.join(','));
    }
  }
  
  return {
    data: Buffer.from(sections.join('\n'), 'utf-8'),
    contentType: 'text/csv'
  };
}

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format audit data as PDF (simplified text-based representation)
 * Note: In production, use a proper PDF library like pdfkit
 */
function formatAsPDF(data: CollectedAuditData): { data: Buffer; contentType: string } {
  // Create a simple text-based PDF representation
  // In production, use a proper PDF library
  const lines: string[] = [];
  
  lines.push('%PDF-1.4');
  lines.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  lines.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  
  // Build content
  const content: string[] = [];
  content.push('Audit Package Report');
  content.push(`Generated: ${new Date().toISOString()}`);
  content.push('');
  content.push(`Trade Lifecycle Logs: ${data.tradeEvents.length}`);
  content.push(`AI Traces: ${data.aiTraces.length}`);
  content.push(`Risk Events: ${data.riskEvents.length}`);
  content.push(`Data Lineage Records: ${data.lineageNodes.length}`);
  content.push('');
  
  // Add summary of each section
  if (data.tradeEvents.length > 0) {
    content.push('--- Trade Events Summary ---');
    const eventTypes = new Map<string, number>();
    for (const event of data.tradeEvents) {
      eventTypes.set(event.eventType, (eventTypes.get(event.eventType) || 0) + 1);
    }
    for (const [type, count] of eventTypes) {
      content.push(`  ${type}: ${count}`);
    }
    content.push('');
  }
  
  if (data.riskEvents.length > 0) {
    content.push('--- Risk Events Summary ---');
    const severities = new Map<string, number>();
    for (const event of data.riskEvents) {
      severities.set(event.severity, (severities.get(event.severity) || 0) + 1);
    }
    for (const [severity, count] of severities) {
      content.push(`  ${severity}: ${count}`);
    }
    content.push('');
  }
  
  const contentText = content.join('\\n');
  const streamContent = `BT /F1 12 Tf 50 750 Td (${contentText}) Tj ET`;
  
  lines.push(`3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj`);
  lines.push(`4 0 obj << /Length ${streamContent.length} >> stream`);
  lines.push(streamContent);
  lines.push('endstream endobj');
  lines.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  lines.push('xref');
  lines.push('0 6');
  lines.push('0000000000 65535 f');
  lines.push('0000000009 00000 n');
  lines.push('0000000058 00000 n');
  lines.push('0000000115 00000 n');
  lines.push('0000000270 00000 n');
  lines.push('0000000380 00000 n');
  lines.push('trailer << /Size 6 /Root 1 0 R >>');
  lines.push('startxref');
  lines.push('460');
  lines.push('%%EOF');
  
  return {
    data: Buffer.from(lines.join('\n'), 'utf-8'),
    contentType: 'application/pdf'
  };
}

/**
 * Calculate SHA-256 hash of data
 * 
 * Requirements: 5.4
 */
export function calculateSHA256(data: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Verify package integrity by comparing hashes
 * 
 * Requirements: 5.4
 */
export function verifyPackageHash(data: Buffer | string, expectedHash: string): boolean {
  const calculatedHash = calculateSHA256(data);
  return calculatedHash === expectedHash;
}

/**
 * Check if audit data matches the specified scope
 * 
 * Requirements: 5.3
 */
export function isWithinScope(
  timestamp: string,
  strategyId: string | undefined,
  assetId: string | undefined,
  scope: AuditPackageScope
): boolean {
  const eventTime = new Date(timestamp).getTime();
  const startTime = new Date(scope.timeRange.startDate).getTime();
  const endTime = new Date(scope.timeRange.endDate).getTime();
  
  // Check time range
  if (eventTime < startTime || eventTime > endTime) {
    return false;
  }
  
  // Check strategy filter
  if (scope.strategyIds && scope.strategyIds.length > 0) {
    if (!strategyId || !scope.strategyIds.includes(strategyId)) {
      return false;
    }
  }
  
  // Check asset filter
  if (scope.assetIds && scope.assetIds.length > 0) {
    if (!assetId || !scope.assetIds.includes(assetId)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get package by ID with tenant context
 */
export async function getPackageByIdWithTenant(
  tenantId: string,
  packageId: string
): Promise<AuditPackage | null> {
  return AuditPackageRepository.findPackageById(tenantId, packageId);
}

/**
 * Verify integrity with tenant context
 */
export async function verifyIntegrityWithTenant(
  tenantId: string,
  packageId: string
): Promise<boolean> {
  const metadata = await AuditPackageRepository.findPackageById(tenantId, packageId);
  if (!metadata) {
    throw new Error(`Package not found: ${packageId}`);
  }
  
  const packageData = await AuditPackageRepository.getPackageData(
    metadata.tenantId,
    metadata.generatedAt,
    metadata.packageId,
    metadata.format
  );
  
  if (!packageData) {
    throw new Error(`Package data not found: ${packageId}`);
  }
  
  // Decompress if needed
  let rawData: Buffer;
  if (metadata.compressed) {
    rawData = await promisify(zlib.gunzip)(packageData);
  } else {
    rawData = packageData;
  }
  
  // Calculate hash and compare
  const calculatedHash = calculateSHA256(rawData);
  return calculatedHash === metadata.integrityHash;
}

/**
 * Get download URL with tenant context
 */
export async function getDownloadUrlWithTenant(
  tenantId: string,
  packageId: string
): Promise<string> {
  const metadata = await AuditPackageRepository.findPackageById(tenantId, packageId);
  if (!metadata) {
    throw new Error(`Package not found: ${packageId}`);
  }
  
  return AuditPackageRepository.generateDownloadUrl(
    metadata.tenantId,
    metadata.generatedAt,
    metadata.packageId,
    metadata.format,
    DEFAULT_URL_EXPIRATION_SECONDS
  );
}
