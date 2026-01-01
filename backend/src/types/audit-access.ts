/**
 * Audit Access Control Types
 * Requirements: 9.3, 9.4, 9.5
 */

/**
 * User roles for audit access
 * Requirements: 9.3
 */
export type AuditRole = 'VIEWER' | 'ANALYST' | 'ADMIN';

/**
 * Role permissions mapping
 * Requirements: 9.3
 */
export const ROLE_PERMISSIONS: Record<AuditRole, string[]> = {
  VIEWER: ['READ'],
  ANALYST: ['READ', 'QUERY', 'EXPORT'],
  ADMIN: ['READ', 'QUERY', 'EXPORT', 'CONFIGURE', 'DELETE']
};

/**
 * Access log entry
 * Requirements: 9.4
 */
export interface AccessLogEntry {
  logId: string;
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
}

/**
 * Input for creating an access log entry
 */
export interface AccessLogInput {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
}

/**
 * Mask types for sensitive data
 * Requirements: 9.5
 */
export type MaskType = 'FULL' | 'PARTIAL' | 'HASH';

/**
 * Data masking configuration
 * Requirements: 9.5
 */
export interface MaskingConfig {
  fieldPath: string;
  maskType: MaskType;
  applicableRoles: AuditRole[];
}

/**
 * User audit permissions
 */
export interface UserAuditPermissions {
  tenantId: string;
  userId: string;
  role: AuditRole;
  permissions: string[];
}

/**
 * Access Control Manager Service Interface
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */
export interface AccessControlManager {
  verifyAccess(
    tenantId: string,
    userId: string,
    resourceType: string,
    action: string
  ): Promise<boolean>;
  getUserRole(tenantId: string, userId: string): Promise<AuditRole>;
  logAccess(entry: AccessLogInput): Promise<AccessLogEntry>;
  applyMasking<T>(data: T, userRole: AuditRole): T;
}
