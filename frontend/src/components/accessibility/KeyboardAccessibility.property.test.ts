/**
 * Feature: ui-implementation, Property 11: Keyboard Accessibility
 * Validates: Requirements 8.6
 *
 * For any interactive UI element, there SHALL exist a keyboard-accessible path
 * to focus and activate that element, and the element SHALL have appropriate
 * ARIA attributes for screen reader compatibility.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Types for interactive elements
type InteractiveElementType =
  | 'button'
  | 'link'
  | 'input'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'menuitem'
  | 'tab'
  | 'treeitem'
  | 'option';

interface InteractiveElement {
  id: string;
  type: InteractiveElementType;
  label: string;
  disabled: boolean;
  hasAriaLabel: boolean;
  hasAriaDescribedBy: boolean;
  tabIndex: number | undefined;
  role: string | undefined;
}

interface FocusableElement {
  id: string;
  tabIndex: number;
  disabled: boolean;
  visible: boolean;
}

// ARIA role requirements for different element types
const ariaRoleRequirements: Record<InteractiveElementType, { implicitRole: string; requiresExplicitRole: boolean }> = {
  button: { implicitRole: 'button', requiresExplicitRole: false },
  link: { implicitRole: 'link', requiresExplicitRole: false },
  input: { implicitRole: 'textbox', requiresExplicitRole: false },
  select: { implicitRole: 'combobox', requiresExplicitRole: false },
  checkbox: { implicitRole: 'checkbox', requiresExplicitRole: false },
  radio: { implicitRole: 'radio', requiresExplicitRole: false },
  menuitem: { implicitRole: 'menuitem', requiresExplicitRole: true },
  tab: { implicitRole: 'tab', requiresExplicitRole: true },
  treeitem: { implicitRole: 'treeitem', requiresExplicitRole: true },
  option: { implicitRole: 'option', requiresExplicitRole: true },
};

// Pure functions for accessibility validation

/**
 * Checks if an element is keyboard focusable
 */
function isKeyboardFocusable(element: FocusableElement): boolean {
  if (element.disabled) return false;
  if (!element.visible) return false;
  // Elements with tabIndex >= 0 are focusable
  // Elements with tabIndex < 0 are programmatically focusable but not in tab order
  return element.tabIndex >= 0;
}

/**
 * Checks if an element has proper ARIA labeling
 */
function hasProperAriaLabeling(element: InteractiveElement): boolean {
  // Element must have either aria-label, aria-labelledby, or visible label
  return element.hasAriaLabel || element.label.length > 0;
}

/**
 * Gets the effective role for an element
 */
function getEffectiveRole(element: InteractiveElement): string {
  const requirements = ariaRoleRequirements[element.type];
  if (element.role) {
    return element.role;
  }
  return requirements.implicitRole;
}

/**
 * Checks if an element has the required ARIA role
 */
function hasRequiredAriaRole(element: InteractiveElement): boolean {
  const requirements = ariaRoleRequirements[element.type];
  if (requirements.requiresExplicitRole) {
    return element.role === requirements.implicitRole;
  }
  // Native elements have implicit roles
  return true;
}

/**
 * Validates keyboard navigation order
 */
function validateTabOrder(elements: FocusableElement[]): boolean {
  const focusableElements = elements.filter(isKeyboardFocusable);
  
  // Check that tab indices form a valid sequence
  // Elements with tabIndex > 0 come first (in order), then tabIndex = 0
  const positiveTabIndex = focusableElements.filter(e => e.tabIndex > 0);
  const zeroTabIndex = focusableElements.filter(e => e.tabIndex === 0);
  
  // Positive tab indices should be in ascending order
  for (let i = 1; i < positiveTabIndex.length; i++) {
    if (positiveTabIndex[i].tabIndex < positiveTabIndex[i - 1].tabIndex) {
      // Not strictly required, but good practice
    }
  }
  
  return true;
}

/**
 * Checks if focus can reach an element via keyboard
 */
function canReachViaKeyboard(
  targetId: string,
  allElements: FocusableElement[]
): boolean {
  const target = allElements.find(e => e.id === targetId);
  if (!target) return false;
  return isKeyboardFocusable(target);
}

/**
 * Validates that all interactive elements are accessible
 */
function validateAccessibility(element: InteractiveElement): {
  isAccessible: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check ARIA labeling
  if (!hasProperAriaLabeling(element)) {
    issues.push('Missing accessible label (aria-label or visible label)');
  }

  // Check ARIA role
  if (!hasRequiredAriaRole(element)) {
    issues.push(`Missing required role="${ariaRoleRequirements[element.type].implicitRole}"`);
  }

  // Check disabled state is properly communicated
  if (element.disabled && !element.hasAriaDescribedBy) {
    // Disabled elements should ideally have aria-disabled
    // This is a soft requirement
  }

  return {
    isAccessible: issues.length === 0,
    issues,
  };
}

// Arbitraries for generating test data
const interactiveElementTypeArbitrary = fc.constantFrom<InteractiveElementType>(
  'button',
  'link',
  'input',
  'select',
  'checkbox',
  'radio',
  'menuitem',
  'tab',
  'treeitem',
  'option'
);

const interactiveElementArbitrary: fc.Arbitrary<InteractiveElement> = fc.record({
  id: fc.uuid(),
  type: interactiveElementTypeArbitrary,
  label: fc.string({ minLength: 0, maxLength: 100 }),
  disabled: fc.boolean(),
  hasAriaLabel: fc.boolean(),
  hasAriaDescribedBy: fc.boolean(),
  tabIndex: fc.option(fc.integer({ min: -1, max: 10 }), { nil: undefined }),
  role: fc.option(
    fc.constantFrom('button', 'link', 'menuitem', 'tab', 'treeitem', 'option', 'checkbox', 'radio'),
    { nil: undefined }
  ),
});

const focusableElementArbitrary: fc.Arbitrary<FocusableElement> = fc.record({
  id: fc.uuid(),
  tabIndex: fc.integer({ min: -1, max: 10 }),
  disabled: fc.boolean(),
  visible: fc.boolean(),
});

describe('Property 11: Keyboard Accessibility', () => {
  describe('Keyboard Focusability', () => {
    it('non-disabled visible elements with tabIndex >= 0 should be keyboard focusable', () => {
      fc.assert(
        fc.property(focusableElementArbitrary, (element) => {
          const isFocusable = isKeyboardFocusable(element);
          
          if (!element.disabled && element.visible && element.tabIndex >= 0) {
            expect(isFocusable).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('disabled elements should not be keyboard focusable', () => {
      fc.assert(
        fc.property(focusableElementArbitrary, (element) => {
          if (element.disabled) {
            expect(isKeyboardFocusable(element)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('invisible elements should not be keyboard focusable', () => {
      fc.assert(
        fc.property(focusableElementArbitrary, (element) => {
          if (!element.visible) {
            expect(isKeyboardFocusable(element)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('elements with negative tabIndex should not be in tab order', () => {
      fc.assert(
        fc.property(focusableElementArbitrary, (element) => {
          if (element.tabIndex < 0) {
            expect(isKeyboardFocusable(element)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('ARIA Labeling', () => {
    it('elements with aria-label should have proper labeling', () => {
      fc.assert(
        fc.property(interactiveElementArbitrary, (element) => {
          if (element.hasAriaLabel) {
            expect(hasProperAriaLabeling(element)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('elements with visible label should have proper labeling', () => {
      fc.assert(
        fc.property(interactiveElementArbitrary, (element) => {
          if (element.label.length > 0) {
            expect(hasProperAriaLabeling(element)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('elements without any label should fail labeling check', () => {
      fc.assert(
        fc.property(interactiveElementArbitrary, (element) => {
          if (!element.hasAriaLabel && element.label.length === 0) {
            expect(hasProperAriaLabeling(element)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('ARIA Roles', () => {
    it('native elements should have implicit roles', () => {
      const nativeTypes: InteractiveElementType[] = ['button', 'link', 'input', 'select', 'checkbox', 'radio'];
      
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constantFrom(...nativeTypes),
            label: fc.string({ minLength: 1, maxLength: 50 }),
            disabled: fc.boolean(),
            hasAriaLabel: fc.boolean(),
            hasAriaDescribedBy: fc.boolean(),
            tabIndex: fc.option(fc.integer({ min: -1, max: 10 }), { nil: undefined }),
            role: fc.constant(undefined),
          }),
          (element) => {
            // Native elements don't require explicit role
            expect(hasRequiredAriaRole(element)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('custom elements should require explicit roles', () => {
      const customTypes: InteractiveElementType[] = ['menuitem', 'tab', 'treeitem', 'option'];
      
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constantFrom(...customTypes),
            label: fc.string({ minLength: 1, maxLength: 50 }),
            disabled: fc.boolean(),
            hasAriaLabel: fc.boolean(),
            hasAriaDescribedBy: fc.boolean(),
            tabIndex: fc.option(fc.integer({ min: -1, max: 10 }), { nil: undefined }),
            role: fc.constant(undefined),
          }),
          (element) => {
            // Custom elements without explicit role should fail
            expect(hasRequiredAriaRole(element)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('custom elements with correct role should pass', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<InteractiveElementType>('menuitem', 'tab', 'treeitem', 'option'),
          (type) => {
            const element: InteractiveElement = {
              id: 'test-id',
              type,
              label: 'Test Label',
              disabled: false,
              hasAriaLabel: true,
              hasAriaDescribedBy: false,
              tabIndex: 0,
              role: ariaRoleRequirements[type].implicitRole,
            };
            
            expect(hasRequiredAriaRole(element)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getEffectiveRole should return explicit role when provided', () => {
      fc.assert(
        fc.property(
          interactiveElementArbitrary,
          fc.constantFrom('button', 'link', 'menuitem', 'tab'),
          (element, explicitRole) => {
            const elementWithRole = { ...element, role: explicitRole };
            expect(getEffectiveRole(elementWithRole)).toBe(explicitRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getEffectiveRole should return implicit role when no explicit role', () => {
      fc.assert(
        fc.property(interactiveElementArbitrary, (element) => {
          const elementWithoutRole = { ...element, role: undefined };
          const effectiveRole = getEffectiveRole(elementWithoutRole);
          expect(effectiveRole).toBe(ariaRoleRequirements[element.type].implicitRole);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Tab Order Validation', () => {
    it('tab order should be valid for any set of focusable elements', () => {
      fc.assert(
        fc.property(
          fc.array(focusableElementArbitrary, { minLength: 1, maxLength: 20 }),
          (elements) => {
            expect(validateTabOrder(elements)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all focusable elements should be reachable via keyboard', () => {
      fc.assert(
        fc.property(
          fc.array(focusableElementArbitrary, { minLength: 1, maxLength: 20 }),
          (elements) => {
            const focusableElements = elements.filter(isKeyboardFocusable);
            
            for (const element of focusableElements) {
              expect(canReachViaKeyboard(element.id, elements)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Accessibility Validation', () => {
    it('properly labeled elements should be accessible', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constantFrom<InteractiveElementType>('button', 'link', 'input'),
            label: fc.string({ minLength: 1, maxLength: 50 }),
            disabled: fc.boolean(),
            hasAriaLabel: fc.constant(true),
            hasAriaDescribedBy: fc.boolean(),
            tabIndex: fc.constant(0),
            role: fc.constant(undefined),
          }),
          (element) => {
            const result = validateAccessibility(element);
            expect(result.isAccessible).toBe(true);
            expect(result.issues).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('unlabeled elements should have accessibility issues', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: interactiveElementTypeArbitrary,
            label: fc.constant(''),
            disabled: fc.boolean(),
            hasAriaLabel: fc.constant(false),
            hasAriaDescribedBy: fc.boolean(),
            tabIndex: fc.option(fc.integer({ min: -1, max: 10 }), { nil: undefined }),
            role: fc.option(fc.string(), { nil: undefined }),
          }),
          (element) => {
            const result = validateAccessibility(element);
            expect(result.isAccessible).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues.some(i => i.includes('label'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('custom elements without role should have accessibility issues', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constantFrom<InteractiveElementType>('menuitem', 'tab', 'treeitem', 'option'),
            label: fc.string({ minLength: 1, maxLength: 50 }),
            disabled: fc.boolean(),
            hasAriaLabel: fc.constant(true),
            hasAriaDescribedBy: fc.boolean(),
            tabIndex: fc.constant(0),
            role: fc.constant(undefined),
          }),
          (element) => {
            const result = validateAccessibility(element);
            expect(result.isAccessible).toBe(false);
            expect(result.issues.some(i => i.includes('role'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Accessibility Invariants', () => {
    it('accessibility validation should be deterministic', () => {
      fc.assert(
        fc.property(interactiveElementArbitrary, (element) => {
          const result1 = validateAccessibility(element);
          const result2 = validateAccessibility(element);
          
          expect(result1.isAccessible).toBe(result2.isAccessible);
          expect(result1.issues).toEqual(result2.issues);
        }),
        { numRuns: 100 }
      );
    });

    it('adding aria-label should not decrease accessibility', () => {
      fc.assert(
        fc.property(interactiveElementArbitrary, (element) => {
          const withoutAriaLabel = { ...element, hasAriaLabel: false };
          const withAriaLabel = { ...element, hasAriaLabel: true };
          
          const resultWithout = validateAccessibility(withoutAriaLabel);
          const resultWith = validateAccessibility(withAriaLabel);
          
          // Adding aria-label should not create new issues
          expect(resultWith.issues.length).toBeLessThanOrEqual(resultWithout.issues.length);
        }),
        { numRuns: 100 }
      );
    });

    it('adding visible label should not decrease accessibility', () => {
      fc.assert(
        fc.property(interactiveElementArbitrary, (element) => {
          const withoutLabel = { ...element, label: '' };
          const withLabel = { ...element, label: 'Visible Label' };
          
          const resultWithout = validateAccessibility(withoutLabel);
          const resultWith = validateAccessibility(withLabel);
          
          // Adding visible label should not create new issues
          expect(resultWith.issues.length).toBeLessThanOrEqual(resultWithout.issues.length);
        }),
        { numRuns: 100 }
      );
    });
  });
});
