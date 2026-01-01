import {
  AuditRole,
  ROLE_PERMISSIONS,
  AccessLogEntry,
  AccessLogInput,
  MaskingConfig,
  MaskType
} from '../types/audit-access';
import { AccessLogRepository } from '../repositories/access-log';
import * as crypto from 'crypto';

/**
 * Default masking configurations for sensitive fields
 * Requirements: 9.5
 */
export const DEFAULT_MASKING_CONFIGS: MaskingConfig[] = [
  {
    fieldPath: 'ipAddress',
    maskType: 'PARTIAL',
    applicableRoles: ['VIEWER']
  },
  {
    fieldPath: 'userAgent',
    maskType: 'FULL',
    applicableRoles: ['VIEWER']
  },
  {
    fieldPath: 'apiKey',
    maskType: 'HASH',
    applicableRoles: ['VIEWER', 'ANALYST']
  },
  {
    fieldPath: 'credentials',
    maskType: 'FULL',
    applicableRoles: ['VIEWER', 'ANALYST']
  },
  {
    fieldPath: 'password',
    maskType: 'FULL',
    applicableRoles: ['VIEWER', 'ANALYST', 'ADMIN']
  },
  {
    fieldPath: 'secret',
    maskType: 'FULL',
    applicableRoles: ['VIEWER', 'ANALYST']
  }
];

/**
 * In-memory user role store (in production, this would be backed by a database)
 * Maps tenantId:userId to role
 */
const userRoleStore: Map<string, AuditRole> = new Map();

/**
 * Custom masking configurations per tenant
 */
const tenantMaskingConfigs: Map<string, MaskingConfig[]> = new Map();

/**
 * Get the key for user role lookup
 */
function getUserRoleKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

/**
 * Check if a role has a specific permission
 * Requirements: 9.3
 */
export function roleHasPermission(role: AuditRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes(permission);
}

/**
 * Get all permissions for a role
 * Requirements: 9.3
 */
export function getRolePermissions(role: AuditRole): string[] {
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * Map action to required permission
 */
export function getRequiredPermission(action: string): string {
  const actionPermissionMap: Record<string, string> = {
    // Read operations
    'VIEW': 'READ',
    'GET': 'READ',
    'LIST': 'READ',
    'READ': 'READ',
    
    // Query operations
    'QUERY': 'QUERY',
    'SEARCH': 'QUERY',
    'AGGREGATE': 'QUERY',
    
    // Export operations
    'EXPORT': 'EXPORT',
    'DOWNLOAD': 'EXPORT',
    'GENERATE_PACKAGE': 'EXPORT',
    'GENERATE_REPORT': 'EXPORT',
    
    // Configuration operations
    'CONFIGURE': 'CONFIGURE',
    'UPDATE': 'CONFIGURE',
    'CREATE': 'CONFIGURE',
    'SET_POLICY': 'CONFIGURE',
    
    // Delete operations
    'DELETE': 'DELETE',
    'REMOVE': 'DELETE',
    'ARCHIVE': 'DELETE'
  };

  return actionPermissionMap[action.toUpperCase()] || 'READ';
}

/**
 * Apply a specific mask type to a value
 * Requirements: 9.5
 */
export function applyMask(value: unknown, maskType: MaskType): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const stringValue = String(value);

  switch (maskType) {
    case 'FULL':
      return '********';
    
    case 'PARTIAL':
      if (stringValue.length <= 4) {
        return '****';
      }
      // Show first 2 and last 2 characters
      return `${stringValue.slice(0, 2)}${'*'.repeat(stringValue.length - 4)}${stringValue.slice(-2)}`;
    
    case 'HASH':
      return crypto.createHash('sha256').update(stringValue).digest('hex').slice(0, 16);
    
    default:
      return '********';
  }
}

/**
 * Check if a field path should be masked for a given role
 * Requirements: 9.5
 */
export function shouldMaskField(
  fieldPath: string,
  role: AuditRole,
  maskingConfigs: MaskingConfig[]
): MaskingConfig | null {
  // Extract the field name (last part of the path)
  const fieldName = fieldPath.includes('.') 
    ? fieldPath.split('.').pop()! 
    : fieldPath;
  
  for (const config of maskingConfigs) {
    // Match either the full path or just the field name
    const configMatches = config.fieldPath === fieldPath || 
                          config.fieldPath === fieldName;
    if (configMatches && config.applicableRoles.includes(role)) {
      return config;
    }
  }
  return null;
}

/**
 * Recursively apply masking to an object
 * Requirements: 9.5
 */
function applyMaskingToObject<T>(
  data: T,
  role: AuditRole,
  maskingConfigs: MaskingConfig[],
  currentPath: string = ''
): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item, index) =>
      applyMaskingToObject(item, role, maskingConfigs, `${currentPath}[${index}]`)
    ) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;
    
    // Check if this field should be masked
    const maskConfig = shouldMaskField(fieldPath, role, maskingConfigs);
    
    if (maskConfig && typeof value !== 'object') {
      // Only mask primitive values, not objects
      result[key] = applyMask(value, maskConfig.maskType);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively process nested objects
      result[key] = applyMaskingToObject(value, role, maskingConfigs, fieldPath);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item, index) =>
        typeof item === 'object' && item !== null
          ? applyMaskingToObject(item, role, maskingConfigs, `${fieldPath}[${index}]`)
          : item
      );
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Access Control Manager Service
 * 
 * Manages tenant isolation, role-based access control, access logging, and data masking.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export const AuditAccessControlService = {
  /**
   * Verify that a user has access to perform an action on a resource
   * 
   * Requirements: 9.1, 9.2
   * 
   * @param tenantId - The tenant ID of the resource
   * @param userId - The user attempting access
   * @param resourceType - The type of resource being accessed
   * @param action - The action being performed
   * @returns True if access is allowed, false otherwise
   */
  async verifyAccess(
    tenantId: string,
    userId: string,
    resourceType: string,
    action: string
  ): Promise<boolean> {
    // Get user's role
    const role = await this.getUserRole(tenantId, userId);
    
    // Get required permission for the action
    const requiredPermission = getRequiredPermission(action);
    
    // Check if role has the required permission
    const hasPermission = roleHasPermission(role, requiredPermission);
    
    // Log the access attempt
    await this.logAccess({
      tenantId,
      userId,
      action,
      resourceType,
      success: hasPermission,
      failureReason: hasPermission ? undefined : `Insufficient permissions: ${role} role does not have ${requiredPermission} permission`
    });
    
    return hasPermission;
  },

  /**
   * Get a user's role for audit access
   * 
   * Requirements: 9.3
   * 
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   * @returns The user's audit role
   */
  async getUserRole(tenantId: string, userId: string): Promise<AuditRole> {
    const key = getUserRoleKey(tenantId, userId);
    const role = userRoleStore.get(key);
    
    // Default to VIEWER if no role is set
    return role || 'VIEWER';
  },

  /**
   * Set a user's role for audit access
   * 
   * Requirements: 9.3
   * 
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   * @param role - The role to assign
   */
  async setUserRole(tenantId: string, userId: string, role: AuditRole): Promise<void> {
    const key = getUserRoleKey(tenantId, userId);
    userRoleStore.set(key, role);
  },

  /**
   * Remove a user's role (reverts to default VIEWER)
   * 
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   */
  async removeUserRole(tenantId: string, userId: string): Promise<void> {
    const key = getUserRoleKey(tenantId, userId);
    userRoleStore.delete(key);
  },

  /**
   * Log an access event
   * 
   * Requirements: 9.4
   * 
   * @param input - The access log input
   * @returns The created access log entry
   */
  async logAccess(input: AccessLogInput): Promise<AccessLogEntry> {
    return AccessLogRepository.putAccessLog(input);
  },

  /**
   * Apply data masking based on user role
   * 
   * Requirements: 9.5
   * 
   * @param data - The data to mask
   * @param userRole - The user's role
   * @returns The masked data
   */
  applyMasking<T>(data: T, userRole: AuditRole): T {
    // ADMIN role sees everything unmasked
    if (userRole === 'ADMIN') {
      return data;
    }

    // Get masking configs (tenant-specific or default)
    const maskingConfigs = DEFAULT_MASKING_CONFIGS;

    return applyMaskingToObject(data, userRole, maskingConfigs);
  },

  /**
   * Apply data masking with tenant-specific configurations
   * 
   * Requirements: 9.5
   * 
   * @param data - The data to mask
   * @param userRole - The user's role
   * @param tenantId - The tenant ID for tenant-specific configs
   * @returns The masked data
   */
  applyMaskingForTenant<T>(data: T, userRole: AuditRole, tenantId: string): T {
    // ADMIN role sees everything unmasked
    if (userRole === 'ADMIN') {
      return data;
    }

    // Get tenant-specific masking configs or fall back to defaults
    const maskingConfigs = tenantMaskingConfigs.get(tenantId) || DEFAULT_MASKING_CONFIGS;

    return applyMaskingToObject(data, userRole, maskingConfigs);
  },

  /**
   * Set tenant-specific masking configurations
   * 
   * @param tenantId - The tenant ID
   * @param configs - The masking configurations
   */
  setTenantMaskingConfigs(tenantId: string, configs: MaskingConfig[]): void {
    tenantMaskingConfigs.set(tenantId, configs);
  },

  /**
   * Get tenant-specific masking configurations
   * 
   * @param tenantId - The tenant ID
   * @returns The masking configurations or undefined if not set
   */
  getTenantMaskingConfigs(tenantId: string): MaskingConfig[] | undefined {
    return tenantMaskingConfigs.get(tenantId);
  },

  /**
   * Verify tenant isolation - ensure a user can only access their own tenant's data
   * 
   * Requirements: 9.1
   * 
   * @param requestingTenantId - The tenant ID of the requesting user
   * @param resourceTenantId - The tenant ID of the resource being accessed
   * @returns True if access is allowed (same tenant), false otherwise
   */
  verifyTenantIsolation(requestingTenantId: string, resourceTenantId: string): boolean {
    return requestingTenantId === resourceTenantId;
  },

  /**
   * Get access logs for a tenant
   * 
   * Requirements: 9.4
   * 
   * @param tenantId - The tenant ID
   * @param filters - Optional filters
   * @returns List of access log entries
   */
  async getAccessLogs(
    tenantId: string,
    filters?: {
      startDate?: string;
      endDate?: string;
      userId?: string;
      action?: string;
      resourceType?: string;
      success?: boolean;
      limit?: number;
    }
  ): Promise<AccessLogEntry[]> {
    return AccessLogRepository.listAccessLogs(tenantId, filters);
  },

  /**
   * Get failed access attempts for a tenant
   * 
   * Requirements: 9.4
   * 
   * @param tenantId - The tenant ID
   * @param limit - Maximum number of entries to return
   * @returns List of failed access log entries
   */
  async getFailedAccessAttempts(
    tenantId: string,
    limit: number = 100
  ): Promise<AccessLogEntry[]> {
    return AccessLogRepository.getFailedAccessAttempts(tenantId, limit);
  },

  /**
   * Get access logs for a specific user
   * 
   * Requirements: 9.4
   * 
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   * @param limit - Maximum number of entries to return
   * @returns List of access log entries for the user
   */
  async getAccessLogsByUser(
    tenantId: string,
    userId: string,
    limit: number = 100
  ): Promise<AccessLogEntry[]> {
    return AccessLogRepository.getAccessLogsByUser(tenantId, userId, limit);
  },

  /**
   * Clear all user roles (for testing purposes)
   */
  clearAllRoles(): void {
    userRoleStore.clear();
  },

  /**
   * Clear all tenant masking configs (for testing purposes)
   */
  clearAllMaskingConfigs(): void {
    tenantMaskingConfigs.clear();
  }
};
