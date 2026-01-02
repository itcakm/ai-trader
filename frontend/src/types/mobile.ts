/**
 * Mobile and Hybrid Support Types
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

// Breakpoint definitions for responsive design
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface BreakpointConfig {
  xs: number;  // 0px - Mobile portrait
  sm: number;  // 640px - Mobile landscape
  md: number;  // 768px - Tablet
  lg: number;  // 1024px - Desktop
  xl: number;  // 1280px - Large desktop
  '2xl': number; // 1536px - Extra large
}

// Safe area insets for iOS/Android devices
export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Device type detection
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

// Platform detection
export type Platform = 'ios' | 'android' | 'web';

// Viewport information
export interface ViewportInfo {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  deviceType: DeviceType;
  isPortrait: boolean;
  isLandscape: boolean;
}

// Responsive layout context
export interface ResponsiveContextValue {
  viewport: ViewportInfo;
  safeAreaInsets: SafeAreaInsets;
  platform: Platform;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isNativeApp: boolean;
}

// Native bridge types for mobile WebView integration
export interface BiometricResult {
  success: boolean;
  error?: string;
  type?: 'face' | 'fingerprint' | 'iris';
}

export interface PushNotification {
  id: string;
  type: 'risk_alert' | 'order_update' | 'system_alert';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export interface NativeBridge {
  isBiometricAvailable(): Promise<boolean>;
  authenticateWithBiometric(): Promise<BiometricResult>;
  requestPushPermission(): Promise<boolean>;
  getPushToken(): Promise<string>;
  onPushNotification(callback: (notification: PushNotification) => void): () => void;
  isOnline(): boolean;
  onConnectivityChange(callback: (online: boolean) => void): () => void;
  getSafeAreaInsets(): SafeAreaInsets;
}

// Offline storage types
export interface SyncConflict {
  key: string;
  localValue: unknown;
  remoteValue: unknown;
  localTimestamp: Date;
  remoteTimestamp: Date;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export interface OfflineStorageEntry<T = unknown> {
  key: string;
  value: T;
  timestamp: Date;
  synced: boolean;
}

export interface OfflineStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  getAll(): Promise<OfflineStorageEntry[]>;
  getPendingSync(): Promise<OfflineStorageEntry[]>;
  markSynced(key: string): Promise<void>;
  sync(): Promise<SyncResult>;
  clear(): Promise<void>;
}

// Connectivity state
export interface ConnectivityState {
  isOnline: boolean;
  connectionType: 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none';
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
}

// Responsive component props
export interface ResponsiveProps {
  /** Show only on mobile devices */
  mobileOnly?: boolean;
  /** Show only on tablet devices */
  tabletOnly?: boolean;
  /** Show only on desktop devices */
  desktopOnly?: boolean;
  /** Hide on mobile devices */
  hideMobile?: boolean;
  /** Hide on tablet devices */
  hideTablet?: boolean;
  /** Hide on desktop devices */
  hideDesktop?: boolean;
}

// Layout variant for responsive components
export type LayoutVariant = 'stack' | 'row' | 'grid';

export interface ResponsiveLayoutProps {
  /** Layout on mobile */
  mobile?: LayoutVariant;
  /** Layout on tablet */
  tablet?: LayoutVariant;
  /** Layout on desktop */
  desktop?: LayoutVariant;
  /** Gap between items */
  gap?: number | string;
  /** Padding that respects safe areas */
  safeAreaPadding?: boolean;
}
