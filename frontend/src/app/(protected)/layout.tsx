'use client';

import { I18nProvider } from '@/providers/I18nProvider';
import { ResponsiveProvider } from '@/providers/ResponsiveProvider';
import { RBACProvider } from '@/providers/RBACProvider';
import { ContextualHelpProvider } from '@/providers/ContextualHelpProvider';
import { CommandPaletteProvider } from '@/components/command-palette';
import { ProtectedLayout } from '@/components/auth';

/**
 * Protected Layout
 * Requirements: 10.7, 10.8
 * - Wrap protected routes with RouteGuard
 * - Handle token refresh during navigation
 * 
 * All routes under (protected) require authentication.
 * Public routes (login, signup, etc.) are in the (auth) route group.
 */
export default function ProtectedRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <I18nProvider>
      <ResponsiveProvider>
        <ProtectedLayout
          loginPath="/login"
          forbiddenPath="/forbidden"
          showSessionExpiryWarning={true}
        >
          <RBACProvider>
            <ContextualHelpProvider>
              <CommandPaletteProvider>
                {children}
              </CommandPaletteProvider>
            </ContextualHelpProvider>
          </RBACProvider>
        </ProtectedLayout>
      </ResponsiveProvider>
    </I18nProvider>
  );
}
