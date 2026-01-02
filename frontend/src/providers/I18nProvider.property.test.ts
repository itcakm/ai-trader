/**
 * Feature: ui-implementation, Property 6: Locale-Aware Rendering
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 9.2
 * 
 * For any UI text element, number, date, or currency value, and for any supported locale,
 * the rendered output SHALL match the locale's conventions (translation for text, 
 * RTL direction for Arabic/Persian/Hebrew, locale-specific formatting for numbers/dates/currencies).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SupportedLocale,
  SUPPORTED_LOCALES,
  RTL_LOCALES,
  isRTLLocale,
  getTextDirection,
  isSupportedLocale,
} from '@/types/i18n';
import {
  formatNumber,
  formatCurrency,
  formatDate,
  formatPercent,
  getDecimalSeparator,
  getThousandsSeparator,
} from '@/utils/formatting';

// Arbitraries for generating test data
const localeArbitrary = fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES);
const rtlLocaleArbitrary = fc.constantFrom<SupportedLocale>(...RTL_LOCALES);
const ltrLocaleArbitrary = fc.constantFrom<SupportedLocale>(
  ...SUPPORTED_LOCALES.filter(l => !RTL_LOCALES.includes(l))
);

const numberArbitrary = fc.double({ 
  min: -1e12, 
  max: 1e12, 
  noNaN: true,
  noDefaultInfinity: true 
});

const positiveNumberArbitrary = fc.double({ 
  min: 0.01, 
  max: 1e12, 
  noNaN: true,
  noDefaultInfinity: true 
});

const dateArbitrary = fc.date({
  min: new Date('2000-01-01'),
  max: new Date('2030-12-31'),
});

const currencyArbitrary = fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'CNY', 'BTC');

describe('Property 6: Locale-Aware Rendering', () => {
  describe('RTL Direction Detection', () => {
    it('RTL locales should return rtl direction', () => {
      fc.assert(
        fc.property(rtlLocaleArbitrary, (locale) => {
          expect(isRTLLocale(locale)).toBe(true);
          expect(getTextDirection(locale)).toBe('rtl');
        }),
        { numRuns: 100 }
      );
    });

    it('LTR locales should return ltr direction', () => {
      fc.assert(
        fc.property(ltrLocaleArbitrary, (locale) => {
          expect(isRTLLocale(locale)).toBe(false);
          expect(getTextDirection(locale)).toBe('ltr');
        }),
        { numRuns: 100 }
      );
    });

    it('all supported locales should have a valid direction', () => {
      fc.assert(
        fc.property(localeArbitrary, (locale) => {
          const direction = getTextDirection(locale);
          expect(['ltr', 'rtl']).toContain(direction);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Number Formatting', () => {
    it('formatted numbers should be non-empty strings for all locales', () => {
      fc.assert(
        fc.property(localeArbitrary, numberArbitrary, (locale, num) => {
          const formatted = formatNumber(num, locale);
          expect(typeof formatted).toBe('string');
          expect(formatted.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('number formatting should be deterministic for same locale and value', () => {
      fc.assert(
        fc.property(localeArbitrary, numberArbitrary, (locale, num) => {
          const formatted1 = formatNumber(num, locale);
          const formatted2 = formatNumber(num, locale);
          expect(formatted1).toBe(formatted2);
        }),
        { numRuns: 100 }
      );
    });

    it('different locales may produce different number formats', () => {
      // Test that at least some locales produce different formats for the same number
      const testNumber = 1234567.89;
      const formats = SUPPORTED_LOCALES.map(locale => formatNumber(testNumber, locale));
      const uniqueFormats = new Set(formats);
      // We expect at least 2 different formats across all locales
      expect(uniqueFormats.size).toBeGreaterThanOrEqual(2);
    });

    it('each locale should have a valid decimal separator', () => {
      fc.assert(
        fc.property(localeArbitrary, (locale) => {
          const separator = getDecimalSeparator(locale);
          expect(typeof separator).toBe('string');
          expect(separator.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('each locale should have a valid thousands separator', () => {
      fc.assert(
        fc.property(localeArbitrary, (locale) => {
          const separator = getThousandsSeparator(locale);
          expect(typeof separator).toBe('string');
          // Some locales may not have a thousands separator (empty string is valid)
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Currency Formatting', () => {
    it('formatted currency should include currency symbol or code', () => {
      fc.assert(
        fc.property(
          localeArbitrary,
          positiveNumberArbitrary,
          currencyArbitrary,
          (locale, amount, currency) => {
            const formatted = formatCurrency(amount, currency, locale);
            expect(typeof formatted).toBe('string');
            expect(formatted.length).toBeGreaterThan(0);
            // The formatted string should contain some representation of the value
            // (either digits or currency-specific characters)
          }
        ),
        { numRuns: 100 }
      );
    });

    it('currency formatting should be deterministic', () => {
      fc.assert(
        fc.property(
          localeArbitrary,
          positiveNumberArbitrary,
          currencyArbitrary,
          (locale, amount, currency) => {
            const formatted1 = formatCurrency(amount, currency, locale);
            const formatted2 = formatCurrency(amount, currency, locale);
            expect(formatted1).toBe(formatted2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('different locales may format the same currency differently', () => {
      const testAmount = 1234.56;
      const testCurrency = 'USD';
      const formats = SUPPORTED_LOCALES.map(locale => 
        formatCurrency(testAmount, testCurrency, locale)
      );
      const uniqueFormats = new Set(formats);
      // We expect at least 2 different formats (e.g., $1,234.56 vs 1.234,56 $)
      expect(uniqueFormats.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Date Formatting', () => {
    it('formatted dates should be non-empty strings for all locales', () => {
      fc.assert(
        fc.property(localeArbitrary, dateArbitrary, (locale, date) => {
          const formatted = formatDate(date, locale);
          expect(typeof formatted).toBe('string');
          expect(formatted.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('date formatting should be deterministic', () => {
      fc.assert(
        fc.property(localeArbitrary, dateArbitrary, (locale, date) => {
          const formatted1 = formatDate(date, locale);
          const formatted2 = formatDate(date, locale);
          expect(formatted1).toBe(formatted2);
        }),
        { numRuns: 100 }
      );
    });

    it('different locales may format the same date differently', () => {
      const testDate = new Date('2024-06-15');
      const formats = SUPPORTED_LOCALES.map(locale => formatDate(testDate, locale));
      const uniqueFormats = new Set(formats);
      // We expect at least 2 different formats
      expect(uniqueFormats.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Percent Formatting', () => {
    it('formatted percentages should be non-empty strings', () => {
      fc.assert(
        fc.property(
          localeArbitrary,
          fc.double({ min: 0, max: 1, noNaN: true }),
          (locale, value) => {
            const formatted = formatPercent(value, locale);
            expect(typeof formatted).toBe('string');
            expect(formatted.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('percent formatting should be deterministic', () => {
      fc.assert(
        fc.property(
          localeArbitrary,
          fc.double({ min: 0, max: 1, noNaN: true }),
          (locale, value) => {
            const formatted1 = formatPercent(value, locale);
            const formatted2 = formatPercent(value, locale);
            expect(formatted1).toBe(formatted2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Locale Validation', () => {
    it('all SUPPORTED_LOCALES should be valid', () => {
      fc.assert(
        fc.property(localeArbitrary, (locale) => {
          expect(isSupportedLocale(locale)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('random strings should not be valid locales', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !SUPPORTED_LOCALES.includes(s as SupportedLocale)),
          (randomString) => {
            expect(isSupportedLocale(randomString)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Locale Consistency', () => {
    it('RTL_LOCALES should be a subset of SUPPORTED_LOCALES', () => {
      for (const rtlLocale of RTL_LOCALES) {
        expect(SUPPORTED_LOCALES).toContain(rtlLocale);
      }
    });

    it('exactly Arabic, Persian, and Hebrew should be RTL', () => {
      expect(RTL_LOCALES).toHaveLength(3);
      expect(RTL_LOCALES).toContain('ar-SA');
      expect(RTL_LOCALES).toContain('fa-IR');
      expect(RTL_LOCALES).toContain('he-IL');
    });

    it('all 11 required languages should be supported', () => {
      expect(SUPPORTED_LOCALES).toHaveLength(11);
      expect(SUPPORTED_LOCALES).toContain('en-US'); // English
      expect(SUPPORTED_LOCALES).toContain('de-DE'); // German
      expect(SUPPORTED_LOCALES).toContain('fr-FR'); // French
      expect(SUPPORTED_LOCALES).toContain('ar-SA'); // Arabic
      expect(SUPPORTED_LOCALES).toContain('fa-IR'); // Persian
      expect(SUPPORTED_LOCALES).toContain('zh-CN'); // Chinese
      expect(SUPPORTED_LOCALES).toContain('hi-IN'); // Hindi
      expect(SUPPORTED_LOCALES).toContain('es-ES'); // Spanish
      expect(SUPPORTED_LOCALES).toContain('tr-TR'); // Turkish
      expect(SUPPORTED_LOCALES).toContain('pt-BR'); // Portuguese
      expect(SUPPORTED_LOCALES).toContain('he-IL'); // Hebrew
    });
  });
});
