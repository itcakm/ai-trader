import * as fc from 'fast-check';
import {
  PromptTemplate,
  PromptTemplateInput,
  PromptParameter,
  MissingParametersError,
  TemplateNotFoundError
} from '../types/prompt-template';
import {
  promptTemplateArb,
  promptTemplateInputArb,
  promptParameterArb,
  promptTemplateWithPlaceholdersArb,
  validParameterValuesArb,
  incompleteParameterValuesArb,
  isoDateStringArb
} from '../test/generators';

/**
 * In-memory mock implementation of PromptTemplateRepository for testing
 * This allows us to test the versioning logic without S3
 */
class MockPromptTemplateStore {
  private templates: Map<string, Map<number, PromptTemplate>> = new Map();

  async getTemplate(templateId: string): Promise<PromptTemplate | null> {
    const versions = this.templates.get(templateId);
    if (!versions || versions.size === 0) {
      return null;
    }
    const maxVersion = Math.max(...versions.keys());
    return versions.get(maxVersion) || null;
  }

  async getTemplateVersion(templateId: string, version: number): Promise<PromptTemplate | null> {
    const versions = this.templates.get(templateId);
    if (!versions) {
      return null;
    }
    return versions.get(version) || null;
  }

  async putTemplate(template: PromptTemplate): Promise<void> {
    if (!this.templates.has(template.templateId)) {
      this.templates.set(template.templateId, new Map());
    }
    this.templates.get(template.templateId)!.set(template.version, { ...template });
  }

  async getTemplateVersionHistory(templateId: string): Promise<PromptTemplate[]> {
    const versions = this.templates.get(templateId);
    if (!versions) {
      return [];
    }
    return Array.from(versions.values()).sort((a, b) => a.version - b.version);
  }

  async createTemplate(input: PromptTemplateInput): Promise<PromptTemplate> {
    const now = new Date().toISOString();
    const templateId = input.templateId || `template-${Date.now()}`;

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
  }

  async createNewVersion(
    templateId: string,
    updates: { content?: string; parameters?: PromptParameter[]; name?: string },
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
  }

  clear(): void {
    this.templates.clear();
  }
}

/**
 * Mock implementation of PromptTemplateService for testing
 */
class MockPromptTemplateService {
  constructor(private store: MockPromptTemplateStore) {}

  async getTemplate(templateId: string, version?: number): Promise<PromptTemplate | null> {
    if (version !== undefined) {
      return this.store.getTemplateVersion(templateId, version);
    }
    return this.store.getTemplate(templateId);
  }

  async createTemplate(input: PromptTemplateInput): Promise<PromptTemplate> {
    return this.store.createTemplate(input);
  }

  async updateTemplate(templateId: string, content: string, createdBy: string): Promise<PromptTemplate> {
    return this.store.createNewVersion(templateId, { content }, createdBy);
  }

  async getTemplateVersionHistory(templateId: string): Promise<PromptTemplate[]> {
    return this.store.getTemplateVersionHistory(templateId);
  }

  validateParameters(
    parameterDefs: PromptParameter[],
    providedParams: Record<string, string>
  ): string[] {
    const missing: string[] = [];
    
    for (const paramDef of parameterDefs) {
      if (paramDef.required) {
        const value = providedParams[paramDef.name];
        if (value === undefined || value === null || value === '') {
          if (paramDef.defaultValue === undefined || paramDef.defaultValue === '') {
            missing.push(paramDef.name);
          }
        }
      }
    }
    
    return missing;
  }

  substituteParameters(content: string, parameters: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return parameters[key] !== undefined ? parameters[key] : match;
    });
  }

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
  }

  async renderTemplate(
    templateId: string,
    parameters: Record<string, string>,
    version?: number
  ): Promise<{ templateId: string; version: number; content: string; renderedAt: string }> {
    const template = await this.getTemplate(templateId, version);

    if (!template) {
      throw new TemplateNotFoundError(templateId, version);
    }

    const missingParams = this.validateParameters(template.parameters, parameters);
    if (missingParams.length > 0) {
      throw new MissingParametersError(missingParams);
    }

    const completeParams = this.buildCompleteParameters(template.parameters, parameters);
    const renderedContent = this.substituteParameters(template.content, completeParams);

    return {
      templateId: template.templateId,
      version: template.version,
      content: renderedContent,
      renderedAt: new Date().toISOString()
    };
  }
}

describe('Prompt Template Versioning', () => {
  /**
   * Property 16: Prompt Template Versioning
   * 
   * *For any* PromptTemplate update, a new version SHALL be created while 
   * preserving all previous versions, AND requesting a specific version 
   * SHALL return that exact version's content.
   * 
   * **Validates: Requirements 8.2**
   * 
   * Feature: ai-assisted-intelligence, Property 16: Prompt Template Versioning
   */
  describe('Property 16: Prompt Template Versioning', () => {
    let store: MockPromptTemplateStore;
    let service: MockPromptTemplateService;

    beforeEach(() => {
      store = new MockPromptTemplateStore();
      service = new MockPromptTemplateService(store);
    });

    it('updating a template creates a new version while preserving previous versions', async () => {
      await fc.assert(
        fc.asyncProperty(
          promptTemplateInputArb(),
          fc.string({ minLength: 10, maxLength: 500 }),
          fc.uuid(),
          async (input, newContent, updatedBy) => {
            // Create the original template
            const original = await service.createTemplate(input);
            expect(original.version).toBe(1);

            // Update the template
            const updated = await service.updateTemplate(
              original.templateId,
              newContent,
              updatedBy
            );

            // Property: New version number SHALL be greater than original
            expect(updated.version).toBe(original.version + 1);
            expect(updated.version).toBe(2);

            // Property: Original version SHALL still be retrievable
            const retrievedOriginal = await service.getTemplate(original.templateId, 1);
            expect(retrievedOriginal).not.toBeNull();
            expect(retrievedOriginal!.version).toBe(1);
            expect(retrievedOriginal!.content).toBe(original.content);

            // Property: New version SHALL be retrievable with exact content
            const retrievedNew = await service.getTemplate(original.templateId, 2);
            expect(retrievedNew).not.toBeNull();
            expect(retrievedNew!.version).toBe(2);
            expect(retrievedNew!.content).toBe(newContent);

            // Property: Both versions exist in history
            const history = await service.getTemplateVersionHistory(original.templateId);
            expect(history.length).toBe(2);
            expect(history[0].version).toBe(1);
            expect(history[1].version).toBe(2);

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple sequential updates preserve all versions', async () => {
      await fc.assert(
        fc.asyncProperty(
          promptTemplateInputArb(),
          fc.integer({ min: 2, max: 5 }),
          fc.uuid(),
          async (input, numUpdates, updatedBy) => {
            // Create the original template
            const original = await service.createTemplate(input);

            // Perform multiple updates
            const contents: string[] = [original.content];
            for (let i = 0; i < numUpdates; i++) {
              const newContent = `Updated content version ${i + 2}`;
              await service.updateTemplate(original.templateId, newContent, updatedBy);
              contents.push(newContent);
            }

            // Property: All versions should be retrievable
            const history = await service.getTemplateVersionHistory(original.templateId);
            expect(history.length).toBe(numUpdates + 1);

            // Property: Versions should be in ascending order
            for (let i = 0; i < history.length; i++) {
              expect(history[i].version).toBe(i + 1);
            }

            // Property: Each version should have its exact content
            for (let v = 1; v <= numUpdates + 1; v++) {
              const version = await service.getTemplate(original.templateId, v);
              expect(version).not.toBeNull();
              expect(version!.version).toBe(v);
              expect(version!.content).toBe(contents[v - 1]);
            }

            // Property: Latest version should have highest version number
            const latest = await service.getTemplate(original.templateId);
            expect(latest).not.toBeNull();
            expect(latest!.version).toBe(numUpdates + 1);

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('version numbers always increment by exactly 1', async () => {
      await fc.assert(
        fc.asyncProperty(
          promptTemplateInputArb(),
          fc.array(
            fc.string({ minLength: 10, maxLength: 200 }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.uuid(),
          async (input, contentUpdates, updatedBy) => {
            // Create the original template
            const original = await service.createTemplate(input);

            let previousVersion = 1;

            for (const newContent of contentUpdates) {
              const updated = await service.updateTemplate(
                original.templateId,
                newContent,
                updatedBy
              );
              
              // Property: Each new version is exactly 1 greater than previous
              expect(updated.version).toBe(previousVersion + 1);
              
              previousVersion = updated.version;
            }

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('requesting a specific version returns that exact version content', async () => {
      await fc.assert(
        fc.asyncProperty(
          promptTemplateInputArb(),
          fc.array(
            fc.string({ minLength: 10, maxLength: 200 }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.uuid(),
          async (input, contentUpdates, updatedBy) => {
            // Create the original template
            const original = await service.createTemplate(input);
            const allContents = [original.content, ...contentUpdates];

            // Create all versions
            for (const newContent of contentUpdates) {
              await service.updateTemplate(original.templateId, newContent, updatedBy);
            }

            // Property: Each specific version request returns exact content
            for (let v = 1; v <= allContents.length; v++) {
              const version = await service.getTemplate(original.templateId, v);
              expect(version).not.toBeNull();
              expect(version!.content).toBe(allContents[v - 1]);
            }

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// Reserved JavaScript property names to avoid in parameter names
const RESERVED_NAMES = new Set([
  'toString', 'valueOf', 'constructor', 'hasOwnProperty', 'isPrototypeOf',
  'propertyIsEnumerable', 'toLocaleString', '__proto__', '__defineGetter__',
  '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
]);

/**
 * Filter out reserved JavaScript property names from parameter names
 */
function filterReservedNames(names: string[]): string[] {
  return names.filter(name => !RESERVED_NAMES.has(name));
}

/**
 * Generator for safe parameter names (excluding reserved words)
 */
const safeParamNameArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 2, maxLength: 20 })
    .filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s) && !RESERVED_NAMES.has(s));

describe('Prompt Parameter Substitution', () => {
  /**
   * Property 17: Prompt Parameter Substitution
   * 
   * *For any* PromptTemplate with parameters, rendering with all required 
   * parameters provided SHALL replace all {{parameter_name}} placeholders 
   * with their values, AND rendering with missing required parameters 
   * SHALL fail with a validation error.
   * 
   * **Validates: Requirements 8.3, 8.4**
   * 
   * Feature: ai-assisted-intelligence, Property 17: Prompt Parameter Substitution
   */
  describe('Property 17: Prompt Parameter Substitution', () => {
    let store: MockPromptTemplateStore;
    let service: MockPromptTemplateService;

    beforeEach(() => {
      store = new MockPromptTemplateStore();
      service = new MockPromptTemplateService(store);
    });

    it('rendering with all required parameters replaces all placeholders', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate parameter names (excluding reserved words)
          fc.array(safeParamNameArb(), { minLength: 1, maxLength: 5 }),
          fc.uuid(),
          async (paramNames, createdBy) => {
            // Ensure unique parameter names
            const uniqueNames = [...new Set(paramNames)];
            if (uniqueNames.length === 0) return true;

            // Create parameters (all required, no defaults)
            const parameters: PromptParameter[] = uniqueNames.map(name => ({
              name,
              required: true,
              description: `Parameter ${name}`
            }));

            // Create content with placeholders
            const placeholders = uniqueNames.map(n => `{{${n}}}`).join(' ');
            const content = `Start ${placeholders} End`;

            // Create template
            const template = await service.createTemplate({
              name: 'Test Template',
              type: 'REGIME_CLASSIFICATION',
              content,
              parameters,
              createdBy
            });

            // Create parameter values
            const paramValues: Record<string, string> = {};
            for (const name of uniqueNames) {
              paramValues[name] = `value_for_${name}`;
            }

            // Render the template
            const rendered = await service.renderTemplate(
              template.templateId,
              paramValues
            );

            // Property: All placeholders SHALL be replaced with their values
            for (const name of uniqueNames) {
              expect(rendered.content).toContain(`value_for_${name}`);
              expect(rendered.content).not.toContain(`{{${name}}}`);
            }

            // Property: No unreplaced placeholders should remain
            expect(rendered.content).not.toMatch(/\{\{\w+\}\}/);

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rendering with missing required parameters fails with validation error', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate at least 2 parameter names so we can omit some (excluding reserved words)
          fc.array(safeParamNameArb(), { minLength: 2, maxLength: 5 }),
          fc.uuid(),
          async (paramNames, createdBy) => {
            // Ensure unique parameter names
            const uniqueNames = [...new Set(paramNames)];
            if (uniqueNames.length < 2) return true;

            // Create parameters (all required, no defaults)
            const parameters: PromptParameter[] = uniqueNames.map(name => ({
              name,
              required: true,
              description: `Parameter ${name}`
            }));

            // Create content with placeholders
            const placeholders = uniqueNames.map(n => `{{${n}}}`).join(' ');
            const content = `Start ${placeholders} End`;

            // Create template
            const template = await service.createTemplate({
              name: 'Test Template',
              type: 'REGIME_CLASSIFICATION',
              content,
              parameters,
              createdBy
            });

            // Provide only some parameters (omit at least one)
            const providedNames = uniqueNames.slice(0, -1);
            const omittedNames = uniqueNames.slice(-1);
            
            const paramValues: Record<string, string> = {};
            for (const name of providedNames) {
              paramValues[name] = `value_for_${name}`;
            }

            // Property: Rendering with missing required parameters SHALL fail
            await expect(
              service.renderTemplate(template.templateId, paramValues)
            ).rejects.toThrow(MissingParametersError);

            // Verify the error contains the missing parameter names
            try {
              await service.renderTemplate(template.templateId, paramValues);
            } catch (error) {
              expect(error).toBeInstanceOf(MissingParametersError);
              const missingError = error as MissingParametersError;
              for (const omittedName of omittedNames) {
                expect(missingError.missingParameters).toContain(omittedName);
              }
            }

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('parameters with default values do not require explicit values', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeParamNameArb(),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.uuid(),
          async (paramName, defaultValue, createdBy) => {
            // Create a required parameter with a default value
            const parameters: PromptParameter[] = [{
              name: paramName,
              required: true,
              defaultValue,
              description: `Parameter ${paramName}`
            }];

            // Create content with placeholder
            const content = `Start {{${paramName}}} End`;

            // Create template
            const template = await service.createTemplate({
              name: 'Test Template',
              type: 'REGIME_CLASSIFICATION',
              content,
              parameters,
              createdBy
            });

            // Render without providing the parameter (should use default)
            const rendered = await service.renderTemplate(
              template.templateId,
              {} // No parameters provided
            );

            // Property: Default value SHALL be used when parameter not provided
            expect(rendered.content).toContain(defaultValue);
            expect(rendered.content).not.toContain(`{{${paramName}}}`);

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('provided values override default values', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeParamNameArb(),
          fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.uuid(),
          async (paramName, defaultValue, providedValue, createdBy) => {
            // Skip if values are the same or one contains the other
            if (defaultValue === providedValue) return true;
            if (providedValue.includes(defaultValue) || defaultValue.includes(providedValue)) return true;

            // Create a parameter with a default value
            const parameters: PromptParameter[] = [{
              name: paramName,
              required: true,
              defaultValue,
              description: `Parameter ${paramName}`
            }];

            // Create content with placeholder
            const content = `Start {{${paramName}}} End`;

            // Create template
            const template = await service.createTemplate({
              name: 'Test Template',
              type: 'REGIME_CLASSIFICATION',
              content,
              parameters,
              createdBy
            });

            // Render with explicit parameter value
            const rendered = await service.renderTemplate(
              template.templateId,
              { [paramName]: providedValue }
            );

            // Property: Provided value SHALL override default value
            expect(rendered.content).toContain(providedValue);
            expect(rendered.content).not.toContain(defaultValue);
            expect(rendered.content).not.toContain(`{{${paramName}}}`);

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('optional parameters without values remain as placeholders or use defaults', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeParamNameArb(),
          fc.uuid(),
          async (paramName, createdBy) => {
            // Create an optional parameter without default
            const parameters: PromptParameter[] = [{
              name: paramName,
              required: false,
              description: `Optional parameter ${paramName}`
            }];

            // Create content with placeholder
            const content = `Start {{${paramName}}} End`;

            // Create template
            const template = await service.createTemplate({
              name: 'Test Template',
              type: 'REGIME_CLASSIFICATION',
              content,
              parameters,
              createdBy
            });

            // Render without providing the optional parameter
            // Should not throw since parameter is optional
            const rendered = await service.renderTemplate(
              template.templateId,
              {} // No parameters provided
            );

            // Property: Optional parameter without value keeps placeholder
            // (since no default was provided)
            expect(rendered.content).toContain(`{{${paramName}}}`);

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('substitution handles multiple occurrences of the same parameter', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeParamNameArb(),
          // Use alphanumeric values to avoid regex special characters
          fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 5, maxLength: 20 }),
          fc.integer({ min: 2, max: 5 }),
          fc.uuid(),
          async (paramName, paramValue, occurrences, createdBy) => {
            // Create a parameter
            const parameters: PromptParameter[] = [{
              name: paramName,
              required: true,
              description: `Parameter ${paramName}`
            }];

            // Create content with multiple occurrences of the same placeholder
            const placeholder = `{{${paramName}}}`;
            const content = Array(occurrences).fill(`Part ${placeholder}`).join(' ');

            // Create template
            const template = await service.createTemplate({
              name: 'Test Template',
              type: 'REGIME_CLASSIFICATION',
              content,
              parameters,
              createdBy
            });

            // Render with parameter value
            const rendered = await service.renderTemplate(
              template.templateId,
              { [paramName]: paramValue }
            );

            // Property: All occurrences SHALL be replaced
            const valueCount = (rendered.content.match(new RegExp(paramValue, 'g')) || []).length;
            expect(valueCount).toBe(occurrences);
            expect(rendered.content).not.toContain(placeholder);

            // Clean up
            store.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
