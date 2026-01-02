/**
 * Biometric Authentication Hook
 * Requirements: 14.2
 * 
 * Provides biometric authentication functionality for mobile devices.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { nativeBridge } from '@/services/native-bridge';
import type { BiometricResult } from '@/types/mobile';

export interface UseBiometricReturn {
  /** Whether biometric authentication is available */
  isAvailable: boolean;
  /** Whether biometric check is in progress */
  isLoading: boolean;
  /** Whether authentication is in progress */
  isAuthenticating: boolean;
  /** Last authentication result */
  result: BiometricResult | null;
  /** Last error message */
  error: string | null;
  /** Authenticate with biometric */
  authenticate: () => Promise<BiometricResult>;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for biometric authentication
 */
export function useBiometric(): UseBiometricReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [result, setResult] = useState<BiometricResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check availability on mount
  useEffect(() => {
    let mounted = true;

    async function checkAvailability() {
      try {
        const available = await nativeBridge.isBiometricAvailable();
        if (mounted) {
          setIsAvailable(available);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setIsAvailable(false);
          setIsLoading(false);
          setError(err instanceof Error ? err.message : 'Failed to check biometric availability');
        }
      }
    }

    checkAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  const authenticate = useCallback(async (): Promise<BiometricResult> => {
    if (!isAvailable) {
      const errorResult: BiometricResult = {
        success: false,
        error: 'Biometric authentication not available',
      };
      setResult(errorResult);
      setError(errorResult.error || null);
      return errorResult;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const authResult = await nativeBridge.authenticateWithBiometric();
      setResult(authResult);
      
      if (!authResult.success) {
        setError(authResult.error || 'Authentication failed');
      }
      
      return authResult;
    } catch (err) {
      const errorResult: BiometricResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Authentication error',
      };
      setResult(errorResult);
      setError(errorResult.error || null);
      return errorResult;
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAvailable]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return useMemo(
    () => ({
      isAvailable,
      isLoading,
      isAuthenticating,
      result,
      error,
      authenticate,
      reset,
    }),
    [isAvailable, isLoading, isAuthenticating, result, error, authenticate, reset]
  );
}
