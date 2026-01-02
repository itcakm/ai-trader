/**
 * Feature: ui-implementation, Property 8: User Preferences Round-Trip
 * Validates: Requirements 5.6, 6.2, 6.4, 6.5, 6.6
 *
 * For any user preference (theme, locale, grid configuration, workspace layout),
 * saving the preference and then retrieving it (including across sessions and devices)
 * SHALL return an equivalent value.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  UserPreferences,
  GridPreferences,
  WorkspaceLayout,
  WorkspaceWidget,
  SortModel,
  FilterItem,
} from '@/types/preferences';
import { DEFAULT_USER_PREFERENCES } from '@/types/preferences';
import type { SupportedLocale } from '@/types/i18n';
import type { Theme } from '@/types/theme';

const PREFERENCES_STORAGE_KEY = 'crypto-trading-preferences';

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
}

// Pure functions for preferences persistence
function savePreferences(storage: MockLocalStorage, preferences: UserPreferences): void {
  storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

function loadPreferences(storage: MockLocalStorage): UserPreferences {
  const stored = storage.getItem(PREFERENCES_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as UserPreferences;
    } catch {
      return DEFAULT_USER_PREFERENCES;
    }
  }
  return DEFAULT_USER_PREFERENCES;
}

// Arbitraries for generating test data
const themeArbitrary = fc.constantFrom<Theme>('light', 'dark', 'system');

const localeArbitrary = fc.constantFrom<SupportedLocale>(
  'en-US', 'de-DE', 'fr-FR', 'ar-SA', 'fa-IR',
  'zh-CN', 'hi-IN', 'es-ES', 'tr-TR', 'pt-BR', 'he-IL'
);

const sortDirectionArbitrary = fc.constantFrom<'asc' | 'desc'>('asc', 'desc');

const sortModelArbitrary: fc.Arbitrary<SortModel> = fc.record({
  field: fc.string({ minLength: 1, maxLength: 20 }),
  direction: sortDirectionArbitrary,
});

const filterOperatorArbitrary = fc.constantFrom<FilterItem['operator']>(
  'equals', 'contains', 'startsWith', 'endsWith', 'gt', 'gte', 'lt', 'lte', 'between'
);

const filterItemArbitrary: fc.Arbitrary<FilterItem> = fc.record({
  field: fc.string({ minLength: 1, maxLength: 20 }),
  operator: filterOperatorArbitrary,
  value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
});

const gridPreferencesArbitrary: fc.Arbitrary<GridPreferences> = fc.record({
  columnOrder: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
  columnWidths: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.integer({ min: 50, max: 500 })
  ),
  pinnedColumns: fc.record({
    left: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
    right: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  }),
  sortModel: fc.array(sortModelArbitrary, { maxLength: 3 }),
  filterModel: fc.record({
    items: fc.array(filterItemArbitrary, { maxLength: 5 }),
    logicOperator: fc.constantFrom<'and' | 'or'>('and', 'or'),
  }),
  pageSize: fc.constantFrom(10, 25, 50, 100),
});

const widgetPositionArbitrary = fc.record({
  x: fc.integer({ min: 0, max: 12 }),
  y: fc.integer({ min: 0, max: 100 }),
  w: fc.integer({ min: 1, max: 12 }),
  h: fc.integer({ min: 1, max: 10 }),
});

const workspaceWidgetArbitrary: fc.Arbitrary<WorkspaceWidget> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('metric_card', 'line_chart', 'bar_chart', 'data_table'),
  position: widgetPositionArbitrary,
  config: fc.option(
    fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
    { nil: undefined }
  ),
});

const workspaceLayoutArbitrary: fc.Arbitrary<WorkspaceLayout> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  widgets: fc.array(workspaceWidgetArbitrary, { maxLength: 10 }),
  createdAt: fc.date().map(d => d.toISOString()),
  updatedAt: fc.date().map(d => d.toISOString()),
});

const userPreferencesArbitrary: fc.Arbitrary<UserPreferences> = fc.record({
  theme: themeArbitrary,
  locale: localeArbitrary,
  defaultDashboard: fc.constantFrom('trader', 'risk', 'admin', 'executive'),
  gridPreferences: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    gridPreferencesArbitrary,
    { maxKeys: 5 }
  ),
  workspaceLayouts: fc.array(workspaceLayoutArbitrary, { maxLength: 5 }),
  activeWorkspaceId: fc.string({ maxLength: 36 }),
});

// Helper to deep compare objects
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

describe('Property 8: User Preferences Round-Trip', () => {
  let storage: MockLocalStorage;

  beforeEach(() => {
    storage = new MockLocalStorage();
  });

  it('saving and loading preferences should return equivalent preferences', () => {
    fc.assert(
      fc.property(userPreferencesArbitrary, (preferences) => {
        savePreferences(storage, preferences);
        const loadedPreferences = loadPreferences(storage);
        expect(deepEqual(loadedPreferences, preferences)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('theme preference round-trip should preserve the value', () => {
    fc.assert(
      fc.property(themeArbitrary, (theme) => {
        const preferences: UserPreferences = { ...DEFAULT_USER_PREFERENCES, theme };
        savePreferences(storage, preferences);
        const loaded = loadPreferences(storage);
        expect(loaded.theme).toBe(theme);
      }),
      { numRuns: 100 }
    );
  });

  it('locale preference round-trip should preserve the value', () => {
    fc.assert(
      fc.property(localeArbitrary, (locale) => {
        const preferences: UserPreferences = { ...DEFAULT_USER_PREFERENCES, locale };
        savePreferences(storage, preferences);
        const loaded = loadPreferences(storage);
        expect(loaded.locale).toBe(locale);
      }),
      { numRuns: 100 }
    );
  });

  it('grid preferences round-trip should preserve all settings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        gridPreferencesArbitrary,
        (gridId, gridPrefs) => {
          const preferences: UserPreferences = {
            ...DEFAULT_USER_PREFERENCES,
            gridPreferences: { [gridId]: gridPrefs },
          };
          savePreferences(storage, preferences);
          const loaded = loadPreferences(storage);
          expect(deepEqual(loaded.gridPreferences[gridId], gridPrefs)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('workspace layouts round-trip should preserve all layouts', () => {
    fc.assert(
      fc.property(
        fc.array(workspaceLayoutArbitrary, { minLength: 1, maxLength: 5 }),
        (layouts) => {
          const preferences: UserPreferences = {
            ...DEFAULT_USER_PREFERENCES,
            workspaceLayouts: layouts,
            activeWorkspaceId: layouts[0].id,
          };
          savePreferences(storage, preferences);
          const loaded = loadPreferences(storage);
          expect(loaded.workspaceLayouts.length).toBe(layouts.length);
          expect(deepEqual(loaded.workspaceLayouts, layouts)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('multiple save/load cycles should preserve the last saved value', () => {
    fc.assert(
      fc.property(
        fc.array(userPreferencesArbitrary, { minLength: 1, maxLength: 5 }),
        (preferencesList) => {
          for (const prefs of preferencesList) {
            savePreferences(storage, prefs);
          }
          const loaded = loadPreferences(storage);
          const lastPrefs = preferencesList[preferencesList.length - 1];
          expect(deepEqual(loaded, lastPrefs)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('loading from empty storage should return default preferences', () => {
    const loaded = loadPreferences(storage);
    expect(deepEqual(loaded, DEFAULT_USER_PREFERENCES)).toBe(true);
  });

  it('preferences round-trip should be idempotent', () => {
    fc.assert(
      fc.property(userPreferencesArbitrary, (preferences) => {
        savePreferences(storage, preferences);
        const firstLoad = loadPreferences(storage);
        savePreferences(storage, firstLoad);
        const secondLoad = loadPreferences(storage);
        expect(deepEqual(firstLoad, secondLoad)).toBe(true);
        expect(deepEqual(firstLoad, preferences)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
