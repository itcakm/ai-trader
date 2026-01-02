/**
 * Supported locales for the application
 * Includes 11 languages as per requirements
 */
export type SupportedLocale =
  | 'en-US'  // English (default)
  | 'de-DE'  // German
  | 'fr-FR'  // French
  | 'ar-SA'  // Arabic
  | 'fa-IR'  // Persian
  | 'zh-CN'  // Chinese
  | 'hi-IN'  // Hindi
  | 'es-ES'  // Spanish
  | 'tr-TR'  // Turkish
  | 'pt-BR'  // Portuguese
  | 'he-IL'; // Hebrew

/**
 * RTL locales that require right-to-left layout
 */
export const RTL_LOCALES: SupportedLocale[] = ['ar-SA', 'fa-IR', 'he-IL'];

/**
 * All supported locales
 */
export const SUPPORTED_LOCALES: SupportedLocale[] = [
  'en-US', 'de-DE', 'fr-FR', 'ar-SA', 'fa-IR',
  'zh-CN', 'hi-IN', 'es-ES', 'tr-TR', 'pt-BR', 'he-IL'
];

/**
 * Locale display names for UI
 */
export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  'en-US': 'English',
  'de-DE': 'Deutsch',
  'fr-FR': 'Français',
  'ar-SA': 'العربية',
  'fa-IR': 'فارسی',
  'zh-CN': '中文',
  'hi-IN': 'हिन्दी',
  'es-ES': 'Español',
  'tr-TR': 'Türkçe',
  'pt-BR': 'Português',
  'he-IL': 'עברית'
};

/**
 * Text direction type
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * Translation namespace for lazy loading
 */
export type TranslationNamespace = 
  | 'common'
  | 'auth'
  | 'dashboard'
  | 'strategy'
  | 'risk'
  | 'exchange'
  | 'reports'
  | 'settings'
  | 'help'
  | 'errors';

/**
 * Translation dictionary value type
 */
export type TranslationValue = string | { [key: string]: TranslationValue };

/**
 * Translation dictionary structure
 */
export type TranslationDictionary = Record<string, TranslationValue>;

/**
 * Loaded translations cache
 */
export type TranslationsCache = Partial<Record<TranslationNamespace, TranslationDictionary>>;

/**
 * Number format options
 */
export interface NumberFormatOptions extends Intl.NumberFormatOptions {
  compact?: boolean;
}

/**
 * Date format options
 */
export interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  relative?: boolean;
}

/**
 * I18n context value
 */
export interface I18nContextValue {
  locale: SupportedLocale;
  direction: TextDirection;
  t: (key: string, params?: Record<string, unknown>) => string;
  formatNumber: (value: number, options?: NumberFormatOptions) => string;
  formatDate: (date: Date, options?: DateFormatOptions) => string;
  formatCurrency: (value: number, currency: string) => string;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  isLoading: boolean;
  loadNamespace: (namespace: TranslationNamespace) => Promise<void>;
}

/**
 * Check if a locale is RTL
 */
export function isRTLLocale(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Get text direction for a locale
 */
export function getTextDirection(locale: SupportedLocale): TextDirection {
  return isRTLLocale(locale) ? 'rtl' : 'ltr';
}

/**
 * Check if a string is a valid supported locale
 */
export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}
