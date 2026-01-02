/**
 * Safe Area Insets Hook
 * Requirements: 14.4
 * 
 * Handles safe area insets for iOS/Android devices to prevent UI overlap
 * with hardware notches, home indicators, and status bars.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import type { SafeAreaInsets, Platform } from '@/types/mobile';

// Default safe area insets (no insets)
const DEFAULT_INSETS: SafeAreaInsets = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';
  
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Check for native app WebView
  const win = window as Window & {
    webkit?: { messageHandlers?: unknown };
    AndroidBridge?: unknown;
    ReactNativeWebView?: unknown;
    NativeBridge?: { getSafeAreaInsets?: () => SafeAreaInsets };
  };
  
  if (win.webkit?.messageHandlers) {
    return 'ios';
  }
  
  if (win.AndroidBridge) {
    return 'android';
  }
  
  // Check user agent for mobile browsers
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios';
  }
  
  if (/android/.test(userAgent)) {
    return 'android';
  }
  
  return 'web';
}

/**
 * Check if running in a native app WebView
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  
  const win = window as Window & {
    webkit?: { messageHandlers?: unknown };
    AndroidBridge?: unknown;
    ReactNativeWebView?: unknown;
  };
  
  return !!(
    win.webkit?.messageHandlers ||
    win.AndroidBridge ||
    win.ReactNativeWebView
  );
}

/**
 * Get safe area insets from CSS environment variables
 */
function getSafeAreaInsetsFromCSS(): SafeAreaInsets {
  if (typeof window === 'undefined') return DEFAULT_INSETS;
  
  const computedStyle = getComputedStyle(document.documentElement);
  
  const parseInset = (value: string): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };
  
  return {
    top: parseInset(computedStyle.getPropertyValue('--sat') || 
                   computedStyle.getPropertyValue('env(safe-area-inset-top)')),
    bottom: parseInset(computedStyle.getPropertyValue('--sab') || 
                      computedStyle.getPropertyValue('env(safe-area-inset-bottom)')),
    left: parseInset(computedStyle.getPropertyValue('--sal') || 
                    computedStyle.getPropertyValue('env(safe-area-inset-left)')),
    right: parseInset(computedStyle.getPropertyValue('--sar') || 
                     computedStyle.getPropertyValue('env(safe-area-inset-right)')),
  };
}

/**
 * Get safe area insets from native bridge if available
 */
function getSafeAreaInsetsFromNative(): SafeAreaInsets | null {
  if (typeof window === 'undefined') return null;
  
  const win = window as Window & {
    NativeBridge?: { getSafeAreaInsets?: () => SafeAreaInsets };
  };
  
  if (win.NativeBridge?.getSafeAreaInsets) {
    try {
      return win.NativeBridge.getSafeAreaInsets();
    } catch {
      return null;
    }
  }
  
  return null;
}

export interface UseSafeAreaReturn {
  /** Safe area insets */
  insets: SafeAreaInsets;
  /** Current platform */
  platform: Platform;
  /** Whether running in a native app */
  isNative: boolean;
  /** CSS padding style that respects safe areas */
  safeAreaStyle: React.CSSProperties;
  /** Get padding value for a specific edge */
  getPadding: (edge: keyof SafeAreaInsets, additional?: number) => number;
}

/**
 * Hook for safe area insets handling
 */
export function useSafeArea(): UseSafeAreaReturn {
  const [insets, setInsets] = useState<SafeAreaInsets>(DEFAULT_INSETS);
  const [platform, setPlatform] = useState<Platform>('web');
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    // Detect platform
    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);
    setIsNative(isNativeApp());

    // Get initial insets
    const updateInsets = () => {
      // Try native bridge first
      const nativeInsets = getSafeAreaInsetsFromNative();
      if (nativeInsets) {
        setInsets(nativeInsets);
        return;
      }

      // Fall back to CSS environment variables
      const cssInsets = getSafeAreaInsetsFromCSS();
      setInsets(cssInsets);
    };

    updateInsets();

    // Listen for orientation changes which may affect safe areas
    const handleOrientationChange = () => {
      // Small delay to allow CSS to update
      setTimeout(updateInsets, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  const safeAreaStyle = useMemo<React.CSSProperties>(
    () => ({
      paddingTop: `max(${insets.top}px, env(safe-area-inset-top, 0px))`,
      paddingBottom: `max(${insets.bottom}px, env(safe-area-inset-bottom, 0px))`,
      paddingLeft: `max(${insets.left}px, env(safe-area-inset-left, 0px))`,
      paddingRight: `max(${insets.right}px, env(safe-area-inset-right, 0px))`,
    }),
    [insets]
  );

  const getPadding = useMemo(
    () => (edge: keyof SafeAreaInsets, additional: number = 0): number => {
      return insets[edge] + additional;
    },
    [insets]
  );

  return useMemo(
    () => ({
      insets,
      platform,
      isNative,
      safeAreaStyle,
      getPadding,
    }),
    [insets, platform, isNative, safeAreaStyle, getPadding]
  );
}

// Export for testing
export { DEFAULT_INSETS, getSafeAreaInsetsFromCSS };
