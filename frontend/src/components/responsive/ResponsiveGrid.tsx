/**
 * Responsive Grid Component
 * Requirements: 14.1, 14.4
 * 
 * A grid layout that adapts columns based on viewport size.
 */

'use client';

import React from 'react';
import { useResponsive } from '@/providers/ResponsiveProvider';
import type { ResponsiveProps } from '@/types/mobile';

export interface ResponsiveGridProps extends ResponsiveProps, React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Number of columns on mobile */
  mobileCols?: 1 | 2 | 3 | 4 | 6 | 12;
  /** Number of columns on tablet */
  tabletCols?: 1 | 2 | 3 | 4 | 6 | 12;
  /** Number of columns on desktop */
  desktopCols?: 1 | 2 | 3 | 4 | 6 | 12;
  /** Gap between items */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** As element type */
  as?: keyof JSX.IntrinsicElements;
}

const colClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
};

const gapClasses: Record<string, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

export function ResponsiveGrid({
  children,
  mobileCols = 1,
  tabletCols = 2,
  desktopCols = 3,
  gap = 'md',
  mobileOnly,
  tabletOnly,
  desktopOnly,
  hideMobile,
  hideTablet,
  hideDesktop,
  className = '',
  as: Component = 'div',
  ...props
}: ResponsiveGridProps) {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  // Check visibility conditions
  if (mobileOnly && !isMobile) return null;
  if (tabletOnly && !isTablet) return null;
  if (desktopOnly && !isDesktop) return null;
  if (hideMobile && isMobile) return null;
  if (hideTablet && isTablet) return null;
  if (hideDesktop && isDesktop) return null;

  // Determine current columns based on device type
  let cols = mobileCols;
  if (isTablet) {
    cols = tabletCols;
  } else if (isDesktop) {
    cols = desktopCols;
  }

  const classes = [
    'grid',
    colClasses[cols],
    gapClasses[gap],
    className,
  ].filter(Boolean).join(' ');

  return React.createElement(
    Component,
    {
      className: classes,
      ...props,
    },
    children
  );
}
