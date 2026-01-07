/**
 * RBAC (Role-Based Access Control) types for the AI-Assisted Crypto Trading System
 * Supports granular permission checking with inheritance and overrides
 * 
 * Requirements: 6.7, 6.9
 * - Match backend permission definitions
 * - Use roles from JWT claims
 */

import type { ResourceType, ActionType, Permission, Role } from './auth';

// Re-export for convenience
export type { ResourceType, ActionType, Permission, Role };

// Module types that can be controlled via RBAC
export type ModuleType =
  | 'strategy_management'
  | 'market_data'
  | 'ai_intelligence'
  | 'risk_controls'
  | 'reporting'
  | 'exchange_integration'
  | 'administration';

// Permission check input (legacy format for backward compatibility)
export interface PermissionCheck {
  resource: ResourceType;
  action: ActionType;
}

// Backend permission string format (e.g., 'read:strategies')
export type BackendPermission = string;

// RBAC Context value interface
export interface RBACContextValue {
  // Permission checking methods (supports both formats)
  hasPermission: (resource: ResourceType, action: ActionType) => boolean;
  hasAnyPermission: (permissions: PermissionCheck[]) => boolean;
  hasAllPermissions: (permissions: PermissionCheck[]) => boolean;
  
  // Backend permission string checking (matches backend format)
  hasBackendPermission: (permission: BackendPermission) => boolean;
  hasAnyBackendPermission: (permissions: BackendPermission[]) => boolean;
  hasAllBackendPermissions: (permissions: BackendPermission[]) => boolean;
  
  // Role checking
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasAllRoles: (roles: string[]) => boolean;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  
  // Module visibility
  getVisibleModules: () => ModuleType[];
  
  // Filtering helper
  filterByPermission: <T>(
    items: T[],
    resource: ResourceType,
    action: ActionType,
    getItemResource?: (item: T) => ResourceType
  ) => T[];
  
  // Current permissions (for debugging/display)
  permissions: Permission[];
  backendPermissions: BackendPermission[];
  roles: Role[];
  roleNames: string[];
  
  // Loading state
  isLoading: boolean;
}

// Module to required permissions mapping
export interface ModulePermissionMapping {
  module: ModuleType;
  requiredPermissions: PermissionCheck[];
  // Backend permission strings for the module
  backendPermissions?: BackendPermission[];
}

// Predefined system roles (matching backend ROLES)
export const SYSTEM_ROLES = {
  VIEWER: 'VIEWER',
  TRADER: 'TRADER',
  ANALYST: 'ANALYST',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type SystemRoleName = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];

// Permission audit entry for tracking changes
export interface PermissionChangeAudit {
  id: string;
  timestamp: Date;
  adminId: string;
  adminName: string;
  targetUserId?: string;
  targetRoleId?: string;
  changeType: 'role_assigned' | 'role_removed' | 'permission_added' | 'permission_removed' | 'role_created' | 'role_updated' | 'role_deleted';
  beforeValue: Permission[] | Role | null;
  afterValue: Permission[] | Role | null;
  requestTrackingId: string;
}

// Role management types
export interface CreateRoleInput {
  name: string;
  description: string;
  permissions: Omit<Permission, 'id'>[];
  organizationId?: string;
}

export interface UpdateRoleInput {
  id: string;
  name?: string;
  description?: string;
  permissions?: Omit<Permission, 'id'>[];
}

// Backend permission strings (matching backend/src/types/rbac.ts)
export const BACKEND_PERMISSIONS = {
  // Strategy permissions
  STRATEGIES_READ: 'read:strategies',
  STRATEGIES_WRITE: 'write:strategies',
  STRATEGIES_DELETE: 'delete:strategies',
  STRATEGIES_DEPLOY: 'deploy:strategies',
  
  // Position permissions
  POSITIONS_READ: 'read:positions',
  POSITIONS_WRITE: 'write:positions',
  
  // Order permissions
  ORDERS_READ: 'read:orders',
  ORDERS_EXECUTE: 'execute:orders',
  ORDERS_CANCEL: 'cancel:orders',
  
  // Report permissions
  REPORTS_READ: 'read:reports',
  REPORTS_EXPORT: 'export:reports',
  REPORTS_CREATE: 'create:reports',
  
  // Market data permissions
  MARKET_DATA_READ: 'read:market-data',
  MARKET_DATA_STREAM: 'stream:market-data',
  
  // AI analysis permissions
  AI_ANALYSIS_READ: 'read:ai-analysis',
  AI_ANALYSIS_EXECUTE: 'execute:ai-analysis',
  
  // Audit permissions
  AUDIT_LOGS_READ: 'read:audit-logs',
  AUDIT_LOGS_EXPORT: 'export:audit-logs',
  
  // User management permissions
  USERS_READ: 'read:users',
  USERS_MANAGE: 'manage:users',
  USERS_CREATE: 'create:users',
  USERS_DELETE: 'delete:users',
  
  // Role management permissions
  ROLES_READ: 'read:roles',
  ROLES_MANAGE: 'manage:roles',
  ROLES_ASSIGN: 'assign:roles',
  
  // Settings permissions
  SETTINGS_READ: 'read:settings',
  SETTINGS_MANAGE: 'manage:settings',
  
  // Exchange permissions
  EXCHANGE_READ: 'read:exchange',
  EXCHANGE_MANAGE: 'manage:exchange',
  EXCHANGE_CONNECT: 'connect:exchange',
  
  // Risk management permissions
  RISK_READ: 'read:risk',
  RISK_MANAGE: 'manage:risk',
  
  // Kill switch permissions
  KILL_SWITCH_READ: 'read:kill-switch',
  KILL_SWITCH_ACTIVATE: 'activate:kill-switch',
  
  // Tenant management (SUPER_ADMIN only)
  TENANTS_READ: 'read:tenants',
  TENANTS_MANAGE: 'manage:tenants',
  TENANTS_CREATE: 'create:tenants',
  
  // Wildcard permission (SUPER_ADMIN)
  ALL: '*',
} as const;

// Role to backend permissions mapping (matching backend ROLE_PERMISSIONS)
export const ROLE_BACKEND_PERMISSIONS: Record<SystemRoleName, BackendPermission[]> = {
  [SYSTEM_ROLES.VIEWER]: [
    BACKEND_PERMISSIONS.STRATEGIES_READ,
    BACKEND_PERMISSIONS.POSITIONS_READ,
    BACKEND_PERMISSIONS.REPORTS_READ,
    BACKEND_PERMISSIONS.ORDERS_READ,
  ],
  [SYSTEM_ROLES.TRADER]: [
    BACKEND_PERMISSIONS.STRATEGIES_READ,
    BACKEND_PERMISSIONS.POSITIONS_READ,
    BACKEND_PERMISSIONS.REPORTS_READ,
    BACKEND_PERMISSIONS.ORDERS_READ,
    BACKEND_PERMISSIONS.STRATEGIES_WRITE,
    BACKEND_PERMISSIONS.STRATEGIES_DELETE,
    BACKEND_PERMISSIONS.STRATEGIES_DEPLOY,
    BACKEND_PERMISSIONS.ORDERS_EXECUTE,
    BACKEND_PERMISSIONS.ORDERS_CANCEL,
    BACKEND_PERMISSIONS.POSITIONS_WRITE,
    BACKEND_PERMISSIONS.MARKET_DATA_READ,
    BACKEND_PERMISSIONS.MARKET_DATA_STREAM,
    BACKEND_PERMISSIONS.EXCHANGE_READ,
    BACKEND_PERMISSIONS.RISK_READ,
    BACKEND_PERMISSIONS.KILL_SWITCH_READ,
  ],
  [SYSTEM_ROLES.ANALYST]: [
    BACKEND_PERMISSIONS.STRATEGIES_READ,
    BACKEND_PERMISSIONS.POSITIONS_READ,
    BACKEND_PERMISSIONS.REPORTS_READ,
    BACKEND_PERMISSIONS.ORDERS_READ,
    BACKEND_PERMISSIONS.AI_ANALYSIS_READ,
    BACKEND_PERMISSIONS.AI_ANALYSIS_EXECUTE,
    BACKEND_PERMISSIONS.AUDIT_LOGS_READ,
    BACKEND_PERMISSIONS.AUDIT_LOGS_EXPORT,
    BACKEND_PERMISSIONS.REPORTS_EXPORT,
    BACKEND_PERMISSIONS.REPORTS_CREATE,
    BACKEND_PERMISSIONS.MARKET_DATA_READ,
    BACKEND_PERMISSIONS.RISK_READ,
  ],
  [SYSTEM_ROLES.ADMIN]: [
    // All TRADER permissions
    BACKEND_PERMISSIONS.STRATEGIES_READ,
    BACKEND_PERMISSIONS.POSITIONS_READ,
    BACKEND_PERMISSIONS.REPORTS_READ,
    BACKEND_PERMISSIONS.ORDERS_READ,
    BACKEND_PERMISSIONS.STRATEGIES_WRITE,
    BACKEND_PERMISSIONS.STRATEGIES_DELETE,
    BACKEND_PERMISSIONS.STRATEGIES_DEPLOY,
    BACKEND_PERMISSIONS.ORDERS_EXECUTE,
    BACKEND_PERMISSIONS.ORDERS_CANCEL,
    BACKEND_PERMISSIONS.POSITIONS_WRITE,
    BACKEND_PERMISSIONS.MARKET_DATA_READ,
    BACKEND_PERMISSIONS.MARKET_DATA_STREAM,
    BACKEND_PERMISSIONS.EXCHANGE_READ,
    BACKEND_PERMISSIONS.RISK_READ,
    BACKEND_PERMISSIONS.KILL_SWITCH_READ,
    // All ANALYST permissions
    BACKEND_PERMISSIONS.AI_ANALYSIS_READ,
    BACKEND_PERMISSIONS.AI_ANALYSIS_EXECUTE,
    BACKEND_PERMISSIONS.AUDIT_LOGS_READ,
    BACKEND_PERMISSIONS.AUDIT_LOGS_EXPORT,
    BACKEND_PERMISSIONS.REPORTS_EXPORT,
    BACKEND_PERMISSIONS.REPORTS_CREATE,
    // Admin-specific permissions
    BACKEND_PERMISSIONS.USERS_READ,
    BACKEND_PERMISSIONS.USERS_MANAGE,
    BACKEND_PERMISSIONS.USERS_CREATE,
    BACKEND_PERMISSIONS.USERS_DELETE,
    BACKEND_PERMISSIONS.ROLES_READ,
    BACKEND_PERMISSIONS.ROLES_MANAGE,
    BACKEND_PERMISSIONS.ROLES_ASSIGN,
    BACKEND_PERMISSIONS.SETTINGS_READ,
    BACKEND_PERMISSIONS.SETTINGS_MANAGE,
    BACKEND_PERMISSIONS.EXCHANGE_MANAGE,
    BACKEND_PERMISSIONS.EXCHANGE_CONNECT,
    BACKEND_PERMISSIONS.RISK_MANAGE,
    BACKEND_PERMISSIONS.KILL_SWITCH_ACTIVATE,
  ],
  [SYSTEM_ROLES.SUPER_ADMIN]: [
    BACKEND_PERMISSIONS.ALL,
  ],
};

// Default permissions for each module (updated with backend permission strings)
export const MODULE_PERMISSION_MAP: ModulePermissionMapping[] = [
  {
    module: 'strategy_management',
    requiredPermissions: [{ resource: 'strategy', action: 'read' }],
    backendPermissions: [BACKEND_PERMISSIONS.STRATEGIES_READ],
  },
  {
    module: 'market_data',
    requiredPermissions: [{ resource: 'market_data', action: 'read' }],
    backendPermissions: [BACKEND_PERMISSIONS.MARKET_DATA_READ],
  },
  {
    module: 'ai_intelligence',
    requiredPermissions: [{ resource: 'ai_model', action: 'read' }],
    backendPermissions: [BACKEND_PERMISSIONS.AI_ANALYSIS_READ],
  },
  {
    module: 'risk_controls',
    requiredPermissions: [{ resource: 'risk_control', action: 'read' }],
    backendPermissions: [BACKEND_PERMISSIONS.RISK_READ],
  },
  {
    module: 'reporting',
    requiredPermissions: [{ resource: 'report', action: 'read' }],
    backendPermissions: [BACKEND_PERMISSIONS.REPORTS_READ],
  },
  {
    module: 'exchange_integration',
    requiredPermissions: [{ resource: 'exchange', action: 'read' }],
    backendPermissions: [BACKEND_PERMISSIONS.EXCHANGE_READ],
  },
  {
    module: 'administration',
    requiredPermissions: [
      { resource: 'user', action: 'read' },
      { resource: 'role', action: 'read' },
    ],
    backendPermissions: [BACKEND_PERMISSIONS.USERS_READ, BACKEND_PERMISSIONS.ROLES_READ],
  },
];
