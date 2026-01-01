/**
 * RBAC (Role-Based Access Control) types for the AI-Assisted Crypto Trading System
 * Supports granular permission checking with inheritance and overrides
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

// Permission check input
export interface PermissionCheck {
  resource: ResourceType;
  action: ActionType;
}

// RBAC Context value interface
export interface RBACContextValue {
  // Permission checking methods
  hasPermission: (resource: ResourceType, action: ActionType) => boolean;
  hasAnyPermission: (permissions: PermissionCheck[]) => boolean;
  hasAllPermissions: (permissions: PermissionCheck[]) => boolean;
  
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
  roles: Role[];
  
  // Loading state
  isLoading: boolean;
}

// Module to required permissions mapping
export interface ModulePermissionMapping {
  module: ModuleType;
  requiredPermissions: PermissionCheck[];
}

// Predefined system roles
export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  TRADER: 'TRADER',
  ANALYST: 'ANALYST',
  VIEWER: 'VIEWER',
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

// Default permissions for each module
export const MODULE_PERMISSION_MAP: ModulePermissionMapping[] = [
  {
    module: 'strategy_management',
    requiredPermissions: [{ resource: 'strategy', action: 'read' }],
  },
  {
    module: 'market_data',
    requiredPermissions: [{ resource: 'market_data', action: 'read' }],
  },
  {
    module: 'ai_intelligence',
    requiredPermissions: [{ resource: 'ai_model', action: 'read' }],
  },
  {
    module: 'risk_controls',
    requiredPermissions: [{ resource: 'risk_control', action: 'read' }],
  },
  {
    module: 'reporting',
    requiredPermissions: [{ resource: 'report', action: 'read' }],
  },
  {
    module: 'exchange_integration',
    requiredPermissions: [{ resource: 'exchange', action: 'read' }],
  },
  {
    module: 'administration',
    requiredPermissions: [
      { resource: 'user', action: 'read' },
      { resource: 'role', action: 'read' },
    ],
  },
];
