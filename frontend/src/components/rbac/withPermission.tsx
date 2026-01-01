'use client';

import React, { ComponentType } from 'react';
import { useRBAC } from '@/providers/RBACProvider';
import { PermissionDenied } from './PermissionGate';
import type { ResourceType, ActionType, PermissionCheck } from '@/types/rbac';

interface WithPermissionOptions {
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
   * Custom component to render when permission is denied
   */
  FallbackComponent?: ComponentType;
  /**
   * Custom message for the default fallback
   */
  deniedMessage?: string;
  /**
   * If true, redirects to a specified path instead of showing fallback
   */
  redirectTo?: string;
}

/**
 * withPermission - Higher-Order Component for route/component protection
 * 
 * Usage:
 * ```tsx
 * // Protect a page component
 * const ProtectedPage = withPermission(MyPage, {
 *   resource: 'strategy',
 *   action: 'read'
 * });
 * 
 * // Protect with multiple permissions
 * const AdminPage = withPermission(AdminDashboard, {
 *   permissions: [
 *     { resource: 'user', action: 'read' },
 *     { resource: 'role', action: 'read' }
 *   ],
 *   requireAll: true
 * });
 * 
 * // Custom fallback
 * const CustomProtected = withPermission(MyComponent, {
 *   resource: 'order',
 *   action: 'execute',
 *   FallbackComponent: CustomAccessDenied
 * });
 * ```
 */
export function withPermission<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: WithPermissionOptions
): ComponentType<P> {
  const {
    resource,
    action,
    permissions,
    requireAll = false,
    FallbackComponent,
    deniedMessage,
  } = options;

  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || 'Component';

  function WithPermissionWrapper(props: P) {
    const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } =
      useRBAC();

    // Show loading state while checking permissions
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      );
    }

    // Determine if user has required permissions
    let hasAccess = false;

    if (resource && action) {
      hasAccess = hasPermission(resource, action);
    } else if (permissions && permissions.length > 0) {
      hasAccess = requireAll
        ? hasAllPermissions(permissions)
        : hasAnyPermission(permissions);
    } else {
      // No permissions specified - allow access
      hasAccess = true;
    }

    if (hasAccess) {
      return <WrappedComponent {...props} />;
    }

    // Render fallback
    if (FallbackComponent) {
      return <FallbackComponent />;
    }

    return <PermissionDenied message={deniedMessage} />;
  }

  WithPermissionWrapper.displayName = `withPermission(${displayName})`;

  return WithPermissionWrapper;
}

/**
 * createProtectedRoute - Factory function to create protected route components
 * 
 * Usage:
 * ```tsx
 * const ProtectedStrategyRoute = createProtectedRoute({
 *   resource: 'strategy',
 *   action: 'read'
 * });
 * 
 * // In your routes
 * <ProtectedStrategyRoute>
 *   <StrategyPage />
 * </ProtectedStrategyRoute>
 * ```
 */
export function createProtectedRoute(options: WithPermissionOptions) {
  return function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } =
      useRBAC();

    const {
      resource,
      action,
      permissions,
      requireAll = false,
      FallbackComponent,
      deniedMessage,
    } = options;

    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      );
    }

    let hasAccess = false;

    if (resource && action) {
      hasAccess = hasPermission(resource, action);
    } else if (permissions && permissions.length > 0) {
      hasAccess = requireAll
        ? hasAllPermissions(permissions)
        : hasAnyPermission(permissions);
    } else {
      hasAccess = true;
    }

    if (hasAccess) {
      return <>{children}</>;
    }

    if (FallbackComponent) {
      return <FallbackComponent />;
    }

    return <PermissionDenied message={deniedMessage} />;
  };
}

export default withPermission;
