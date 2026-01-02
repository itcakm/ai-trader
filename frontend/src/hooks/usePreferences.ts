import { useCallback, useEffect, useRef } from 'react';
import { usePreferencesStore, SyncStatus } from '@/store/preferences';
import type {
  UserPreferences,
  GridPreferences,
  WorkspaceLayout,
  ModuleType,
} from '@/types/preferences';

/**
 * Debounce delay for auto-sync (in milliseconds)
 */
const AUTO_SYNC_DELAY = 2000;

/**
 * Hook options
 */
export interface UsePreferencesOptions {
  autoSync?: boolean;
  syncDelay?: number;
}

/**
 * Hook return type
 */
export interface UsePreferencesReturn {
  // State
  preferences: UserPreferences;
  activeModule: ModuleType;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;

  // Preference setters
  setTheme: (theme: UserPreferences['theme']) => void;
  setLocale: (locale: UserPreferences['locale']) => void;
  setDefaultDashboard: (dashboard: string) => void;
  setPreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;

  // Grid preferences
  getGridState: (gridId: string) => GridPreferences;
  setGridState: (gridId: string, state: Partial<GridPreferences>) => void;

  // Workspace management
  workspaces: WorkspaceLayout[];
  activeWorkspace: WorkspaceLayout | null;
  addWorkspace: (workspace: Omit<WorkspaceLayout, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateWorkspace: (id: string, updates: Partial<Omit<WorkspaceLayout, 'id' | 'createdAt'>>) => void;
  deleteWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;

  // Module navigation
  setActiveModule: (module: ModuleType) => void;

  // Sync operations
  syncPreferences: () => Promise<void>;
  loadPreferencesFromBackend: () => Promise<void>;
  resetPreferences: () => void;
}

/**
 * Custom hook for managing user preferences with optional auto-sync
 */
export function usePreferences(
  options: UsePreferencesOptions = {}
): UsePreferencesReturn {
  const { autoSync = false, syncDelay = AUTO_SYNC_DELAY } = options;

  const store = usePreferencesStore();
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousPreferencesRef = useRef<string>(
    JSON.stringify(store.preferences)
  );

  // Auto-sync effect
  useEffect(() => {
    if (!autoSync) return;

    const currentPreferences = JSON.stringify(store.preferences);
    if (currentPreferences !== previousPreferencesRef.current) {
      previousPreferencesRef.current = currentPreferences;

      // Clear existing timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Schedule sync
      syncTimeoutRef.current = setTimeout(() => {
        store.syncPreferences().catch(console.error);
      }, syncDelay);
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [autoSync, syncDelay, store]);

  // Memoized getters
  const getGridState = useCallback(
    (gridId: string) => store.getGridState(gridId),
    [store]
  );

  const getActiveWorkspace = useCallback(
    () => store.getActiveWorkspace(),
    [store]
  );

  return {
    // State
    preferences: store.preferences,
    activeModule: store.activeModule,
    syncStatus: store.syncStatus,
    lastSyncedAt: store.lastSyncedAt,
    syncError: store.syncError,

    // Preference setters
    setTheme: store.setTheme,
    setLocale: store.setLocale,
    setDefaultDashboard: store.setDefaultDashboard,
    setPreference: store.setPreference,

    // Grid preferences
    getGridState,
    setGridState: store.setGridState,

    // Workspace management
    workspaces: store.preferences.workspaceLayouts,
    activeWorkspace: getActiveWorkspace(),
    addWorkspace: store.addWorkspace,
    updateWorkspace: store.updateWorkspace,
    deleteWorkspace: store.deleteWorkspace,
    setActiveWorkspace: store.setActiveWorkspace,

    // Module navigation
    setActiveModule: store.setActiveModule,

    // Sync operations
    syncPreferences: store.syncPreferences,
    loadPreferencesFromBackend: store.loadPreferencesFromBackend,
    resetPreferences: store.resetPreferences,
  };
}
