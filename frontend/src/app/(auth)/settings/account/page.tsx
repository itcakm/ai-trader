'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import { authAPI, AuthError } from '@/services/auth-api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

/**
 * Account Settings Page
 * Requirements: 9.11
 * - Change password form
 * - MFA enable/disable toggle
 * - Show active sessions (future)
 */

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface PasswordFormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
}

function calculatePasswordStrength(password: string): PasswordStrength {
  const requirements = {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const score = Object.values(requirements).filter(Boolean).length;

  let label: string;
  let color: string;

  if (score === 0) {
    label = '';
    color = 'bg-gray-200';
  } else if (score <= 2) {
    label = 'Weak';
    color = 'bg-red-500';
  } else if (score <= 3) {
    label = 'Fair';
    color = 'bg-yellow-500';
  } else if (score <= 4) {
    label = 'Good';
    color = 'bg-blue-500';
  } else {
    label = 'Strong';
    color = 'bg-green-500';
  }

  return { score, label, color, requirements };
}

function AccountSettingsContent() {
  const router = useRouter();
  const { status, session, getAccessToken, logout } = useAuth();

  // Password change state
  const [passwordForm, setPasswordForm] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState<PasswordFormErrors>({});
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [isTogglingMFA, setIsTogglingMFA] = useState(false);

  // Password strength
  const passwordStrength = calculatePasswordStrength(passwordForm.newPassword);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/settings/account');
    }
  }, [status, router]);

  // Update password form field
  const updatePasswordField = useCallback((field: keyof PasswordFormData, value: string) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
    if (passwordErrors[field]) {
      setPasswordErrors(prev => ({ ...prev, [field]: undefined }));
    }
    setPasswordChangeError(null);
    setPasswordChangeSuccess(false);
  }, [passwordErrors]);

  // Validate password form
  const validatePasswordForm = useCallback((): boolean => {
    const newErrors: PasswordFormErrors = {};

    if (!passwordForm.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!passwordForm.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (passwordForm.newPassword.length < 12) {
      newErrors.newPassword = 'Password must be at least 12 characters';
    } else if (passwordStrength.score < 5) {
      newErrors.newPassword = 'Password must include uppercase, lowercase, numbers, and symbols';
    } else if (passwordForm.newPassword === passwordForm.currentPassword) {
      newErrors.newPassword = 'New password must be different from current password';
    }

    if (!passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [passwordForm, passwordStrength.score]);

  // Handle password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);
    setPasswordChangeSuccess(false);

    if (!validatePasswordForm()) {
      return;
    }

    setIsChangingPassword(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        router.push('/login?redirect=/settings/account');
        return;
      }

      await authAPI.changePassword(
        accessToken,
        passwordForm.currentPassword,
        passwordForm.newPassword
      );

      setPasswordChangeSuccess(true);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      // Log out after password change for security
      setTimeout(async () => {
        await logout();
        router.push('/login?passwordChanged=true');
      }, 2000);
    } catch (err) {
      const message = err instanceof AuthError 
        ? err.getUserMessage() 
        : 'Failed to change password. Please try again.';
      setPasswordChangeError(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Handle MFA toggle
  const handleMFAToggle = useCallback(() => {
    if (mfaEnabled) {
      // Disable MFA - would need API call
      setIsTogglingMFA(true);
      // In production, this would call an API to disable MFA
      setTimeout(() => {
        setMfaEnabled(false);
        setIsTogglingMFA(false);
      }, 1000);
    } else {
      // Enable MFA - redirect to setup page
      router.push('/settings/mfa');
    }
  }, [mfaEnabled, router]);

  // Show loading while checking auth status
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-foreground hover:text-primary-600">
              AI Crypto Trading
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">Account Settings</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{session?.email}</span>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground mb-8">Account Settings</h1>

        {/* Profile section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle as="h2">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Name
                </label>
                <p className="text-foreground">{session?.name || 'Not set'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Email
                </label>
                <p className="text-foreground">{session?.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Organization
                </label>
                <p className="text-foreground">{session?.organizationId || 'Not set'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change password section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle as="h2">Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            {passwordChangeSuccess && (
              <div
                role="status"
                className="mb-4 p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm"
              >
                Password changed successfully! You will be signed out shortly.
              </div>
            )}

            {passwordChangeError && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                {passwordChangeError}
              </div>
            )}

            <form onSubmit={handlePasswordChange} noValidate>
              <div className="space-y-4">
                <div className="relative">
                  <Input
                    label="Current Password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    id="currentPassword"
                    name="currentPassword"
                    autoComplete="current-password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => updatePasswordField('currentPassword', e.target.value)}
                    error={passwordErrors.currentPassword}
                    disabled={isChangingPassword}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>

                <div>
                  <div className="relative">
                    <Input
                      label="New Password"
                      type={showNewPassword ? 'text' : 'password'}
                      id="newPassword"
                      name="newPassword"
                      autoComplete="new-password"
                      value={passwordForm.newPassword}
                      onChange={(e) => updatePasswordField('newPassword', e.target.value)}
                      error={passwordErrors.newPassword}
                      disabled={isChangingPassword}
                      required
                      aria-describedby="new-password-requirements"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>

                  {passwordForm.newPassword && (
                    <div className="mt-2" id="new-password-requirements">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                            style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground min-w-[50px]">
                          {passwordStrength.label}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <Input
                    label="Confirm New Password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => updatePasswordField('confirmPassword', e.target.value)}
                    error={passwordErrors.confirmPassword}
                    disabled={isChangingPassword}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={isChangingPassword}
                  loadingText="Changing password..."
                  disabled={isChangingPassword}
                >
                  Change Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* MFA section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle as="h2">Two-Factor Authentication</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground font-medium">
                  {mfaEnabled ? 'MFA is enabled' : 'MFA is disabled'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {mfaEnabled 
                    ? 'Your account is protected with two-factor authentication.'
                    : 'Add an extra layer of security to your account.'}
                </p>
              </div>
              <Button
                variant={mfaEnabled ? 'outline' : 'primary'}
                onClick={handleMFAToggle}
                loading={isTogglingMFA}
                disabled={isTogglingMFA}
              >
                {mfaEnabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Active sessions section (future) */}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Session management will be available in a future update.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Icon components
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AccountSettingsContent />
    </Suspense>
  );
}
