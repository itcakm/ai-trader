/**
 * Authentication types for the production auth system.
 * Supports Cognito-based authentication with MFA, SSO, and RBAC.
 */

// ============================================================================
// Request Types
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  tenantId?: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface MFASetupRequest {
  accessToken: string;
}

export interface MFAVerifyRequest {
  accessToken: string;
  code: string;
  friendlyDeviceName?: string;
}

export interface MFAChallengeRequest {
  session: string;
  code: string;
}

export interface ChangePasswordRequest {
  accessToken: string;
  previousPassword: string;
  proposedPassword: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  emailVerified: boolean;
}

export interface LoginResponse {
  tokens?: AuthTokens;
  user?: UserInfo;
  challengeType?: 'MFA' | 'NEW_PASSWORD_REQUIRED';
  session?: string;
}

export interface SignupResponse {
  userId: string;
  userConfirmed: boolean;
  codeDeliveryDetails?: {
    destination: string;
    deliveryMedium: 'EMAIL' | 'SMS';
    attributeName: string;
  };
}

export interface RefreshTokenResponse {
  accessToken: string;
  idToken: string;
  expiresIn: number;
}

export interface MFASetupResponse {
  secretCode: string;
  session: string;
}

export interface MFAVerifyResponse {
  status: 'SUCCESS' | 'ERROR';
}

export interface UserProfileResponse {
  user: UserInfo;
}

// ============================================================================
// Token Types
// ============================================================================

export interface TokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  'custom:tenant_id'?: string;
  'custom:roles'?: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  token_use: 'access' | 'id';
}

export interface UserContext {
  userId: string;
  email: string;
  tenantId: string;
  roles: string[];
  emailVerified: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export const AUTH_ERROR_CODES = {
  // Request validation errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_EMAIL_FORMAT: 'INVALID_EMAIL_FORMAT',
  
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  
  // Account state errors
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_EXISTS: 'USER_EXISTS',
  
  // MFA errors
  MFA_REQUIRED: 'MFA_REQUIRED',
  INVALID_MFA_CODE: 'INVALID_MFA_CODE',
  MFA_NOT_CONFIGURED: 'MFA_NOT_CONFIGURED',
  
  // Password errors
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  PASSWORD_RESET_REQUIRED: 'PASSWORD_RESET_REQUIRED',
  INVALID_PASSWORD_RESET_CODE: 'INVALID_PASSWORD_RESET_CODE',
  CODE_EXPIRED: 'CODE_EXPIRED',
  
  // Authorization errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  
  // Rate limiting
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // Server errors
  AUTH_ERROR: 'AUTH_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];

export interface AuthErrorResponse {
  error: string;
  code: AuthErrorCode;
  message?: string;
  retryAfter?: number;
}

export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly statusCode: number;
  public readonly retryAfter?: number;

  constructor(
    code: AuthErrorCode,
    message: string,
    statusCode: number = 400,
    retryAfter?: number
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }

  toResponse(): AuthErrorResponse {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      ...(this.retryAfter && { retryAfter: this.retryAfter }),
    };
  }
}

// ============================================================================
// Role Types (re-exported from rbac.ts for convenience)
// ============================================================================

export {
  ROLES,
  Role,
  ROLE_PERMISSIONS,
  PERMISSIONS,
  Permission,
  ALL_ROLES,
  ALL_PERMISSIONS,
  isValidRole,
  isValidPermission,
  ROLE_HIERARCHY,
  getInheritedRoles,
  getAllPermissionsForRole,
  PERMISSION_GROUPS,
  ROLE_INFO,
  RoleInfo,
  getRoleInfo,
  getRolesByLevel,
} from './rbac';

// ============================================================================
// SSO Types
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
// ============================================================================

export interface SSOProvider {
  id: string;
  name: string;
  displayName: string;
  type: 'SAML' | 'OIDC';
  enabled: boolean;
  logoUrl?: string;
  defaultRole?: string;
  tenantId?: string;
}

export interface SSOProviderConfig extends SSOProvider {
  clientId?: string;
  issuerUrl?: string;
  metadataUrl?: string;
  attributeMapping?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface SSOInitiateRequest {
  providerId: string;
  redirectUri?: string;
}

export interface SSOInitiateResponse {
  authorizationUrl: string;
  state: string;
}

export interface SSOCallbackRequest {
  code?: string;
  state: string;
  error?: string;
  error_description?: string;
}

export interface SSOCallbackResponse {
  tokens?: AuthTokens;
  user?: UserInfo;
  isNewUser?: boolean;
  error?: string;
  errorDescription?: string;
}

export interface SSOStatePayload {
  providerId: string;
  redirectUri: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
}

export const SSO_ERROR_CODES = {
  PROVIDER_NOT_FOUND: 'SSO_PROVIDER_NOT_FOUND',
  PROVIDER_DISABLED: 'SSO_PROVIDER_DISABLED',
  INVALID_STATE: 'SSO_INVALID_STATE',
  STATE_EXPIRED: 'SSO_STATE_EXPIRED',
  CALLBACK_ERROR: 'SSO_CALLBACK_ERROR',
  TOKEN_EXCHANGE_FAILED: 'SSO_TOKEN_EXCHANGE_FAILED',
  USER_PROVISIONING_FAILED: 'SSO_USER_PROVISIONING_FAILED',
} as const;

export type SSOErrorCode = typeof SSO_ERROR_CODES[keyof typeof SSO_ERROR_CODES];
