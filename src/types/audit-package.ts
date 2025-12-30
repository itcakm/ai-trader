/**
 * Audit Package Types
 * Requirements: 5.1, 5.4, 5.5
 */

/**
 * Scope options for audit package generation
 * Requirements: 5.3
 */
export interface AuditPackageScope {
  timeRange: { startDate: string; endDate: string };
  strategyIds?: string[];
  assetIds?: string[];
  includeAll?: boolean;
}

/**
 * Export format options
 * Requirements: 5.5
 */
export type ExportFormat = 'JSON' | 'CSV' | 'PDF';

/**
 * Package contents summary
 * Requirements: 5.2
 */
export interface PackageContents {
  tradeLifecycleLogs: number;
  aiTraces: number;
  riskEvents: number;
  dataLineageRecords: number;
}

/**
 * Generated audit package
 * Requirements: 5.1, 5.2, 5.4, 5.6
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
 * Input for generating an audit package
 */
export interface AuditPackageInput {
  tenantId: string;
  scope: AuditPackageScope;
  format: ExportFormat;
}

/**
 * Audit Package Generator Service Interface
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export interface AuditPackageGenerator {
  generatePackage(
    tenantId: string,
    scope: AuditPackageScope,
    format: ExportFormat
  ): Promise<AuditPackage>;
  verifyIntegrity(packageId: string): Promise<boolean>;
  getDownloadUrl(packageId: string): Promise<string>;
}
