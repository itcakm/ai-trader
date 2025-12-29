import { S3 } from 'aws-sdk';
import { generateUUID } from '../utils/uuid';
import {
  PromptTemplate,
  PromptTemplateInput,
  PromptTemplateUpdateInput,
  TemplateNotFoundError
} from '../types/prompt-template';

/**
 * S3 client configuration
 */
const s3Config: S3.ClientConfiguration = {
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.S3_ENDPOINT && {
    endpoint: process.env.S3_ENDPOINT,
    s3ForcePathStyle: true
  })
};

/**
 * S3 client instance
 */
export const s3Client = new S3(s3Config);

/**
 * S3 bucket name for prompt templates
 */
export const PROMPT_TEMPLATES_BUCKET = process.env.PROMPT_TEMPLATES_BUCKET || 'prompt-templates';

/**
 * Generate S3 key for a prompt template version
 * Path format: prompts/{templateId}/v{version}.json
 */
export function getTemplateKey(templateId: string, version: number): string {
  return `prompts/${templateId}/v${version}.json`;
}

/**
 * Generate S3 prefix for listing all versions of a template
 */
export function getTemplatePrefix(templateId: string): string {
  return `prompts/${templateId}/`;
}

/**
 * Parse version number from S3 key
 */
export function parseVersionFromKey(key: string): number | null {
  const match = key.match(/v(\d+)\.json$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Prompt Template Repository - manages prompt template persistence in S3
 * 
 * Templates are stored with versioning enabled, allowing retrieval of
 * specific versions and version history.
 * 
 * Requirements: 8.1
 */
export const PromptTemplateRepository = {
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
  ): Promise<PromptTemplate | null> {
    try {
      const result = await s3Client.getObject({
        Bucket: PROMPT_TEMPLATES_BUCKET,
        Key: getTemplateKey(templateId, version)
      }).promise();

      if (!result.Body) {
        return null;
      }

      return JSON.parse(result.Body.toString('utf-8')) as PromptTemplate;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get the latest version of a template
   * 
   * @param templateId - The unique identifier of the template
   * @returns The latest version of the template, or null if not found
   */
  async getTemplate(templateId: string): Promise<PromptTemplate | null> {
    const latestVersion = await this.getLatestVersionNumber(templateId);
    if (latestVersion === 0) {
      return null;
    }
    return this.getTemplateVersion(templateId, latestVersion);
  },

  /**
   * Get all versions of a template ordered by version number (ascending)
   * 
   * @param templateId - The unique identifier of the template
   * @returns All versions of the template
   */
  async getTemplateVersionHistory(templateId: string): Promise<PromptTemplate[]> {
    const versions: PromptTemplate[] = [];
    
    try {
      const listResult = await s3Client.listObjectsV2({
        Bucket: PROMPT_TEMPLATES_BUCKET,
        Prefix: getTemplatePrefix(templateId)
      }).promise();

      if (!listResult.Contents || listResult.Contents.length === 0) {
        return [];
      }

      // Extract version numbers and sort
      const versionNumbers: number[] = [];
      for (const obj of listResult.Contents) {
        if (obj.Key) {
          const version = parseVersionFromKey(obj.Key);
          if (version !== null) {
            versionNumbers.push(version);
          }
        }
      }
      versionNumbers.sort((a, b) => a - b);

      // Fetch each version
      for (const version of versionNumbers) {
        const template = await this.getTemplateVersion(templateId, version);
        if (template) {
          versions.push(template);
        }
      }
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }

    return versions;
  },

  /**
   * Save a template version to S3
   * 
   * @param template - The template to save
   */
  async putTemplate(template: PromptTemplate): Promise<void> {
    await s3Client.putObject({
      Bucket: PROMPT_TEMPLATES_BUCKET,
      Key: getTemplateKey(template.templateId, template.version),
      Body: JSON.stringify(template, null, 2),
      ContentType: 'application/json'
    }).promise();
  },

  /**
   * Get the latest version number for a template
   * 
   * @param templateId - The unique identifier of the template
   * @returns The latest version number, or 0 if no versions exist
   */
  async getLatestVersionNumber(templateId: string): Promise<number> {
    try {
      const listResult = await s3Client.listObjectsV2({
        Bucket: PROMPT_TEMPLATES_BUCKET,
        Prefix: getTemplatePrefix(templateId)
      }).promise();

      if (!listResult.Contents || listResult.Contents.length === 0) {
        return 0;
      }

      let maxVersion = 0;
      for (const obj of listResult.Contents) {
        if (obj.Key) {
          const version = parseVersionFromKey(obj.Key);
          if (version !== null && version > maxVersion) {
            maxVersion = version;
          }
        }
      }

      return maxVersion;
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return 0;
      }
      throw error;
    }
  },

  /**
   * Create a new template (version 1)
   * 
   * Requirements: 8.1
   * 
   * @param input - The template input data
   * @returns The created template with version 1
   */
  async createTemplate(input: PromptTemplateInput): Promise<PromptTemplate> {
    const now = new Date().toISOString();
    const templateId = input.templateId || generateUUID();

    const template: PromptTemplate = {
      templateId,
      name: input.name,
      version: 1,
      type: input.type,
      content: input.content,
      parameters: input.parameters,
      createdAt: now,
      createdBy: input.createdBy
    };

    await this.putTemplate(template);
    return template;
  },

  /**
   * Create a new version of an existing template
   * 
   * Requirements: 8.2
   * 
   * @param templateId - The unique identifier of the template to update
   * @param updates - The updates to apply
   * @param createdBy - The user creating the new version
   * @returns The newly created template version
   * @throws TemplateNotFoundError if the template doesn't exist
   */
  async createNewVersion(
    templateId: string,
    updates: PromptTemplateUpdateInput,
    createdBy: string
  ): Promise<PromptTemplate> {
    const currentTemplate = await this.getTemplate(templateId);
    
    if (!currentTemplate) {
      throw new TemplateNotFoundError(templateId);
    }

    const now = new Date().toISOString();
    
    const newVersion: PromptTemplate = {
      ...currentTemplate,
      content: updates.content ?? currentTemplate.content,
      parameters: updates.parameters ?? currentTemplate.parameters,
      name: updates.name ?? currentTemplate.name,
      version: currentTemplate.version + 1,
      createdAt: now,
      createdBy
    };

    await this.putTemplate(newVersion);
    return newVersion;
  },

  /**
   * List all templates (latest versions only)
   * 
   * @param type - Optional filter by template type
   * @returns List of latest template versions
   */
  async listTemplates(type?: string): Promise<PromptTemplate[]> {
    try {
      const listResult = await s3Client.listObjectsV2({
        Bucket: PROMPT_TEMPLATES_BUCKET,
        Prefix: 'prompts/',
        Delimiter: '/'
      }).promise();

      if (!listResult.CommonPrefixes || listResult.CommonPrefixes.length === 0) {
        return [];
      }

      const templates: PromptTemplate[] = [];
      
      for (const prefix of listResult.CommonPrefixes) {
        if (prefix.Prefix) {
          // Extract templateId from prefix (prompts/{templateId}/)
          const match = prefix.Prefix.match(/^prompts\/([^/]+)\/$/);
          if (match) {
            const templateId = match[1];
            const template = await this.getTemplate(templateId);
            if (template) {
              if (!type || template.type === type) {
                templates.push(template);
              }
            }
          }
        }
      }

      return templates;
    } catch (error: any) {
      if (error.code === 'NoSuchBucket') {
        return [];
      }
      throw error;
    }
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
    try {
      await s3Client.headObject({
        Bucket: PROMPT_TEMPLATES_BUCKET,
        Key: getTemplateKey(templateId, version)
      }).promise();
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }
};
