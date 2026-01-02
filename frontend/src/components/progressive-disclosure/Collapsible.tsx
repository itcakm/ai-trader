'use client';

import React, { useState, useRef, useEffect, useId } from 'react';

export interface CollapsibleProps {
  children: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  icon?: React.ReactNode;
}

export function Collapsible({
  children,
  title,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
  className = '',
  triggerClassName = '',
  contentClassName = '',
  icon,
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const triggerId = useId();
  const contentId = useId();

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, isOpen]);

  const handleToggle = () => {
    if (disabled) return;
    const newState = !isOpen;
    setIsOpen(newState);
    onOpenChange?.(newState);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle();
    }
  };

  return (
    <div className={`border border-border rounded-lg ${className}`}>
      <button
        id={triggerId}
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className={`
          w-full flex items-center justify-between px-4 py-3
          text-left font-medium text-foreground
          hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          ${triggerClassName}
        `.trim()}
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={contentId}
        ref={contentRef}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!isOpen}
        style={{
          maxHeight: isOpen ? contentHeight : 0,
          overflow: 'hidden',
          transition: 'max-height 200ms ease-in-out',
        }}
      >
        <div className={`px-4 py-3 border-t border-border ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

export interface CollapsibleGroupProps {
  children: React.ReactNode;
  accordion?: boolean;
  className?: string;
}

export function CollapsibleGroup({ children, accordion = false, className = '' }: CollapsibleGroupProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!accordion) {
    return <div className={`space-y-2 ${className}`}>{children}</div>;
  }

  return (
    <div className={`space-y-2 ${className}`} role="group">
      {React.Children.map(children, (child, index) => {
        if (React.isValidElement<CollapsibleProps>(child)) {
          return React.cloneElement(child, {
            defaultOpen: openIndex === index,
            onOpenChange: (isOpen: boolean) => {
              if (isOpen) {
                setOpenIndex(index);
              } else if (openIndex === index) {
                setOpenIndex(null);
              }
              child.props.onOpenChange?.(isOpen);
            },
          });
        }
        return child;
      })}
    </div>
  );
}
