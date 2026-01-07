'use client';

import React, { useCallback } from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { RouteGuard } from './RouteGuard';
import { RoleGuard } from './RoleGuard';
import { SessionExpiryModal } from './SessionExpiryModal';

/**
 * ProtectedLayout Component
 * Requirements: 10.7, 10.8
 * - Wrap protected routes with RouteGuard
 * - Define public routes (login, signup, etc.)
 * - Handle token refresh during navigation
 */

/** Public routes that don't require authentication */
export const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/sso/callback',
] as const;

interface ProtectedLayoutProps {
  children: React.ReactNode;
  /** Required roles for this layout (optional) */
  requiredRoles?: string[];
  /** Whether all roles are required (AND) vs any role (OR) */
  requireAllRoles?: boolean;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom login redirect path */
  loginPath?: string;
  /** Custom forbidden redirect path */
  forbiddenPath?: string;
  /** Show session expiry warning modal */
  showSessionExpiryWarning?: boolean;
}

/**
 * Check if a path is a public route
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * ProtectedLayout wraps children with authentication and optional role guards
 * Use this in layout.tsx files for protected route groups
 */
export function ProtectedLayout({
  children,
  requiredRoles,
  requireAllRoles = false,
  loadingComponent,
  loginPath = '/login',
  forbiddenPath = '/forbidden',
  showSessionExpiryWarning = true,
}: ProtectedLayoutProps) {
  const [showExpiryModal, setShowExpiryModal] = React.useState(false);

  const handleSessionExpiring = useCallback(() => {
    if (showSessionExpiryWarning) {
      setShowExpiryModal(true);
    }
  }, [showSessionExpiryWarning]);

  const handleCloseExpiryModal = useCallback(() => {
    setShowExpiryModal(false);
  }, []);

  // Content with route protection
  const protectedContent = (
    <>
      <RouteGuard
        loginPath={loginPath}
        loadingComponent={loadingComponent}
      >
        {requiredRoles && requiredRoles.length > 0 ? (
          <RoleGuard
            requiredRoles={requiredRoles}
            requireAll={requireAllRoles}
            forbiddenPath={forbiddenPath}
            loadingComponent={loadingComponent}
          >
            {children}
          </RoleGuard>
        ) : (
          children
        )}
      </RouteGuard>
      
      {showSessionExpiryWarning && (
        <SessionExpiryModal
          isOpen={showExpiryModal}
          onClose={handleCloseExpiryModal}
        />
      )}
    </>
  );

  return (
    <AuthProvider onSessionExpiring={handleSessionExpiring}>
      {protectedContent}
    </AuthProvider>
  );
}

export default ProtectedLayout;
