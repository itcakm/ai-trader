/**
 * Audit types for complete AI interaction logging and compliance.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AuditRequest {
  promptTemplateId: string;
  promptVersion: number;
  renderedPrompt: string;
  marketDataHash: string;
}

export interface AuditResponse {
  rawOutput: string;
  validatedOutput: unknown;
  validationPassed: boolean;
  processingTimeMs: number;
  tokenUsage: TokenUsage;
  costUsd: number;
}

export interface AuditRecord {
  auditId: string;
  tenantId: string;
  modelConfigId: string;
  analysisType: string;
  request: AuditRequest;
  response: AuditResponse;
  timestamp: string;
  retentionExpiresAt: string;
}

export interface AuditFilters {
  modelConfigId?: string;
  analysisType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}
