/**
 * DynamoDB table configurations for Strategy Management
 */

/**
 * Table name constants - use environment variables for flexibility across environments
 */
export const TableNames = {
  TEMPLATES: process.env.TEMPLATES_TABLE || 'strategy-templates',
  STRATEGIES: process.env.STRATEGIES_TABLE || 'strategies',
  VERSIONS: process.env.VERSIONS_TABLE || 'strategy-versions',
  DEPLOYMENTS: process.env.DEPLOYMENTS_TABLE || 'deployments',
  DATA_SOURCES: process.env.DATA_SOURCES_TABLE || 'data-sources',
  NEWS_EVENTS: process.env.NEWS_EVENTS_TABLE || 'news-events',
  SENTIMENT_DATA: process.env.SENTIMENT_TABLE || 'sentiment-data',
  STREAMS: process.env.STREAMS_TABLE || 'streams',
  BACKFILL_REQUESTS: process.env.BACKFILL_REQUESTS_TABLE || 'backfill-requests',
  PROVIDERS: process.env.PROVIDERS_TABLE || 'ai-providers',
  MODEL_CONFIGURATIONS: process.env.MODEL_CONFIGURATIONS_TABLE || 'model-configurations',
  ALLOCATIONS: process.env.ALLOCATIONS_TABLE || 'fund-allocations',
  PERFORMANCE: process.env.PERFORMANCE_TABLE || 'model-performance',
  PREDICTIONS: process.env.PREDICTIONS_TABLE || 'performance-predictions',
  POSITION_LIMITS: process.env.POSITION_LIMITS_TABLE || 'position-limits',
  DRAWDOWN_STATE: process.env.DRAWDOWN_STATE_TABLE || 'drawdown-state',
  DRAWDOWN_CONFIG: process.env.DRAWDOWN_CONFIG_TABLE || 'drawdown-config',
  VOLATILITY_STATE: process.env.VOLATILITY_STATE_TABLE || 'volatility-state',
  VOLATILITY_CONFIG: process.env.VOLATILITY_CONFIG_TABLE || 'volatility-config',
  KILL_SWITCH_STATE: process.env.KILL_SWITCH_STATE_TABLE || 'kill-switch-state',
  KILL_SWITCH_CONFIG: process.env.KILL_SWITCH_CONFIG_TABLE || 'kill-switch-config',
  CIRCUIT_BREAKERS: process.env.CIRCUIT_BREAKERS_TABLE || 'circuit-breakers',
  CIRCUIT_BREAKER_EVENTS: process.env.CIRCUIT_BREAKER_EVENTS_TABLE || 'circuit-breaker-events',
  RISK_PROFILES: process.env.RISK_PROFILES_TABLE || 'risk-profiles',
  STRATEGY_PROFILE_ASSIGNMENTS: process.env.STRATEGY_PROFILE_ASSIGNMENTS_TABLE || 'strategy-profile-assignments',
  EXCHANGE_LIMITS: process.env.EXCHANGE_LIMITS_TABLE || 'exchange-limits',
  EXCHANGE_HEALTH: process.env.EXCHANGE_HEALTH_TABLE || 'exchange-health',
  RATE_LIMIT_STATE: process.env.RATE_LIMIT_STATE_TABLE || 'rate-limit-state',
  RISK_EVENTS: process.env.RISK_EVENTS_TABLE || 'risk-events',
  ALERT_CONFIGS: process.env.ALERT_CONFIGS_TABLE || 'alert-configs'
} as const;

/**
 * Key schema definitions for each table
 */
export const KeySchemas = {
  /**
   * Templates Table
   * - Partition Key: templateId
   * - Sort Key: version
   */
  TEMPLATES: {
    partitionKey: 'templateId',
    sortKey: 'version'
  },

  /**
   * Strategies Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: strategyId
   */
  STRATEGIES: {
    partitionKey: 'tenantId',
    sortKey: 'strategyId'
  },

  /**
   * Versions Table
   * - Partition Key: strategyId
   * - Sort Key: version
   */
  VERSIONS: {
    partitionKey: 'strategyId',
    sortKey: 'version'
  },

  /**
   * Deployments Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: deploymentId
   */
  DEPLOYMENTS: {
    partitionKey: 'tenantId',
    sortKey: 'deploymentId'
  },

  /**
   * Data Sources Table
   * - Partition Key: sourceId
   */
  DATA_SOURCES: {
    partitionKey: 'sourceId'
  },

  /**
   * News Events Table
   * - Partition Key: symbol
   * - Sort Key: publishedAt#eventId
   */
  NEWS_EVENTS: {
    partitionKey: 'symbol',
    sortKey: 'publishedAtEventId'
  },

  /**
   * Sentiment Data Table
   * - Partition Key: symbol
   * - Sort Key: timestamp
   */
  SENTIMENT_DATA: {
    partitionKey: 'symbol',
    sortKey: 'timestamp'
  },

  /**
   * Streams Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: streamId
   */
  STREAMS: {
    partitionKey: 'tenantId',
    sortKey: 'streamId'
  },

  /**
   * Backfill Requests Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: requestId
   */
  BACKFILL_REQUESTS: {
    partitionKey: 'tenantId',
    sortKey: 'requestId'
  },

  /**
   * AI Providers Table
   * - Partition Key: providerId
   */
  PROVIDERS: {
    partitionKey: 'providerId'
  },

  /**
   * Model Configurations Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: configId
   */
  MODEL_CONFIGURATIONS: {
    partitionKey: 'tenantId',
    sortKey: 'configId'
  },

  /**
   * Fund Allocations Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: strategyId#version (composite for versioning)
   */
  ALLOCATIONS: {
    partitionKey: 'tenantId',
    sortKey: 'strategyIdVersion'
  },

  /**
   * Model Performance Table
   * - Partition Key: tenantId#modelConfigId (composite for tenant isolation)
   * - Sort Key: period#periodStart (composite for time-based queries)
   */
  PERFORMANCE: {
    partitionKey: 'tenantModelConfigId',
    sortKey: 'periodPeriodStart'
  },

  /**
   * Performance Predictions Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: predictionId
   */
  PREDICTIONS: {
    partitionKey: 'tenantId',
    sortKey: 'predictionId'
  },

  /**
   * Position Limits Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: limitId
   */
  POSITION_LIMITS: {
    partitionKey: 'tenantId',
    sortKey: 'limitId'
  },

  /**
   * Drawdown State Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: stateId
   */
  DRAWDOWN_STATE: {
    partitionKey: 'tenantId',
    sortKey: 'stateId'
  },

  /**
   * Drawdown Config Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: configId
   */
  DRAWDOWN_CONFIG: {
    partitionKey: 'tenantId',
    sortKey: 'configId'
  },

  /**
   * Volatility State Table
   * - Partition Key: stateId
   * - GSI: assetId-index for querying by asset
   */
  VOLATILITY_STATE: {
    partitionKey: 'stateId'
  },

  /**
   * Volatility Config Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: configId
   */
  VOLATILITY_CONFIG: {
    partitionKey: 'tenantId',
    sortKey: 'configId'
  },

  /**
   * Kill Switch State Table
   * - Partition Key: tenantId (for tenant isolation)
   * - No Sort Key (one state per tenant)
   */
  KILL_SWITCH_STATE: {
    partitionKey: 'tenantId'
  },

  /**
   * Kill Switch Config Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: configId
   */
  KILL_SWITCH_CONFIG: {
    partitionKey: 'tenantId',
    sortKey: 'configId'
  },

  /**
   * Circuit Breakers Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: breakerId
   */
  CIRCUIT_BREAKERS: {
    partitionKey: 'tenantId',
    sortKey: 'breakerId'
  },

  /**
   * Circuit Breaker Events Table
   * - Partition Key: tenantId#breakerId (composite for tenant isolation)
   * - Sort Key: timestamp
   */
  CIRCUIT_BREAKER_EVENTS: {
    partitionKey: 'tenantBreakerId',
    sortKey: 'timestamp'
  },

  /**
   * Risk Profiles Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: profileId#version (composite for versioning)
   */
  RISK_PROFILES: {
    partitionKey: 'tenantId',
    sortKey: 'profileIdVersion'
  },

  /**
   * Strategy Profile Assignments Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: strategyId
   */
  STRATEGY_PROFILE_ASSIGNMENTS: {
    partitionKey: 'tenantId',
    sortKey: 'strategyId'
  },

  /**
   * Exchange Limits Table
   * - Partition Key: exchangeId
   * - Sort Key: assetId
   */
  EXCHANGE_LIMITS: {
    partitionKey: 'exchangeId',
    sortKey: 'assetId'
  },

  /**
   * Exchange Health Table
   * - Partition Key: exchangeId
   */
  EXCHANGE_HEALTH: {
    partitionKey: 'exchangeId'
  },

  /**
   * Rate Limit State Table
   * - Partition Key: exchangeId
   */
  RATE_LIMIT_STATE: {
    partitionKey: 'exchangeId'
  },

  /**
   * Risk Events Table
   * - Partition Key: tenantId (for tenant isolation)
   * - Sort Key: timestamp#eventId (composite for time-based queries)
   * - TTL: expiresAt for retention management
   */
  RISK_EVENTS: {
    partitionKey: 'tenantId',
    sortKey: 'timestampEventId'
  },

  /**
   * Alert Configs Table
   * - Partition Key: tenantId (for tenant isolation)
   */
  ALERT_CONFIGS: {
    partitionKey: 'tenantId'
  }
} as const;

/**
 * Global Secondary Index definitions
 */
export const GSINames = {
  TEMPLATES: {
    NAME_INDEX: 'name-index'
  },
  DEPLOYMENTS: {
    STRATEGY_INDEX: 'strategyId-index'
  },
  DATA_SOURCES: {
    TYPE_INDEX: 'type-index',
    STATUS_INDEX: 'status-index'
  },
  NEWS_EVENTS: {
    CONTENT_HASH_INDEX: 'contentHash-index',
    SOURCE_PUBLISHED_INDEX: 'source-publishedAt-index'
  },
  SENTIMENT_DATA: {
    SOURCE_INDEX: 'aggregatedFrom-timestamp-index'
  },
  STREAMS: {
    STATUS_INDEX: 'status-index',
    SOURCE_INDEX: 'sourceId-index'
  },
  BACKFILL_REQUESTS: {
    STATUS_INDEX: 'status-index',
    SOURCE_INDEX: 'sourceId-index'
  },
  PROVIDERS: {
    TYPE_INDEX: 'type-index',
    STATUS_INDEX: 'status-index'
  },
  MODEL_CONFIGURATIONS: {
    PROVIDER_INDEX: 'providerId-index'
  },
  ALLOCATIONS: {
    STRATEGY_VERSION_INDEX: 'strategyId-version-index'
  },
  PREDICTIONS: {
    MODEL_TIMESTAMP_INDEX: 'modelConfigId-timestamp-index'
  },
  POSITION_LIMITS: {
    SCOPE_INDEX: 'scope-index',
    ASSET_INDEX: 'assetId-index',
    STRATEGY_INDEX: 'strategyId-index'
  },
  DRAWDOWN_STATE: {
    SCOPE_INDEX: 'scope-index',
    STRATEGY_INDEX: 'strategyId-index',
    STATUS_INDEX: 'status-index'
  },
  DRAWDOWN_CONFIG: {
    STRATEGY_INDEX: 'strategyId-index'
  },
  VOLATILITY_STATE: {
    ASSET_INDEX: 'assetId-index',
    LEVEL_INDEX: 'level-index'
  },
  VOLATILITY_CONFIG: {
    ASSET_INDEX: 'assetId-index'
  },
  KILL_SWITCH_STATE: {
    SCOPE_INDEX: 'scope-index',
    ACTIVE_INDEX: 'active-index'
  },
  KILL_SWITCH_CONFIG: {
    // No additional indexes needed
  },
  CIRCUIT_BREAKERS: {
    SCOPE_INDEX: 'scope-index',
    STATE_INDEX: 'state-index',
    SCOPE_ID_INDEX: 'scopeId-index'
  },
  CIRCUIT_BREAKER_EVENTS: {
    BREAKER_INDEX: 'breakerId-index'
  },
  RISK_PROFILES: {
    NAME_INDEX: 'name-index',
    PROFILE_ID_INDEX: 'profileId-index'
  },
  STRATEGY_PROFILE_ASSIGNMENTS: {
    PROFILE_INDEX: 'profileId-index'
  },
  EXCHANGE_LIMITS: {
    ASSET_INDEX: 'assetId-index'
  },
  EXCHANGE_HEALTH: {
    STATUS_INDEX: 'status-index'
  },
  RATE_LIMIT_STATE: {
    // No additional indexes needed
  },
  RISK_EVENTS: {
    EVENT_TYPE_INDEX: 'eventType-timestamp-index',
    SEVERITY_INDEX: 'severity-timestamp-index',
    STRATEGY_INDEX: 'strategyId-timestamp-index',
    ASSET_INDEX: 'assetId-timestamp-index'
  },
  ALERT_CONFIGS: {
    // No additional indexes needed
  }
} as const;
