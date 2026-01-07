/**
 * Auth API Service
 * Provides methods for all authentication operations through the backend proxy.
 * All Cognito operations flow through the backend API Gateway with WAF protection.
 * 
 * Requirements: 9.1-9.7, 9.9
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ============================================================================
// Error Codes (matching backend)
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
  
  // SSO errors
  SSO_PROVIDER_NOT_FOUND: 'SSO_PROVIDER_NOT_FOUND',
  SSO_PROVIDER_DISABLED: 'SSO_PROVIDER_DISABLED',
  SSO_INVALID_STATE: 'SSO_INVALID_STATE',
  SSO_STATE_EXPIRED: 'SSO_STATE_EXPIRED',
  SSO_CALLBACK_ERROR: 'SSO_CALLBACK_ERROR',
  
  // Server errors
  AUTH_ERROR: 'AUTH_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];

// ============================================================================
// User-friendly error messages
// ============================================================================

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_REQUEST: 'The request was invalid. Please check your input and try again.',
  MISSING_REQUIRED_FIELD: 'Please fill in all required fields.',
  INVALID_EMAIL_FORMAT: 'Please enter a valid email address.',
  INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
  INVALID_TOKEN: 'Your session is invalid. Please log in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
  TOKEN_REFRESH_FAILED: 'Unable to refresh your session. Please log in again.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address before logging in.',
  ACCOUNT_LOCKED: 'Your account has been locked due to too many failed attempts. Please try again later.',
  ACCOUNT_DISABLED: 'Your account has been disabled. Please contact support.',
  USER_NOT_FOUND: 'No account found with this email address.',
  USER_EXISTS: 'An account with this email already exists.',
  MFA_REQUIRED: 'Multi-factor authentication is required.',
  INVALID_MFA_CODE: 'Invalid verification code. Please try again.',
  MFA_NOT_CONFIGURED: 'MFA is not configured for this account.',
  WEAK_PASSWORD: 'Password does not meet security requirements. Use at least 12 characters with uppercase, lowercase, numbers, and symbols.',
  PASSWORD_RESET_REQUIRED: 'You must reset your password before continuing.',
  INVALID_PASSWORD_RESET_CODE: 'Invalid or expired reset code. Please request a new one.',
  CODE_EXPIRED: 'The verification code has expired. Please request a new one.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action.',
  TENANT_MISMATCH: 'Access denied. Resource belongs to a different organization.',
  TOO_MANY_REQUESTS: 'Too many requests. Please wait a moment and try again.',
  SSO_PROVIDER_NOT_FOUND: 'SSO provider not found.',
  SSO_PROVIDER_DISABLED: 'SSO provider is currently disabled.',
  SSO_INVALID_STATE: 'Invalid SSO state. Please try logging in again.',
  SSO_STATE_EXPIRED: 'SSO session expired. Please try logging in again.',
  SSO_CALLBACK_ERROR: 'SSO authentication failed. Please try again.',
  AUTH_ERROR: 'An authentication error occurred. Please try again.',
  SERVICE_UNAVAILABLE: 'Service is temporarily unavailable. Please try again later.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
};

// ============================================================================
// AuthError Class
// Requirements: 9.9
// ============================================================================

export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly statusCode: number;
  public readonly retryAfter?: number;
  public readonly userMessage: string;

  constructor(
    code: AuthErrorCode,
    message?: string,
    statusCode: number = 400,
    retryAfter?: number
  ) {
    const userMessage = message || ERROR_MESSAGES[code] || 'An unexpected error occurred.';
    super(userMessage);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
    this.userMessage = userMessage;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return this.userMessage;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    const retryableCodes: AuthErrorCode[] = [
      AUTH_ERROR_CODES.TOO_MANY_REQUESTS,
      AUTH_ERROR_CODES.SERVICE_UNAVAILABLE,
      AUTH_ERROR_CODES.NETWORK_ERROR,
    ];
    return retryableCodes.includes(this.code);
  }

  /**
   * Check if error requires re-authentication
   */
  requiresReauth(): boolean {
    const reauthCodes: AuthErrorCode[] = [
      AUTH_ERROR_CODES.INVALID_TOKEN,
      AUTH_ERROR_CODES.TOKEN_EXPIRED,
      AUTH_ERROR_CODES.TOKEN_REFRESH_FAILED,
    ];
    return reauthCodes.includes(this.code);
  }
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
  tenantId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  emailVerified: boolean;
}

export interface LoginResponse {
  tokens?: AuthTokens;
  user?: User;
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
  user: User;
}

export interface SSOProvider {
  id: string;
  name: string;
  displayName: string;
  type: 'SAML' | 'OIDC';
  enabled: boolean;
  logoUrl?: string;
}

export interface SSOInitiateResponse {
  authorizationUrl: string;
  state: string;
}

export interface SSOCallbackResponse {
  tokens?: AuthTokens;
  user?: User;
  isNewUser?: boolean;
  error?: string;
  errorDescription?: string;
}

// ============================================================================
// API Error Response Type
// ============================================================================

interface APIErrorResponse {
  error?: string;
  code?: AuthErrorCode;
  message?: string;
  retryAfter?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: APIErrorResponse = {};
    
    try {
      errorData = await response.json();
    } catch {
      // Response body is not JSON
    }

    const code = errorData.code || mapStatusToErrorCode(response.status);
    const message = errorData.message;
    const retryAfter = errorData.retryAfter || 
      (response.headers.get('Retry-After') ? parseInt(response.headers.get('Retry-After')!, 10) : undefined);

    throw new AuthError(code, message, response.status, retryAfter);
  }

  return response.json();
}

function mapStatusToErrorCode(status: number): AuthErrorCode {
  switch (status) {
    case 400:
      return AUTH_ERROR_CODES.INVALID_REQUEST;
    case 401:
      return AUTH_ERROR_CODES.INVALID_CREDENTIALS;
    case 403:
      return AUTH_ERROR_CODES.INSUFFICIENT_PERMISSIONS;
    case 404:
      return AUTH_ERROR_CODES.USER_NOT_FOUND;
    case 409:
      return AUTH_ERROR_CODES.USER_EXISTS;
    case 429:
      return AUTH_ERROR_CODES.TOO_MANY_REQUESTS;
    case 503:
      return AUTH_ERROR_CODES.SERVICE_UNAVAILABLE;
    default:
      return AUTH_ERROR_CODES.AUTH_ERROR;
  }
}

async function fetchWithErrorHandling<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, options);
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    // Network error or other fetch failure
    throw new AuthError(
      AUTH_ERROR_CODES.NETWORK_ERROR,
      'Unable to connect to the server. Please check your internet connection.',
      0
    );
  }
}

// ============================================================================
// Auth API Class
// Requirements: 9.1-9.7
// ============================================================================

class AuthAPI {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Login with email and password
   * Requirements: 9.1
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return fetchWithErrorHandling<LoginResponse>(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  }

  /**
   * Register a new user
   * Requirements: 9.2
   */
  async signup(data: SignupData): Promise<SignupResponse> {
    return fetchWithErrorHandling<SignupResponse>(`${this.baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  /**
   * Logout the current user
   * Requirements: 9.1
   */
  async logout(accessToken: string): Promise<void> {
    await fetchWithErrorHandling<void>(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * Verify email with confirmation code
   * Requirements: 9.3
   */
  async verifyEmail(email: string, code: string): Promise<void> {
    await fetchWithErrorHandling<void>(`${this.baseUrl}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
  }

  /**
   * Resend email verification code
   * Requirements: 9.3
   */
  async resendVerification(email: string): Promise<void> {
    await fetchWithErrorHandling<void>(`${this.baseUrl}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Request password reset
   * Requirements: 9.4
   */
  async forgotPassword(email: string): Promise<void> {
    await fetchWithErrorHandling<void>(`${this.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Reset password with code
   * Requirements: 9.4
   */
  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await fetchWithErrorHandling<void>(`${this.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword }),
    });
  }

  /**
   * Refresh access token
   * Requirements: 9.1
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    return fetchWithErrorHandling<RefreshTokenResponse>(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  }

  /**
   * Setup MFA (get QR code secret)
   * Requirements: 9.5
   */
  async setupMFA(accessToken: string): Promise<MFASetupResponse> {
    return fetchWithErrorHandling<MFASetupResponse>(`${this.baseUrl}/auth/mfa/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * Verify MFA setup with code
   * Requirements: 9.5
   */
  async verifyMFASetup(
    accessToken: string,
    code: string,
    friendlyDeviceName?: string
  ): Promise<MFAVerifyResponse> {
    return fetchWithErrorHandling<MFAVerifyResponse>(`${this.baseUrl}/auth/mfa/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ code, friendlyDeviceName }),
    });
  }

  /**
   * Respond to MFA challenge during login
   * Requirements: 9.6
   */
  async verifyMFAChallenge(session: string, code: string): Promise<LoginResponse> {
    return fetchWithErrorHandling<LoginResponse>(`${this.baseUrl}/auth/mfa/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, code }),
    });
  }

  /**
   * Get current user profile
   */
  async getProfile(accessToken: string): Promise<UserProfileResponse> {
    return fetchWithErrorHandling<UserProfileResponse>(`${this.baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * Change password (requires current password)
   */
  async changePassword(
    accessToken: string,
    previousPassword: string,
    proposedPassword: string
  ): Promise<void> {
    await fetchWithErrorHandling<void>(`${this.baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ previousPassword, proposedPassword }),
    });
  }

  // ============================================================================
  // SSO Methods
  // Requirements: 9.7
  // ============================================================================

  /**
   * Get list of available SSO providers
   */
  async getProviders(): Promise<SSOProvider[]> {
    return fetchWithErrorHandling<SSOProvider[]>(`${this.baseUrl}/auth/sso/providers`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Initiate SSO login flow
   * Returns the authorization URL to redirect the user to
   */
  async initiateSSO(providerId: string, redirectUri?: string): Promise<SSOInitiateResponse> {
    const params = new URLSearchParams();
    if (redirectUri) {
      params.set('redirectUri', redirectUri);
    }
    
    const queryString = params.toString();
    const url = `${this.baseUrl}/auth/sso/initiate/${providerId}${queryString ? `?${queryString}` : ''}`;
    
    return fetchWithErrorHandling<SSOInitiateResponse>(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle SSO callback
   * Called after the user is redirected back from the SSO provider
   */
  async handleSSOCallback(
    code: string,
    state: string
  ): Promise<SSOCallbackResponse> {
    return fetchWithErrorHandling<SSOCallbackResponse>(`${this.baseUrl}/auth/sso/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const authAPI = new AuthAPI();

// Export class for testing or custom instances
export { AuthAPI };
