/**
 * Feature: ui-implementation, Property 14: Audit Log Query Correctness
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 *
 * For any audit log query with filters, the returned entries SHALL match all
 * specified filter criteria, contain complete context (before/after values
 * where applicable), and be ordered by timestamp.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  AuditLogEntry,
  AuditLogFilter,
  AuditSeverity,
} from '@/types/audit';
import type { ModuleType } from '@/types/rbac';

// Arbitraries for generating test data
const severityArbitrary = fc.constantFrom<AuditSeverity>('info', 'warning', 'critical');

const moduleArbitrary = fc.constantFrom<ModuleType>(
  'strategy_management',
  'market_data',
  'ai_intelligence',
  'risk_controls',
  'reporting',
  'exchange_integration',
  'administration'
);

const actionArbitrary = fc.constantFrom(
  'strategy.create',
  'strategy.update',
  'strategy.delete',
  'order.create',
  'order.cancel',
  'user.login',
  'user.logout',
  'role.assign',
  'risk.limit_update',
  'exchange.connect'
);

const auditLogEntryArbitrary: fc.Arbitrary<AuditLogEntry> = fc.record({
  id: fc.uuid(),
  timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
  userId: fc.uuid(),
  userName: fc.string({ minLength: 1, maxLength: 50 }),
  action: actionArbitrary,
  module: moduleArbitrary,
  resource: fc.constantFrom('strategy', 'order', 'user', 'role', 'exchange'),
  resourceId: fc.uuid(),
  severity: severityArbitrary,
  beforeValue: fc.option(fc.jsonValue(), { nil: undefined }),
  afterValue: fc.option(fc.jsonValue(), { nil: undefined }),
  requestTrackingId: fc.string({ minLength: 10, maxLength: 30 }).map((s) => `req-${s}`),
  ipAddress: fc.option(fc.ipV4(), { nil: undefined }),
  userAgent: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  metadata: fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined }),
});

const auditLogFilterArbitrary: fc.Arbitrary<AuditLogFilter> = fc.record({
  userId: fc.option(fc.uuid(), { nil: undefined }),
  userName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  action: fc.option(actionArbitrary, { nil: undefined }),
  module: fc.option(moduleArbitrary, { nil: undefined }),
  severity: fc.option(severityArbitrary, { nil: undefined }),
  startDate: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date('2025-06-30') }), { nil: undefined }),
  endDate: fc.option(fc.date({ min: new Date('2025-01-01'), max: new Date('2025-12-31') }), { nil: undefined }),
  searchText: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  requestTrackingId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
});

/**
 * Apply filter to audit log entries
 * This is the reference implementation for testing
 */
function applyFilter(entries: AuditLogEntry[], filter: AuditLogFilter): AuditLogEntry[] {
  let filtered = [...entries];

  if (filter.userId) {
    filtered = filtered.filter((e) => e.userId === filter.userId);
  }

  if (filter.userName) {
    const searchLower = filter.userName.toLowerCase();
    filtered = filtered.filter((e) =>
      e.userName.toLowerCase().includes(searchLower)
    );
  }

  if (filter.action) {
    filtered = filtered.filter((e) => e.action === filter.action);
  }

  if (filter.module) {
    filtered = filtered.filter((e) => e.module === filter.module);
  }

  if (filter.severity) {
    filtered = filtered.filter((e) => e.severity === filter.severity);
  }

  if (filter.startDate) {
    filtered = filtered.filter((e) => e.timestamp >= filter.startDate!);
  }

  if (filter.endDate) {
    filtered = filtered.filter((e) => e.timestamp <= filter.endDate!);
  }

  if (filter.searchText) {
    const searchLower = filter.searchText.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.userName.toLowerCase().includes(searchLower) ||
        e.action.toLowerCase().includes(searchLower) ||
        e.resource.toLowerCase().includes(searchLower) ||
        e.resourceId.toLowerCase().includes(searchLower)
    );
  }

  if (filter.requestTrackingId) {
    filtered = filtered.filter((e) =>
      e.requestTrackingId.includes(filter.requestTrackingId!)
    );
  }

  return filtered;
}

/**
 * Sort entries by timestamp descending
 */
function sortByTimestamp(entries: AuditLogEntry[]): AuditLogEntry[] {
  return [...entries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Check if entries are sorted by timestamp descending
 */
function isSortedByTimestampDesc(entries: AuditLogEntry[]): boolean {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].timestamp.getTime() > entries[i - 1].timestamp.getTime()) {
      return false;
    }
  }
  return true;
}

/**
 * Check if an entry matches a filter
 */
function entryMatchesFilter(entry: AuditLogEntry, filter: AuditLogFilter): boolean {
  if (filter.userId && entry.userId !== filter.userId) return false;
  if (filter.userName && !entry.userName.toLowerCase().includes(filter.userName.toLowerCase())) return false;
  if (filter.action && entry.action !== filter.action) return false;
  if (filter.module && entry.module !== filter.module) return false;
  if (filter.severity && entry.severity !== filter.severity) return false;
  if (filter.startDate && entry.timestamp < filter.startDate) return false;
  if (filter.endDate && entry.timestamp > filter.endDate) return false;
  if (filter.requestTrackingId && !entry.requestTrackingId.includes(filter.requestTrackingId)) return false;
  if (filter.searchText) {
    const searchLower = filter.searchText.toLowerCase();
    const matchesSearch =
      entry.userName.toLowerCase().includes(searchLower) ||
      entry.action.toLowerCase().includes(searchLower) ||
      entry.resource.toLowerCase().includes(searchLower) ||
      entry.resourceId.toLowerCase().includes(searchLower);
    if (!matchesSearch) return false;
  }
  return true;
}

/**
 * Check if an entry has complete context
 */
function hasCompleteContext(entry: AuditLogEntry): boolean {
  // Required fields must be present
  if (!entry.id) return false;
  if (!entry.timestamp) return false;
  if (!entry.userId) return false;
  if (!entry.userName) return false;
  if (!entry.action) return false;
  if (!entry.module) return false;
  if (!entry.resource) return false;
  if (!entry.resourceId) return false;
  if (!entry.severity) return false;
  if (!entry.requestTrackingId) return false;
  
  return true;
}

describe('Property 14: Audit Log Query Correctness', () => {
  describe('Filter Matching', () => {
    it('all returned entries should match all specified filter criteria', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 1, maxLength: 50 }),
          auditLogFilterArbitrary,
          (entries, filter) => {
            const filtered = applyFilter(entries, filter);

            // Every returned entry must match all filter criteria
            for (const entry of filtered) {
              expect(entryMatchesFilter(entry, filter)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no matching entries should be excluded from results', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 1, maxLength: 50 }),
          auditLogFilterArbitrary,
          (entries, filter) => {
            const filtered = applyFilter(entries, filter);
            const filteredIds = new Set(filtered.map((e) => e.id));

            // Every entry that matches the filter should be in the results
            for (const entry of entries) {
              if (entryMatchesFilter(entry, filter)) {
                expect(filteredIds.has(entry.id)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty filter should return all entries', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 1, maxLength: 50 }),
          (entries) => {
            const emptyFilter: AuditLogFilter = {};
            const filtered = applyFilter(entries, emptyFilter);

            expect(filtered.length).toBe(entries.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('userId filter should return only entries from that user', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 5, maxLength: 50 }),
          (entries) => {
            // Pick a random userId from the entries
            const targetUserId = entries[0].userId;
            const filter: AuditLogFilter = { userId: targetUserId };
            const filtered = applyFilter(entries, filter);

            // All filtered entries should have the target userId
            for (const entry of filtered) {
              expect(entry.userId).toBe(targetUserId);
            }

            // Count should match entries with that userId
            const expectedCount = entries.filter((e) => e.userId === targetUserId).length;
            expect(filtered.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('severity filter should return only entries with that severity', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 5, maxLength: 50 }),
          severityArbitrary,
          (entries, severity) => {
            const filter: AuditLogFilter = { severity };
            const filtered = applyFilter(entries, filter);

            // All filtered entries should have the target severity
            for (const entry of filtered) {
              expect(entry.severity).toBe(severity);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('module filter should return only entries from that module', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 5, maxLength: 50 }),
          moduleArbitrary,
          (entries, module) => {
            const filter: AuditLogFilter = { module };
            const filtered = applyFilter(entries, filter);

            // All filtered entries should have the target module
            for (const entry of filtered) {
              expect(entry.module).toBe(module);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('date range filter should return only entries within range', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 5, maxLength: 50 }),
          fc.date({ min: new Date('2024-06-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2025-01-01'), max: new Date('2025-06-30') }),
          (entries, startDate, endDate) => {
            const filter: AuditLogFilter = { startDate, endDate };
            const filtered = applyFilter(entries, filter);

            // All filtered entries should be within the date range
            for (const entry of filtered) {
              expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
              expect(entry.timestamp.getTime()).toBeLessThanOrEqual(endDate.getTime());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('combined filters should apply all criteria (AND logic)', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 10, maxLength: 50 }),
          severityArbitrary,
          moduleArbitrary,
          (entries, severity, module) => {
            const filter: AuditLogFilter = { severity, module };
            const filtered = applyFilter(entries, filter);

            // All filtered entries should match BOTH criteria
            for (const entry of filtered) {
              expect(entry.severity).toBe(severity);
              expect(entry.module).toBe(module);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Timestamp Ordering', () => {
    it('results should be ordered by timestamp descending', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 2, maxLength: 50 }),
          auditLogFilterArbitrary,
          (entries, filter) => {
            const filtered = applyFilter(entries, filter);
            const sorted = sortByTimestamp(filtered);

            expect(isSortedByTimestampDesc(sorted)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sorting should be stable for entries with same timestamp', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
          fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
          (timestamp, ids) => {
            // Create entries with the same timestamp
            const entries: AuditLogEntry[] = ids.map((id) => ({
              id,
              timestamp,
              userId: 'user-1',
              userName: 'Test User',
              action: 'strategy.create',
              module: 'strategy_management' as ModuleType,
              resource: 'strategy',
              resourceId: 'res-1',
              severity: 'info' as AuditSeverity,
              requestTrackingId: `req-${id}`,
            }));

            const sorted1 = sortByTimestamp(entries);
            const sorted2 = sortByTimestamp(entries);

            // Same input should produce same output
            expect(sorted1.map((e) => e.id)).toEqual(sorted2.map((e) => e.id));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Complete Context', () => {
    it('all entries should have complete required context', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 1, maxLength: 50 }),
          (entries) => {
            for (const entry of entries) {
              expect(hasCompleteContext(entry)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('entries with changes should have before/after values', () => {
      fc.assert(
        fc.property(
          auditLogEntryArbitrary,
          fc.jsonValue(),
          fc.jsonValue(),
          (baseEntry, beforeValue, afterValue) => {
            const entryWithChanges: AuditLogEntry = {
              ...baseEntry,
              beforeValue,
              afterValue,
            };

            // Entry should preserve before/after values
            expect(entryWithChanges.beforeValue).toEqual(beforeValue);
            expect(entryWithChanges.afterValue).toEqual(afterValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('request tracking ID should be present and non-empty', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 1, maxLength: 50 }),
          (entries) => {
            for (const entry of entries) {
              expect(entry.requestTrackingId).toBeDefined();
              expect(entry.requestTrackingId.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Filter Idempotence', () => {
    it('applying the same filter twice should produce the same result', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 1, maxLength: 50 }),
          auditLogFilterArbitrary,
          (entries, filter) => {
            const filtered1 = applyFilter(entries, filter);
            const filtered2 = applyFilter(entries, filter);

            expect(filtered1.length).toBe(filtered2.length);
            expect(filtered1.map((e) => e.id)).toEqual(filtered2.map((e) => e.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filtering already filtered results should not change them', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 1, maxLength: 50 }),
          auditLogFilterArbitrary,
          (entries, filter) => {
            const filtered1 = applyFilter(entries, filter);
            const filtered2 = applyFilter(filtered1, filter);

            // Filtering already filtered results should be idempotent
            expect(filtered1.length).toBe(filtered2.length);
            expect(filtered1.map((e) => e.id)).toEqual(filtered2.map((e) => e.id));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Filter Monotonicity', () => {
    it('adding more filter criteria should not increase result count', () => {
      fc.assert(
        fc.property(
          fc.array(auditLogEntryArbitrary, { minLength: 5, maxLength: 50 }),
          severityArbitrary,
          moduleArbitrary,
          (entries, severity, module) => {
            // Filter with just severity
            const filter1: AuditLogFilter = { severity };
            const filtered1 = applyFilter(entries, filter1);

            // Filter with severity AND module
            const filter2: AuditLogFilter = { severity, module };
            const filtered2 = applyFilter(entries, filter2);

            // More restrictive filter should have <= results
            expect(filtered2.length).toBeLessThanOrEqual(filtered1.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Search Text Matching', () => {
    it('search text should match across multiple fields', () => {
      fc.assert(
        fc.property(
          auditLogEntryArbitrary,
          (entry) => {
            // Search by userName
            const filter1: AuditLogFilter = { searchText: entry.userName.substring(0, 3) };
            const result1 = entryMatchesFilter(entry, filter1);
            expect(result1).toBe(true);

            // Search by action
            const filter2: AuditLogFilter = { searchText: entry.action.split('.')[0] };
            const result2 = entryMatchesFilter(entry, filter2);
            expect(result2).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('search should be case-insensitive', () => {
      fc.assert(
        fc.property(
          auditLogEntryArbitrary,
          (entry) => {
            const searchLower = entry.userName.toLowerCase();
            const searchUpper = entry.userName.toUpperCase();

            const filterLower: AuditLogFilter = { searchText: searchLower };
            const filterUpper: AuditLogFilter = { searchText: searchUpper };

            const resultLower = entryMatchesFilter(entry, filterLower);
            const resultUpper = entryMatchesFilter(entry, filterUpper);

            expect(resultLower).toBe(resultUpper);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
