/**
 * Audit Service
 * 
 * Provides complete audit trail functionality for AI interactions.
 * Handles logging, retrieval, tenant isolation, and retention management.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { 
  AuditRecord, 
  AuditFilters, 
  DateRange,
  AuditRequest,
  AuditResponse,
  TokenUsage
} from '../types/audit';
import { 
  AuditRepository, 
  TenantAccessDeniedError,
  AuditRecordNotFoundError 
} from '../repositories/audit';
import { generateUUID } from '../utils/uuid';

/**
 * Configuration for the Audit Service
 */
export interface AuditServiceConfig {
  /** Default retention period in days */
  defaultRetentionDays: number;
  /** Maximum records per query */
  maxQueryLimit: number;
  /** Maximum records per export */
  maxExportLimit: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AuditServiceConfig = {
  defaultRetentionDays: 90,
  maxQueryLimit: 1000,
  maxExportLimit: 10000
};

/**
 * Input for creating an audit record
 */
export interface CreateAuditRecordInput {
  tenantId: string;
  modelConfigId: string;
  analysisType: string;
  request: AuditRequest;
  response: AuditResponse;
  retentionDays?: number;
}

/**
 * Validates that an audit record contains all required fields
 * 
 * Requirements: 10.1, 10.2, 10.3
 */
export function validateAuditRecordCompleteness(record: AuditRecord): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  // Check top-level required fields
  if (!record.auditId) missingFields.push('auditId');
  if (!record.tenantId) missingFields.push('tenantId');
  if (!record.modelConfigId) missingFields.push('modelConfigId');
  if (!record.analysisType) missingFields.push('analysisType');
  if (!record.timestamp) missingFields.push('timestamp');
  if (!record.retentionExpiresAt) missingFields.push('retentionExpiresAt');

  // Check request fields (Requirements: 10.1)
  if (!record.request) {
    missingFields.push('request');
  } else {
    if (!record.request.promptTemplateId) missingFields.push('request.promptTemplateId');
    if (record.request.promptVersion === undefined) missingFields.push('request.promptVersion');
    if (!record.request.renderedPrompt) missingFields.push('request.renderedPrompt');
    if (!record.request.marketDataHash) missingFields.push('request.marketDataHash');
  }

  // Check response fields (Requirements: 10.2)
  if (!record.response) {
    missingFields.push('response');
  } else {
    if (!record.response.rawOutput) missingFields.push('response.rawOutput');
    if (record.response.validationPassed === undefined) missingFields.push('response.validationPassed');
    if (record.response.processingTimeMs === undefined) missingFields.push('response.processingTimeMs');
    if (record.response.costUsd === undefined) missingFields.push('response.costUsd');
    
    // Check token usage (Requirements: 10.3)
    if (!record.response.tokenUsage) {
      missingFields.push('response.tokenUsage');
    } else {
      if (record.response.tokenUsage.promptTokens === undefined) missingFields.push('response.tokenUsage.promptTokens');
      if (record.response.tokenUsage.completionTokens === undefined) missingFields.push('response.tokenUsage.completionTokens');
      if (record.response.tokenUsage.totalTokens === undefined) missingFields.push('response.tokenUsage.totalTokens');
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}


/**
 * Audit Service
 * 
 * Provides complete audit trail functionality for AI interactions.
 * All AI model requests and responses are logged for compliance and debugging.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
export const AuditService = {
  config: { ...DEFAULT_CONFIG } as AuditServiceConfig,

  /**
   * Configure the service
   */
  configure(config: Partial<AuditServiceConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  },

  /**
   * Create an audit record with all required fields
   * 
   * Requirements: 10.1, 10.2, 10.3
   * 
   * @param input - The input data for creating the audit record
   * @returns The created audit record
   */
  createAuditRecord(input: CreateAuditRecordInput): AuditRecord {
    const now = new Date();
    const retentionDays = input.retentionDays ?? this.config.defaultRetentionDays;
    const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    // Ensure token usage has all required fields
    const tokenUsage: TokenUsage = {
      promptTokens: input.response.tokenUsage?.promptTokens ?? 0,
      completionTokens: input.response.tokenUsage?.completionTokens ?? 0,
      totalTokens: input.response.tokenUsage?.totalTokens ?? 0
    };

    const record: AuditRecord = {
      auditId: generateUUID(),
      tenantId: input.tenantId,
      modelConfigId: input.modelConfigId,
      analysisType: input.analysisType,
      request: {
        promptTemplateId: input.request.promptTemplateId,
        promptVersion: input.request.promptVersion,
        renderedPrompt: input.request.renderedPrompt,
        marketDataHash: input.request.marketDataHash
      },
      response: {
        rawOutput: input.response.rawOutput,
        validatedOutput: input.response.validatedOutput,
        validationPassed: input.response.validationPassed,
        processingTimeMs: input.response.processingTimeMs,
        tokenUsage,
        costUsd: input.response.costUsd ?? 0
      },
      timestamp: now.toISOString(),
      retentionExpiresAt: expiresAt.toISOString()
    };

    return record;
  },

  /**
   * Log an AI analysis by storing the audit record
   * 
   * Requirements: 10.1, 10.2, 10.3
   * 
   * @param record - The audit record to log
   */
  async logAnalysis(record: AuditRecord): Promise<void> {
    // Validate completeness before storing
    const validation = validateAuditRecordCompleteness(record);
    if (!validation.valid) {
      console.warn('Audit record missing fields:', validation.missingFields);
      // Still store the record, but log the warning
    }

    await AuditRepository.putAuditRecord(record);
  },

  /**
   * Create and log an audit record in one operation
   * 
   * Requirements: 10.1, 10.2, 10.3
   * 
   * @param input - The input data for creating the audit record
   * @returns The created and stored audit record
   */
  async createAndLogAnalysis(input: CreateAuditRecordInput): Promise<AuditRecord> {
    const record = this.createAuditRecord(input);
    await this.logAnalysis(record);
    return record;
  },

  /**
   * Get audit records for a tenant with optional filters
   * 
   * Requirements: 10.4
   * 
   * @param tenantId - The tenant ID making the request
   * @param filters - Optional filters for the query
   * @returns List of audit records
   */
  async getAuditRecords(
    tenantId: string,
    filters?: AuditFilters
  ): Promise<AuditRecord[]> {
    // Enforce maximum query limit
    const effectiveFilters: AuditFilters = {
      ...filters,
      limit: Math.min(filters?.limit ?? this.config.maxQueryLimit, this.config.maxQueryLimit)
    };

    return AuditRepository.listAuditRecords(tenantId, effectiveFilters);
  },

  /**
   * Get a specific audit record with tenant validation
   * 
   * Requirements: 10.4
   * 
   * @param tenantId - The tenant ID making the request
   * @param auditId - The audit record ID
   * @param timestamp - The timestamp of the record
   * @returns The audit record
   * @throws TenantAccessDeniedError if tenant doesn't own the record
   * @throws AuditRecordNotFoundError if record doesn't exist
   */
  async getAuditRecord(
    tenantId: string,
    auditId: string,
    timestamp: string
  ): Promise<AuditRecord> {
    const record = await AuditRepository.getAuditRecord(tenantId, auditId, timestamp);
    
    if (!record) {
      throw new AuditRecordNotFoundError(auditId);
    }

    // Double-check tenant ownership (defense in depth)
    if (record.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'audit record');
    }

    return record;
  },

  /**
   * Export audit records for a date range
   * 
   * Requirements: 10.5
   * 
   * @param tenantId - The tenant ID
   * @param dateRange - The date range to export
   * @returns S3 URL of the exported archive
   */
  async exportAuditPackage(
    tenantId: string,
    dateRange: DateRange
  ): Promise<string> {
    return AuditRepository.exportAuditPackage(tenantId, dateRange);
  },

  /**
   * Get audit records by model configuration
   * 
   * @param tenantId - The tenant ID
   * @param modelConfigId - The model configuration ID
   * @param limit - Maximum number of records to return
   * @returns List of audit records for the model
   */
  async getAuditRecordsByModel(
    tenantId: string,
    modelConfigId: string,
    limit?: number
  ): Promise<AuditRecord[]> {
    return this.getAuditRecords(tenantId, {
      modelConfigId,
      limit
    });
  },

  /**
   * Get audit records by analysis type
   * 
   * @param tenantId - The tenant ID
   * @param analysisType - The analysis type (e.g., 'REGIME_CLASSIFICATION', 'EXPLANATION')
   * @param limit - Maximum number of records to return
   * @returns List of audit records for the analysis type
   */
  async getAuditRecordsByType(
    tenantId: string,
    analysisType: string,
    limit?: number
  ): Promise<AuditRecord[]> {
    return this.getAuditRecords(tenantId, {
      analysisType,
      limit
    });
  },

  /**
   * Get audit records for a date range
   * 
   * @param tenantId - The tenant ID
   * @param dateRange - The date range
   * @param limit - Maximum number of records to return
   * @returns List of audit records in the date range
   */
  async getAuditRecordsByDateRange(
    tenantId: string,
    dateRange: DateRange,
    limit?: number
  ): Promise<AuditRecord[]> {
    return this.getAuditRecords(tenantId, {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit
    });
  },

  /**
   * Count audit records for a tenant
   * 
   * @param tenantId - The tenant ID
   * @param dateRange - Optional date range
   * @returns Count of audit records
   */
  async countAuditRecords(
    tenantId: string,
    dateRange?: DateRange
  ): Promise<number> {
    return AuditRepository.countAuditRecords(tenantId, dateRange);
  },

  /**
   * Check if an audit record exists
   * 
   * @param tenantId - The tenant ID
   * @param auditId - The audit record ID
   * @param timestamp - The timestamp of the record
   * @returns True if the record exists
   */
  async auditRecordExists(
    tenantId: string,
    auditId: string,
    timestamp: string
  ): Promise<boolean> {
    return AuditRepository.auditRecordExists(tenantId, auditId, timestamp);
  },

  /**
   * Calculate retention expiration date
   * 
   * @param retentionDays - Number of days to retain
   * @returns ISO string of expiration date
   */
  calculateRetentionExpiration(retentionDays?: number): string {
    const days = retentionDays ?? this.config.defaultRetentionDays;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return expiresAt.toISOString();
  }
};

// Re-export errors for convenience
export { TenantAccessDeniedError, AuditRecordNotFoundError };
