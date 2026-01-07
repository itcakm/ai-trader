'use client';

import { AuthProvider } from '@/providers/AuthProvider';
import { I18nProvider } from '@/providers/I18nProvider';
import { ResponsiveProvider } from '@/providers/ResponsiveProvider';

/**
 * Auth Layout
 * Provides AuthProvider context for all auth-related pages
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <I18nProvider>
      <ResponsiveProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ResponsiveProvider>
    </I18nProvider>
  );
}
