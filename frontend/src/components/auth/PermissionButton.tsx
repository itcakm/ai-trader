'use client';

import React from 'react';
import { useRBAC } from '@/providers/RBACProvider';
import type { ResourceType, ActionType, BackendPermission } from '@/types/rbac';

/**
 * PermissionButton Component
 * Requirements: 6.9 - Disable actions user can't perform
 * 
 * A button that is automatically disabled when the user lacks the required permission.
 * Shows a tooltip explaining why the button is disabled.
 */

interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  /** Legacy permission check - resource type */
  resource?: ResourceType;
  /** Legacy permission check - action type */
  action?: ActionType;
  /** Backend permission string (e.g., 'read:strategies') */
  backendPermission?: BackendPermission;
  /** Custom disabled message shown in tooltip */
  disabledMessage?: string;
  /** Whether to hide the button entirely when permission is denied (instead of disabling) */
  hideOnDeny?: boolean;
  /** Additional className for styling */
  className?: string;
  /** Button variant for styling */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export function PermissionButton({
  children,
  resource,
  action,
  backendPermission,
  disabledMessage = 'You do not have permission to perform this action',
  hideOnDeny = false,
  className = '',
  variant = 'primary',
  disabled: externalDisabled,
  ...buttonProps
}: PermissionButtonProps) {
  const { hasPermission, hasBackendPermission, isLoading } = useRBAC();

  // Check permission
  let hasAccess = true;
  if (resource && action) {
    hasAccess = hasPermission(resource, action);
  } else if (backendPermission) {
    hasAccess = hasBackendPermission(backendPermission);
  }

  // Combine with external disabled state
  const isDisabled = externalDisabled || !hasAccess || isLoading;

  // Hide button if permission denied and hideOnDeny is true
  if (!hasAccess && hideOnDeny) {
    return null;
  }

  // Variant styles
  const variantStyles = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white disabled:bg-primary-300',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:bg-gray-100 disabled:text-gray-400',
    danger: 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 disabled:text-gray-400',
  };

  const baseStyles = 'px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed';

  return (
    <button
      {...buttonProps}
      disabled={isDisabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      title={!hasAccess ? disabledMessage : buttonProps.title}
      aria-disabled={isDisabled}
    >
      {children}
    </button>
  );
}

/**
 * PermissionLink Component
 * A link that is automatically disabled when the user lacks the required permission.
 */
interface PermissionLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
  /** Legacy permission check - resource type */
  resource?: ResourceType;
  /** Legacy permission check - action type */
  action?: ActionType;
  /** Backend permission string (e.g., 'read:strategies') */
  backendPermission?: BackendPermission;
  /** Custom disabled message shown in tooltip */
  disabledMessage?: string;
  /** Whether to hide the link entirely when permission is denied */
  hideOnDeny?: boolean;
}

export function PermissionLink({
  children,
  resource,
  action,
  backendPermission,
  disabledMessage = 'You do not have permission to access this',
  hideOnDeny = false,
  className = '',
  href,
  onClick,
  ...linkProps
}: PermissionLinkProps) {
  const { hasPermission, hasBackendPermission, isLoading } = useRBAC();

  // Check permission
  let hasAccess = true;
  if (resource && action) {
    hasAccess = hasPermission(resource, action);
  } else if (backendPermission) {
    hasAccess = hasBackendPermission(backendPermission);
  }

  // Hide link if permission denied and hideOnDeny is true
  if (!hasAccess && hideOnDeny) {
    return null;
  }

  // If no access, render as disabled span
  if (!hasAccess || isLoading) {
    return (
      <span
        className={`text-gray-400 cursor-not-allowed ${className}`}
        title={disabledMessage}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  return (
    <a
      {...linkProps}
      href={href}
      onClick={onClick}
      className={`text-primary-600 hover:text-primary-700 hover:underline ${className}`}
    >
      {children}
    </a>
  );
}

/**
 * PermissionIconButton Component
 * An icon button that is automatically disabled when the user lacks the required permission.
 */
interface PermissionIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  /** Legacy permission check - resource type */
  resource?: ResourceType;
  /** Legacy permission check - action type */
  action?: ActionType;
  /** Backend permission string (e.g., 'read:strategies') */
  backendPermission?: BackendPermission;
  /** Custom disabled message shown in tooltip */
  disabledMessage?: string;
  /** Whether to hide the button entirely when permission is denied */
  hideOnDeny?: boolean;
  /** Accessible label for the button */
  ariaLabel: string;
}

export function PermissionIconButton({
  children,
  resource,
  action,
  backendPermission,
  disabledMessage = 'You do not have permission to perform this action',
  hideOnDeny = false,
  ariaLabel,
  className = '',
  disabled: externalDisabled,
  ...buttonProps
}: PermissionIconButtonProps) {
  const { hasPermission, hasBackendPermission, isLoading } = useRBAC();

  // Check permission
  let hasAccess = true;
  if (resource && action) {
    hasAccess = hasPermission(resource, action);
  } else if (backendPermission) {
    hasAccess = hasBackendPermission(backendPermission);
  }

  // Combine with external disabled state
  const isDisabled = externalDisabled || !hasAccess || isLoading;

  // Hide button if permission denied and hideOnDeny is true
  if (!hasAccess && hideOnDeny) {
    return null;
  }

  return (
    <button
      {...buttonProps}
      disabled={isDisabled}
      className={`p-2 rounded-md transition-colors hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title={!hasAccess ? disabledMessage : buttonProps.title}
      aria-label={ariaLabel}
      aria-disabled={isDisabled}
    >
      {children}
    </button>
  );
}

export default PermissionButton;
