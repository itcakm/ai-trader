'use client';

import React from 'react';

export interface SectionProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  priority?: 'primary' | 'secondary' | 'tertiary';
  className?: string;
}

const priorityStyles = {
  primary: {
    container: 'p-6 bg-card border border-border rounded-lg shadow-sm',
    title: 'text-xl font-semibold text-foreground',
    description: 'text-base text-muted-foreground',
  },
  secondary: {
    container: 'p-4 bg-muted/30 border border-border/50 rounded-md',
    title: 'text-lg font-medium text-foreground',
    description: 'text-sm text-muted-foreground',
  },
  tertiary: {
    container: 'p-3 border-l-2 border-border',
    title: 'text-base font-medium text-foreground',
    description: 'text-sm text-muted-foreground',
  },
};

export function Section({
  children,
  title,
  description,
  priority = 'primary',
  className = '',
}: SectionProps) {
  const styles = priorityStyles[priority];

  return (
    <section className={`${styles.container} ${className}`} aria-labelledby={title ? `section-${title.toLowerCase().replace(/\s+/g, '-')}` : undefined}>
      {(title || description) && (
        <header className="mb-4">
          {title && (
            <h2 id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`} className={styles.title}>
              {title}
            </h2>
          )}
          {description && <p className={`mt-1 ${styles.description}`}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export interface ActionGroupProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end' | 'between';
  direction?: 'horizontal' | 'vertical';
  className?: string;
}

const alignStyles = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};

export function ActionGroup({
  children,
  align = 'end',
  direction = 'horizontal',
  className = '',
}: ActionGroupProps) {
  return (
    <div
      className={`
        flex gap-3
        ${direction === 'horizontal' ? 'flex-row items-center' : 'flex-col items-stretch'}
        ${alignStyles[align]}
        ${className}
      `.trim()}
      role="group"
    >
      {children}
    </div>
  );
}

export interface PrimaryActionProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}

export function PrimaryAction({
  children,
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
}: PrimaryActionProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`
        px-6 py-2.5 text-base font-medium
        bg-primary-600 text-white
        rounded-md shadow-sm
        hover:bg-primary-700
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors duration-200
        ${className}
      `.trim()}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Processing...
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export interface SecondaryActionProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}

export function SecondaryAction({
  children,
  onClick,
  disabled = false,
  type = 'button',
  className = '',
}: SecondaryActionProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2 text-sm font-medium
        bg-background text-foreground
        border border-border rounded-md
        hover:bg-muted
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors duration-200
        ${className}
      `.trim()}
    >
      {children}
    </button>
  );
}

export interface DestructiveActionProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}

export function DestructiveAction({
  children,
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
}: DestructiveActionProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`
        px-4 py-2 text-sm font-medium
        bg-red-600 text-white
        rounded-md
        hover:bg-red-700
        focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors duration-200
        ${className}
      `.trim()}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Processing...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
