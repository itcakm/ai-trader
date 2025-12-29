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
