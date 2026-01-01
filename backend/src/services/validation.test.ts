import * as fc from 'fast-check';
import { validateParameter, validateHardBounds, validateParameterCombinations, validateStrategy } from './validation';
import { ParameterDefinition, HardBounds, ParameterValue } from '../types/template';
import { ValidationError } from '../types/validation';

/**
 * Feature: strategy-management, Property 4: Parameter Bounds Validation
 * 
 * For any parameter modification where the value is outside the parameter's 
 * Hard_Bounds (below min or above max), the modification SHALL be rejected 
 * with a validation error, and the original value SHALL remain unchanged.
 * 
 * Validates: Requirements 2.2, 2.3
 */
describe('Property 4: Parameter Bounds Validation', () => {
  // Generator for valid hard bounds (min <= max)
  const validHardBoundsArb = (): fc.Arbitrary<HardBounds> =>
    fc.tuple(
      fc.integer({ min: -1000000, max: 1000000 }),
      fc.integer({ min: -1000000, max: 1000000 })
    ).map(([a, b]) => ({
      min: Math.min(a, b),
      max: Math.max(a, b),
    }));

  // Generator for number parameter definition with bounds
  const numberParamWithBoundsArb = (): fc.Arbitrary<ParameterDefinition> =>
    validHardBoundsArb().chain(bounds =>
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
        dataType: fc.constant('number' as const),
        defaultValue: fc.integer({ min: bounds.min!, max: bounds.max! }),
        hardBounds: fc.constant(bounds),
        required: fc.boolean(),
        description: fc.string({ minLength: 1, maxLength: 100 }),
        enumValues: fc.constant(undefined),
      })
    );

  it('should reject values below minimum bound', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        fc.integer({ min: 1, max: 1000 }),
        (paramDef, offset) => {
          const min = paramDef.hardBounds!.min!;
          const valueBelowMin = min - offset;
          
          const result = validateParameter(valueBelowMin, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'BELOW_MIN');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject values above maximum bound', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        fc.integer({ min: 1, max: 1000 }),
        (paramDef, offset) => {
          const max = paramDef.hardBounds!.max!;
          const valueAboveMax = max + offset;
          
          const result = validateParameter(valueAboveMax, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'ABOVE_MAX');
        }
      ),
      { numRuns: 100 }
    );
  });


  it('should accept values within bounds', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        (paramDef) => {
          const min = paramDef.hardBounds!.min!;
          const max = paramDef.hardBounds!.max!;
          
          // Generate a value within bounds
          return fc.assert(
            fc.property(
              fc.integer({ min, max }),
              (valueWithinBounds) => {
                const result = validateParameter(valueWithinBounds, paramDef);
                return result.valid;
              }
            ),
            { numRuns: 10 }
          ) === undefined; // fc.assert returns undefined on success
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept values exactly at min bound', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        (paramDef) => {
          const min = paramDef.hardBounds!.min!;
          const result = validateParameter(min, paramDef);
          return result.valid;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept values exactly at max bound', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        (paramDef) => {
          const max = paramDef.hardBounds!.max!;
          const result = validateParameter(max, paramDef);
          return result.valid;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include field name in validation error', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        fc.integer({ min: 1, max: 1000 }),
        (paramDef, offset) => {
          const min = paramDef.hardBounds!.min!;
          const valueBelowMin = min - offset;
          
          const result = validateParameter(valueBelowMin, paramDef);
          
          return !result.valid && 
                 result.errors.every(e => e.field === paramDef.name);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: strategy-management, Property 16: Parameter Combination Consistency
 * 
 * For any Strategy with parameters that have logical relationships 
 * (e.g., stop-loss and entry price), the system SHALL validate that 
 * the combination is logically consistent and reject inconsistent combinations.
 * 
 * Validates: Requirements 6.5
 */
describe('Property 16: Parameter Combination Consistency', () => {
  // Generator for positive prices
  const priceArb = (): fc.Arbitrary<number> =>
    fc.double({ min: 0.01, max: 100000, noNaN: true });

  // Generator for position type
  const positionTypeArb = (): fc.Arbitrary<'LONG' | 'SHORT'> =>
    fc.constantFrom('LONG', 'SHORT');

  // Empty template for testing (parameter combinations don't depend on template structure)
  const emptyTemplate: any = { parameters: [] };

  it('should reject stop-loss above entry price for LONG positions', () => {
    fc.assert(
      fc.property(
        priceArb(),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        (entryPrice, offset) => {
          const stopLoss = entryPrice + offset; // Stop-loss above entry
          const parameters = {
            entryPrice,
            stopLoss,
            positionType: 'LONG',
          };

          const result = validateParameterCombinations(parameters, emptyTemplate);

          return !result.valid && 
                 result.errors.some((e: ValidationError) => 
                   e.field === 'stopLoss' && e.code === 'INVALID_COMBINATION'
                 );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject stop-loss below entry price for SHORT positions', () => {
    fc.assert(
      fc.property(
        priceArb(),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        (entryPrice, offset) => {
          const stopLoss = Math.max(0.01, entryPrice - offset); // Stop-loss below entry
          const parameters = {
            entryPrice,
            stopLoss,
            positionType: 'SHORT',
          };

          const result = validateParameterCombinations(parameters, emptyTemplate);

          return !result.valid && 
                 result.errors.some((e: ValidationError) => 
                   e.field === 'stopLoss' && e.code === 'INVALID_COMBINATION'
                 );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid stop-loss below entry price for LONG positions', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.02, max: 100000, noNaN: true }), // Entry price with room for stop-loss below
        fc.double({ min: 0.01, max: 0.99, noNaN: true }), // Ratio to ensure stop-loss < entry
        (entryPrice, ratio) => {
          const stopLoss = entryPrice * ratio; // Stop-loss strictly below entry
          const parameters = {
            entryPrice,
            stopLoss,
            positionType: 'LONG',
          };

          const result = validateParameterCombinations(parameters, emptyTemplate);

          // Should be valid (no stop-loss errors)
          return result.valid || 
                 !result.errors.some((e: ValidationError) => e.field === 'stopLoss');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid stop-loss above entry price for SHORT positions', () => {
    fc.assert(
      fc.property(
        priceArb(),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        (entryPrice, offset) => {
          const stopLoss = entryPrice + offset; // Stop-loss above entry
          const parameters = {
            entryPrice,
            stopLoss,
            positionType: 'SHORT',
          };

          const result = validateParameterCombinations(parameters, emptyTemplate);

          // Should be valid (no stop-loss errors)
          return result.valid || 
                 !result.errors.some((e: ValidationError) => e.field === 'stopLoss');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject minPositionSize greater than maxPositionSize', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        (maxSize, offset) => {
          const minSize = maxSize + offset; // Min > Max
          const parameters = {
            minPositionSize: minSize,
            maxPositionSize: maxSize,
          };

          const result = validateParameterCombinations(parameters, emptyTemplate);

          return !result.valid && 
                 result.errors.some((e: ValidationError) => 
                   e.field === 'minPositionSize' && e.code === 'INVALID_COMBINATION'
                 );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept minPositionSize less than or equal to maxPositionSize', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (minSize, offset) => {
          const maxSize = minSize + offset; // Max >= Min
          const parameters = {
            minPositionSize: minSize,
            maxPositionSize: maxSize,
          };

          const result = validateParameterCombinations(parameters, emptyTemplate);

          // Should be valid (no position size errors)
          return result.valid || 
                 !result.errors.some((e: ValidationError) => e.field === 'minPositionSize');
        }
      ),
      { numRuns: 100 }
    );
  });
});


import { validateDeployment } from './validation';
import { DeploymentConfig, DeploymentMode } from '../types/deployment';
import { Strategy } from '../types/strategy';

/**
 * Feature: strategy-management, Property 11: Deployment Mode Validation
 * 
 * For any deployment request, it SHALL require a valid Deployment_Mode; 
 * BACKTEST mode SHALL require startDate and endDate; LIVE mode SHALL 
 * require risk controls to be configured. Requests missing required 
 * fields SHALL be rejected.
 * 
 * Validates: Requirements 4.1, 4.2, 4.4
 */
describe('Property 11: Deployment Mode Validation', () => {
  // Generator for valid ISO date strings
  const isoDateArb = (): fc.Arbitrary<string> =>
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
      .map(d => d.toISOString());

  // Generator for valid date range (start < end)
  const validDateRangeArb = (): fc.Arbitrary<{ startDate: string; endDate: string }> =>
    fc.tuple(
      fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
      fc.integer({ min: 1, max: 365 })
    ).map(([start, daysOffset]) => {
      const end = new Date(start.getTime() + daysOffset * 24 * 60 * 60 * 1000);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    });

  // Generator for a minimal valid strategy
  const strategyArb = (): fc.Arbitrary<Strategy> =>
    fc.record({
      strategyId: fc.uuid(),
      tenantId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      templateId: fc.uuid(),
      templateVersion: fc.integer({ min: 1, max: 100 }),
      parameters: fc.constant({}),
      currentVersion: fc.integer({ min: 1, max: 100 }),
      state: fc.constantFrom('DRAFT', 'ACTIVE', 'PAUSED', 'STOPPED', 'ERROR'),
      createdAt: isoDateArb(),
      updatedAt: isoDateArb(),
    });

  // Generator for valid risk controls
  const riskControlsArb = (): fc.Arbitrary<{ maxPositionSize: number; maxDailyLoss: number; maxDrawdown?: number }> =>
    fc.record({
      maxPositionSize: fc.double({ min: 0.01, max: 1000000, noNaN: true }),
      maxDailyLoss: fc.double({ min: 0.01, max: 100000, noNaN: true }),
      maxDrawdown: fc.option(fc.double({ min: 0.01, max: 100, noNaN: true }), { nil: undefined }),
    });

  it('should reject BACKTEST mode without backtestConfig', () => {
    fc.assert(
      fc.property(
        strategyArb(),
        (strategy) => {
          const config: DeploymentConfig = {
            strategyId: strategy.strategyId,
            mode: 'BACKTEST',
            // No backtestConfig
          };

          const result = validateDeployment(config, strategy);

          return !result.valid && 
                 result.errors.some(e => e.field === 'backtestConfig' && e.code === 'REQUIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject BACKTEST mode without startDate', () => {
    fc.assert(
      fc.property(
        strategyArb(),
        isoDateArb(),
        fc.double({ min: 1000, max: 1000000, noNaN: true }),
        (strategy, endDate, initialCapital) => {
          const config: DeploymentConfig = {
            strategyId: strategy.strategyId,
            mode: 'BACKTEST',
            backtestConfig: {
              startDate: '', // Missing start date
              endDate,
              initialCapital,
            },
          };

          const result = validateDeployment(config, strategy);

          return !result.valid && 
                 result.errors.some(e => e.field === 'backtestConfig.startDate' && e.code === 'REQUIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject BACKTEST mode without endDate', () => {
    fc.assert(
      fc.property(
        strategyArb(),
        isoDateArb(),
        fc.double({ min: 1000, max: 1000000, noNaN: true }),
        (strategy, startDate, initialCapital) => {
          const config: DeploymentConfig = {
            strategyId: strategy.strategyId,
            mode: 'BACKTEST',
            backtestConfig: {
              startDate,
              endDate: '', // Missing end date
              initialCapital,
            },
          };

          const result = validateDeployment(config, strategy);

          return !result.valid && 
                 result.errors.some(e => e.field === 'backtestConfig.endDate' && e.code === 'REQUIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid BACKTEST mode with complete config', () => {
    fc.assert(
      fc.property(
        strategyArb(),
        validDateRangeArb(),
        fc.double({ min: 1000, max: 1000000, noNaN: true }),
        (strategy, dateRange, initialCapital) => {
          const config: DeploymentConfig = {
            strategyId: strategy.strategyId,
            mode: 'BACKTEST',
            backtestConfig: {
              startDate: dateRange.startDate,
              endDate: dateRange.endDate,
              initialCapital,
            },
          };

          const result = validateDeployment(config, strategy);

          return result.valid;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject LIVE mode without risk controls', () => {
    fc.assert(
      fc.property(
        strategyArb(),
        (strategy) => {
          const config: DeploymentConfig = {
            strategyId: strategy.strategyId,
            mode: 'LIVE',
          };

          const result = validateDeployment(config, strategy);

          return !result.valid && 
                 result.errors.some(e => e.field === 'riskControls' && e.code === 'REQUIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid LIVE mode with risk controls', () => {
    fc.assert(
      fc.property(
        strategyArb(),
        riskControlsArb(),
        (strategy, riskControls) => {
          const config: DeploymentConfig = {
            strategyId: strategy.strategyId,
            mode: 'LIVE',
          };

          const result = validateDeployment(config, strategy, riskControls);

          return result.valid;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept PAPER mode without additional requirements', () => {
    fc.assert(
      fc.property(
        strategyArb(),
        (strategy) => {
          const config: DeploymentConfig = {
            strategyId: strategy.strategyId,
            mode: 'PAPER',
          };

          const result = validateDeployment(config, strategy);

          return result.valid;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: strategy-management, Property 15: Validation Error Details
 * 
 * For any validation failure, the returned error response SHALL include 
 * specific error messages identifying which field(s) failed validation and why.
 * 
 * Validates: Requirements 6.4
 */
describe('Property 15: Validation Error Details', () => {
  // Generator for valid hard bounds (min <= max)
  const validHardBoundsArb = (): fc.Arbitrary<HardBounds> =>
    fc.tuple(
      fc.integer({ min: -1000000, max: 1000000 }),
      fc.integer({ min: -1000000, max: 1000000 })
    ).map(([a, b]) => ({
      min: Math.min(a, b),
      max: Math.max(a, b),
    }));

  // Generator for number parameter definition with bounds
  const numberParamWithBoundsArb = (): fc.Arbitrary<ParameterDefinition> =>
    validHardBoundsArb().chain(bounds =>
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
        dataType: fc.constant('number' as const),
        defaultValue: fc.integer({ min: bounds.min!, max: bounds.max! }),
        hardBounds: fc.constant(bounds),
        required: fc.boolean(),
        description: fc.string({ minLength: 1, maxLength: 100 }),
        enumValues: fc.constant(undefined),
      })
    );

  // Generator for required parameter definition
  const requiredParamArb = (): fc.Arbitrary<ParameterDefinition> =>
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      dataType: fc.constantFrom('number', 'string', 'boolean') as fc.Arbitrary<'number' | 'string' | 'boolean'>,
      defaultValue: fc.double({ min: -1000, max: 1000, noNaN: true }),
      hardBounds: fc.constant(undefined),
      required: fc.constant(true),
      description: fc.string({ minLength: 1, maxLength: 100 }),
      enumValues: fc.constant(undefined),
    });

  it('should include field name in all validation errors', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        fc.integer({ min: 1, max: 1000 }),
        (paramDef, offset) => {
          const min = paramDef.hardBounds!.min!;
          const valueBelowMin = min - offset;
          
          const result = validateParameter(valueBelowMin, paramDef);
          
          // All errors should have the field name set
          return !result.valid && 
                 result.errors.length > 0 &&
                 result.errors.every(e => e.field === paramDef.name && e.field.length > 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include error code in all validation errors', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        fc.integer({ min: 1, max: 1000 }),
        (paramDef, offset) => {
          const max = paramDef.hardBounds!.max!;
          const valueAboveMax = max + offset;
          
          const result = validateParameter(valueAboveMax, paramDef);
          
          // All errors should have a non-empty error code
          return !result.valid && 
                 result.errors.length > 0 &&
                 result.errors.every(e => e.code && e.code.length > 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include descriptive message in all validation errors', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        fc.integer({ min: 1, max: 1000 }),
        (paramDef, offset) => {
          const min = paramDef.hardBounds!.min!;
          const valueBelowMin = min - offset;
          
          const result = validateParameter(valueBelowMin, paramDef);
          
          // All errors should have a non-empty message
          return !result.valid && 
                 result.errors.length > 0 &&
                 result.errors.every(e => e.message && e.message.length > 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include specific error code for missing required parameters', () => {
    fc.assert(
      fc.property(
        requiredParamArb(),
        (paramDef) => {
          const result = validateParameter(undefined, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'REQUIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include specific error code for type mismatches', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
          dataType: fc.constant('number' as const),
          defaultValue: fc.constant(0),
          hardBounds: fc.constant(undefined),
          required: fc.constant(false),
          description: fc.string({ minLength: 1, maxLength: 100 }),
          enumValues: fc.constant(undefined),
        }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (paramDef, stringValue) => {
          // Pass a string to a number parameter
          const result = validateParameter(stringValue, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include specific error code for bounds violations', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        fc.integer({ min: 1, max: 1000 }),
        fc.boolean(),
        (paramDef, offset, belowMin) => {
          const min = paramDef.hardBounds!.min!;
          const max = paramDef.hardBounds!.max!;
          const invalidValue = belowMin ? min - offset : max + offset;
          
          const result = validateParameter(invalidValue, paramDef);
          
          const expectedCode = belowMin ? 'BELOW_MIN' : 'ABOVE_MAX';
          return !result.valid && 
                 result.errors.some(e => e.code === expectedCode);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty errors array for valid inputs', () => {
    fc.assert(
      fc.property(
        numberParamWithBoundsArb(),
        (paramDef) => {
          const min = paramDef.hardBounds!.min!;
          const max = paramDef.hardBounds!.max!;
          const validValue = Math.floor((min + max) / 2);
          
          const result = validateParameter(validValue, paramDef);
          
          return result.valid && result.errors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: strategy-management, Property 13: Parameter Validation Completeness
 * 
 * For any Strategy save operation, all required parameters defined in the template 
 * SHALL be present, and all parameter values SHALL conform to their specified data types. 
 * Violations SHALL result in rejection.
 * 
 * Validates: Requirements 6.1, 6.2
 */
describe('Property 13: Parameter Validation Completeness', () => {
  // Reserved JavaScript property names that exist on Object.prototype
  const reservedNames = new Set([
    'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
    'toLocaleString', 'toString', 'valueOf', '__proto__', '__defineGetter__',
    '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
  ]);

  // Generator for valid parameter name (excluding reserved JS property names)
  const paramNameArb = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 30 })
      .filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s) && !reservedNames.has(s));

  // Generator for required number parameter definition
  const requiredNumberParamArb = (): fc.Arbitrary<ParameterDefinition> =>
    fc.record({
      name: paramNameArb(),
      dataType: fc.constant('number' as const),
      defaultValue: fc.double({ min: -1000, max: 1000, noNaN: true }),
      hardBounds: fc.constant(undefined),
      required: fc.constant(true),
      description: fc.string({ minLength: 1, maxLength: 100 }),
      enumValues: fc.constant(undefined)
    });

  // Generator for required string parameter definition
  const requiredStringParamArb = (): fc.Arbitrary<ParameterDefinition> =>
    fc.record({
      name: paramNameArb(),
      dataType: fc.constant('string' as const),
      defaultValue: fc.string({ minLength: 1, maxLength: 50 }),
      hardBounds: fc.constant(undefined),
      required: fc.constant(true),
      description: fc.string({ minLength: 1, maxLength: 100 }),
      enumValues: fc.constant(undefined)
    });

  // Generator for required boolean parameter definition
  const requiredBooleanParamArb = (): fc.Arbitrary<ParameterDefinition> =>
    fc.record({
      name: paramNameArb(),
      dataType: fc.constant('boolean' as const),
      defaultValue: fc.boolean(),
      hardBounds: fc.constant(undefined),
      required: fc.constant(true),
      description: fc.string({ minLength: 1, maxLength: 100 }),
      enumValues: fc.constant(undefined)
    });

  // Generator for optional parameter definition
  const optionalParamArb = (): fc.Arbitrary<ParameterDefinition> =>
    fc.record({
      name: paramNameArb(),
      dataType: fc.constantFrom('number', 'string', 'boolean') as fc.Arbitrary<'number' | 'string' | 'boolean'>,
      defaultValue: fc.double({ min: -1000, max: 1000, noNaN: true }),
      hardBounds: fc.constant(undefined),
      required: fc.constant(false),
      description: fc.string({ minLength: 1, maxLength: 100 }),
      enumValues: fc.constant(undefined)
    });

  it('should reject missing required parameters', () => {
    fc.assert(
      fc.property(
        requiredNumberParamArb(),
        (paramDef) => {
          // Validate with undefined value for required parameter
          const result = validateParameter(undefined, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'REQUIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept missing optional parameters', () => {
    fc.assert(
      fc.property(
        optionalParamArb(),
        (paramDef) => {
          // Validate with undefined value for optional parameter
          const result = validateParameter(undefined, paramDef);
          
          return result.valid && result.errors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject number parameter with string value', () => {
    fc.assert(
      fc.property(
        requiredNumberParamArb(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (paramDef, stringValue) => {
          const result = validateParameter(stringValue, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject number parameter with boolean value', () => {
    fc.assert(
      fc.property(
        requiredNumberParamArb(),
        fc.boolean(),
        (paramDef, boolValue) => {
          const result = validateParameter(boolValue, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject string parameter with number value', () => {
    fc.assert(
      fc.property(
        requiredStringParamArb(),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (paramDef, numValue) => {
          const result = validateParameter(numValue, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject string parameter with boolean value', () => {
    fc.assert(
      fc.property(
        requiredStringParamArb(),
        fc.boolean(),
        (paramDef, boolValue) => {
          const result = validateParameter(boolValue, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject boolean parameter with number value', () => {
    fc.assert(
      fc.property(
        requiredBooleanParamArb(),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (paramDef, numValue) => {
          const result = validateParameter(numValue, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject boolean parameter with string value', () => {
    fc.assert(
      fc.property(
        requiredBooleanParamArb(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (paramDef, stringValue) => {
          const result = validateParameter(stringValue, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept number parameter with valid number value', () => {
    fc.assert(
      fc.property(
        requiredNumberParamArb(),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (paramDef, numValue) => {
          const result = validateParameter(numValue, paramDef);
          
          return result.valid && result.errors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept string parameter with valid string value', () => {
    fc.assert(
      fc.property(
        requiredStringParamArb(),
        fc.string({ minLength: 0, maxLength: 100 }),
        (paramDef, stringValue) => {
          const result = validateParameter(stringValue, paramDef);
          
          return result.valid && result.errors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept boolean parameter with valid boolean value', () => {
    fc.assert(
      fc.property(
        requiredBooleanParamArb(),
        fc.boolean(),
        (paramDef, boolValue) => {
          const result = validateParameter(boolValue, paramDef);
          
          return result.valid && result.errors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject NaN for number parameters', () => {
    fc.assert(
      fc.property(
        requiredNumberParamArb(),
        (paramDef) => {
          const result = validateParameter(NaN, paramDef);
          
          return !result.valid && 
                 result.errors.some(e => e.code === 'TYPE_MISMATCH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate all required parameters are present in strategy', () => {
    fc.assert(
      fc.property(
        fc.array(requiredNumberParamArb(), { minLength: 1, maxLength: 5 }),
        fc.uuid(),
        fc.uuid(),
        (paramDefs, strategyId, tenantId) => {
          // Deduplicate parameter names
          const uniqueParams = paramDefs.reduce((acc, param) => {
            if (!acc.some(p => p.name === param.name)) {
              acc.push(param);
            }
            return acc;
          }, [] as ParameterDefinition[]);

          const template: any = {
            templateId: 'test-template',
            name: 'Test Template',
            description: 'Test',
            version: 1,
            parameters: uniqueParams,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          // Create strategy with missing parameters (empty object)
          const strategy: Strategy = {
            strategyId,
            tenantId,
            name: 'Test Strategy',
            templateId: template.templateId,
            templateVersion: template.version,
            parameters: {}, // Missing all required parameters
            currentVersion: 1,
            state: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const result = validateStrategy(strategy, template);

          // Should fail because required parameters are missing
          return !result.valid && 
                 result.errors.some(e => e.code === 'REQUIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept strategy with all required parameters present and valid types', () => {
    fc.assert(
      fc.property(
        fc.array(requiredNumberParamArb(), { minLength: 1, maxLength: 5 }),
        fc.uuid(),
        fc.uuid(),
        (paramDefs, strategyId, tenantId) => {
          // Deduplicate parameter names
          const uniqueParams = paramDefs.reduce((acc, param) => {
            if (!acc.some(p => p.name === param.name)) {
              acc.push(param);
            }
            return acc;
          }, [] as ParameterDefinition[]);

          const template: any = {
            templateId: 'test-template',
            name: 'Test Template',
            description: 'Test',
            version: 1,
            parameters: uniqueParams,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          // Create strategy with all required parameters present
          const parameters: Record<string, ParameterValue> = {};
          for (const param of uniqueParams) {
            parameters[param.name] = param.defaultValue;
          }

          const strategy: Strategy = {
            strategyId,
            tenantId,
            name: 'Test Strategy',
            templateId: template.templateId,
            templateVersion: template.version,
            parameters,
            currentVersion: 1,
            state: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const result = validateStrategy(strategy, template);

          return result.valid && result.errors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});
