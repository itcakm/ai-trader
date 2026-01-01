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
  AuthStatus,
  Role,
  Permission,
} from '@/types/auth';

// Storage keys
const AUTH_SESSION_KEY = 'crypto-trading-auth-session';
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
  | { type: 'CLEAR_ERROR' };

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
        error: 'Your session has expired. Please log in again.',
      };
    case 'SET_ERROR':
      return { ...state, status: 'unauthenticated', error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}


// Context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Session storage helpers
function saveSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify({
    ...session,
    expiresAt: session.expiresAt.toISOString(),
  });
  localStorage.setItem(AUTH_SESSION_KEY, serialized);
}

function loadSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(AUTH_SESSION_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored);
    const session: AuthSession = {
      ...parsed,
      expiresAt: new Date(parsed.expiresAt),
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

function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_SESSION_KEY);
}

// Merge permissions from roles with user-level overrides
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


// Mock Cognito API calls (to be replaced with actual AWS Cognito SDK)
async function cognitoLogin(
  credentials: Credentials
): Promise<{ session?: AuthSession; mfaChallenge?: MFAChallenge }> {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Mock validation
  if (!credentials.email || !credentials.password) {
    throw new Error('Email and password are required');
  }

  // Mock MFA requirement for certain users
  if (credentials.email.includes('mfa')) {
    return {
      mfaChallenge: {
        challengeType: 'SOFTWARE_TOKEN_MFA',
        session: 'mock-mfa-session-' + Date.now(),
      },
    };
  }

  // Mock successful login
  const mockRoles: Role[] = [
    {
      id: 'role-1',
      name: 'TRADER',
      description: 'Trading role',
      permissions: [
        { id: 'p1', resource: 'strategy', action: 'read' },
        { id: 'p2', resource: 'strategy', action: 'create' },
        { id: 'p3', resource: 'order', action: 'execute' },
        { id: 'p4', resource: 'position', action: 'read' },
      ],
      isSystem: true,
    },
  ];

  const session: AuthSession = {
    userId: 'user-' + Date.now(),
    email: credentials.email,
    name: credentials.email.split('@')[0],
    roles: mockRoles,
    permissions: mergePermissions(mockRoles),
    accessToken: 'mock-access-token-' + Date.now(),
    refreshToken: 'mock-refresh-token-' + Date.now(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    mfaVerified: false,
  };

  return { session };
}

async function cognitoVerifyMFA(
  session: string,
  code: string
): Promise<AuthSession> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (code.length !== 6 || !/^\d+$/.test(code)) {
    throw new Error('Invalid MFA code. Please enter a 6-digit code.');
  }

  const mockRoles: Role[] = [
    {
      id: 'role-1',
      name: 'TRADER',
      description: 'Trading role',
      permissions: [
        { id: 'p1', resource: 'strategy', action: 'read' },
        { id: 'p2', resource: 'strategy', action: 'create' },
        { id: 'p3', resource: 'order', action: 'execute' },
      ],
      isSystem: true,
    },
  ];

  return {
    userId: 'user-' + Date.now(),
    email: 'mfa-user@example.com',
    name: 'MFA User',
    roles: mockRoles,
    permissions: mergePermissions(mockRoles),
    accessToken: 'mock-access-token-' + Date.now(),
    refreshToken: 'mock-refresh-token-' + Date.now(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    mfaVerified: true,
  };
}

async function cognitoRefreshSession(refreshToken: string): Promise<AuthSession> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const mockRoles: Role[] = [
    {
      id: 'role-1',
      name: 'TRADER',
      description: 'Trading role',
      permissions: [
        { id: 'p1', resource: 'strategy', action: 'read' },
        { id: 'p2', resource: 'strategy', action: 'create' },
      ],
      isSystem: true,
    },
  ];

  return {
    userId: 'user-refreshed',
    email: 'user@example.com',
    name: 'Refreshed User',
    roles: mockRoles,
    permissions: mergePermissions(mockRoles),
    accessToken: 'mock-access-token-refreshed-' + Date.now(),
    refreshToken: 'mock-refresh-token-refreshed-' + Date.now(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    mfaVerified: true,
  };
}

async function cognitoLogout(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}


// Provider Props
interface AuthProviderProps {
  children: React.ReactNode;
  onSessionExpiring?: () => void;
}

// Provider Component
export function AuthProvider({ children, onSessionExpiring }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expiryWarningRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timers
  const clearTimers = useCallback(() => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (expiryWarningRef.current) {
      clearTimeout(expiryWarningRef.current);
      expiryWarningRef.current = null;
    }
  }, []);

  // Set up session expiry timers
  const setupSessionTimers = useCallback(
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

      // Set expiry timer
      sessionTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_SESSION_EXPIRED' });
        clearSession();
      }, timeUntilExpiry);
    },
    [clearTimers, onSessionExpiring]
  );

  // Initialize from stored session
  useEffect(() => {
    const storedSession = loadSession();
    if (storedSession) {
      dispatch({ type: 'SET_AUTHENTICATED', payload: storedSession });
      setupSessionTimers(storedSession);
    } else {
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }

    return () => clearTimers();
  }, [setupSessionTimers, clearTimers]);

  // Login
  const login = useCallback(
    async (credentials: Credentials) => {
      dispatch({ type: 'SET_LOADING' });

      try {
        const result = await cognitoLogin(credentials);

        if (result.mfaChallenge) {
          dispatch({ type: 'SET_MFA_REQUIRED', payload: result.mfaChallenge });
        } else if (result.session) {
          saveSession(result.session);
          dispatch({ type: 'SET_AUTHENTICATED', payload: result.session });
          setupSessionTimers(result.session);
        }
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : 'Login failed',
        });
      }
    },
    [setupSessionTimers]
  );

  // Login with SSO - redirects to SSO provider
  // The actual SSO flow is handled by SSOProvider
  // This method is called after SSO callback to set the session
  const loginWithSSO = useCallback(
    async (providerId: string) => {
      dispatch({ type: 'SET_LOADING' });
      // Note: The actual redirect is handled by SSOProvider.initiateSSO()
      // This method can be used to set session after SSO callback
      // For now, we throw to indicate direct SSO should use SSOProvider
      throw new Error(
        `Use SSOProvider.initiateSSO('${providerId}') for SSO login redirect`
      );
    },
    []
  );

  // Verify MFA
  const verifyMFA = useCallback(
    async (code: string) => {
      if (!state.mfaChallenge) {
        dispatch({ type: 'SET_ERROR', payload: 'No MFA challenge pending' });
        return;
      }

      dispatch({ type: 'SET_LOADING' });

      try {
        const session = await cognitoVerifyMFA(state.mfaChallenge.session, code);
        saveSession(session);
        dispatch({ type: 'SET_AUTHENTICATED', payload: session });
        setupSessionTimers(session);
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : 'MFA verification failed',
        });
      }
    },
    [state.mfaChallenge, setupSessionTimers]
  );

  // Refresh session
  const refreshSession = useCallback(async () => {
    if (!state.session?.refreshToken) {
      dispatch({ type: 'SET_SESSION_EXPIRED' });
      return;
    }

    try {
      const newSession = await cognitoRefreshSession(state.session.refreshToken);
      saveSession(newSession);
      dispatch({ type: 'SET_AUTHENTICATED', payload: newSession });
      setupSessionTimers(newSession);
    } catch (error) {
      dispatch({ type: 'SET_SESSION_EXPIRED' });
      clearSession();
    }
  }, [state.session?.refreshToken, setupSessionTimers]);

  // Logout
  const logout = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
    clearTimers();

    try {
      await cognitoLogout();
    } finally {
      clearSession();
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }
  }, [clearTimers]);

  // Set session from SSO callback
  const setSessionFromSSO = useCallback(
    (session: AuthSession) => {
      saveSession(session);
      dispatch({ type: 'SET_AUTHENTICATED', payload: session });
      setupSessionTimers(session);
    },
    [setupSessionTimers]
  );

  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    loginWithSSO,
    setSessionFromSSO,
    logout,
    refreshSession,
    verifyMFA,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export for testing
export { AUTH_SESSION_KEY, loadSession, saveSession, clearSession };
