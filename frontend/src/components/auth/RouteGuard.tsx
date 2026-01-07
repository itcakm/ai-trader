'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

/**
 * RouteGuard Component
 * Requirements: 10.1, 10.2, 10.3, 10.6
 * - Check authentication status
 * - Show loading while checking
 * - Redirect to login if unauthenticated
 * - Preserve intended destination URL
 */

interface RouteGuardProps {
  children: React.ReactNode;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom redirect path (defaults to /login) */
  loginPath?: string;
  /** Query parameter name for storing redirect URL */
  redirectParam?: string;
}

/**
 * Default loading spinner component
 */
function DefaultLoadingSpinner() {
  return (
    <div 
      className="min-h-screen bg-background flex items-center justify-center"
      role="status"
      aria-label="Checking authentication"
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
        <p className="text-muted-foreground text-sm">Verifying authentication...</p>
      </div>
    </div>
  );
}

export function RouteGuard({
  children,
  loadingComponent,
  loginPath = '/login',
  redirectParam = 'redirect',
}: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, session } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Requirements: 10.1 - Check authentication status
    const checkAuth = () => {
      // Still loading/checking auth state
      if (status === 'idle' || status === 'loading') {
        return;
      }

      // Requirements: 10.2 - Redirect to login if unauthenticated
      if (status === 'unauthenticated' || status === 'session_expired') {
        // Requirements: 10.3 - Preserve intended destination URL
        const redirectUrl = encodeURIComponent(pathname);
        router.push(`${loginPath}?${redirectParam}=${redirectUrl}`);
        return;
      }

      // MFA required - redirect to MFA challenge
      if (status === 'mfa_required') {
        router.push(`${loginPath}?mfa=required`);
        return;
      }

      // User is authenticated
      if (status === 'authenticated' && session) {
        setIsAuthorized(true);
      }
    };

    checkAuth();
  }, [status, session, pathname, router, loginPath, redirectParam]);

  // Requirements: 10.6 - Show loading while checking
  if (status === 'idle' || status === 'loading') {
    return <>{loadingComponent || <DefaultLoadingSpinner />}</>;
  }

  // Not authorized yet (redirecting)
  if (!isAuthorized) {
    return <>{loadingComponent || <DefaultLoadingSpinner />}</>;
  }

  // Authorized - render children
  return <>{children}</>;
}

export default RouteGuard;
