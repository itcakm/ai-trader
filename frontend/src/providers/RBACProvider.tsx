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
} from '@/types/rbac';
import { MODULE_PERMISSION_MAP } from '@/types/rbac';

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
 * Features:
 * - Permission checking (hasPermission, hasAnyPermission, hasAllPermissions)
 * - Permission inheritance (organization → user override)
 * - Module visibility based on permissions
 * - Permission-based filtering of items
 */
export function RBACProvider({
  children,
  userPermissionOverrides = [],
  organizationPermissions = [],
}: RBACProviderProps) {
  const { session, status } = useAuth();

  // Compute effective permissions with inheritance
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

  // Check if user has a specific permission
  const hasPermission = useCallback(
    (resource: ResourceType, action: ActionType): boolean => {
      return effectivePermissions.some((p) =>
        permissionMatches(p, resource, action)
      );
    },
    [effectivePermissions]
  );

  // Check if user has any of the specified permissions
  const hasAnyPermission = useCallback(
    (permissions: PermissionCheck[]): boolean => {
      return permissions.some(({ resource, action }) =>
        hasPermission(resource, action)
      );
    },
    [hasPermission]
  );

  // Check if user has all of the specified permissions
  const hasAllPermissions = useCallback(
    (permissions: PermissionCheck[]): boolean => {
      return permissions.every(({ resource, action }) =>
        hasPermission(resource, action)
      );
    },
    [hasPermission]
  );

  // Get list of visible modules based on permissions
  const getVisibleModules = useCallback((): ModuleType[] => {
    return MODULE_PERMISSION_MAP
      .filter(({ requiredPermissions }) =>
        hasAnyPermission(requiredPermissions)
      )
      .map(({ module }) => module);
  }, [hasAnyPermission]);

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

  const value: RBACContextValue = useMemo(
    () => ({
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      getVisibleModules,
      filterByPermission,
      permissions: effectivePermissions,
      roles: session?.roles ?? [],
      isLoading: status === 'loading',
    }),
    [
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      getVisibleModules,
      filterByPermission,
      effectivePermissions,
      session?.roles,
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
