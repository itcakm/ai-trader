'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
} from 'react';
import { useAuth } from './AuthProvider';
import type {
  RBACContextValue,
  ResourceType,
  ActionType,
  Permission,
  Role,
  ModuleType,
  PermissionCheck,
  BackendPermission,
} from '@/types/rbac';
import { 
  MODULE_PERMISSION_MAP, 
  SYSTEM_ROLES, 
  ROLE_BACKEND_PERMISSIONS,
  BACKEND_PERMISSIONS,
} from '@/types/rbac';

// Context
const RBACContext = createContext<RBACContextValue | undefined>(undefined);

/**
 * Check if a permission matches a resource and action
 */
function permissionMatches(
  permission: Permission,
  resource: ResourceType,
  action: ActionType
): boolean {
  return permission.resource === resource && permission.action === action;
}

/**
 * Merge permissions from organization roles with user-level overrides
 * User-level permissions take precedence over organization-level permissions
 */
export function mergePermissionsWithInheritance(
  organizationPermissions: Permission[],
  userOverrides: Permission[]
): Permission[] {
  const permissionMap = new Map<string, Permission>();

  // Add organization-level permissions first
  for (const permission of organizationPermissions) {
    const key = `${permission.resource}:${permission.action}`;
    permissionMap.set(key, permission);
  }

  // Apply user-level overrides (these take precedence)
  for (const permission of userOverrides) {
    const key = `${permission.resource}:${permission.action}`;
    permissionMap.set(key, permission);
  }

  return Array.from(permissionMap.values());
}

/**
 * Extract all permissions from roles
 */
export function extractPermissionsFromRoles(roles: Role[]): Permission[] {
  const permissionMap = new Map<string, Permission>();

  for (const role of roles) {
    for (const permission of role.permissions) {
      const key = `${permission.resource}:${permission.action}`;
      permissionMap.set(key, permission);
    }
  }

  return Array.from(permissionMap.values());
}

/**
 * Get backend permission strings for a list of role names
 * Requirements: 6.7, 6.9 - Match backend permission definitions
 */
export function getBackendPermissionsForRoles(roleNames: string[]): BackendPermission[] {
  const permissionSet = new Set<BackendPermission>();

  for (const roleName of roleNames) {
    const normalizedRole = roleName.toUpperCase();
    
    // Check if it's a SUPER_ADMIN (has wildcard permission)
    if (normalizedRole === SYSTEM_ROLES.SUPER_ADMIN) {
      return [BACKEND_PERMISSIONS.ALL];
    }
    
    // Get permissions for this role
    const rolePermissions = ROLE_BACKEND_PERMISSIONS[normalizedRole as keyof typeof ROLE_BACKEND_PERMISSIONS];
    if (rolePermissions) {
      for (const permission of rolePermissions) {
        permissionSet.add(permission);
      }
    }
  }

  return Array.from(permissionSet);
}

// Provider Props
interface RBACProviderProps {
  children: React.ReactNode;
  // Optional: additional user-level permission overrides
  userPermissionOverrides?: Permission[];
  // Optional: organization-level permissions (for inheritance)
  organizationPermissions?: Permission[];
}

/**
 * RBACProvider - Provides role-based access control throughout the application
 * 
 * Requirements: 6.7, 6.9
 * - Get roles from AuthProvider user context (from JWT claims)
 * - Match backend permission definitions
 * - Hide/show elements based on permissions
 * 
 * Features:
 * - Permission checking (hasPermission, hasAnyPermission, hasAllPermissions)
 * - Backend permission string checking (hasBackendPermission, etc.)
 * - Role checking (hasRole, hasAnyRole, hasAllRoles, isSuperAdmin, isAdmin)
 * - Permission inheritance (organization → user override)
 * - Module visibility based on permissions
 * - Permission-based filtering of items
 */
export function RBACProvider({
  children,
  userPermissionOverrides = [],
  organizationPermissions = [],
}: RBACProviderProps) {
  // Get roles from AuthProvider user context (from JWT claims)
  // Requirements: 6.9 - Use roles from JWT claims
  const { session, status } = useAuth();

  // Extract role names from session (these come from JWT claims)
  const roleNames = useMemo(() => {
    if (!session?.roles) return [];
    return session.roles.map(role => role.name.toUpperCase());
  }, [session?.roles]);

  // Compute backend permission strings based on role names
  // Requirements: 6.7 - Match backend permission definitions
  const backendPermissions = useMemo(() => {
    return getBackendPermissionsForRoles(roleNames);
  }, [roleNames]);

  // Compute effective permissions with inheritance (legacy format)
  const effectivePermissions = useMemo(() => {
    if (!session) return [];

    // Start with organization permissions
    const orgPerms = organizationPermissions.length > 0
      ? organizationPermissions
      : extractPermissionsFromRoles(session.roles);

    // Apply user-level overrides
    const userOverrides = userPermissionOverrides.length > 0
      ? userPermissionOverrides
      : session.permissions;

    return mergePermissionsWithInheritance(orgPerms, userOverrides);
  }, [session, organizationPermissions, userPermissionOverrides]);

  // ============================================================================
  // Legacy Permission Checking (resource/action format)
  // ============================================================================

  // Check if user has a specific permission (legacy format)
  const hasPermission = useCallback(
    (resource: ResourceType, action: ActionType): boolean => {
      // SUPER_ADMIN has all permissions
      if (roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
        return true;
      }
      return effectivePermissions.some((p) =>
        permissionMatches(p, resource, action)
      );
    },
    [effectivePermissions, roleNames]
  );

  // Check if user has any of the specified permissions (legacy format)
  const hasAnyPermission = useCallback(
    (permissions: PermissionCheck[]): boolean => {
      // SUPER_ADMIN has all permissions
      if (roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
        return true;
      }
      return permissions.some(({ resource, action }) =>
        hasPermission(resource, action)
      );
    },
    [hasPermission, roleNames]
  );

  // Check if user has all of the specified permissions (legacy format)
  const hasAllPermissions = useCallback(
    (permissions: PermissionCheck[]): boolean => {
      // SUPER_ADMIN has all permissions
      if (roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
        return true;
      }
      return permissions.every(({ resource, action }) =>
        hasPermission(resource, action)
      );
    },
    [hasPermission, roleNames]
  );

  // ============================================================================
  // Backend Permission Checking (string format matching backend)
  // Requirements: 6.7 - Match backend permission definitions
  // ============================================================================

  // Check if user has a specific backend permission
  const hasBackendPermission = useCallback(
    (permission: BackendPermission): boolean => {
      // Wildcard permission grants all access
      if (backendPermissions.includes(BACKEND_PERMISSIONS.ALL)) {
        return true;
      }
      return backendPermissions.includes(permission);
    },
    [backendPermissions]
  );

  // Check if user has any of the specified backend permissions
  const hasAnyBackendPermission = useCallback(
    (permissions: BackendPermission[]): boolean => {
      if (permissions.length === 0) return true;
      // Wildcard permission grants all access
      if (backendPermissions.includes(BACKEND_PERMISSIONS.ALL)) {
        return true;
      }
      return permissions.some(permission => backendPermissions.includes(permission));
    },
    [backendPermissions]
  );

  // Check if user has all of the specified backend permissions
  const hasAllBackendPermissions = useCallback(
    (permissions: BackendPermission[]): boolean => {
      if (permissions.length === 0) return true;
      // Wildcard permission grants all access
      if (backendPermissions.includes(BACKEND_PERMISSIONS.ALL)) {
        return true;
      }
      return permissions.every(permission => backendPermissions.includes(permission));
    },
    [backendPermissions]
  );

  // ============================================================================
  // Role Checking
  // ============================================================================

  // Check if user has a specific role
  const hasRole = useCallback(
    (role: string): boolean => {
      const normalizedRole = role.toUpperCase();
      // SUPER_ADMIN has all roles implicitly
      if (roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
        return true;
      }
      return roleNames.includes(normalizedRole);
    },
    [roleNames]
  );

  // Check if user has any of the specified roles
  const hasAnyRole = useCallback(
    (roles: string[]): boolean => {
      if (roles.length === 0) return true;
      // SUPER_ADMIN has all roles implicitly
      if (roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
        return true;
      }
      return roles.some(role => roleNames.includes(role.toUpperCase()));
    },
    [roleNames]
  );

  // Check if user has all of the specified roles
  const hasAllRoles = useCallback(
    (roles: string[]): boolean => {
      if (roles.length === 0) return true;
      // SUPER_ADMIN has all roles implicitly
      if (roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
        return true;
      }
      return roles.every(role => roleNames.includes(role.toUpperCase()));
    },
    [roleNames]
  );

  // Check if user is a super admin
  const isSuperAdmin = useCallback((): boolean => {
    return roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN);
  }, [roleNames]);

  // Check if user is an admin (tenant admin or super admin)
  const isAdmin = useCallback((): boolean => {
    return roleNames.includes(SYSTEM_ROLES.ADMIN) || roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN);
  }, [roleNames]);

  // ============================================================================
  // Module Visibility
  // ============================================================================

  // Get list of visible modules based on permissions
  const getVisibleModules = useCallback((): ModuleType[] => {
    // SUPER_ADMIN sees all modules
    if (roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
      return MODULE_PERMISSION_MAP.map(({ module }) => module);
    }
    
    return MODULE_PERMISSION_MAP
      .filter(({ requiredPermissions, backendPermissions: moduleBackendPerms }) => {
        // Check backend permissions first if available
        if (moduleBackendPerms && moduleBackendPerms.length > 0) {
          return hasAnyBackendPermission(moduleBackendPerms);
        }
        // Fall back to legacy permission check
        return hasAnyPermission(requiredPermissions);
      })
      .map(({ module }) => module);
  }, [hasAnyPermission, hasAnyBackendPermission, roleNames]);

  // ============================================================================
  // Filtering
  // ============================================================================

  // Filter items by permission
  const filterByPermission = useCallback(
    <T,>(
      items: T[],
      resource: ResourceType,
      action: ActionType,
      _getItemResource?: (item: T) => ResourceType
    ): T[] => {
      // If user doesn't have the base permission, return empty array
      if (!hasPermission(resource, action)) {
        return [];
      }
      // Return all items if user has permission
      return items;
    },
    [hasPermission]
  );

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: RBACContextValue = useMemo(
    () => ({
      // Legacy permission checking
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      // Backend permission checking
      hasBackendPermission,
      hasAnyBackendPermission,
      hasAllBackendPermissions,
      // Role checking
      hasRole,
      hasAnyRole,
      hasAllRoles,
      isSuperAdmin,
      isAdmin,
      // Module visibility
      getVisibleModules,
      // Filtering
      filterByPermission,
      // Current state
      permissions: effectivePermissions,
      backendPermissions,
      roles: session?.roles ?? [],
      roleNames,
      isLoading: status === 'loading',
    }),
    [
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      hasBackendPermission,
      hasAnyBackendPermission,
      hasAllBackendPermissions,
      hasRole,
      hasAnyRole,
      hasAllRoles,
      isSuperAdmin,
      isAdmin,
      getVisibleModules,
      filterByPermission,
      effectivePermissions,
      backendPermissions,
      session?.roles,
      roleNames,
      status,
    ]
  );

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
}

/**
 * Hook to access RBAC context
 */
export function useRBAC(): RBACContextValue {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return context;
}

/**
 * Hook for component-level permission checks
 * Returns a boolean indicating if the user has the specified permission
 */
export function usePermission(
  resource: ResourceType,
  action: ActionType
): boolean {
  const { hasPermission } = useRBAC();
  return hasPermission(resource, action);
}

/**
 * Hook for checking backend permission strings
 */
export function useBackendPermission(permission: BackendPermission): boolean {
  const { hasBackendPermission } = useRBAC();
  return hasBackendPermission(permission);
}

/**
 * Hook for checking multiple permissions
 */
export function usePermissions(permissions: PermissionCheck[]): {
  hasAny: boolean;
  hasAll: boolean;
  checks: Record<string, boolean>;
} {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useRBAC();

  return useMemo(() => {
    const checks: Record<string, boolean> = {};
    for (const { resource, action } of permissions) {
      checks[`${resource}:${action}`] = hasPermission(resource, action);
    }

    return {
      hasAny: hasAnyPermission(permissions),
      hasAll: hasAllPermissions(permissions),
      checks,
    };
  }, [permissions, hasPermission, hasAnyPermission, hasAllPermissions]);
}

/**
 * Hook to get visible modules for the current user
 */
export function useVisibleModules(): ModuleType[] {
  const { getVisibleModules } = useRBAC();
  return useMemo(() => getVisibleModules(), [getVisibleModules]);
}

/**
 * Hook for role checking
 */
export function useRole(role: string): boolean {
  const { hasRole } = useRBAC();
  return hasRole(role);
}

/**
 * Hook for checking multiple roles
 */
export function useRoles(roles: string[]): {
  hasAny: boolean;
  hasAll: boolean;
  checks: Record<string, boolean>;
} {
  const { hasRole, hasAnyRole, hasAllRoles } = useRBAC();

  return useMemo(() => {
    const checks: Record<string, boolean> = {};
    for (const role of roles) {
      checks[role] = hasRole(role);
    }

    return {
      hasAny: hasAnyRole(roles),
      hasAll: hasAllRoles(roles),
      checks,
    };
  }, [roles, hasRole, hasAnyRole, hasAllRoles]);
}
