/**
 * Responsive Breakpoint Hook
 * Requirements: 14.1, 14.4
 * 
 * Provides responsive breakpoint detection and viewport information
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Breakpoint, BreakpointConfig, ViewportInfo, DeviceType } from '@/types/mobile';

// Default breakpoint configuration (matches Tailwind defaults)
export const BREAKPOINTS: BreakpointConfig = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

// Breakpoint order for comparison
const BREAKPOINT_ORDER: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

/**
 * Get the current breakpoint based on viewport width
 */
export function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

/**
 * Get device type based on viewport width
 */
export function getDeviceType(width: number): DeviceType {
  if (width < BREAKPOINTS.md) return 'mobile';
  if (width < BREAKPOINTS.lg) return 'tablet';
  return 'desktop';
}

/**
 * Check if current breakpoint is at least the specified breakpoint
 */
export function isBreakpointAtLeast(current: Breakpoint, target: Breakpoint): boolean {
  const currentIndex = BREAKPOINT_ORDER.indexOf(current);
  const targetIndex = BREAKPOINT_ORDER.indexOf(target);
  return currentIndex >= targetIndex;
}

/**
 * Check if current breakpoint is at most the specified breakpoint
 */
export function isBreakpointAtMost(current: Breakpoint, target: Breakpoint): boolean {
  const currentIndex = BREAKPOINT_ORDER.indexOf(current);
  const targetIndex = BREAKPOINT_ORDER.indexOf(target);
  return currentIndex <= targetIndex;
}

/**
 * Get viewport information
 */
function getViewportInfo(): ViewportInfo {
  if (typeof window === 'undefined') {
    return {
      width: 1024,
      height: 768,
      breakpoint: 'lg',
      deviceType: 'desktop',
      isPortrait: false,
      isLandscape: true,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    width,
    height,
    breakpoint: getBreakpoint(width),
    deviceType: getDeviceType(width),
    isPortrait: height > width,
    isLandscape: width >= height,
  };
}

export interface UseBreakpointReturn {
  /** Current viewport information */
  viewport: ViewportInfo;
  /** Current breakpoint */
  breakpoint: Breakpoint;
  /** Current device type */
  deviceType: DeviceType;
  /** Whether viewport is mobile */
  isMobile: boolean;
  /** Whether viewport is tablet */
  isTablet: boolean;
  /** Whether viewport is desktop */
  isDesktop: boolean;
  /** Whether viewport is portrait orientation */
  isPortrait: boolean;
  /** Whether viewport is landscape orientation */
  isLandscape: boolean;
  /** Check if current breakpoint is at least the specified breakpoint */
  isAtLeast: (breakpoint: Breakpoint) => boolean;
  /** Check if current breakpoint is at most the specified breakpoint */
  isAtMost: (breakpoint: Breakpoint) => boolean;
  /** Check if current breakpoint matches exactly */
  isExactly: (breakpoint: Breakpoint) => boolean;
  /** Check if current breakpoint is between two breakpoints (inclusive) */
  isBetween: (min: Breakpoint, max: Breakpoint) => boolean;
}

/**
 * Hook for responsive breakpoint detection
 */
export function useBreakpoint(): UseBreakpointReturn {
  const [viewport, setViewport] = useState<ViewportInfo>(getViewportInfo);

  useEffect(() => {
    // Update viewport on mount (for SSR hydration)
    setViewport(getViewportInfo());

    const handleResize = () => {
      setViewport(getViewportInfo());
    };

    // Use ResizeObserver for better performance if available
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(handleResize);
      observer.observe(document.documentElement);
      return () => observer.disconnect();
    }

    // Fallback to window resize event
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAtLeast = useCallback(
    (target: Breakpoint) => isBreakpointAtLeast(viewport.breakpoint, target),
    [viewport.breakpoint]
  );

  const isAtMost = useCallback(
    (target: Breakpoint) => isBreakpointAtMost(viewport.breakpoint, target),
    [viewport.breakpoint]
  );

  const isExactly = useCallback(
    (target: Breakpoint) => viewport.breakpoint === target,
    [viewport.breakpoint]
  );

  const isBetween = useCallback(
    (min: Breakpoint, max: Breakpoint) => isAtLeast(min) && isAtMost(max),
    [isAtLeast, isAtMost]
  );

  return useMemo(
    () => ({
      viewport,
      breakpoint: viewport.breakpoint,
      deviceType: viewport.deviceType,
      isMobile: viewport.deviceType === 'mobile',
      isTablet: viewport.deviceType === 'tablet',
      isDesktop: viewport.deviceType === 'desktop',
      isPortrait: viewport.isPortrait,
      isLandscape: viewport.isLandscape,
      isAtLeast,
      isAtMost,
      isExactly,
      isBetween,
    }),
    [viewport, isAtLeast, isAtMost, isExactly, isBetween]
  );
}

// Export for testing
export { getViewportInfo, BREAKPOINT_ORDER };
