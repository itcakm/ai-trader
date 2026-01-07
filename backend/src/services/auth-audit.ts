/**
 * Auth Audit Service
 * 
 * Provides audit logging for all authentication events.
 * Stores events in DynamoDB with 90-day retention for compliance.
 * 
 * Requirements: 11.1-11.9
 */

import { documentClient } from '../db/client';
import { generateUUID } from '../utils/uuid';

// ============================================================================
// Auth Event Types
// ============================================================================

export const AUTH_EVENT_TYPES = {
  // Login events (Requirements: 11.1, 11.2)
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_MFA_REQUIRED: 'LOGIN_MFA_REQUIRED',
  
  // Logout events (Requirements: 11.3)
  LOGOUT: 'LOGOUT',
  
  // Password events (Requirements: 11.4)
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  
  // MFA events (Requirements: 11.5)
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  MFA_VERIFIED: 'MFA_VERIFIED',
  MFA_CHALLENGE_SUCCESS: 'MFA_CHALLENGE_SUCCESS',
  MFA_CHALLENGE_FAILED: 'MFA_CHALLENGE_FAILED',
  
  // SSO events (Requirements: 11.6)
  SSO_LOGIN_INITIATED: 'SSO_LOGIN_INITIATED',
  SSO_LOGIN_SUCCESS: 'SSO_LOGIN_SUCCESS',
  SSO_LOGIN_FAILED: 'SSO_LOGIN_FAILED',
  
  // Token events (Requirements: 11.7)
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Account events (Requirements: 11.8)
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  SIGNUP: 'SIGNUP',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  EMAIL_VERIFICATION_FAILED: 'EMAIL_VERIFICATION_FAILED',
} as const;

export type AuthEventType = typeof AUTH_EVENT_TYPES[keyof typeof AUTH_EVENT_TYPES];

// ============================================================================
// Auth Audit Entry Types
// ============================================================================

export interface AuthAuditEntry {
  entryId: string;
  timestamp: string;
  event: AuthEventType;
  userId?: string;
  email?: string;
  tenantId?: string;
  ip: string;
  userAgent: string;
  success: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
  ttl: number; // DynamoDB TTL for 90-day retention
}

export interface LogAuthEventInput {
  event: AuthEventType;
  userId?: string;
  email?: string;
  tenantId?: string;
  ip: string;
  userAgent: string;
  success?: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthAuditFilters {
  userId?: string;
  email?: string;
  tenantId?: string;
  event?: AuthEventType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface AuthAuditConfig {
  tableName: string;
  retentionDays: number;
  maxQueryLimit: number;
}

const DEFAULT_CONFIG: AuthAuditConfig = {
  tableName: process.env.AUTH_AUDIT_TABLE || 'auth-audit',
  retentionDays: 90,
  maxQueryLimit: 1000,
};

// ============================================================================
// Auth Audit Service
// ============================================================================

export const AuthAuditService = {
  config: { ...DEFAULT_CONFIG } as AuthAuditConfig,

  /**
   * Configure the service
   */
  configure(config: Partial<AuthAuditConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  },

  /**
   * Calculate TTL for DynamoDB (90-day retention)
   * Requirements: 11.9
   */
  calculateTTL(retentionDays?: number): number {
    const days = retentionDays ?? this.config.retentionDays;
    return Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
  },

  /**
   * Create an audit entry object
   */
  createAuditEntry(input: LogAuthEventInput): AuthAuditEntry {
    const now = new Date();
    
    // Determine success based on event type if not explicitly provided
    const success = input.success ?? this.isSuccessEvent(input.event);

    return {
      entryId: generateUUID(),
      timestamp: now.toISOString(),
      event: input.event,
      userId: input.userId,
      email: input.email,
      tenantId: input.tenantId,
      ip: input.ip,
      userAgent: input.userAgent,
      success,
      reason: input.reason,
      metadata: input.metadata,
      ttl: this.calculateTTL(),
    };
  },

  /**
   * Determine if an event type represents a successful action
   */
  isSuccessEvent(event: AuthEventType): boolean {
    const successEvents: AuthEventType[] = [
      AUTH_EVENT_TYPES.LOGIN_SUCCESS,
      AUTH_EVENT_TYPES.LOGOUT,
      AUTH_EVENT_TYPES.PASSWORD_CHANGED,
      AUTH_EVENT_TYPES.PASSWORD_RESET_COMPLETED,
      AUTH_EVENT_TYPES.MFA_ENABLED,
      AUTH_EVENT_TYPES.MFA_DISABLED,
      AUTH_EVENT_TYPES.MFA_VERIFIED,
      AUTH_EVENT_TYPES.MFA_CHALLENGE_SUCCESS,
      AUTH_EVENT_TYPES.SSO_LOGIN_SUCCESS,
      AUTH_EVENT_TYPES.TOKEN_REFRESHED,
      AUTH_EVENT_TYPES.ACCOUNT_UNLOCKED,
      AUTH_EVENT_TYPES.SIGNUP,
      AUTH_EVENT_TYPES.EMAIL_VERIFIED,
    ];
    return successEvents.includes(event);
  },

  /**
   * Log an authentication event
   * Requirements: 11.1-11.8
   */
  async logAuthEvent(input: LogAuthEventInput): Promise<AuthAuditEntry> {
    const entry = this.createAuditEntry(input);

    try {
      await documentClient.put({
        TableName: this.config.tableName,
        Item: entry,
      }).promise();

      // Also log to CloudWatch for real-time monitoring
      console.log(JSON.stringify({
        type: 'AUTH_AUDIT',
        ...entry,
      }));

      return entry;
    } catch (error) {
      // Log error but don't fail the auth operation
      console.error('Failed to log auth event:', error);
      console.log(JSON.stringify({
        type: 'AUTH_AUDIT_ERROR',
        event: input.event,
        error: (error as Error).message,
      }));
      
      // Return the entry even if storage failed
      return entry;
    }
  },

  /**
   * Log successful login
   * Requirements: 11.1
   */
  async logLoginSuccess(
    userId: string,
    email: string,
    tenantId: string,
    ip: string,
    userAgent: string,
    metadata?: Record<string, unknown>
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: AUTH_EVENT_TYPES.LOGIN_SUCCESS,
      userId,
      email,
      tenantId,
      ip,
      userAgent,
      success: true,
      metadata,
    });
  },

  /**
   * Log failed login attempt
   * Requirements: 11.2
   */
  async logLoginFailed(
    email: string,
    ip: string,
    userAgent: string,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: AUTH_EVENT_TYPES.LOGIN_FAILED,
      email,
      ip,
      userAgent,
      success: false,
      reason,
      metadata,
    });
  },

  /**
   * Log logout event
   * Requirements: 11.3
   */
  async logLogout(
    userId: string,
    email: string,
    tenantId: string,
    ip: string,
    userAgent: string
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: AUTH_EVENT_TYPES.LOGOUT,
      userId,
      email,
      tenantId,
      ip,
      userAgent,
      success: true,
    });
  },

  /**
   * Log password change event
   * Requirements: 11.4
   */
  async logPasswordChanged(
    userId: string,
    email: string,
    tenantId: string,
    ip: string,
    userAgent: string
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: AUTH_EVENT_TYPES.PASSWORD_CHANGED,
      userId,
      email,
      tenantId,
      ip,
      userAgent,
      success: true,
    });
  },

  /**
   * Log MFA setup event
   * Requirements: 11.5
   */
  async logMFAEnabled(
    userId: string,
    email: string,
    tenantId: string,
    ip: string,
    userAgent: string
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: AUTH_EVENT_TYPES.MFA_ENABLED,
      userId,
      email,
      tenantId,
      ip,
      userAgent,
      success: true,
    });
  },

  /**
   * Log SSO login event
   * Requirements: 11.6
   */
  async logSSOLogin(
    userId: string,
    email: string,
    tenantId: string,
    ip: string,
    userAgent: string,
    providerId: string,
    success: boolean,
    reason?: string
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: success ? AUTH_EVENT_TYPES.SSO_LOGIN_SUCCESS : AUTH_EVENT_TYPES.SSO_LOGIN_FAILED,
      userId,
      email,
      tenantId,
      ip,
      userAgent,
      success,
      reason,
      metadata: { providerId },
    });
  },

  /**
   * Log token refresh event
   * Requirements: 11.7
   */
  async logTokenRefresh(
    userId: string,
    tenantId: string,
    ip: string,
    userAgent: string,
    success: boolean,
    reason?: string
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: success ? AUTH_EVENT_TYPES.TOKEN_REFRESHED : AUTH_EVENT_TYPES.TOKEN_REFRESH_FAILED,
      userId,
      tenantId,
      ip,
      userAgent,
      success,
      reason,
    });
  },

  /**
   * Log account lockout event
   * Requirements: 11.8
   */
  async logAccountLocked(
    email: string,
    ip: string,
    userAgent: string,
    reason: string
  ): Promise<AuthAuditEntry> {
    return this.logAuthEvent({
      event: AUTH_EVENT_TYPES.ACCOUNT_LOCKED,
      email,
      ip,
      userAgent,
      success: false,
      reason,
    });
  },

  /**
   * Query audit logs by user
   * Requirements: 11.9
   */
  async getAuditLogsByUser(
    userId: string,
    filters?: Omit<AuthAuditFilters, 'userId'>
  ): Promise<AuthAuditEntry[]> {
    const limit = Math.min(filters?.limit ?? this.config.maxQueryLimit, this.config.maxQueryLimit);

    try {
      const result = await documentClient.query({
        TableName: this.config.tableName,
        IndexName: 'userId-timestamp-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        Limit: limit,
        ScanIndexForward: false, // Most recent first
      }).promise();

      return (result.Items || []) as AuthAuditEntry[];
    } catch (error) {
      console.error('Failed to query audit logs by user:', error);
      return [];
    }
  },

  /**
   * Query audit logs by tenant
   * Requirements: 11.9
   */
  async getAuditLogsByTenant(
    tenantId: string,
    filters?: Omit<AuthAuditFilters, 'tenantId'>
  ): Promise<AuthAuditEntry[]> {
    const limit = Math.min(filters?.limit ?? this.config.maxQueryLimit, this.config.maxQueryLimit);

    try {
      const result = await documentClient.query({
        TableName: this.config.tableName,
        IndexName: 'tenantId-timestamp-index',
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: {
          ':tenantId': tenantId,
        },
        Limit: limit,
        ScanIndexForward: false,
      }).promise();

      return (result.Items || []) as AuthAuditEntry[];
    } catch (error) {
      console.error('Failed to query audit logs by tenant:', error);
      return [];
    }
  },

  /**
   * Query audit logs by event type
   * Requirements: 11.9
   */
  async getAuditLogsByEventType(
    event: AuthEventType,
    filters?: Omit<AuthAuditFilters, 'event'>
  ): Promise<AuthAuditEntry[]> {
    const limit = Math.min(filters?.limit ?? this.config.maxQueryLimit, this.config.maxQueryLimit);

    try {
      const result = await documentClient.query({
        TableName: this.config.tableName,
        IndexName: 'event-timestamp-index',
        KeyConditionExpression: '#event = :event',
        ExpressionAttributeNames: {
          '#event': 'event',
        },
        ExpressionAttributeValues: {
          ':event': event,
        },
        Limit: limit,
        ScanIndexForward: false,
      }).promise();

      return (result.Items || []) as AuthAuditEntry[];
    } catch (error) {
      console.error('Failed to query audit logs by event type:', error);
      return [];
    }
  },

  /**
   * Get a specific audit entry by ID
   */
  async getAuditEntry(entryId: string, timestamp: string): Promise<AuthAuditEntry | null> {
    try {
      const result = await documentClient.get({
        TableName: this.config.tableName,
        Key: {
          entryId,
          timestamp,
        },
      }).promise();

      return (result.Item as AuthAuditEntry) || null;
    } catch (error) {
      console.error('Failed to get audit entry:', error);
      return null;
    }
  },

  /**
   * Export audit logs for compliance reporting
   * Requirements: 11.10
   */
  async exportAuditLogs(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<AuthAuditEntry[]> {
    const entries: AuthAuditEntry[] = [];
    let lastEvaluatedKey: any = undefined;

    try {
      do {
        const result = await documentClient.query({
          TableName: this.config.tableName,
          IndexName: 'tenantId-timestamp-index',
          KeyConditionExpression: 'tenantId = :tenantId AND #ts BETWEEN :start AND :end',
          ExpressionAttributeNames: {
            '#ts': 'timestamp',
          },
          ExpressionAttributeValues: {
            ':tenantId': tenantId,
            ':start': startDate,
            ':end': endDate,
          },
          ExclusiveStartKey: lastEvaluatedKey,
        }).promise();

        entries.push(...((result.Items || []) as AuthAuditEntry[]));
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return entries;
    } catch (error) {
      console.error('Failed to export audit logs:', error);
      return [];
    }
  },
};
