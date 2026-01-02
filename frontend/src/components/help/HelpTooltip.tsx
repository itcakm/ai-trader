'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { LocalizedHelpContent } from '@/types/help';

export interface HelpTooltipProps {
  content: LocalizedHelpContent;
  visible: boolean;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
  onLinkClick?: () => void;
}

interface Position {
  top: number;
  left: number;
}

/**
 * Calculate tooltip position relative to anchor element
 */
function calculatePosition(
  anchorEl: HTMLElement | null,
  tooltipEl: HTMLElement | null
): Position {
  if (!anchorEl || !tooltipEl) {
    return { top: 0, left: 0 };
  }

  const anchorRect = anchorEl.getBoundingClientRect();
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Default: position below the anchor
  let top = anchorRect.bottom + 8;
  let left = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);

  // Adjust if tooltip would go off-screen horizontally
  if (left < 8) {
    left = 8;
  } else if (left + tooltipRect.width > viewportWidth - 8) {
    left = viewportWidth - tooltipRect.width - 8;
  }

  // Adjust if tooltip would go off-screen vertically (show above instead)
  if (top + tooltipRect.height > viewportHeight - 8) {
    top = anchorRect.top - tooltipRect.height - 8;
  }

  return { top, left };
}

export function HelpTooltip({
  content,
  visible,
  onClose,
  anchorEl,
  onLinkClick,
}: HelpTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });

  // Update position when visible or anchor changes
  useEffect(() => {
    if (visible && anchorEl && tooltipRef.current) {
      const newPosition = calculatePosition(anchorEl, tooltipRef.current);
      setPosition(newPosition);
    }
  }, [visible, anchorEl]);

  // Close on escape key
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible, onClose, anchorEl]);

  if (!visible) return null;

  return (
    <div
      ref={tooltipRef}
      role="tooltip"
      aria-live="polite"
      className="fixed z-50 max-w-sm bg-popover text-popover-foreground rounded-lg shadow-lg border border-border p-3 animate-in fade-in-0 zoom-in-95"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm">{content.title}</h4>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -mt-0.5 -mr-0.5"
          aria-label="Close help tooltip"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p className="text-sm text-muted-foreground mt-1">{content.description}</p>

      {content.consequences && (
        <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-xs text-amber-800 dark:text-amber-200">
          <span className="font-medium">Note: </span>
          {content.consequences}
        </div>
      )}

      {(content.learnMoreUrl || content.videoUrl) && (
        <div className="mt-2 pt-2 border-t border-border flex gap-3 text-xs">
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
  );
}
