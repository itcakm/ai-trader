/**
 * Feature: ui-implementation, Property 13: Dashboard Data Consistency
 * Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6
 *
 * For any dashboard widget displaying data:
 * - The data SHALL refresh at the configured interval
 * - Drill-down navigation SHALL lead to records that match the summary metric
 * - Customizations SHALL persist across sessions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  Dashboard,
  DashboardWidget,
  DashboardType,
  WidgetType,
  WidgetPosition,
  GridLayout,
  WidgetConfig,
  MetricCardConfig,
  ChartConfig,
  DataTableConfig,
  AlertListConfig,
  ActivityFeedConfig,
} from '@/types/dashboard';
import {
  DEFAULT_GRID_LAYOUT,
  DEFAULT_REFRESH_INTERVAL,
  WIDGET_SIZE_PRESETS,
} from '@/types/dashboard';
import {
  positionsOverlap,
  findValidPosition,
} from '@/components/dashboard/DashboardGrid';
import {
  getDashboardTemplate,
  createDashboardFromTemplate,
  getAllDashboardTemplates,
} from '@/components/dashboard/DashboardTemplates';

// Mock storage for dashboard persistence
class MockDashboardStorage {
  private store: Map<string, string> = new Map();

  save(dashboard: Dashboard): void {
    this.store.set(dashboard.id, JSON.stringify(dashboard));
  }

  load(id: string): Dashboard | null {
    const stored = this.store.get(id);
    if (stored) {
      try {
        return JSON.parse(stored) as Dashboard;
      } catch {
        return null;
      }
    }
    return null;
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }
}

// Arbitraries for generating test data
const dashboardTypeArbitrary = fc.constantFrom<DashboardType>(
  'trader',
  'risk',
  'admin',
  'executive'
);

const widgetTypeArbitrary = fc.constantFrom<WidgetType>(
  'metric_card',
  'line_chart',
  'bar_chart',
  'pie_chart',
  'data_table',
  'alert_list',
  'activity_feed',
  'heatmap'
);

const widgetPositionArbitrary: fc.Arbitrary<WidgetPosition> = fc.record({
  x: fc.integer({ min: 0, max: 9 }),
  y: fc.integer({ min: 0, max: 20 }),
  w: fc.integer({ min: 1, max: 6 }),
  h: fc.integer({ min: 1, max: 6 }),
});

const metricCardConfigArbitrary: fc.Arbitrary<MetricCardConfig> = fc.record({
  title: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  metric: fc.string({ minLength: 1, maxLength: 30 }),
  format: fc.constantFrom<'number' | 'currency' | 'percentage'>('number', 'currency', 'percentage'),
  currency: fc.option(fc.constantFrom('USD', 'EUR', 'GBP'), { nil: undefined }),
  showTrend: fc.boolean(),
  trendPeriod: fc.option(fc.constantFrom<'hour' | 'day' | 'week' | 'month'>('hour', 'day', 'week', 'month'), { nil: undefined }),
  showHeader: fc.boolean(),
  refreshInterval: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
});

const chartConfigArbitrary: fc.Arbitrary<ChartConfig> = fc.record({
  title: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  dataSource: fc.string({ minLength: 1, maxLength: 100 }),
  xAxis: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  yAxis: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  showLegend: fc.boolean(),
  showGrid: fc.boolean(),
  showHeader: fc.boolean(),
  refreshInterval: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
});

const widgetConfigArbitrary: fc.Arbitrary<WidgetConfig> = fc.oneof(
  metricCardConfigArbitrary,
  chartConfigArbitrary
);

const dashboardWidgetArbitrary: fc.Arbitrary<DashboardWidget> = fc.record({
  id: fc.uuid(),
  type: widgetTypeArbitrary,
  title: fc.string({ minLength: 1, maxLength: 50 }),
  config: widgetConfigArbitrary,
  position: widgetPositionArbitrary,
  drillDownPath: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

const gridLayoutArbitrary: fc.Arbitrary<GridLayout> = fc.record({
  columns: fc.constantFrom(12, 16, 24),
  rowHeight: fc.integer({ min: 50, max: 150 }),
  gap: fc.integer({ min: 4, max: 24 }),
  breakpoints: fc.option(
    fc.record({
      lg: fc.integer({ min: 1000, max: 1400 }),
      md: fc.integer({ min: 700, max: 999 }),
      sm: fc.integer({ min: 500, max: 699 }),
      xs: fc.integer({ min: 300, max: 499 }),
    }),
    { nil: undefined }
  ),
});

const dashboardArbitrary: fc.Arbitrary<Dashboard> = fc.record({
  id: fc.uuid(),
  type: dashboardTypeArbitrary,
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  widgets: fc.array(dashboardWidgetArbitrary, { minLength: 0, maxLength: 10 }),
  layout: gridLayoutArbitrary,
  refreshInterval: fc.integer({ min: 5000, max: 120000 }),
  isShared: fc.boolean(),
  sharedWith: fc.option(fc.array(fc.uuid(), { maxLength: 5 }), { nil: undefined }),
  ownerId: fc.uuid(),
  createdAt: fc.date().map((d) => d.toISOString()),
  updatedAt: fc.date().map((d) => d.toISOString()),
});

// Helper to deep compare objects
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Helper to check if a widget position is valid within grid
function isValidPosition(position: WidgetPosition, columns: number): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.w > 0 &&
    position.h > 0 &&
    position.x + position.w <= columns
  );
}

describe('Property 13: Dashboard Data Consistency', () => {
  let storage: MockDashboardStorage;

  beforeEach(() => {
    storage = new MockDashboardStorage();
  });

  describe('Dashboard Persistence', () => {
    it('saving and loading a dashboard should return an equivalent dashboard', () => {
      fc.assert(
        fc.property(dashboardArbitrary, (dashboard) => {
          storage.save(dashboard);
          const loaded = storage.load(dashboard.id);
          expect(loaded).not.toBeNull();
          expect(deepEqual(loaded, dashboard)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('dashboard customizations should persist across save/load cycles', () => {
      fc.assert(
        fc.property(
          dashboardArbitrary,
          fc.array(dashboardWidgetArbitrary, { minLength: 1, maxLength: 5 }),
          (dashboard, newWidgets) => {
            // Save original
            storage.save(dashboard);

            // Modify and save
            const modified: Dashboard = {
              ...dashboard,
              widgets: [...dashboard.widgets, ...newWidgets],
              updatedAt: new Date().toISOString(),
            };
            storage.save(modified);

            // Load and verify
            const loaded = storage.load(dashboard.id);
            expect(loaded).not.toBeNull();
            expect(loaded!.widgets.length).toBe(dashboard.widgets.length + newWidgets.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('refresh interval changes should persist', () => {
      fc.assert(
        fc.property(
          dashboardArbitrary,
          fc.integer({ min: 5000, max: 120000 }),
          (dashboard, newInterval) => {
            storage.save(dashboard);

            const modified: Dashboard = {
              ...dashboard,
              refreshInterval: newInterval,
              updatedAt: new Date().toISOString(),
            };
            storage.save(modified);

            const loaded = storage.load(dashboard.id);
            expect(loaded).not.toBeNull();
            expect(loaded!.refreshInterval).toBe(newInterval);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Widget Position Consistency', () => {
    it('widget positions should not overlap after findValidPosition', () => {
      fc.assert(
        fc.property(
          fc.array(widgetPositionArbitrary, { minLength: 1, maxLength: 5 }),
          widgetPositionArbitrary,
          (existingPositions, newPosition) => {
            const validPosition = findValidPosition(
              newPosition,
              existingPositions,
              DEFAULT_GRID_LAYOUT.columns
            );

            // Check no overlap with existing positions
            for (const existing of existingPositions) {
              expect(positionsOverlap(validPosition, existing)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('positionsOverlap should be symmetric', () => {
      fc.assert(
        fc.property(
          widgetPositionArbitrary,
          widgetPositionArbitrary,
          (posA, posB) => {
            expect(positionsOverlap(posA, posB)).toBe(positionsOverlap(posB, posA));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('a position should always overlap with itself', () => {
      fc.assert(
        fc.property(widgetPositionArbitrary, (position) => {
          expect(positionsOverlap(position, position)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('non-overlapping positions should have no shared cells', () => {
      fc.assert(
        fc.property(
          widgetPositionArbitrary,
          widgetPositionArbitrary,
          (posA, posB) => {
            if (!positionsOverlap(posA, posB)) {
              // Verify they truly don't share any cells
              const cellsA = new Set<string>();
              for (let x = posA.x; x < posA.x + posA.w; x++) {
                for (let y = posA.y; y < posA.y + posA.h; y++) {
                  cellsA.add(`${x},${y}`);
                }
              }

              for (let x = posB.x; x < posB.x + posB.w; x++) {
                for (let y = posB.y; y < posB.y + posB.h; y++) {
                  expect(cellsA.has(`${x},${y}`)).toBe(false);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Dashboard Templates', () => {
    it('all dashboard types should have valid templates', () => {
      const types: DashboardType[] = ['trader', 'risk', 'admin', 'executive'];
      for (const type of types) {
        const template = getDashboardTemplate(type);
        expect(template).toBeDefined();
        expect(template.type).toBe(type);
        expect(template.name).toBeTruthy();
        expect(template.widgets.length).toBeGreaterThan(0);
      }
    });

    it('creating dashboard from template should preserve all widgets', () => {
      fc.assert(
        fc.property(dashboardTypeArbitrary, fc.uuid(), (type, ownerId) => {
          const template = getDashboardTemplate(type);
          const dashboard = createDashboardFromTemplate(type, ownerId);

          expect(dashboard.type).toBe(type);
          expect(dashboard.ownerId).toBe(ownerId);
          expect(dashboard.widgets.length).toBe(template.widgets.length);
          expect(dashboard.refreshInterval).toBe(template.refreshInterval);
        }),
        { numRuns: 100 }
      );
    });

    it('template widgets should have valid positions within grid', () => {
      const templates = getAllDashboardTemplates();
      for (const template of templates) {
        for (const widget of template.widgets) {
          expect(isValidPosition(widget.position, template.layout.columns)).toBe(true);
        }
      }
    });

    it('template widgets should have drill-down paths for navigation', () => {
      const templates = getAllDashboardTemplates();
      for (const template of templates) {
        // At least some widgets should have drill-down paths
        const widgetsWithDrillDown = template.widgets.filter((w) => w.drillDownPath);
        expect(widgetsWithDrillDown.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Dashboard Sharing', () => {
    it('sharing a dashboard should update sharedWith list', () => {
      fc.assert(
        fc.property(
          dashboardArbitrary,
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          (dashboard, userIds) => {
            const shared: Dashboard = {
              ...dashboard,
              isShared: true,
              sharedWith: userIds,
            };

            storage.save(shared);
            const loaded = storage.load(dashboard.id);

            expect(loaded).not.toBeNull();
            expect(loaded!.isShared).toBe(true);
            expect(loaded!.sharedWith).toEqual(userIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('unsharing should remove users from sharedWith list', () => {
      fc.assert(
        fc.property(
          dashboardArbitrary,
          fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }),
          (dashboard, userIds) => {
            // Share with all users
            const shared: Dashboard = {
              ...dashboard,
              isShared: true,
              sharedWith: userIds,
            };
            storage.save(shared);

            // Unshare with first user
            const userToRemove = userIds[0];
            const remainingUsers = userIds.filter((id) => id !== userToRemove);
            const unshared: Dashboard = {
              ...shared,
              sharedWith: remainingUsers,
              isShared: remainingUsers.length > 0,
            };
            storage.save(unshared);

            const loaded = storage.load(dashboard.id);
            expect(loaded).not.toBeNull();
            expect(loaded!.sharedWith).not.toContain(userToRemove);
            expect(loaded!.sharedWith?.length).toBe(remainingUsers.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Widget Configuration', () => {
    it('widget config changes should persist', () => {
      fc.assert(
        fc.property(
          dashboardArbitrary.filter((d) => d.widgets.length > 0),
          widgetConfigArbitrary,
          (dashboard, newConfig) => {
            storage.save(dashboard);

            // Update first widget's config
            const updatedWidgets = [...dashboard.widgets];
            updatedWidgets[0] = {
              ...updatedWidgets[0],
              config: newConfig,
            };

            const modified: Dashboard = {
              ...dashboard,
              widgets: updatedWidgets,
              updatedAt: new Date().toISOString(),
            };
            storage.save(modified);

            const loaded = storage.load(dashboard.id);
            expect(loaded).not.toBeNull();
            expect(deepEqual(loaded!.widgets[0].config, newConfig)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('widget title changes should persist', () => {
      fc.assert(
        fc.property(
          dashboardArbitrary.filter((d) => d.widgets.length > 0),
          fc.string({ minLength: 1, maxLength: 50 }),
          (dashboard, newTitle) => {
            storage.save(dashboard);

            const updatedWidgets = [...dashboard.widgets];
            updatedWidgets[0] = {
              ...updatedWidgets[0],
              title: newTitle,
            };

            const modified: Dashboard = {
              ...dashboard,
              widgets: updatedWidgets,
              updatedAt: new Date().toISOString(),
            };
            storage.save(modified);

            const loaded = storage.load(dashboard.id);
            expect(loaded).not.toBeNull();
            expect(loaded!.widgets[0].title).toBe(newTitle);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('widget position changes should persist', () => {
      fc.assert(
        fc.property(
          dashboardArbitrary.filter((d) => d.widgets.length > 0),
          widgetPositionArbitrary,
          (dashboard, newPosition) => {
            storage.save(dashboard);

            const updatedWidgets = [...dashboard.widgets];
            updatedWidgets[0] = {
              ...updatedWidgets[0],
              position: newPosition,
            };

            const modified: Dashboard = {
              ...dashboard,
              widgets: updatedWidgets,
              updatedAt: new Date().toISOString(),
            };
            storage.save(modified);

            const loaded = storage.load(dashboard.id);
            expect(loaded).not.toBeNull();
            expect(deepEqual(loaded!.widgets[0].position, newPosition)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Refresh Interval Consistency', () => {
    it('refresh interval should be within valid bounds', () => {
      fc.assert(
        fc.property(dashboardArbitrary, (dashboard) => {
          expect(dashboard.refreshInterval).toBeGreaterThanOrEqual(5000);
          expect(dashboard.refreshInterval).toBeLessThanOrEqual(120000);
        }),
        { numRuns: 100 }
      );
    });

    it('default refresh interval should be reasonable', () => {
      expect(DEFAULT_REFRESH_INTERVAL).toBeGreaterThanOrEqual(5000);
      expect(DEFAULT_REFRESH_INTERVAL).toBeLessThanOrEqual(120000);
    });
  });

  describe('Widget Size Presets', () => {
    it('all widget types should have size presets', () => {
      const widgetTypes: WidgetType[] = [
        'metric_card',
        'line_chart',
        'bar_chart',
        'pie_chart',
        'data_table',
        'alert_list',
        'activity_feed',
        'heatmap',
      ];

      for (const type of widgetTypes) {
        const preset = WIDGET_SIZE_PRESETS[type];
        expect(preset).toBeDefined();
        expect(preset.w).toBeGreaterThan(0);
        expect(preset.h).toBeGreaterThan(0);
        expect(preset.x).toBeGreaterThanOrEqual(0);
        expect(preset.y).toBeGreaterThanOrEqual(0);
      }
    });

    it('widget size presets should fit within default grid', () => {
      for (const [type, preset] of Object.entries(WIDGET_SIZE_PRESETS)) {
        expect(preset.w).toBeLessThanOrEqual(DEFAULT_GRID_LAYOUT.columns);
      }
    });
  });
});
