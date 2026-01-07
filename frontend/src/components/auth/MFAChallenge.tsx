'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

/**
 * MFA Challenge Component
 * Requirements: 9.6
 * - 6-digit code input
 * - Handle verification
 */

interface MFAChallengeProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function MFAChallenge({ onSuccess, onCancel }: MFAChallengeProps) {
  const { verifyMFA, error: authError, clearError, status } = useAuth();

  // Code input state - using individual digits for better UX
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  
  // Refs for input focus management
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Clear errors when component mounts
  useEffect(() => {
    clearError();
    return () => clearError();
  }, [clearError]);

  // Handle success
  useEffect(() => {
    if (status === 'authenticated' && onSuccess) {
      onSuccess();
    }
  }, [status, onSuccess]);

  // Get full code from digits
  const getCode = useCallback(() => digits.join(''), [digits]);

  // Handle digit input
  const handleDigitChange = useCallback((index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    
    setDigits(prev => {
      const newDigits = [...prev];
      newDigits[index] = digit;
      return newDigits;
    });

    setLocalError(null);

    // Auto-focus next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  // Handle key down for backspace navigation
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [digits]);

  // Handle paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    
    if (pastedData) {
      const newDigits = pastedData.split('').concat(Array(6).fill('')).slice(0, 6);
      setDigits(newDigits);
      
      // Focus the next empty input or the last one
      const nextEmptyIndex = newDigits.findIndex(d => !d);
      const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
      inputRefs.current[focusIndex]?.focus();
    }
  }, []);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const code = getCode();
    
    if (code.length !== 6) {
      setLocalError('Please enter all 6 digits');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      await verifyMFA(code);
      // Success is handled by useEffect watching status
    } catch (err) {
      // Error is handled by AuthProvider
      console.error('MFA verification failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = useCallback(() => {
    clearError();
    if (onCancel) {
      onCancel();
    }
  }, [clearError, onCancel]);

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">AI Crypto Trading</h1>
          <p className="mt-2 text-muted-foreground">Two-factor authentication</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Enter Verification Code</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              Enter the 6-digit code from your authenticator app
            </p>

            {displayError && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm text-center"
              >
                {displayError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* 6-digit code input */}
              <div 
                className="flex justify-center gap-2 mb-6"
                role="group"
                aria-label="Verification code"
              >
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    disabled={isSubmitting}
                    className={`
                      w-12 h-14 text-center text-2xl font-mono font-bold
                      bg-background border-2 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${displayError ? 'border-red-500' : 'border-border'}
                    `}
                    aria-label={`Digit ${index + 1}`}
                  />
                ))}
              </div>

              <div className="space-y-3">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isSubmitting}
                  loadingText="Verifying..."
                  disabled={isSubmitting || getCode().length !== 6}
                >
                  Verify
                </Button>

                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleCancel}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground text-center">
              Having trouble?{' '}
              <button
                type="button"
                className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                onClick={() => {
                  // In a real app, this would show backup code input
                  alert('Use one of your backup codes to sign in');
                }}
              >
                Use a backup code
              </button>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default MFAChallenge;
