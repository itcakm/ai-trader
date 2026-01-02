/**
 * Offline Storage Service
 * Requirements: 14.5, 14.6
 * 
 * Provides offline data caching and synchronization functionality.
 */

import type {
  OfflineStorage,
  OfflineStorageEntry,
  SyncResult,
  SyncConflict,
} from '@/types/mobile';

const STORAGE_PREFIX = 'offline_';
const METADATA_KEY = 'offline_metadata';

interface StorageMetadata {
  entries: Record<string, { timestamp: number; synced: boolean }>;
  lastSync: number | null;
}

/**
 * Get storage metadata
 */
function getMetadata(): StorageMetadata {
  if (typeof window === 'undefined') {
    return { entries: {}, lastSync: null };
  }
  
  try {
    const stored = localStorage.getItem(METADATA_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  
  return { entries: {}, lastSync: null };
}

/**
 * Save storage metadata
 */
function saveMetadata(metadata: StorageMetadata): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get a value from offline storage
 */
async function get<T>(key: string): Promise<T | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored) {
      return JSON.parse(stored) as T;
    }
  } catch {
    // Ignore parse errors
  }
  
  return null;
}

/**
 * Set a value in offline storage
 */
async function set<T>(key: string, value: T): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    
    // Update metadata
    const metadata = getMetadata();
    metadata.entries[key] = {
      timestamp: Date.now(),
      synced: false,
    };
    saveMetadata(metadata);
  } catch (error) {
    console.error('Failed to save to offline storage:', error);
    throw new Error('Failed to save to offline storage');
  }
}

/**
 * Remove a value from offline storage
 */
async function remove(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    
    // Update metadata
    const metadata = getMetadata();
    delete metadata.entries[key];
    saveMetadata(metadata);
  } catch {
    // Ignore removal errors
  }
}

/**
 * Get all entries from offline storage
 */
async function getAll(): Promise<OfflineStorageEntry[]> {
  if (typeof window === 'undefined') return [];
  
  const metadata = getMetadata();
  const entries: OfflineStorageEntry[] = [];
  
  for (const [key, meta] of Object.entries(metadata.entries)) {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + key);
      if (stored) {
        entries.push({
          key,
          value: JSON.parse(stored),
          timestamp: new Date(meta.timestamp),
          synced: meta.synced,
        });
      }
    } catch {
      // Skip invalid entries
    }
  }
  
  return entries;
}

/**
 * Get entries pending synchronization
 */
async function getPendingSync(): Promise<OfflineStorageEntry[]> {
  const all = await getAll();
  return all.filter(entry => !entry.synced);
}

/**
 * Mark an entry as synced
 */
async function markSynced(key: string): Promise<void> {
  const metadata = getMetadata();
  
  if (metadata.entries[key]) {
    metadata.entries[key].synced = true;
    saveMetadata(metadata);
  }
}

/**
 * Sync handler type
 */
type SyncHandler = (entries: OfflineStorageEntry[]) => Promise<{
  uploaded: OfflineStorageEntry[];
  downloaded: OfflineStorageEntry[];
  conflicts: SyncConflict[];
  errors: string[];
}>;

// Registered sync handler
let syncHandler: SyncHandler | null = null;

/**
 * Register a sync handler
 */
export function registerSyncHandler(handler: SyncHandler): void {
  syncHandler = handler;
}

/**
 * Synchronize offline data with backend
 */
async function sync(): Promise<SyncResult> {
  if (!syncHandler) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: [],
      errors: ['No sync handler registered'],
    };
  }
  
  try {
    const pending = await getPendingSync();
    const result = await syncHandler(pending);
    
    // Mark uploaded entries as synced
    for (const entry of result.uploaded) {
      await markSynced(entry.key);
    }
    
    // Store downloaded entries
    for (const entry of result.downloaded) {
      await set(entry.key, entry.value);
      await markSynced(entry.key);
    }
    
    // Update last sync time
    const metadata = getMetadata();
    metadata.lastSync = Date.now();
    saveMetadata(metadata);
    
    return {
      success: result.errors.length === 0,
      uploaded: result.uploaded.length,
      downloaded: result.downloaded.length,
      conflicts: result.conflicts,
      errors: result.errors,
    };
  } catch (error) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: [],
      errors: [error instanceof Error ? error.message : 'Sync failed'],
    };
  }
}

/**
 * Clear all offline storage
 */
async function clear(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  const metadata = getMetadata();
  
  // Remove all entries
  for (const key of Object.keys(metadata.entries)) {
    localStorage.removeItem(STORAGE_PREFIX + key);
  }
  
  // Clear metadata
  localStorage.removeItem(METADATA_KEY);
}

/**
 * Get last sync timestamp
 */
export function getLastSyncTime(): Date | null {
  const metadata = getMetadata();
  return metadata.lastSync ? new Date(metadata.lastSync) : null;
}

/**
 * Get storage usage info
 */
export function getStorageInfo(): { used: number; available: number; entries: number } {
  if (typeof window === 'undefined') {
    return { used: 0, available: 0, entries: 0 };
  }
  
  const metadata = getMetadata();
  let used = 0;
  
  for (const key of Object.keys(metadata.entries)) {
    const item = localStorage.getItem(STORAGE_PREFIX + key);
    if (item) {
      used += item.length * 2; // UTF-16 characters
    }
  }
  
  // Estimate available storage (5MB typical limit)
  const available = 5 * 1024 * 1024 - used;
  
  return {
    used,
    available: Math.max(0, available),
    entries: Object.keys(metadata.entries).length,
  };
}

/**
 * Offline Storage implementation
 */
export const offlineStorage: OfflineStorage = {
  get,
  set,
  remove,
  getAll,
  getPendingSync,
  markSynced,
  sync,
  clear,
};

export default offlineStorage;
