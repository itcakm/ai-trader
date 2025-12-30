import { S3 } from 'aws-sdk';
import { AuditPackage, AuditPackageScope, ExportFormat, PackageContents } from '../types/audit-package';
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
 * S3 bucket for audit packages
 */
const AUDIT_BUCKET = process.env.AUDIT_BUCKET || 'audit-data';

/**
 * Default download URL expiration in seconds (1 hour)
 */
const DEFAULT_URL_EXPIRATION_SECONDS = 3600;

/**
 * Audit Package Repository - manages audit package persistence with S3 storage
 * 
 * Uses S3 with tenant-partitioned paths for package storage.
 * Packages are stored with tenant isolation and support secure download URLs.
 * 
 * Storage path format: audit/{tenantId}/packages/{year}/{month}/{packageId}.{format}
 * Metadata path: audit/{tenantId}/packages/{year}/{month}/{packageId}-metadata.json
 * 
 * Requirements: 5.6
 */
export const AuditPackageRepository = {
  /**
   * Generate S3 key for an audit package
   * Uses tenant-partitioned paths for isolation
   */
  generatePackageKey(tenantId: string, generatedAt: string, packageId: string, format: ExportFormat): string {
    const date = new Date(generatedAt);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const extension = format.toLowerCase();
    
    return `audit/${tenantId}/packages/${year}/${month}/${packageId}.${extension}`;
  },

  /**
   * Generate S3 key for package metadata
   */
  generateMetadataKey(tenantId: string, generatedAt: string, packageId: string): string {
    const date = new Date(generatedAt);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    
    return `audit/${tenantId}/packages/${year}/${month}/${packageId}-metadata.json`;
  },

  /**
   * Generate prefix for listing packages by tenant
   */
  generatePrefix(tenantId: string, year?: number, month?: number): string {
    let prefix = `audit/${tenantId}/packages/`;
    if (year !== undefined) {
      prefix += `${year}/`;
      if (month !== undefined) {
        prefix += `${String(month).padStart(2, '0')}/`;
      }
    }
    return prefix;
  },

  /**
   * Store an audit package in S3
   * 
   * Requirements: 5.6
   * 
   * @param packageData - The package content (Buffer or string)
   * @param metadata - The package metadata
   * @returns The stored audit package metadata
   */
  async putPackage(packageData: Buffer | string, metadata: AuditPackage): Promise<AuditPackage> {
    const packageKey = this.generatePackageKey(
      metadata.tenantId,
      metadata.generatedAt,
      metadata.packageId,
      metadata.format
    );
    const metadataKey = this.generateMetadataKey(
      metadata.tenantId,
      metadata.generatedAt,
      metadata.packageId
    );

    // Determine content type based on format
    const contentType = this.getContentType(metadata.format);

    // Store the package data
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: packageKey,
      Body: packageData,
      ContentType: contentType,
      ContentEncoding: metadata.compressed ? 'gzip' : undefined,
      Metadata: {
        'x-amz-meta-tenant-id': metadata.tenantId,
        'x-amz-meta-package-id': metadata.packageId,
        'x-amz-meta-format': metadata.format,
        'x-amz-meta-integrity-hash': metadata.integrityHash
      }
    }).promise();

    // Store the metadata separately for quick lookups
    await s3Client.putObject({
      Bucket: AUDIT_BUCKET,
      Key: metadataKey,
      Body: JSON.stringify(metadata),
      ContentType: 'application/json'
    }).promise();

    return metadata;
  },

  /**
   * Get content type for export format
   */
  getContentType(format: ExportFormat): string {
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
  },

  /**
   * Get package metadata by ID
   * 
   * @param tenantId - The tenant identifier
   * @param generatedAt - The package generation timestamp
   * @param packageId - The package identifier
   * @returns The package metadata, or null if not found
   */
  async getPackageMetadata(tenantId: string, generatedAt: string, packageId: string): Promise<AuditPackage | null> {
    const metadataKey = this.generateMetadataKey(tenantId, generatedAt, packageId);
    
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: metadataKey
      }).promise();

      if (!result.Body) {
        return null;
      }

      const metadata = JSON.parse(result.Body.toString()) as AuditPackage;
      
      // Defense in depth: verify tenant ownership
      if (metadata.tenantId !== tenantId) {
        throw new Error(`Tenant access denied: ${tenantId}`);
      }

      return metadata;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Find package metadata by ID across all dates
   * 
   * @param tenantId - The tenant identifier
   * @param packageId - The package identifier
   * @returns The package metadata, or null if not found
   */
  async findPackageById(tenantId: string, packageId: string): Promise<AuditPackage | null> {
    const prefix = this.generatePrefix(tenantId);
    
    let continuationToken: string | undefined;
    
    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: AUDIT_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key) continue;
          
          // Look for metadata files matching the packageId
          if (obj.Key.includes(`/${packageId}-metadata.json`)) {
            try {
              const getResult = await s3Client.getObject({
                Bucket: AUDIT_BUCKET,
                Key: obj.Key
              }).promise();

              if (getResult.Body) {
                const metadata = JSON.parse(getResult.Body.toString()) as AuditPackage;
                if (metadata.packageId === packageId && metadata.tenantId === tenantId) {
                  return metadata;
                }
              }
            } catch {
              continue;
            }
          }
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    return null;
  },

  /**
   * Get package data by ID
   * 
   * @param tenantId - The tenant identifier
   * @param generatedAt - The package generation timestamp
   * @param packageId - The package identifier
   * @param format - The export format
   * @returns The package data as Buffer, or null if not found
   */
  async getPackageData(
    tenantId: string,
    generatedAt: string,
    packageId: string,
    format: ExportFormat
  ): Promise<Buffer | null> {
    const packageKey = this.generatePackageKey(tenantId, generatedAt, packageId, format);
    
    try {
      const result = await s3Client.getObject({
        Bucket: AUDIT_BUCKET,
        Key: packageKey
      }).promise();

      if (!result.Body) {
        return null;
      }

      // Verify tenant ownership via metadata
      if (result.Metadata?.['x-amz-meta-tenant-id'] !== tenantId) {
        throw new Error(`Tenant access denied: ${tenantId}`);
      }

      return result.Body as Buffer;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Generate a pre-signed download URL for a package
   * 
   * Requirements: 5.6
   * 
   * @param tenantId - The tenant identifier
   * @param generatedAt - The package generation timestamp
   * @param packageId - The package identifier
   * @param format - The export format
   * @param expirationSeconds - URL expiration time in seconds (default 1 hour)
   * @returns Pre-signed download URL
   */
  async generateDownloadUrl(
    tenantId: string,
    generatedAt: string,
    packageId: string,
    format: ExportFormat,
    expirationSeconds: number = DEFAULT_URL_EXPIRATION_SECONDS
  ): Promise<string> {
    const packageKey = this.generatePackageKey(tenantId, generatedAt, packageId, format);
    
    const url = await s3Client.getSignedUrlPromise('getObject', {
      Bucket: AUDIT_BUCKET,
      Key: packageKey,
      Expires: expirationSeconds
    });

    return url;
  },

  /**
   * List packages for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @param limit - Maximum number of packages to return
   * @returns Array of package metadata
   */
  async listPackages(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number
  ): Promise<AuditPackage[]> {
    const packages: AuditPackage[] = [];
    const prefix = this.generatePrefix(tenantId);
    
    let continuationToken: string | undefined;
    
    do {
      const listResult = await s3Client.listObjectsV2({
        Bucket: AUDIT_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }).promise();

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (!obj.Key) continue;
          if (limit && packages.length >= limit) break;
          
          // Only process metadata files
          if (!obj.Key.endsWith('-metadata.json')) continue;
          
          // Filter by date range from key path
          if (startDate || endDate) {
            const keyParts = obj.Key.split('/');
            if (keyParts.length >= 5) {
              const packageDate = new Date(`${keyParts[3]}-${keyParts[4]}-01`);
              if (startDate && packageDate < startDate) continue;
              if (endDate && packageDate > endDate) continue;
            }
          }

          try {
            const getResult = await s3Client.getObject({
              Bucket: AUDIT_BUCKET,
              Key: obj.Key
            }).promise();

            if (getResult.Body) {
              const metadata = JSON.parse(getResult.Body.toString()) as AuditPackage;
              if (metadata.tenantId === tenantId) {
                packages.push(metadata);
              }
            }
          } catch {
            continue;
          }
        }
      }

      if (limit && packages.length >= limit) break;
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Sort by generation date (most recent first)
    return packages.sort((a, b) => 
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    );
  },

  /**
   * Check if a package exists
   * 
   * @param tenantId - The tenant identifier
   * @param generatedAt - The package generation timestamp
   * @param packageId - The package identifier
   * @returns True if the package exists
   */
  async packageExists(tenantId: string, generatedAt: string, packageId: string): Promise<boolean> {
    const metadataKey = this.generateMetadataKey(tenantId, generatedAt, packageId);
    
    try {
      await s3Client.headObject({
        Bucket: AUDIT_BUCKET,
        Key: metadataKey
      }).promise();
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'NotFound') {
        return false;
      }
      throw error;
    }
  },

  /**
   * Delete a package and its metadata
   * 
   * @param tenantId - The tenant identifier
   * @param generatedAt - The package generation timestamp
   * @param packageId - The package identifier
   * @param format - The export format
   */
  async deletePackage(
    tenantId: string,
    generatedAt: string,
    packageId: string,
    format: ExportFormat
  ): Promise<void> {
    const packageKey = this.generatePackageKey(tenantId, generatedAt, packageId, format);
    const metadataKey = this.generateMetadataKey(tenantId, generatedAt, packageId);

    await Promise.all([
      s3Client.deleteObject({
        Bucket: AUDIT_BUCKET,
        Key: packageKey
      }).promise(),
      s3Client.deleteObject({
        Bucket: AUDIT_BUCKET,
        Key: metadataKey
      }).promise()
    ]);
  },

  /**
   * Get the S3 bucket name (for testing)
   */
  getBucketName(): string {
    return AUDIT_BUCKET;
  },

  /**
   * Get the S3 client (for testing)
   */
  getS3Client(): S3 {
    return s3Client;
  }
};
