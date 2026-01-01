import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { RiskProfile } from '../types/risk-profile';
import {
  TenantAccessDeniedError,
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult
} from '../db/access';

/**
 * Strategy Profile Assignment - links strategies to risk profiles
 */
export interface StrategyProfileAssignment {
  tenantId: string;
  strategyId: string;
  profileId: string;
  assignedAt: string;
  assignedBy?: string;
}

/**
 * Risk Profile Repository - manages risk profile persistence with tenant isolation and versioning
 * 
 * Risk profiles are stored with tenantId as partition key and profileId#version as sort key,
 * enabling versioned storage where each update creates a new version.
 * 
 * Requirements: 8.1, 8.6
 */
export const RiskProfileRepository = {
  /**
   * Create the composite sort key for a profile
   */
  createSortKey(profileId: string, version: number): string {
    return `${profileId}#${version.toString().padStart(10, '0')}`;
  },

  /**
   * Parse the composite sort key to extract profileId and version
   */
  parseSortKey(sortKey: string): { profileId: string; version: number } {
    const lastHashIndex = sortKey.lastIndexOf('#');
    const profileId = sortKey.substring(0, lastHashIndex);
    const version = parseInt(sortKey.substring(lastHashIndex + 1), 10);
    return { profileId, version };
  },

  /**
   * Get a specific version of a risk profile
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @param version - The version number
   * @returns The risk profile, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getProfile(tenantId: string, profileId: string, version: number): Promise<RiskProfile | null> {
    const sortKey = this.createSortKey(profileId, version);
    
    const result = await documentClient.get({
      TableName: TableNames.RISK_PROFILES,
      Key: {
        [KeySchemas.RISK_PROFILES.partitionKey]: tenantId,
        [KeySchemas.RISK_PROFILES.sortKey]: sortKey
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'risk-profile');
    }

    return result.Item as RiskProfile;
  },

  /**
   * Get the latest version of a risk profile
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @returns The latest version of the risk profile, or null if not found
   */
  async getLatestProfile(tenantId: string, profileId: string): Promise<RiskProfile | null> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.RISK_PROFILES,
      KeyConditionExpression: '#pk = :tenantId AND begins_with(#sk, :profilePrefix)',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.RISK_PROFILES.partitionKey,
        '#sk': KeySchemas.RISK_PROFILES.sortKey
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':profilePrefix': `${profileId}#`
      },
      ScanIndexForward: false, // Descending order to get latest version first
      Limit: 1
    };

    const result = await documentClient.query(queryParams).promise();
    
    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as RiskProfile;
  },

  /**
   * Get all versions of a risk profile (profile history)
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @returns All versions of the profile, ordered by version descending
   */
  async getProfileHistory(tenantId: string, profileId: string): Promise<RiskProfile[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.RISK_PROFILES,
      KeyConditionExpression: '#pk = :tenantId AND begins_with(#sk, :profilePrefix)',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.RISK_PROFILES.partitionKey,
        '#sk': KeySchemas.RISK_PROFILES.sortKey
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':profilePrefix': `${profileId}#`
      },
      ScanIndexForward: false // Descending order (newest first)
    };

    const result = await documentClient.query(queryParams).promise();
    return (result.Items || []) as RiskProfile[];
  },

  /**
   * List all risk profiles for a tenant (latest versions only)
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of risk profiles (latest versions)
   */
  async listProfiles(params: TenantQueryParams): Promise<PaginatedResult<RiskProfile>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.RISK_PROFILES,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.RISK_PROFILES.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': params.tenantId
      }
    };

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();
    const allItems = (result.Items || []) as RiskProfile[];

    // Group by profileId and keep only the latest version
    const latestByProfileId = new Map<string, RiskProfile>();
    for (const profile of allItems) {
      const existing = latestByProfileId.get(profile.profileId);
      if (!existing || profile.version > existing.version) {
        latestByProfileId.set(profile.profileId, profile);
      }
    }

    let items = Array.from(latestByProfileId.values());
    
    // Apply limit after deduplication
    if (params.limit && items.length > params.limit) {
      items = items.slice(0, params.limit);
    }

    return {
      items,
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a risk profile version
   * 
   * @param tenantId - The tenant identifier (must match profile.tenantId)
   * @param profile - The risk profile to save
   * @throws TenantAccessDeniedError if tenantId doesn't match profile.tenantId
   */
  async putProfile(tenantId: string, profile: RiskProfile): Promise<void> {
    // Verify the profile belongs to the tenant
    if (profile.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'risk-profile');
    }

    const sortKey = this.createSortKey(profile.profileId, profile.version);

    await documentClient.put({
      TableName: TableNames.RISK_PROFILES,
      Item: {
        ...profile,
        [KeySchemas.RISK_PROFILES.sortKey]: sortKey
      }
    }).promise();
  },

  /**
   * Delete all versions of a risk profile
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @throws ResourceNotFoundError if profile doesn't exist
   */
  async deleteProfile(tenantId: string, profileId: string): Promise<void> {
    // Get all versions
    const versions = await this.getProfileHistory(tenantId, profileId);
    
    if (versions.length === 0) {
      throw new ResourceNotFoundError('RiskProfile', profileId);
    }

    // Delete all versions
    for (const version of versions) {
      const sortKey = this.createSortKey(version.profileId, version.version);
      await documentClient.delete({
        TableName: TableNames.RISK_PROFILES,
        Key: {
          [KeySchemas.RISK_PROFILES.partitionKey]: tenantId,
          [KeySchemas.RISK_PROFILES.sortKey]: sortKey
        }
      }).promise();
    }
  },

  /**
   * Get the next version number for a profile
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @returns The next version number (1 if profile doesn't exist)
   */
  async getNextVersion(tenantId: string, profileId: string): Promise<number> {
    const latest = await this.getLatestProfile(tenantId, profileId);
    return latest ? latest.version + 1 : 1;
  },

  /**
   * Check if a risk profile exists
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @returns True if the profile exists, false otherwise
   */
  async profileExists(tenantId: string, profileId: string): Promise<boolean> {
    const profile = await this.getLatestProfile(tenantId, profileId);
    return profile !== null;
  },

  // ==================== Strategy Profile Assignment Operations ====================

  /**
   * Assign a risk profile to a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @param profileId - The profile identifier
   * @param assignedBy - Optional user who made the assignment
   */
  async assignProfileToStrategy(
    tenantId: string,
    strategyId: string,
    profileId: string,
    assignedBy?: string
  ): Promise<StrategyProfileAssignment> {
    const assignment: StrategyProfileAssignment = {
      tenantId,
      strategyId,
      profileId,
      assignedAt: new Date().toISOString(),
      assignedBy
    };

    await documentClient.put({
      TableName: TableNames.STRATEGY_PROFILE_ASSIGNMENTS,
      Item: assignment
    }).promise();

    return assignment;
  },

  /**
   * Get the profile assignment for a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   * @returns The assignment, or null if not found
   */
  async getStrategyAssignment(
    tenantId: string,
    strategyId: string
  ): Promise<StrategyProfileAssignment | null> {
    const result = await documentClient.get({
      TableName: TableNames.STRATEGY_PROFILE_ASSIGNMENTS,
      Key: {
        [KeySchemas.STRATEGY_PROFILE_ASSIGNMENTS.partitionKey]: tenantId,
        [KeySchemas.STRATEGY_PROFILE_ASSIGNMENTS.sortKey]: strategyId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return result.Item as StrategyProfileAssignment;
  },

  /**
   * Get all strategies assigned to a profile
   * 
   * @param tenantId - The tenant identifier
   * @param profileId - The profile identifier
   * @returns List of strategy IDs assigned to the profile
   */
  async getStrategiesForProfile(tenantId: string, profileId: string): Promise<string[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.STRATEGY_PROFILE_ASSIGNMENTS,
      KeyConditionExpression: '#pk = :tenantId',
      FilterExpression: '#profileId = :profileId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.STRATEGY_PROFILE_ASSIGNMENTS.partitionKey,
        '#profileId': 'profileId'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':profileId': profileId
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return (result.Items || []).map(item => item.strategyId as string);
  },

  /**
   * Remove a profile assignment from a strategy
   * 
   * @param tenantId - The tenant identifier
   * @param strategyId - The strategy identifier
   */
  async removeStrategyAssignment(tenantId: string, strategyId: string): Promise<void> {
    await documentClient.delete({
      TableName: TableNames.STRATEGY_PROFILE_ASSIGNMENTS,
      Key: {
        [KeySchemas.STRATEGY_PROFILE_ASSIGNMENTS.partitionKey]: tenantId,
        [KeySchemas.STRATEGY_PROFILE_ASSIGNMENTS.sortKey]: strategyId
      }
    }).promise();
  },

  /**
   * List all profile assignments for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns List of all strategy-profile assignments
   */
  async listAssignments(tenantId: string): Promise<StrategyProfileAssignment[]> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.STRATEGY_PROFILE_ASSIGNMENTS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.STRATEGY_PROFILE_ASSIGNMENTS.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId
      }
    };

    const result = await documentClient.query(queryParams).promise();
    return (result.Items || []) as StrategyProfileAssignment[];
  }
};
