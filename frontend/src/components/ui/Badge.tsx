import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const variantAriaLabels: Record<BadgeVariant, string> = {
  default: '',
  success: 'Success: ',
  warning: 'Warning: ',
  error: 'Error: ',
  info: 'Information: ',
};

export function Badge({ variant = 'default', children, className = '', 'aria-label': ariaLabel, ...props }: BadgeProps) {
  const computedAriaLabel = ariaLabel || (variant !== 'default' ? `${variantAriaLabels[variant]}${children}` : undefined);
  
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5
        text-xs font-medium rounded-full
        ${variantStyles[variant]}
        ${className}
      `.trim()}
      role={variant !== 'default' ? 'status' : undefined}
      aria-label={computedAriaLabel}
      {...props}
    >
      {children}
    </span>
  );
}
