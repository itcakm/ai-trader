/**
 * Safe Area View Component
 * Requirements: 14.4
 * 
 * A container that respects device safe areas (notches, home indicators, etc.)
 */

'use client';

import React from 'react';
import { useSafeArea } from '@/hooks/useSafeArea';

export interface SafeAreaViewProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Which edges to apply safe area padding */
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  /** Minimum padding to apply even without safe area */
  minPadding?: number;
  /** As element type */
  as?: keyof JSX.IntrinsicElements;
}

export function SafeAreaView({
  children,
  edges = ['top', 'bottom', 'left', 'right'],
  minPadding = 0,
  className = '',
  style,
  as: Component = 'div',
  ...props
}: SafeAreaViewProps) {
  const { insets } = useSafeArea();

  const safeAreaStyle: React.CSSProperties = {};

  if (edges.includes('top')) {
    safeAreaStyle.paddingTop = `max(${Math.max(insets.top, minPadding)}px, env(safe-area-inset-top, ${minPadding}px))`;
  }
  if (edges.includes('bottom')) {
    safeAreaStyle.paddingBottom = `max(${Math.max(insets.bottom, minPadding)}px, env(safe-area-inset-bottom, ${minPadding}px))`;
  }
  if (edges.includes('left')) {
    safeAreaStyle.paddingLeft = `max(${Math.max(insets.left, minPadding)}px, env(safe-area-inset-left, ${minPadding}px))`;
  }
  if (edges.includes('right')) {
    safeAreaStyle.paddingRight = `max(${Math.max(insets.right, minPadding)}px, env(safe-area-inset-right, ${minPadding}px))`;
  }

  return React.createElement(
    Component,
    {
      className,
      style: { ...safeAreaStyle, ...style },
      ...props,
    },
    children
  );
}

/**
 * A spacer that takes up safe area space
 */
export interface SafeAreaSpacerProps {
  edge: 'top' | 'bottom' | 'left' | 'right';
  minSize?: number;
}

export function SafeAreaSpacer({ edge, minSize = 0 }: SafeAreaSpacerProps) {
  const { insets } = useSafeArea();

  const size = Math.max(insets[edge], minSize);
  const isVertical = edge === 'top' || edge === 'bottom';

  const style: React.CSSProperties = isVertical
    ? { height: `max(${size}px, env(safe-area-inset-${edge}, ${minSize}px))`, width: '100%' }
    : { width: `max(${size}px, env(safe-area-inset-${edge}, ${minSize}px))`, height: '100%' };

  return <div style={style} aria-hidden="true" />;
}
