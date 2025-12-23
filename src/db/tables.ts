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
  DATA_SOURCES: process.env.DATA_SOURCES_TABLE || 'data-sources'
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
  }
} as const;
