import {
  ParameterDefinition,
  ParameterValue,
  HardBounds,
  StrategyTemplate,
} from '../types/template';
import { Strategy } from '../types/strategy';
import { DeploymentConfig, DeploymentMode } from '../types/deployment';
import { ValidationResult, ValidationError } from '../types/validation';

/**
 * Creates a successful validation result
 */
const validResult = (): ValidationResult => ({ valid: true, errors: [] });

/**
 * Creates a failed validation result with errors
 */
const invalidResult = (errors: ValidationError[]): ValidationResult => ({
  valid: false,
  errors,
});

/**
 * Creates a validation error
 */
const createError = (field: string, code: string, message: string): ValidationError => ({
  field,
  code,
  message,
});

/**
 * Validates a parameter value against hard bounds constraints
 * Requirements: 2.2, 2.3
 */
export function validateHardBounds(
  value: ParameterValue,
  bounds: HardBounds,
  fieldName: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value === 'number') {
    if (bounds.min !== undefined && value < bounds.min) {
      errors.push(
        createError(
          fieldName,
          'BELOW_MIN',
          `Value ${value} is below minimum bound ${bounds.min}`
        )
      );
    }
    if (bounds.max !== undefined && value > bounds.max) {
      errors.push(
        createError(
          fieldName,
          'ABOVE_MAX',
          `Value ${value} is above maximum bound ${bounds.max}`
        )
      );
    }
  }

  if (typeof value === 'string' && bounds.pattern) {
    try {
      const regex = new RegExp(bounds.pattern);
      if (!regex.test(value)) {
        errors.push(
          createError(
            fieldName,
            'PATTERN_MISMATCH',
            `Value "${value}" does not match pattern ${bounds.pattern}`
          )
        );
      }
    } catch {
      errors.push(
        createError(
          fieldName,
          'INVALID_PATTERN',
          `Invalid regex pattern: ${bounds.pattern}`
        )
      );
    }
  }

  return errors;
}


/**
 * Validates a parameter value against its definition
 * Requirements: 2.2, 2.3, 6.1, 6.2
 */
export function validateParameter(
  value: ParameterValue | undefined,
  definition: ParameterDefinition
): ValidationResult {
  const errors: ValidationError[] = [];
  const fieldName = definition.name;

  // Check if required parameter is missing
  if (value === undefined || value === null) {
    if (definition.required) {
      errors.push(
        createError(fieldName, 'REQUIRED', `Required parameter "${fieldName}" is missing`)
      );
    }
    return errors.length > 0 ? invalidResult(errors) : validResult();
  }

  // Validate data type
  const actualType = typeof value;
  let expectedType: string;

  switch (definition.dataType) {
    case 'number':
      expectedType = 'number';
      if (actualType !== 'number' || Number.isNaN(value)) {
        errors.push(
          createError(
            fieldName,
            'TYPE_MISMATCH',
            `Parameter "${fieldName}" expected type number but got ${actualType}`
          )
        );
      }
      break;
    case 'string':
      expectedType = 'string';
      if (actualType !== 'string') {
        errors.push(
          createError(
            fieldName,
            'TYPE_MISMATCH',
            `Parameter "${fieldName}" expected type string but got ${actualType}`
          )
        );
      }
      break;
    case 'boolean':
      expectedType = 'boolean';
      if (actualType !== 'boolean') {
        errors.push(
          createError(
            fieldName,
            'TYPE_MISMATCH',
            `Parameter "${fieldName}" expected type boolean but got ${actualType}`
          )
        );
      }
      break;
    case 'enum':
      expectedType = 'string';
      if (actualType !== 'string') {
        errors.push(
          createError(
            fieldName,
            'TYPE_MISMATCH',
            `Parameter "${fieldName}" expected type string (enum) but got ${actualType}`
          )
        );
      } else if (definition.enumValues && !definition.enumValues.includes(value as string)) {
        errors.push(
          createError(
            fieldName,
            'INVALID_ENUM',
            `Parameter "${fieldName}" value "${value}" is not in allowed values: ${definition.enumValues.join(', ')}`
          )
        );
      }
      break;
  }

  // Validate hard bounds if present and type is correct
  if (errors.length === 0 && definition.hardBounds) {
    const boundsErrors = validateHardBounds(value, definition.hardBounds, fieldName);
    errors.push(...boundsErrors);
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
}


/**
 * Validates logical consistency of parameter combinations
 * Requirements: 6.5
 */
export function validateParameterCombinations(
  parameters: Record<string, ParameterValue>,
  template: StrategyTemplate
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check for stop-loss / entry price consistency for long positions
  const stopLoss = parameters['stopLoss'] as number | undefined;
  const entryPrice = parameters['entryPrice'] as number | undefined;
  const positionType = parameters['positionType'] as string | undefined;

  if (stopLoss !== undefined && entryPrice !== undefined && positionType !== undefined) {
    if (positionType === 'LONG' && stopLoss >= entryPrice) {
      errors.push(
        createError(
          'stopLoss',
          'INVALID_COMBINATION',
          `Stop-loss (${stopLoss}) must be below entry price (${entryPrice}) for long positions`
        )
      );
    }
    if (positionType === 'SHORT' && stopLoss <= entryPrice) {
      errors.push(
        createError(
          'stopLoss',
          'INVALID_COMBINATION',
          `Stop-loss (${stopLoss}) must be above entry price (${entryPrice}) for short positions`
        )
      );
    }
  }

  // Check for take-profit / entry price consistency
  const takeProfit = parameters['takeProfit'] as number | undefined;

  if (takeProfit !== undefined && entryPrice !== undefined && positionType !== undefined) {
    if (positionType === 'LONG' && takeProfit <= entryPrice) {
      errors.push(
        createError(
          'takeProfit',
          'INVALID_COMBINATION',
          `Take-profit (${takeProfit}) must be above entry price (${entryPrice}) for long positions`
        )
      );
    }
    if (positionType === 'SHORT' && takeProfit >= entryPrice) {
      errors.push(
        createError(
          'takeProfit',
          'INVALID_COMBINATION',
          `Take-profit (${takeProfit}) must be below entry price (${entryPrice}) for short positions`
        )
      );
    }
  }

  // Check min/max position size consistency
  const minPositionSize = parameters['minPositionSize'] as number | undefined;
  const maxPositionSize = parameters['maxPositionSize'] as number | undefined;

  if (minPositionSize !== undefined && maxPositionSize !== undefined) {
    if (minPositionSize > maxPositionSize) {
      errors.push(
        createError(
          'minPositionSize',
          'INVALID_COMBINATION',
          `Minimum position size (${minPositionSize}) cannot exceed maximum position size (${maxPositionSize})`
        )
      );
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
}

/**
 * Validates a complete strategy against its template
 * Requirements: 6.1, 6.2, 6.5
 */
export function validateStrategy(
  strategy: Strategy,
  template: StrategyTemplate
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate each parameter against its definition
  for (const paramDef of template.parameters) {
    const value = strategy.parameters[paramDef.name];
    const result = validateParameter(value, paramDef);
    if (!result.valid) {
      errors.push(...result.errors);
    }
  }

  // Check for unknown parameters (not defined in template)
  const definedParams = new Set(template.parameters.map(p => p.name));
  for (const paramName of Object.keys(strategy.parameters)) {
    if (!definedParams.has(paramName)) {
      errors.push(
        createError(
          paramName,
          'UNKNOWN_PARAMETER',
          `Parameter "${paramName}" is not defined in template`
        )
      );
    }
  }

  // Validate parameter combinations
  const combinationResult = validateParameterCombinations(strategy.parameters, template);
  if (!combinationResult.valid) {
    errors.push(...combinationResult.errors);
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
}


/**
 * Risk control parameters required for LIVE deployment
 */
interface RiskControls {
  maxPositionSize?: number;
  maxDailyLoss?: number;
  maxDrawdown?: number;
}

/**
 * Validates deployment configuration based on mode
 * Requirements: 4.1, 4.2, 4.4
 */
export function validateDeployment(
  config: DeploymentConfig,
  strategy: Strategy,
  riskControls?: RiskControls
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate mode is specified
  if (!config.mode) {
    errors.push(
      createError('mode', 'REQUIRED', 'Deployment mode is required')
    );
    return invalidResult(errors);
  }

  // Validate mode is valid
  const validModes: DeploymentMode[] = ['BACKTEST', 'PAPER', 'LIVE'];
  if (!validModes.includes(config.mode)) {
    errors.push(
      createError(
        'mode',
        'INVALID_MODE',
        `Invalid deployment mode "${config.mode}". Must be one of: ${validModes.join(', ')}`
      )
    );
    return invalidResult(errors);
  }

  // BACKTEST mode requires date range
  if (config.mode === 'BACKTEST') {
    if (!config.backtestConfig) {
      errors.push(
        createError(
          'backtestConfig',
          'REQUIRED',
          'Backtest configuration is required for BACKTEST mode'
        )
      );
    } else {
      if (!config.backtestConfig.startDate) {
        errors.push(
          createError(
            'backtestConfig.startDate',
            'REQUIRED',
            'Start date is required for backtest'
          )
        );
      }
      if (!config.backtestConfig.endDate) {
        errors.push(
          createError(
            'backtestConfig.endDate',
            'REQUIRED',
            'End date is required for backtest'
          )
        );
      }
      if (config.backtestConfig.startDate && config.backtestConfig.endDate) {
        const start = new Date(config.backtestConfig.startDate);
        const end = new Date(config.backtestConfig.endDate);
        if (start >= end) {
          errors.push(
            createError(
              'backtestConfig.endDate',
              'INVALID_DATE_RANGE',
              'End date must be after start date'
            )
          );
        }
      }
      if (config.backtestConfig.initialCapital !== undefined && 
          config.backtestConfig.initialCapital <= 0) {
        errors.push(
          createError(
            'backtestConfig.initialCapital',
            'INVALID_VALUE',
            'Initial capital must be positive'
          )
        );
      }
    }
  }

  // LIVE mode requires risk controls
  if (config.mode === 'LIVE') {
    if (!riskControls) {
      errors.push(
        createError(
          'riskControls',
          'REQUIRED',
          'Risk controls are required for LIVE deployment'
        )
      );
    } else {
      if (riskControls.maxPositionSize === undefined) {
        errors.push(
          createError(
            'riskControls.maxPositionSize',
            'REQUIRED',
            'Maximum position size is required for LIVE deployment'
          )
        );
      }
      if (riskControls.maxDailyLoss === undefined) {
        errors.push(
          createError(
            'riskControls.maxDailyLoss',
            'REQUIRED',
            'Maximum daily loss is required for LIVE deployment'
          )
        );
      }
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
}
