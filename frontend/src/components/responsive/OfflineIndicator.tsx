/**
 * Offline Indicator Component
 * Requirements: 14.5, 14.6
 * 
 * Displays offline status and sync information to users.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useOfflineSync } from '@/hooks/useOfflineSync';

export interface OfflineIndicatorProps {
  /** Position of the indicator */
  position?: 'top' | 'bottom';
  /** Show sync status */
  showSyncStatus?: boolean;
  /** Show pending count */
  showPendingCount?: boolean;
  /** Custom offline message */
  offlineMessage?: string;
  /** Custom online restored message */
  restoredMessage?: string;
  /** Auto-hide restored message after ms (0 to disable) */
  autoHideRestoredMs?: number;
  /** Additional CSS classes */
  className?: string;
}

export function OfflineIndicator({
  position = 'top',
  showSyncStatus = true,
  showPendingCount = true,
  offlineMessage = 'You are offline',
  restoredMessage = 'Connection restored',
  autoHideRestoredMs = 3000,
  className = '',
}: OfflineIndicatorProps) {
  const { isOnline, isOffline, wasRecentlyRestored } = useConnectivity();
  const { isSyncing, pendingCount } = useOfflineSync({ autoSync: true });
  
  const [showRestored, setShowRestored] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Show restored message when connectivity is restored
  useEffect(() => {
    if (wasRecentlyRestored && isOnline) {
      setShowRestored(true);
      setIsVisible(true);
      
      if (autoHideRestoredMs > 0) {
        const timeout = setTimeout(() => {
          setShowRestored(false);
          // Keep visible if syncing or has pending
          if (!isSyncing && pendingCount === 0) {
            setIsVisible(false);
          }
        }, autoHideRestoredMs);
        
        return () => clearTimeout(timeout);
      }
    }
  }, [wasRecentlyRestored, isOnline, autoHideRestoredMs, isSyncing, pendingCount]);

  // Show indicator when offline
  useEffect(() => {
    if (isOffline) {
      setIsVisible(true);
      setShowRestored(false);
    } else if (!showRestored && !isSyncing && pendingCount === 0) {
      setIsVisible(false);
    }
  }, [isOffline, showRestored, isSyncing, pendingCount]);

  if (!isVisible) return null;

  const positionClasses = position === 'top'
    ? 'top-0 safe-area-top'
    : 'bottom-0 safe-area-bottom';

  const bgColor = isOffline
    ? 'bg-amber-500 dark:bg-amber-600'
    : showRestored
    ? 'bg-green-500 dark:bg-green-600'
    : isSyncing
    ? 'bg-blue-500 dark:bg-blue-600'
    : 'bg-gray-500 dark:bg-gray-600';

  return (
    <div
      className={`
        fixed left-0 right-0 z-50
        ${positionClasses}
        ${bgColor}
        text-white text-sm
        px-4 py-2
        flex items-center justify-center gap-2
        transition-all duration-300
        ${className}
      `.trim()}
      role="status"
      aria-live="polite"
    >
      {/* Status Icon */}
      {isOffline && (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
          />
        </svg>
      )}
      
      {showRestored && !isOffline && (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
          />
        </svg>
      )}
      
      {isSyncing && !isOffline && !showRestored && (
        <svg
          className="w-4 h-4 animate-spin"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      )}

      {/* Message */}
      <span>
        {isOffline && offlineMessage}
        {showRestored && !isOffline && restoredMessage}
        {isSyncing && !isOffline && !showRestored && 'Syncing...'}
      </span>

      {/* Pending Count */}
      {showPendingCount && pendingCount > 0 && !showRestored && (
        <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
          {pendingCount} pending
        </span>
      )}

      {/* Sync Status */}
      {showSyncStatus && isSyncing && (
        <span className="text-xs opacity-75">
          Synchronizing data...
        </span>
      )}
    </div>
  );
}

/**
 * Compact offline badge for use in headers/toolbars
 */
export interface OfflineBadgeProps {
  className?: string;
}

export function OfflineBadge({ className = '' }: OfflineBadgeProps) {
  const { isOffline } = useConnectivity();
  const { pendingCount } = useOfflineSync({ autoSync: true });

  if (!isOffline && pendingCount === 0) return null;

  return (
    <div
      className={`
        inline-flex items-center gap-1
        px-2 py-1 rounded-full
        text-xs font-medium
        ${isOffline
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        }
        ${className}
      `.trim()}
      role="status"
    >
      {isOffline ? (
        <>
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Offline
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          {pendingCount} pending
        </>
      )}
    </div>
  );
}
