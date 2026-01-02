'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type {
  SupportedLocale,
  TextDirection,
  TranslationNamespace,
  TranslationDictionary,
  TranslationsCache,
  I18nContextValue,
  NumberFormatOptions,
  DateFormatOptions,
} from '@/types/i18n';
import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  getTextDirection,
} from '@/types/i18n';

const LOCALE_STORAGE_KEY = 'crypto-trading-locale';
const DEFAULT_LOCALE: SupportedLocale = 'en-US';

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/**
 * Detect browser language and map to supported locale
 */
function detectBrowserLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
  
  // Try exact match first
  if (isSupportedLocale(browserLang)) {
    return browserLang;
  }

  // Try language code only (e.g., 'en' from 'en-GB')
  const langCode = browserLang.split('-')[0];
  const match = SUPPORTED_LOCALES.find(locale => locale.startsWith(langCode + '-'));
  
  return match || DEFAULT_LOCALE;
}

/**
 * Get stored locale from localStorage
 */
function getStoredLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored && isSupportedLocale(stored) ? stored : null;
}

/**
 * Load translations for a specific locale and namespace
 */
async function loadTranslations(
  locale: SupportedLocale,
  namespace: TranslationNamespace
): Promise<TranslationDictionary> {
  try {
    // Dynamic import for lazy loading
    const translations = await import(`@/translations/${locale}/${namespace}.json`);
    return translations.default || translations;
  } catch {
    // Fallback to English if translation not found
    if (locale !== DEFAULT_LOCALE) {
      try {
        const fallback = await import(`@/translations/${DEFAULT_LOCALE}/${namespace}.json`);
        return fallback.default || fallback;
      } catch {
        return {};
      }
    }
    return {};
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: TranslationDictionary, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate parameters into translation string
 */
function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

export interface I18nProviderProps {
  children: React.ReactNode;
  initialLocale?: SupportedLocale;
  defaultNamespaces?: TranslationNamespace[];
}

export function I18nProvider({
  children,
  initialLocale,
  defaultNamespaces = ['common'],
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale || DEFAULT_LOCALE);
  const [translations, setTranslations] = useState<TranslationsCache>({});
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const direction: TextDirection = useMemo(() => getTextDirection(locale), [locale]);

  // Initialize locale from storage or browser detection
  useEffect(() => {
    const storedLocale = getStoredLocale();
    const detectedLocale = storedLocale || detectBrowserLocale();
    setLocaleState(detectedLocale);
    setMounted(true);
  }, []);

  // Load default namespaces when locale changes
  useEffect(() => {
    if (!mounted) return;

    const loadDefaultNamespaces = async () => {
      setIsLoading(true);
      const loadedTranslations: TranslationsCache = {};

      await Promise.all(
        defaultNamespaces.map(async (namespace) => {
          loadedTranslations[namespace] = await loadTranslations(locale, namespace);
        })
      );

      setTranslations(loadedTranslations);
      setIsLoading(false);
    };

    loadDefaultNamespaces();
  }, [locale, mounted, defaultNamespaces]);

  // Update document direction when locale changes
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dir = direction;
    document.documentElement.lang = locale;
  }, [direction, locale, mounted]);

  /**
   * Load a specific translation namespace
   */
  const loadNamespace = useCallback(
    async (namespace: TranslationNamespace) => {
      if (translations[namespace]) return;

      const namespaceTranslations = await loadTranslations(locale, namespace);
      setTranslations((prev) => ({
        ...prev,
        [namespace]: namespaceTranslations,
      }));
    },
    [locale, translations]
  );

  /**
   * Set locale and persist to storage
   */
  const setLocale = useCallback(async (newLocale: SupportedLocale) => {
    if (!isSupportedLocale(newLocale)) {
      console.warn(`Unsupported locale: ${newLocale}`);
      return;
    }

    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    setLocaleState(newLocale);
  }, []);

  /**
   * Translate a key with optional parameters
   */
  const t = useCallback(
    (key: string, params?: Record<string, unknown>): string => {
      // Try to find translation in all loaded namespaces
      for (const namespace of Object.keys(translations) as TranslationNamespace[]) {
        const dict = translations[namespace];
        if (dict) {
          const value = getNestedValue(dict, key);
          if (value) {
            return params ? interpolate(value, params) : value;
          }
        }
      }

      // Return key if translation not found
      return key;
    },
    [translations]
  );

  /**
   * Format a number according to locale
   */
  const formatNumber = useCallback(
    (value: number, options?: NumberFormatOptions): string => {
      const { compact, ...intlOptions } = options || {};

      if (compact) {
        return new Intl.NumberFormat(locale, {
          ...intlOptions,
          notation: 'compact',
          compactDisplay: 'short',
        }).format(value);
      }

      return new Intl.NumberFormat(locale, intlOptions).format(value);
    },
    [locale]
  );

  /**
   * Format a date according to locale
   */
  const formatDate = useCallback(
    (date: Date, options?: DateFormatOptions): string => {
      const { relative, ...intlOptions } = options || {};

      if (relative) {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) {
          return t('time.now');
        } else if (diffMins < 60) {
          return t(diffMins === 1 ? 'time.minutesAgo' : 'time.minutesAgo_plural', { count: diffMins });
        } else if (diffHours < 24) {
          return t(diffHours === 1 ? 'time.hoursAgo' : 'time.hoursAgo_plural', { count: diffHours });
        } else if (diffDays < 7) {
          return t(diffDays === 1 ? 'time.daysAgo' : 'time.daysAgo_plural', { count: diffDays });
        }
      }

      return new Intl.DateTimeFormat(locale, intlOptions).format(date);
    },
    [locale, t]
  );

  /**
   * Format currency according to locale
   */
  const formatCurrency = useCallback(
    (value: number, currency: string): string => {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
      }).format(value);
    },
    [locale]
  );

  const contextValue: I18nContextValue = useMemo(
    () => ({
      locale,
      direction,
      t,
      formatNumber,
      formatDate,
      formatCurrency,
      setLocale,
      isLoading,
      loadNamespace,
    }),
    [locale, direction, t, formatNumber, formatDate, formatCurrency, setLocale, isLoading, loadNamespace]
  );

  if (!mounted) {
    return <>{children}</>;
  }

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

/**
 * Hook to access i18n context
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/**
 * Hook to get translation function only
 */
export function useTranslation() {
  const { t, isLoading } = useI18n();
  return { t, isLoading };
}

// Export for testing
export {
  LOCALE_STORAGE_KEY,
  DEFAULT_LOCALE,
  detectBrowserLocale,
  getStoredLocale,
  loadTranslations,
  getNestedValue,
  interpolate,
};
