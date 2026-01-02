'use client';

import React, { useEffect, useRef } from 'react';
import type { LocalizedHelpContent } from '@/types/help';

export interface HelpPanelProps {
  content: LocalizedHelpContent;
  visible: boolean;
  onClose: () => void;
  onLinkClick?: () => void;
}

export function HelpPanel({
  content,
  visible,
  onClose,
  onLinkClick,
}: HelpPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Focus trap and initial focus
  useEffect(() => {
    if (visible && panelRef.current) {
      const closeButton = panelRef.current.querySelector('button');
      closeButton?.focus();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-panel-title"
        className="fixed right-0 top-0 h-full w-full max-w-md bg-card text-card-foreground shadow-xl z-50 animate-in slide-in-from-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="help-panel-title" className="text-lg font-semibold">
            {content.title}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            aria-label="Close help panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
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

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Description */}
          <section className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Description
            </h3>
            <p className="text-sm">{content.description}</p>
          </section>

          {/* Usage instructions */}
          {content.usage && (
            <section className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                How to use
              </h3>
              <p className="text-sm">{content.usage}</p>
            </section>
          )}

          {/* Consequences */}
          {content.consequences && (
            <section className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Important notes
              </h3>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md text-sm text-amber-800 dark:text-amber-200">
                <div className="flex items-start gap-2">
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
                    className="mt-0.5 flex-shrink-0"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>{content.consequences}</span>
                </div>
              </div>
            </section>
          )}

          {/* Links */}
          {(content.learnMoreUrl || content.videoUrl) && (
            <section className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Resources
              </h3>
              <div className="space-y-2">
                {content.learnMoreUrl && (
                  <a
                    href={content.learnMoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onLinkClick}
                    className="flex items-center gap-2 p-3 rounded-md border border-border hover:bg-muted transition-colors text-sm"
                  >
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
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                    <span>Read documentation</span>
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
                      className="ml-auto text-muted-foreground"
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
                    className="flex items-center gap-2 p-3 rounded-md border border-border hover:bg-muted transition-colors text-sm"
                  >
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
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>Watch video tutorial</span>
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
                      className="ml-auto text-muted-foreground"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
