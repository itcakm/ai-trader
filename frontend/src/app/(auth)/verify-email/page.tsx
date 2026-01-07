'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authAPI, AuthError } from '@/services/auth-api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

/**
 * Email Verification Page
 * Requirements: 9.3
 * - Verification code input
 * - Resend code button
 * - Redirect to login after verification
 */

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get email from query params
  const emailFromParams = searchParams.get('email') || '';

  // Form state
  const [email, setEmail] = useState(emailFromParams);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: { email?: string; code?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!code.trim()) {
      newErrors.code = 'Verification code is required';
    } else if (!/^\d{6}$/.test(code.trim())) {
      newErrors.code = 'Please enter a valid 6-digit code';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [email, code]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await authAPI.verifyEmail(email.trim(), code.trim());
      setSuccessMessage('Email verified successfully! Redirecting to login...');
      
      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login?verified=true');
      }, 2000);
    } catch (err) {
      const message = err instanceof AuthError 
        ? err.getUserMessage() 
        : 'Failed to verify email. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle resend code
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    if (!email.trim()) {
      setErrors({ email: 'Email is required to resend code' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    setIsResending(true);
    setSubmitError(null);

    try {
      await authAPI.resendVerification(email.trim());
      setSuccessMessage('A new verification code has been sent to your email.');
      setResendCooldown(60); // 60 second cooldown
    } catch (err) {
      const message = err instanceof AuthError 
        ? err.getUserMessage() 
        : 'Failed to resend verification code. Please try again.';
      setSubmitError(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          <p className="mt-2 text-muted-foreground">Verify your email address</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Email Verification</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              We&apos;ve sent a verification code to your email address. Please enter the code below to verify your account.
            </p>

            {/* Success message */}
            {successMessage && (
              <div
                role="status"
                className="mb-4 p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm"
              >
                {successMessage}
              </div>
            )}

            {/* Error display */}
            {submitError && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                {submitError}
              </div>
            )}

            {/* Verification form */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                    setSubmitError(null);
                    setSuccessMessage(null);
                  }}
                  error={errors.email}
                  placeholder="you@example.com"
                  disabled={isSubmitting || !!emailFromParams}
                  required
                  aria-required="true"
                />

                <Input
                  label="Verification Code"
                  type="text"
                  id="code"
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    // Only allow digits
                    const value = e.target.value.replace(/\D/g, '');
                    setCode(value);
                    if (errors.code) setErrors(prev => ({ ...prev, code: undefined }));
                    setSubmitError(null);
                    setSuccessMessage(null);
                  }}
                  error={errors.code}
                  placeholder="Enter 6-digit code"
                  disabled={isSubmitting}
                  required
                  aria-required="true"
                />

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isSubmitting}
                  loadingText="Verifying..."
                  disabled={isSubmitting}
                >
                  Verify Email
                </Button>
              </div>
            </form>

            {/* Resend code */}
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Didn&apos;t receive the code?{' '}
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isResending || resendCooldown > 0}
                  className="text-primary-600 hover:text-primary-700 hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResending 
                    ? 'Sending...' 
                    : resendCooldown > 0 
                      ? `Resend in ${resendCooldown}s` 
                      : 'Resend code'}
                </button>
              </p>
            </div>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
