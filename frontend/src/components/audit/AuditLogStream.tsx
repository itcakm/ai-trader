'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AuditLogEntry, AuditLogFilter } from '@/types/audit';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuditLogStream } from './useAuditLog';

/**
 * Props for AuditLogStream component
 */
export interface AuditLogStreamProps {
  /** Filter to apply to streamed entries */
  filter: AuditLogFilter;
  /** Maximum number of entries to display */
  maxEntries?: number;
  /** Callback when an entry is clicked */
  onEntryClick?: (entry: AuditLogEntry) => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * Get severity badge variant
 */
function getSeverityVariant(severity: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString();
}

/**
 * AuditLogStream - Real-time streaming view of audit logs
 * 
 * Features:
 * - WebSocket-based real-time updates
 * - Auto-scroll to new entries
 * - Pause/resume streaming
 * - Filter applied to stream
 * 
 * Validates: Requirements 11.4
 */
export function AuditLogStream({
  filter,
  maxEntries = 50,
  onEntryClick,
  className = '',
}: AuditLogStreamProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [localEntries, setLocalEntries] = useState<AuditLogEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { subscribe, isStreaming, entries, clearEntries } = useAuditLogStream();

  // Handle new entries from stream
  const handleNewEntry = useCallback(
    (entry: AuditLogEntry) => {
      if (!isPaused) {
        setLocalEntries((prev) => [entry, ...prev].slice(0, maxEntries));
      }
    },
    [isPaused, maxEntries]
  );

  // Subscribe to stream
  useEffect(() => {
    const unsubscribe = subscribe(filter, handleNewEntry);
    return () => {
      unsubscribe();
    };
  }, [filter, subscribe, handleNewEntry]);

  // Sync with hook entries when not paused
  useEffect(() => {
    if (!isPaused) {
      setLocalEntries(entries.slice(0, maxEntries));
    }
  }, [entries, isPaused, maxEntries]);

  // Auto-scroll to top when new entries arrive
  useEffect(() => {
    if (!isPaused && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [localEntries, isPaused]);

  const handleClear = () => {
    clearEntries();
    setLocalEntries([]);
  };

  return (
    <div
      className={`flex flex-col border border-border rounded-lg overflow-hidden bg-background ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <h3 className="font-medium">Live Stream</h3>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isStreaming && !isPaused
                  ? 'bg-green-500 animate-pulse'
                  : 'bg-muted-foreground'
              }`}
            />
            <span className="text-sm text-muted-foreground">
              {isStreaming && !isPaused
                ? 'Connected'
                : isPaused
                ? 'Paused'
                : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? (
              <>
                <svg
                  className="w-4 h-4 mr-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                Resume
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Pause
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={localEntries.length === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Stream Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto max-h-96"
        role="log"
        aria-live="polite"
        aria-label="Audit log stream"
      >
        {localEntries.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <p>Waiting for events...</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {localEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onEntryClick?.(entry)}
                className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors focus:outline-none focus:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={getSeverityVariant(entry.severity)}
                        className="text-xs"
                      >
                        {entry.severity}
                      </Badge>
                      <span className="font-medium text-sm truncate">
                        {entry.action}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {entry.userName} • {entry.module.replace(/_/g, ' ')} •{' '}
                      {entry.resource}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        {localEntries.length} of {maxEntries} max entries
        {isPaused && ' (paused)'}
      </div>
    </div>
  );
}

export default AuditLogStream;
