'use client';

import React from 'react';

export interface VisuallyHiddenProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  focusable?: boolean;
}

/**
 * VisuallyHidden component hides content visually while keeping it accessible to screen readers.
 * Use this for providing additional context to assistive technologies.
 */
export function VisuallyHidden({
  children,
  as: Component = 'span',
  focusable = false,
}: VisuallyHiddenProps) {
  const className = focusable
    ? 'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-background focus:text-foreground focus:rounded-md focus:shadow-lg'
    : 'sr-only';

  return <Component className={className}>{children}</Component>;
}

/**
 * LiveRegion component for announcing dynamic content changes to screen readers.
 */
export interface LiveRegionProps {
  children: React.ReactNode;
  priority?: 'polite' | 'assertive';
  atomic?: boolean;
  relevant?: 'additions' | 'removals' | 'text' | 'all';
}

export function LiveRegion({
  children,
  priority = 'polite',
  atomic = true,
  relevant = 'additions',
}: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className="sr-only"
    >
      {children}
    </div>
  );
}

/**
 * Announcer component for programmatic screen reader announcements.
 */
export interface AnnouncerProps {
  message: string;
  priority?: 'polite' | 'assertive';
}

export function Announcer({ message, priority = 'polite' }: AnnouncerProps) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
