import * as fc from 'fast-check';
import { 
  StrategyTemplate, 
  ParameterDefinition, 
  HardBounds, 
  ParameterValue 
} from '../types/template';
import { Strategy, StrategyState, StrategyVersion } from '../types/strategy';
import {
  Deployment,
  DeploymentConfig,
  DeploymentMode,
  DeploymentState,
  BacktestConfig
} from '../types/deployment';

/**
 * Generator for HardBounds
 */
export const hardBoundsArb = (): fc.Arbitrary<HardBounds> =>
  fc.record({
    min: fc.option(fc.integer({ min: -1000000, max: 1000000 }), { nil: undefined }),
    max: fc.option(fc.integer({ min: -1000000, max: 1000000 }), { nil: undefined }),
    pattern: fc.option(fc.constant('^[a-zA-Z0-9]+$'), { nil: undefined })
  }).filter(bounds => {
    // Ensure min <= max when both are defined
    if (bounds.min !== undefined && bounds.max !== undefined) {
      return bounds.min <= bounds.max;
    }
    return true;
  });

/**
 * Generator for ParameterValue based on dataType
 */
export const parameterValueArb = (dataType: 'number' | 'string' | 'boolean' | 'enum', enumValues?: string[]): fc.Arbitrary<ParameterValue> => {
  switch (dataType) {
    case 'number':
      return fc.double({ min: -1000000, max: 1000000, noNaN: true });
    case 'string':
      return fc.string({ minLength: 1, maxLength: 50 });
    case 'boolean':
      return fc.boolean();
    case 'enum':
      return enumValues && enumValues.length > 0 
        ? fc.constantFrom(...enumValues)
        : fc.string({ minLength: 1, maxLength: 20 });
  }
};

/**
 * Generator for ParameterDefinition
 */
export const parameterDefinitionArb = (): fc.Arbitrary<ParameterDefinition> =>
  fc.oneof(
    // Number parameter
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      dataType: fc.constant('number' as const),
      defaultValue: fc.double({ min: -1000000, max: 1000000, noNaN: true }),
      hardBounds: fc.option(hardBoundsArb(), { nil: undefined }),
      required: fc.boolean(),
      description: fc.string({ minLength: 1, maxLength: 200 }),
      enumValues: fc.constant(undefined)
    }),
    // String parameter
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      dataType: fc.constant('string' as const),
      defaultValue: fc.string({ minLength: 0, maxLength: 50 }),
      hardBounds: fc.option(hardBoundsArb(), { nil: undefined }),
      required: fc.boolean(),
      description: fc.string({ minLength: 1, maxLength: 200 }),
      enumValues: fc.constant(undefined)
    }),
    // Boolean parameter
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      dataType: fc.constant('boolean' as const),
      defaultValue: fc.boolean(),
      hardBounds: fc.constant(undefined),
      required: fc.boolean(),
      description: fc.string({ minLength: 1, maxLength: 200 }),
      enumValues: fc.constant(undefined)
    }),
    // Enum parameter
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }).chain(enumVals =>
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
        dataType: fc.constant('enum' as const),
        defaultValue: fc.constantFrom(...enumVals),
        hardBounds: fc.constant(undefined),
        required: fc.boolean(),
        description: fc.string({ minLength: 1, maxLength: 200 }),
        enumValues: fc.constant(enumVals)
      })
    )
  );

/**
 * Generator for ISO date strings
 */
export const isoDateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Generator for StrategyTemplate with unique parameter names
 */
export const strategyTemplateArb = (): fc.Arbitrary<StrategyTemplate> =>
  fc.record({
    templateId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    version: fc.integer({ min: 1, max: 1000 }),
    parameters: fc.array(parameterDefinitionArb(), { minLength: 0, maxLength: 10 }),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  }).map(template => {
    // Ensure unique parameter names by deduplicating
    const seenNames = new Set<string>();
    const uniqueParams = template.parameters.filter(param => {
      if (seenNames.has(param.name)) {
        return false;
      }
      seenNames.add(param.name);
      return true;
    });
    return { ...template, parameters: uniqueParams };
  });


/**
 * Generator for StrategyState
 */
export const strategyStateArb = (): fc.Arbitrary<StrategyState> =>
  fc.constantFrom('DRAFT', 'ACTIVE', 'PAUSED', 'STOPPED', 'ERROR');

/**
 * Generator for parameter values (mixed types)
 */
export const mixedParameterValueArb = (): fc.Arbitrary<ParameterValue> =>
  fc.oneof(
    fc.double({ min: -1000000, max: 1000000, noNaN: true }),
    fc.string({ minLength: 0, maxLength: 100 }),
    fc.boolean()
  );

/**
 * Generator for parameter records
 */
export const parametersRecordArb = (): fc.Arbitrary<Record<string, ParameterValue>> =>
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
    mixedParameterValueArb(),
    { minKeys: 0, maxKeys: 10 }
  );

/**
 * Generator for Strategy
 */
export const strategyArb = (): fc.Arbitrary<Strategy> =>
  fc.record({
    strategyId: fc.uuid(),
    tenantId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    templateId: fc.uuid(),
    templateVersion: fc.integer({ min: 1, max: 1000 }),
    parameters: parametersRecordArb(),
    currentVersion: fc.integer({ min: 1, max: 1000 }),
    state: strategyStateArb(),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });


/**
 * Generator for StrategyVersion
 */
export const strategyVersionArb = (): fc.Arbitrary<StrategyVersion> =>
  fc.record({
    strategyId: fc.uuid(),
    version: fc.integer({ min: 1, max: 1000 }),
    parameters: parametersRecordArb(),
    createdAt: isoDateStringArb(),
    createdBy: fc.uuid(),
    changeDescription: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined })
  });

/**
 * Generator for DeploymentMode
 */
export const deploymentModeArb = (): fc.Arbitrary<DeploymentMode> =>
  fc.constantFrom('BACKTEST', 'PAPER', 'LIVE');

/**
 * Generator for DeploymentState
 */
export const deploymentStateArb = (): fc.Arbitrary<DeploymentState> =>
  fc.constantFrom('PENDING', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'ERROR');

/**
 * Generator for valid date range (start < end)
 */
export const validDateRangeArb = (): fc.Arbitrary<{ startDate: string; endDate: string }> =>
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

/**
 * Generator for BacktestConfig
 */
export const backtestConfigArb = (): fc.Arbitrary<BacktestConfig> =>
  validDateRangeArb().chain(dateRange =>
    fc.record({
      startDate: fc.constant(dateRange.startDate),
      endDate: fc.constant(dateRange.endDate),
      initialCapital: fc.double({ min: 1000, max: 10000000, noNaN: true })
    })
  );

/**
 * Generator for DeploymentConfig
 */
export const deploymentConfigArb = (): fc.Arbitrary<DeploymentConfig> =>
  fc.oneof(
    // BACKTEST mode with required backtestConfig
    fc.record({
      strategyId: fc.uuid(),
      mode: fc.constant('BACKTEST' as DeploymentMode),
      backtestConfig: backtestConfigArb()
    }),
    // PAPER mode without backtestConfig
    fc.record({
      strategyId: fc.uuid(),
      mode: fc.constant('PAPER' as DeploymentMode),
      backtestConfig: fc.constant(undefined)
    }),
    // LIVE mode without backtestConfig
    fc.record({
      strategyId: fc.uuid(),
      mode: fc.constant('LIVE' as DeploymentMode),
      backtestConfig: fc.constant(undefined)
    })
  );

/**
 * Generator for Deployment
 */
export const deploymentArb = (): fc.Arbitrary<Deployment> =>
  deploymentConfigArb().chain(config =>
    fc.record({
      deploymentId: fc.uuid(),
      strategyId: fc.constant(config.strategyId),
      tenantId: fc.uuid(),
      mode: fc.constant(config.mode),
      state: deploymentStateArb(),
      strategyVersion: fc.integer({ min: 1, max: 1000 }),
      config: fc.constant(config),
      createdAt: isoDateStringArb(),
      updatedAt: isoDateStringArb()
    })
  );

/**
 * Generator for risk controls (required for LIVE deployment)
 */
export const riskControlsArb = (): fc.Arbitrary<{
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdown?: number;
}> =>
  fc.record({
    maxPositionSize: fc.double({ min: 0.01, max: 1000000, noNaN: true }),
    maxDailyLoss: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    maxDrawdown: fc.option(fc.double({ min: 0.01, max: 100, noNaN: true }), { nil: undefined })
  });

/**
 * Generator for Strategy that matches a given Template
 * Creates a strategy with parameters initialized from template defaults
 */
export const strategyFromTemplateArb = (template: StrategyTemplate): fc.Arbitrary<Strategy> => {
  const parameters: Record<string, ParameterValue> = {};
  for (const paramDef of template.parameters) {
    parameters[paramDef.name] = paramDef.defaultValue;
  }
  
  return fc.record({
    strategyId: fc.uuid(),
    tenantId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    templateId: fc.constant(template.templateId),
    templateVersion: fc.constant(template.version),
    parameters: fc.constant(parameters),
    currentVersion: fc.integer({ min: 1, max: 1000 }),
    state: strategyStateArb(),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });
};

/**
 * Generator for a Template and matching Strategy pair
 */
export const templateAndStrategyArb = (): fc.Arbitrary<{ template: StrategyTemplate; strategy: Strategy }> =>
  strategyTemplateArb().chain(template =>
    strategyFromTemplateArb(template).map(strategy => ({
      template,
      strategy
    }))
  );

/**
 * Generator for valid parameter value that respects bounds
 */
export const validParameterValueArb = (paramDef: ParameterDefinition): fc.Arbitrary<ParameterValue> => {
  switch (paramDef.dataType) {
    case 'number':
      if (paramDef.hardBounds) {
        const min = paramDef.hardBounds.min ?? -1000000;
        const max = paramDef.hardBounds.max ?? 1000000;
        return fc.double({ min, max, noNaN: true });
      }
      return fc.double({ min: -1000000, max: 1000000, noNaN: true });
    case 'string':
      return fc.string({ minLength: 1, maxLength: 50 });
    case 'boolean':
      return fc.boolean();
    case 'enum':
      return paramDef.enumValues && paramDef.enumValues.length > 0
        ? fc.constantFrom(...paramDef.enumValues)
        : fc.string({ minLength: 1, maxLength: 20 });
  }
};

/**
 * Generator for invalid parameter value (outside bounds or wrong type)
 */
export const invalidParameterValueArb = (paramDef: ParameterDefinition): fc.Arbitrary<ParameterValue> => {
  if (paramDef.dataType === 'number' && paramDef.hardBounds) {
    const bounds = paramDef.hardBounds;
    return fc.oneof(
      // Below min
      bounds.min !== undefined
        ? fc.double({ min: bounds.min - 10000, max: bounds.min - 0.01, noNaN: true })
        : fc.constant(Number.MIN_SAFE_INTEGER),
      // Above max
      bounds.max !== undefined
        ? fc.double({ min: bounds.max + 0.01, max: bounds.max + 10000, noNaN: true })
        : fc.constant(Number.MAX_SAFE_INTEGER)
    );
  }
  // Return wrong type
  if (paramDef.dataType === 'number') {
    return fc.string({ minLength: 1, maxLength: 20 });
  }
  if (paramDef.dataType === 'string') {
    return fc.double({ min: -1000, max: 1000, noNaN: true });
  }
  if (paramDef.dataType === 'boolean') {
    return fc.string({ minLength: 1, maxLength: 20 });
  }
  // For enum, return a value not in the enum list
  return fc.string({ minLength: 21, maxLength: 30 });
};


/**
 * Market Data Ingestion Generators
 * Requirements: N/A (testing infrastructure)
 */

import {
  DataSource,
  DataSourceType,
  DataSourceStatus,
  AuthMethod,
  RateLimitConfig
} from '../types/data-source';
import { RegisterDataSourceInput } from '../services/data-source';

/**
 * Generator for DataSourceType
 */
export const dataSourceTypeArb = (): fc.Arbitrary<DataSourceType> =>
  fc.constantFrom('PRICE', 'NEWS', 'SENTIMENT', 'ON_CHAIN');

/**
 * Generator for DataSourceStatus
 */
export const dataSourceStatusArb = (): fc.Arbitrary<DataSourceStatus> =>
  fc.constantFrom('ACTIVE', 'INACTIVE', 'RATE_LIMITED', 'ERROR');

/**
 * Generator for AuthMethod
 */
export const authMethodArb = (): fc.Arbitrary<AuthMethod> =>
  fc.constantFrom('API_KEY', 'OAUTH', 'HMAC');

/**
 * Generator for RateLimitConfig
 */
export const rateLimitConfigArb = (): fc.Arbitrary<RateLimitConfig> =>
  fc.record({
    requestsPerSecond: fc.integer({ min: 1, max: 100 }),
    requestsPerMinute: fc.integer({ min: 10, max: 6000 }),
    requestsPerDay: fc.integer({ min: 1000, max: 1000000 })
  }).filter(config => 
    config.requestsPerSecond * 60 <= config.requestsPerMinute &&
    config.requestsPerMinute * 60 * 24 <= config.requestsPerDay
  );

/**
 * Generator for supported symbols array
 */
export const supportedSymbolsArb = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.stringOf(fc.constantFrom('B', 'T', 'C', 'E', 'H', 'U', 'S', 'D'), { minLength: 3, maxLength: 10 }),
    { minLength: 1, maxLength: 20 }
  ).map(symbols => [...new Set(symbols)]); // Ensure unique symbols

/**
 * Generator for API endpoint URLs
 */
export const apiEndpointArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('https://api.', 'https://data.', 'https://feed.'),
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'), { minLength: 3, maxLength: 15 }),
    fc.constantFrom('.com', '.io', '.net', '.org')
  ).map(([prefix, domain, suffix]) => `${prefix}${domain}${suffix}/v1`);

/**
 * Generator for RegisterDataSourceInput
 */
export const registerDataSourceInputArb = (): fc.Arbitrary<RegisterDataSourceInput> =>
  fc.record({
    type: dataSourceTypeArb(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    apiEndpoint: apiEndpointArb(),
    authMethod: authMethodArb(),
    supportedSymbols: supportedSymbolsArb(),
    rateLimits: rateLimitConfigArb(),
    priority: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
    costPerRequest: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined })
  });

/**
 * Generator for DataSource
 */
export const dataSourceArb = (): fc.Arbitrary<DataSource> =>
  fc.record({
    sourceId: fc.uuid(),
    type: dataSourceTypeArb(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    apiEndpoint: apiEndpointArb(),
    authMethod: authMethodArb(),
    supportedSymbols: supportedSymbolsArb(),
    rateLimits: rateLimitConfigArb(),
    status: dataSourceStatusArb(),
    priority: fc.integer({ min: 1, max: 1000 }),
    costPerRequest: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });
