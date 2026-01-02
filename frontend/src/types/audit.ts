/**
 * Audit Log Types for the AI-Assisted Crypto Trading System
 * Supports audit log viewing, filtering, streaming, and export
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import type { ModuleType } from './rbac';

/**
 * Severity levels for audit log entries
 */
export type AuditSeverity = 'info' | 'warning' | 'critical';

/**
 * Audit log entry representing a single audit event
 */
export interface AuditLogEntry {
  /** Unique identifier for the audit entry */
  id: string;
  /** Timestamp when the event occurred */
  timestamp: Date;
  /** ID of the user who performed the action */
  userId: string;
  /** Display name of the user */
  userName: string;
  /** The action that was performed */
  action: string;
  /** The module where the action occurred */
  module: ModuleType;
  /** Type of resource affected */
  resource: string;
  /** ID of the specific resource affected */
  resourceId: string;
  /** Severity level of the event */
  severity: AuditSeverity;
  /** Value before the change (for update/delete actions) */
  beforeValue?: unknown;
  /** Value after the change (for create/update actions) */
  afterValue?: unknown;
  /** Request tracking ID for correlation */
  requestTrackingId: string;
  /** IP address of the client (if available) */
  ipAddress?: string;
  /** User agent string (if available) */
  userAgent?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Filter criteria for querying audit logs
 */
export interface AuditLogFilter {
  /** Filter by user ID */
  userId?: string;
  /** Filter by user name (partial match) */
  userName?: string;
  /** Filter by action type */
  action?: string;
  /** Filter by module */
  module?: ModuleType;
  /** Filter by resource type */
  resource?: string;
  /** Filter by severity level */
  severity?: AuditSeverity;
  /** Filter by start date (inclusive) */
  startDate?: Date;
  /** Filter by end date (inclusive) */
  endDate?: Date;
  /** Full-text search across all fields */
  searchText?: string;
  /** Filter by request tracking ID */
  requestTrackingId?: string;
}

/**
 * Pagination parameters for audit log queries
 */
export interface AuditLogPagination {
  /** Current page (0-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
}

/**
 * Paginated result for audit log queries
 */
export interface PaginatedAuditLogResult {
  /** Array of audit log entries */
  entries: AuditLogEntry[];
  /** Total number of entries matching the filter */
  totalCount: number;
  /** Current page (0-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there are more pages */
  hasMore: boolean;
}

/**
 * Export format options for audit logs
 */
export type AuditExportFormat = 'csv' | 'json';

/**
 * Audit log stream subscription
 */
export interface AuditLogSubscription {
  /** Unique subscription ID */
  id: string;
  /** Filter criteria for the stream */
  filter: AuditLogFilter;
  /** Callback function for new entries */
  onEntry: (entry: AuditLogEntry) => void;
  /** Callback function for errors */
  onError?: (error: Error) => void;
  /** Callback function when connection is established */
  onConnected?: () => void;
  /** Callback function when connection is lost */
  onDisconnected?: () => void;
}

/**
 * Audit log viewer context value
 */
export interface AuditLogContextValue {
  /** Query audit logs with filters and pagination */
  query: (
    filter: AuditLogFilter,
    pagination: AuditLogPagination
  ) => Promise<PaginatedAuditLogResult>;
  /** Subscribe to real-time audit log stream */
  subscribe: (
    filter: AuditLogFilter,
    onEntry: (entry: AuditLogEntry) => void
  ) => () => void;
  /** Export audit logs to file */
  export: (filter: AuditLogFilter, format: AuditExportFormat) => Promise<Blob>;
  /** Current loading state */
  isLoading: boolean;
  /** Current error state */
  error: string | null;
  /** Whether streaming is connected */
  isStreaming: boolean;
}

/**
 * Common audit actions
 */
export const AUDIT_ACTIONS = {
  // Strategy actions
  STRATEGY_CREATE: 'strategy.create',
  STRATEGY_UPDATE: 'strategy.update',
  STRATEGY_DELETE: 'strategy.delete',
  STRATEGY_DEPLOY: 'strategy.deploy',
  STRATEGY_PAUSE: 'strategy.pause',
  STRATEGY_RESUME: 'strategy.resume',
  
  // Order actions
  ORDER_CREATE: 'order.create',
  ORDER_CANCEL: 'order.cancel',
  ORDER_MODIFY: 'order.modify',
  ORDER_EXECUTE: 'order.execute',
  
  // User actions
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_PASSWORD_CHANGE: 'user.password_change',
  USER_MFA_ENABLE: 'user.mfa_enable',
  USER_MFA_DISABLE: 'user.mfa_disable',
  
  // Role actions
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
  ROLE_ASSIGN: 'role.assign',
  ROLE_REVOKE: 'role.revoke',
  
  // Risk actions
  RISK_LIMIT_UPDATE: 'risk.limit_update',
  RISK_KILL_SWITCH: 'risk.kill_switch',
  RISK_BREACH: 'risk.breach',
  
  // Exchange actions
  EXCHANGE_CONNECT: 'exchange.connect',
  EXCHANGE_DISCONNECT: 'exchange.disconnect',
  EXCHANGE_CONFIG_UPDATE: 'exchange.config_update',
  
  // Report actions
  REPORT_GENERATE: 'report.generate',
  REPORT_EXPORT: 'report.export',
  
  // System actions
  SYSTEM_CONFIG_UPDATE: 'system.config_update',
  SYSTEM_MAINTENANCE: 'system.maintenance',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];

/**
 * Default page sizes for audit log viewer
 */
export const AUDIT_PAGE_SIZES = [25, 50, 100, 250];

/**
 * Default page size
 */
export const DEFAULT_AUDIT_PAGE_SIZE = 50;
