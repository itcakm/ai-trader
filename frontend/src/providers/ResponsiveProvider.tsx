/**
 * Responsive Layout Provider
 * Requirements: 14.1, 14.4
 * 
 * Provides responsive context for the entire application including
 * viewport information, safe area insets, and platform detection.
 */

'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useSafeArea } from '@/hooks/useSafeArea';
import type { ResponsiveContextValue } from '@/types/mobile';

const ResponsiveContext = createContext<ResponsiveContextValue | undefined>(undefined);

export interface ResponsiveProviderProps {
  children: React.ReactNode;
}

export function ResponsiveProvider({ children }: ResponsiveProviderProps) {
  const breakpoint = useBreakpoint();
  const safeArea = useSafeArea();

  const value = useMemo<ResponsiveContextValue>(
    () => ({
      viewport: breakpoint.viewport,
      safeAreaInsets: safeArea.insets,
      platform: safeArea.platform,
      isMobile: breakpoint.isMobile,
      isTablet: breakpoint.isTablet,
      isDesktop: breakpoint.isDesktop,
      isNativeApp: safeArea.isNative,
    }),
    [breakpoint, safeArea]
  );

  return (
    <ResponsiveContext.Provider value={value}>
      {children}
    </ResponsiveContext.Provider>
  );
}

/**
 * Hook to access responsive context
 */
export function useResponsive(): ResponsiveContextValue {
  const context = useContext(ResponsiveContext);
  if (context === undefined) {
    throw new Error('useResponsive must be used within a ResponsiveProvider');
  }
  return context;
}

/**
 * Hook to check if we should render for a specific device type
 */
export function useDeviceVisibility(options: {
  mobileOnly?: boolean;
  tabletOnly?: boolean;
  desktopOnly?: boolean;
  hideMobile?: boolean;
  hideTablet?: boolean;
  hideDesktop?: boolean;
}): boolean {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  // Check "only" conditions
  if (options.mobileOnly && !isMobile) return false;
  if (options.tabletOnly && !isTablet) return false;
  if (options.desktopOnly && !isDesktop) return false;

  // Check "hide" conditions
  if (options.hideMobile && isMobile) return false;
  if (options.hideTablet && isTablet) return false;
  if (options.hideDesktop && isDesktop) return false;

  return true;
}
