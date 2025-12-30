import { S3 } from 'aws-sdk';
import { 
  ReportTemplate, 
  ReportSchedule,
  ComplianceReport 
} from '../types/compliance-report';
import { generateUUID } from '../utils/uuid';

/**
 * S3 client configuration
 */
const s3Config: S3.ClientConfiguration = {
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.S3_ENDPOINT && {
    endpoint: process.env.S3_ENDPOINT,
    s3ForcePathStyle: true
  })
};

const s3Client = new S3(s3Config);

/**
 * S3 bucket for compliance reports
 */
const COMPLIANCE_BUCKET = process.env.COMPLIANCE_BUCKET || 'compliance-reports';

/**
 * Report Template Repository - manages report template persistence with S3 storage
 * 
 * Templates are stored with versioning support, allowing retrieval of
 * specific versions and version history.
 * 
 * Storage path format: 
 * - Templates: templates/{templateId}/v{version}.json
 * - Schedules: schedules/{tenantId}/{scheduleId}.json
 * - Reports: reports/{tenantId}/{year}/{month}/{reportId}.json
 * 
 * Requirements: 6.1
 */
export const ReportTemplateRepository = {
  /**
   * Generate S3 key for a report template version
   * 
   * @param templateId - The template identifier
   * @param version - The version number
   * @returns S3 key path
   */
  generateTemplateKey(templateId: string, version: number): string {
    return `templates/${templateId}/v${version}.json`;
  },

  /**
   * Generate S3 prefix for listing all versions of a template
   * 
   * @param templateId - The template identifier
   * @returns S3 prefix path
   */
  generateTemplatePrefix(templateId: string): string {
    return `templates/${templateId}/`;
  },

  /**
   * Parse version number from S3 key
   * 
   * @param key - The S3 key
   * @returns Version number or null if not parseable
   */
  parseVersionFromKey(key: string): number | null {
    const match = key.match(/v(\d+)\.json$/);
    return match ? parseInt(match[1], 10) : null;
  },

  /**
   * Store a report template version in S3
   * 
   * Requirements: 6.1
   * 
   * @param template - The template to store
   */
  async putTemplate(template: ReportTemplate): Promise<void> {
    const key = this.generateTemplateKey(template.templateId, template.version);
    
    await s3Client.putObject({
      Bucket: COMPLIANCE_BUCKET,
      Key: key,
      Body: JSON.stringify(template, null, 2),
      ContentType: 'application/json'
    }).promise();
  },

  /**
   * Get a specific version of a template
   * 
   * Requirements: 6.1
   * 
   * @param templateId - The template identifier
   * @param version - The version number
   * @returns The template or null if not found
   */
  async getTemplateVersion(templateId: string, version: number): Promise<ReportTemplate | null> {
    const key = this.generateTemplateKey(templateId, version);
    
    try {
      const result = await s3Client.getObject({
        Bucket: COMPLIANCE_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      return JSON.parse(result.Body.toString()) as ReportTemplate;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get the latest version number for a template
   * 
   * @param templateId - The template identifier
   * @returns The latest version number, or 0 if no versions exist
   */
  async getLatestVersionNumber(templateId: string): Promise<number> {
    const prefix = this.generateTemplatePrefix(templateId);
    
    try {
      const listResult = await s3Client.listObjectsV2({
        Bucket: COMPLIANCE_BUCKET,
        Prefix: prefix
      }).promise();

      if (!listResult.Contents || listResult.Contents.length === 0) {
        return 0;
      }

      let maxVersion = 0;
      for (const obj of listResult.Contents) {
        if (obj.Key) {
          const version = this.parseVersionFromKey(obj.Key);
          if (version !== null && version > maxVersion) {
            maxVersion = version;
          }
        }
      }

      return maxVersion;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchBucket') {
        return 0;
      }
      throw error;
    }
  },

  /**
   * Get the latest version of a template
   * 
   * Requirements: 6.1
   * 
   * @param templateId - The template identifier
   * @returns The latest template version or null if not found
   */
  async getTemplate(templateId: string): Promise<ReportTemplate | null> {
    const latestVersion = await this.getLatestVersionNumber(templateId);
    if (latestVersion === 0) {
      return null;
    }
    return this.getTemplateVersion(templateId, latestVersion);
  },

  /**
   * List all templates (latest versions only)
   * 
   * @returns List of latest template versions
   */
  async listTemplates(): Promise<ReportTemplate[]> {
    try {
      const listResult = await s3Client.listObjectsV2({
        Bucket: COMPLIANCE_BUCKET,
        Prefix: 'templates/',
        Delimiter: '/'
      }).promise();

      if (!listResult.CommonPrefixes || listResult.CommonPrefixes.length === 0) {
        return [];
      }

      const templates: ReportTemplate[] = [];
      
      for (const prefix of listResult.CommonPrefixes) {
        if (prefix.Prefix) {
          const match = prefix.Prefix.match(/^templates\/([^/]+)\/$/);
          if (match) {
            const templateId = match[1];
            const template = await this.getTemplate(templateId);
            if (template) {
              templates.push(template);
            }
          }
        }
      }

      return templates;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }
  },

  /**
   * Check if a template exists
   * 
   * @param templateId - The template identifier
   * @returns True if the template exists
   */
  async templateExists(templateId: string): Promise<boolean> {
    const latestVersion = await this.getLatestVersionNumber(templateId);
    return latestVersion > 0;
  },

  // ============ Schedule Management ============

  /**
   * Generate S3 key for a report schedule
   * 
   * @param tenantId - The tenant identifier
   * @param scheduleId - The schedule identifier
   * @returns S3 key path
   */
  generateScheduleKey(tenantId: string, scheduleId: string): string {
    return `schedules/${tenantId}/${scheduleId}.json`;
  },

  /**
   * Store a report schedule
   * 
   * Requirements: 6.3
   * 
   * @param schedule - The schedule to store
   */
  async putSchedule(schedule: ReportSchedule): Promise<void> {
    const key = this.generateScheduleKey(schedule.tenantId, schedule.scheduleId);
    
    await s3Client.putObject({
      Bucket: COMPLIANCE_BUCKET,
      Key: key,
      Body: JSON.stringify(schedule, null, 2),
      ContentType: 'application/json'
    }).promise();
  },

  /**
   * Get a report schedule
   * 
   * @param tenantId - The tenant identifier
   * @param scheduleId - The schedule identifier
   * @returns The schedule or null if not found
   */
  async getSchedule(tenantId: string, scheduleId: string): Promise<ReportSchedule | null> {
    const key = this.generateScheduleKey(tenantId, scheduleId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: COMPLIANCE_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const schedule = JSON.parse(result.Body.toString()) as ReportSchedule;
      
      // Verify tenant ownership
      if (schedule.tenantId !== tenantId) {
        return null;
      }

      return schedule;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * List schedules for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns List of schedules
   */
  async listSchedules(tenantId: string): Promise<ReportSchedule[]> {
    const prefix = `schedules/${tenantId}/`;
    const schedules: ReportSchedule[] = [];
    
    try {
      const listResult = await s3Client.listObjectsV2({
        Bucket: COMPLIANCE_BUCKET,
        Prefix: prefix
      }).promise();

      if (!listResult.Contents) {
        return [];
      }

      for (const obj of listResult.Contents) {
        if (!obj.Key) continue;
        
        try {
          const result = await s3Client.getObject({
            Bucket: COMPLIANCE_BUCKET,
            Key: obj.Key
          }).promise();

          if (result.Body) {
            const schedule = JSON.parse(result.Body.toString()) as ReportSchedule;
            if (schedule.tenantId === tenantId) {
              schedules.push(schedule);
            }
          }
        } catch {
          continue;
        }
      }

      return schedules;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }
  },

  // ============ Report Storage ============

  /**
   * Generate S3 key for a compliance report
   * 
   * @param tenantId - The tenant identifier
   * @param generatedAt - The report generation timestamp
   * @param reportId - The report identifier
   * @returns S3 key path
   */
  generateReportKey(tenantId: string, generatedAt: string, reportId: string): string {
    const date = new Date(generatedAt);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `reports/${tenantId}/${year}/${month}/${reportId}.json`;
  },

  /**
   * Store a compliance report
   * 
   * Requirements: 6.5
   * 
   * @param report - The report to store
   */
  async putReport(report: ComplianceReport): Promise<void> {
    const key = this.generateReportKey(report.tenantId, report.generatedAt, report.reportId);
    
    await s3Client.putObject({
      Bucket: COMPLIANCE_BUCKET,
      Key: key,
      Body: JSON.stringify(report, null, 2),
      ContentType: 'application/json'
    }).promise();
  },

  /**
   * Get a compliance report
   * 
   * @param tenantId - The tenant identifier
   * @param reportId - The report identifier
   * @param generatedAt - The report generation timestamp
   * @returns The report or null if not found
   */
  async getReport(tenantId: string, reportId: string, generatedAt: string): Promise<ComplianceReport | null> {
    const key = this.generateReportKey(tenantId, generatedAt, reportId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: COMPLIANCE_BUCKET,
        Key: key
      }).promise();

      if (!result.Body) {
        return null;
      }

      const report = JSON.parse(result.Body.toString()) as ComplianceReport;
      
      // Verify tenant ownership
      if (report.tenantId !== tenantId) {
        return null;
      }

      return report;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * List reports for a tenant with optional template filter
   * 
   * Requirements: 6.5
   * 
   * @param tenantId - The tenant identifier
   * @param templateId - Optional template filter
   * @param limit - Maximum number of reports to return
   * @returns List of compliance reports
   */
  async listReports(tenantId: string, templateId?: string, limit?: number): Promise<ComplianceReport[]> {
    const prefix = `reports/${tenantId}/`;
    const reports: ComplianceReport[] = [];
    const maxReports = limit ?? 100;
    
    let continuationToken: string | undefined;
    
    try {
      do {
        const listResult = await s3Client.listObjectsV2({
          Bucket: COMPLIANCE_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken
        }).promise();

        if (!listResult.Contents) {
          break;
        }

        for (const obj of listResult.Contents) {
          if (!obj.Key || reports.length >= maxReports) break;
          
          try {
            const result = await s3Client.getObject({
              Bucket: COMPLIANCE_BUCKET,
              Key: obj.Key
            }).promise();

            if (result.Body) {
              const report = JSON.parse(result.Body.toString()) as ComplianceReport;
              
              // Verify tenant ownership and apply template filter
              if (report.tenantId === tenantId) {
                if (!templateId || report.templateId === templateId) {
                  reports.push(report);
                }
              }
            }
          } catch {
            continue;
          }
        }

        if (reports.length >= maxReports) break;
        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);

      // Sort by generatedAt descending (most recent first)
      return reports.sort((a, b) => 
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
      );
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }
  },

  /**
   * Generate a pre-signed URL for report download
   * 
   * @param tenantId - The tenant identifier
   * @param reportId - The report identifier
   * @param generatedAt - The report generation timestamp
   * @param expiresInSeconds - URL expiration time in seconds (default 3600)
   * @returns Pre-signed download URL
   */
  async getReportDownloadUrl(
    tenantId: string, 
    reportId: string, 
    generatedAt: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    const key = this.generateReportKey(tenantId, generatedAt, reportId);
    
    return s3Client.getSignedUrlPromise('getObject', {
      Bucket: COMPLIANCE_BUCKET,
      Key: key,
      Expires: expiresInSeconds
    });
  },

  /**
   * Get the S3 bucket name (for testing)
   */
  getBucketName(): string {
    return COMPLIANCE_BUCKET;
  },

  /**
   * Get the S3 client (for testing)
   */
  getS3Client(): S3 {
    return s3Client;
  }
};
