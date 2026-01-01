/**
 * Exchange Connection Type Definitions
 * Requirements: 8.1, 8.6
 */

import { ExchangeId } from './exchange';

// Connection protocol types
export type ConnectionType = 'REST' | 'WEBSOCKET' | 'FIX';

// Connection lifecycle status
export type ConnectionStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

// Connection metrics for monitoring
export interface ConnectionMetrics {
  uptimeMs: number;
  latencyMs: number;
  latencyP95Ms: number;
  errorRate: number;
  messagesReceived: number;
  messagesSent: number;
  reconnectionCount: number;
  lastErrorAt?: string;
  lastError?: string;
}

// Individual connection instance
export interface Connection {
  connectionId: string;
  exchangeId: ExchangeId;
  tenantId: string;
  type: ConnectionType;
  status: ConnectionStatus;
  endpoint: string;
  connectedAt?: string;
  lastActivityAt: string;
  reconnectAttempts: number;
  metrics: ConnectionMetrics;
}

// Pool of connections for an exchange
export interface ConnectionPool {
  exchangeId: ExchangeId;
  tenantId: string;
  connections: Connection[];
  maxConnections: number;
  activeConnections: number;
  healthyConnections: number;
}

// Strategy for reconnection attempts
export interface ReconnectionStrategy {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  maxAttempts: number;
  jitterPercent: number;
}

// Health status levels
export type ConnectionHealthLevel = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

// Detailed health information for a connection
export interface ConnectionHealthDetail {
  connectionId: string;
  type: ConnectionType;
  status: ConnectionStatus;
  latencyMs: number;
  errorRate: number;
  healthy: boolean;
}

// Overall health report for an exchange
export interface ConnectionHealthReport {
  exchangeId: ExchangeId;
  overallHealth: ConnectionHealthLevel;
  connections: ConnectionHealthDetail[];
  recommendations: string[];
  timestamp: string;
}

// Result of graceful shutdown
export interface ShutdownResult {
  connectionsClosedCount: number;
  pendingRequestsCompleted: number;
  pendingRequestsCancelled: number;
  shutdownTimeMs: number;
}
