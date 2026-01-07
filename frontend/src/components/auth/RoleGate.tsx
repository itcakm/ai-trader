'use client';

import React from 'react';
import { useRBAC } from '@/providers/RBACProvider';

/**
 * RoleGate Component
 * Requirements: 6.9 - Hide/show elements based on user roles
 * 
 * Conditionally renders children based on user roles.
 */

interface RoleGateProps {
  children: React.ReactNode;
  /** Single role to check */
  role?: string;
  /** Multiple roles to check */
  roles?: string[];
  /** Whether all roles are required (AND) vs any role (OR). Defaults to false (OR) */
  requireAll?: boolean;
  /** Fallback content to render when role check fails */
  fallback?: React.ReactNode;
  /** Whether to render nothing (null) when role check fails. Defaults to true */
  hideOnDeny?: boolean;
  /** Only show for admin users (ADMIN or SUPER_ADMIN) */
  adminOnly?: boolean;
  /** Only show for super admin users */
  superAdminOnly?: boolean;
}

export function RoleGate({
  children,
  role,
  roles,
  requireAll = false,
  fallback = null,
  hideOnDeny = true,
  adminOnly = false,
  superAdminOnly = false,
}: RoleGateProps) {
  const {
    hasRole,
    hasAnyRole,
    hasAllRoles,
    isAdmin,
    isSuperAdmin,
    isLoading,
  } = useRBAC();

  // Show nothing while loading
  if (isLoading) {
    return null;
  }

  let hasAccess = false;

  // Check super admin only
  if (superAdminOnly) {
    hasAccess = isSuperAdmin();
  }
  // Check admin only (includes super admin)
  else if (adminOnly) {
    hasAccess = isAdmin();
  }
  // Check single role
  else if (role) {
    hasAccess = hasRole(role);
  }
  // Check multiple roles
  else if (roles && roles.length > 0) {
    hasAccess = requireAll ? hasAllRoles(roles) : hasAnyRole(roles);
  }
  // No roles specified - allow access
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
 * Hook for role-based conditional rendering
 * Returns true if user has the specified role
 */
export function useHasRole(role: string): boolean {
  const { hasRole, isLoading } = useRBAC();
  if (isLoading) return false;
  return hasRole(role);
}

/**
 * Hook for checking admin status
 */
export function useIsAdmin(): boolean {
  const { isAdmin, isLoading } = useRBAC();
  if (isLoading) return false;
  return isAdmin();
}

/**
 * Hook for checking super admin status
 */
export function useIsSuperAdmin(): boolean {
  const { isSuperAdmin, isLoading } = useRBAC();
  if (isLoading) return false;
  return isSuperAdmin();
}

export default RoleGate;
