/**
 * Responsive Stack Component
 * Requirements: 14.1, 14.4
 * 
 * A flexible stack layout that adapts direction based on viewport size.
 */

'use client';

import React from 'react';
import { useResponsive } from '@/providers/ResponsiveProvider';
import type { ResponsiveProps, LayoutVariant } from '@/types/mobile';

export interface ResponsiveStackProps extends ResponsiveProps, React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Direction on mobile */
  mobileDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** Direction on tablet */
  tabletDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** Direction on desktop */
  desktopDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** Gap between items */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Alignment on cross axis */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Justification on main axis */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Whether items should wrap */
  wrap?: boolean;
  /** As element type */
  as?: keyof JSX.IntrinsicElements;
}

const gapClasses: Record<string, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

const alignClasses: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyClasses: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

export function ResponsiveStack({
  children,
  mobileDirection = 'column',
  tabletDirection,
  desktopDirection,
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  wrap = false,
  mobileOnly,
  tabletOnly,
  desktopOnly,
  hideMobile,
  hideTablet,
  hideDesktop,
  className = '',
  as: Component = 'div',
  ...props
}: ResponsiveStackProps) {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  // Check visibility conditions
  if (mobileOnly && !isMobile) return null;
  if (tabletOnly && !isTablet) return null;
  if (desktopOnly && !isDesktop) return null;
  if (hideMobile && isMobile) return null;
  if (hideTablet && isTablet) return null;
  if (hideDesktop && isDesktop) return null;

  // Determine current direction based on device type
  let direction = mobileDirection;
  if (isTablet && tabletDirection) {
    direction = tabletDirection;
  } else if (isDesktop && desktopDirection) {
    direction = desktopDirection;
  } else if (isDesktop && tabletDirection) {
    direction = tabletDirection;
  }

  const directionClasses: Record<string, string> = {
    row: 'flex-row',
    column: 'flex-col',
    'row-reverse': 'flex-row-reverse',
    'column-reverse': 'flex-col-reverse',
  };

  const classes = [
    'flex',
    directionClasses[direction],
    gapClasses[gap],
    alignClasses[align],
    justifyClasses[justify],
    wrap && 'flex-wrap',
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
