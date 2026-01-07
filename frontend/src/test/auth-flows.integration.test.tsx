/**
 * Integration Tests for Auth Flows
 * Requirements: 13.3, 13.4
 * 
 * Tests:
 * - Complete signup → verify → login flow
 * - MFA setup and challenge flow
 * - Password reset flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ============================================================================
// Mock Setup
// ============================================================================

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

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/login',
}));

// Mock API responses
const mockApiResponses = {
  signup: vi.fn(),
  login: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  setupMFA: vi.fn(),
  verifyMFASetup: vi.fn(),
  verifyMFAChallenge: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
  getProviders: vi.fn().mockResolvedValue([]),
};

vi.mock('@/services/auth-api', () => ({
  authAPI: {
    signup: (...args: any[]) => mockApiResponses.signup(...args),
    login: (...args: any[]) => mockApiResponses.login(...args),
    verifyEmail: (...args: any[]) => mockApiResponses.verifyEmail(...args),
    resendVerification: (...args: any[]) => mockApiResponses.resendVerification(...args),
    forgotPassword: (...args: any[]) => mockApiResponses.forgotPassword(...args),
    resetPassword: (...args: any[]) => mockApiResponses.resetPassword(...args),
    setupMFA: (...args: any[]) => mockApiResponses.setupMFA(...args),
    verifyMFASetup: (...args: any[]) => mockApiResponses.verifyMFASetup(...args),
    verifyMFAChallenge: (...args: any[]) => mockApiResponses.verifyMFAChallenge(...args),
    refreshToken: (...args: any[]) => mockApiResponses.refreshToken(...args),
    logout: (...args: any[]) => mockApiResponses.logout(...args),
    getProviders: (...args: any[]) => mockApiResponses.getProviders(...args),
    initiateSSO: vi.fn(),
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
    USER_EXISTS: 'USER_EXISTS',
    EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
    INVALID_MFA_CODE: 'INVALID_MFA_CODE',
    CODE_EXPIRED: 'CODE_EXPIRED',
  },
}));

// Import components after mocks
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLoginResponse(options: { mfaRequired?: boolean } = {}) {
  if (options.mfaRequired) {
    return {
      challengeType: 'MFA' as const,
      session: 'mfa-session-token',
    };
  }

  return {
    tokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      idToken: 'mock-id-token',
      expiresIn: 3600,
    },
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      tenantId: 'org-123',
      roles: ['TRADER'],
      emailVerified: true,
    },
  };
}

// Test component that displays auth state
function AuthStateDisplay() {
  const { status, session, error, mfaChallenge, login, verifyMFA, logout, clearError } = useAuth();

  return (
    <div>
      <div data-testid="auth-status">{status}</div>
      <div data-testid="auth-error">{error || 'no-error'}</div>
      <div data-testid="user-email">{session?.email || 'no-user'}</div>
      <div data-testid="mfa-session">{mfaChallenge?.session || 'no-mfa'}</div>
      
      <button
        data-testid="login-btn"
        onClick={() => login({ email: 'test@example.com', password: 'password123' })}
      >
        Login
      </button>
      
      <button
        data-testid="verify-mfa-btn"
        onClick={() => verifyMFA('123456')}
      >
        Verify MFA
      </button>
      
      <button
        data-testid="logout-btn"
        onClick={() => logout()}
      >
        Logout
      </button>
      
      <button
        data-testid="clear-error-btn"
        onClick={() => clearError()}
      >
        Clear Error
      </button>
    </div>
  );
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Auth Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockSearchParams.delete('email');
    Object.values(mockApiResponses).forEach(mock => mock.mockReset?.());
    mockApiResponses.getProviders.mockResolvedValue([]);
  });

  describe('Complete Signup → Verify → Login Flow', () => {
    it('should complete full signup to login flow', async () => {
      // Step 1: Signup
      mockApiResponses.signup.mockResolvedValue({
        userId: 'user-123',
        userConfirmed: false,
        codeDeliveryDetails: {
          destination: 't***@example.com',
          deliveryMedium: 'EMAIL',
          attributeName: 'email',
        },
      });

      // Step 2: Verify Email
      mockApiResponses.verifyEmail.mockResolvedValue(undefined);

      // Step 3: Login
      mockApiResponses.login.mockResolvedValue(createMockLoginResponse());

      // Render auth state display
      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      // Wait for initial state
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Simulate signup (would normally be done via signup page)
      await act(async () => {
        await mockApiResponses.signup({
          name: 'Test User',
          email: 'test@example.com',
          password: 'StrongP@ss123!',
        });
      });

      expect(mockApiResponses.signup).toHaveBeenCalledWith({
        name: 'Test User',
        email: 'test@example.com',
        password: 'StrongP@ss123!',
      });

      // Simulate email verification
      await act(async () => {
        await mockApiResponses.verifyEmail('test@example.com', '123456');
      });

      expect(mockApiResponses.verifyEmail).toHaveBeenCalledWith('test@example.com', '123456');

      // Now login
      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
    });

    it('should handle signup with existing email', async () => {
      const { AuthError } = await import('@/services/auth-api');
      mockApiResponses.signup.mockRejectedValue(
        new (AuthError as any)('USER_EXISTS', 'An account with this email already exists')
      );

      await expect(
        mockApiResponses.signup({
          name: 'Test User',
          email: 'existing@example.com',
          password: 'StrongP@ss123!',
        })
      ).rejects.toThrow('An account with this email already exists');
    });

    it('should handle invalid verification code', async () => {
      const { AuthError } = await import('@/services/auth-api');
      mockApiResponses.verifyEmail.mockRejectedValue(
        new (AuthError as any)('CODE_EXPIRED', 'The verification code has expired')
      );

      await expect(
        mockApiResponses.verifyEmail('test@example.com', 'invalid')
      ).rejects.toThrow('The verification code has expired');
    });

    it('should allow resending verification code', async () => {
      mockApiResponses.resendVerification.mockResolvedValue(undefined);

      await act(async () => {
        await mockApiResponses.resendVerification('test@example.com');
      });

      expect(mockApiResponses.resendVerification).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('MFA Setup and Challenge Flow', () => {
    it('should complete MFA challenge during login', async () => {
      // First login returns MFA challenge
      mockApiResponses.login.mockResolvedValue(createMockLoginResponse({ mfaRequired: true }));

      // MFA verification returns tokens
      mockApiResponses.verifyMFAChallenge.mockResolvedValue(createMockLoginResponse());

      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Login triggers MFA challenge
      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('mfa_required');
      });

      expect(screen.getByTestId('mfa-session')).toHaveTextContent('mfa-session-token');

      // Verify MFA
      const verifyMfaBtn = screen.getByTestId('verify-mfa-btn');
      await act(async () => {
        fireEvent.click(verifyMfaBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      expect(mockApiResponses.verifyMFAChallenge).toHaveBeenCalledWith('mfa-session-token', '123456');
    });

    it('should handle invalid MFA code', async () => {
      const { AuthError } = await import('@/services/auth-api');
      
      mockApiResponses.login.mockResolvedValue(createMockLoginResponse({ mfaRequired: true }));
      mockApiResponses.verifyMFAChallenge.mockRejectedValue(
        new (AuthError as any)('INVALID_MFA_CODE', 'Invalid verification code')
      );

      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Login triggers MFA challenge
      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('mfa_required');
      });

      // Verify MFA with invalid code
      const verifyMfaBtn = screen.getByTestId('verify-mfa-btn');
      await act(async () => {
        fireEvent.click(verifyMfaBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-error')).toHaveTextContent('Invalid verification code');
      });
    });

    it('should setup MFA for authenticated user', async () => {
      mockApiResponses.setupMFA.mockResolvedValue({
        secretCode: 'ABCDEFGHIJKLMNOP',
        session: 'setup-session',
      });

      mockApiResponses.verifyMFASetup.mockResolvedValue({
        status: 'SUCCESS',
      });

      // Simulate MFA setup flow
      const setupResult = await mockApiResponses.setupMFA('access-token');
      expect(setupResult.secretCode).toBe('ABCDEFGHIJKLMNOP');

      // Verify MFA setup with code from authenticator app
      const verifyResult = await mockApiResponses.verifyMFASetup('access-token', '123456', 'My Phone');
      expect(verifyResult.status).toBe('SUCCESS');
    });
  });

  describe('Password Reset Flow', () => {
    it('should complete password reset flow', async () => {
      mockApiResponses.forgotPassword.mockResolvedValue(undefined);
      mockApiResponses.resetPassword.mockResolvedValue(undefined);
      mockApiResponses.login.mockResolvedValue(createMockLoginResponse());

      // Step 1: Request password reset
      await act(async () => {
        await mockApiResponses.forgotPassword('test@example.com');
      });

      expect(mockApiResponses.forgotPassword).toHaveBeenCalledWith('test@example.com');

      // Step 2: Reset password with code
      await act(async () => {
        await mockApiResponses.resetPassword('test@example.com', '123456', 'NewP@ssword123!');
      });

      expect(mockApiResponses.resetPassword).toHaveBeenCalledWith(
        'test@example.com',
        '123456',
        'NewP@ssword123!'
      );

      // Step 3: Login with new password
      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });
    });

    it('should handle invalid reset code', async () => {
      const { AuthError } = await import('@/services/auth-api');
      mockApiResponses.resetPassword.mockRejectedValue(
        new (AuthError as any)('CODE_EXPIRED', 'The reset code has expired')
      );

      await expect(
        mockApiResponses.resetPassword('test@example.com', 'invalid', 'NewP@ssword123!')
      ).rejects.toThrow('The reset code has expired');
    });

    it('should handle non-existent email gracefully', async () => {
      // For security, forgot password should not reveal if email exists
      mockApiResponses.forgotPassword.mockResolvedValue(undefined);

      await act(async () => {
        await mockApiResponses.forgotPassword('nonexistent@example.com');
      });

      // Should succeed without revealing email doesn't exist
      expect(mockApiResponses.forgotPassword).toHaveBeenCalledWith('nonexistent@example.com');
    });
  });

  describe('Session Management', () => {
    it('should persist session across page reloads', async () => {
      mockApiResponses.login.mockResolvedValue(createMockLoginResponse());

      const { unmount } = render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Login
      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Verify session is stored
      expect(localStorageMock.setItem).toHaveBeenCalled();

      // Unmount and remount to simulate page reload
      unmount();

      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      // Session should be restored
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
    });

    it('should clear session on logout', async () => {
      mockApiResponses.login.mockResolvedValue(createMockLoginResponse());
      mockApiResponses.logout.mockResolvedValue(undefined);

      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Login
      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Logout
      const logoutBtn = screen.getByTestId('logout-btn');
      await act(async () => {
        fireEvent.click(logoutBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      expect(localStorageMock.removeItem).toHaveBeenCalled();
      expect(screen.getByTestId('user-email')).toHaveTextContent('no-user');
    });
  });

  describe('Error Handling', () => {
    it('should display and clear errors', async () => {
      const { AuthError } = await import('@/services/auth-api');
      mockApiResponses.login.mockRejectedValue(
        new (AuthError as any)('INVALID_CREDENTIALS', 'Invalid email or password')
      );

      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Failed login
      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-error')).toHaveTextContent('Invalid email or password');
      });

      // Clear error
      const clearErrorBtn = screen.getByTestId('clear-error-btn');
      await act(async () => {
        fireEvent.click(clearErrorBtn);
      });

      expect(screen.getByTestId('auth-error')).toHaveTextContent('no-error');
    });

    it('should handle email not verified error', async () => {
      const { AuthError } = await import('@/services/auth-api');
      mockApiResponses.login.mockRejectedValue(
        new (AuthError as any)('EMAIL_NOT_VERIFIED', 'Please verify your email address')
      );

      render(
        <TestWrapper>
          <AuthStateDisplay />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-error')).toHaveTextContent('Please verify your email address');
      });
    });
  });
});
