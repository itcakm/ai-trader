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
  PREDICTIONS: process.env.PREDICTIONS_TABLE || 'performance-predictions'
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
  }
} as const;
