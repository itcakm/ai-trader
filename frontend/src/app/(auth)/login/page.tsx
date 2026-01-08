'use client';

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import { authAPI, AuthError, SSOProvider } from '@/services/auth-api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

/**
 * Login Page
 * Requirements: 9.1, 9.7, 9.8, 9.9
 * - Email/password form with validation
 * - SSO provider buttons
 * - Forgot password link
 * - Sign up link
 * - Loading and error states
 */

interface FormErrors {
  email?: string;
  password?: string;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, login, error: authError, clearError } = useAuth();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // SSO state
  const [ssoProviders, setSsoProviders] = useState<SSOProvider[]>([]);
  const [loadingSSOProviders, setLoadingSSOProviders] = useState(true);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [initiatingSSO, setInitiatingSSO] = useState<string | null>(null);
  const hasRedirected = useRef(false);

  // Get redirect URL from query params
  const redirectUrl = searchParams.get('redirect') || '/';

  // Redirect if already authenticated
  useEffect(() => {
    if (status === 'authenticated' && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace(redirectUrl);
    }
  }, [status, redirectUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load SSO providers on mount
  useEffect(() => {
    async function loadSSOProviders() {
      try {
        const providers = await authAPI.getProviders();
        setSsoProviders(providers.filter(p => p.enabled));
      } catch (err) {
        console.error('Failed to load SSO providers:', err);
        // Don't show error - SSO is optional
      } finally {
        setLoadingSSOProviders(false);
      }
    }
    loadSSOProviders();
  }, []);

  // Clear auth error when component unmounts or form changes
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [email, password]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login({ email: email.trim(), password });
      // Redirect happens via useEffect when status changes to authenticated
    } catch (err) {
      // Error is handled by AuthProvider and exposed via authError
      console.error('Login failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle SSO login
  const handleSSOLogin = async (providerId: string) => {
    setInitiatingSSO(providerId);
    setSsoError(null);

    try {
      const response = await authAPI.initiateSSO(providerId, window.location.origin + '/auth/sso/callback');
      // Redirect to SSO provider
      window.location.href = response.authorizationUrl;
    } catch (err) {
      const message = err instanceof AuthError ? err.getUserMessage() : 'Failed to initiate SSO login';
      setSsoError(message);
      setInitiatingSSO(null);
    }
  };

  // Show loading while checking auth status
  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Handle MFA required state
  if (status === 'mfa_required') {
    router.push('/login/mfa');
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          <p className="mt-2 text-muted-foreground">Sign in to your account</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Sign In</CardTitle>
          </CardHeader>

          <CardContent>
            {/* Error display */}
            {(authError || ssoError) && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                {authError || ssoError}
              </div>
            )}

            {/* Login form */}
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
                  }}
                  error={errors.email}
                  placeholder="you@example.com"
                  disabled={isSubmitting}
                  required
                  aria-required="true"
                />

                <div>
                  <div className="relative">
                    <Input
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                      }}
                      error={errors.password}
                      placeholder="Enter your password"
                      disabled={isSubmitting}
                      required
                      aria-required="true"
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
                </div>

                <div className="flex items-center justify-between">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isSubmitting}
                  loadingText="Signing in..."
                  disabled={isSubmitting}
                >
                  Sign In
                </Button>
              </div>
            </form>

            {/* SSO Providers */}
            {!loadingSSOProviders && ssoProviders.length > 0 && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-card text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {ssoProviders.map((provider) => (
                    <Button
                      key={provider.id}
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleSSOLogin(provider.id)}
                      disabled={initiatingSSO !== null}
                      loading={initiatingSSO === provider.id}
                    >
                      {provider.logoUrl && (
                        <img
                          src={provider.logoUrl}
                          alt=""
                          className="h-5 w-5 mr-2"
                          aria-hidden="true"
                        />
                      )}
                      {provider.displayName || provider.name}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link
                href="/signup"
                className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoginContent />
    </Suspense>
  );
}
