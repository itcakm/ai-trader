'use client';

import React, { useRef, useState, useCallback } from 'react';
import type { HelpVariant } from '@/types/help';
import { useContextualHelp } from '@/providers/ContextualHelpProvider';
import { HelpTooltip } from './HelpTooltip';
import { HelpPanel } from './HelpPanel';
import { InlineHelp } from './InlineHelp';

export interface WithHelpProps {
  helpId: string;
  variant?: HelpVariant;
  children: React.ReactNode;
  showIcon?: boolean;
  iconPosition?: 'left' | 'right';
  className?: string;
}

/**
 * Help icon component
 */
function HelpIcon({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground hover:text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors ${className}`}
      aria-label="Show help"
      type="button"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </button>
  );
}

/**
 * WithHelp wrapper component
 * Wraps any element with contextual help functionality
 */
export function WithHelp({
  helpId,
  variant = 'tooltip',
  children,
  showIcon = true,
  iconPosition = 'right',
  className = '',
}: WithHelpProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [inlineExpanded, setInlineExpanded] = useState(false);

  const { getLocalizedHelp, trackHelpUsage } = useContextualHelp();
  const helpContent = getLocalizedHelp(helpId);

  const handleShowHelp = useCallback(() => {
    if (!helpContent) return;

    trackHelpUsage(helpId, 'view');

    switch (variant) {
      case 'tooltip':
        setShowTooltip(true);
        break;
      case 'panel':
        setShowPanel(true);
        trackHelpUsage(helpId, 'expand');
        break;
      case 'inline':
        setInlineExpanded(!inlineExpanded);
        if (!inlineExpanded) {
          trackHelpUsage(helpId, 'expand');
        }
        break;
    }
  }, [helpContent, helpId, variant, inlineExpanded, trackHelpUsage]);

  const handleCloseTooltip = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const handleClosePanel = useCallback(() => {
    setShowPanel(false);
  }, []);

  const handleLinkClick = useCallback(() => {
    trackHelpUsage(helpId, 'link_click');
  }, [helpId, trackHelpUsage]);

  // If no help content is registered, just render children
  if (!helpContent) {
    return <>{children}</>;
  }

  // Inline variant renders differently
  if (variant === 'inline') {
    return (
      <div className={className}>
        {children}
        <div className="mt-2">
          <InlineHelp
            content={helpContent}
            expanded={inlineExpanded}
            onToggle={() => {
              setInlineExpanded(!inlineExpanded);
              if (!inlineExpanded) {
                trackHelpUsage(helpId, 'view');
                trackHelpUsage(helpId, 'expand');
              }
            }}
            onLinkClick={handleLinkClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`inline-flex items-center gap-1 ${className}`}>
      {showIcon && iconPosition === 'left' && (
        <HelpIcon onClick={handleShowHelp} />
      )}
      
      {children}
      
      {showIcon && iconPosition === 'right' && (
        <span ref={iconRef as React.RefObject<HTMLSpanElement>}>
          <HelpIcon onClick={handleShowHelp} />
        </span>
      )}

      {/* Tooltip */}
      {variant === 'tooltip' && (
        <HelpTooltip
          content={helpContent}
          visible={showTooltip}
          onClose={handleCloseTooltip}
          anchorEl={containerRef.current}
          onLinkClick={handleLinkClick}
        />
      )}

      {/* Panel */}
      {variant === 'panel' && (
        <HelpPanel
          content={helpContent}
          visible={showPanel}
          onClose={handleClosePanel}
          onLinkClick={handleLinkClick}
        />
      )}
    </div>
  );
}
