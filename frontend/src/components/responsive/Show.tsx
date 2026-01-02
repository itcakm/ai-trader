/**
 * Show/Hide Components
 * Requirements: 14.1, 14.4
 * 
 * Conditional rendering components based on viewport size.
 */

'use client';

import React from 'react';
import { useResponsive } from '@/providers/ResponsiveProvider';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import type { Breakpoint } from '@/types/mobile';

export interface ShowProps {
  children: React.ReactNode;
}

/**
 * Show content only on mobile devices
 */
export function ShowOnMobile({ children }: ShowProps) {
  const { isMobile } = useResponsive();
  return isMobile ? <>{children}</> : null;
}

/**
 * Show content only on tablet devices
 */
export function ShowOnTablet({ children }: ShowProps) {
  const { isTablet } = useResponsive();
  return isTablet ? <>{children}</> : null;
}

/**
 * Show content only on desktop devices
 */
export function ShowOnDesktop({ children }: ShowProps) {
  const { isDesktop } = useResponsive();
  return isDesktop ? <>{children}</> : null;
}

/**
 * Hide content on mobile devices
 */
export function HideOnMobile({ children }: ShowProps) {
  const { isMobile } = useResponsive();
  return isMobile ? null : <>{children}</>;
}

/**
 * Hide content on tablet devices
 */
export function HideOnTablet({ children }: ShowProps) {
  const { isTablet } = useResponsive();
  return isTablet ? null : <>{children}</>;
}

/**
 * Hide content on desktop devices
 */
export function HideOnDesktop({ children }: ShowProps) {
  const { isDesktop } = useResponsive();
  return isDesktop ? null : <>{children}</>;
}

export interface ShowAboveProps extends ShowProps {
  breakpoint: Breakpoint;
}

/**
 * Show content at or above a specific breakpoint
 */
export function ShowAbove({ children, breakpoint }: ShowAboveProps) {
  const { isAtLeast } = useBreakpoint();
  return isAtLeast(breakpoint) ? <>{children}</> : null;
}

/**
 * Show content at or below a specific breakpoint
 */
export function ShowBelow({ children, breakpoint }: ShowAboveProps) {
  const { isAtMost } = useBreakpoint();
  return isAtMost(breakpoint) ? <>{children}</> : null;
}

export interface ShowBetweenProps extends ShowProps {
  min: Breakpoint;
  max: Breakpoint;
}

/**
 * Show content between two breakpoints (inclusive)
 */
export function ShowBetween({ children, min, max }: ShowBetweenProps) {
  const { isBetween } = useBreakpoint();
  return isBetween(min, max) ? <>{children}</> : null;
}

export interface MediaQueryProps extends ShowProps {
  query: string;
}

/**
 * Show content based on a custom media query
 */
export function MediaQuery({ children, query }: MediaQueryProps) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches ? <>{children}</> : null;
}
