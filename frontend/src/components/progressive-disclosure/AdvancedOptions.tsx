'use client';

import React, { useState, useId } from 'react';

export interface AdvancedOptionsProps {
  children: React.ReactNode;
  label?: string;
  defaultExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  className?: string;
}

export function AdvancedOptions({
  children,
  label = 'Advanced Options',
  defaultExpanded = false,
  onExpandChange,
  className = '',
}: AdvancedOptionsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentId = useId();
  const triggerId = useId();

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onExpandChange?.(newState);
  };

  return (
    <div className={`mt-4 ${className}`}>
      <button
        id={triggerId}
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md px-2 py-1 transition-colors"
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{label}</span>
      </button>
      
      {isExpanded && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={triggerId}
          className="mt-3 pl-6 border-l-2 border-border animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {children}
        </div>
      )}
    </div>
  );
}
