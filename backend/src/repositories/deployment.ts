import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas, GSINames } from '../db/tables';
import { Deployment } from '../types/deployment';
import { 
  TenantAccessDeniedError, 
  ResourceNotFoundError,
  TenantQueryParams,
  PaginatedResult 
} from '../db/access';

/**
 * Query parameters for listing deployments by strategy
 */
export interface ListDeploymentsByStrategyParams extends TenantQueryParams {
  strategyId: string;
}

/**
 * Deployment Repository - manages deployment persistence and retrieval with tenant isolation
 * 
 * Deployments are stored with tenantId as partition key and deploymentId as sort key,
 * ensuring tenant isolation at the database level.
 * 
 * Requirements: 4.5
 */
export const DeploymentRepository = {
  /**
   * Get a deployment by ID, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The unique identifier of the deployment
   * @returns The deployment, or null if not found
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async getDeployment(tenantId: string, deploymentId: string): Promise<Deployment | null> {
    const result = await documentClient.get({
      TableName: TableNames.DEPLOYMENTS,
      Key: {
        [KeySchemas.DEPLOYMENTS.partitionKey]: tenantId,
        [KeySchemas.DEPLOYMENTS.sortKey]: deploymentId
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    // Defense in depth: verify tenant ownership
    if (result.Item.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'deployment');
    }

    return result.Item as Deployment;
  },

  /**
   * List all deployments for a tenant
   * 
   * @param params - Query parameters including tenantId and optional pagination
   * @returns Paginated list of deployments
   */
  async listDeployments(params: TenantQueryParams): Promise<PaginatedResult<Deployment>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DEPLOYMENTS,
      KeyConditionExpression: '#pk = :tenantId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.DEPLOYMENTS.partitionKey
      },
      ExpressionAttributeValues: {
        ':tenantId': params.tenantId
      }
    };

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as Deployment[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * List deployments for a specific strategy
   * 
   * Uses the strategyId GSI to efficiently query deployments by strategy.
   * 
   * @param params - Query parameters including tenantId, strategyId, and optional pagination
   * @returns Paginated list of deployments for the strategy
   */
  async listDeploymentsByStrategy(
    params: ListDeploymentsByStrategyParams
  ): Promise<PaginatedResult<Deployment>> {
    const queryParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: TableNames.DEPLOYMENTS,
      IndexName: GSINames.DEPLOYMENTS.STRATEGY_INDEX,
      KeyConditionExpression: '#strategyId = :strategyId',
      FilterExpression: '#tenantId = :tenantId',
      ExpressionAttributeNames: {
        '#strategyId': 'strategyId',
        '#tenantId': 'tenantId'
      },
      ExpressionAttributeValues: {
        ':strategyId': params.strategyId,
        ':tenantId': params.tenantId
      }
    };

    if (params.limit) {
      queryParams.Limit = params.limit;
    }

    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.query(queryParams).promise();

    return {
      items: (result.Items || []) as Deployment[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Save a deployment, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier (must match deployment.tenantId)
   * @param deployment - The deployment to save
   * @throws TenantAccessDeniedError if tenantId doesn't match deployment.tenantId
   */
  async putDeployment(tenantId: string, deployment: Deployment): Promise<void> {
    // Verify the deployment belongs to the tenant
    if (deployment.tenantId !== tenantId) {
      throw new TenantAccessDeniedError(tenantId, 'deployment');
    }

    await documentClient.put({
      TableName: TableNames.DEPLOYMENTS,
      Item: deployment
    }).promise();
  },

  /**
   * Update a deployment, ensuring tenant isolation and returning the updated deployment
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The unique identifier of the deployment
   * @param updates - Partial deployment updates
   * @returns The updated deployment
   * @throws ResourceNotFoundError if deployment doesn't exist
   */
  async updateDeployment(
    tenantId: string,
    deploymentId: string,
    updates: Partial<Omit<Deployment, 'deploymentId' | 'tenantId' | 'createdAt'>>
  ): Promise<Deployment> {
    // Get existing deployment
    const existing = await this.getDeployment(tenantId, deploymentId);
    if (!existing) {
      throw new ResourceNotFoundError('Deployment', deploymentId);
    }

    const now = new Date().toISOString();
    
    // Merge updates with existing deployment
    const updatedDeployment: Deployment = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await this.putDeployment(tenantId, updatedDeployment);

    return updatedDeployment;
  },

  /**
   * Delete a deployment, ensuring tenant isolation
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The unique identifier of the deployment to delete
   * @throws ResourceNotFoundError if deployment doesn't exist
   * @throws TenantAccessDeniedError if tenant mismatch detected
   */
  async deleteDeployment(tenantId: string, deploymentId: string): Promise<void> {
    // First verify the deployment exists and belongs to this tenant
    const existing = await this.getDeployment(tenantId, deploymentId);
    if (!existing) {
      throw new ResourceNotFoundError('Deployment', deploymentId);
    }

    await documentClient.delete({
      TableName: TableNames.DEPLOYMENTS,
      Key: {
        [KeySchemas.DEPLOYMENTS.partitionKey]: tenantId,
        [KeySchemas.DEPLOYMENTS.sortKey]: deploymentId
      }
    }).promise();
  },

  /**
   * Check if a deployment exists for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @param deploymentId - The unique identifier of the deployment
   * @returns True if the deployment exists, false otherwise
   */
  async deploymentExists(tenantId: string, deploymentId: string): Promise<boolean> {
    const deployment = await this.getDeployment(tenantId, deploymentId);
    return deployment !== null;
  }
};
