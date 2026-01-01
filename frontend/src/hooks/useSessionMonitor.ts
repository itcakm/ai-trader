'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';

interface UseSessionMonitorOptions {
  warningThresholdMs?: number; // Time before expiry to show warning (default: 5 min)
  checkIntervalMs?: number; // How often to check session (default: 30 sec)
}

interface UseSessionMonitorResult {
  isWarningVisible: boolean;
  isExpired: boolean;
  timeUntilExpiry: number | null;
  dismissWarning: () => void;
  showWarning: () => void;
}

const DEFAULT_WARNING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

export function useSessionMonitor(
  options: UseSessionMonitorOptions = {}
): UseSessionMonitorResult {
  const {
    warningThresholdMs = DEFAULT_WARNING_THRESHOLD_MS,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  } = options;

  const { session, status } = useAuth();
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [timeUntilExpiry, setTimeUntilExpiry] = useState<number | null>(null);
  const warningDismissedRef = useRef(false);

  // Calculate time until expiry
  const calculateTimeUntilExpiry = useCallback((): number | null => {
    if (!session?.expiresAt) return null;
    const now = Date.now();
    const expiresAt = session.expiresAt.getTime();
    return Math.max(0, expiresAt - now);
  }, [session?.expiresAt]);

  // Check session status
  const checkSession = useCallback(() => {
    const remaining = calculateTimeUntilExpiry();
    setTimeUntilExpiry(remaining);

    if (remaining === null) {
      setIsWarningVisible(false);
      setIsExpired(false);
      return;
    }

    if (remaining <= 0) {
      setIsExpired(true);
      setIsWarningVisible(true);
      warningDismissedRef.current = false;
      return;
    }

    if (remaining <= warningThresholdMs && !warningDismissedRef.current) {
      setIsWarningVisible(true);
    }
  }, [calculateTimeUntilExpiry, warningThresholdMs]);

  // Set up interval to check session
  useEffect(() => {
    if (status !== 'authenticated') {
      setIsWarningVisible(false);
      setIsExpired(false);
      setTimeUntilExpiry(null);
      return;
    }

    // Initial check
    checkSession();

    // Set up interval
    const interval = setInterval(checkSession, checkIntervalMs);

    return () => clearInterval(interval);
  }, [status, checkSession, checkIntervalMs]);

  // Handle session expired status
  useEffect(() => {
    if (status === 'session_expired') {
      setIsExpired(true);
      setIsWarningVisible(true);
      warningDismissedRef.current = false;
    }
  }, [status]);

  // Dismiss warning
  const dismissWarning = useCallback(() => {
    setIsWarningVisible(false);
    warningDismissedRef.current = true;
  }, []);

  // Show warning manually
  const showWarning = useCallback(() => {
    setIsWarningVisible(true);
    warningDismissedRef.current = false;
  }, []);

  return {
    isWarningVisible,
    isExpired,
    timeUntilExpiry,
    dismissWarning,
    showWarning,
  };
}

export default useSessionMonitor;
