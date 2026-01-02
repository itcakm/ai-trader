/**
 * Offline Sync Hook
 * Requirements: 14.5, 14.6
 * 
 * Manages offline data synchronization with automatic sync on reconnection.
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { offlineStorage, getLastSyncTime, getStorageInfo } from '@/services/offline-storage';
import { useConnectivity } from './useConnectivity';
import type { SyncResult, SyncConflict, OfflineStorageEntry } from '@/types/mobile';

export interface UseOfflineSyncOptions {
  /** Auto-sync when connectivity is restored */
  autoSync?: boolean;
  /** Minimum interval between auto-syncs (ms) */
  syncInterval?: number;
  /** Callback when sync completes */
  onSyncComplete?: (result: SyncResult) => void;
  /** Callback when conflicts are detected */
  onConflict?: (conflicts: SyncConflict[]) => void;
}

export interface UseOfflineSyncReturn {
  /** Whether sync is in progress */
  isSyncing: boolean;
  /** Last sync result */
  lastSyncResult: SyncResult | null;
  /** Last sync timestamp */
  lastSyncAt: Date | null;
  /** Number of pending entries */
  pendingCount: number;
  /** Unresolved conflicts */
  conflicts: SyncConflict[];
  /** Storage info */
  storageInfo: { used: number; available: number; entries: number };
  /** Manually trigger sync */
  sync: () => Promise<SyncResult>;
  /** Save data for offline use */
  saveOffline: <T>(key: string, value: T) => Promise<void>;
  /** Get offline data */
  getOffline: <T>(key: string) => Promise<T | null>;
  /** Remove offline data */
  removeOffline: (key: string) => Promise<void>;
  /** Clear all offline data */
  clearOffline: () => Promise<void>;
  /** Resolve a conflict */
  resolveConflict: (key: string, resolution: 'local' | 'remote') => Promise<void>;
}

const DEFAULT_SYNC_INTERVAL = 30000; // 30 seconds

/**
 * Hook for offline data synchronization
 */
export function useOfflineSync(options: UseOfflineSyncOptions = {}): UseOfflineSyncReturn {
  const {
    autoSync = true,
    syncInterval = DEFAULT_SYNC_INTERVAL,
    onSyncComplete,
    onConflict,
  } = options;

  const { isOnline, wasRecentlyRestored } = useConnectivity();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(getLastSyncTime);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [storageInfo, setStorageInfo] = useState(getStorageInfo);
  
  const lastSyncTimeRef = useRef<number>(0);
  const syncInProgressRef = useRef(false);

  // Update pending count and storage info
  const updateStats = useCallback(async () => {
    const pending = await offlineStorage.getPendingSync();
    setPendingCount(pending.length);
    setStorageInfo(getStorageInfo());
    setLastSyncAt(getLastSyncTime());
  }, []);

  // Perform sync
  const sync = useCallback(async (): Promise<SyncResult> => {
    if (syncInProgressRef.current) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: [],
        errors: ['Sync already in progress'],
      };
    }

    if (!isOnline) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: [],
        errors: ['Device is offline'],
      };
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);

    try {
      const result = await offlineStorage.sync();
      
      setLastSyncResult(result);
      setLastSyncAt(new Date());
      lastSyncTimeRef.current = Date.now();
      
      if (result.conflicts.length > 0) {
        setConflicts(prev => [...prev, ...result.conflicts]);
        onConflict?.(result.conflicts);
      }
      
      onSyncComplete?.(result);
      await updateStats();
      
      return result;
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, onSyncComplete, onConflict, updateStats]);

  // Auto-sync when connectivity is restored
  useEffect(() => {
    if (!autoSync || !isOnline || !wasRecentlyRestored) return;
    
    const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
    
    if (timeSinceLastSync >= syncInterval) {
      sync();
    }
  }, [autoSync, isOnline, wasRecentlyRestored, syncInterval, sync]);

  // Update stats on mount and when online status changes
  useEffect(() => {
    updateStats();
  }, [updateStats, isOnline]);

  // Save data offline
  const saveOffline = useCallback(async <T>(key: string, value: T): Promise<void> => {
    await offlineStorage.set(key, value);
    await updateStats();
  }, [updateStats]);

  // Get offline data
  const getOffline = useCallback(async <T>(key: string): Promise<T | null> => {
    return offlineStorage.get<T>(key);
  }, []);

  // Remove offline data
  const removeOffline = useCallback(async (key: string): Promise<void> => {
    await offlineStorage.remove(key);
    await updateStats();
  }, [updateStats]);

  // Clear all offline data
  const clearOffline = useCallback(async (): Promise<void> => {
    await offlineStorage.clear();
    setConflicts([]);
    await updateStats();
  }, [updateStats]);

  // Resolve a conflict
  const resolveConflict = useCallback(async (key: string, resolution: 'local' | 'remote'): Promise<void> => {
    const conflict = conflicts.find(c => c.key === key);
    if (!conflict) return;

    if (resolution === 'local') {
      // Keep local value, mark as needing sync
      await offlineStorage.set(key, conflict.localValue);
    } else {
      // Use remote value, mark as synced
      await offlineStorage.set(key, conflict.remoteValue);
      await offlineStorage.markSynced(key);
    }

    setConflicts(prev => prev.filter(c => c.key !== key));
    await updateStats();
  }, [conflicts, updateStats]);

  return useMemo(
    () => ({
      isSyncing,
      lastSyncResult,
      lastSyncAt,
      pendingCount,
      conflicts,
      storageInfo,
      sync,
      saveOffline,
      getOffline,
      removeOffline,
      clearOffline,
      resolveConflict,
    }),
    [
      isSyncing,
      lastSyncResult,
      lastSyncAt,
      pendingCount,
      conflicts,
      storageInfo,
      sync,
      saveOffline,
      getOffline,
      removeOffline,
      clearOffline,
      resolveConflict,
    ]
  );
}
