import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  as?: 'article' | 'section' | 'div';
}

export function Card({ children, className = '', as: Component = 'div', role, ...props }: CardProps) {
  return (
    <Component
      className={`
        bg-card text-card-foreground
        rounded-lg border border-border
        shadow-sm
        ${className}
      `.trim()}
      role={role}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardHeader({ children, className = '', ...props }: CardHeaderProps) {
  return (
    <div
      className={`px-6 py-4 border-b border-border ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function CardTitle({ children, className = '', as: Component = 'h3', ...props }: CardTitleProps) {
  return (
    <Component
      className={`text-lg font-semibold text-card-foreground ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardContent({ children, className = '', ...props }: CardContentProps) {
  return (
    <div className={`px-6 py-4 ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardFooter({ children, className = '', ...props }: CardFooterProps) {
  return (
    <div
      className={`px-6 py-4 border-t border-border ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
