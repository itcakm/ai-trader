import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  UserPreferences,
  GridPreferences,
  WorkspaceLayout,
  ModuleType,
} from '@/types/preferences';
import {
  DEFAULT_USER_PREFERENCES,
  DEFAULT_GRID_PREFERENCES,
} from '@/types/preferences';

const PREFERENCES_STORAGE_KEY = 'crypto-trading-preferences';

/**
 * Backend sync status
 */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

/**
 * Preferences store state
 */
export interface PreferencesState {
  preferences: UserPreferences;
  activeModule: ModuleType;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
}

/**
 * Preferences store actions
 */
export interface PreferencesActions {
  // Preference setters
  setPreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  setTheme: (theme: UserPreferences['theme']) => void;
  setLocale: (locale: UserPreferences['locale']) => void;
  setDefaultDashboard: (dashboard: string) => void;

  // Grid preferences
  getGridState: (gridId: string) => GridPreferences;
  setGridState: (gridId: string, state: Partial<GridPreferences>) => void;

  // Workspace management
  addWorkspace: (workspace: Omit<WorkspaceLayout, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateWorkspace: (id: string, updates: Partial<Omit<WorkspaceLayout, 'id' | 'createdAt'>>) => void;
  deleteWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  getActiveWorkspace: () => WorkspaceLayout | null;

  // Module navigation
  setActiveModule: (module: ModuleType) => void;

  // Sync operations
  syncPreferences: () => Promise<void>;
  loadPreferencesFromBackend: () => Promise<void>;
  resetPreferences: () => void;
}

export type PreferencesStore = PreferencesState & PreferencesActions;

/**
 * Generate a unique ID for workspaces
 */
function generateId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Backend API client for preferences (mock implementation)
 * In production, this would call actual API endpoints
 */
const preferencesApi = {
  async save(preferences: UserPreferences): Promise<void> {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 100));
    // In production: await fetch('/api/preferences', { method: 'PUT', body: JSON.stringify(preferences) });
  },

  async load(): Promise<UserPreferences | null> {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 100));
    // In production: const res = await fetch('/api/preferences'); return res.json();
    return null;
  },
};

/**
 * Create the preferences store with persistence
 */
export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set, get) => ({
      // Initial state
      preferences: DEFAULT_USER_PREFERENCES,
      activeModule: 'dashboard' as ModuleType,
      syncStatus: 'idle' as SyncStatus,
      lastSyncedAt: null,
      syncError: null,

      // Generic preference setter
      setPreference: (key, value) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [key]: value,
          },
          syncStatus: 'idle',
        }));
      },

      // Convenience setters
      setTheme: (theme) => {
        get().setPreference('theme', theme);
      },

      setLocale: (locale) => {
        get().setPreference('locale', locale);
      },

      setDefaultDashboard: (dashboard) => {
        get().setPreference('defaultDashboard', dashboard);
      },

      // Grid preferences
      getGridState: (gridId) => {
        const { preferences } = get();
        return preferences.gridPreferences[gridId] || DEFAULT_GRID_PREFERENCES;
      },

      setGridState: (gridId, state) => {
        set((current) => ({
          preferences: {
            ...current.preferences,
            gridPreferences: {
              ...current.preferences.gridPreferences,
              [gridId]: {
                ...get().getGridState(gridId),
                ...state,
              },
            },
          },
          syncStatus: 'idle',
        }));
      },

      // Workspace management
      addWorkspace: (workspace) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newWorkspace: WorkspaceLayout = {
          ...workspace,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          preferences: {
            ...state.preferences,
            workspaceLayouts: [...state.preferences.workspaceLayouts, newWorkspace],
            activeWorkspaceId: id,
          },
          syncStatus: 'idle',
        }));

        return id;
      },

      updateWorkspace: (id, updates) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            workspaceLayouts: state.preferences.workspaceLayouts.map((ws) =>
              ws.id === id
                ? { ...ws, ...updates, updatedAt: new Date().toISOString() }
                : ws
            ),
          },
          syncStatus: 'idle',
        }));
      },

      deleteWorkspace: (id) => {
        set((state) => {
          const newLayouts = state.preferences.workspaceLayouts.filter(
            (ws) => ws.id !== id
          );
          const newActiveId =
            state.preferences.activeWorkspaceId === id
              ? newLayouts[0]?.id || ''
              : state.preferences.activeWorkspaceId;

          return {
            preferences: {
              ...state.preferences,
              workspaceLayouts: newLayouts,
              activeWorkspaceId: newActiveId,
            },
            syncStatus: 'idle',
          };
        });
      },

      setActiveWorkspace: (id) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            activeWorkspaceId: id,
          },
          syncStatus: 'idle',
        }));
      },

      getActiveWorkspace: () => {
        const { preferences } = get();
        return (
          preferences.workspaceLayouts.find(
            (ws) => ws.id === preferences.activeWorkspaceId
          ) || null
        );
      },

      // Module navigation
      setActiveModule: (module) => {
        set({ activeModule: module });
      },

      // Sync operations
      syncPreferences: async () => {
        const { preferences } = get();
        set({ syncStatus: 'syncing', syncError: null });

        try {
          await preferencesApi.save(preferences);
          set({
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
          });
        } catch (error) {
          set({
            syncStatus: 'error',
            syncError: error instanceof Error ? error.message : 'Sync failed',
          });
          throw error;
        }
      },

      loadPreferencesFromBackend: async () => {
        set({ syncStatus: 'syncing', syncError: null });

        try {
          const backendPreferences = await preferencesApi.load();
          if (backendPreferences) {
            set({
              preferences: backendPreferences,
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
            });
          } else {
            set({ syncStatus: 'synced' });
          }
        } catch (error) {
          set({
            syncStatus: 'error',
            syncError: error instanceof Error ? error.message : 'Load failed',
          });
          throw error;
        }
      },

      resetPreferences: () => {
        set({
          preferences: DEFAULT_USER_PREFERENCES,
          syncStatus: 'idle',
          lastSyncedAt: null,
          syncError: null,
        });
      },
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        preferences: state.preferences,
        activeModule: state.activeModule,
      }),
    }
  )
);

// Export storage key for testing
export { PREFERENCES_STORAGE_KEY };
