'use client';

import { I18nProvider } from '@/providers/I18nProvider';
import { ResponsiveProvider } from '@/providers/ResponsiveProvider';
import { RBACProvider } from '@/providers/RBACProvider';
import { ContextualHelpProvider } from '@/providers/ContextualHelpProvider';
import { CommandPaletteProvider } from '@/components/command-palette';
import { ProtectedLayout } from '@/components/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

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
                <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
                  <Sidebar />
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-auto p-6">
                      {children}
                    </main>
                  </div>
                </div>
              </CommandPaletteProvider>
            </ContextualHelpProvider>
          </RBACProvider>
        </ProtectedLayout>
      </ResponsiveProvider>
    </I18nProvider>
  );
}
