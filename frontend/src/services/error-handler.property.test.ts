/**
 * Feature: ui-implementation, Property 15: Error Response Completeness
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 * 
 * For any error returned by the system, the error object SHALL contain:
 * - a request tracking ID
 * - a category (user/system/transient)
 * - a human-readable message
 * - suggested resolution steps
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  handleError,
  validateAppError,
  categorizeError,
  generateRequestTrackingId,
} from './error-handler';
import type { AppError, ErrorCategory } from '@/types/error';

// Arbitrary for generating various error types
const errorArbitrary = fc.oneof(
  // Standard Error
  fc.string({ minLength: 1 }).map(msg => new Error(msg)),
  
  // TypeError (often network errors)
  fc.constantFrom(
    new TypeError('Failed to fetch'),
    new TypeError('Network request failed'),
    new TypeError('Cannot read property of undefined')
  ),
  
  // DOMException (timeout)
  fc.constant({ name: 'AbortError', message: 'The operation was aborted' } as DOMException),
  
  // HTTP-like errors with status codes
  fc.record({
    status: fc.integer({ min: 400, max: 599 }),
    message: fc.string({ minLength: 1 }),
  }),
  
  // Errors with response object (like axios errors)
  fc.record({
    response: fc.record({
      status: fc.integer({ min: 400, max: 599 }),
      data: fc.record({ message: fc.string() }),
    }),
    message: fc.string({ minLength: 1 }),
  }),
  
  // String errors
  fc.string({ minLength: 1 }),
  
  // Null/undefined
  fc.constantFrom(null, undefined),
  
  // Plain objects
  fc.record({
    code: fc.string(),
    message: fc.string(),
  })
);

// Arbitrary for error messages with specific keywords
const keywordErrorArbitrary = fc.oneof(
  fc.constantFrom(
    new Error('Network error occurred'),
    new Error('Connection timeout'),
    new Error('Permission denied'),
    new Error('Unauthorized access'),
    new Error('Validation failed'),
    new Error('Invalid input provided'),
    new Error('Resource not found'),
    new Error('Internal server error')
  )
);

describe('Property 15: Error Response Completeness', () => {
  describe('handleError produces complete AppError objects', () => {
    it('for any error input, handleError SHALL return an AppError with all required fields', () => {
      fc.assert(
        fc.property(errorArbitrary, (error) => {
          const appError = handleError(error);
          const validation = validateAppError(appError);
          
          expect(validation.valid).toBe(true);
          expect(validation.missingFields).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('for any error, the AppError SHALL contain a request tracking ID', () => {
      fc.assert(
        fc.property(errorArbitrary, (error) => {
          const appError = handleError(error);
          
          expect(appError.requestTrackingId).toBeDefined();
          expect(typeof appError.requestTrackingId).toBe('string');
          expect(appError.requestTrackingId.length).toBeGreaterThan(0);
          expect(appError.requestTrackingId).toMatch(/^req-/);
        }),
        { numRuns: 100 }
      );
    });

    it('for any error, the AppError SHALL contain a valid category', () => {
      fc.assert(
        fc.property(errorArbitrary, (error) => {
          const appError = handleError(error);
          const validCategories: ErrorCategory[] = ['user', 'system', 'transient'];
          
          expect(validCategories).toContain(appError.category);
        }),
        { numRuns: 100 }
      );
    });

    it('for any error, the AppError SHALL contain a human-readable message', () => {
      fc.assert(
        fc.property(errorArbitrary, (error) => {
          const appError = handleError(error);
          
          expect(appError.message).toBeDefined();
          expect(typeof appError.message).toBe('string');
          expect(appError.message.length).toBeGreaterThan(0);
          // Message should not be a stack trace or internal code
          expect(appError.message).not.toMatch(/at \w+\.\w+/);
        }),
        { numRuns: 100 }
      );
    });

    it('for any error, the AppError SHALL contain suggested resolution steps', () => {
      fc.assert(
        fc.property(errorArbitrary, (error) => {
          const appError = handleError(error);
          
          expect(appError.suggestedActions).toBeDefined();
          expect(Array.isArray(appError.suggestedActions)).toBe(true);
          expect(appError.suggestedActions.length).toBeGreaterThan(0);
          
          // Each action should be a non-empty string
          for (const action of appError.suggestedActions) {
            expect(typeof action).toBe('string');
            expect(action.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('for any error, the AppError SHALL contain a timestamp', () => {
      fc.assert(
        fc.property(errorArbitrary, (error) => {
          const before = new Date();
          const appError = handleError(error);
          const after = new Date();
          
          expect(appError.timestamp).toBeInstanceOf(Date);
          expect(appError.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
          expect(appError.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        }),
        { numRuns: 100 }
      );
    });

    it('for any error, the AppError SHALL have retryable set correctly based on category', () => {
      fc.assert(
        fc.property(errorArbitrary, (error) => {
          const appError = handleError(error);
          
          expect(typeof appError.retryable).toBe('boolean');
          // Transient errors should be retryable
          if (appError.category === 'transient') {
            expect(appError.retryable).toBe(true);
          } else {
            expect(appError.retryable).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('categorizeError correctly categorizes errors', () => {
    it('network-related errors SHALL be categorized as transient', () => {
      const networkErrors = [
        new TypeError('Failed to fetch'),
        new Error('Network error'),
        new Error('Connection timeout'),
        new Error('ECONNREFUSED'),
        new Error('ENOTFOUND'),
      ];

      for (const error of networkErrors) {
        expect(categorizeError(error)).toBe('transient');
      }
    });

    it('permission-related errors SHALL be categorized as user errors', () => {
      const permissionErrors = [
        new Error('Permission denied'),
        new Error('Unauthorized access'),
        new Error('Forbidden resource'),
        new Error('Authentication required'),
      ];

      for (const error of permissionErrors) {
        expect(categorizeError(error)).toBe('user');
      }
    });

    it('validation errors SHALL be categorized as user errors', () => {
      const validationErrors = [
        new Error('Validation failed'),
        new Error('Invalid input'),
        new Error('Required field missing'),
      ];

      for (const error of validationErrors) {
        expect(categorizeError(error)).toBe('user');
      }
    });

    it('HTTP 4xx errors (except 408, 429) SHALL be categorized as user errors', () => {
      const userHttpCodes = [400, 401, 403, 404, 405, 409, 422];
      
      for (const status of userHttpCodes) {
        const error = { status, message: 'HTTP Error' };
        expect(categorizeError(error)).toBe('user');
      }
    });

    it('HTTP 408 and 429 errors SHALL be categorized as transient', () => {
      const transientHttpCodes = [408, 429];
      
      for (const status of transientHttpCodes) {
        const error = { status, message: 'HTTP Error' };
        expect(categorizeError(error)).toBe('transient');
      }
    });

    it('HTTP 502, 503, 504 errors SHALL be categorized as transient', () => {
      const transientHttpCodes = [502, 503, 504];
      
      for (const status of transientHttpCodes) {
        const error = { status, message: 'HTTP Error' };
        expect(categorizeError(error)).toBe('transient');
      }
    });

    it('HTTP 500, 501 errors SHALL be categorized as system errors', () => {
      const systemHttpCodes = [500, 501];
      
      for (const status of systemHttpCodes) {
        const error = { status, message: 'HTTP Error' };
        expect(categorizeError(error)).toBe('system');
      }
    });
  });

  describe('generateRequestTrackingId produces unique IDs', () => {
    it('SHALL generate unique tracking IDs', () => {
      fc.assert(
        fc.property(fc.integer({ min: 10, max: 100 }), (count) => {
          const ids = new Set<string>();
          
          for (let i = 0; i < count; i++) {
            ids.add(generateRequestTrackingId());
          }
          
          // All IDs should be unique
          expect(ids.size).toBe(count);
        }),
        { numRuns: 100 }
      );
    });

    it('SHALL generate IDs with correct format', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const id = generateRequestTrackingId();
          
          expect(id).toMatch(/^req-[a-z0-9]+-[a-z0-9]+$/);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('custom tracking ID is preserved', () => {
    it('when a tracking ID is provided, it SHALL be used in the AppError', () => {
      fc.assert(
        fc.property(
          errorArbitrary,
          fc.string({ minLength: 5, maxLength: 50 }).map(s => `custom-${s}`),
          (error, customId) => {
            const appError = handleError(error, customId);
            
            expect(appError.requestTrackingId).toBe(customId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
