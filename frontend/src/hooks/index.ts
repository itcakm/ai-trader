export { useSessionMonitor } from './useSessionMonitor';
export { usePreferences, type UsePreferencesOptions, type UsePreferencesReturn } from './usePreferences';
export { useRetry, type UseRetryState, type UseRetryActions, type UseRetryResult } from './useRetry';

// Responsive/Mobile hooks
export {
  useBreakpoint,
  BREAKPOINTS,
  getBreakpoint,
  getDeviceType,
  isBreakpointAtLeast,
  isBreakpointAtMost,
} from './useBreakpoint';
export type { UseBreakpointReturn } from './useBreakpoint';

export {
  useSafeArea,
  detectPlatform,
  isNativeApp,
} from './useSafeArea';
export type { UseSafeAreaReturn } from './useSafeArea';

// Native bridge hooks
export { useBiometric } from './useBiometric';
export type { UseBiometricReturn } from './useBiometric';

export { usePushNotifications } from './usePushNotifications';
export type { UsePushNotificationsReturn } from './usePushNotifications';

// Offline/Connectivity hooks
export { useConnectivity } from './useConnectivity';
export type { UseConnectivityReturn } from './useConnectivity';

export { useOfflineSync } from './useOfflineSync';
export type { UseOfflineSyncOptions, UseOfflineSyncReturn } from './useOfflineSync';
