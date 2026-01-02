'use client';

import React, { useState } from 'react';
import type { LocalizedHelpContent } from '@/types/help';

export interface InlineHelpProps {
  content: LocalizedHelpContent;
  expanded?: boolean;
  onToggle?: () => void;
  onLinkClick?: () => void;
}

export function InlineHelp({
  content,
  expanded: controlledExpanded,
  onToggle,
  onLinkClick,
}: InlineHelpProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  
  // Support both controlled and uncontrolled modes
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (isControlled) {
      onToggle?.();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  return (
    <div className="rounded-md border border-border bg-muted/30">
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={expanded}
        aria-controls={`inline-help-${content.id}`}
      >
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary-600"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-sm font-medium">{content.title}</span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted-foreground transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div
          id={`inline-help-${content.id}`}
          className="px-3 pb-3 pt-0 border-t border-border"
        >
          <p className="text-sm text-muted-foreground mt-3">
            {content.description}
          </p>

          {content.usage && (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                How to use
              </h4>
              <p className="text-sm">{content.usage}</p>
            </div>
          )}

          {content.consequences && (
            <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-xs text-amber-800 dark:text-amber-200">
              <span className="font-medium">Note: </span>
              {content.consequences}
            </div>
          )}

          {(content.learnMoreUrl || content.videoUrl) && (
            <div className="mt-3 flex gap-3 text-xs">
              {content.learnMoreUrl && (
                <a
                  href={content.learnMoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onLinkClick}
                  className="text-primary-600 hover:text-primary-700 hover:underline inline-flex items-center gap-1"
                >
                  Learn more
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}
              {content.videoUrl && (
                <a
                  href={content.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onLinkClick}
                  className="text-primary-600 hover:text-primary-700 hover:underline inline-flex items-center gap-1"
                >
                  Watch video
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
