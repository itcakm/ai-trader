'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { useOrganization } from '@/providers/OrganizationProvider';

interface EmailVerificationProps {
  email: string;
  onSuccess?: () => void;
  onBack?: () => void;
}

export function EmailVerification({ email, onSuccess, onBack }: EmailVerificationProps) {
  const { verifyEmail, resendVerification, isLoading, error } = useOrganization();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code) {
      setCodeError('Verification code is required');
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setCodeError('Please enter a valid 6-digit code');
      return;
    }

    const success = await verifyEmail({ email, code });
    if (success) {
      onSuccess?.();
    }
  };

  const handleResend = async () => {
    setResendSuccess(false);
    const success = await resendVerification(email);
    if (success) {
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    if (codeError) setCodeError(undefined);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Verify Your Email</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            We&apos;ve sent a verification code to{' '}
            <span className="font-medium text-foreground">{email}</span>. Please
            enter the code below to verify your email address.
          </p>

          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
              {error}
            </div>
          )}

          {resendSuccess && (
            <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-md">
              Verification code resent successfully!
            </div>
          )}

          <Input
            label="Verification Code"
            type="text"
            value={code}
            onChange={handleCodeChange}
            error={codeError}
            placeholder="Enter 6-digit code"
            maxLength={6}
            className="text-center text-2xl tracking-widest"
            disabled={isLoading}
            autoFocus
          />

          <p className="text-sm text-muted-foreground text-center">
            Didn&apos;t receive the code?{' '}
            <button
              type="button"
              onClick={handleResend}
              className="text-primary-600 hover:underline"
              disabled={isLoading}
            >
              Resend
            </button>
          </p>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" loading={isLoading}>
            Verify Email
          </Button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to signup
            </button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
