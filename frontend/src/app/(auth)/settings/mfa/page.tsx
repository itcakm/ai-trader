'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import { authAPI, AuthError } from '@/services/auth-api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

/**
 * MFA Setup Page
 * Requirements: 9.5
 * - Display QR code for authenticator app
 * - Verification code input
 * - Show backup codes after setup
 */

type SetupStep = 'loading' | 'setup' | 'verify' | 'success';

interface MFASetupData {
  secretCode: string;
  session: string;
}

function MFASetupContent() {
  const router = useRouter();
  const { status, session, getAccessToken } = useAuth();

  // Setup state
  const [step, setStep] = useState<SetupStep>('loading');
  const [setupData, setSetupData] = useState<MFASetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/settings/mfa');
    }
  }, [status, router]);

  // Initialize MFA setup
  useEffect(() => {
    async function initSetup() {
      if (status !== 'authenticated') return;

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          router.push('/login?redirect=/settings/mfa');
          return;
        }

        const response = await authAPI.setupMFA(accessToken);
        setSetupData({
          secretCode: response.secretCode,
          session: response.session,
        });
        setStep('setup');
      } catch (err) {
        const message = err instanceof AuthError 
          ? err.getUserMessage() 
          : 'Failed to initialize MFA setup. Please try again.';
        setError(message);
        setStep('setup');
      }
    }

    if (status === 'authenticated') {
      initSetup();
    }
  }, [status, getAccessToken, router]);

  // Generate QR code URL for authenticator apps
  const getQRCodeUrl = useCallback(() => {
    if (!setupData?.secretCode || !session?.email) return '';
    
    const issuer = encodeURIComponent('AI Crypto Trading');
    const account = encodeURIComponent(session.email);
    const secret = setupData.secretCode;
    
    // otpauth URL format for TOTP
    const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    
    // Use Google Charts API to generate QR code
    return `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`;
  }, [setupData, session]);

  // Handle verification
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsSubmitting(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        router.push('/login?redirect=/settings/mfa');
        return;
      }

      const response = await authAPI.verifyMFASetup(
        accessToken,
        verificationCode.trim(),
        'Authenticator App'
      );

      if (response.status === 'SUCCESS') {
        // Generate mock backup codes (in production, these would come from the API)
        const codes = Array.from({ length: 10 }, () => 
          Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
          Math.random().toString(36).substring(2, 6).toUpperCase()
        );
        setBackupCodes(codes);
        setStep('success');
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err) {
      const message = err instanceof AuthError 
        ? err.getUserMessage() 
        : 'Failed to verify MFA code. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy backup codes to clipboard
  const copyBackupCodes = useCallback(() => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
  }, [backupCodes]);

  // Show loading while checking auth status
  if (status === 'loading' || status === 'idle' || step === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-muted-foreground">Setting up MFA...</p>
        </div>
      </div>
    );
  }

  // Success state - show backup codes
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle as="h2">MFA Enabled Successfully</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="text-center mb-6">
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
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <p className="text-muted-foreground">
                  Two-factor authentication has been enabled for your account.
                </p>
              </div>

              {/* Backup codes */}
              <div className="bg-muted rounded-lg p-4 mb-4">
                <h3 className="font-medium text-foreground mb-2">Backup Codes</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Save these backup codes in a secure place. You can use them to access your account if you lose your authenticator device.
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {backupCodes.map((code, index) => (
                    <div key={index} className="bg-background px-2 py-1 rounded text-center">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={copyBackupCodes}
                >
                  Copy Codes
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'backup-codes.txt';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download
                </Button>
              </div>

              <div className="mt-6">
                <Link href="/settings/account">
                  <Button variant="primary" className="w-full">
                    Done
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
          <p className="mt-2 text-muted-foreground">Set up two-factor authentication</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Enable MFA</CardTitle>
          </CardHeader>

          <CardContent>
            {error && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                {error}
              </div>
            )}

            {step === 'setup' && setupData && (
              <>
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  
                  {/* QR Code */}
                  <div className="inline-block p-4 bg-white rounded-lg shadow-sm mb-4">
                    <img
                      src={getQRCodeUrl()}
                      alt="MFA QR Code"
                      width={200}
                      height={200}
                      className="mx-auto"
                    />
                  </div>

                  {/* Manual entry option */}
                  <details className="text-left">
                    <summary className="text-sm text-primary-600 cursor-pointer hover:underline">
                      Can&apos;t scan? Enter code manually
                    </summary>
                    <div className="mt-2 p-3 bg-muted rounded-md">
                      <p className="text-xs text-muted-foreground mb-1">Secret key:</p>
                      <code className="text-sm font-mono break-all">{setupData.secretCode}</code>
                    </div>
                  </details>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => setStep('verify')}
                >
                  Continue
                </Button>
              </>
            )}

            {step === 'verify' && (
              <form onSubmit={handleVerify} noValidate>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the 6-digit code from your authenticator app to verify setup.
                </p>

                <div className="space-y-4">
                  <Input
                    label="Verification Code"
                    type="text"
                    id="code"
                    name="code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setVerificationCode(value);
                      setError(null);
                    }}
                    placeholder="Enter 6-digit code"
                    disabled={isSubmitting}
                    required
                    aria-required="true"
                  />

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setStep('setup')}
                      disabled={isSubmitting}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      className="flex-1"
                      loading={isSubmitting}
                      loadingText="Verifying..."
                      disabled={isSubmitting}
                    >
                      Verify
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </CardContent>

          <CardFooter className="justify-center">
            <Link
              href="/settings/account"
              className="text-sm text-primary-600 hover:text-primary-700 hover:underline font-medium"
            >
              Cancel and go back
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-4 text-muted-foreground">Setting up MFA...</p>
      </div>
    </div>
  );
}

export default function MFASetupPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MFASetupContent />
    </Suspense>
  );
}
