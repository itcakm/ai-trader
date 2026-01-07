'use client';

import React, { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authAPI, AuthError } from '@/services/auth-api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

/**
 * Reset Password Page
 * Requirements: 9.4
 * - Code, new password, confirm password fields
 * - Redirect to login after reset
 */

interface FormData {
  email: string;
  code: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  email?: string;
  code?: string;
  password?: string;
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

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get email from query params
  const emailFromParams = searchParams.get('email') || '';

  // Form state
  const [formData, setFormData] = useState<FormData>({
    email: emailFromParams,
    code: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Password strength
  const passwordStrength = calculatePasswordStrength(formData.password);

  // Update form field
  const updateField = useCallback((field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
    setSubmitError(null);
  }, [errors]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Code validation
    if (!formData.code.trim()) {
      newErrors.code = 'Reset code is required';
    } else if (!/^\d{6}$/.test(formData.code.trim())) {
      newErrors.code = 'Please enter a valid 6-digit code';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 12) {
      newErrors.password = 'Password must be at least 12 characters';
    } else if (passwordStrength.score < 5) {
      newErrors.password = 'Password must include uppercase, lowercase, numbers, and symbols';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, passwordStrength.score]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await authAPI.resetPassword(
        formData.email.trim(),
        formData.code.trim(),
        formData.password
      );
      setIsSuccess(true);
      
      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login?reset=true');
      }, 3000);
    } catch (err) {
      const message = err instanceof AuthError 
        ? err.getUserMessage() 
        : 'Failed to reset password. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Password Reset Successful</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>

                <p className="text-muted-foreground mb-4">
                  Your password has been reset successfully.
                </p>

                <p className="text-sm text-muted-foreground mb-6">
                  You will be redirected to the login page in a few seconds...
                </p>

                <Link href="/login">
                  <Button variant="primary" className="w-full">
                    Sign In Now
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          <p className="mt-2 text-muted-foreground">Create a new password</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Reset Password</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the code from your email and create a new password.
            </p>

            {submitError && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  error={errors.email}
                  placeholder="you@example.com"
                  disabled={isSubmitting || !!emailFromParams}
                  required
                  aria-required="true"
                />

                <Input
                  label="Reset Code"
                  type="text"
                  id="code"
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={formData.code}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    updateField('code', value);
                  }}
                  error={errors.code}
                  placeholder="Enter 6-digit code"
                  disabled={isSubmitting}
                  required
                  aria-required="true"
                />

                <div>
                  <div className="relative">
                    <Input
                      label="New Password"
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      autoComplete="new-password"
                      value={formData.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      error={errors.password}
                      placeholder="Create a strong password"
                      disabled={isSubmitting}
                      required
                      aria-required="true"
                      aria-describedby="password-requirements"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOffIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>

                  {formData.password && (
                    <div className="mt-2" id="password-requirements">
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
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li className={passwordStrength.requirements.minLength ? 'text-green-600' : ''}>
                          {passwordStrength.requirements.minLength ? '✓' : '○'} At least 12 characters
                        </li>
                        <li className={passwordStrength.requirements.hasUppercase ? 'text-green-600' : ''}>
                          {passwordStrength.requirements.hasUppercase ? '✓' : '○'} One uppercase letter
                        </li>
                        <li className={passwordStrength.requirements.hasLowercase ? 'text-green-600' : ''}>
                          {passwordStrength.requirements.hasLowercase ? '✓' : '○'} One lowercase letter
                        </li>
                        <li className={passwordStrength.requirements.hasNumber ? 'text-green-600' : ''}>
                          {passwordStrength.requirements.hasNumber ? '✓' : '○'} One number
                        </li>
                        <li className={passwordStrength.requirements.hasSymbol ? 'text-green-600' : ''}>
                          {passwordStrength.requirements.hasSymbol ? '✓' : '○'} One special character
                        </li>
                      </ul>
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
                    value={formData.confirmPassword}
                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                    error={errors.confirmPassword}
                    placeholder="Confirm your password"
                    disabled={isSubmitting}
                    required
                    aria-required="true"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isSubmitting}
                  loadingText="Resetting password..."
                  disabled={isSubmitting}
                >
                  Reset Password
                </Button>
              </div>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              <Link
                href="/forgot-password"
                className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
              >
                Request a new code
              </Link>
              {' · '}
              <Link
                href="/login"
                className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
              >
                Back to Sign In
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
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
