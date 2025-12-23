import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { StrategyVersion, ParameterValue } from '../types/strategy';
import { ResourceNotFoundError } from '../db/access';

/**
 * Query parameters for listing versions
 */
export interface ListVersionsParams {
  strategyId: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Result of a paginated version query
 */
export interface PaginatedVersionResult {
  items: StrategyVersion[];
  lastEvaluatedKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Version Repository - manages strategy version persistence and retrieval
 * 
 * Versions are stored with strategyId as partition key and version as sort key,
 * allowing efficient retrieval of specific versions and version history.
 * 
 * Requirements: 3.1, 3.4
 */
export const VersionRepository = {
  /**
   * Get a specific version of a strategy
   * 
   * @param strategyId - The unique identifier of the strategy
   * @param version - The specific version number to retrieve
   * @returns A deep copy of the version, or null if not found
   */
  async getVersion(
    strategyId: string,
    version: number
  ): Promise<StrategyVersion | null> {
    const result = await documentClient.get({
      TableName: TableNames.VERSIONS,
      Key: {
        [KeySchemas.VERSIONS.partitionKey]: strategyId,
        [KeySchemas.VERSIONS.sortKey]: version
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Return a deep copy to ensure immutability
    return this.deepCopyVersion(result.Item as StrategyVersion);
  },

  /**
   * Get all versions of a strategy ordered by creation time (ascending)
   * 
   * Requirements: 3.3, 3.4
   * 
   * @param strategyId - The unique identifier of the strategy
   * @returns All versions ordered by creation timestamp ascending
   */
  async getVersionHistory(strategyId: string): Promise<StrategyVersion[]> {
    const result = await documentClient.query({
      TableName: TableNames.VERSIONS,
      KeyConditionExpression: '#pk = :strategyId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.VERSIONS.partitionKey
      },
      ExpressionAttributeValues: {
        ':strategyId': strategyId
      },
      ScanIndexForward: true // Ascending order by version (sort key)
    }).promise();

    const versions = (result.Items || []) as StrategyVersion[];
    
    // Sort by createdAt to ensure ordering by creation time
    versions.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Return deep copies to ensure immutability
    return versions.map(v => this.deepCopyVersion(v));
  },

  /**
   * Save a new version (versions are immutable once created)
   * 
   * @param version - The version to save
   */
  async putVersion(version: StrategyVersion): Promise<void> {
    await documentClient.put({
      TableName: TableNames.VERSIONS,
      Item: version,
      // Prevent overwriting existing versions (immutability)
      ConditionExpression: 'attribute_not_exists(#pk) AND attribute_not_exists(#sk)',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.VERSIONS.partitionKey,
        '#sk': KeySchemas.VERSIONS.sortKey
      }
    }).promise();
  },

  /**
   * Check if a specific version exists
   * 
   * @param strategyId - The unique identifier of the strategy
   * @param version - The version number to check
   * @returns True if the version exists, false otherwise
   */
  async versionExists(strategyId: string, version: number): Promise<boolean> {
    const result = await documentClient.get({
      TableName: TableNames.VERSIONS,
      Key: {
        [KeySchemas.VERSIONS.partitionKey]: strategyId,
        [KeySchemas.VERSIONS.sortKey]: version
      },
      ProjectionExpression: '#pk',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.VERSIONS.partitionKey
      }
    }).promise();

    return result.Item !== undefined;
  },

  /**
   * Get the latest version number for a strategy
   * 
   * @param strategyId - The unique identifier of the strategy
   * @returns The latest version number, or 0 if no versions exist
   */
  async getLatestVersionNumber(strategyId: string): Promise<number> {
    const result = await documentClient.query({
      TableName: TableNames.VERSIONS,
      KeyConditionExpression: '#pk = :strategyId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.VERSIONS.partitionKey,
        '#v': 'version'
      },
      ExpressionAttributeValues: {
        ':strategyId': strategyId
      },
      ScanIndexForward: false, // Descending order
      Limit: 1,
      ProjectionExpression: '#v'
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return 0;
    }

    return result.Items[0].version as number;
  },

  /**
   * Create a deep copy of a version to ensure immutability
   * 
   * @param version - The version to copy
   * @returns A deep copy of the version
   */
  deepCopyVersion(version: StrategyVersion): StrategyVersion {
    return {
      strategyId: version.strategyId,
      version: version.version,
      parameters: { ...version.parameters },
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      changeDescription: version.changeDescription
    };
  },

  /**
   * Create a new version for a strategy
   * 
   * Requirements: 3.1
   * 
   * @param strategyId - The strategy ID
   * @param parameters - The parameter values for this version
   * @param createdBy - The tenant/user who created this version
   * @param changeDescription - Optional description of changes
   * @returns The newly created version
   */
  async createVersion(
    strategyId: string,
    parameters: Record<string, ParameterValue>,
    createdBy: string,
    changeDescription?: string
  ): Promise<StrategyVersion> {
    const latestVersion = await this.getLatestVersionNumber(strategyId);
    const newVersionNumber = latestVersion + 1;
    const now = new Date().toISOString();

    const newVersion: StrategyVersion = {
      strategyId,
      version: newVersionNumber,
      parameters: { ...parameters },
      createdAt: now,
      createdBy,
      changeDescription
    };

    await this.putVersion(newVersion);

    return this.deepCopyVersion(newVersion);
  }
};
