/**
 * Connectivity Monitoring Hook
 * Requirements: 14.5, 14.6
 * 
 * Monitors network connectivity and provides offline/online status.
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { nativeBridge } from '@/services/native-bridge';
import type { ConnectivityState } from '@/types/mobile';

export interface UseConnectivityReturn {
  /** Whether the device is online */
  isOnline: boolean;
  /** Whether the device is offline */
  isOffline: boolean;
  /** Full connectivity state */
  connectivity: ConnectivityState;
  /** Time since last connectivity change */
  lastChangeAt: Date | null;
  /** Whether connectivity was recently restored */
  wasRecentlyRestored: boolean;
  /** Manually check connectivity */
  checkConnectivity: () => void;
}

/**
 * Get connection type from Network Information API
 */
function getConnectionType(): ConnectivityState['connectionType'] {
  if (typeof navigator === 'undefined') return 'unknown';
  
  const connection = (navigator as Navigator & {
    connection?: {
      type?: string;
      effectiveType?: string;
    };
  }).connection;
  
  if (!connection) return 'unknown';
  
  const type = connection.type;
  
  if (type === 'wifi') return 'wifi';
  if (type === 'cellular') return 'cellular';
  if (type === 'ethernet') return 'ethernet';
  if (type === 'none') return 'none';
  
  return 'unknown';
}

/**
 * Get effective connection type
 */
function getEffectiveType(): ConnectivityState['effectiveType'] {
  if (typeof navigator === 'undefined') return undefined;
  
  const connection = (navigator as Navigator & {
    connection?: {
      effectiveType?: string;
    };
  }).connection;
  
  if (!connection?.effectiveType) return undefined;
  
  const effectiveType = connection.effectiveType;
  
  if (effectiveType === '2g') return '2g';
  if (effectiveType === '3g') return '3g';
  if (effectiveType === '4g') return '4g';
  if (effectiveType === 'slow-2g') return 'slow-2g';
  
  return undefined;
}

/**
 * Get current connectivity state
 */
function getConnectivityState(): ConnectivityState {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  
  return {
    isOnline,
    connectionType: isOnline ? getConnectionType() : 'none',
    effectiveType: isOnline ? getEffectiveType() : undefined,
  };
}

// Time window to consider connectivity as "recently restored" (5 seconds)
const RECENTLY_RESTORED_WINDOW = 5000;

/**
 * Hook for connectivity monitoring
 */
export function useConnectivity(): UseConnectivityReturn {
  const [connectivity, setConnectivity] = useState<ConnectivityState>(getConnectivityState);
  const [lastChangeAt, setLastChangeAt] = useState<Date | null>(null);
  const [wasRecentlyRestored, setWasRecentlyRestored] = useState(false);
  
  const recentlyRestoredTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateConnectivity = useCallback((online: boolean) => {
    const newState = getConnectivityState();
    newState.isOnline = online;
    
    if (!online) {
      newState.connectionType = 'none';
      newState.effectiveType = undefined;
    }
    
    setConnectivity(prev => {
      // Only update if changed
      if (prev.isOnline !== newState.isOnline) {
        setLastChangeAt(new Date());
        
        // Track if connectivity was recently restored
        if (newState.isOnline && !prev.isOnline) {
          setWasRecentlyRestored(true);
          
          // Clear the "recently restored" flag after the window
          if (recentlyRestoredTimeoutRef.current) {
            clearTimeout(recentlyRestoredTimeoutRef.current);
          }
          recentlyRestoredTimeoutRef.current = setTimeout(() => {
            setWasRecentlyRestored(false);
          }, RECENTLY_RESTORED_WINDOW);
        }
      }
      
      return newState;
    });
  }, []);

  useEffect(() => {
    // Initial state
    setConnectivity(getConnectivityState());

    // Browser online/offline events
    const handleOnline = () => updateConnectivity(true);
    const handleOffline = () => updateConnectivity(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Native bridge connectivity changes
    const unsubscribe = nativeBridge.onConnectivityChange(updateConnectivity);

    // Network Information API changes
    const connection = (navigator as Navigator & {
      connection?: EventTarget & {
        addEventListener: (type: string, listener: () => void) => void;
        removeEventListener: (type: string, listener: () => void) => void;
      };
    }).connection;

    const handleConnectionChange = () => {
      setConnectivity(getConnectivityState());
    };

    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
      
      if (recentlyRestoredTimeoutRef.current) {
        clearTimeout(recentlyRestoredTimeoutRef.current);
      }
    };
  }, [updateConnectivity]);

  const checkConnectivity = useCallback(() => {
    // Try to fetch a small resource to verify connectivity
    if (typeof fetch !== 'undefined') {
      fetch('/api/health', { method: 'HEAD', cache: 'no-store' })
        .then(() => updateConnectivity(true))
        .catch(() => updateConnectivity(false));
    } else {
      updateConnectivity(navigator.onLine);
    }
  }, [updateConnectivity]);

  return useMemo(
    () => ({
      isOnline: connectivity.isOnline,
      isOffline: !connectivity.isOnline,
      connectivity,
      lastChangeAt,
      wasRecentlyRestored,
      checkConnectivity,
    }),
    [connectivity, lastChangeAt, wasRecentlyRestored, checkConnectivity]
  );
}
