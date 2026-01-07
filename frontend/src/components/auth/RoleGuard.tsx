'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import type { Role } from '@/types/auth';

/**
 * RoleGuard Component
 * Requirements: 10.4, 10.5
 * - Check user roles against required roles
 * - Show 403 page or redirect if unauthorized
 */

interface RoleGuardProps {
  children: React.ReactNode;
  /** Required role names - user must have at least one of these roles */
  requiredRoles: string[];
  /** Whether all roles are required (AND) vs any role (OR). Defaults to false (OR) */
  requireAll?: boolean;
  /** Custom forbidden component to show instead of redirecting */
  forbiddenComponent?: React.ReactNode;
  /** Path to redirect to when unauthorized (defaults to /forbidden) */
  forbiddenPath?: string;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
}

/**
 * Default loading spinner component
 */
function DefaultLoadingSpinner() {
  return (
    <div 
      className="min-h-screen bg-background flex items-center justify-center"
      role="status"
      aria-label="Checking permissions"
    >
      <div className="flex flex-col items-center gap-4">
        <svg
          className="animate-spin h-8 w-8 text-primary-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="text-muted-foreground text-sm">Checking permissions...</p>
      </div>
    </div>
  );
}

/**
 * Default inline forbidden message (used when forbiddenComponent is not provided
 * and we don't want to redirect)
 */
function DefaultForbiddenMessage() {
  return (
    <div 
      className="min-h-screen bg-background flex items-center justify-center px-4"
      role="alert"
      aria-live="polite"
    >
      <div className="text-center max-w-md">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">
          You don&apos;t have permission to access this page.
        </p>
      </div>
    </div>
  );
}

/**
 * Check if user has required roles
 */
function hasRequiredRoles(
  userRoles: Role[],
  requiredRoles: string[],
  requireAll: boolean
): boolean {
  if (requiredRoles.length === 0) {
    return true;
  }

  const userRoleNames = userRoles.map(role => role.name.toUpperCase());
  const normalizedRequired = requiredRoles.map(role => role.toUpperCase());

  if (requireAll) {
    // User must have ALL required roles
    return normalizedRequired.every(required => userRoleNames.includes(required));
  } else {
    // User must have at least ONE of the required roles
    return normalizedRequired.some(required => userRoleNames.includes(required));
  }
}

export function RoleGuard({
  children,
  requiredRoles,
  requireAll = false,
  forbiddenComponent,
  forbiddenPath = '/forbidden',
  loadingComponent,
}: RoleGuardProps) {
  const router = useRouter();
  const { status, session } = useAuth();
  const [authState, setAuthState] = useState<'loading' | 'authorized' | 'forbidden'>('loading');

  useEffect(() => {
    // Requirements: 10.4 - Check user roles against required roles
    const checkRoles = () => {
      // Still loading auth state
      if (status === 'idle' || status === 'loading') {
        setAuthState('loading');
        return;
      }

      // Not authenticated - RouteGuard should handle this, but be safe
      if (status !== 'authenticated' || !session) {
        setAuthState('loading');
        return;
      }

      // Check if user has required roles
      const hasRoles = hasRequiredRoles(session.roles, requiredRoles, requireAll);

      if (hasRoles) {
        setAuthState('authorized');
      } else {
        // Requirements: 10.5 - Show 403 page or redirect if unauthorized
        if (forbiddenComponent) {
          // Show inline forbidden component
          setAuthState('forbidden');
        } else {
          // Redirect to forbidden page
          router.push(forbiddenPath);
        }
      }
    };

    checkRoles();
  }, [status, session, requiredRoles, requireAll, forbiddenComponent, forbiddenPath, router]);

  // Show loading state
  if (authState === 'loading') {
    return <>{loadingComponent || <DefaultLoadingSpinner />}</>;
  }

  // Show forbidden state (inline component)
  if (authState === 'forbidden') {
    return <>{forbiddenComponent || <DefaultForbiddenMessage />}</>;
  }

  // Authorized - render children
  return <>{children}</>;
}

export default RoleGuard;
