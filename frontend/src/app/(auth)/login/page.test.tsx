/**
 * Component Tests for Login Page
 * Requirements: 13.3
 * 
 * Tests:
 * - Login form validation
 * - Error display
 * - Loading states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

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

// Mock AuthProvider
const mockLogin = vi.fn();
const mockClearError = vi.fn();
let mockAuthState = {
  status: 'unauthenticated' as const,
  session: null,
  error: null as string | null,
  mfaChallenge: null,
};

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    ...mockAuthState,
    login: mockLogin,
    clearError: mockClearError,
    logout: vi.fn(),
    refreshSession: vi.fn(),
    verifyMFA: vi.fn(),
    loginWithSSO: vi.fn(),
    setSessionFromSSO: vi.fn(),
    getAccessToken: vi.fn(),
  }),
}));

// Mock auth-api
vi.mock('@/services/auth-api', () => ({
  authAPI: {
    getProviders: vi.fn().mockResolvedValue([]),
    initiateSSO: vi.fn(),
  },
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
    getUserMessage() {
      return this.message;
    }
  },
}));

// Import after mocks
import LoginPage from './page';

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      status: 'unauthenticated',
      session: null,
      error: null,
      mfaChallenge: null,
    };
  });

  describe('Form Validation', () => {
    it('should show error when email is empty', async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should show error when email format is invalid', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      await userEvent.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should show error when password is empty', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      await userEvent.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should call login with valid credentials', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByRole('textbox', { hidden: true }) || screen.getByPlaceholderText(/enter your password/i);

      await userEvent.type(emailInput, 'test@example.com');
      // Use the password input by id
      const passwordField = document.getElementById('password') as HTMLInputElement;
      await userEvent.type(passwordField, 'password123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
    });

    it('should clear validation errors when user types', async () => {
      render(<LoginPage />);

      // Trigger validation error
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
      });

      // Type in email field
      const emailInput = screen.getByLabelText(/email/i);
      await userEvent.type(emailInput, 't');

      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Display', () => {
    it('should display auth error from provider', async () => {
      mockAuthState.error = 'Invalid email or password';
      render(<LoginPage />);

      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });

    it('should clear error when clearError is called on unmount', () => {
      const { unmount } = render(<LoginPage />);
      unmount();

      expect(mockClearError).toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should show loading spinner when status is loading', () => {
      mockAuthState.status = 'loading';
      render(<LoginPage />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should disable form inputs during submission', async () => {
      // Make login hang to simulate loading
      mockLogin.mockImplementation(() => new Promise(() => {}));

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;

      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'password123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(emailInput).toBeDisabled();
        expect(passwordField).toBeDisabled();
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('Navigation', () => {
    it('should have link to forgot password page', () => {
      render(<LoginPage />);

      const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i });
      expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
    });

    it('should have link to signup page', () => {
      render(<LoginPage />);

      const signupLink = screen.getByRole('link', { name: /sign up/i });
      expect(signupLink).toHaveAttribute('href', '/signup');
    });

    it('should redirect to home when already authenticated', async () => {
      mockAuthState.status = 'authenticated';
      mockAuthState.session = { userId: 'user-123' } as any;

      render(<LoginPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('should redirect to MFA page when MFA is required', async () => {
      mockAuthState.status = 'mfa_required';
      mockAuthState.mfaChallenge = { challengeType: 'SOFTWARE_TOKEN_MFA', session: 'session' };

      render(<LoginPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login/mfa');
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should toggle password visibility', async () => {
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleButton = screen.getByRole('button', { name: /show password/i });
      await userEvent.click(toggleButton);

      expect(passwordInput).toHaveAttribute('type', 'text');

      await userEvent.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });
});
