import {
  PromptTemplate,
  PromptTemplateInput,
  PromptTemplateUpdateInput,
  PromptParameter,
  RenderedPrompt,
  MissingParametersError,
  TemplateNotFoundError
} from '../types/prompt-template';
import { PromptTemplateRepository } from '../repositories/prompt-template';

/**
 * Prompt Template Service
 * 
 * Manages versioned prompt templates with parameter substitution.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export const PromptTemplateService = {
  /**
   * Get a template by ID, optionally at a specific version
   * 
   * Requirements: 8.1
   * 
   * @param templateId - The unique identifier of the template
   * @param version - Optional specific version to retrieve
   * @returns The template, or null if not found
   */
  async getTemplate(
    templateId: string,
    version?: number
  ): Promise<PromptTemplate | null> {
    if (version !== undefined) {
      return PromptTemplateRepository.getTemplateVersion(templateId, version);
    }
    return PromptTemplateRepository.getTemplate(templateId);
  },

  /**
   * Create a new prompt template (version 1)
   * 
   * Requirements: 8.1
   * 
   * @param input - The template input data
   * @returns The created template with version 1
   */
  async createTemplate(input: PromptTemplateInput): Promise<PromptTemplate> {
    return PromptTemplateRepository.createTemplate(input);
  },

  /**
   * Update an existing template, creating a new version
   * 
   * Requirements: 8.2
   * 
   * This method implements the versioning logic that:
   * 1. Retrieves the current latest version
   * 2. Creates a new version with incremented version number
   * 3. Preserves the previous version (immutable)
   * 
   * @param templateId - The unique identifier of the template to update
   * @param content - The new content for the template
   * @param createdBy - The user creating the new version
   * @returns The newly created template version
   * @throws TemplateNotFoundError if the template doesn't exist
   */
  async updateTemplate(
    templateId: string,
    content: string,
    createdBy: string
  ): Promise<PromptTemplate> {
    return PromptTemplateRepository.createNewVersion(
      templateId,
      { content },
      createdBy
    );
  },

  /**
   * Update an existing template with multiple fields, creating a new version
   * 
   * Requirements: 8.2
   * 
   * @param templateId - The unique identifier of the template to update
   * @param updates - The updates to apply
   * @param createdBy - The user creating the new version
   * @returns The newly created template version
   * @throws TemplateNotFoundError if the template doesn't exist
   */
  async updateTemplateWithFields(
    templateId: string,
    updates: PromptTemplateUpdateInput,
    createdBy: string
  ): Promise<PromptTemplate> {
    return PromptTemplateRepository.createNewVersion(
      templateId,
      updates,
      createdBy
    );
  },

  /**
   * List all templates, optionally filtered by type
   * 
   * Requirements: 8.1
   * 
   * @param type - Optional filter by template type
   * @returns List of latest template versions
   */
  async listTemplates(type?: string): Promise<PromptTemplate[]> {
    return PromptTemplateRepository.listTemplates(type);
  },

  /**
   * Get all versions of a template
   * 
   * Requirements: 8.2
   * 
   * @param templateId - The unique identifier of the template
   * @returns All versions of the template ordered by version number (ascending)
   */
  async getTemplateVersionHistory(templateId: string): Promise<PromptTemplate[]> {
    return PromptTemplateRepository.getTemplateVersionHistory(templateId);
  },

  /**
   * Render a template with parameter substitution
   * 
   * Requirements: 8.3, 8.4
   * 
   * Replaces all {{parameter_name}} placeholders with their values.
   * Validates that all required parameters are provided.
   * 
   * @param templateId - The unique identifier of the template
   * @param parameters - The parameter values to substitute
   * @param version - Optional specific version to render
   * @returns The rendered prompt
   * @throws TemplateNotFoundError if the template doesn't exist
   * @throws MissingParametersError if required parameters are missing
   */
  async renderTemplate(
    templateId: string,
    parameters: Record<string, string>,
    version?: number
  ): Promise<RenderedPrompt> {
    const template = version !== undefined
      ? await PromptTemplateRepository.getTemplateVersion(templateId, version)
      : await PromptTemplateRepository.getTemplate(templateId);

    if (!template) {
      throw new TemplateNotFoundError(templateId, version);
    }

    // Validate required parameters
    const missingParams = this.validateParameters(template.parameters, parameters);
    if (missingParams.length > 0) {
      throw new MissingParametersError(missingParams);
    }

    // Build complete parameters with defaults
    const completeParams = this.buildCompleteParameters(template.parameters, parameters);

    // Render the template
    const renderedContent = this.substituteParameters(template.content, completeParams);

    return {
      templateId: template.templateId,
      version: template.version,
      content: renderedContent,
      renderedAt: new Date().toISOString()
    };
  },

  /**
   * Validate that all required parameters are provided
   * 
   * Requirements: 8.4
   * 
   * @param parameterDefs - The parameter definitions from the template
   * @param providedParams - The parameters provided by the caller
   * @returns Array of missing required parameter names
   */
  validateParameters(
    parameterDefs: PromptParameter[],
    providedParams: Record<string, string>
  ): string[] {
    const missing: string[] = [];
    
    for (const paramDef of parameterDefs) {
      if (paramDef.required) {
        const value = providedParams[paramDef.name];
        if (value === undefined || value === null || value === '') {
          // Check if there's a default value
          if (paramDef.defaultValue === undefined || paramDef.defaultValue === '') {
            missing.push(paramDef.name);
          }
        }
      }
    }
    
    return missing;
  },

  /**
   * Build complete parameters by merging provided values with defaults
   * 
   * @param parameterDefs - The parameter definitions from the template
   * @param providedParams - The parameters provided by the caller
   * @returns Complete parameter map with defaults applied
   */
  buildCompleteParameters(
    parameterDefs: PromptParameter[],
    providedParams: Record<string, string>
  ): Record<string, string> {
    const complete: Record<string, string> = { ...providedParams };
    
    for (const paramDef of parameterDefs) {
      if (complete[paramDef.name] === undefined && paramDef.defaultValue !== undefined) {
        complete[paramDef.name] = paramDef.defaultValue;
      }
    }
    
    return complete;
  },

  /**
   * Substitute parameters in template content
   * 
   * Requirements: 8.3
   * 
   * Replaces all {{parameter_name}} placeholders with their values.
   * 
   * @param content - The template content
   * @param parameters - The parameter values to substitute
   * @returns The content with parameters substituted
   */
  substituteParameters(
    content: string,
    parameters: Record<string, string>
  ): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return parameters[key] !== undefined ? parameters[key] : match;
    });
  },

  /**
   * Extract parameter names from template content
   * 
   * Finds all {{parameter_name}} placeholders in the content.
   * 
   * @param content - The template content
   * @returns Array of parameter names found in the content
   */
  extractParameterNames(content: string): string[] {
    const matches = content.match(/\{\{(\w+)\}\}/g);
    if (!matches) {
      return [];
    }
    
    const names = matches.map(match => match.slice(2, -2));
    return [...new Set(names)]; // Remove duplicates
  }
};
