/**
 * Responsive Container Component
 * Requirements: 14.1, 14.4
 * 
 * A container that adapts to viewport size and respects safe area insets.
 */

'use client';

import React from 'react';
import { useResponsive } from '@/providers/ResponsiveProvider';
import type { ResponsiveProps } from '@/types/mobile';

export interface ResponsiveContainerProps extends ResponsiveProps, React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Apply safe area padding */
  safeArea?: boolean | 'top' | 'bottom' | 'left' | 'right' | 'horizontal' | 'vertical' | 'all';
  /** Maximum width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'none';
  /** Center the container */
  centered?: boolean;
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** As element type */
  as?: keyof JSX.IntrinsicElements;
}

const maxWidthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-full',
  none: '',
};

const paddingClasses: Record<string, string> = {
  none: '',
  sm: 'px-2 py-2 sm:px-4 sm:py-3',
  md: 'px-4 py-3 sm:px-6 sm:py-4',
  lg: 'px-4 py-4 sm:px-8 sm:py-6',
};

export function ResponsiveContainer({
  children,
  safeArea = false,
  maxWidth = 'none',
  centered = false,
  padding = 'md',
  mobileOnly,
  tabletOnly,
  desktopOnly,
  hideMobile,
  hideTablet,
  hideDesktop,
  className = '',
  style,
  as: Component = 'div',
  ...props
}: ResponsiveContainerProps) {
  const { isMobile, isTablet, isDesktop, safeAreaInsets } = useResponsive();

  // Check visibility conditions
  if (mobileOnly && !isMobile) return null;
  if (tabletOnly && !isTablet) return null;
  if (desktopOnly && !isDesktop) return null;
  if (hideMobile && isMobile) return null;
  if (hideTablet && isTablet) return null;
  if (hideDesktop && isDesktop) return null;

  // Build safe area styles
  const safeAreaStyle: React.CSSProperties = {};
  if (safeArea) {
    const applyTop = safeArea === true || safeArea === 'all' || safeArea === 'top' || safeArea === 'vertical';
    const applyBottom = safeArea === true || safeArea === 'all' || safeArea === 'bottom' || safeArea === 'vertical';
    const applyLeft = safeArea === true || safeArea === 'all' || safeArea === 'left' || safeArea === 'horizontal';
    const applyRight = safeArea === true || safeArea === 'all' || safeArea === 'right' || safeArea === 'horizontal';

    if (applyTop) safeAreaStyle.paddingTop = `max(${safeAreaInsets.top}px, env(safe-area-inset-top, 0px))`;
    if (applyBottom) safeAreaStyle.paddingBottom = `max(${safeAreaInsets.bottom}px, env(safe-area-inset-bottom, 0px))`;
    if (applyLeft) safeAreaStyle.paddingLeft = `max(${safeAreaInsets.left}px, env(safe-area-inset-left, 0px))`;
    if (applyRight) safeAreaStyle.paddingRight = `max(${safeAreaInsets.right}px, env(safe-area-inset-right, 0px))`;
  }

  const classes = [
    'w-full',
    maxWidthClasses[maxWidth],
    paddingClasses[padding],
    centered && 'mx-auto',
    className,
  ].filter(Boolean).join(' ');

  return React.createElement(
    Component,
    {
      className: classes,
      style: { ...safeAreaStyle, ...style },
      ...props,
    },
    children
  );
}
