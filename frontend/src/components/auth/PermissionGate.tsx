'use client';

import React from 'react';
import { useRBAC } from '@/providers/RBACProvider';
import type { ResourceType, ActionType, PermissionCheck, BackendPermission } from '@/types/rbac';

/**
 * PermissionGate Component
 * Requirements: 6.9 - Hide/show elements based on permissions
 * 
 * Conditionally renders children based on user permissions.
 * Supports both legacy (resource/action) and backend (string) permission formats.
 */

interface PermissionGateProps {
  children: React.ReactNode;
  /** Legacy permission check - resource type */
  resource?: ResourceType;
  /** Legacy permission check - action type */
  action?: ActionType;
  /** Multiple legacy permission checks */
  permissions?: PermissionCheck[];
  /** Backend permission string (e.g., 'read:strategies') */
  backendPermission?: BackendPermission;
  /** Multiple backend permission strings */
  backendPermissions?: BackendPermission[];
  /** Whether all permissions are required (AND) vs any permission (OR). Defaults to false (OR) */
  requireAll?: boolean;
  /** Fallback content to render when permission is denied */
  fallback?: React.ReactNode;
  /** Whether to render nothing (null) when permission is denied. Defaults to true */
  hideOnDeny?: boolean;
}

export function PermissionGate({
  children,
  resource,
  action,
  permissions,
  backendPermission,
  backendPermissions,
  requireAll = false,
  fallback = null,
  hideOnDeny = true,
}: PermissionGateProps) {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasBackendPermission,
    hasAnyBackendPermission,
    hasAllBackendPermissions,
    isLoading,
  } = useRBAC();

  // Show nothing while loading
  if (isLoading) {
    return null;
  }

  let hasAccess = false;

  // Check single legacy permission
  if (resource && action) {
    hasAccess = hasPermission(resource, action);
  }
  // Check multiple legacy permissions
  else if (permissions && permissions.length > 0) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }
  // Check single backend permission
  else if (backendPermission) {
    hasAccess = hasBackendPermission(backendPermission);
  }
  // Check multiple backend permissions
  else if (backendPermissions && backendPermissions.length > 0) {
    hasAccess = requireAll
      ? hasAllBackendPermissions(backendPermissions)
      : hasAnyBackendPermission(backendPermissions);
  }
  // No permissions specified - allow access
  else {
    hasAccess = true;
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (hideOnDeny) {
    return <>{fallback}</>;
  }

  return <>{fallback}</>;
}

/**
 * Hook for permission-based conditional rendering
 * Returns true if user has the specified permission
 */
export function useHasPermission(
  resource: ResourceType,
  action: ActionType
): boolean {
  const { hasPermission, isLoading } = useRBAC();
  if (isLoading) return false;
  return hasPermission(resource, action);
}

/**
 * Hook for backend permission-based conditional rendering
 * Returns true if user has the specified backend permission
 */
export function useHasBackendPermission(permission: BackendPermission): boolean {
  const { hasBackendPermission, isLoading } = useRBAC();
  if (isLoading) return false;
  return hasBackendPermission(permission);
}

export default PermissionGate;
