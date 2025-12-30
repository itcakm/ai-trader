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


/**
 * News Data Generators
 * Requirements: 3.2, 3.3, 3.6
 */

import { NewsEvent, NewsCategory } from '../types/news';
import { RawNewsInput } from '../services/news-processor';

/**
 * Generator for NewsCategory
 */
export const newsCategoryArb = (): fc.Arbitrary<NewsCategory> =>
  fc.constantFrom('REGULATORY', 'TECHNICAL', 'MARKET', 'PARTNERSHIP', 'GENERAL');

/**
 * Generator for crypto symbols
 */
export const cryptoSymbolArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'AVAX', 'LINK', 'MATIC');

/**
 * Generator for news source names
 */
export const newsSourceArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('Reuters', 'CoinDesk', 'CryptoNews', 'Bloomberg', 'CNBC');

/**
 * Generator for news titles
 */
export const newsTitleArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('Breaking:', 'Update:', 'Analysis:', 'Report:', ''),
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' '), { minLength: 10, maxLength: 100 })
  ).map(([prefix, text]) => `${prefix} ${text}`.trim());

/**
 * Generator for news content
 */
export const newsContentArb = (): fc.Arbitrary<string> =>
  fc.stringOf(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' ', '.', ','),
    { minLength: 50, maxLength: 500 }
  );

/**
 * Generator for source URLs
 */
export const sourceUrlArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('https://www.reuters.com/', 'https://www.coindesk.com/', 'https://cryptonews.com/'),
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'), { minLength: 5, maxLength: 20 })
  ).map(([base, path]) => `${base}news/${path}`);

/**
 * Generator for RawNewsInput
 */
export const rawNewsInputArb = (): fc.Arbitrary<RawNewsInput> =>
  fc.record({
    title: newsTitleArb(),
    content: newsContentArb(),
    summary: fc.option(fc.string({ minLength: 20, maxLength: 200 }), { nil: undefined }),
    source: newsSourceArb(),
    sourceUrl: sourceUrlArb(),
    publishedAt: isoDateStringArb(),
    rawSymbols: fc.option(fc.array(cryptoSymbolArb(), { minLength: 0, maxLength: 5 }), { nil: undefined }),
    rawCategory: fc.option(fc.constantFrom('REGULATORY', 'TECHNICAL', 'MARKET', 'PARTNERSHIP', 'GENERAL', 'regulation', 'market', 'tech'), { nil: undefined }),
    rawSentiment: fc.option(fc.double({ min: -1, max: 1, noNaN: true }), { nil: undefined })
  });

/**
 * Generator for NewsEvent
 */
export const newsEventArb = (): fc.Arbitrary<NewsEvent> =>
  fc.record({
    eventId: fc.uuid(),
    title: newsTitleArb(),
    content: newsContentArb(),
    summary: fc.option(fc.string({ minLength: 20, maxLength: 200 }), { nil: undefined }),
    source: newsSourceArb(),
    sourceUrl: sourceUrlArb(),
    publishedAt: isoDateStringArb(),
    ingestedAt: isoDateStringArb(),
    symbols: fc.array(cryptoSymbolArb(), { minLength: 0, maxLength: 5 }),
    category: newsCategoryArb(),
    relevanceScore: fc.double({ min: 0, max: 1, noNaN: true }),
    sentiment: fc.option(fc.double({ min: -1, max: 1, noNaN: true }), { nil: undefined }),
    contentHash: fc.hexaString({ minLength: 64, maxLength: 64 }),
    qualityScore: fc.double({ min: 0, max: 1, noNaN: true })
  });


/**
 * Sentiment Data Generators
 * Requirements: 4.2, 4.3, 4.4
 */

import { SentimentData, SentimentSource, SentimentPlatform } from '../types/sentiment';
import { RawSentimentInput, RawSourceInput } from '../services/sentiment-normalizer';

/**
 * Generator for SentimentPlatform
 */
export const sentimentPlatformArb = (): fc.Arbitrary<SentimentPlatform> =>
  fc.constantFrom('TWITTER', 'REDDIT', 'TELEGRAM', 'DISCORD', 'NEWS');

/**
 * Generator for SentimentSource
 */
export const sentimentSourceArb = (): fc.Arbitrary<SentimentSource> =>
  fc.record({
    platform: sentimentPlatformArb(),
    score: fc.double({ min: -1, max: 1, noNaN: true }),
    volume: fc.integer({ min: 0, max: 1000000 }),
    weight: fc.double({ min: 0, max: 1, noNaN: true })
  });

/**
 * Generator for RawSourceInput
 */
export const rawSourceInputArb = (): fc.Arbitrary<RawSourceInput> =>
  fc.record({
    platform: fc.constantFrom('TWITTER', 'REDDIT', 'TELEGRAM', 'DISCORD', 'NEWS', 'X', 'ARTICLES'),
    score: fc.double({ min: -100, max: 100, noNaN: true }),
    volume: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
    weight: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined })
  });

/**
 * Generator for RawSentimentInput with valid data
 */
export const rawSentimentInputArb = (): fc.Arbitrary<RawSentimentInput> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    timestamp: fc.option(isoDateStringArb(), { nil: undefined }),
    score: fc.double({ min: -100, max: 100, noNaN: true }),
    scoreMin: fc.option(fc.double({ min: -100, max: 0, noNaN: true }), { nil: undefined }),
    scoreMax: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
    mentionVolume: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
    changeRate24h: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
    sources: fc.option(fc.array(rawSourceInputArb(), { minLength: 0, maxLength: 5 }), { nil: undefined }),
    sourceId: fc.uuid()
  });

/**
 * Generator for RawSentimentInput with 0-100 scale scores
 */
export const rawSentimentInput0To100Arb = (): fc.Arbitrary<RawSentimentInput> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    timestamp: fc.option(isoDateStringArb(), { nil: undefined }),
    score: fc.double({ min: 0, max: 100, noNaN: true }),
    scoreMin: fc.constant(0),
    scoreMax: fc.constant(100),
    mentionVolume: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
    changeRate24h: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
    sources: fc.option(fc.array(rawSourceInputArb(), { minLength: 0, maxLength: 5 }), { nil: undefined }),
    sourceId: fc.uuid()
  });

/**
 * Generator for RawSentimentInput with -1 to +1 scale scores
 */
export const rawSentimentInputNormalizedArb = (): fc.Arbitrary<RawSentimentInput> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    timestamp: fc.option(isoDateStringArb(), { nil: undefined }),
    score: fc.double({ min: -1, max: 1, noNaN: true }),
    scoreMin: fc.constant(-1),
    scoreMax: fc.constant(1),
    mentionVolume: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
    changeRate24h: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
    sources: fc.option(fc.array(rawSourceInputArb(), { minLength: 0, maxLength: 5 }), { nil: undefined }),
    sourceId: fc.uuid()
  });

/**
 * Generator for SentimentData
 */
export const sentimentDataArb = (): fc.Arbitrary<SentimentData> =>
  fc.record({
    sentimentId: fc.uuid(),
    symbol: cryptoSymbolArb(),
    timestamp: isoDateStringArb(),
    overallScore: fc.double({ min: -1, max: 1, noNaN: true }),
    mentionVolume: fc.integer({ min: 0, max: 1000000 }),
    changeRate24h: fc.double({ min: -100, max: 100, noNaN: true }),
    sources: fc.array(sentimentSourceArb(), { minLength: 0, maxLength: 5 }),
    aggregatedFrom: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
    qualityScore: fc.double({ min: 0, max: 1, noNaN: true })
  });

/**
 * Generator for SentimentData with normalized weights (sum to 1)
 */
export const sentimentDataWithNormalizedWeightsArb = (): fc.Arbitrary<SentimentData> =>
  fc.array(
    fc.record({
      platform: sentimentPlatformArb(),
      score: fc.double({ min: -1, max: 1, noNaN: true }),
      volume: fc.integer({ min: 0, max: 1000000 }),
      rawWeight: fc.double({ min: 0.1, max: 1, noNaN: true })
    }),
    { minLength: 1, maxLength: 5 }
  ).chain(rawSources => {
    // Normalize weights to sum to 1
    const totalWeight = rawSources.reduce((sum, s) => sum + s.rawWeight, 0);
    const sources: SentimentSource[] = rawSources.map(s => ({
      platform: s.platform,
      score: s.score,
      volume: s.volume,
      weight: s.rawWeight / totalWeight
    }));

    return fc.record({
      sentimentId: fc.uuid(),
      symbol: cryptoSymbolArb(),
      timestamp: isoDateStringArb(),
      overallScore: fc.double({ min: -1, max: 1, noNaN: true }),
      mentionVolume: fc.integer({ min: 0, max: 1000000 }),
      changeRate24h: fc.double({ min: -100, max: 100, noNaN: true }),
      sources: fc.constant(sources),
      aggregatedFrom: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
      qualityScore: fc.double({ min: 0, max: 1, noNaN: true })
    });
  });


/**
 * On-Chain Data Generators
 * Requirements: 5.2, 5.3, 5.4
 */

import { OnChainMetric, OnChainMetricType } from '../types/on-chain';
import { RawOnChainInput } from '../services/onchain-normalizer';

/**
 * Generator for OnChainMetricType
 */
export const onChainMetricTypeArb = (): fc.Arbitrary<OnChainMetricType> =>
  fc.constantFrom(
    'ACTIVE_ADDRESSES',
    'TRANSACTION_VOLUME',
    'EXCHANGE_INFLOW',
    'EXCHANGE_OUTFLOW',
    'WHALE_TRANSACTIONS',
    'NVT_RATIO',
    'MVRV_RATIO'
  );

/**
 * Generator for network names
 */
export const networkArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'bitcoin',
    'ethereum',
    'solana',
    'cardano',
    'polkadot',
    'avalanche',
    'polygon',
    'arbitrum',
    'optimism'
  );

/**
 * Generator for metric type aliases (various formats)
 */
export const metricTypeAliasArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    // Standard
    'ACTIVE_ADDRESSES', 'TRANSACTION_VOLUME', 'EXCHANGE_INFLOW', 'EXCHANGE_OUTFLOW',
    'WHALE_TRANSACTIONS', 'NVT_RATIO', 'MVRV_RATIO',
    // Snake case
    'active_addresses', 'transaction_volume', 'exchange_inflow', 'exchange_outflow',
    'whale_transactions', 'nvt_ratio', 'mvrv_ratio',
    // Camel case
    'activeAddresses', 'transactionVolume', 'exchangeInflow', 'exchangeOutflow',
    'whaleTransactions', 'nvtRatio', 'mvrvRatio',
    // Abbreviations
    'tx_volume', 'txVolume', 'active_addr', 'activeAddr', 'whale_tx', 'whaleTx'
  );

/**
 * Generator for on-chain metric values based on metric type
 */
export const onChainValueArb = (metricType?: OnChainMetricType): fc.Arbitrary<number> => {
  if (!metricType) {
    return fc.double({ min: 0, max: 1000000000, noNaN: true });
  }

  switch (metricType) {
    case 'ACTIVE_ADDRESSES':
      return fc.integer({ min: 0, max: 10000000 });
    case 'TRANSACTION_VOLUME':
      return fc.double({ min: 0, max: 1000000000000, noNaN: true });
    case 'EXCHANGE_INFLOW':
    case 'EXCHANGE_OUTFLOW':
      return fc.double({ min: 0, max: 1000000000, noNaN: true });
    case 'WHALE_TRANSACTIONS':
      return fc.integer({ min: 0, max: 10000 });
    case 'NVT_RATIO':
      return fc.double({ min: 0, max: 1000, noNaN: true });
    case 'MVRV_RATIO':
      return fc.double({ min: 0, max: 10, noNaN: true });
    default:
      return fc.double({ min: 0, max: 1000000000, noNaN: true });
  }
};

/**
 * Generator for RawOnChainInput with valid data
 */
export const rawOnChainInputArb = (): fc.Arbitrary<RawOnChainInput> =>
  onChainMetricTypeArb().chain(metricType =>
    fc.record({
      symbol: cryptoSymbolArb(),
      network: fc.option(networkArb(), { nil: undefined }),
      metricType: fc.constant(metricType as string),
      value: onChainValueArb(metricType),
      timestamp: fc.option(isoDateStringArb(), { nil: undefined }),
      change24h: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
      change7d: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
      movingAverage7d: fc.option(fc.double({ min: 0, max: 1000000000, noNaN: true }), { nil: undefined }),
      sourceId: fc.uuid()
    })
  );

/**
 * Generator for RawOnChainInput with metric type aliases
 */
export const rawOnChainInputWithAliasArb = (): fc.Arbitrary<RawOnChainInput> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    network: fc.option(networkArb(), { nil: undefined }),
    metricType: metricTypeAliasArb(),
    value: fc.double({ min: 0, max: 1000000000, noNaN: true }),
    timestamp: fc.option(isoDateStringArb(), { nil: undefined }),
    change24h: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
    change7d: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
    movingAverage7d: fc.option(fc.double({ min: 0, max: 1000000000, noNaN: true }), { nil: undefined }),
    sourceId: fc.uuid()
  });

/**
 * Generator for OnChainMetric
 */
export const onChainMetricArb = (): fc.Arbitrary<OnChainMetric> =>
  onChainMetricTypeArb().chain(metricType =>
    fc.record({
      metricId: fc.uuid(),
      symbol: cryptoSymbolArb(),
      network: networkArb(),
      metricType: fc.constant(metricType),
      value: onChainValueArb(metricType),
      timestamp: isoDateStringArb(),
      change24h: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
      change7d: fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: undefined }),
      movingAverage7d: fc.option(fc.double({ min: 0, max: 1000000000, noNaN: true }), { nil: undefined }),
      sourceId: fc.uuid(),
      qualityScore: fc.double({ min: 0, max: 1, noNaN: true })
    })
  );

/**
 * Generator for OnChainMetric with historical data (for derived metrics testing)
 */
export const onChainMetricWithHistoryArb = (): fc.Arbitrary<{
  current: OnChainMetric;
  history: OnChainMetric[];
}> =>
  onChainMetricTypeArb().chain(metricType =>
    fc.tuple(
      fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
      fc.array(
        onChainValueArb(metricType),
        { minLength: 7, maxLength: 30 }
      )
    ).map(([baseDate, values]) => {
      const history: OnChainMetric[] = values.map((value, index) => {
        const date = new Date(baseDate);
        date.setDate(date.getDate() - (values.length - 1 - index));
        return {
          metricId: `metric-${index}`,
          symbol: 'BTC',
          network: 'bitcoin',
          metricType,
          value,
          timestamp: date.toISOString(),
          sourceId: 'test-source',
          qualityScore: 0.9
        };
      });

      const current = history[history.length - 1];
      return { current, history };
    })
  );


/**
 * Snapshot Data Generators
 * Requirements: 6.1, 6.2, 6.3
 */

import { 
  MarketDataSnapshot, 
  DataCompleteness, 
  SnapshotOptions 
} from '../types/snapshot';
import { NewsContext, NewsContextEvent, DominantSentiment } from '../types/news-context';

/**
 * Generator for DominantSentiment
 */
export const dominantSentimentArb = (): fc.Arbitrary<DominantSentiment> =>
  fc.constantFrom('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED');

/**
 * Generator for NewsContextEvent
 */
export const newsContextEventArb = (): fc.Arbitrary<NewsContextEvent> =>
  fc.record({
    eventId: fc.uuid(),
    title: newsTitleArb(),
    summary: fc.string({ minLength: 20, maxLength: 200 }),
    category: newsCategoryArb(),
    relevanceScore: fc.double({ min: 0, max: 1, noNaN: true }),
    publishedAt: isoDateStringArb(),
    source: newsSourceArb()
  });

/**
 * Generator for NewsContext
 */
export const newsContextArb = (): fc.Arbitrary<NewsContext> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    timeWindow: fc.constantFrom('1h', '6h', '12h', '24h', '48h', '72h'),
    events: fc.array(newsContextEventArb(), { minLength: 0, maxLength: 10 }),
    summary: fc.string({ minLength: 10, maxLength: 200 }),
    dominantSentiment: dominantSentimentArb(),
    eventCount: fc.integer({ min: 0, max: 10 }),
    generatedAt: isoDateStringArb()
  }).map(ctx => ({
    ...ctx,
    eventCount: ctx.events.length
  }));

/**
 * Generator for DataCompleteness
 */
export const dataCompletenessArb = (): fc.Arbitrary<DataCompleteness> =>
  fc.record({
    hasPrices: fc.boolean(),
    hasNews: fc.boolean(),
    hasSentiment: fc.boolean(),
    hasOnChain: fc.boolean()
  }).map(completeness => {
    const missingTypes: ('PRICE' | 'NEWS' | 'SENTIMENT' | 'ON_CHAIN')[] = [];
    if (!completeness.hasPrices) missingTypes.push('PRICE');
    if (!completeness.hasNews) missingTypes.push('NEWS');
    if (!completeness.hasSentiment) missingTypes.push('SENTIMENT');
    if (!completeness.hasOnChain) missingTypes.push('ON_CHAIN');
    return { ...completeness, missingTypes };
  });

/**
 * Generator for SnapshotOptions
 */
export const snapshotOptionsArb = (): fc.Arbitrary<SnapshotOptions> =>
  fc.record({
    includePrices: fc.boolean(),
    includeNews: fc.boolean(),
    includeSentiment: fc.boolean(),
    includeOnChain: fc.boolean(),
    newsTimeWindowHours: fc.integer({ min: 1, max: 168 }),
    maxNewsEvents: fc.integer({ min: 1, max: 50 })
  });

/**
 * Generator for PricePoint
 */
export const pricePointArb = (): fc.Arbitrary<import('../types/price').PricePoint> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    timestamp: isoDateStringArb(),
    open: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    high: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    low: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    close: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    volume: fc.double({ min: 0, max: 1000000000, noNaN: true }),
    quoteVolume: fc.option(fc.double({ min: 0, max: 1000000000, noNaN: true }), { nil: undefined }),
    trades: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
    sourceId: fc.uuid(),
    qualityScore: fc.double({ min: 0, max: 1, noNaN: true })
  }).map(p => ({
    ...p,
    high: Math.max(p.open, p.high, p.low, p.close),
    low: Math.min(p.open, p.high, p.low, p.close)
  }));

/**
 * Generator for MarketDataSnapshot
 */
export const marketDataSnapshotArb = (): fc.Arbitrary<MarketDataSnapshot> =>
  fc.record({
    snapshotId: fc.uuid(),
    symbol: cryptoSymbolArb(),
    timestamp: isoDateStringArb(),
    timeframe: fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
    prices: fc.array(pricePointArb(), { minLength: 0, maxLength: 100 }),
    newsContext: newsContextArb(),
    sentiment: fc.option(sentimentDataArb(), { nil: null }),
    onChainMetrics: fc.array(onChainMetricArb(), { minLength: 0, maxLength: 20 }),
    qualityScore: fc.double({ min: 0, max: 1, noNaN: true }),
    dataCompleteness: dataCompletenessArb(),
    assembledAt: isoDateStringArb(),
    cachedUntil: fc.option(isoDateStringArb(), { nil: undefined })
  }).chain(snapshot => {
    // Ensure latestPrice is from prices array or create a default
    const latestPrice = snapshot.prices.length > 0 
      ? snapshot.prices[snapshot.prices.length - 1]
      : {
          symbol: snapshot.symbol,
          timestamp: snapshot.timestamp,
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: 0,
          sourceId: 'none',
          qualityScore: 0
        };
    return fc.constant({ ...snapshot, latestPrice });
  });

/**
 * Generator for snapshot test data with controlled completeness
 */
export const snapshotTestDataArb = (): fc.Arbitrary<{
  symbol: string;
  timeframe: string;
  prices: import('../types/price').PricePoint[];
  newsEvents: import('../types/news').NewsEvent[];
  sentiment: import('../types/sentiment').SentimentData | null;
  onChainMetrics: import('../types/on-chain').OnChainMetric[];
  options: SnapshotOptions;
}> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    timeframe: fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
    prices: fc.array(pricePointArb(), { minLength: 0, maxLength: 10 }),
    newsEvents: fc.array(newsEventArb(), { minLength: 0, maxLength: 15 }),
    sentiment: fc.option(sentimentDataArb(), { nil: null }),
    onChainMetrics: fc.array(onChainMetricArb(), { minLength: 0, maxLength: 10 }),
    options: snapshotOptionsArb()
  });


/**
 * Stream Data Generators
 * Requirements: 8.1, 8.2, 8.5
 */

import { DataStream, StreamStatus, StreamMetrics } from '../types/stream';

/**
 * Generator for StreamStatus
 */
export const streamStatusArb = (): fc.Arbitrary<StreamStatus> =>
  fc.constantFrom('STARTING', 'ACTIVE', 'PAUSED', 'ERROR', 'STOPPED');

/**
 * Generator for StreamMetrics
 */
export const streamMetricsArb = (): fc.Arbitrary<StreamMetrics> =>
  fc.record({
    messagesReceived: fc.integer({ min: 0, max: 1000000 }),
    messagesPerSecond: fc.double({ min: 0, max: 10000, noNaN: true }),
    averageLatencyMs: fc.double({ min: 0, max: 5000, noNaN: true }),
    errorCount: fc.integer({ min: 0, max: 10000 }),
    lastError: fc.option(fc.string({ minLength: 5, maxLength: 200 }), { nil: undefined }),
    uptime: fc.integer({ min: 0, max: 86400 })
  });

/**
 * Generator for DataStream
 */
export const dataStreamArb = (): fc.Arbitrary<DataStream> =>
  fc.record({
    streamId: fc.uuid(),
    tenantId: fc.uuid(),
    sourceId: fc.uuid(),
    symbols: fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 10 }),
    type: dataSourceTypeArb(),
    status: streamStatusArb(),
    metrics: streamMetricsArb(),
    createdAt: isoDateStringArb(),
    lastActivity: isoDateStringArb()
  });

/**
 * Generator for stream start input
 */
export const streamStartInputArb = (): fc.Arbitrary<{
  tenantId: string;
  sourceId: string;
  symbols: string[];
}> =>
  fc.record({
    tenantId: fc.uuid(),
    sourceId: fc.uuid(),
    symbols: fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 10 })
  });

/**
 * Generator for tenant stream configuration
 */
export const tenantStreamConfigArb = (): fc.Arbitrary<{
  tenantId: string;
  maxConcurrentStreams: number;
}> =>
  fc.record({
    tenantId: fc.uuid(),
    maxConcurrentStreams: fc.integer({ min: 1, max: 100 })
  });


/**
 * Backfill Data Generators
 * Requirements: 9.1, 9.4, 9.5
 */

import { 
  BackfillRequest, 
  BackfillRequestInput, 
  BackfillProgress, 
  BackfillStatus,
  DataGap 
} from '../types/backfill';

/**
 * Generator for BackfillStatus
 */
export const backfillStatusArb = (): fc.Arbitrary<BackfillStatus> =>
  fc.constantFrom('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

/**
 * Generator for DataGap
 */
export const dataGapArb = (): fc.Arbitrary<DataGap> =>
  validDateRangeArb().chain(dateRange =>
    fc.record({
      startTime: fc.constant(dateRange.startDate),
      endTime: fc.constant(dateRange.endDate),
      reason: fc.constantFrom(
        'Source unavailable',
        'Rate limit exceeded',
        'Data not available',
        'Timeout',
        'Invalid response'
      )
    })
  );

/**
 * Generator for BackfillProgress
 */
export const backfillProgressArb = (): fc.Arbitrary<BackfillProgress> =>
  fc.record({
    totalRecords: fc.integer({ min: 0, max: 1000000 }),
    processedRecords: fc.integer({ min: 0, max: 1000000 }),
    percentComplete: fc.integer({ min: 0, max: 100 }),
    estimatedCompletionTime: fc.option(isoDateStringArb(), { nil: undefined }),
    gaps: fc.array(dataGapArb(), { minLength: 0, maxLength: 5 })
  }).map(progress => ({
    ...progress,
    processedRecords: Math.min(progress.processedRecords, progress.totalRecords),
    percentComplete: progress.totalRecords > 0 
      ? Math.round((Math.min(progress.processedRecords, progress.totalRecords) / progress.totalRecords) * 100)
      : 0
  }));

/**
 * Generator for BackfillRequestInput with valid date range
 */
export const backfillRequestInputArb = (): fc.Arbitrary<BackfillRequestInput> =>
  validDateRangeArb().chain(dateRange =>
    fc.record({
      sourceId: fc.uuid(),
      symbol: cryptoSymbolArb(),
      dataType: dataSourceTypeArb(),
      startTime: fc.constant(dateRange.startDate),
      endTime: fc.constant(dateRange.endDate)
    })
  );

/**
 * Generator for BackfillRequest
 */
export const backfillRequestArb = (): fc.Arbitrary<BackfillRequest> =>
  validDateRangeArb().chain(dateRange =>
    fc.record({
      requestId: fc.uuid(),
      tenantId: fc.uuid(),
      sourceId: fc.uuid(),
      symbol: cryptoSymbolArb(),
      dataType: dataSourceTypeArb(),
      startTime: fc.constant(dateRange.startDate),
      endTime: fc.constant(dateRange.endDate),
      status: backfillStatusArb(),
      progress: backfillProgressArb(),
      createdAt: isoDateStringArb(),
      completedAt: fc.option(isoDateStringArb(), { nil: undefined })
    })
  );

/**
 * Generator for BackfillRequestInput that matches a DataSource
 */
export const backfillRequestInputForSourceArb = (
  source: DataSource
): fc.Arbitrary<BackfillRequestInput> =>
  validDateRangeArb().chain(dateRange =>
    fc.record({
      sourceId: fc.constant(source.sourceId),
      symbol: source.supportedSymbols.length > 0 
        ? fc.constantFrom(...source.supportedSymbols)
        : cryptoSymbolArb(),
      dataType: fc.constant(source.type),
      startTime: fc.constant(dateRange.startDate),
      endTime: fc.constant(dateRange.endDate)
    })
  );

/**
 * Generator for a DataSource with specific symbols for backfill testing
 */
export const dataSourceForBackfillArb = (): fc.Arbitrary<DataSource> =>
  fc.record({
    sourceId: fc.uuid(),
    type: dataSourceTypeArb(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    apiEndpoint: apiEndpointArb(),
    authMethod: authMethodArb(),
    supportedSymbols: fc.array(cryptoSymbolArb(), { minLength: 1, maxLength: 10 })
      .map(symbols => [...new Set(symbols)]),
    rateLimits: rateLimitConfigArb(),
    status: fc.constant('ACTIVE' as DataSourceStatus),
    priority: fc.integer({ min: 1, max: 1000 }),
    costPerRequest: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });


/**
 * AI Provider Generators
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import {
  AIProvider,
  ProviderType,
  ProviderStatus,
  RateLimitConfig as AIRateLimitConfig
} from '../types/provider';
import { CreateProviderInput } from '../repositories/provider';

/**
 * Generator for ProviderType
 */
export const providerTypeArb = (): fc.Arbitrary<ProviderType> =>
  fc.constantFrom('GEMINI', 'OPENAI', 'DEEPSEEK', 'ANTHROPIC', 'CUSTOM');

/**
 * Generator for ProviderStatus
 */
export const providerStatusArb = (): fc.Arbitrary<ProviderStatus> =>
  fc.constantFrom('ACTIVE', 'INACTIVE', 'RATE_LIMITED', 'ERROR');

/**
 * Generator for AI provider auth method
 */
export const aiAuthMethodArb = (): fc.Arbitrary<'API_KEY' | 'OAUTH' | 'IAM'> =>
  fc.constantFrom('API_KEY', 'OAUTH', 'IAM');

/**
 * Generator for AI RateLimitConfig
 */
export const aiRateLimitConfigArb = (): fc.Arbitrary<AIRateLimitConfig> =>
  fc.record({
    requestsPerMinute: fc.integer({ min: 1, max: 1000 }),
    tokensPerMinute: fc.integer({ min: 100, max: 1000000 }),
    requestsPerDay: fc.integer({ min: 100, max: 100000 })
  }).filter(config =>
    config.requestsPerMinute * 60 * 24 <= config.requestsPerDay
  );

/**
 * Generator for supported AI models array
 */
export const supportedModelsArb = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.constantFrom(
      'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
      'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro',
      'deepseek-chat', 'deepseek-coder',
      'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'
    ),
    { minLength: 1, maxLength: 5 }
  ).map(models => [...new Set(models)]);

/**
 * Generator for AI provider API endpoint URLs
 */
export const aiApiEndpointArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'https://api.openai.com/v1',
    'https://generativelanguage.googleapis.com/v1',
    'https://api.deepseek.com/v1',
    'https://api.anthropic.com/v1'
  );

/**
 * Generator for AI provider names
 */
export const aiProviderNameArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'OpenAI GPT',
    'Google Gemini',
    'DeepSeek',
    'Anthropic Claude',
    'Custom Provider'
  );

/**
 * Generator for CreateProviderInput
 */
export const createProviderInputArb = (): fc.Arbitrary<CreateProviderInput> =>
  fc.record({
    providerId: fc.uuid(),
    type: providerTypeArb(),
    name: aiProviderNameArb(),
    apiEndpoint: aiApiEndpointArb(),
    authMethod: aiAuthMethodArb(),
    supportedModels: supportedModelsArb(),
    rateLimits: aiRateLimitConfigArb()
  });

/**
 * Generator for AIProvider
 */
export const aiProviderArb = (): fc.Arbitrary<AIProvider> =>
  fc.record({
    providerId: fc.uuid(),
    type: providerTypeArb(),
    name: aiProviderNameArb(),
    apiEndpoint: aiApiEndpointArb(),
    authMethod: aiAuthMethodArb(),
    supportedModels: supportedModelsArb(),
    status: providerStatusArb(),
    rateLimits: aiRateLimitConfigArb(),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });

/**
 * Generator for AIProvider with specific status
 */
export const aiProviderWithStatusArb = (status: ProviderStatus): fc.Arbitrary<AIProvider> =>
  fc.record({
    providerId: fc.uuid(),
    type: providerTypeArb(),
    name: aiProviderNameArb(),
    apiEndpoint: aiApiEndpointArb(),
    authMethod: aiAuthMethodArb(),
    supportedModels: supportedModelsArb(),
    status: fc.constant(status),
    rateLimits: aiRateLimitConfigArb(),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });

/**
 * Generator for active AIProvider
 */
export const activeAiProviderArb = (): fc.Arbitrary<AIProvider> =>
  aiProviderWithStatusArb('ACTIVE');

/**
 * Generator for inactive AIProvider
 */
export const inactiveAiProviderArb = (): fc.Arbitrary<AIProvider> =>
  aiProviderWithStatusArb('INACTIVE');


/**
 * Model Configuration Generators
 * Requirements: 2.1, 2.4
 */

import {
  ModelConfiguration,
  ModelConfigurationInput,
  EncryptedCredentials,
  CostLimits
} from '../types/model-config';

/**
 * Generator for EncryptedCredentials
 */
export const encryptedCredentialsArb = (): fc.Arbitrary<EncryptedCredentials> =>
  fc.record({
    encryptedApiKey: fc.hexaString({ minLength: 64, maxLength: 128 }),
    keyId: fc.uuid()
  });

/**
 * Generator for CostLimits
 */
export const costLimitsArb = (): fc.Arbitrary<CostLimits> =>
  fc.record({
    maxDailyCostUsd: fc.double({ min: 1, max: 10000, noNaN: true }),
    maxMonthlyCostUsd: fc.double({ min: 10, max: 100000, noNaN: true }),
    currentDailyCostUsd: fc.double({ min: 0, max: 10000, noNaN: true }),
    currentMonthlyCostUsd: fc.double({ min: 0, max: 100000, noNaN: true }),
    lastResetDate: isoDateStringArb()
  }).filter(limits =>
    limits.currentDailyCostUsd <= limits.maxDailyCostUsd &&
    limits.currentMonthlyCostUsd <= limits.maxMonthlyCostUsd &&
    limits.maxDailyCostUsd * 31 <= limits.maxMonthlyCostUsd
  );

/**
 * Generator for CostLimits with current cost below limits
 */
export const costLimitsBelowLimitArb = (): fc.Arbitrary<CostLimits> =>
  fc.record({
    maxDailyCostUsd: fc.double({ min: 100, max: 10000, noNaN: true }),
    maxMonthlyCostUsd: fc.double({ min: 1000, max: 100000, noNaN: true }),
    lastResetDate: isoDateStringArb()
  }).chain(limits =>
    fc.record({
      maxDailyCostUsd: fc.constant(limits.maxDailyCostUsd),
      maxMonthlyCostUsd: fc.constant(limits.maxMonthlyCostUsd),
      currentDailyCostUsd: fc.double({ min: 0, max: limits.maxDailyCostUsd * 0.5, noNaN: true }),
      currentMonthlyCostUsd: fc.double({ min: 0, max: limits.maxMonthlyCostUsd * 0.5, noNaN: true }),
      lastResetDate: fc.constant(limits.lastResetDate)
    })
  );

/**
 * Generator for CostLimits with current cost exceeding daily limit
 */
export const costLimitsExceededDailyArb = (): fc.Arbitrary<CostLimits> =>
  fc.record({
    maxDailyCostUsd: fc.double({ min: 10, max: 1000, noNaN: true }),
    maxMonthlyCostUsd: fc.double({ min: 1000, max: 100000, noNaN: true }),
    lastResetDate: isoDateStringArb()
  }).chain(limits =>
    fc.record({
      maxDailyCostUsd: fc.constant(limits.maxDailyCostUsd),
      maxMonthlyCostUsd: fc.constant(limits.maxMonthlyCostUsd),
      currentDailyCostUsd: fc.double({ min: limits.maxDailyCostUsd + 0.01, max: limits.maxDailyCostUsd * 2, noNaN: true }),
      currentMonthlyCostUsd: fc.double({ min: 0, max: limits.maxMonthlyCostUsd * 0.5, noNaN: true }),
      lastResetDate: fc.constant(limits.lastResetDate)
    })
  );

/**
 * Generator for ModelConfigurationInput
 */
export const modelConfigurationInputArb = (): fc.Arbitrary<ModelConfigurationInput> =>
  fc.record({
    providerId: fc.uuid(),
    modelId: fc.constantFrom(
      'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'deepseek-chat', 'deepseek-coder'
    ),
    modelName: fc.constantFrom(
      'GPT-4', 'GPT-4 Turbo', 'GPT-3.5 Turbo',
      'Gemini 1.5 Pro', 'Gemini 1.5 Flash',
      'DeepSeek Chat', 'DeepSeek Coder'
    ),
    enabled: fc.option(fc.boolean(), { nil: undefined }),
    credentials: encryptedCredentialsArb(),
    costLimits: costLimitsArb(),
    rateLimits: aiRateLimitConfigArb(),
    priority: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined })
  });

/**
 * Generator for ModelConfiguration
 */
export const modelConfigurationArb = (): fc.Arbitrary<ModelConfiguration> =>
  fc.record({
    configId: fc.uuid(),
    tenantId: fc.uuid(),
    providerId: fc.uuid(),
    modelId: fc.constantFrom(
      'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'deepseek-chat', 'deepseek-coder'
    ),
    modelName: fc.constantFrom(
      'GPT-4', 'GPT-4 Turbo', 'GPT-3.5 Turbo',
      'Gemini 1.5 Pro', 'Gemini 1.5 Flash',
      'DeepSeek Chat', 'DeepSeek Coder'
    ),
    enabled: fc.boolean(),
    credentials: encryptedCredentialsArb(),
    costLimits: costLimitsArb(),
    rateLimits: aiRateLimitConfigArb(),
    priority: fc.integer({ min: 1, max: 10 }),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });

/**
 * Generator for enabled ModelConfiguration
 */
export const enabledModelConfigurationArb = (): fc.Arbitrary<ModelConfiguration> =>
  modelConfigurationArb().map(config => ({ ...config, enabled: true }));

/**
 * Generator for disabled ModelConfiguration
 */
export const disabledModelConfigurationArb = (): fc.Arbitrary<ModelConfiguration> =>
  modelConfigurationArb().map(config => ({ ...config, enabled: false }));

/**
 * Generator for ModelConfiguration with specific tenant
 */
export const modelConfigurationForTenantArb = (tenantId: string): fc.Arbitrary<ModelConfiguration> =>
  modelConfigurationArb().map(config => ({ ...config, tenantId }));

/**
 * Generator for ModelConfiguration with specific provider
 */
export const modelConfigurationForProviderArb = (providerId: string): fc.Arbitrary<ModelConfiguration> =>
  modelConfigurationArb().map(config => ({ ...config, providerId }));

/**
 * Generator for ModelConfiguration with cost limits below threshold
 */
export const modelConfigurationBelowCostLimitArb = (): fc.Arbitrary<ModelConfiguration> =>
  fc.record({
    configId: fc.uuid(),
    tenantId: fc.uuid(),
    providerId: fc.uuid(),
    modelId: fc.constantFrom('gpt-4', 'gemini-1.5-pro', 'deepseek-chat'),
    modelName: fc.constantFrom('GPT-4', 'Gemini 1.5 Pro', 'DeepSeek Chat'),
    enabled: fc.boolean(),
    credentials: encryptedCredentialsArb(),
    costLimits: costLimitsBelowLimitArb(),
    rateLimits: aiRateLimitConfigArb(),
    priority: fc.integer({ min: 1, max: 10 }),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });

/**
 * Generator for ModelConfiguration with exceeded daily cost limit
 */
export const modelConfigurationExceededCostLimitArb = (): fc.Arbitrary<ModelConfiguration> =>
  fc.record({
    configId: fc.uuid(),
    tenantId: fc.uuid(),
    providerId: fc.uuid(),
    modelId: fc.constantFrom('gpt-4', 'gemini-1.5-pro', 'deepseek-chat'),
    modelName: fc.constantFrom('GPT-4', 'Gemini 1.5 Pro', 'DeepSeek Chat'),
    enabled: fc.boolean(),
    credentials: encryptedCredentialsArb(),
    costLimits: costLimitsExceededDailyArb(),
    rateLimits: aiRateLimitConfigArb(),
    priority: fc.integer({ min: 1, max: 10 }),
    createdAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  });


/**
 * Prompt Template Generators
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import {
  PromptTemplate,
  PromptTemplateInput,
  PromptParameter,
  PromptTemplateType
} from '../types/prompt-template';

/**
 * Generator for PromptTemplateType
 */
export const promptTemplateTypeArb = (): fc.Arbitrary<PromptTemplateType> =>
  fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION', 'PARAMETER_SUGGESTION');

/**
 * Generator for PromptParameter
 */
export const promptParameterArb = (): fc.Arbitrary<PromptParameter> =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
    required: fc.boolean(),
    defaultValue: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    description: fc.string({ minLength: 1, maxLength: 200 })
  });

/**
 * Generator for prompt template content with parameters
 */
export const promptContentArb = (paramNames?: string[]): fc.Arbitrary<string> => {
  if (paramNames && paramNames.length > 0) {
    // Generate content that includes the specified parameters
    return fc.tuple(
      fc.string({ minLength: 10, maxLength: 200 }),
      fc.string({ minLength: 10, maxLength: 200 })
    ).map(([prefix, suffix]) => {
      const paramPlaceholders = paramNames.map(name => `{{${name}}}`).join(' ');
      return `${prefix} ${paramPlaceholders} ${suffix}`;
    });
  }
  return fc.string({ minLength: 20, maxLength: 500 });
};

/**
 * Generator for PromptTemplateInput
 */
export const promptTemplateInputArb = (): fc.Arbitrary<PromptTemplateInput> =>
  fc.array(promptParameterArb(), { minLength: 0, maxLength: 5 })
    .chain(parameters => {
      const paramNames = parameters.map(p => p.name);
      return fc.record({
        templateId: fc.option(fc.uuid(), { nil: undefined }),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        type: promptTemplateTypeArb(),
        content: promptContentArb(paramNames),
        parameters: fc.constant(parameters),
        createdBy: fc.uuid()
      });
    });

/**
 * Generator for PromptTemplate
 */
export const promptTemplateArb = (): fc.Arbitrary<PromptTemplate> =>
  fc.array(promptParameterArb(), { minLength: 0, maxLength: 5 })
    .chain(parameters => {
      const paramNames = parameters.map(p => p.name);
      return fc.record({
        templateId: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        version: fc.integer({ min: 1, max: 1000 }),
        type: promptTemplateTypeArb(),
        content: promptContentArb(paramNames),
        parameters: fc.constant(parameters),
        createdAt: isoDateStringArb(),
        createdBy: fc.uuid()
      });
    });

/**
 * Generator for PromptTemplate with specific version
 */
export const promptTemplateWithVersionArb = (version: number): fc.Arbitrary<PromptTemplate> =>
  promptTemplateArb().map(template => ({ ...template, version }));

/**
 * Generator for PromptTemplate with parameters that have placeholders in content
 */
export const promptTemplateWithPlaceholdersArb = (): fc.Arbitrary<PromptTemplate> =>
  fc.array(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
    { minLength: 1, maxLength: 5 }
  ).chain(paramNames => {
    const uniqueNames = [...new Set(paramNames)];
    const parameters: PromptParameter[] = uniqueNames.map(name => ({
      name,
      required: true,
      description: `Parameter ${name}`
    }));
    
    return fc.tuple(
      fc.uuid(),
      fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      fc.integer({ min: 1, max: 1000 }),
      promptTemplateTypeArb(),
      fc.string({ minLength: 10, maxLength: 100 }),
      fc.string({ minLength: 10, maxLength: 100 }),
      isoDateStringArb(),
      fc.uuid()
    ).map(([templateId, name, version, type, prefix, suffix, createdAt, createdBy]) => {
      const placeholders = uniqueNames.map(n => `{{${n}}}`).join(' ');
      const content = `${prefix} ${placeholders} ${suffix}`;
      return {
        templateId,
        name,
        version,
        type,
        content,
        parameters,
        createdAt,
        createdBy
      };
    });
  });

/**
 * Generator for valid parameter values matching a template's parameters
 */
export const validParameterValuesArb = (
  parameters: PromptParameter[]
): fc.Arbitrary<Record<string, string>> => {
  if (parameters.length === 0) {
    return fc.constant({});
  }
  
  const entries = parameters.map(param =>
    fc.tuple(
      fc.constant(param.name),
      fc.string({ minLength: 1, maxLength: 50 })
    )
  );
  
  return fc.tuple(...entries).map(pairs =>
    Object.fromEntries(pairs)
  );
};

/**
 * Generator for parameter values with some required parameters missing
 */
export const incompleteParameterValuesArb = (
  parameters: PromptParameter[]
): fc.Arbitrary<{ values: Record<string, string>; missing: string[] }> => {
  const requiredParams = parameters.filter(p => p.required && !p.defaultValue);
  
  if (requiredParams.length === 0) {
    return fc.constant({ values: {}, missing: [] });
  }
  
  // Pick at least one required parameter to omit
  return fc.integer({ min: 1, max: requiredParams.length }).chain(numToOmit => {
    return fc.shuffledSubarray(requiredParams, { minLength: numToOmit, maxLength: numToOmit })
      .chain(omittedParams => {
        const omittedNames = new Set(omittedParams.map(p => p.name));
        const includedParams = parameters.filter(p => !omittedNames.has(p.name));
        
        return validParameterValuesArb(includedParams).map(values => ({
          values,
          missing: Array.from(omittedNames)
        }));
      });
  });
};


/**
 * Fund Allocation Generators
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { FundAllocation, ModelAllocation, AllocationValidation } from '../types/allocation';

/**
 * Generator for a single ModelAllocation
 */
export const modelAllocationArb = (): fc.Arbitrary<ModelAllocation> =>
  fc.record({
    modelConfigId: fc.uuid(),
    percentage: fc.integer({ min: 10, max: 100 }),
    priority: fc.integer({ min: 1, max: 10 })
  });

/**
 * Generator for valid ModelAllocation array (sum = 100%, count 1-5, min 10% each)
 */
export const validModelAllocationsArb = (): fc.Arbitrary<ModelAllocation[]> =>
  fc.integer({ min: 1, max: 5 }).chain(count => {
    // Generate percentages that sum to 100 with minimum 10% each
    return generateValidPercentages(count).chain(percentages =>
      fc.array(
        fc.record({
          modelConfigId: fc.uuid(),
          priority: fc.integer({ min: 1, max: 10 })
        }),
        { minLength: count, maxLength: count }
      ).map(configs =>
        configs.map((config, index) => ({
          ...config,
          percentage: percentages[index]
        }))
      )
    );
  });

/**
 * Helper to generate valid percentages that sum to 100 with minimum 10% each
 */
function generateValidPercentages(count: number): fc.Arbitrary<number[]> {
  if (count === 1) {
    return fc.constant([100]);
  }
  
  // For count models, we need to distribute 100% with min 10% each
  // Available to distribute: 100 - (count * 10) = 100 - count*10
  const minTotal = count * 10;
  const available = 100 - minTotal;
  
  if (available < 0) {
    // Can't satisfy constraints, return equal distribution
    return fc.constant(Array(count).fill(Math.floor(100 / count)));
  }
  
  // Generate random distribution of the available amount
  return fc.array(
    fc.integer({ min: 0, max: available }),
    { minLength: count - 1, maxLength: count - 1 }
  ).map(extras => {
    // Sort to use as cumulative distribution points
    const sorted = [...extras].sort((a, b) => a - b);
    const diffs = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      diffs.push(sorted[i] - sorted[i - 1]);
    }
    diffs.push(available - sorted[sorted.length - 1]);
    
    // Add minimum 10% to each
    return diffs.map(d => d + 10);
  });
}

/**
 * Generator for invalid allocations - sum not equal to 100%
 */
export const invalidSumAllocationsArb = (): fc.Arbitrary<ModelAllocation[]> =>
  fc.integer({ min: 1, max: 5 }).chain(count =>
    fc.array(
      fc.record({
        modelConfigId: fc.uuid(),
        percentage: fc.integer({ min: 10, max: 50 }), // Will likely not sum to 100
        priority: fc.integer({ min: 1, max: 10 })
      }),
      { minLength: count, maxLength: count }
    ).filter(allocations => {
      const sum = allocations.reduce((s, a) => s + a.percentage, 0);
      return sum !== 100;
    })
  );

/**
 * Generator for invalid allocations - too many models (> 5)
 */
export const tooManyModelsAllocationsArb = (): fc.Arbitrary<ModelAllocation[]> =>
  fc.integer({ min: 6, max: 10 }).chain(count => {
    const percentage = Math.floor(100 / count);
    const remainder = 100 - (percentage * count);
    
    return fc.array(
      fc.record({
        modelConfigId: fc.uuid(),
        priority: fc.integer({ min: 1, max: 10 })
      }),
      { minLength: count, maxLength: count }
    ).map(configs =>
      configs.map((config, index) => ({
        ...config,
        percentage: index === 0 ? percentage + remainder : percentage
      }))
    );
  });

/**
 * Generator for invalid allocations - percentage below minimum (< 10%)
 */
export const belowMinPercentageAllocationsArb = (): fc.Arbitrary<ModelAllocation[]> =>
  fc.tuple(
    fc.uuid(),
    fc.uuid(),
    fc.integer({ min: 1, max: 9 }) // Below minimum 10%
  ).map(([id1, id2, lowPercentage]) => [
    { modelConfigId: id1, percentage: lowPercentage, priority: 1 },
    { modelConfigId: id2, percentage: 100 - lowPercentage, priority: 2 }
  ]);

/**
 * Generator for empty allocations (count < 1)
 */
export const emptyAllocationsArb = (): fc.Arbitrary<ModelAllocation[]> =>
  fc.constant([]);

/**
 * Generator for FundAllocation
 */
export const fundAllocationArb = (): fc.Arbitrary<FundAllocation> =>
  validModelAllocationsArb().chain(allocations =>
    fc.record({
      allocationId: fc.uuid(),
      tenantId: fc.uuid(),
      strategyId: fc.uuid(),
      version: fc.integer({ min: 1, max: 100 }),
      allocations: fc.constant(allocations),
      ensembleMode: fc.boolean(),
      createdAt: isoDateStringArb(),
      createdBy: fc.uuid()
    })
  );

/**
 * Generator for a sequence of FundAllocation versions
 */
export const fundAllocationHistoryArb = (): fc.Arbitrary<FundAllocation[]> =>
  fc.tuple(
    fc.uuid(), // tenantId
    fc.uuid(), // strategyId
    fc.integer({ min: 1, max: 5 }) // number of versions
  ).chain(([tenantId, strategyId, versionCount]) =>
    fc.array(
      validModelAllocationsArb(),
      { minLength: versionCount, maxLength: versionCount }
    ).chain(allocationsList =>
      fc.array(
        fc.tuple(fc.uuid(), isoDateStringArb(), fc.uuid()),
        { minLength: versionCount, maxLength: versionCount }
      ).map(metadata =>
        allocationsList.map((allocations, index) => ({
          allocationId: metadata[index][0],
          tenantId,
          strategyId,
          version: index + 1,
          allocations,
          ensembleMode: allocations.length > 1,
          createdAt: metadata[index][1],
          createdBy: metadata[index][2]
        }))
      )
    )
  );


/**
 * Performance Tracking Generators
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import {
  ModelPerformance,
  PerformancePrediction,
  PerformanceMetrics,
  PerformancePeriod,
  RecordPredictionInput
} from '../types/performance';
import { MarketRegime } from '../types/analysis';

/**
 * Generator for MarketRegime
 */
export const marketRegimeArb = (): fc.Arbitrary<MarketRegime> =>
  fc.constantFrom(
    'TRENDING_UP',
    'TRENDING_DOWN',
    'RANGING',
    'HIGH_VOLATILITY',
    'LOW_VOLATILITY',
    'UNCERTAIN'
  );

/**
 * Generator for PerformancePeriod
 */
export const performancePeriodArb = (): fc.Arbitrary<PerformancePeriod> =>
  fc.constantFrom('DAILY', 'WEEKLY', 'MONTHLY');

/**
 * Generator for PerformanceMetrics
 */
export const performanceMetricsArb = (): fc.Arbitrary<PerformanceMetrics> =>
  fc.record({
    totalAnalyses: fc.integer({ min: 0, max: 10000 }),
    regimeAccuracy: fc.double({ min: 0, max: 1, noNaN: true }),
    averageConfidence: fc.double({ min: 0, max: 1, noNaN: true }),
    averageLatencyMs: fc.double({ min: 0, max: 10000, noNaN: true }),
    totalCostUsd: fc.double({ min: 0, max: 10000, noNaN: true }),
    costPerAnalysis: fc.double({ min: 0, max: 100, noNaN: true }),
    errorRate: fc.double({ min: 0, max: 1, noNaN: true }),
    validationFailureRate: fc.double({ min: 0, max: 1, noNaN: true })
  });

/**
 * Generator for ModelPerformance
 */
export const modelPerformanceArb = (): fc.Arbitrary<ModelPerformance> =>
  fc.record({
    performanceId: fc.uuid(),
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    period: performancePeriodArb(),
    periodStart: isoDateStringArb(),
    metrics: performanceMetricsArb(),
    updatedAt: isoDateStringArb()
  });

/**
 * Generator for PerformancePrediction (unvalidated)
 */
export const unvalidatedPredictionArb = (): fc.Arbitrary<PerformancePrediction> =>
  fc.record({
    predictionId: fc.uuid(),
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    analysisId: fc.uuid(),
    predictedRegime: marketRegimeArb(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    timestamp: isoDateStringArb(),
    validated: fc.constant(false),
    actualRegime: fc.constant(undefined),
    correct: fc.constant(undefined),
    processingTimeMs: fc.option(fc.double({ min: 0, max: 10000, noNaN: true }), { nil: undefined }),
    costUsd: fc.option(fc.double({ min: 0, max: 10, noNaN: true }), { nil: undefined })
  });

/**
 * Generator for PerformancePrediction (validated)
 */
export const validatedPredictionArb = (): fc.Arbitrary<PerformancePrediction> =>
  fc.record({
    predictionId: fc.uuid(),
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    analysisId: fc.uuid(),
    predictedRegime: marketRegimeArb(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    timestamp: isoDateStringArb(),
    validated: fc.constant(true),
    actualRegime: marketRegimeArb(),
    processingTimeMs: fc.option(fc.double({ min: 0, max: 10000, noNaN: true }), { nil: undefined }),
    costUsd: fc.option(fc.double({ min: 0, max: 10, noNaN: true }), { nil: undefined })
  }).map(prediction => ({
    ...prediction,
    correct: prediction.predictedRegime === prediction.actualRegime
  }));

/**
 * Generator for PerformancePrediction (either validated or unvalidated)
 */
export const performancePredictionArb = (): fc.Arbitrary<PerformancePrediction> =>
  fc.oneof(unvalidatedPredictionArb(), validatedPredictionArb());

/**
 * Generator for RecordPredictionInput
 */
export const recordPredictionInputArb = (): fc.Arbitrary<RecordPredictionInput> =>
  fc.record({
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    analysisId: fc.uuid(),
    predictedRegime: marketRegimeArb(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    processingTimeMs: fc.option(fc.double({ min: 0, max: 10000, noNaN: true }), { nil: undefined }),
    costUsd: fc.option(fc.double({ min: 0, max: 10, noNaN: true }), { nil: undefined })
  });

/**
 * Generator for a list of predictions for the same model
 */
export const predictionListForModelArb = (): fc.Arbitrary<{
  tenantId: string;
  modelConfigId: string;
  predictions: PerformancePrediction[];
}> =>
  fc.tuple(
    fc.uuid(),
    fc.uuid(),
    fc.integer({ min: 1, max: 20 })
  ).chain(([tenantId, modelConfigId, count]) =>
    fc.array(
      fc.record({
        predictionId: fc.uuid(),
        analysisId: fc.uuid(),
        predictedRegime: marketRegimeArb(),
        confidence: fc.double({ min: 0, max: 1, noNaN: true }),
        timestamp: isoDateStringArb(),
        validated: fc.boolean(),
        actualRegime: fc.option(marketRegimeArb(), { nil: undefined }),
        processingTimeMs: fc.option(fc.double({ min: 0, max: 10000, noNaN: true }), { nil: undefined }),
        costUsd: fc.option(fc.double({ min: 0, max: 10, noNaN: true }), { nil: undefined })
      }),
      { minLength: count, maxLength: count }
    ).map(predictions => ({
      tenantId,
      modelConfigId,
      predictions: predictions.map(p => ({
        ...p,
        tenantId,
        modelConfigId,
        correct: p.validated && p.actualRegime !== undefined
          ? p.predictedRegime === p.actualRegime
          : undefined
      }))
    }))
  );

/**
 * Generator for performance comparison data (multiple models)
 */
export const performanceComparisonArb = (): fc.Arbitrary<{
  tenantId: string;
  period: PerformancePeriod;
  performances: ModelPerformance[];
}> =>
  fc.tuple(
    fc.uuid(),
    performancePeriodArb(),
    fc.integer({ min: 2, max: 5 })
  ).chain(([tenantId, period, count]) =>
    fc.array(
      fc.tuple(fc.uuid(), performanceMetricsArb(), isoDateStringArb(), isoDateStringArb()),
      { minLength: count, maxLength: count }
    ).map(data => ({
      tenantId,
      period,
      performances: data.map(([modelConfigId, metrics, periodStart, updatedAt]) => ({
        performanceId: `perf-${modelConfigId}`,
        tenantId,
        modelConfigId,
        period,
        periodStart,
        metrics,
        updatedAt
      }))
    }))
  );


/**
 * Regime Classification Generators
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import {
  RegimeClassificationRequest,
  RegimeClassificationResponse,
  ExplanationRequest,
  ExplanationResponse,
  ExplanationFactor,
  StrategyAction,
  ParameterSuggestionRequest,
  ParameterSuggestionResponse,
  ParameterSuggestion
} from '../types/analysis';
import {
  MarketDataSnapshot as AnalysisMarketDataSnapshot,
  PricePoint as AnalysisPricePoint,
  VolumePoint as AnalysisVolumePoint
} from '../types/market-data';

/**
 * Generator for AnalysisPricePoint (from market-data.ts)
 */
export const analysisPricePointArb = (): fc.Arbitrary<AnalysisPricePoint> =>
  fc.record({
    timestamp: isoDateStringArb(),
    open: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    high: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    low: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    close: fc.double({ min: 0.01, max: 100000, noNaN: true })
  }).map(p => ({
    ...p,
    high: Math.max(p.open, p.high, p.low, p.close),
    low: Math.min(p.open, p.high, p.low, p.close)
  }));

/**
 * Generator for AnalysisVolumePoint (from market-data.ts)
 */
export const analysisVolumePointArb = (): fc.Arbitrary<AnalysisVolumePoint> =>
  fc.record({
    timestamp: isoDateStringArb(),
    volume: fc.double({ min: 0, max: 1000000000, noNaN: true })
  });

/**
 * Generator for AnalysisMarketDataSnapshot (from market-data.ts)
 */
export const analysisMarketDataSnapshotArb = (): fc.Arbitrary<AnalysisMarketDataSnapshot> =>
  fc.record({
    symbol: cryptoSymbolArb(),
    prices: fc.array(analysisPricePointArb(), { minLength: 1, maxLength: 100 }),
    volume: fc.array(analysisVolumePointArb(), { minLength: 1, maxLength: 100 }),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for RegimeClassificationRequest
 */
export const regimeClassificationRequestArb = (): fc.Arbitrary<RegimeClassificationRequest> =>
  fc.record({
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    marketData: analysisMarketDataSnapshotArb(),
    timeframe: fc.constantFrom('1m', '5m', '15m', '1h', '4h', '1d'),
    additionalContext: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined })
  });

/**
 * Generator for RegimeClassificationResponse
 */
export const regimeClassificationResponseArb = (): fc.Arbitrary<RegimeClassificationResponse> =>
  fc.record({
    regime: marketRegimeArb(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    reasoning: fc.string({ minLength: 10, maxLength: 500 }),
    supportingFactors: fc.array(fc.string({ minLength: 5, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
    modelId: fc.uuid(),
    promptVersion: fc.stringOf(fc.constantFrom('1', '2', '3', '.'), { minLength: 1, maxLength: 5 }),
    processingTimeMs: fc.integer({ min: 10, max: 10000 }),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for valid RegimeClassificationResponse (always valid output)
 */
export const validRegimeClassificationResponseArb = (): fc.Arbitrary<RegimeClassificationResponse> =>
  fc.record({
    regime: marketRegimeArb(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    reasoning: fc.string({ minLength: 10, maxLength: 500 }),
    supportingFactors: fc.array(fc.string({ minLength: 5, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
    modelId: fc.uuid(),
    promptVersion: fc.stringOf(fc.constantFrom('1', '2', '3', '.'), { minLength: 1, maxLength: 5 }),
    processingTimeMs: fc.integer({ min: 10, max: 10000 }),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for StrategyAction
 */
export const strategyActionArb = (): fc.Arbitrary<StrategyAction> =>
  fc.record({
    type: fc.constantFrom('ENTRY', 'EXIT', 'INCREASE', 'DECREASE', 'HOLD'),
    symbol: cryptoSymbolArb(),
    quantity: fc.option(fc.double({ min: 0.001, max: 1000, noNaN: true }), { nil: undefined }),
    price: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
    reason: fc.string({ minLength: 10, maxLength: 200 })
  });

/**
 * Generator for ExplanationFactor
 */
export const explanationFactorArb = (): fc.Arbitrary<ExplanationFactor> =>
  fc.record({
    factor: fc.string({ minLength: 5, maxLength: 100 }),
    impact: fc.constantFrom('POSITIVE', 'NEGATIVE', 'NEUTRAL'),
    weight: fc.double({ min: 0, max: 1, noNaN: true })
  });

/**
 * Generator for ExplanationRequest
 */
export const explanationRequestArb = (): fc.Arbitrary<ExplanationRequest> =>
  fc.record({
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    strategyId: fc.uuid(),
    action: strategyActionArb(),
    marketContext: analysisMarketDataSnapshotArb(),
    strategyParameters: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      fc.oneof(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.boolean()
      ),
      { minKeys: 0, maxKeys: 5 }
    )
  });

/**
 * Generator for ExplanationResponse
 */
export const explanationResponseArb = (): fc.Arbitrary<ExplanationResponse> =>
  fc.record({
    explanation: fc.string({ minLength: 50, maxLength: 1000 }),
    keyFactors: fc.array(explanationFactorArb(), { minLength: 1, maxLength: 5 }),
    riskAssessment: fc.string({ minLength: 20, maxLength: 500 }),
    modelId: fc.uuid(),
    promptVersion: fc.stringOf(fc.constantFrom('1', '2', '3', '.'), { minLength: 1, maxLength: 5 }),
    processingTimeMs: fc.integer({ min: 10, max: 10000 }),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for ParameterSuggestion
 */
export const parameterSuggestionArb = (): fc.Arbitrary<ParameterSuggestion> =>
  fc.record({
    parameterName: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
    currentValue: fc.oneof(
      fc.double({ min: -1000, max: 1000, noNaN: true }),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.boolean()
    ),
    suggestedValue: fc.oneof(
      fc.double({ min: -1000, max: 1000, noNaN: true }),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.boolean()
    ),
    rationale: fc.string({ minLength: 20, maxLength: 300 }),
    expectedImpact: fc.string({ minLength: 10, maxLength: 200 }),
    confidence: fc.double({ min: 0, max: 1, noNaN: true })
  });

/**
 * Generator for ParameterSuggestionResponse
 */
export const parameterSuggestionResponseArb = (): fc.Arbitrary<ParameterSuggestionResponse> =>
  fc.record({
    suggestions: fc.array(parameterSuggestionArb(), { minLength: 0, maxLength: 5 }),
    overallAssessment: fc.string({ minLength: 20, maxLength: 500 }),
    modelId: fc.uuid(),
    promptVersion: fc.stringOf(fc.constantFrom('1', '2', '3', '.'), { minLength: 1, maxLength: 5 }),
    processingTimeMs: fc.integer({ min: 10, max: 10000 }),
    timestamp: isoDateStringArb()
  });


/**
 * Audit Record Generators
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import {
  AuditRecord,
  AuditRequest,
  AuditResponse,
  TokenUsage,
  AuditFilters,
  DateRange
} from '../types/audit';

/**
 * Generator for TokenUsage
 */
export const tokenUsageArb = (): fc.Arbitrary<TokenUsage> =>
  fc.record({
    promptTokens: fc.integer({ min: 1, max: 10000 }),
    completionTokens: fc.integer({ min: 1, max: 10000 }),
    totalTokens: fc.integer({ min: 2, max: 20000 })
  }).map(usage => ({
    ...usage,
    totalTokens: usage.promptTokens + usage.completionTokens
  }));

/**
 * Generator for AuditRequest
 */
export const auditRequestArb = (): fc.Arbitrary<AuditRequest> =>
  fc.record({
    promptTemplateId: fc.uuid(),
    promptVersion: fc.integer({ min: 1, max: 100 }),
    renderedPrompt: fc.string({ minLength: 50, maxLength: 2000 }),
    marketDataHash: fc.hexaString({ minLength: 64, maxLength: 64 })
  });

/**
 * Generator for AuditResponse
 */
export const auditResponseArb = (): fc.Arbitrary<AuditResponse> =>
  fc.record({
    rawOutput: fc.string({ minLength: 50, maxLength: 2000 }),
    validatedOutput: fc.oneof(
      regimeClassificationResponseArb(),
      explanationResponseArb(),
      fc.constant(null)
    ),
    validationPassed: fc.boolean(),
    processingTimeMs: fc.integer({ min: 10, max: 30000 }),
    tokenUsage: tokenUsageArb(),
    costUsd: fc.double({ min: 0, max: 10, noNaN: true })
  });

/**
 * Generator for AuditRecord
 */
export const auditRecordArb = (): fc.Arbitrary<AuditRecord> =>
  fc.record({
    auditId: fc.uuid(),
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    analysisType: fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION', 'PARAMETER_SUGGESTION'),
    request: auditRequestArb(),
    response: auditResponseArb(),
    timestamp: isoDateStringArb(),
    retentionExpiresAt: isoDateStringArb()
  });

/**
 * Generator for AuditRecord with specific tenant
 */
export const auditRecordForTenantArb = (tenantId: string): fc.Arbitrary<AuditRecord> =>
  auditRecordArb().map(record => ({ ...record, tenantId }));

/**
 * Generator for AuditFilters
 */
export const auditFiltersArb = (): fc.Arbitrary<AuditFilters> =>
  fc.record({
    modelConfigId: fc.option(fc.uuid(), { nil: undefined }),
    analysisType: fc.option(fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION', 'PARAMETER_SUGGESTION'), { nil: undefined }),
    startDate: fc.option(isoDateStringArb(), { nil: undefined }),
    endDate: fc.option(isoDateStringArb(), { nil: undefined }),
    limit: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined })
  });

/**
 * Generator for DateRange
 */
export const dateRangeArb = (): fc.Arbitrary<DateRange> =>
  validDateRangeArb().map(range => ({
    startDate: range.startDate,
    endDate: range.endDate
  }));

/**
 * Generator for a list of AuditRecords for the same tenant
 */
export const auditRecordListForTenantArb = (): fc.Arbitrary<{
  tenantId: string;
  records: AuditRecord[];
}> =>
  fc.tuple(
    fc.uuid(),
    fc.integer({ min: 1, max: 20 })
  ).chain(([tenantId, count]) =>
    fc.array(
      auditRecordArb(),
      { minLength: count, maxLength: count }
    ).map(records => ({
      tenantId,
      records: records.map(r => ({ ...r, tenantId }))
    }))
  );

/**
 * Generator for CreateAuditRecordInput (for audit service)
 */
export const createAuditRecordInputArb = (): fc.Arbitrary<{
  tenantId: string;
  modelConfigId: string;
  analysisType: string;
  request: AuditRequest;
  response: AuditResponse;
}> =>
  fc.record({
    tenantId: fc.uuid(),
    modelConfigId: fc.uuid(),
    analysisType: fc.constantFrom('REGIME_CLASSIFICATION', 'EXPLANATION', 'PARAMETER_SUGGESTION'),
    request: auditRequestArb(),
    response: auditResponseArb()
  });


/**
 * Position Limit Generators
 * Requirements: 1.1, 1.2, 1.3
 */

import {
  PositionLimit,
  PositionLimitInput,
  LimitType,
  LimitScope,
  LimitCheckResult
} from '../types/position-limit';
import { OrderRequest, OrderSide, OrderType } from '../types/order';

/**
 * Generator for LimitType
 */
export const limitTypeArb = (): fc.Arbitrary<LimitType> =>
  fc.constantFrom('ABSOLUTE', 'PERCENTAGE');

/**
 * Generator for LimitScope
 */
export const limitScopeArb = (): fc.Arbitrary<LimitScope> =>
  fc.constantFrom('ASSET', 'STRATEGY', 'PORTFOLIO');

/**
 * Generator for OrderSide
 */
export const orderSideArb = (): fc.Arbitrary<OrderSide> =>
  fc.constantFrom('BUY', 'SELL');

/**
 * Generator for OrderType
 */
export const orderTypeArb = (): fc.Arbitrary<OrderType> =>
  fc.constantFrom('MARKET', 'LIMIT', 'STOP');

/**
 * Generator for PositionLimitInput
 */
export const positionLimitInputArb = (): fc.Arbitrary<PositionLimitInput> =>
  fc.oneof(
    // ASSET scope
    fc.record({
      scope: fc.constant('ASSET' as LimitScope),
      assetId: fc.uuid(),
      limitType: limitTypeArb(),
      maxValue: fc.double({ min: 1, max: 1000000, noNaN: true })
    }),
    // STRATEGY scope
    fc.record({
      scope: fc.constant('STRATEGY' as LimitScope),
      strategyId: fc.uuid(),
      limitType: limitTypeArb(),
      maxValue: fc.double({ min: 1, max: 1000000, noNaN: true })
    }),
    // PORTFOLIO scope
    fc.record({
      scope: fc.constant('PORTFOLIO' as LimitScope),
      limitType: limitTypeArb(),
      maxValue: fc.double({ min: 1, max: 1000000, noNaN: true })
    })
  );

/**
 * Generator for PositionLimit
 * Note: PERCENTAGE limits are constrained to 0-100 (representing 0-100% of portfolio)
 */
export const positionLimitArb = (): fc.Arbitrary<PositionLimit> =>
  limitScopeArb().chain(scope =>
    limitTypeArb().chain(limitType =>
      fc.record({
        limitId: fc.uuid(),
        tenantId: fc.uuid(),
        scope: fc.constant(scope),
        assetId: scope === 'ASSET' ? fc.uuid() : fc.constant(undefined),
        strategyId: scope === 'STRATEGY' ? fc.uuid() : fc.constant(undefined),
        limitType: fc.constant(limitType),
        // PERCENTAGE limits must be 0-100, ABSOLUTE limits can be any positive value
        maxValue: limitType === 'PERCENTAGE' 
          ? fc.double({ min: 1, max: 100, noNaN: true })
          : fc.double({ min: 1, max: 1000000, noNaN: true }),
        currentValue: fc.double({ min: 0, max: 500000, noNaN: true }),
        utilizationPercent: fc.double({ min: 0, max: 100, noNaN: true }),
        createdAt: isoDateStringArb(),
        updatedAt: isoDateStringArb()
      })
    )
  );

/**
 * Generator for PositionLimit with specific scope
 * Note: PERCENTAGE limits are constrained to 0-100 (representing 0-100% of portfolio)
 */
export const positionLimitWithScopeArb = (scope: LimitScope): fc.Arbitrary<PositionLimit> =>
  limitTypeArb().chain(limitType =>
    fc.record({
      limitId: fc.uuid(),
      tenantId: fc.uuid(),
      scope: fc.constant(scope),
      assetId: scope === 'ASSET' ? fc.uuid() : fc.constant(undefined),
      strategyId: scope === 'STRATEGY' ? fc.uuid() : fc.constant(undefined),
      limitType: fc.constant(limitType),
      // PERCENTAGE limits must be 0-100, ABSOLUTE limits can be any positive value
      maxValue: limitType === 'PERCENTAGE'
        ? fc.double({ min: 1, max: 100, noNaN: true })
        : fc.double({ min: 1, max: 1000000, noNaN: true }),
      currentValue: fc.double({ min: 0, max: 500000, noNaN: true }),
      utilizationPercent: fc.double({ min: 0, max: 100, noNaN: true }),
      createdAt: isoDateStringArb(),
      updatedAt: isoDateStringArb()
    })
  );

/**
 * Generator for OrderRequest
 */
export const orderRequestArb = (): fc.Arbitrary<OrderRequest> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    side: orderSideArb(),
    quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    price: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
    orderType: orderTypeArb(),
    exchangeId: fc.constantFrom('binance', 'coinbase', 'kraken'),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for OrderRequest that matches a PositionLimit
 */
export const orderRequestForLimitArb = (limit: PositionLimit): fc.Arbitrary<OrderRequest> =>
  fc.record({
    orderId: fc.uuid(),
    tenantId: fc.constant(limit.tenantId),
    strategyId: limit.strategyId ? fc.constant(limit.strategyId) : fc.uuid(),
    assetId: limit.assetId ? fc.constant(limit.assetId) : cryptoSymbolArb(),
    side: orderSideArb(),
    quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    price: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
    orderType: orderTypeArb(),
    exchangeId: fc.constantFrom('binance', 'coinbase', 'kraken'),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for PositionLimit and OrderRequest that would exceed the limit
 * Note: For PERCENTAGE limits, we use a fixed portfolioValue of 100000 and calculate
 * the effective max as (maxValue / 100) * portfolioValue
 */
export const limitExceedingOrderArb = (): fc.Arbitrary<{
  limit: PositionLimit;
  order: OrderRequest;
  portfolioValue?: number;
}> =>
  positionLimitArb().chain(limit => {
    const portfolioValue = 100000;
    // For PERCENTAGE limits, effectiveMax = (maxValue% / 100) * portfolioValue
    // For ABSOLUTE limits, effectiveMax = maxValue
    const effectiveMax = limit.limitType === 'PERCENTAGE' 
      ? (limit.maxValue / 100) * portfolioValue 
      : limit.maxValue;
    const remaining = Math.max(0, effectiveMax - limit.currentValue);
    
    // Generate order that exceeds remaining capacity
    return fc.record({
      orderId: fc.uuid(),
      tenantId: fc.constant(limit.tenantId),
      strategyId: limit.strategyId ? fc.constant(limit.strategyId) : fc.uuid(),
      assetId: limit.assetId ? fc.constant(limit.assetId) : cryptoSymbolArb(),
      side: fc.constant('BUY' as OrderSide),
      quantity: fc.double({ min: remaining + 1, max: remaining + 10000, noNaN: true }),
      price: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
      orderType: orderTypeArb(),
      exchangeId: fc.constantFrom('binance', 'coinbase', 'kraken'),
      timestamp: isoDateStringArb()
    }).map(order => ({
      limit,
      order,
      portfolioValue: limit.limitType === 'PERCENTAGE' ? portfolioValue : undefined
    }));
  });

/**
 * Generator for PositionLimit and OrderRequest that stays within the limit
 * Note: For PERCENTAGE limits, maxValue is constrained to 0-100 and we use a fixed portfolioValue
 */
export const limitWithinOrderArb = (): fc.Arbitrary<{
  limit: PositionLimit;
  order: OrderRequest;
  portfolioValue?: number;
}> =>
  limitTypeArb().chain(limitType =>
    fc.record({
      limitId: fc.uuid(),
      tenantId: fc.uuid(),
      scope: limitScopeArb(),
      limitType: fc.constant(limitType),
      // PERCENTAGE limits must be 0-100, ABSOLUTE limits can be any positive value
      maxValue: limitType === 'PERCENTAGE'
        ? fc.double({ min: 10, max: 100, noNaN: true })
        : fc.double({ min: 100, max: 1000000, noNaN: true }),
      createdAt: isoDateStringArb(),
      updatedAt: isoDateStringArb()
    }).chain(baseLimit => {
      const portfolioValue = 100000;
      // For PERCENTAGE limits, effectiveMax = (maxValue% / 100) * portfolioValue
      // For ABSOLUTE limits, effectiveMax = maxValue
      const effectiveMax = baseLimit.limitType === 'PERCENTAGE'
        ? (baseLimit.maxValue / 100) * portfolioValue
        : baseLimit.maxValue;
      
      // Set current value to leave room for orders (30% of effective max utilized)
      const currentValue = effectiveMax * 0.3;
      const remaining = effectiveMax - currentValue;
      
      const limit: PositionLimit = {
        ...baseLimit,
        assetId: baseLimit.scope === 'ASSET' ? 'BTC' : undefined,
        strategyId: baseLimit.scope === 'STRATEGY' ? 'strategy-1' : undefined,
        currentValue,
        utilizationPercent: 30
      };
      
      return fc.record({
        orderId: fc.uuid(),
        tenantId: fc.constant(limit.tenantId),
        strategyId: limit.strategyId ? fc.constant(limit.strategyId) : fc.uuid(),
        assetId: limit.assetId ? fc.constant(limit.assetId) : cryptoSymbolArb(),
        side: fc.constant('BUY' as OrderSide),
        quantity: fc.double({ min: 0.001, max: remaining * 0.5, noNaN: true }), // Max 50% of remaining
        price: fc.option(fc.double({ min: 0.01, max: 100000, noNaN: true }), { nil: undefined }),
        orderType: orderTypeArb(),
        exchangeId: fc.constantFrom('binance', 'coinbase', 'kraken'),
        timestamp: isoDateStringArb()
      }).map(order => ({
        limit,
        order,
        portfolioValue: limit.limitType === 'PERCENTAGE' ? portfolioValue : undefined
      }));
    })
  );


/**
 * Generator for ExecutionReport
 */
export const executionReportArb = (): fc.Arbitrary<import('../types/order').ExecutionReport> =>
  fc.record({
    executionId: fc.uuid(),
    orderId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    side: orderSideArb(),
    executedQuantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    executedPrice: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    commission: fc.double({ min: 0, max: 100, noNaN: true }),
    exchangeId: fc.constantFrom('binance', 'coinbase', 'kraken'),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for a sequence of ExecutionReports for the same asset
 */
export const executionReportSequenceArb = (): fc.Arbitrary<{
  tenantId: string;
  assetId: string;
  strategyId: string;
  executions: import('../types/order').ExecutionReport[];
}> =>
  fc.tuple(
    fc.uuid(),
    cryptoSymbolArb(),
    fc.uuid(),
    fc.integer({ min: 1, max: 20 })
  ).chain(([tenantId, assetId, strategyId, count]) =>
    fc.array(
      fc.record({
        executionId: fc.uuid(),
        orderId: fc.uuid(),
        tenantId: fc.constant(tenantId),
        strategyId: fc.constant(strategyId),
        assetId: fc.constant(assetId),
        side: orderSideArb(),
        executedQuantity: fc.double({ min: 0.001, max: 100, noNaN: true }),
        executedPrice: fc.double({ min: 0.01, max: 100000, noNaN: true }),
        commission: fc.double({ min: 0, max: 10, noNaN: true }),
        exchangeId: fc.constantFrom('binance', 'coinbase', 'kraken'),
        timestamp: isoDateStringArb()
      }),
      { minLength: count, maxLength: count }
    ).map(executions => ({
      tenantId,
      assetId,
      strategyId,
      executions
    }))
  );


/**
 * Passive Breach Handler Generators
 * Requirements: 1.6
 */

import {
  BreachStatus,
  BreachCheckResult,
  FlaggedPosition,
  ReductionOrder,
  PassiveBreachConfig
} from '../services/passive-breach-handler';

/**
 * Generator for BreachStatus
 */
export const breachStatusArb = (): fc.Arbitrary<BreachStatus> =>
  fc.constantFrom('NORMAL', 'BREACH', 'WARNING');

/**
 * Generator for PassiveBreachConfig
 */
export const passiveBreachConfigArb = (): fc.Arbitrary<PassiveBreachConfig> =>
  fc.record({
    tenantId: fc.uuid(),
    autoReductionEnabled: fc.boolean(),
    warningThresholdPercent: fc.double({ min: 70, max: 95, noNaN: true }),
    reductionTargetPercent: fc.double({ min: 50, max: 90, noNaN: true })
  });

/**
 * Generator for a position that will breach its limit when price increases
 */
export const breachingPositionScenarioArb = (): fc.Arbitrary<{
  tenantId: string;
  assetId: string;
  strategyId: string;
  limit: PositionLimit;
  positionQuantity: number;
  initialPrice: number;
  breachingPrice: number;
  portfolioValue?: number;
}> =>
  fc.record({
    tenantId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    strategyId: fc.uuid(),
    maxValue: fc.double({ min: 1000, max: 100000, noNaN: true }),
    limitType: limitTypeArb(),
    positionQuantity: fc.double({ min: 1, max: 100, noNaN: true }),
    initialPrice: fc.double({ min: 10, max: 1000, noNaN: true })
  }).map(({ tenantId, assetId, strategyId, maxValue, limitType, positionQuantity, initialPrice }) => {
    // Calculate a price that would cause a breach
    const portfolioValue = limitType === 'PERCENTAGE' ? maxValue * 100 / 20 : undefined; // 20% limit
    const effectiveMax = limitType === 'PERCENTAGE' && portfolioValue 
      ? (maxValue / 100) * portfolioValue 
      : maxValue;
    
    // Initial position value should be within limit
    const initialValue = positionQuantity * initialPrice;
    const adjustedQuantity = initialValue > effectiveMax * 0.8 
      ? (effectiveMax * 0.7) / initialPrice 
      : positionQuantity;
    
    // Calculate a price that would cause breach
    const breachingPrice = (effectiveMax * 1.2) / adjustedQuantity;
    
    const limit: PositionLimit = {
      limitId: 'limit-' + assetId,
      tenantId,
      scope: 'ASSET',
      assetId,
      limitType,
      maxValue,
      currentValue: adjustedQuantity * initialPrice,
      utilizationPercent: ((adjustedQuantity * initialPrice) / effectiveMax) * 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return {
      tenantId,
      assetId,
      strategyId,
      limit,
      positionQuantity: adjustedQuantity,
      initialPrice,
      breachingPrice,
      portfolioValue
    };
  });

/**
 * Generator for a position that stays within its limit
 */
export const nonBreachingPositionScenarioArb = (): fc.Arbitrary<{
  tenantId: string;
  assetId: string;
  strategyId: string;
  limit: PositionLimit;
  positionQuantity: number;
  currentPrice: number;
  portfolioValue?: number;
}> =>
  fc.record({
    tenantId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    strategyId: fc.uuid(),
    maxValue: fc.double({ min: 10000, max: 1000000, noNaN: true }),
    limitType: limitTypeArb(),
    utilizationPercent: fc.double({ min: 10, max: 70, noNaN: true }), // Stay well within limit
    currentPrice: fc.double({ min: 10, max: 1000, noNaN: true })
  }).map(({ tenantId, assetId, strategyId, maxValue, limitType, utilizationPercent, currentPrice }) => {
    const portfolioValue = limitType === 'PERCENTAGE' ? maxValue * 100 / 20 : undefined;
    const effectiveMax = limitType === 'PERCENTAGE' && portfolioValue 
      ? (maxValue / 100) * portfolioValue 
      : maxValue;
    
    const targetValue = effectiveMax * (utilizationPercent / 100);
    const positionQuantity = targetValue / currentPrice;
    
    const limit: PositionLimit = {
      limitId: 'limit-' + assetId,
      tenantId,
      scope: 'ASSET',
      assetId,
      limitType,
      maxValue,
      currentValue: targetValue,
      utilizationPercent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return {
      tenantId,
      assetId,
      strategyId,
      limit,
      positionQuantity,
      currentPrice,
      portfolioValue
    };
  });


/**
 * Drawdown Generators
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import {
  DrawdownState,
  DrawdownConfig,
  DrawdownStatus,
  ResetInterval
} from '../types/drawdown';

/**
 * Generator for DrawdownStatus
 */
export const drawdownStatusArb = (): fc.Arbitrary<DrawdownStatus> =>
  fc.constantFrom('NORMAL', 'WARNING', 'CRITICAL', 'PAUSED');

/**
 * Generator for ResetInterval
 */
export const resetIntervalArb = (): fc.Arbitrary<ResetInterval> =>
  fc.constantFrom('DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL');

/**
 * Generator for DrawdownConfig
 */
export const drawdownConfigArb = (): fc.Arbitrary<DrawdownConfig> =>
  fc.record({
    configId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.option(fc.uuid(), { nil: undefined }),
    warningThresholdPercent: fc.double({ min: 1, max: 20, noNaN: true }),
    maxThresholdPercent: fc.double({ min: 5, max: 50, noNaN: true }),
    resetInterval: resetIntervalArb(),
    autoResumeEnabled: fc.boolean(),
    cooldownMinutes: fc.integer({ min: 1, max: 1440 })
  }).filter(config => config.warningThresholdPercent < config.maxThresholdPercent);

/**
 * Generator for DrawdownState with consistent values
 */
export const drawdownStateArb = (): fc.Arbitrary<DrawdownState> =>
  fc.record({
    stateId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.option(fc.uuid(), { nil: undefined }),
    scope: fc.constantFrom('STRATEGY', 'PORTFOLIO') as fc.Arbitrary<'STRATEGY' | 'PORTFOLIO'>,
    peakValue: fc.double({ min: 10000, max: 1000000, noNaN: true }),
    drawdownPercent: fc.double({ min: 0, max: 50, noNaN: true }),
    warningThreshold: fc.double({ min: 1, max: 20, noNaN: true }),
    maxThreshold: fc.double({ min: 5, max: 50, noNaN: true }),
    status: drawdownStatusArb(),
    lastResetAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  }).filter(state => state.warningThreshold < state.maxThreshold)
    .map(state => {
      // Calculate consistent currentValue and drawdownAbsolute from peakValue and drawdownPercent
      const drawdownAbsolute = (state.drawdownPercent / 100) * state.peakValue;
      const currentValue = state.peakValue - drawdownAbsolute;
      return {
        ...state,
        currentValue,
        drawdownAbsolute
      };
    });

/**
 * Generator for DrawdownState in NORMAL status (below warning threshold)
 */
export const normalDrawdownStateArb = (): fc.Arbitrary<DrawdownState> =>
  fc.record({
    stateId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.option(fc.uuid(), { nil: undefined }),
    scope: fc.constantFrom('STRATEGY', 'PORTFOLIO') as fc.Arbitrary<'STRATEGY' | 'PORTFOLIO'>,
    peakValue: fc.double({ min: 10000, max: 1000000, noNaN: true }),
    warningThreshold: fc.double({ min: 5, max: 20, noNaN: true }),
    maxThreshold: fc.double({ min: 10, max: 50, noNaN: true }),
    lastResetAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  }).filter(state => state.warningThreshold < state.maxThreshold)
    .chain(state => 
      // Generate drawdown below warning threshold
      fc.double({ min: 0, max: state.warningThreshold - 0.1, noNaN: true }).map(drawdownPercent => {
        const drawdownAbsolute = (drawdownPercent / 100) * state.peakValue;
        const currentValue = state.peakValue - drawdownAbsolute;
        return {
          ...state,
          drawdownPercent,
          drawdownAbsolute,
          currentValue,
          status: 'NORMAL' as DrawdownStatus
        };
      })
    );

/**
 * Generator for DrawdownState in WARNING status (between warning and max threshold)
 */
export const warningDrawdownStateArb = (): fc.Arbitrary<DrawdownState> =>
  fc.record({
    stateId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.option(fc.uuid(), { nil: undefined }),
    scope: fc.constantFrom('STRATEGY', 'PORTFOLIO') as fc.Arbitrary<'STRATEGY' | 'PORTFOLIO'>,
    peakValue: fc.double({ min: 10000, max: 1000000, noNaN: true }),
    warningThreshold: fc.double({ min: 5, max: 15, noNaN: true }),
    maxThreshold: fc.double({ min: 20, max: 50, noNaN: true }),
    lastResetAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  }).chain(state =>
    // Generate drawdown between warning and max threshold
    fc.double({ 
      min: state.warningThreshold + 0.1, 
      max: state.maxThreshold - 0.1, 
      noNaN: true 
    }).map(drawdownPercent => {
      const drawdownAbsolute = (drawdownPercent / 100) * state.peakValue;
      const currentValue = state.peakValue - drawdownAbsolute;
      return {
        ...state,
        drawdownPercent,
        drawdownAbsolute,
        currentValue,
        status: 'WARNING' as DrawdownStatus
      };
    })
  );

/**
 * Generator for DrawdownState in CRITICAL status (above max threshold)
 */
export const criticalDrawdownStateArb = (): fc.Arbitrary<DrawdownState> =>
  fc.record({
    stateId: fc.uuid(),
    tenantId: fc.uuid(),
    strategyId: fc.option(fc.uuid(), { nil: undefined }),
    scope: fc.constantFrom('STRATEGY', 'PORTFOLIO') as fc.Arbitrary<'STRATEGY' | 'PORTFOLIO'>,
    peakValue: fc.double({ min: 10000, max: 1000000, noNaN: true }),
    warningThreshold: fc.double({ min: 5, max: 15, noNaN: true }),
    maxThreshold: fc.double({ min: 20, max: 40, noNaN: true }),
    lastResetAt: isoDateStringArb(),
    updatedAt: isoDateStringArb()
  }).chain(state =>
    // Generate drawdown above max threshold
    fc.double({ 
      min: state.maxThreshold + 0.1, 
      max: Math.min(state.maxThreshold + 30, 99), 
      noNaN: true 
    }).map(drawdownPercent => {
      const drawdownAbsolute = (drawdownPercent / 100) * state.peakValue;
      const currentValue = state.peakValue - drawdownAbsolute;
      return {
        ...state,
        drawdownPercent,
        drawdownAbsolute,
        currentValue,
        status: 'CRITICAL' as DrawdownStatus
      };
    })
  );

/**
 * Generator for DrawdownState in PAUSED status
 */
export const pausedDrawdownStateArb = (): fc.Arbitrary<DrawdownState> =>
  criticalDrawdownStateArb().map(state => ({
    ...state,
    status: 'PAUSED' as DrawdownStatus
  }));

/**
 * Generator for peak and current value pairs for drawdown calculation testing
 */
export const drawdownValuePairArb = (): fc.Arbitrary<{
  peakValue: number;
  currentValue: number;
  expectedDrawdownPercent: number;
}> =>
  fc.record({
    peakValue: fc.double({ min: 1000, max: 1000000, noNaN: true }),
    drawdownPercent: fc.double({ min: 0, max: 99, noNaN: true })
  }).map(({ peakValue, drawdownPercent }) => ({
    peakValue,
    currentValue: peakValue * (1 - drawdownPercent / 100),
    expectedDrawdownPercent: drawdownPercent
  }));

/**
 * Generator for value sequence that causes drawdown threshold crossing
 */
export const drawdownThresholdCrossingArb = (): fc.Arbitrary<{
  initialValue: number;
  warningThreshold: number;
  maxThreshold: number;
  valueSequence: number[];
  expectedStatuses: DrawdownStatus[];
}> =>
  fc.record({
    initialValue: fc.double({ min: 100000, max: 1000000, noNaN: true }),
    warningThreshold: fc.double({ min: 5, max: 15, noNaN: true }),
    maxThreshold: fc.double({ min: 20, max: 40, noNaN: true })
  }).filter(({ warningThreshold, maxThreshold }) => warningThreshold < maxThreshold)
    .map(({ initialValue, warningThreshold, maxThreshold }) => {
      // Create a sequence of values that crosses thresholds
      const normalValue = initialValue * (1 - (warningThreshold - 2) / 100);
      const warningValue = initialValue * (1 - (warningThreshold + 2) / 100);
      const criticalValue = initialValue * (1 - (maxThreshold + 2) / 100);

      return {
        initialValue,
        warningThreshold,
        maxThreshold,
        valueSequence: [normalValue, warningValue, criticalValue],
        expectedStatuses: ['NORMAL', 'WARNING', 'CRITICAL'] as DrawdownStatus[]
      };
    });



/**
 * Volatility Generators
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import {
  VolatilityState,
  VolatilityConfig,
  VolatilityLevel,
  VolatilityIndexType
} from '../types/volatility';

/**
 * Generator for VolatilityLevel
 */
export const volatilityLevelArb = (): fc.Arbitrary<VolatilityLevel> =>
  fc.constantFrom('LOW', 'NORMAL', 'HIGH', 'EXTREME');

/**
 * Generator for VolatilityIndexType
 */
export const volatilityIndexTypeArb = (): fc.Arbitrary<VolatilityIndexType> =>
  fc.constantFrom('ATR', 'STD_DEV', 'REALIZED_VOL', 'IMPLIED_VOL');

/**
 * Generator for VolatilityConfig with valid thresholds
 */
export const volatilityConfigArb = (): fc.Arbitrary<VolatilityConfig> =>
  fc.record({
    configId: fc.uuid(),
    tenantId: fc.uuid(),
    assetId: fc.option(cryptoSymbolArb(), { nil: undefined }),
    indexType: volatilityIndexTypeArb(),
    normalThreshold: fc.double({ min: 5, max: 30, noNaN: true }),
    highThreshold: fc.double({ min: 30, max: 70, noNaN: true }),
    extremeThreshold: fc.double({ min: 70, max: 100, noNaN: true }),
    highThrottlePercent: fc.double({ min: 20, max: 80, noNaN: true }),
    extremeThrottlePercent: fc.double({ min: 80, max: 100, noNaN: true }),
    cooldownMinutes: fc.integer({ min: 5, max: 120 })
  }).filter(config => 
    config.normalThreshold < config.highThreshold &&
    config.highThreshold < config.extremeThreshold &&
    config.highThrottlePercent < config.extremeThrottlePercent
  );

/**
 * Generator for VolatilityState with consistent values
 */
export const volatilityStateArb = (): fc.Arbitrary<VolatilityState> =>
  fc.record({
    stateId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    currentIndex: fc.double({ min: 0, max: 100, noNaN: true }),
    indexType: volatilityIndexTypeArb(),
    level: volatilityLevelArb(),
    throttlePercent: fc.double({ min: 0, max: 100, noNaN: true }),
    allowNewEntries: fc.boolean(),
    updatedAt: isoDateStringArb()
  });

/**
 * Generator for VolatilityState in LOW level
 */
export const lowVolatilityStateArb = (): fc.Arbitrary<VolatilityState> =>
  fc.record({
    stateId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    currentIndex: fc.double({ min: 0, max: 19, noNaN: true }),
    indexType: volatilityIndexTypeArb(),
    updatedAt: isoDateStringArb()
  }).map(state => ({
    ...state,
    level: 'LOW' as VolatilityLevel,
    throttlePercent: 0,
    allowNewEntries: true
  }));

/**
 * Generator for VolatilityState in NORMAL level
 */
export const normalVolatilityStateArb = (): fc.Arbitrary<VolatilityState> =>
  fc.record({
    stateId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    currentIndex: fc.double({ min: 20, max: 49, noNaN: true }),
    indexType: volatilityIndexTypeArb(),
    updatedAt: isoDateStringArb()
  }).map(state => ({
    ...state,
    level: 'NORMAL' as VolatilityLevel,
    throttlePercent: 0,
    allowNewEntries: true
  }));

/**
 * Generator for VolatilityState in HIGH level
 */
export const highVolatilityStateArb = (): fc.Arbitrary<VolatilityState> =>
  fc.record({
    stateId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    currentIndex: fc.double({ min: 50, max: 79, noNaN: true }),
    indexType: volatilityIndexTypeArb(),
    highThrottlePercent: fc.double({ min: 20, max: 80, noNaN: true }),
    updatedAt: isoDateStringArb()
  }).map(state => ({
    stateId: state.stateId,
    assetId: state.assetId,
    currentIndex: state.currentIndex,
    indexType: state.indexType,
    level: 'HIGH' as VolatilityLevel,
    throttlePercent: state.highThrottlePercent,
    allowNewEntries: true,
    updatedAt: state.updatedAt
  }));

/**
 * Generator for VolatilityState in EXTREME level
 */
export const extremeVolatilityStateArb = (): fc.Arbitrary<VolatilityState> =>
  fc.record({
    stateId: fc.uuid(),
    assetId: cryptoSymbolArb(),
    currentIndex: fc.double({ min: 80, max: 100, noNaN: true }),
    indexType: volatilityIndexTypeArb(),
    extremeThrottlePercent: fc.double({ min: 80, max: 100, noNaN: true }),
    updatedAt: isoDateStringArb()
  }).map(state => ({
    stateId: state.stateId,
    assetId: state.assetId,
    currentIndex: state.currentIndex,
    indexType: state.indexType,
    level: 'EXTREME' as VolatilityLevel,
    throttlePercent: state.extremeThrottlePercent,
    allowNewEntries: false,
    updatedAt: state.updatedAt
  }));

/**
 * Generator for price data points for volatility calculation
 */
export const priceDataPointArb = (): fc.Arbitrary<{
  timestamp: string;
  high: number;
  low: number;
  close: number;
}> =>
  fc.record({
    timestamp: isoDateStringArb(),
    basePrice: fc.double({ min: 100, max: 100000, noNaN: true }),
    volatilityPercent: fc.double({ min: 0.5, max: 10, noNaN: true })
  }).map(({ timestamp, basePrice, volatilityPercent }) => {
    const range = basePrice * (volatilityPercent / 100);
    const high = basePrice + range / 2;
    const low = basePrice - range / 2;
    const close = low + Math.random() * range;
    return { timestamp, high, low, close };
  });

/**
 * Generator for a sequence of price data points
 */
export const priceDataSequenceArb = (length: number = 20): fc.Arbitrary<Array<{
  timestamp: string;
  high: number;
  low: number;
  close: number;
}>> =>
  fc.record({
    startPrice: fc.double({ min: 1000, max: 50000, noNaN: true }),
    volatilityPercent: fc.double({ min: 1, max: 15, noNaN: true }),
    startDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-06-01') })
  }).map(({ startPrice, volatilityPercent, startDate }) => {
    const dataPoints: Array<{ timestamp: string; high: number; low: number; close: number }> = [];
    let currentPrice = startPrice;

    for (let i = 0; i < length; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      const range = currentPrice * (volatilityPercent / 100);
      const high = currentPrice + range / 2;
      const low = currentPrice - range / 2;
      const close = low + Math.random() * range;
      
      dataPoints.push({
        timestamp: date.toISOString(),
        high,
        low,
        close
      });
      
      // Random walk for next price
      currentPrice = close * (1 + (Math.random() - 0.5) * 0.02);
    }

    return dataPoints;
  });

/**
 * Generator for volatility threshold crossing scenario
 */
export const volatilityThresholdCrossingArb = (): fc.Arbitrary<{
  assetId: string;
  normalThreshold: number;
  highThreshold: number;
  extremeThreshold: number;
  indexSequence: number[];
  expectedLevels: VolatilityLevel[];
}> =>
  fc.record({
    assetId: cryptoSymbolArb(),
    normalThreshold: fc.double({ min: 10, max: 25, noNaN: true }),
    highThreshold: fc.double({ min: 40, max: 60, noNaN: true }),
    extremeThreshold: fc.double({ min: 75, max: 90, noNaN: true })
  }).filter(({ normalThreshold, highThreshold, extremeThreshold }) =>
    normalThreshold < highThreshold && highThreshold < extremeThreshold
  ).map(({ assetId, normalThreshold, highThreshold, extremeThreshold }) => {
    // Create index values that cross each threshold
    const lowIndex = normalThreshold - 5;
    const normalIndex = (normalThreshold + highThreshold) / 2;
    const highIndex = (highThreshold + extremeThreshold) / 2;
    const extremeIndex = extremeThreshold + 5;

    return {
      assetId,
      normalThreshold,
      highThreshold,
      extremeThreshold,
      indexSequence: [lowIndex, normalIndex, highIndex, extremeIndex],
      expectedLevels: ['LOW', 'NORMAL', 'HIGH', 'EXTREME'] as VolatilityLevel[]
    };
  });

/**
 * Generator for throttle application scenario
 */
export const throttleApplicationArb = (): fc.Arbitrary<{
  orderQuantity: number;
  throttlePercent: number;
  expectedQuantity: number;
}> =>
  fc.record({
    orderQuantity: fc.double({ min: 0.1, max: 1000, noNaN: true }),
    throttlePercent: fc.double({ min: 0, max: 100, noNaN: true })
  }).map(({ orderQuantity, throttlePercent }) => ({
    orderQuantity,
    throttlePercent,
    expectedQuantity: orderQuantity * (1 - throttlePercent / 100)
  }));

/**
 * Generator for cooldown scenario
 */
export const cooldownScenarioArb = (): fc.Arbitrary<{
  assetId: string;
  previousLevel: VolatilityLevel;
  newLevel: VolatilityLevel;
  cooldownMinutes: number;
  shouldApplyCooldown: boolean;
}> =>
  fc.record({
    assetId: cryptoSymbolArb(),
    previousLevel: fc.constantFrom('HIGH', 'EXTREME') as fc.Arbitrary<VolatilityLevel>,
    newLevel: fc.constantFrom('LOW', 'NORMAL') as fc.Arbitrary<VolatilityLevel>,
    cooldownMinutes: fc.integer({ min: 5, max: 60 })
  }).map(scenario => ({
    ...scenario,
    shouldApplyCooldown: true
  }));


/**
 * Kill Switch Generators
 * Requirements: 4.1, 4.2, 4.3, 4.5
 */

import {
  KillSwitchState,
  KillSwitchConfig,
  KillSwitchScope,
  KillSwitchScopeType,
  KillTriggerType,
  KillTriggerCondition,
  AutoKillTrigger
} from '../types/kill-switch';

/**
 * Generator for KillTriggerType
 */
export const killTriggerTypeArb = (): fc.Arbitrary<KillTriggerType> =>
  fc.constantFrom('MANUAL', 'AUTOMATIC');

/**
 * Generator for KillSwitchScopeType
 */
export const killSwitchScopeTypeArb = (): fc.Arbitrary<KillSwitchScopeType> =>
  fc.constantFrom('TENANT', 'STRATEGY', 'ASSET');

/**
 * Generator for KillSwitchScope
 */
export const killSwitchScopeArb = (): fc.Arbitrary<KillSwitchScope> =>
  killSwitchScopeTypeArb().chain(type =>
    fc.record({
      type: fc.constant(type),
      id: type === 'TENANT' ? fc.constant(undefined) : fc.uuid()
    })
  );

/**
 * Generator for KillTriggerCondition
 */
export const killTriggerConditionArb = (): fc.Arbitrary<KillTriggerCondition> =>
  fc.oneof(
    fc.record({
      type: fc.constant('RAPID_LOSS' as const),
      lossPercent: fc.double({ min: 1, max: 50, noNaN: true }),
      timeWindowMinutes: fc.integer({ min: 1, max: 60 })
    }),
    fc.record({
      type: fc.constant('ERROR_RATE' as const),
      errorPercent: fc.double({ min: 1, max: 100, noNaN: true }),
      timeWindowMinutes: fc.integer({ min: 1, max: 60 })
    }),
    fc.record({
      type: fc.constant('SYSTEM_ERROR' as const),
      errorTypes: fc.array(
        fc.constantFrom('CONNECTION_LOST', 'EXCHANGE_ERROR', 'DATA_CORRUPTION', 'TIMEOUT'),
        { minLength: 1, maxLength: 4 }
      )
    })
  );

/**
 * Generator for AutoKillTrigger
 */
export const autoKillTriggerArb = (): fc.Arbitrary<AutoKillTrigger> =>
  fc.record({
    triggerId: fc.uuid(),
    condition: killTriggerConditionArb(),
    enabled: fc.boolean()
  });

/**
 * Generator for KillSwitchConfig
 */
export const killSwitchConfigArb = (): fc.Arbitrary<KillSwitchConfig> =>
  fc.record({
    configId: fc.uuid(),
    tenantId: fc.uuid(),
    autoTriggers: fc.array(autoKillTriggerArb(), { minLength: 0, maxLength: 5 }),
    requireAuthForDeactivation: fc.boolean(),
    notificationChannels: fc.array(
      fc.constantFrom('email', 'sms', 'webhook', 'slack'),
      { minLength: 0, maxLength: 4 }
    )
  });

/**
 * Generator for KillSwitchState (inactive)
 */
export const inactiveKillSwitchStateArb = (): fc.Arbitrary<KillSwitchState> =>
  fc.record({
    tenantId: fc.uuid(),
    active: fc.constant(false),
    triggerType: killTriggerTypeArb(),
    scope: killSwitchScopeTypeArb(),
    scopeId: fc.option(fc.uuid(), { nil: undefined }),
    pendingOrdersCancelled: fc.constant(0)
  });

/**
 * Generator for KillSwitchState (active)
 */
export const activeKillSwitchStateArb = (): fc.Arbitrary<KillSwitchState> =>
  fc.record({
    tenantId: fc.uuid(),
    active: fc.constant(true),
    activatedAt: isoDateStringArb(),
    activatedBy: fc.option(fc.uuid(), { nil: undefined }),
    activationReason: fc.string({ minLength: 5, maxLength: 200 }),
    triggerType: killTriggerTypeArb(),
    scope: killSwitchScopeTypeArb(),
    scopeId: fc.option(fc.uuid(), { nil: undefined }),
    pendingOrdersCancelled: fc.integer({ min: 0, max: 100 })
  });

/**
 * Generator for KillSwitchState (either active or inactive)
 */
export const killSwitchStateArb = (): fc.Arbitrary<KillSwitchState> =>
  fc.oneof(inactiveKillSwitchStateArb(), activeKillSwitchStateArb());

/**
 * Generator for risk event that could trigger auto-kill
 */
export const riskEventForTriggerArb = (): fc.Arbitrary<{
  eventType: import('../types/risk-event').RiskEventType;
  severity: string;
  lossPercent?: number;
  errorRate?: number;
  errorType?: string;
  timestamp: string;
}> =>
  fc.record({
    eventType: fc.constantFrom(
      'LIMIT_BREACH', 'DRAWDOWN_BREACH', 'EXCHANGE_ERROR', 'ORDER_REJECTED'
    ) as fc.Arbitrary<import('../types/risk-event').RiskEventType>,
    severity: fc.constantFrom('INFO', 'WARNING', 'CRITICAL', 'EMERGENCY'),
    lossPercent: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
    errorRate: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
    errorType: fc.option(
      fc.constantFrom('CONNECTION_LOST', 'EXCHANGE_ERROR', 'DATA_CORRUPTION', 'TIMEOUT'),
      { nil: undefined }
    ),
    timestamp: isoDateStringArb()
  });

/**
 * Generator for auto-trigger scenario that should trigger kill switch
 */
export const triggeringAutoKillScenarioArb = (): fc.Arbitrary<{
  config: KillSwitchConfig;
  event: {
    eventType: import('../types/risk-event').RiskEventType;
    severity: string;
    lossPercent?: number;
    errorRate?: number;
    errorType?: string;
    timestamp: string;
  };
}> =>
  fc.oneof(
    // RAPID_LOSS trigger scenario
    fc.record({
      lossThreshold: fc.double({ min: 5, max: 30, noNaN: true }),
      timeWindow: fc.integer({ min: 5, max: 30 })
    }).chain(({ lossThreshold, timeWindow }) =>
      fc.record({
        config: fc.record({
          configId: fc.uuid(),
          tenantId: fc.uuid(),
          autoTriggers: fc.constant([{
            triggerId: 'trigger-1',
            condition: {
              type: 'RAPID_LOSS' as const,
              lossPercent: lossThreshold,
              timeWindowMinutes: timeWindow
            },
            enabled: true
          }]),
          requireAuthForDeactivation: fc.boolean(),
          notificationChannels: fc.constant([])
        }),
        event: fc.record({
          eventType: fc.constant('DRAWDOWN_BREACH' as const),
          severity: fc.constant('CRITICAL'),
          lossPercent: fc.double({ min: lossThreshold, max: 100, noNaN: true }),
          timestamp: isoDateStringArb()
        })
      })
    ),
    // ERROR_RATE trigger scenario
    fc.record({
      errorThreshold: fc.double({ min: 10, max: 50, noNaN: true }),
      timeWindow: fc.integer({ min: 5, max: 30 })
    }).chain(({ errorThreshold, timeWindow }) =>
      fc.record({
        config: fc.record({
          configId: fc.uuid(),
          tenantId: fc.uuid(),
          autoTriggers: fc.constant([{
            triggerId: 'trigger-2',
            condition: {
              type: 'ERROR_RATE' as const,
              errorPercent: errorThreshold,
              timeWindowMinutes: timeWindow
            },
            enabled: true
          }]),
          requireAuthForDeactivation: fc.boolean(),
          notificationChannels: fc.constant([])
        }),
        event: fc.record({
          eventType: fc.constant('EXCHANGE_ERROR' as const),
          severity: fc.constant('CRITICAL'),
          errorRate: fc.double({ min: errorThreshold, max: 100, noNaN: true }),
          timestamp: isoDateStringArb()
        })
      })
    ),
    // SYSTEM_ERROR trigger scenario
    fc.constantFrom('CONNECTION_LOST', 'EXCHANGE_ERROR', 'DATA_CORRUPTION').chain(errorType =>
      fc.record({
        config: fc.record({
          configId: fc.uuid(),
          tenantId: fc.uuid(),
          autoTriggers: fc.constant([{
            triggerId: 'trigger-3',
            condition: {
              type: 'SYSTEM_ERROR' as const,
              errorTypes: [errorType]
            },
            enabled: true
          }]),
          requireAuthForDeactivation: fc.boolean(),
          notificationChannels: fc.constant([])
        }),
        event: fc.record({
          eventType: fc.constant('EXCHANGE_ERROR' as const),
          severity: fc.constant('EMERGENCY'),
          errorType: fc.constant(errorType),
          timestamp: isoDateStringArb()
        })
      })
    )
  );

/**
 * Generator for auto-trigger scenario that should NOT trigger kill switch
 */
export const nonTriggeringAutoKillScenarioArb = (): fc.Arbitrary<{
  config: KillSwitchConfig;
  event: {
    eventType: import('../types/risk-event').RiskEventType;
    severity: string;
    lossPercent?: number;
    errorRate?: number;
    errorType?: string;
    timestamp: string;
  };
}> =>
  fc.record({
    lossThreshold: fc.double({ min: 20, max: 50, noNaN: true }),
    timeWindow: fc.integer({ min: 5, max: 30 })
  }).chain(({ lossThreshold, timeWindow }) =>
    fc.record({
      config: fc.record({
        configId: fc.uuid(),
        tenantId: fc.uuid(),
        autoTriggers: fc.constant([{
          triggerId: 'trigger-1',
          condition: {
            type: 'RAPID_LOSS' as const,
            lossPercent: lossThreshold,
            timeWindowMinutes: timeWindow
          },
          enabled: true
        }]),
        requireAuthForDeactivation: fc.boolean(),
        notificationChannels: fc.constant([])
      }),
      event: fc.record({
        eventType: fc.constant('DRAWDOWN_WARNING' as const),
        severity: fc.constant('WARNING'),
        // Loss percent below threshold
        lossPercent: fc.double({ min: 0, max: lossThreshold - 1, noNaN: true }),
        timestamp: isoDateStringArb()
      })
    })
  );
