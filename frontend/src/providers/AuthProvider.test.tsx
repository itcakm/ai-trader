/**
 * Unit Tests for AuthProvider
 * Requirements: 13.7, 13.8
 * 
 * Tests:
 * - Login state management
 * - Token storage
 * - Token refresh
 * - Logout cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth, AUTH_SESSION_KEY, loadSession, saveSession, clearSession } from './AuthProvider';
import { authAPI, AuthError } from '@/services/auth-api';
import type { AuthSession, Role } from '@/types/auth';

// Mock the auth API
vi.mock('@/services/auth-api', () => ({
  authAPI: {
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    verifyMFAChallenge: vi.fn(),
  },
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'AuthError';
    }
    getUserMessage() {
      return this.message;
    }
    requiresReauth() {
      return ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'TOKEN_REFRESH_FAILED'].includes(this.code);
    }
  },
  AUTH_ERROR_CODES: {
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    INVALID_TOKEN: 'INVALID_TOKEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Helper to create a valid session
function createMockSession(overrides: Partial<AuthSession> = {}): AuthSession {
  const defaultRoles: Role[] = [
    {
      id: 'role-1',
      name: 'TRADER',
      description: 'Trader role',
      permissions: [
        { id: 'p1', resource: 'strategy', action: 'read' },
        { id: 'p2', resource: 'order', action: 'execute' },
      ],
      isSystem: true,
    },
  ];

  return {
    userId: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    organizationId: 'org-123',
    roles: defaultRoles,
    permissions: defaultRoles[0].permissions,
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    mfaVerified: true,
    ...overrides,
  };
}

// Helper to create mock login response
function createMockLoginResponse(session: AuthSession) {
  return {
    tokens: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      idToken: 'mock-id-token',
      expiresIn: 3600,
    },
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      tenantId: session.organizationId || 'org-123',
      roles: session.roles.map(r => r.name),
      emailVerified: true,
    },
  };
}

// Wrapper component for testing hooks
function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  };
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('Initial State', () => {
    it('should start with unauthenticated status when no stored session', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });
      expect(result.current.session).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should restore session from localStorage on mount', async () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });
      expect(result.current.session?.userId).toBe(mockSession.userId);
      expect(result.current.session?.email).toBe(mockSession.email);
    });

    it('should clear expired session on mount', async () => {
      const expiredSession = createMockSession({
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...expiredSession,
            expiresAt: expiredSession.expiresAt.toISOString(),
          },
        })
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });
      expect(result.current.session).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_SESSION_KEY);
    });
  });

  describe('Login State Management', () => {
    it('should set loading status during login', async () => {
      const mockSession = createMockSession();
      let resolveLogin: (value: any) => void;
      vi.mocked(authAPI.login).mockImplementation(
        () => new Promise(resolve => { resolveLogin = resolve; })
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      // Start login but don't resolve yet
      act(() => {
        result.current.login({ email: 'test@example.com', password: 'password123' });
      });

      // Should be loading
      expect(result.current.status).toBe('loading');

      // Resolve the login
      await act(async () => {
        resolveLogin!(createMockLoginResponse(mockSession));
      });
    });

    it('should set authenticated status on successful login', async () => {
      const mockSession = createMockSession();
      vi.mocked(authAPI.login).mockResolvedValue(createMockLoginResponse(mockSession));

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password123' });
      });

      expect(result.current.status).toBe('authenticated');
      expect(result.current.session?.email).toBe(mockSession.email);
      expect(result.current.error).toBeNull();
    });

    it('should set error on failed login', async () => {
      vi.mocked(authAPI.login).mockRejectedValue(
        new (AuthError as any)('INVALID_CREDENTIALS', 'Invalid email or password')
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'wrong' });
      });

      expect(result.current.status).toBe('unauthenticated');
      expect(result.current.error).toBe('Invalid email or password');
    });

    it('should set mfa_required status when MFA is needed', async () => {
      vi.mocked(authAPI.login).mockResolvedValue({
        challengeType: 'MFA',
        session: 'mfa-session-token',
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password123' });
      });

      expect(result.current.status).toBe('mfa_required');
      expect(result.current.mfaChallenge).toBeDefined();
      expect(result.current.mfaChallenge?.session).toBe('mfa-session-token');
    });
  });

  describe('Token Storage', () => {
    it('should save session to localStorage on successful login', async () => {
      const mockSession = createMockSession();
      vi.mocked(authAPI.login).mockResolvedValue(createMockLoginResponse(mockSession));

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password123' });
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        AUTH_SESSION_KEY,
        expect.any(String)
      );

      const storedData = JSON.parse(localStorageMock.store[AUTH_SESSION_KEY]);
      expect(storedData.session.email).toBe(mockSession.email);
      expect(storedData.session.accessToken).toBe(mockSession.accessToken);
    });

    it('should clear session from localStorage on logout', async () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );
      vi.mocked(authAPI.logout).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_SESSION_KEY);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token when refreshSession is called', async () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );

      vi.mocked(authAPI.refreshToken).mockResolvedValue({
        accessToken: 'new-access-token',
        idToken: 'new-id-token',
        expiresIn: 3600,
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(authAPI.refreshToken).toHaveBeenCalledWith(mockSession.refreshToken);
      expect(result.current.session?.accessToken).toBe('new-access-token');
    });

    it('should set session_expired on refresh failure', async () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );

      vi.mocked(authAPI.refreshToken).mockRejectedValue(
        new (AuthError as any)('TOKEN_REFRESH_FAILED', 'Failed to refresh token')
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(result.current.status).toBe('session_expired');
      expect(result.current.session).toBeNull();
    });
  });

  describe('Logout Cleanup', () => {
    it('should call logout API and clear state', async () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );
      vi.mocked(authAPI.logout).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(authAPI.logout).toHaveBeenCalledWith(mockSession.accessToken);
      expect(result.current.status).toBe('unauthenticated');
      expect(result.current.session).toBeNull();
    });

    it('should clear local state even if logout API fails', async () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );
      vi.mocked(authAPI.logout).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });

      await act(async () => {
        await result.current.logout();
      });

      // Should still clear local state
      expect(result.current.status).toBe('unauthenticated');
      expect(result.current.session).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_SESSION_KEY);
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when session is valid', async () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });

      let token: string | null = null;
      await act(async () => {
        token = await result.current.getAccessToken();
      });

      expect(token).toBe(mockSession.accessToken);
    });

    it('should return null when not authenticated', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      let token: string | null = 'initial';
      await act(async () => {
        token = await result.current.getAccessToken();
      });

      expect(token).toBeNull();
    });

    it('should refresh token if about to expire', async () => {
      const mockSession = createMockSession({
        expiresAt: new Date(Date.now() + 20000), // Expires in 20 seconds
      });
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );

      vi.mocked(authAPI.refreshToken).mockResolvedValue({
        accessToken: 'refreshed-access-token',
        idToken: 'refreshed-id-token',
        expiresIn: 3600,
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
      });

      let token: string | null = null;
      await act(async () => {
        token = await result.current.getAccessToken();
      });

      expect(authAPI.refreshToken).toHaveBeenCalled();
      expect(token).toBe('refreshed-access-token');
    });
  });

  describe('MFA Verification', () => {
    it('should complete login after successful MFA verification', async () => {
      // First, trigger MFA challenge
      vi.mocked(authAPI.login).mockResolvedValue({
        challengeType: 'MFA',
        session: 'mfa-session-token',
      });

      const mockSession = createMockSession();
      vi.mocked(authAPI.verifyMFAChallenge).mockResolvedValue(createMockLoginResponse(mockSession));

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      // Login triggers MFA
      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password123' });
      });

      expect(result.current.status).toBe('mfa_required');

      // Verify MFA
      await act(async () => {
        await result.current.verifyMFA('123456');
      });

      expect(authAPI.verifyMFAChallenge).toHaveBeenCalledWith('mfa-session-token', '123456');
      expect(result.current.status).toBe('authenticated');
      expect(result.current.session?.email).toBe(mockSession.email);
    });

    it('should set error on failed MFA verification', async () => {
      vi.mocked(authAPI.login).mockResolvedValue({
        challengeType: 'MFA',
        session: 'mfa-session-token',
      });

      vi.mocked(authAPI.verifyMFAChallenge).mockRejectedValue(
        new (AuthError as any)('INVALID_MFA_CODE', 'Invalid verification code')
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password123' });
      });

      await act(async () => {
        await result.current.verifyMFA('000000');
      });

      expect(result.current.error).toBe('Invalid verification code');
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      vi.mocked(authAPI.login).mockRejectedValue(
        new (AuthError as any)('INVALID_CREDENTIALS', 'Invalid email or password')
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('unauthenticated');
      });

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'wrong' });
      });

      expect(result.current.error).toBe('Invalid email or password');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});

describe('Session Storage Helpers', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('saveSession', () => {
    it('should serialize and store session', () => {
      const session = createMockSession();
      saveSession(session);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        AUTH_SESSION_KEY,
        expect.any(String)
      );

      const stored = JSON.parse(localStorageMock.store[AUTH_SESSION_KEY]);
      expect(stored.session.userId).toBe(session.userId);
      expect(stored.session.email).toBe(session.email);
    });
  });

  describe('loadSession', () => {
    it('should return null when no session stored', () => {
      const session = loadSession();
      expect(session).toBeNull();
    });

    it('should return session when valid session stored', () => {
      const mockSession = createMockSession();
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...mockSession,
            expiresAt: mockSession.expiresAt.toISOString(),
          },
        })
      );

      const session = loadSession();
      expect(session).not.toBeNull();
      expect(session?.userId).toBe(mockSession.userId);
    });

    it('should return null and clear storage for expired session', () => {
      const expiredSession = createMockSession({
        expiresAt: new Date(Date.now() - 1000),
      });
      localStorageMock.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({
          session: {
            ...expiredSession,
            expiresAt: expiredSession.expiresAt.toISOString(),
          },
        })
      );

      const session = loadSession();
      expect(session).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_SESSION_KEY);
    });

    it('should return null and clear storage for invalid JSON', () => {
      localStorageMock.setItem(AUTH_SESSION_KEY, 'invalid-json');

      const session = loadSession();
      expect(session).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_SESSION_KEY);
    });
  });

  describe('clearSession', () => {
    it('should remove session from storage', () => {
      localStorageMock.setItem(AUTH_SESSION_KEY, 'some-data');
      clearSession();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_SESSION_KEY);
    });
  });
});
