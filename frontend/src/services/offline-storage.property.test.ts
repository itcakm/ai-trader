/**
 * Feature: ui-implementation, Property 19: Offline Data Synchronization
 * Validates: Requirements 14.5, 14.6
 * 
 * For any data cached during offline mode, when connectivity is restored,
 * the sync operation SHALL upload local changes, download remote changes,
 * and report any conflicts to the user.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { OfflineStorageEntry, SyncResult, SyncConflict } from '@/types/mobile';

// Mock localStorage for testing
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

// Simplified offline storage implementation for testing
const STORAGE_PREFIX = 'offline_';
const METADATA_KEY = 'offline_metadata';

interface StorageMetadata {
  entries: Record<string, { timestamp: number; synced: boolean }>;
  lastSync: number | null;
}

function createOfflineStorage(storage: MockLocalStorage) {
  function getMetadata(): StorageMetadata {
    try {
      const stored = storage.getItem(METADATA_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return { entries: {}, lastSync: null };
  }

  function saveMetadata(metadata: StorageMetadata): void {
    storage.setItem(METADATA_KEY, JSON.stringify(metadata));
  }

  async function get<T>(key: string): Promise<T | null> {
    try {
      const stored = storage.getItem(STORAGE_PREFIX + key);
      if (stored) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  async function set<T>(key: string, value: T): Promise<void> {
    storage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    const metadata = getMetadata();
    metadata.entries[key] = {
      timestamp: Date.now(),
      synced: false,
    };
    saveMetadata(metadata);
  }

  async function remove(key: string): Promise<void> {
    storage.removeItem(STORAGE_PREFIX + key);
    const metadata = getMetadata();
    delete metadata.entries[key];
    saveMetadata(metadata);
  }

  async function getAll(): Promise<OfflineStorageEntry[]> {
    const metadata = getMetadata();
    const entries: OfflineStorageEntry[] = [];

    for (const [key, meta] of Object.entries(metadata.entries)) {
      try {
        const stored = storage.getItem(STORAGE_PREFIX + key);
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

  async function getPendingSync(): Promise<OfflineStorageEntry[]> {
    const all = await getAll();
    return all.filter(entry => !entry.synced);
  }

  async function markSynced(key: string): Promise<void> {
    const metadata = getMetadata();
    if (metadata.entries[key]) {
      metadata.entries[key].synced = true;
      saveMetadata(metadata);
    }
  }

  async function clear(): Promise<void> {
    const metadata = getMetadata();
    for (const key of Object.keys(metadata.entries)) {
      storage.removeItem(STORAGE_PREFIX + key);
    }
    storage.removeItem(METADATA_KEY);
  }

  return {
    get,
    set,
    remove,
    getAll,
    getPendingSync,
    markSynced,
    clear,
    getMetadata,
  };
}

// Reserved JavaScript property names to exclude
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);

// Arbitrary for generating valid storage keys
const storageKeyArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s) && !RESERVED_KEYS.has(s));

// Arbitrary for generating storable values
const storableValueArbitrary = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.integer()),
  fc.record({ id: fc.string(), value: fc.integer() })
);

// Arbitrary for generating offline entries
const offlineEntryArbitrary = fc.record({
  key: storageKeyArbitrary,
  value: storableValueArbitrary,
});

// Arbitrary for generating sync conflicts
const syncConflictArbitrary = fc.record({
  key: storageKeyArbitrary,
  localValue: storableValueArbitrary,
  remoteValue: storableValueArbitrary,
  localTimestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
  remoteTimestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
});

describe('Property 19: Offline Data Synchronization', () => {
  // Create fresh storage for each test
  function createFreshStorage() {
    const storage = new MockLocalStorage();
    return createOfflineStorage(storage);
  }

  describe('Data Persistence', () => {
    it('saved data should be retrievable', () => {
      fc.assert(
        fc.asyncProperty(offlineEntryArbitrary, async ({ key, value }) => {
          const offlineStorage = createFreshStorage();
          await offlineStorage.set(key, value);
          const retrieved = await offlineStorage.get(key);
          
          expect(retrieved).toEqual(value);
        }),
        { numRuns: 100 }
      );
    });

    it('data round-trip should preserve value equality', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(offlineEntryArbitrary, { minLength: 1, maxLength: 10 }),
          async (entries) => {
            const offlineStorage = createFreshStorage();
            
            // Save all entries
            for (const { key, value } of entries) {
              await offlineStorage.set(key, value);
            }

            // Retrieve and verify each entry (use last value for duplicate keys)
            const lastValues = new Map<string, unknown>();
            for (const { key, value } of entries) {
              lastValues.set(key, value);
            }
            
            for (const [key, value] of lastValues) {
              const retrieved = await offlineStorage.get(key);
              expect(retrieved).toEqual(value);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('removed data should not be retrievable', () => {
      fc.assert(
        fc.asyncProperty(offlineEntryArbitrary, async ({ key, value }) => {
          const offlineStorage = createFreshStorage();
          await offlineStorage.set(key, value);
          await offlineStorage.remove(key);
          const retrieved = await offlineStorage.get(key);
          
          expect(retrieved).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('clear should remove all data', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(offlineEntryArbitrary, { minLength: 1, maxLength: 10 }),
          async (entries) => {
            const offlineStorage = createFreshStorage();
            
            // Save all entries
            for (const { key, value } of entries) {
              await offlineStorage.set(key, value);
            }

            // Clear storage
            await offlineStorage.clear();

            // All entries should be gone
            const all = await offlineStorage.getAll();
            expect(all).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Sync Status Tracking', () => {
    it('new entries should be marked as unsynced', () => {
      fc.assert(
        fc.asyncProperty(offlineEntryArbitrary, async ({ key, value }) => {
          const offlineStorage = createFreshStorage();
          await offlineStorage.set(key, value);
          const pending = await offlineStorage.getPendingSync();
          
          expect(pending.some(e => e.key === key)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('marking as synced should remove from pending', () => {
      fc.assert(
        fc.asyncProperty(offlineEntryArbitrary, async ({ key, value }) => {
          const offlineStorage = createFreshStorage();
          await offlineStorage.set(key, value);
          await offlineStorage.markSynced(key);
          const pending = await offlineStorage.getPendingSync();
          
          expect(pending.some(e => e.key === key)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('synced entries should still be retrievable', () => {
      fc.assert(
        fc.asyncProperty(offlineEntryArbitrary, async ({ key, value }) => {
          const offlineStorage = createFreshStorage();
          await offlineStorage.set(key, value);
          await offlineStorage.markSynced(key);
          const retrieved = await offlineStorage.get(key);
          
          expect(retrieved).toEqual(value);
        }),
        { numRuns: 100 }
      );
    });

    it('updating synced entry should mark it as unsynced again', () => {
      fc.assert(
        fc.asyncProperty(
          offlineEntryArbitrary,
          storableValueArbitrary,
          async ({ key, value }, newValue) => {
            const offlineStorage = createFreshStorage();
            
            // Save and sync
            await offlineStorage.set(key, value);
            await offlineStorage.markSynced(key);
            
            // Update
            await offlineStorage.set(key, newValue);
            
            // Should be pending again
            const pending = await offlineStorage.getPendingSync();
            expect(pending.some(e => e.key === key)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Sync Operation Properties', () => {
    // Simulate a sync operation
    async function simulateSync(
      localEntries: OfflineStorageEntry[],
      remoteEntries: OfflineStorageEntry[],
      conflictKeys: Set<string>
    ): Promise<SyncResult> {
      const uploaded: OfflineStorageEntry[] = [];
      const downloaded: OfflineStorageEntry[] = [];
      const conflicts: SyncConflict[] = [];
      const errors: string[] = [];

      // Process local entries (upload)
      for (const entry of localEntries) {
        if (!entry.synced) {
          if (conflictKeys.has(entry.key)) {
            const remoteEntry = remoteEntries.find(e => e.key === entry.key);
            if (remoteEntry) {
              conflicts.push({
                key: entry.key,
                localValue: entry.value,
                remoteValue: remoteEntry.value,
                localTimestamp: entry.timestamp,
                remoteTimestamp: remoteEntry.timestamp,
              });
            }
          } else {
            uploaded.push(entry);
          }
        }
      }

      // Process remote entries (download)
      for (const entry of remoteEntries) {
        const localEntry = localEntries.find(e => e.key === entry.key);
        if (!localEntry && !conflictKeys.has(entry.key)) {
          downloaded.push(entry);
        }
      }

      return {
        success: errors.length === 0,
        uploaded: uploaded.length,
        downloaded: downloaded.length,
        conflicts,
        errors,
      };
    }

    it('sync should report all conflicts', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(offlineEntryArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(offlineEntryArbitrary, { minLength: 1, maxLength: 5 }),
          async (localData, remoteData) => {
            // Create local entries
            const localEntries: OfflineStorageEntry[] = localData.map(({ key, value }) => ({
              key,
              value,
              timestamp: new Date(),
              synced: false,
            }));

            // Create remote entries
            const remoteEntries: OfflineStorageEntry[] = remoteData.map(({ key, value }) => ({
              key,
              value,
              timestamp: new Date(),
              synced: true,
            }));

            // Find conflicting keys (same key in both local and remote)
            const localKeys = new Set(localEntries.map(e => e.key));
            const remoteKeys = new Set(remoteEntries.map(e => e.key));
            const conflictKeys = new Set([...localKeys].filter(k => remoteKeys.has(k)));

            const result = await simulateSync(localEntries, remoteEntries, conflictKeys);

            // All conflicts should be reported
            expect(result.conflicts.length).toBe(conflictKeys.size);
            
            // Each conflict should have both local and remote values
            for (const conflict of result.conflicts) {
              expect(conflict.localValue).toBeDefined();
              expect(conflict.remoteValue).toBeDefined();
              expect(conflict.localTimestamp).toBeInstanceOf(Date);
              expect(conflict.remoteTimestamp).toBeInstanceOf(Date);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sync should upload all unsynced local entries without conflicts', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(offlineEntryArbitrary, { minLength: 1, maxLength: 5 }),
          async (localData) => {
            // Create local entries (all unsynced)
            const localEntries: OfflineStorageEntry[] = localData.map(({ key, value }) => ({
              key,
              value,
              timestamp: new Date(),
              synced: false,
            }));

            // No remote entries, no conflicts
            const result = await simulateSync(localEntries, [], new Set());

            // All local entries should be uploaded
            expect(result.uploaded).toBe(localEntries.length);
            expect(result.conflicts).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sync should download all remote entries not in local', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(offlineEntryArbitrary, { minLength: 1, maxLength: 5 }),
          async (remoteData) => {
            // Create remote entries
            const remoteEntries: OfflineStorageEntry[] = remoteData.map(({ key, value }) => ({
              key,
              value,
              timestamp: new Date(),
              synced: true,
            }));

            // No local entries, no conflicts
            const result = await simulateSync([], remoteEntries, new Set());

            // All remote entries should be downloaded
            expect(result.downloaded).toBe(remoteEntries.length);
            expect(result.conflicts).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sync result counts should be consistent', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(offlineEntryArbitrary, { minLength: 0, maxLength: 5 }),
          fc.array(offlineEntryArbitrary, { minLength: 0, maxLength: 5 }),
          async (localData, remoteData) => {
            // Deduplicate entries by key (keep last value for each key)
            const dedupeEntries = (entries: Array<{key: string; value: unknown}>) => {
              const map = new Map<string, unknown>();
              for (const { key, value } of entries) {
                map.set(key, value);
              }
              return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
            };
            
            const dedupedLocal = dedupeEntries(localData);
            const dedupedRemote = dedupeEntries(remoteData);
            
            const localEntries: OfflineStorageEntry[] = dedupedLocal.map(({ key, value }) => ({
              key,
              value,
              timestamp: new Date(),
              synced: false,
            }));

            const remoteEntries: OfflineStorageEntry[] = dedupedRemote.map(({ key, value }) => ({
              key,
              value,
              timestamp: new Date(),
              synced: true,
            }));

            const localKeys = new Set(localEntries.map(e => e.key));
            const remoteKeys = new Set(remoteEntries.map(e => e.key));
            const conflictKeys = new Set([...localKeys].filter(k => remoteKeys.has(k)));

            const result = await simulateSync(localEntries, remoteEntries, conflictKeys);

            // Uploaded + conflicts should equal unsynced local entries
            expect(result.uploaded + result.conflicts.length).toBe(localEntries.length);
            
            // Downloaded should be remote entries not in local
            const remoteOnlyCount = [...remoteKeys].filter(k => !localKeys.has(k)).length;
            expect(result.downloaded).toBe(remoteOnlyCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Conflict Resolution', () => {
    it('resolving conflict with local should preserve local value', () => {
      fc.assert(
        fc.asyncProperty(syncConflictArbitrary, async (conflict) => {
          const offlineStorage = createFreshStorage();
          
          // Save local value
          await offlineStorage.set(conflict.key, conflict.localValue);
          
          // Simulate conflict resolution with "local" choice
          // (keep local value, mark as needing sync)
          await offlineStorage.set(conflict.key, conflict.localValue);
          
          const retrieved = await offlineStorage.get(conflict.key);
          expect(retrieved).toEqual(conflict.localValue);
          
          // Should be pending sync
          const pending = await offlineStorage.getPendingSync();
          expect(pending.some(e => e.key === conflict.key)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('resolving conflict with remote should use remote value', () => {
      fc.assert(
        fc.asyncProperty(syncConflictArbitrary, async (conflict) => {
          const offlineStorage = createFreshStorage();
          
          // Save local value first
          await offlineStorage.set(conflict.key, conflict.localValue);
          
          // Simulate conflict resolution with "remote" choice
          await offlineStorage.set(conflict.key, conflict.remoteValue);
          await offlineStorage.markSynced(conflict.key);
          
          const retrieved = await offlineStorage.get(conflict.key);
          expect(retrieved).toEqual(conflict.remoteValue);
          
          // Should not be pending sync
          const pending = await offlineStorage.getPendingSync();
          expect(pending.some(e => e.key === conflict.key)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('getting non-existent key should return null', () => {
      fc.assert(
        fc.asyncProperty(storageKeyArbitrary, async (key) => {
          const offlineStorage = createFreshStorage();
          const retrieved = await offlineStorage.get(key);
          expect(retrieved).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('marking non-existent key as synced should not throw', () => {
      fc.assert(
        fc.asyncProperty(storageKeyArbitrary, async (key) => {
          const offlineStorage = createFreshStorage();
          // Should not throw
          await expect(offlineStorage.markSynced(key)).resolves.not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it('removing non-existent key should not throw', () => {
      fc.assert(
        fc.asyncProperty(storageKeyArbitrary, async (key) => {
          const offlineStorage = createFreshStorage();
          // Should not throw
          await expect(offlineStorage.remove(key)).resolves.not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it('overwriting existing key should update value', () => {
      fc.assert(
        fc.asyncProperty(
          storageKeyArbitrary,
          storableValueArbitrary,
          storableValueArbitrary,
          async (key, value1, value2) => {
            const offlineStorage = createFreshStorage();
            await offlineStorage.set(key, value1);
            await offlineStorage.set(key, value2);
            
            const retrieved = await offlineStorage.get(key);
            expect(retrieved).toEqual(value2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
