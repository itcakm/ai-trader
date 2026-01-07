/**
 * Role-Based Access Control (RBAC) type definitions.
 * Defines roles, permissions, and their mappings for the authentication system.
 * 
 * Requirements: 6.1-6.6
 * - VIEWER: read-only access to strategies, positions, and reports
 * - TRADER: VIEWER + execute orders and manage strategies
 * - ANALYST: VIEWER + access to AI analysis and audit logs
 * - ADMIN: full access within tenant including user management
 * - SUPER_ADMIN: full access across all tenants (platform support)
 */

// ============================================================================
// Role Definitions
// ============================================================================

/**
 * Predefined system roles.
 * Each role has a specific set of permissions based on responsibilities.
 */
export const ROLES = {
  /** Read-only access to strategies, positions, and reports */
  VIEWER: 'VIEWER',
  /** VIEWER permissions plus execute orders and manage strategies */
  TRADER: 'TRADER',
  /** VIEWER permissions plus access to AI analysis and audit logs */
  ANALYST: 'ANALYST',
  /** Full access within their tenant including user management */
  ADMIN: 'ADMIN',
  /** Full access across all tenants (platform support) */
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Array of all valid roles for validation purposes.
 */
export const ALL_ROLES: Role[] = Object.values(ROLES);

/**
 * Check if a string is a valid role.
 */
export function isValidRole(role: string): role is Role {
  return ALL_ROLES.includes(role as Role);
}

// ============================================================================
// Permission Definitions
// ============================================================================

/**
 * Permission strings organized by resource/action.
 * Format: action:resource or action:resource:subresource
 */
export const PERMISSIONS = {
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

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Array of all valid permissions for validation purposes.
 */
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/**
 * Check if a string is a valid permission.
 */
export function isValidPermission(permission: string): permission is Permission {
  return ALL_PERMISSIONS.includes(permission as Permission) || permission === '*';
}

// ============================================================================
// Role-Permission Mappings
// ============================================================================

/**
 * VIEWER role permissions.
 * Read-only access to strategies, positions, and reports.
 */
const VIEWER_PERMISSIONS: Permission[] = [
  PERMISSIONS.STRATEGIES_READ,
  PERMISSIONS.POSITIONS_READ,
  PERMISSIONS.REPORTS_READ,
  PERMISSIONS.ORDERS_READ,
];

/**
 * TRADER role permissions.
 * VIEWER permissions plus execute orders and manage strategies.
 */
const TRADER_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  PERMISSIONS.STRATEGIES_WRITE,
  PERMISSIONS.STRATEGIES_DELETE,
  PERMISSIONS.STRATEGIES_DEPLOY,
  PERMISSIONS.ORDERS_EXECUTE,
  PERMISSIONS.ORDERS_CANCEL,
  PERMISSIONS.POSITIONS_WRITE,
  PERMISSIONS.MARKET_DATA_READ,
  PERMISSIONS.MARKET_DATA_STREAM,
  PERMISSIONS.EXCHANGE_READ,
  PERMISSIONS.RISK_READ,
  PERMISSIONS.KILL_SWITCH_READ,
];

/**
 * ANALYST role permissions.
 * VIEWER permissions plus access to AI analysis and audit logs.
 */
const ANALYST_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  PERMISSIONS.AI_ANALYSIS_READ,
  PERMISSIONS.AI_ANALYSIS_EXECUTE,
  PERMISSIONS.AUDIT_LOGS_READ,
  PERMISSIONS.AUDIT_LOGS_EXPORT,
  PERMISSIONS.REPORTS_EXPORT,
  PERMISSIONS.REPORTS_CREATE,
  PERMISSIONS.MARKET_DATA_READ,
  PERMISSIONS.RISK_READ,
];

/**
 * ADMIN role permissions.
 * Full access within their tenant including user management.
 */
const ADMIN_PERMISSIONS: Permission[] = [
  ...TRADER_PERMISSIONS,
  ...ANALYST_PERMISSIONS,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.USERS_CREATE,
  PERMISSIONS.USERS_DELETE,
  PERMISSIONS.ROLES_READ,
  PERMISSIONS.ROLES_MANAGE,
  PERMISSIONS.ROLES_ASSIGN,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.EXCHANGE_MANAGE,
  PERMISSIONS.EXCHANGE_CONNECT,
  PERMISSIONS.RISK_MANAGE,
  PERMISSIONS.KILL_SWITCH_ACTIVATE,
];

/**
 * SUPER_ADMIN role permissions.
 * Full access across all tenants (platform support).
 * Uses wildcard permission for unrestricted access.
 */
const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  PERMISSIONS.ALL,
];

/**
 * Complete mapping of roles to their permissions.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.VIEWER]: VIEWER_PERMISSIONS,
  [ROLES.TRADER]: TRADER_PERMISSIONS,
  [ROLES.ANALYST]: ANALYST_PERMISSIONS,
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.SUPER_ADMIN]: SUPER_ADMIN_PERMISSIONS,
};

// ============================================================================
// Role Hierarchy
// ============================================================================

/**
 * Role hierarchy for inheritance checking.
 * Higher roles inherit permissions from lower roles.
 */
export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  [ROLES.VIEWER]: [],
  [ROLES.TRADER]: [ROLES.VIEWER],
  [ROLES.ANALYST]: [ROLES.VIEWER],
  [ROLES.ADMIN]: [ROLES.VIEWER, ROLES.TRADER, ROLES.ANALYST],
  [ROLES.SUPER_ADMIN]: [ROLES.VIEWER, ROLES.TRADER, ROLES.ANALYST, ROLES.ADMIN],
};

/**
 * Get all inherited roles for a given role.
 */
export function getInheritedRoles(role: Role): Role[] {
  return ROLE_HIERARCHY[role] || [];
}

/**
 * Get all permissions for a role including inherited permissions.
 */
export function getAllPermissionsForRole(role: Role): Permission[] {
  const directPermissions = ROLE_PERMISSIONS[role] || [];
  
  // If role has wildcard, return just that
  if (directPermissions.includes(PERMISSIONS.ALL)) {
    return [PERMISSIONS.ALL];
  }
  
  // Collect inherited permissions
  const inheritedRoles = getInheritedRoles(role);
  const allPermissions = new Set<Permission>(directPermissions);
  
  for (const inheritedRole of inheritedRoles) {
    const inheritedPermissions = ROLE_PERMISSIONS[inheritedRole] || [];
    for (const permission of inheritedPermissions) {
      allPermissions.add(permission);
    }
  }
  
  return Array.from(allPermissions);
}

// ============================================================================
// Resource-Based Permission Groups
// ============================================================================

/**
 * Permission groups organized by resource for easier management.
 */
export const PERMISSION_GROUPS = {
  strategies: [
    PERMISSIONS.STRATEGIES_READ,
    PERMISSIONS.STRATEGIES_WRITE,
    PERMISSIONS.STRATEGIES_DELETE,
    PERMISSIONS.STRATEGIES_DEPLOY,
  ],
  orders: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_EXECUTE,
    PERMISSIONS.ORDERS_CANCEL,
  ],
  positions: [
    PERMISSIONS.POSITIONS_READ,
    PERMISSIONS.POSITIONS_WRITE,
  ],
  reports: [
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.REPORTS_CREATE,
  ],
  marketData: [
    PERMISSIONS.MARKET_DATA_READ,
    PERMISSIONS.MARKET_DATA_STREAM,
  ],
  aiAnalysis: [
    PERMISSIONS.AI_ANALYSIS_READ,
    PERMISSIONS.AI_ANALYSIS_EXECUTE,
  ],
  audit: [
    PERMISSIONS.AUDIT_LOGS_READ,
    PERMISSIONS.AUDIT_LOGS_EXPORT,
  ],
  users: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_DELETE,
  ],
  roles: [
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ROLES_MANAGE,
    PERMISSIONS.ROLES_ASSIGN,
  ],
  settings: [
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.SETTINGS_MANAGE,
  ],
  exchange: [
    PERMISSIONS.EXCHANGE_READ,
    PERMISSIONS.EXCHANGE_MANAGE,
    PERMISSIONS.EXCHANGE_CONNECT,
  ],
  risk: [
    PERMISSIONS.RISK_READ,
    PERMISSIONS.RISK_MANAGE,
  ],
  killSwitch: [
    PERMISSIONS.KILL_SWITCH_READ,
    PERMISSIONS.KILL_SWITCH_ACTIVATE,
  ],
  tenants: [
    PERMISSIONS.TENANTS_READ,
    PERMISSIONS.TENANTS_MANAGE,
    PERMISSIONS.TENANTS_CREATE,
  ],
} as const;

// ============================================================================
// Role Display Information
// ============================================================================

/**
 * Human-readable role information for UI display.
 */
export interface RoleInfo {
  name: Role;
  displayName: string;
  description: string;
  level: number; // Higher number = more permissions
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  [ROLES.VIEWER]: {
    name: ROLES.VIEWER,
    displayName: 'Viewer',
    description: 'Read-only access to strategies, positions, and reports',
    level: 1,
  },
  [ROLES.TRADER]: {
    name: ROLES.TRADER,
    displayName: 'Trader',
    description: 'Can execute orders and manage trading strategies',
    level: 2,
  },
  [ROLES.ANALYST]: {
    name: ROLES.ANALYST,
    displayName: 'Analyst',
    description: 'Access to AI analysis, audit logs, and report exports',
    level: 2,
  },
  [ROLES.ADMIN]: {
    name: ROLES.ADMIN,
    displayName: 'Administrator',
    description: 'Full access within tenant including user management',
    level: 3,
  },
  [ROLES.SUPER_ADMIN]: {
    name: ROLES.SUPER_ADMIN,
    displayName: 'Super Administrator',
    description: 'Platform-wide access across all tenants',
    level: 4,
  },
};

/**
 * Get role info by role name.
 */
export function getRoleInfo(role: Role): RoleInfo | undefined {
  return ROLE_INFO[role];
}

/**
 * Get all roles sorted by level (ascending).
 */
export function getRolesByLevel(): RoleInfo[] {
  return Object.values(ROLE_INFO).sort((a, b) => a.level - b.level);
}
