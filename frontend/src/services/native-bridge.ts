/**
 * Native Bridge Service
 * Requirements: 14.2, 14.3
 * 
 * Abstraction layer for native mobile features including biometric
 * authentication and push notifications.
 */

import type {
  NativeBridge,
  BiometricResult,
  PushNotification,
  SafeAreaInsets,
} from '@/types/mobile';

// Window type extension for native bridges
type NativeWindow = Window & {
  webkit?: {
    messageHandlers?: {
      biometric?: { postMessage: (msg: unknown) => void };
      push?: { postMessage: (msg: unknown) => void };
      safeArea?: { postMessage: (msg: unknown) => void };
    };
  };
  AndroidBridge?: {
    isBiometricAvailable: () => string;
    authenticateWithBiometric: () => string;
    requestPushPermission: () => string;
    getPushToken: () => string;
    getSafeAreaInsets: () => string;
    isOnline: () => boolean;
  };
  ReactNativeWebView?: {
    postMessage: (msg: string) => void;
  };
};

// Callback registry for async native responses
const callbackRegistry = new Map<string, (result: unknown) => void>();
let callbackId = 0;

/**
 * Generate a unique callback ID
 */
function generateCallbackId(): string {
  return `cb_${++callbackId}_${Date.now()}`;
}

/**
 * Register a callback for native response
 */
function registerCallback<T>(resolve: (value: T) => void, reject: (error: Error) => void, timeout = 30000): string {
  const id = generateCallbackId();
  
  const timeoutId = setTimeout(() => {
    callbackRegistry.delete(id);
    reject(new Error('Native bridge timeout'));
  }, timeout);
  
  callbackRegistry.set(id, (result: unknown) => {
    clearTimeout(timeoutId);
    callbackRegistry.delete(id);
    resolve(result as T);
  });
  
  return id;
}

/**
 * Handle native callback response (called from native code)
 */
export function handleNativeCallback(callbackId: string, result: unknown): void {
  const callback = callbackRegistry.get(callbackId);
  if (callback) {
    callback(result);
  }
}

// Expose to global scope for native code to call
if (typeof window !== 'undefined') {
  (window as Window & { handleNativeCallback?: typeof handleNativeCallback }).handleNativeCallback = handleNativeCallback;
}

/**
 * Check if biometric authentication is available
 */
async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  const win = window as NativeWindow;
  
  // iOS WebView
  if (win.webkit?.messageHandlers?.biometric) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<boolean>(resolve, reject);
      win.webkit!.messageHandlers!.biometric!.postMessage({ action: 'isAvailable', callbackId: cbId });
    });
  }
  
  // Android WebView
  if (win.AndroidBridge?.isBiometricAvailable) {
    try {
      const result = JSON.parse(win.AndroidBridge.isBiometricAvailable());
      return result.available === true;
    } catch {
      return false;
    }
  }
  
  // React Native WebView
  if (win.ReactNativeWebView) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<boolean>(resolve, reject);
      win.ReactNativeWebView!.postMessage(JSON.stringify({
        type: 'biometric',
        action: 'isAvailable',
        callbackId: cbId,
      }));
    });
  }
  
  // Web - check for WebAuthn support
  if (window.PublicKeyCredential) {
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }
  
  return false;
}

/**
 * Authenticate with biometric
 */
async function authenticateWithBiometric(): Promise<BiometricResult> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Not in browser environment' };
  }
  
  const win = window as NativeWindow;
  
  // iOS WebView
  if (win.webkit?.messageHandlers?.biometric) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<BiometricResult>(resolve, reject);
      win.webkit!.messageHandlers!.biometric!.postMessage({ action: 'authenticate', callbackId: cbId });
    });
  }
  
  // Android WebView
  if (win.AndroidBridge?.authenticateWithBiometric) {
    try {
      const result = JSON.parse(win.AndroidBridge.authenticateWithBiometric());
      return result as BiometricResult;
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  // React Native WebView
  if (win.ReactNativeWebView) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<BiometricResult>(resolve, reject);
      win.ReactNativeWebView!.postMessage(JSON.stringify({
        type: 'biometric',
        action: 'authenticate',
        callbackId: cbId,
      }));
    });
  }
  
  return { success: false, error: 'Biometric authentication not available' };
}

/**
 * Request push notification permission
 */
async function requestPushPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  const win = window as NativeWindow;
  
  // iOS WebView
  if (win.webkit?.messageHandlers?.push) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<boolean>(resolve, reject);
      win.webkit!.messageHandlers!.push!.postMessage({ action: 'requestPermission', callbackId: cbId });
    });
  }
  
  // Android WebView
  if (win.AndroidBridge?.requestPushPermission) {
    try {
      const result = JSON.parse(win.AndroidBridge.requestPushPermission());
      return result.granted === true;
    } catch {
      return false;
    }
  }
  
  // React Native WebView
  if (win.ReactNativeWebView) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<boolean>(resolve, reject);
      win.ReactNativeWebView!.postMessage(JSON.stringify({
        type: 'push',
        action: 'requestPermission',
        callbackId: cbId,
      }));
    });
  }
  
  // Web Push API
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
}

/**
 * Get push notification token
 */
async function getPushToken(): Promise<string> {
  if (typeof window === 'undefined') return '';
  
  const win = window as NativeWindow;
  
  // iOS WebView
  if (win.webkit?.messageHandlers?.push) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<string>(resolve, reject);
      win.webkit!.messageHandlers!.push!.postMessage({ action: 'getToken', callbackId: cbId });
    });
  }
  
  // Android WebView
  if (win.AndroidBridge?.getPushToken) {
    try {
      const result = JSON.parse(win.AndroidBridge.getPushToken());
      return result.token || '';
    } catch {
      return '';
    }
  }
  
  // React Native WebView
  if (win.ReactNativeWebView) {
    return new Promise((resolve, reject) => {
      const cbId = registerCallback<string>(resolve, reject);
      win.ReactNativeWebView!.postMessage(JSON.stringify({
        type: 'push',
        action: 'getToken',
        callbackId: cbId,
      }));
    });
  }
  
  return '';
}

// Push notification listeners
const pushListeners = new Set<(notification: PushNotification) => void>();

/**
 * Subscribe to push notifications
 */
function onPushNotification(callback: (notification: PushNotification) => void): () => void {
  pushListeners.add(callback);
  return () => pushListeners.delete(callback);
}

/**
 * Handle incoming push notification (called from native code)
 */
export function handlePushNotification(notification: PushNotification): void {
  // Ensure timestamp is a Date object
  const normalizedNotification: PushNotification = {
    ...notification,
    timestamp: new Date(notification.timestamp),
  };
  
  pushListeners.forEach(listener => {
    try {
      listener(normalizedNotification);
    } catch (error) {
      console.error('Push notification listener error:', error);
    }
  });
}

// Expose to global scope for native code to call
if (typeof window !== 'undefined') {
  (window as Window & { handlePushNotification?: typeof handlePushNotification }).handlePushNotification = handlePushNotification;
}

// Connectivity listeners
const connectivityListeners = new Set<(online: boolean) => void>();

/**
 * Check if device is online
 */
function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  
  const win = window as NativeWindow;
  
  // Android WebView
  if (win.AndroidBridge?.isOnline) {
    return win.AndroidBridge.isOnline();
  }
  
  // Default to navigator.onLine
  return navigator.onLine;
}

/**
 * Subscribe to connectivity changes
 */
function onConnectivityChange(callback: (online: boolean) => void): () => void {
  connectivityListeners.add(callback);
  
  // Set up browser event listeners if not already done
  if (typeof window !== 'undefined' && connectivityListeners.size === 1) {
    const handleOnline = () => connectivityListeners.forEach(cb => cb(true));
    const handleOffline = () => connectivityListeners.forEach(cb => cb(false));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }
  
  return () => connectivityListeners.delete(callback);
}

/**
 * Handle connectivity change from native code
 */
export function handleConnectivityChange(online: boolean): void {
  connectivityListeners.forEach(listener => {
    try {
      listener(online);
    } catch (error) {
      console.error('Connectivity listener error:', error);
    }
  });
}

// Expose to global scope for native code to call
if (typeof window !== 'undefined') {
  (window as Window & { handleConnectivityChange?: typeof handleConnectivityChange }).handleConnectivityChange = handleConnectivityChange;
}

/**
 * Get safe area insets from native
 */
function getSafeAreaInsets(): SafeAreaInsets {
  const defaultInsets: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  
  if (typeof window === 'undefined') return defaultInsets;
  
  const win = window as NativeWindow;
  
  // Android WebView
  if (win.AndroidBridge?.getSafeAreaInsets) {
    try {
      return JSON.parse(win.AndroidBridge.getSafeAreaInsets());
    } catch {
      return defaultInsets;
    }
  }
  
  return defaultInsets;
}

/**
 * Native Bridge implementation
 */
export const nativeBridge: NativeBridge = {
  isBiometricAvailable,
  authenticateWithBiometric,
  requestPushPermission,
  getPushToken,
  onPushNotification,
  isOnline,
  onConnectivityChange,
  getSafeAreaInsets,
};

export default nativeBridge;
