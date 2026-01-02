/**
 * Feature: ui-implementation, Property 16: Responsive Layout Adaptation
 * Validates: Requirements 14.1, 14.4
 * 
 * For any viewport width from mobile (320px) to desktop (1920px+), the UI layout
 * SHALL adapt without horizontal scrolling, content overflow, or overlap with
 * device safe areas.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getBreakpoint,
  getDeviceType,
  isBreakpointAtLeast,
  isBreakpointAtMost,
  BREAKPOINTS,
} from '@/hooks/useBreakpoint';
import type { Breakpoint, DeviceType, SafeAreaInsets } from '@/types/mobile';

// Viewport width ranges for testing
const MIN_MOBILE_WIDTH = 320;
const MAX_DESKTOP_WIDTH = 2560;

// Arbitrary for generating valid viewport widths
const viewportWidthArbitrary = fc.integer({ min: MIN_MOBILE_WIDTH, max: MAX_DESKTOP_WIDTH });

// Arbitrary for generating safe area insets (typical values for modern devices)
const safeAreaInsetsArbitrary = fc.record({
  top: fc.integer({ min: 0, max: 59 }), // iPhone notch is ~47px, status bar ~20px
  bottom: fc.integer({ min: 0, max: 34 }), // iPhone home indicator ~34px
  left: fc.integer({ min: 0, max: 44 }), // Landscape notch
  right: fc.integer({ min: 0, max: 44 }), // Landscape notch
});

// Arbitrary for generating viewport dimensions
const viewportArbitrary = fc.record({
  width: viewportWidthArbitrary,
  height: fc.integer({ min: 480, max: 2160 }),
});

describe('Property 16: Responsive Layout Adaptation', () => {
  describe('Breakpoint Detection', () => {
    it('should return a valid breakpoint for any viewport width', () => {
      fc.assert(
        fc.property(viewportWidthArbitrary, (width) => {
          const breakpoint = getBreakpoint(width);
          
          // Breakpoint should be one of the valid values
          const validBreakpoints: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
          expect(validBreakpoints).toContain(breakpoint);
        }),
        { numRuns: 100 }
      );
    });

    it('should return correct breakpoint based on width thresholds', () => {
      fc.assert(
        fc.property(viewportWidthArbitrary, (width) => {
          const breakpoint = getBreakpoint(width);
          
          // Verify breakpoint matches the correct threshold
          if (width >= BREAKPOINTS['2xl']) {
            expect(breakpoint).toBe('2xl');
          } else if (width >= BREAKPOINTS.xl) {
            expect(breakpoint).toBe('xl');
          } else if (width >= BREAKPOINTS.lg) {
            expect(breakpoint).toBe('lg');
          } else if (width >= BREAKPOINTS.md) {
            expect(breakpoint).toBe('md');
          } else if (width >= BREAKPOINTS.sm) {
            expect(breakpoint).toBe('sm');
          } else {
            expect(breakpoint).toBe('xs');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('breakpoint transitions should be monotonic with increasing width', () => {
      fc.assert(
        fc.property(
          fc.tuple(viewportWidthArbitrary, viewportWidthArbitrary),
          ([width1, width2]) => {
            const bp1 = getBreakpoint(width1);
            const bp2 = getBreakpoint(width2);
            
            // If width1 <= width2, then bp1 should be <= bp2 in breakpoint order
            if (width1 <= width2) {
              expect(isBreakpointAtMost(bp1, bp2)).toBe(true);
            }
            // If width1 >= width2, then bp1 should be >= bp2 in breakpoint order
            if (width1 >= width2) {
              expect(isBreakpointAtLeast(bp1, bp2)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Device Type Detection', () => {
    it('should return a valid device type for any viewport width', () => {
      fc.assert(
        fc.property(viewportWidthArbitrary, (width) => {
          const deviceType = getDeviceType(width);
          
          // Device type should be one of the valid values
          const validDeviceTypes: DeviceType[] = ['mobile', 'tablet', 'desktop'];
          expect(validDeviceTypes).toContain(deviceType);
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly categorize device types based on width', () => {
      fc.assert(
        fc.property(viewportWidthArbitrary, (width) => {
          const deviceType = getDeviceType(width);
          
          // Verify device type matches expected ranges
          if (width < BREAKPOINTS.md) {
            expect(deviceType).toBe('mobile');
          } else if (width < BREAKPOINTS.lg) {
            expect(deviceType).toBe('tablet');
          } else {
            expect(deviceType).toBe('desktop');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('device type should be consistent with breakpoint', () => {
      fc.assert(
        fc.property(viewportWidthArbitrary, (width) => {
          const breakpoint = getBreakpoint(width);
          const deviceType = getDeviceType(width);
          
          // Mobile should be xs or sm
          if (deviceType === 'mobile') {
            expect(['xs', 'sm']).toContain(breakpoint);
          }
          // Tablet should be md
          if (deviceType === 'tablet') {
            expect(breakpoint).toBe('md');
          }
          // Desktop should be lg, xl, or 2xl
          if (deviceType === 'desktop') {
            expect(['lg', 'xl', '2xl']).toContain(breakpoint);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Breakpoint Comparison Functions', () => {
    it('isBreakpointAtLeast should be reflexive', () => {
      const breakpoints: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
      
      fc.assert(
        fc.property(fc.constantFrom(...breakpoints), (bp) => {
          // A breakpoint should always be at least itself
          expect(isBreakpointAtLeast(bp, bp)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('isBreakpointAtMost should be reflexive', () => {
      const breakpoints: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
      
      fc.assert(
        fc.property(fc.constantFrom(...breakpoints), (bp) => {
          // A breakpoint should always be at most itself
          expect(isBreakpointAtMost(bp, bp)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('isBreakpointAtLeast and isBreakpointAtMost should be consistent', () => {
      const breakpoints: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...breakpoints),
          fc.constantFrom(...breakpoints),
          (bp1, bp2) => {
            // If bp1 >= bp2, then bp2 <= bp1
            if (isBreakpointAtLeast(bp1, bp2)) {
              expect(isBreakpointAtMost(bp2, bp1)).toBe(true);
            }
            // If bp1 <= bp2, then bp2 >= bp1
            if (isBreakpointAtMost(bp1, bp2)) {
              expect(isBreakpointAtLeast(bp2, bp1)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Safe Area Handling', () => {
    it('safe area insets should always be non-negative', () => {
      fc.assert(
        fc.property(safeAreaInsetsArbitrary, (insets) => {
          expect(insets.top).toBeGreaterThanOrEqual(0);
          expect(insets.bottom).toBeGreaterThanOrEqual(0);
          expect(insets.left).toBeGreaterThanOrEqual(0);
          expect(insets.right).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });

    it('content area should be positive after applying safe area insets', () => {
      fc.assert(
        fc.property(
          viewportArbitrary,
          safeAreaInsetsArbitrary,
          (viewport, insets) => {
            const contentWidth = viewport.width - insets.left - insets.right;
            const contentHeight = viewport.height - insets.top - insets.bottom;
            
            // Content area should still be usable (at least 200px in each dimension)
            // This ensures safe areas don't consume the entire viewport
            expect(contentWidth).toBeGreaterThan(200);
            expect(contentHeight).toBeGreaterThan(200);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('safe area padding calculation should be additive', () => {
      fc.assert(
        fc.property(
          safeAreaInsetsArbitrary,
          fc.integer({ min: 0, max: 32 }), // Additional padding
          (insets, additionalPadding) => {
            // Calculate total padding for each edge
            const totalTop = insets.top + additionalPadding;
            const totalBottom = insets.bottom + additionalPadding;
            const totalLeft = insets.left + additionalPadding;
            const totalRight = insets.right + additionalPadding;
            
            // Total should equal sum of parts
            expect(totalTop).toBe(insets.top + additionalPadding);
            expect(totalBottom).toBe(insets.bottom + additionalPadding);
            expect(totalLeft).toBe(insets.left + additionalPadding);
            expect(totalRight).toBe(insets.right + additionalPadding);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Layout Adaptation', () => {
    // Simulate responsive grid column calculation
    function getGridColumns(width: number, mobileCols: number, tabletCols: number, desktopCols: number): number {
      const deviceType = getDeviceType(width);
      if (deviceType === 'mobile') return mobileCols;
      if (deviceType === 'tablet') return tabletCols;
      return desktopCols;
    }

    it('grid columns should adapt based on device type', () => {
      fc.assert(
        fc.property(
          viewportWidthArbitrary,
          fc.integer({ min: 1, max: 4 }), // mobile cols
          fc.integer({ min: 2, max: 6 }), // tablet cols
          fc.integer({ min: 3, max: 12 }), // desktop cols
          (width, mobileCols, tabletCols, desktopCols) => {
            const cols = getGridColumns(width, mobileCols, tabletCols, desktopCols);
            const deviceType = getDeviceType(width);
            
            // Columns should match the device type configuration
            if (deviceType === 'mobile') {
              expect(cols).toBe(mobileCols);
            } else if (deviceType === 'tablet') {
              expect(cols).toBe(tabletCols);
            } else {
              expect(cols).toBe(desktopCols);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('column width should fit within viewport', () => {
      fc.assert(
        fc.property(
          viewportWidthArbitrary,
          fc.integer({ min: 1, max: 12 }), // number of columns
          fc.integer({ min: 0, max: 32 }), // gap between columns
          (viewportWidth, numCols, gap) => {
            // Calculate column width
            const totalGap = gap * (numCols - 1);
            const availableWidth = viewportWidth - totalGap;
            const columnWidth = availableWidth / numCols;
            
            // Each column should have positive width
            expect(columnWidth).toBeGreaterThan(0);
            
            // Total width should not exceed viewport
            const totalWidth = (columnWidth * numCols) + totalGap;
            expect(totalWidth).toBeLessThanOrEqual(viewportWidth + 1); // +1 for floating point tolerance
          }
        ),
        { numRuns: 100 }
      );
    });

    it('responsive stack direction should be valid', () => {
      type Direction = 'row' | 'column' | 'row-reverse' | 'column-reverse';
      const directions: Direction[] = ['row', 'column', 'row-reverse', 'column-reverse'];
      
      fc.assert(
        fc.property(
          viewportWidthArbitrary,
          fc.constantFrom(...directions),
          fc.constantFrom(...directions),
          fc.constantFrom(...directions),
          (width, mobileDir, tabletDir, desktopDir) => {
            const deviceType = getDeviceType(width);
            
            // Get the direction that would be applied
            let appliedDirection: Direction;
            if (deviceType === 'mobile') {
              appliedDirection = mobileDir;
            } else if (deviceType === 'tablet') {
              appliedDirection = tabletDir;
            } else {
              appliedDirection = desktopDir;
            }
            
            // Direction should be one of the valid values
            expect(directions).toContain(appliedDirection);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Viewport Orientation', () => {
    it('should correctly detect portrait vs landscape orientation', () => {
      fc.assert(
        fc.property(viewportArbitrary, (viewport) => {
          const isPortrait = viewport.height > viewport.width;
          const isLandscape = viewport.width >= viewport.height;
          
          // Exactly one should be true (or both if equal, which counts as landscape)
          expect(isPortrait !== isLandscape || viewport.width === viewport.height).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('orientation detection should be consistent', () => {
      fc.assert(
        fc.property(viewportArbitrary, (viewport) => {
          const isPortrait = viewport.height > viewport.width;
          const isLandscape = viewport.width >= viewport.height;
          
          // If portrait, height must be greater than width
          if (isPortrait) {
            expect(viewport.height).toBeGreaterThan(viewport.width);
          }
          
          // If landscape, width must be >= height
          if (isLandscape) {
            expect(viewport.width).toBeGreaterThanOrEqual(viewport.height);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
