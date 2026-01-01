'use client';

import React from 'react';
import { useRBAC } from '@/providers/RBACProvider';
import type { ResourceType, ActionType, PermissionCheck } from '@/types/rbac';

interface PermissionGateProps {
  children: React.ReactNode;
  /**
   * Single permission check - resource type
   */
  resource?: ResourceType;
  /**
   * Single permission check - action type
   */
  action?: ActionType;
  /**
   * Multiple permissions to check
   */
  permissions?: PermissionCheck[];
  /**
   * If true, requires ALL permissions. If false, requires ANY permission.
   * Default: false (any permission)
   */
  requireAll?: boolean;
  /**
   * Content to render when permission is denied
   */
  fallback?: React.ReactNode;
  /**
   * If true, renders nothing when permission is denied (instead of fallback)
   */
  hideOnDenied?: boolean;
}

/**
 * PermissionGate - Conditionally renders children based on user permissions
 * 
 * Usage:
 * ```tsx
 * // Single permission
 * <PermissionGate resource="strategy" action="create">
 *   <CreateStrategyButton />
 * </PermissionGate>
 * 
 * // Multiple permissions (any)
 * <PermissionGate 
 *   permissions={[
 *     { resource: 'strategy', action: 'create' },
 *     { resource: 'strategy', action: 'update' }
 *   ]}
 * >
 *   <EditControls />
 * </PermissionGate>
 * 
 * // Multiple permissions (all required)
 * <PermissionGate 
 *   permissions={[
 *     { resource: 'order', action: 'create' },
 *     { resource: 'order', action: 'execute' }
 *   ]}
 *   requireAll
 * >
 *   <TradePanel />
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  children,
  resource,
  action,
  permissions,
  requireAll = false,
  fallback = null,
  hideOnDenied = false,
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useRBAC();

  // Determine if user has required permissions
  let hasAccess = false;

  if (resource && action) {
    // Single permission check
    hasAccess = hasPermission(resource, action);
  } else if (permissions && permissions.length > 0) {
    // Multiple permissions check
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  } else {
    // No permissions specified - allow access
    hasAccess = true;
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (hideOnDenied) {
    return null;
  }

  return <>{fallback}</>;
}

/**
 * PermissionDenied - Default component to show when permission is denied
 */
export function PermissionDenied({
  message = 'You do not have permission to access this feature.',
  showContactAdmin = true,
}: {
  message?: string;
  showContactAdmin?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="text-4xl mb-4">🔒</div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Access Denied
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4">{message}</p>
      {showContactAdmin && (
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Contact your administrator if you believe you should have access.
        </p>
      )}
    </div>
  );
}

export default PermissionGate;
