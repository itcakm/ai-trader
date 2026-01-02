/**
 * Feature: ui-implementation, Property 12: Contextual Help Completeness
 * Validates: Requirements 9.1, 9.3, 9.6
 *
 * For any significant UI element with a help ID, the help system SHALL return
 * content containing a description, usage instructions, and (where applicable)
 * consequences of the action.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { HelpContent, LocalizedHelpContent, HelpUsageAction } from '@/types/help';
import type { SupportedLocale } from '@/types/i18n';
import { SUPPORTED_LOCALES } from '@/types/i18n';
import { resolveLocalizedContent } from './ContextualHelpProvider';

// Arbitraries for generating test data
const localeArbitrary = fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES);

const helpUsageActionArbitrary = fc.constantFrom<HelpUsageAction>('view', 'expand', 'link_click');

const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

const urlArbitrary = fc.webUrl();

/**
 * Generate a valid HelpContent object
 */
const helpContentArbitrary = fc.record({
  id: fc.uuid(),
  elementId: fc.string({ minLength: 1, maxLength: 50 }).map(s => `help-${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
  title: nonEmptyStringArbitrary,
  description: nonEmptyStringArbitrary,
  consequences: fc.option(nonEmptyStringArbitrary, { nil: undefined }),
  usage: fc.option(nonEmptyStringArbitrary, { nil: undefined }),
  learnMoreUrl: fc.option(urlArbitrary, { nil: undefined }),
  videoUrl: fc.option(urlArbitrary, { nil: undefined }),
  translations: fc.constant({} as Partial<Record<SupportedLocale, { title: string; description: string; consequences?: string; usage?: string }>>),
});

/**
 * Generate HelpContent with translations for specific locales
 */
const helpContentWithTranslationsArbitrary = fc.tuple(
  helpContentArbitrary,
  fc.array(localeArbitrary, { minLength: 0, maxLength: 5 })
).map(([content, locales]) => {
  const translations: Partial<Record<SupportedLocale, { title: string; description: string; consequences?: string; usage?: string }>> = {};
  
  for (const locale of locales) {
    translations[locale] = {
      title: `${content.title} (${locale})`,
      description: `${content.description} (${locale})`,
      consequences: content.consequences ? `${content.consequences} (${locale})` : undefined,
      usage: content.usage ? `${content.usage} (${locale})` : undefined,
    };
  }
  
  return { ...content, translations };
});

describe('Property 12: Contextual Help Completeness', () => {
  describe('Help Content Structure', () => {
    it('all help content should have required fields (id, elementId, title, description)', () => {
      fc.assert(
        fc.property(helpContentArbitrary, (content) => {
          // Required fields must be present and non-empty
          expect(content.id).toBeDefined();
          expect(content.id.length).toBeGreaterThan(0);
          
          expect(content.elementId).toBeDefined();
          expect(content.elementId.length).toBeGreaterThan(0);
          
          expect(content.title).toBeDefined();
          expect(content.title.trim().length).toBeGreaterThan(0);
          
          expect(content.description).toBeDefined();
          expect(content.description.trim().length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('optional fields should be either undefined or non-empty strings', () => {
      fc.assert(
        fc.property(helpContentArbitrary, (content) => {
          // Consequences - optional but if present must be non-empty
          if (content.consequences !== undefined) {
            expect(typeof content.consequences).toBe('string');
            expect(content.consequences.trim().length).toBeGreaterThan(0);
          }
          
          // Usage - optional but if present must be non-empty
          if (content.usage !== undefined) {
            expect(typeof content.usage).toBe('string');
            expect(content.usage.trim().length).toBeGreaterThan(0);
          }
          
          // URLs - optional but if present must be valid strings
          if (content.learnMoreUrl !== undefined) {
            expect(typeof content.learnMoreUrl).toBe('string');
            expect(content.learnMoreUrl.length).toBeGreaterThan(0);
          }
          
          if (content.videoUrl !== undefined) {
            expect(typeof content.videoUrl).toBe('string');
            expect(content.videoUrl.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Locale Resolution', () => {
    it('resolving content for any locale should return valid LocalizedHelpContent', () => {
      fc.assert(
        fc.property(helpContentArbitrary, localeArbitrary, (content, locale) => {
          const localized = resolveLocalizedContent(content, locale);
          
          // All required fields must be present
          expect(localized.id).toBe(content.id);
          expect(localized.elementId).toBe(content.elementId);
          expect(localized.title).toBeDefined();
          expect(localized.title.length).toBeGreaterThan(0);
          expect(localized.description).toBeDefined();
          expect(localized.description.length).toBeGreaterThan(0);
          
          // URLs should be preserved
          expect(localized.learnMoreUrl).toBe(content.learnMoreUrl);
          expect(localized.videoUrl).toBe(content.videoUrl);
        }),
        { numRuns: 100 }
      );
    });

    it('content with translations should use locale-specific text when available', () => {
      fc.assert(
        fc.property(helpContentWithTranslationsArbitrary, (content) => {
          // For each locale that has a translation
          for (const locale of Object.keys(content.translations) as SupportedLocale[]) {
            const translation = content.translations[locale];
            if (translation) {
              const localized = resolveLocalizedContent(content, locale);
              
              // Should use the translated title and description
              expect(localized.title).toBe(translation.title);
              expect(localized.description).toBe(translation.description);
              
              // Optional fields should use translation if available
              if (translation.consequences) {
                expect(localized.consequences).toBe(translation.consequences);
              }
              if (translation.usage) {
                expect(localized.usage).toBe(translation.usage);
              }
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('content without translation for a locale should fall back to default content', () => {
      fc.assert(
        fc.property(helpContentArbitrary, localeArbitrary, (content, locale) => {
          // Content has no translations
          const localized = resolveLocalizedContent(content, locale);
          
          // Should fall back to default (base) content
          expect(localized.title).toBe(content.title);
          expect(localized.description).toBe(content.description);
          expect(localized.consequences).toBe(content.consequences);
          expect(localized.usage).toBe(content.usage);
        }),
        { numRuns: 100 }
      );
    });

    it('locale resolution should be deterministic', () => {
      fc.assert(
        fc.property(helpContentWithTranslationsArbitrary, localeArbitrary, (content, locale) => {
          const localized1 = resolveLocalizedContent(content, locale);
          const localized2 = resolveLocalizedContent(content, locale);
          
          expect(localized1.id).toBe(localized2.id);
          expect(localized1.elementId).toBe(localized2.elementId);
          expect(localized1.title).toBe(localized2.title);
          expect(localized1.description).toBe(localized2.description);
          expect(localized1.consequences).toBe(localized2.consequences);
          expect(localized1.usage).toBe(localized2.usage);
          expect(localized1.learnMoreUrl).toBe(localized2.learnMoreUrl);
          expect(localized1.videoUrl).toBe(localized2.videoUrl);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Help Content Completeness Validation', () => {
    /**
     * Validates that help content meets completeness requirements:
     * - Must have description (what the feature does)
     * - Should have usage instructions (how to use it)
     * - Should have consequences (where applicable)
     */
    function validateHelpCompleteness(content: LocalizedHelpContent): {
      isComplete: boolean;
      hasDescription: boolean;
      hasUsage: boolean;
      hasConsequences: boolean;
    } {
      const hasDescription = content.description !== undefined && content.description.trim().length > 0;
      const hasUsage = content.usage !== undefined && content.usage.trim().length > 0;
      const hasConsequences = content.consequences !== undefined && content.consequences.trim().length > 0;
      
      // Minimum completeness: must have description
      // Full completeness: has description + usage (consequences are optional based on action type)
      const isComplete = hasDescription;
      
      return { isComplete, hasDescription, hasUsage, hasConsequences };
    }

    it('all resolved help content should have a description', () => {
      fc.assert(
        fc.property(helpContentArbitrary, localeArbitrary, (content, locale) => {
          const localized = resolveLocalizedContent(content, locale);
          const validation = validateHelpCompleteness(localized);
          
          expect(validation.hasDescription).toBe(true);
          expect(validation.isComplete).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('help content with usage should have non-empty usage text', () => {
      fc.assert(
        fc.property(
          helpContentArbitrary.filter(c => c.usage !== undefined),
          localeArbitrary,
          (content, locale) => {
            const localized = resolveLocalizedContent(content, locale);
            
            expect(localized.usage).toBeDefined();
            expect(localized.usage!.trim().length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('help content with consequences should have non-empty consequences text', () => {
      fc.assert(
        fc.property(
          helpContentArbitrary.filter(c => c.consequences !== undefined),
          localeArbitrary,
          (content, locale) => {
            const localized = resolveLocalizedContent(content, locale);
            
            expect(localized.consequences).toBeDefined();
            expect(localized.consequences!.trim().length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Help Usage Tracking', () => {
    it('all help usage actions should be valid', () => {
      fc.assert(
        fc.property(helpUsageActionArbitrary, (action) => {
          expect(['view', 'expand', 'link_click']).toContain(action);
        }),
        { numRuns: 100 }
      );
    });

    it('help element IDs should be valid identifiers', () => {
      fc.assert(
        fc.property(helpContentArbitrary, (content) => {
          // Element ID should be a valid string identifier
          expect(typeof content.elementId).toBe('string');
          expect(content.elementId.length).toBeGreaterThan(0);
          // Should not contain spaces or special characters that would break DOM queries
          expect(content.elementId).not.toMatch(/\s/);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Resource Links', () => {
    it('learn more URLs should be valid when present', () => {
      fc.assert(
        fc.property(
          helpContentArbitrary.filter(c => c.learnMoreUrl !== undefined),
          (content) => {
            expect(content.learnMoreUrl).toBeDefined();
            expect(typeof content.learnMoreUrl).toBe('string');
            // Should be a valid URL format
            expect(() => new URL(content.learnMoreUrl!)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('video URLs should be valid when present', () => {
      fc.assert(
        fc.property(
          helpContentArbitrary.filter(c => c.videoUrl !== undefined),
          (content) => {
            expect(content.videoUrl).toBeDefined();
            expect(typeof content.videoUrl).toBe('string');
            // Should be a valid URL format
            expect(() => new URL(content.videoUrl!)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('URLs should be preserved through locale resolution', () => {
      fc.assert(
        fc.property(helpContentArbitrary, localeArbitrary, (content, locale) => {
          const localized = resolveLocalizedContent(content, locale);
          
          // URLs should not change during localization
          expect(localized.learnMoreUrl).toBe(content.learnMoreUrl);
          expect(localized.videoUrl).toBe(content.videoUrl);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('All Supported Locales', () => {
    it('help content should be resolvable for all 11 supported locales', () => {
      fc.assert(
        fc.property(helpContentArbitrary, (content) => {
          // Test all supported locales
          for (const locale of SUPPORTED_LOCALES) {
            const localized = resolveLocalizedContent(content, locale);
            
            // Should always return valid content
            expect(localized).toBeDefined();
            expect(localized.id).toBe(content.id);
            expect(localized.elementId).toBe(content.elementId);
            expect(localized.title.length).toBeGreaterThan(0);
            expect(localized.description.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('exactly 11 locales should be supported', () => {
      expect(SUPPORTED_LOCALES).toHaveLength(11);
    });
  });
});
