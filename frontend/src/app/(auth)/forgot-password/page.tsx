'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { authAPI, AuthError } from '@/services/auth-api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

/**
 * Forgot Password Page
 * Requirements: 9.4
 * - Email input form
 * - Show success message with instructions
 */

export default function ForgotPasswordPage() {
  // Form state
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Validate email
  const validateEmail = useCallback((): boolean => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }
    return true;
  }, [email]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateEmail()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await authAPI.forgotPassword(email.trim());
      setIsSuccess(true);
    } catch (err) {
      // For security, we show success even if email doesn't exist
      // to prevent email enumeration attacks
      if (err instanceof AuthError && err.code === 'USER_NOT_FOUND') {
        setIsSuccess(true);
      } else {
        const message = err instanceof AuthError 
          ? err.getUserMessage() 
          : 'Failed to send reset email. Please try again.';
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Check Your Email</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="text-center">
                {/* Success icon */}
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
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>

                <p className="text-muted-foreground mb-4">
                  If an account exists for <strong className="text-foreground">{email}</strong>, 
                  you will receive a password reset email shortly.
                </p>

                <p className="text-sm text-muted-foreground mb-6">
                  Please check your inbox and follow the instructions to reset your password. 
                  The link will expire in 24 hours.
                </p>

                <div className="space-y-3">
                  <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
                    <Button variant="primary" className="w-full">
                      I Have a Reset Code
                    </Button>
                  </Link>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setIsSuccess(false);
                      setEmail('');
                    }}
                  >
                    Try Different Email
                  </Button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="justify-center">
              <p className="text-sm text-muted-foreground">
                Remember your password?{' '}
                <Link
                  href="/login"
                  className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          <p className="mt-2 text-muted-foreground">Reset your password</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Forgot Password</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            {/* Error display */}
            {error && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                {error}
              </div>
            )}

            {/* Forgot password form */}
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
                    setError(null);
                  }}
                  error={error && !email.trim() ? error : undefined}
                  placeholder="you@example.com"
                  disabled={isSubmitting}
                  required
                  aria-required="true"
                />

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isSubmitting}
                  loadingText="Sending..."
                  disabled={isSubmitting}
                >
                  Send Reset Link
                </Button>
              </div>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Remember your password?{' '}
              <Link
                href="/login"
                className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
