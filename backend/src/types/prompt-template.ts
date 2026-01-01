/**
 * Prompt Template Types
 * 
 * Types for managing versioned prompt templates used for AI model interactions.
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

/**
 * Type of prompt template
 */
export type PromptTemplateType = 'REGIME_CLASSIFICATION' | 'EXPLANATION' | 'PARAMETER_SUGGESTION';

/**
 * Definition of a parameter within a prompt template
 */
export interface PromptParameter {
  name: string;
  required: boolean;
  defaultValue?: string;
  description: string;
}

/**
 * Prompt template - a versioned, parameterized template for AI model prompts
 * 
 * Requirements: 8.1
 */
export interface PromptTemplate {
  templateId: string;
  name: string;
  version: number;
  type: PromptTemplateType;
  content: string;
  parameters: PromptParameter[];
  createdAt: string;
  createdBy: string;
}

/**
 * Input for creating a new prompt template
 */
export interface PromptTemplateInput {
  templateId?: string;
  name: string;
  type: PromptTemplateType;
  content: string;
  parameters: PromptParameter[];
  createdBy: string;
}

/**
 * Input for updating an existing prompt template
 */
export interface PromptTemplateUpdateInput {
  content?: string;
  parameters?: PromptParameter[];
  name?: string;
}

/**
 * Result of rendering a prompt template
 */
export interface RenderedPrompt {
  templateId: string;
  version: number;
  content: string;
  renderedAt: string;
}

/**
 * Error thrown when required parameters are missing
 */
export class MissingParametersError extends Error {
  constructor(public readonly missingParameters: string[]) {
    super(`Missing required parameters: ${missingParameters.join(', ')}`);
    this.name = 'MissingParametersError';
  }
}

/**
 * Error thrown when a template is not found
 */
export class TemplateNotFoundError extends Error {
  constructor(templateId: string, version?: number) {
    const message = version !== undefined
      ? `Template not found: ${templateId} version ${version}`
      : `Template not found: ${templateId}`;
    super(message);
    this.name = 'TemplateNotFoundError';
  }
}
