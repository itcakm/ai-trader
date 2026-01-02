'use client';

import React from 'react';
import { useDirection } from './DirectionProvider';

export interface RTLAwareContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Additional classes for RTL mode */
  rtlClassName?: string;
  /** Additional classes for LTR mode */
  ltrClassName?: string;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * Container that applies direction-aware styling
 * Uses CSS logical properties for automatic RTL support
 */
export function RTLAwareContainer({
  children,
  className = '',
  rtlClassName = '',
  ltrClassName = '',
  as: Component = 'div',
}: RTLAwareContainerProps) {
  const { isRTL } = useDirection();

  const combinedClassName = [
    className,
    isRTL ? rtlClassName : ltrClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return <Component className={combinedClassName}>{children}</Component>;
}

export interface FlexRowProps {
  children: React.ReactNode;
  className?: string;
  /** Gap between items */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Alignment */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Justification */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Wrap items */
  wrap?: boolean;
  /** Reverse order in RTL */
  reverseInRTL?: boolean;
}

const gapClasses = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

const alignClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

/**
 * Flex row that automatically handles RTL direction
 */
export function FlexRow({
  children,
  className = '',
  gap = 'md',
  align = 'center',
  justify = 'start',
  wrap = false,
  reverseInRTL = false,
}: FlexRowProps) {
  const { isRTL } = useDirection();

  const shouldReverse = reverseInRTL && isRTL;

  const classes = [
    'flex',
    shouldReverse ? 'flex-row-reverse' : 'flex-row',
    gapClasses[gap],
    alignClasses[align],
    justifyClasses[justify],
    wrap ? 'flex-wrap' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
}

export interface FlexColProps {
  children: React.ReactNode;
  className?: string;
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: 'start' | 'center' | 'end' | 'stretch';
}

/**
 * Flex column component
 */
export function FlexCol({
  children,
  className = '',
  gap = 'md',
  align = 'stretch',
}: FlexColProps) {
  const classes = [
    'flex flex-col',
    gapClasses[gap],
    alignClasses[align],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
}

export interface InlineStartProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Positions content at the inline start (left in LTR, right in RTL)
 */
export function InlineStart({ children, className = '' }: InlineStartProps) {
  return (
    <div className={`inline-start ${className}`} style={{ marginInlineEnd: 'auto' }}>
      {children}
    </div>
  );
}

/**
 * Positions content at the inline end (right in LTR, left in RTL)
 */
export function InlineEnd({ children, className = '' }: InlineStartProps) {
  return (
    <div className={`inline-end ${className}`} style={{ marginInlineStart: 'auto' }}>
      {children}
    </div>
  );
}
