'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

interface SessionExpiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeUntilExpiry?: number; // milliseconds
}

export function SessionExpiryModal({
  isOpen,
  onClose,
  timeUntilExpiry,
}: SessionExpiryModalProps) {
  const { session, refreshSession, login, status, error, clearError } = useAuth();
  const [mode, setMode] = useState<'warning' | 'reauth'>('warning');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('warning');
      setPassword('');
      clearError();
      if (timeUntilExpiry) {
        setCountdown(Math.ceil(timeUntilExpiry / 1000));
      }
    }
  }, [isOpen, timeUntilExpiry, clearError]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          setMode('reauth');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, countdown]);


  // Handle extend session
  const handleExtendSession = useCallback(async () => {
    setIsLoading(true);
    try {
      await refreshSession();
      onClose();
    } catch {
      setMode('reauth');
    } finally {
      setIsLoading(false);
    }
  }, [refreshSession, onClose]);

  // Handle re-authentication
  const handleReauth = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!session?.email || !password) return;

      setIsLoading(true);
      try {
        await login({ email: session.email, password });
        onClose();
      } finally {
        setIsLoading(false);
      }
    },
    [session?.email, password, login, onClose]
  );

  // Format countdown
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md p-6 mx-4">
        {mode === 'warning' ? (
          <>
            <h2 className="text-xl font-semibold mb-4">Session Expiring Soon</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Your session will expire in{' '}
              <span className="font-mono font-bold text-amber-600">
                {countdown !== null ? formatCountdown(countdown) : '5:00'}
              </span>
              . Would you like to extend your session?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
              Any unsaved work will be preserved.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Dismiss
              </Button>
              <Button onClick={handleExtendSession} disabled={isLoading}>
                {isLoading ? 'Extending...' : 'Extend Session'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-4">Session Expired</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Your session has expired. Please re-authenticate to continue.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
              Your work has been preserved and will be available after you log in.
            </p>
            <form onSubmit={handleReauth}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={session?.email || ''}
                  disabled
                  className="bg-gray-100 dark:bg-gray-800"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-red-500 text-sm mb-4">{error}</p>
              )}
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    // Redirect to login page
                    if (typeof window !== 'undefined') {
                      window.location.href = '/login';
                    }
                  }}
                  disabled={isLoading}
                >
                  Go to Login
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !password || status === 'loading'}
                >
                  {isLoading ? 'Authenticating...' : 'Re-authenticate'}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

export default SessionExpiryModal;
