import type { SupportedLocale, NumberFormatOptions, DateFormatOptions } from '@/types/i18n';

/**
 * Format a number according to locale conventions
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: NumberFormatOptions
): string {
  const { compact, ...intlOptions } = options || {};

  if (compact) {
    return new Intl.NumberFormat(locale, {
      ...intlOptions,
      notation: 'compact',
      compactDisplay: 'short',
    }).format(value);
  }

  return new Intl.NumberFormat(locale, intlOptions).format(value);
}

/**
 * Format a percentage value
 */
export function formatPercent(
  value: number,
  locale: SupportedLocale,
  options?: Omit<NumberFormatOptions, 'style'>
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    ...options,
  }).format(value);
}

/**
 * Format a date according to locale conventions
 */
export function formatDate(
  date: Date,
  locale: SupportedLocale,
  options?: DateFormatOptions
): string {
  const { relative, ...intlOptions } = options || {};

  if (relative) {
    return formatRelativeTime(date, locale);
  }

  // Default to medium date format if no options provided
  const defaultOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    ...intlOptions,
  };

  return new Intl.DateTimeFormat(locale, defaultOptions).format(date);
}

/**
 * Format a time according to locale conventions
 */
export function formatTime(
  date: Date,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeStyle: 'short',
    ...options,
  };

  return new Intl.DateTimeFormat(locale, defaultOptions).format(date);
}

/**
 * Format a date and time according to locale conventions
 */
export function formatDateTime(
  date: Date,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  };

  return new Intl.DateTimeFormat(locale, defaultOptions).format(date);
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: Date,
  locale: SupportedLocale
): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);
  const diffWeeks = Math.round(diffDays / 7);
  const diffMonths = Math.round(diffDays / 30);
  const diffYears = Math.round(diffDays / 365);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSecs) < 60) {
    return rtf.format(diffSecs, 'second');
  } else if (Math.abs(diffMins) < 60) {
    return rtf.format(diffMins, 'minute');
  } else if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  } else if (Math.abs(diffDays) < 7) {
    return rtf.format(diffDays, 'day');
  } else if (Math.abs(diffWeeks) < 4) {
    return rtf.format(diffWeeks, 'week');
  } else if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, 'month');
  } else {
    return rtf.format(diffYears, 'year');
  }
}

/**
 * Format currency according to locale conventions
 */
export function formatCurrency(
  value: number,
  currency: string,
  locale: SupportedLocale,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...options,
  }).format(value);
}

/**
 * Format a crypto amount with appropriate precision
 */
export function formatCryptoAmount(
  value: number,
  locale: SupportedLocale,
  options?: {
    symbol?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const { symbol, minimumFractionDigits = 2, maximumFractionDigits = 8 } = options || {};

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);

  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Format a large number with abbreviation (K, M, B, T)
 */
export function formatCompactNumber(
  value: number,
  locale: SupportedLocale
): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

/**
 * Format a file size in bytes to human-readable format
 */
export function formatFileSize(
  bytes: number,
  locale: SupportedLocale
): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 2,
  }).format(size);

  return `${formatted} ${units[unitIndex]}`;
}

/**
 * Format a duration in milliseconds to human-readable format
 */
export function formatDuration(
  ms: number,
  locale: SupportedLocale,
  options?: { style?: 'long' | 'short' | 'narrow' }
): string {
  const style = options?.style || 'long';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit: 'day', unitDisplay: style }).format(days));
  }
  if (hours % 24 > 0) {
    parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: style }).format(hours % 24));
  }
  if (minutes % 60 > 0) {
    parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: style }).format(minutes % 60));
  }
  if (seconds % 60 > 0 && days === 0) {
    parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: style }).format(seconds % 60));
  }

  if (parts.length === 0) {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: style }).format(0);
  }

  // Use ListFormat for proper locale-aware joining
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts);
}

/**
 * Get the decimal separator for a locale
 */
export function getDecimalSeparator(locale: SupportedLocale): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  const decimal = parts.find(part => part.type === 'decimal');
  return decimal?.value || '.';
}

/**
 * Get the thousands separator for a locale
 */
export function getThousandsSeparator(locale: SupportedLocale): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1000);
  const group = parts.find(part => part.type === 'group');
  return group?.value || ',';
}

/**
 * Parse a locale-formatted number string back to a number
 */
export function parseLocalizedNumber(
  value: string,
  locale: SupportedLocale
): number | null {
  const decimalSeparator = getDecimalSeparator(locale);
  const thousandsSeparator = getThousandsSeparator(locale);

  // Remove thousands separators and replace decimal separator with '.'
  const normalized = value
    .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
    .replace(decimalSeparator, '.');

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}
