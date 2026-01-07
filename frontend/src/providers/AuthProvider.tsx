'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type {
  AuthContextValue,
  AuthState,
  AuthSession,
  Credentials,
  MFAChallenge,
  Role,
  Permission,
} from '@/types/auth';
import { authAPI, AuthError, LoginResponse, RefreshTokenResponse } from '@/services/auth-api';

// Storage keys
const AUTH_SESSION_KEY = 'crypto-trading-auth-session';
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before expiry
const SESSION_EXPIRY_WARNING_MS = 5 * 60 * 1000; // 5 minutes before expiry

// Initial state
const initialState: AuthState = {
  status: 'idle',
  session: null,
  mfaChallenge: null,
  error: null,
};

// Action types
type AuthAction =
  | { type: 'SET_LOADING' }
  | { type: 'SET_AUTHENTICATED'; payload: AuthSession }
  | { type: 'SET_UNAUTHENTICATED' }
  | { type: 'SET_MFA_REQUIRED'; payload: MFAChallenge }
  | { type: 'SET_SESSION_EXPIRED' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'TOKEN_REFRESHED'; payload: { accessToken: string; expiresAt: Date } };

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, status: 'loading', error: null };
    case 'SET_AUTHENTICATED':
      return {
        ...state,
        status: 'authenticated',
        session: action.payload,
        mfaChallenge: null,
        error: null,
      };
    case 'SET_UNAUTHENTICATED':
      return {
        ...state,
        status: 'unauthenticated',
        session: null,
        mfaChallenge: null,
        error: null,
      };
    case 'SET_MFA_REQUIRED':
      return {
        ...state,
        status: 'mfa_required',
        mfaChallenge: action.payload,
        error: null,
      };
    case 'SET_SESSION_EXPIRED':
      return {
        ...state,
        status: 'session_expired',
        session: null,
        error: 'Your session has expired. Please log in again.',
      };
    case 'SET_ERROR':
      return { ...state, status: 'unauthenticated', error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'TOKEN_REFRESHED':
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          accessToken: action.payload.accessToken,
          expiresAt: action.payload.expiresAt,
        },
      };
    default:
      return state;
  }
}

// Context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================================================
// Session Storage Helpers (Requirements: 8.1, 8.9)
// ============================================================================

interface StoredSession {
  session: Omit<AuthSession, 'expiresAt'> & { expiresAt: string };
}

/**
 * Save session to localStorage with expiration timestamp
 * Requirements: 8.1, 8.9
 */
function saveSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify({
    session: {
      ...session,
      expiresAt: session.expiresAt.toISOString(),
    },
  } as StoredSession);
  localStorage.setItem(AUTH_SESSION_KEY, serialized);
}

/**
 * Load session from localStorage and validate expiry
 * Requirements: 8.3, 8.10
 */
function loadSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(AUTH_SESSION_KEY);
  if (!stored) return null;

  try {
    const parsed: StoredSession = JSON.parse(stored);
    const session: AuthSession = {
      ...parsed.session,
      expiresAt: new Date(parsed.session.expiresAt),
    };

    // Check if session is expired
    if (session.expiresAt <= new Date()) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    clearSession();
    return null;
  }
}

/**
 * Clear all tokens from localStorage on logout
 * Requirements: 8.9
 */
function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_SESSION_KEY);
}

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Merge permissions from roles with user-level overrides
 */
export function mergePermissions(roles: Role[], userOverrides?: Permission[]): Permission[] {
  const permissionMap = new Map<string, Permission>();

  // Add permissions from all roles
  for (const role of roles) {
    for (const permission of role.permissions) {
      const key = `${permission.resource}:${permission.action}`;
      permissionMap.set(key, permission);
    }
  }

  // Apply user-level overrides (these take precedence)
  if (userOverrides) {
    for (const permission of userOverrides) {
      const key = `${permission.resource}:${permission.action}`;
      permissionMap.set(key, permission);
    }
  }

  return Array.from(permissionMap.values());
}

// ============================================================================
// API Response to Session Conversion
// ============================================================================

/**
 * Convert API login response to AuthSession
 */
function createSessionFromLoginResponse(response: LoginResponse): AuthSession {
  if (!response.tokens || !response.user) {
    throw new Error('Invalid login response: missing tokens or user');
  }

  // Create default roles from user.roles array
  const roles: Role[] = response.user.roles.map((roleName, index) => ({
    id: `role-${index}`,
    name: roleName,
    description: `${roleName} role`,
    permissions: getPermissionsForRole(roleName),
    isSystem: true,
  }));

  return {
    userId: response.user.id,
    email: response.user.email,
    name: response.user.name,
    organizationId: response.user.tenantId,
    roles,
    permissions: mergePermissions(roles),
    accessToken: response.tokens.accessToken,
    refreshToken: response.tokens.refreshToken,
    expiresAt: new Date(Date.now() + response.tokens.expiresIn * 1000),
    mfaVerified: true,
  };
}

/**
 * Get default permissions for a role name
 */
function getPermissionsForRole(roleName: string): Permission[] {
  const rolePermissions: Record<string, Permission[]> = {
    VIEWER: [
      { id: 'p1', resource: 'strategy', action: 'read' },
      { id: 'p2', resource: 'position', action: 'read' },
      { id: 'p3', resource: 'report', action: 'read' },
    ],
    TRADER: [
      { id: 'p1', resource: 'strategy', action: 'read' },
      { id: 'p2', resource: 'strategy', action: 'create' },
      { id: 'p3', resource: 'strategy', action: 'update' },
      { id: 'p4', resource: 'order', action: 'execute' },
      { id: 'p5', resource: 'position', action: 'read' },
      { id: 'p6', resource: 'market_data', action: 'read' },
    ],
    ANALYST: [
      { id: 'p1', resource: 'strategy', action: 'read' },
      { id: 'p2', resource: 'position', action: 'read' },
      { id: 'p3', resource: 'report', action: 'read' },
      { id: 'p4', resource: 'ai_model', action: 'read' },
      { id: 'p5', resource: 'audit_log', action: 'read' },
      { id: 'p6', resource: 'report', action: 'export' },
    ],
    ADMIN: [
      { id: 'p1', resource: 'strategy', action: 'read' },
      { id: 'p2', resource: 'strategy', action: 'create' },
      { id: 'p3', resource: 'strategy', action: 'update' },
      { id: 'p4', resource: 'strategy', action: 'delete' },
      { id: 'p5', resource: 'order', action: 'execute' },
      { id: 'p6', resource: 'position', action: 'read' },
      { id: 'p7', resource: 'user', action: 'read' },
      { id: 'p8', resource: 'user', action: 'create' },
      { id: 'p9', resource: 'user', action: 'update' },
      { id: 'p10', resource: 'role', action: 'read' },
      { id: 'p11', resource: 'role', action: 'update' },
    ],
    SUPER_ADMIN: [
      { id: 'p1', resource: 'strategy', action: 'read' },
      { id: 'p2', resource: 'strategy', action: 'create' },
      { id: 'p3', resource: 'strategy', action: 'update' },
      { id: 'p4', resource: 'strategy', action: 'delete' },
      { id: 'p5', resource: 'order', action: 'execute' },
      { id: 'p6', resource: 'position', action: 'read' },
      { id: 'p7', resource: 'user', action: 'read' },
      { id: 'p8', resource: 'user', action: 'create' },
      { id: 'p9', resource: 'user', action: 'update' },
      { id: 'p10', resource: 'user', action: 'delete' },
      { id: 'p11', resource: 'role', action: 'read' },
      { id: 'p12', resource: 'role', action: 'create' },
      { id: 'p13', resource: 'role', action: 'update' },
      { id: 'p14', resource: 'role', action: 'delete' },
      { id: 'p15', resource: 'organization', action: 'read' },
      { id: 'p16', resource: 'organization', action: 'update' },
    ],
  };

  return rolePermissions[roleName] || rolePermissions.VIEWER;
}

// ============================================================================
// Provider Props
// ============================================================================

interface AuthProviderProps {
  children: React.ReactNode;
  onSessionExpiring?: () => void;
}

// ============================================================================
// Provider Component
// ============================================================================

export function AuthProvider({ children, onSessionExpiring }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expiryWarningRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef<boolean>(false);

  // ============================================================================
  // Timer Management
  // ============================================================================

  /**
   * Clear all timers
   */
  const clearTimers = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (expiryWarningRef.current) {
      clearTimeout(expiryWarningRef.current);
      expiryWarningRef.current = null;
    }
  }, []);

  /**
   * Set up automatic token refresh timer
   * Requirements: 8.2, 8.3
   */
  const setupRefreshTimer = useCallback(
    (session: AuthSession) => {
      clearTimers();

      const now = Date.now();
      const expiresAt = session.expiresAt.getTime();
      const timeUntilExpiry = expiresAt - now;

      if (timeUntilExpiry <= 0) {
        dispatch({ type: 'SET_SESSION_EXPIRED' });
        clearSession();
        return;
      }

      // Set warning timer (5 minutes before expiry)
      const timeUntilWarning = timeUntilExpiry - SESSION_EXPIRY_WARNING_MS;
      if (timeUntilWarning > 0 && onSessionExpiring) {
        expiryWarningRef.current = setTimeout(() => {
          onSessionExpiring();
        }, timeUntilWarning);
      }

      // Set refresh timer (5 minutes before expiry)
      // Requirements: 8.2 - Refresh 5 minutes before expiration
      const timeUntilRefresh = timeUntilExpiry - TOKEN_REFRESH_THRESHOLD_MS;
      if (timeUntilRefresh > 0) {
        refreshTimerRef.current = setTimeout(async () => {
          if (isRefreshingRef.current) return;
          
          try {
            isRefreshingRef.current = true;
            const storedSession = loadSession();
            if (storedSession?.refreshToken) {
              const result = await authAPI.refreshToken(storedSession.refreshToken);
              const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
              
              // Update stored session
              const updatedSession: AuthSession = {
                ...storedSession,
                accessToken: result.accessToken,
                expiresAt: newExpiresAt,
              };
              saveSession(updatedSession);
              
              // Update state
              dispatch({ 
                type: 'TOKEN_REFRESHED', 
                payload: { accessToken: result.accessToken, expiresAt: newExpiresAt } 
              });
              
              // Setup next refresh timer
              setupRefreshTimer(updatedSession);
            }
          } catch (error) {
            console.error('Token refresh failed:', error);
            // Requirements: 8.3 - Handle refresh failures gracefully
            if (error instanceof AuthError && error.requiresReauth()) {
              dispatch({ type: 'SET_SESSION_EXPIRED' });
              clearSession();
            }
          } finally {
            isRefreshingRef.current = false;
          }
        }, timeUntilRefresh);
      } else {
        // Token expires in less than 5 minutes, refresh immediately
        refreshTimerRef.current = setTimeout(async () => {
          if (isRefreshingRef.current) return;
          
          try {
            isRefreshingRef.current = true;
            const storedSession = loadSession();
            if (storedSession?.refreshToken) {
              const result = await authAPI.refreshToken(storedSession.refreshToken);
              const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
              
              const updatedSession: AuthSession = {
                ...storedSession,
                accessToken: result.accessToken,
                expiresAt: newExpiresAt,
              };
              saveSession(updatedSession);
              dispatch({ 
                type: 'TOKEN_REFRESHED', 
                payload: { accessToken: result.accessToken, expiresAt: newExpiresAt } 
              });
              setupRefreshTimer(updatedSession);
            }
          } catch (error) {
            console.error('Token refresh failed:', error);
            dispatch({ type: 'SET_SESSION_EXPIRED' });
            clearSession();
          } finally {
            isRefreshingRef.current = false;
          }
        }, Math.max(0, timeUntilExpiry - 30000)); // Refresh 30 seconds before expiry as fallback
      }
    },
    [clearTimers, onSessionExpiring]
  );

  // ============================================================================
  // Session Restoration (Requirements: 8.3, 8.10)
  // ============================================================================

  useEffect(() => {
    // Check localStorage on mount
    const storedSession = loadSession();
    if (storedSession) {
      // Validate stored token expiry
      if (storedSession.expiresAt > new Date()) {
        // Restore session
        dispatch({ type: 'SET_AUTHENTICATED', payload: storedSession });
        setupRefreshTimer(storedSession);
      } else {
        // Session expired, redirect to login
        clearSession();
        dispatch({ type: 'SET_UNAUTHENTICATED' });
      }
    } else {
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }

    return () => clearTimers();
  }, [setupRefreshTimer, clearTimers]);

  // ============================================================================
  // Login (Requirements: 8.1-8.10)
  // ============================================================================

  const login = useCallback(
    async (credentials: Credentials) => {
      dispatch({ type: 'SET_LOADING' });

      try {
        // Replace cognitoLogin with authAPI.login
        const result: LoginResponse = await authAPI.login({
          email: credentials.email,
          password: credentials.password,
        });

        if (result.challengeType === 'MFA') {
          // MFA required
          dispatch({
            type: 'SET_MFA_REQUIRED',
            payload: {
              challengeType: 'SOFTWARE_TOKEN_MFA',
              session: result.session!,
            },
          });
        } else if (result.tokens && result.user) {
          // Successful login
          const session = createSessionFromLoginResponse(result);
          saveSession(session);
          dispatch({ type: 'SET_AUTHENTICATED', payload: session });
          setupRefreshTimer(session);
        }
      } catch (error) {
        const message = error instanceof AuthError 
          ? error.getUserMessage() 
          : 'Login failed. Please try again.';
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    },
    [setupRefreshTimer]
  );

  // ============================================================================
  // Login with SSO
  // ============================================================================

  const loginWithSSO = useCallback(
    async (providerId: string) => {
      dispatch({ type: 'SET_LOADING' });
      // Note: The actual redirect is handled by SSOProvider.initiateSSO()
      // This method can be used to set session after SSO callback
      throw new Error(
        `Use SSOProvider.initiateSSO('${providerId}') for SSO login redirect`
      );
    },
    []
  );

  // ============================================================================
  // Verify MFA (Requirements: 8.1-8.10)
  // ============================================================================

  const verifyMFA = useCallback(
    async (code: string) => {
      if (!state.mfaChallenge) {
        dispatch({ type: 'SET_ERROR', payload: 'No MFA challenge pending' });
        return;
      }

      dispatch({ type: 'SET_LOADING' });

      try {
        // Replace cognitoVerifyMFA with authAPI.verifyMFAChallenge
        const result = await authAPI.verifyMFAChallenge(state.mfaChallenge.session, code);
        
        if (result.tokens && result.user) {
          const session = createSessionFromLoginResponse(result);
          session.mfaVerified = true;
          saveSession(session);
          dispatch({ type: 'SET_AUTHENTICATED', payload: session });
          setupRefreshTimer(session);
        } else {
          throw new Error('Invalid MFA response');
        }
      } catch (error) {
        const message = error instanceof AuthError 
          ? error.getUserMessage() 
          : 'MFA verification failed. Please try again.';
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    },
    [state.mfaChallenge, setupRefreshTimer]
  );

  // ============================================================================
  // Refresh Session (Requirements: 8.2, 8.3)
  // ============================================================================

  const refreshSession = useCallback(async () => {
    if (!state.session?.refreshToken) {
      dispatch({ type: 'SET_SESSION_EXPIRED' });
      return;
    }

    if (isRefreshingRef.current) return;

    try {
      isRefreshingRef.current = true;
      // Replace cognitoRefreshSession with authAPI.refreshToken
      const result: RefreshTokenResponse = await authAPI.refreshToken(state.session.refreshToken);
      
      const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
      const updatedSession: AuthSession = {
        ...state.session,
        accessToken: result.accessToken,
        expiresAt: newExpiresAt,
      };
      
      saveSession(updatedSession);
      dispatch({ type: 'SET_AUTHENTICATED', payload: updatedSession });
      setupRefreshTimer(updatedSession);
    } catch (error) {
      console.error('Session refresh failed:', error);
      dispatch({ type: 'SET_SESSION_EXPIRED' });
      clearSession();
    } finally {
      isRefreshingRef.current = false;
    }
  }, [state.session, setupRefreshTimer]);

  // ============================================================================
  // Logout (Requirements: 8.5, 8.9)
  // ============================================================================

  const logout = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
    clearTimers();

    try {
      // Replace cognitoLogout with authAPI.logout
      if (state.session?.accessToken) {
        await authAPI.logout(state.session.accessToken);
      }
    } catch (error) {
      // Log error but continue with local logout
      console.error('Logout API call failed:', error);
    } finally {
      // Always clear local session (Requirements: 8.9)
      clearSession();
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }
  }, [clearTimers, state.session?.accessToken]);

  // ============================================================================
  // Set Session from SSO Callback
  // ============================================================================

  const setSessionFromSSO = useCallback(
    (session: AuthSession) => {
      saveSession(session);
      dispatch({ type: 'SET_AUTHENTICATED', payload: session });
      setupRefreshTimer(session);
    },
    [setupRefreshTimer]
  );

  // ============================================================================
  // Clear Error
  // ============================================================================

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // ============================================================================
  // Get Access Token Helper (Requirements: 8.2)
  // ============================================================================

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // Return null if not authenticated
    const storedSession = loadSession();
    if (!storedSession) return null;

    const now = new Date();
    const expiresAt = storedSession.expiresAt;

    // Check if token is still valid (with 30 second buffer)
    if (expiresAt.getTime() - now.getTime() > 30000) {
      return storedSession.accessToken;
    }

    // Token expired or about to expire, try to refresh
    if (!storedSession.refreshToken) return null;

    if (isRefreshingRef.current) {
      // Wait for ongoing refresh to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      const refreshedSession = loadSession();
      return refreshedSession?.accessToken || null;
    }

    try {
      isRefreshingRef.current = true;
      const result = await authAPI.refreshToken(storedSession.refreshToken);
      const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
      
      const updatedSession: AuthSession = {
        ...storedSession,
        accessToken: result.accessToken,
        expiresAt: newExpiresAt,
      };
      
      saveSession(updatedSession);
      dispatch({ 
        type: 'TOKEN_REFRESHED', 
        payload: { accessToken: result.accessToken, expiresAt: newExpiresAt } 
      });
      
      return result.accessToken;
    } catch (error) {
      console.error('Token refresh failed in getAccessToken:', error);
      return null;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: AuthContextValue = {
    ...state,
    login,
    loginWithSSO,
    setSessionFromSSO,
    logout,
    refreshSession,
    verifyMFA,
    clearError,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export for testing
export { AUTH_SESSION_KEY, loadSession, saveSession, clearSession };
