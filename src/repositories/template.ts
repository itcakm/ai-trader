import { DynamoDB } from 'aws-sdk';
import { documentClient } from '../db/client';
import { TableNames, KeySchemas } from '../db/tables';
import { StrategyTemplate } from '../types/template';
import { ResourceNotFoundError } from '../db/access';

/**
 * Query parameters for listing templates
 */
export interface ListTemplatesParams {
  tenantId: string;
  limit?: number;
  exclusiveStartKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Result of a paginated template query
 */
export interface PaginatedTemplateResult {
  items: StrategyTemplate[];
  lastEvaluatedKey?: DynamoDB.DocumentClient.Key;
}

/**
 * Template Repository - manages strategy template persistence and retrieval
 * 
 * Templates are stored with templateId as partition key and version as sort key,
 * allowing efficient retrieval of specific versions and version history.
 */
export const TemplateRepository = {
  /**
   * Get the latest version of a template by ID
   * 
   * @param templateId - The unique identifier of the template
   * @returns The latest version of the template, or null if not found
   */
  async getTemplate(templateId: string): Promise<StrategyTemplate | null> {
    // Query all versions and get the one with highest version number
    const result = await documentClient.query({
      TableName: TableNames.TEMPLATES,
      KeyConditionExpression: '#pk = :templateId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.TEMPLATES.partitionKey
      },
      ExpressionAttributeValues: {
        ':templateId': templateId
      },
      ScanIndexForward: false, // Descending order by sort key (version)
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as StrategyTemplate;
  },

  /**
   * Get a specific version of a template
   * 
   * @param templateId - The unique identifier of the template
   * @param version - The specific version number to retrieve
   * @returns The template at the specified version, or null if not found
   */
  async getTemplateVersion(
    templateId: string,
    version: number
  ): Promise<StrategyTemplate | null> {
    const result = await documentClient.get({
      TableName: TableNames.TEMPLATES,
      Key: {
        [KeySchemas.TEMPLATES.partitionKey]: templateId,
        [KeySchemas.TEMPLATES.sortKey]: version
      }
    }).promise();

    if (!result.Item) {
      return null;
    }

    return result.Item as StrategyTemplate;
  },

  /**
   * List all templates (latest versions only)
   * 
   * Note: This performs a scan operation. For production use with many templates,
   * consider using a GSI or maintaining a separate "latest versions" table.
   * 
   * @param params - Query parameters including optional pagination
   * @returns Paginated list of templates (latest versions)
   */
  async listTemplates(
    params?: Omit<ListTemplatesParams, 'tenantId'>
  ): Promise<PaginatedTemplateResult> {
    // Scan all templates - in production, use GSI for better performance
    const scanParams: DynamoDB.DocumentClient.ScanInput = {
      TableName: TableNames.TEMPLATES
    };

    if (params?.limit) {
      scanParams.Limit = params.limit;
    }

    if (params?.exclusiveStartKey) {
      scanParams.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await documentClient.scan(scanParams).promise();
    const items = (result.Items || []) as StrategyTemplate[];

    // Group by templateId and keep only latest version
    const latestByTemplate = new Map<string, StrategyTemplate>();
    for (const template of items) {
      const existing = latestByTemplate.get(template.templateId);
      if (!existing || template.version > existing.version) {
        latestByTemplate.set(template.templateId, template);
      }
    }

    return {
      items: Array.from(latestByTemplate.values()),
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  },

  /**
   * Get all versions of a template
   * 
   * @param templateId - The unique identifier of the template
   * @returns All versions of the template ordered by version number (ascending)
   */
  async getTemplateVersionHistory(
    templateId: string
  ): Promise<StrategyTemplate[]> {
    const result = await documentClient.query({
      TableName: TableNames.TEMPLATES,
      KeyConditionExpression: '#pk = :templateId',
      ExpressionAttributeNames: {
        '#pk': KeySchemas.TEMPLATES.partitionKey
      },
      ExpressionAttributeValues: {
        ':templateId': templateId
      },
      ScanIndexForward: true // Ascending order by version
    }).promise();

    return (result.Items || []) as StrategyTemplate[];
  },

  /**
   * Save a template (creates new or updates existing)
   * 
   * @param template - The template to save
   */
  async putTemplate(template: StrategyTemplate): Promise<void> {
    await documentClient.put({
      TableName: TableNames.TEMPLATES,
      Item: template
    }).promise();
  },

  /**
   * Check if a specific template version exists
   * 
   * @param templateId - The unique identifier of the template
   * @param version - The version number to check
   * @returns True if the version exists, false otherwise
   */
  async templateVersionExists(
    templateId: string,
    version: number
  ): Promise<boolean> {
    const template = await this.getTemplateVersion(templateId, version);
    return template !== null;
  },

  /**
   * Create a new version of an existing template
   * 
   * This method implements the versioning logic that:
   * 1. Retrieves the current latest version
   * 2. Creates a new version with incremented version number
   * 3. Preserves the previous version (immutable)
   * 
   * @param templateId - The unique identifier of the template to update
   * @param updates - Partial template updates (name, description, parameters)
   * @returns The newly created template version
   * @throws ResourceNotFoundError if the template doesn't exist
   */
  async createNewVersion(
    templateId: string,
    updates: Partial<Pick<StrategyTemplate, 'name' | 'description' | 'parameters'>>
  ): Promise<StrategyTemplate> {
    // Get the current latest version
    const currentTemplate = await this.getTemplate(templateId);
    
    if (!currentTemplate) {
      throw new ResourceNotFoundError('Template', templateId);
    }

    const now = new Date().toISOString();
    
    // Create new version with incremented version number
    const newVersion: StrategyTemplate = {
      ...currentTemplate,
      ...updates,
      version: currentTemplate.version + 1,
      updatedAt: now
    };

    // Save the new version (previous version remains unchanged)
    await this.putTemplate(newVersion);

    return newVersion;
  },

  /**
   * Create a brand new template (version 1)
   * 
   * @param template - The template data (without version, will be set to 1)
   * @returns The created template with version 1
   */
  async createTemplate(
    template: Omit<StrategyTemplate, 'version' | 'createdAt' | 'updatedAt'>
  ): Promise<StrategyTemplate> {
    const now = new Date().toISOString();
    
    const newTemplate: StrategyTemplate = {
      ...template,
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    await this.putTemplate(newTemplate);

    return newTemplate;
  },

  /**
   * Get the next version number for a template
   * 
   * @param templateId - The unique identifier of the template
   * @returns The next version number (current + 1), or 1 if template doesn't exist
   */
  async getNextVersionNumber(templateId: string): Promise<number> {
    const currentTemplate = await this.getTemplate(templateId);
    return currentTemplate ? currentTemplate.version + 1 : 1;
  }
};
