/**
 * Component Tests for Signup Page
 * Requirements: 13.3
 * 
 * Tests:
 * - Signup form validation
 * - Password strength indicator
 * - Error display
 * - Loading states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/signup',
}));

// Mock AuthProvider
let mockAuthStatus = 'unauthenticated';
vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    status: mockAuthStatus,
    session: null,
    error: null,
    mfaChallenge: null,
    login: vi.fn(),
    clearError: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    verifyMFA: vi.fn(),
    loginWithSSO: vi.fn(),
    setSessionFromSSO: vi.fn(),
    getAccessToken: vi.fn(),
  }),
}));

// Mock auth-api - use vi.hoisted to ensure proper hoisting
const mockSignup = vi.hoisted(() => vi.fn());
vi.mock('@/services/auth-api', () => ({
  authAPI: {
    signup: mockSignup,
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
import SignupPage from './page';
import { AuthError } from '@/services/auth-api';

describe('Signup Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStatus = 'unauthenticated';
    mockSignup.mockReset();
  });

  describe('Form Validation', () => {
    it('should show error when name is empty', async () => {
      render(<SignupPage />);

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(mockSignup).not.toHaveBeenCalled();
    });

    it('should show error when name is too short', async () => {
      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      await userEvent.type(nameInput, 'A');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument();
      });
    });

    it('should show error when email is empty', async () => {
      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      await userEvent.type(nameInput, 'Test User');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
      });
    });

    it('should show error when email format is invalid', async () => {
      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });
    });

    it('should show error when password is too short', async () => {
      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'short');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 12 characters')).toBeInTheDocument();
      });
    });

    it('should show error when passwords do not match', async () => {
      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;
      const confirmPasswordField = document.getElementById('confirmPassword') as HTMLInputElement;

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'StrongP@ss123!');
      await userEvent.type(confirmPasswordField, 'DifferentP@ss123!');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });

    it('should show error when terms are not accepted', async () => {
      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;
      const confirmPasswordField = document.getElementById('confirmPassword') as HTMLInputElement;

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'StrongP@ss123!');
      await userEvent.type(confirmPasswordField, 'StrongP@ss123!');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('You must accept the terms and conditions')).toBeInTheDocument();
      });
    });

    it('should call signup with valid data', async () => {
      mockSignup.mockResolvedValue({ userId: 'user-123', userConfirmed: false });

      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;
      const confirmPasswordField = document.getElementById('confirmPassword') as HTMLInputElement;
      const termsCheckbox = screen.getByRole('checkbox');

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'StrongP@ss123!');
      await userEvent.type(confirmPasswordField, 'StrongP@ss123!');
      await userEvent.click(termsCheckbox);

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignup).toHaveBeenCalledWith({
          name: 'Test User',
          email: 'test@example.com',
          password: 'StrongP@ss123!',
        });
      });
    });
  });

  describe('Password Strength Indicator', () => {
    it('should show weak password indicator', async () => {
      render(<SignupPage />);

      const passwordField = document.getElementById('password') as HTMLInputElement;
      await userEvent.type(passwordField, 'weak');

      expect(screen.getByText('Weak')).toBeInTheDocument();
    });

    it('should show strong password indicator', async () => {
      render(<SignupPage />);

      const passwordField = document.getElementById('password') as HTMLInputElement;
      await userEvent.type(passwordField, 'StrongP@ss123!');

      expect(screen.getByText('Strong')).toBeInTheDocument();
    });

    it('should show password requirements checklist', async () => {
      render(<SignupPage />);

      const passwordField = document.getElementById('password') as HTMLInputElement;
      await userEvent.type(passwordField, 'test');

      expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/one uppercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/one lowercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/one number/i)).toBeInTheDocument();
      expect(screen.getByText(/one special character/i)).toBeInTheDocument();
    });
  });

  describe('Error Display', () => {
    it('should display API error', async () => {
      mockSignup.mockRejectedValue(
        new (AuthError as any)('USER_EXISTS', 'An account with this email already exists')
      );

      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;
      const confirmPasswordField = document.getElementById('confirmPassword') as HTMLInputElement;
      const termsCheckbox = screen.getByRole('checkbox');

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'StrongP@ss123!');
      await userEvent.type(confirmPasswordField, 'StrongP@ss123!');
      await userEvent.click(termsCheckbox);

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('An account with this email already exists');
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading spinner when status is loading', () => {
      mockAuthStatus = 'loading';
      render(<SignupPage />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should disable form inputs during submission', async () => {
      // Make signup hang to simulate loading
      mockSignup.mockImplementation(() => new Promise(() => {}));

      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;
      const confirmPasswordField = document.getElementById('confirmPassword') as HTMLInputElement;
      const termsCheckbox = screen.getByRole('checkbox');

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'StrongP@ss123!');
      await userEvent.type(confirmPasswordField, 'StrongP@ss123!');
      await userEvent.click(termsCheckbox);

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(nameInput).toBeDisabled();
        expect(emailInput).toBeDisabled();
        expect(passwordField).toBeDisabled();
        expect(confirmPasswordField).toBeDisabled();
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('Navigation', () => {
    it('should have link to login page', () => {
      render(<SignupPage />);

      const loginLink = screen.getByRole('link', { name: /sign in/i });
      expect(loginLink).toHaveAttribute('href', '/login');
    });

    it('should redirect to verify-email page after successful signup', async () => {
      mockSignup.mockResolvedValue({ userId: 'user-123', userConfirmed: false });

      render(<SignupPage />);

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordField = document.getElementById('password') as HTMLInputElement;
      const confirmPasswordField = document.getElementById('confirmPassword') as HTMLInputElement;
      const termsCheckbox = screen.getByRole('checkbox');

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordField, 'StrongP@ss123!');
      await userEvent.type(confirmPasswordField, 'StrongP@ss123!');
      await userEvent.click(termsCheckbox);

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/verify-email?email=test%40example.com');
      });
    });

    it('should redirect to home when already authenticated', async () => {
      mockAuthStatus = 'authenticated';

      render(<SignupPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should toggle password visibility', async () => {
      render(<SignupPage />);

      const passwordField = document.getElementById('password') as HTMLInputElement;
      expect(passwordField).toHaveAttribute('type', 'password');

      // Find the first show password button (for password field)
      const toggleButtons = screen.getAllByRole('button', { name: /show password/i });
      await userEvent.click(toggleButtons[0]);

      expect(passwordField).toHaveAttribute('type', 'text');
    });

    it('should toggle confirm password visibility', async () => {
      render(<SignupPage />);

      const confirmPasswordField = document.getElementById('confirmPassword') as HTMLInputElement;
      expect(confirmPasswordField).toHaveAttribute('type', 'password');

      // Find the second show password button (for confirm password field)
      const toggleButtons = screen.getAllByRole('button', { name: /show password/i });
      await userEvent.click(toggleButtons[1]);

      expect(confirmPasswordField).toHaveAttribute('type', 'text');
    });
  });
});
