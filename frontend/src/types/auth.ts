/**
 * Authentication types for the AI-Assisted Crypto Trading System
 * Supports AWS Cognito Plus integration with MFA and SSO
 */

// Role and Permission types
export type ResourceType =
  | 'strategy'
  | 'order'
  | 'position'
  | 'market_data'
  | 'ai_model'
  | 'risk_control'
  | 'report'
  | 'audit_log'
  | 'user'
  | 'organization'
  | 'role'
  | 'exchange';

export type ActionType = 'create' | 'read' | 'update' | 'delete' | 'execute' | 'export';

export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in';
  value: string | string[];
}

export interface Permission {
  id: string;
  resource: ResourceType;
  action: ActionType;
  conditions?: PermissionCondition[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  organizationId?: string;
}

// SSO Provider types
export type SSOProviderType = 'SAML' | 'OIDC';

export interface SSOProvider {
  id: string;
  name: string;
  type: SSOProviderType;
  metadata: string;
  enabled: boolean;
}

// Auth Configuration
export interface AuthConfig {
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoDomain: string;
  ssoProviders: SSOProvider[];
  mfaEnabled: boolean;
  sessionTimeoutMinutes: number;
}


// Auth Session
export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  organizationId?: string;
  roles: Role[];
  permissions: Permission[];
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  mfaVerified: boolean;
}

// Login Credentials
export interface Credentials {
  email: string;
  password: string;
}

// MFA Challenge
export interface MFAChallenge {
  challengeType: 'SMS_MFA' | 'SOFTWARE_TOKEN_MFA';
  session: string;
  destination?: string;
}

// Auth State
export type AuthStatus =
  | 'idle'
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'mfa_required'
  | 'session_expired';

export interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  mfaChallenge: MFAChallenge | null;
  error: string | null;
}

// Auth Context Value with SSO session setter
export interface AuthContextValue extends AuthState {
  login: (credentials: Credentials) => Promise<void>;
  loginWithSSO: (providerId: string) => Promise<void>;
  setSessionFromSSO: (session: AuthSession) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  verifyMFA: (code: string) => Promise<void>;
  clearError: () => void;
}

// Session expiry callback type
export type SessionExpiryCallback = () => void;
