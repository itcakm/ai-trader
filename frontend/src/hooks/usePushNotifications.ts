/**
 * Push Notifications Hook
 * Requirements: 14.3
 * 
 * Provides push notification functionality for mobile devices.
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { nativeBridge } from '@/services/native-bridge';
import type { PushNotification } from '@/types/mobile';

export interface UsePushNotificationsReturn {
  /** Whether push notifications are enabled */
  isEnabled: boolean;
  /** Whether permission request is in progress */
  isRequesting: boolean;
  /** Push notification token */
  token: string | null;
  /** Last received notification */
  lastNotification: PushNotification | null;
  /** All received notifications (limited to last 50) */
  notifications: PushNotification[];
  /** Error message */
  error: string | null;
  /** Request push notification permission */
  requestPermission: () => Promise<boolean>;
  /** Clear notifications */
  clearNotifications: () => void;
  /** Mark notification as read */
  markAsRead: (notificationId: string) => void;
}

const MAX_NOTIFICATIONS = 50;

/**
 * Hook for push notifications
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Subscribe to push notifications
  useEffect(() => {
    const handleNotification = (notification: PushNotification) => {
      setNotifications(prev => {
        const updated = [notification, ...prev];
        // Keep only the last MAX_NOTIFICATIONS
        return updated.slice(0, MAX_NOTIFICATIONS);
      });
    };

    unsubscribeRef.current = nativeBridge.onPushNotification(handleNotification);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Check if already enabled and get token
  useEffect(() => {
    async function checkStatus() {
      try {
        const pushToken = await nativeBridge.getPushToken();
        if (pushToken) {
          setToken(pushToken);
          setIsEnabled(true);
        }
      } catch {
        // Token not available, notifications not enabled
      }
    }

    checkStatus();
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setIsRequesting(true);
    setError(null);

    try {
      const granted = await nativeBridge.requestPushPermission();
      
      if (granted) {
        const pushToken = await nativeBridge.getPushToken();
        setToken(pushToken);
        setIsEnabled(true);
      } else {
        setError('Push notification permission denied');
      }
      
      return granted;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request permission';
      setError(errorMessage);
      return false;
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId
          ? { ...n, data: { ...n.data, read: true } }
          : n
      )
    );
  }, []);

  const lastNotification = notifications[0] || null;

  return useMemo(
    () => ({
      isEnabled,
      isRequesting,
      token,
      lastNotification,
      notifications,
      error,
      requestPermission,
      clearNotifications,
      markAsRead,
    }),
    [
      isEnabled,
      isRequesting,
      token,
      lastNotification,
      notifications,
      error,
      requestPermission,
      clearNotifications,
      markAsRead,
    ]
  );
}
