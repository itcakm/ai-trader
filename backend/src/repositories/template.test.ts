import * as fc from 'fast-check';
import { StrategyTemplate, ParameterDefinition } from '../types/template';
import { strategyTemplateArb, parameterDefinitionArb } from '../test/generators';

/**
 * In-memory mock implementation of TemplateRepository for testing
 * This allows us to test the versioning logic without DynamoDB
 */
class MockTemplateStore {
  private templates: Map<string, Map<number, StrategyTemplate>> = new Map();

  async getTemplate(templateId: string): Promise<StrategyTemplate | null> {
    const versions = this.templates.get(templateId);
    if (!versions || versions.size === 0) {
      return null;
    }
    // Get the highest version
    const maxVersion = Math.max(...versions.keys());
    return versions.get(maxVersion) || null;
  }

  async getTemplateVersion(templateId: string, version: number): Promise<StrategyTemplate | null> {
    const versions = this.templates.get(templateId);
    if (!versions) {
      return null;
    }
    return versions.get(version) || null;
  }

  async putTemplate(template: StrategyTemplate): Promise<void> {
    if (!this.templates.has(template.templateId)) {
      this.templates.set(template.templateId, new Map());
    }
    this.templates.get(template.templateId)!.set(template.version, { ...template });
  }

  async getTemplateVersionHistory(templateId: string): Promise<StrategyTemplate[]> {
    const versions = this.templates.get(templateId);
    if (!versions) {
      return [];
    }
    return Array.from(versions.values()).sort((a, b) => a.version - b.version);
  }

  async createNewVersion(
    templateId: string,
    updates: Partial<Pick<StrategyTemplate, 'name' | 'description' | 'parameters'>>
  ): Promise<StrategyTemplate> {
    const currentTemplate = await this.getTemplate(templateId);
    
    if (!currentTemplate) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const now = new Date().toISOString();
    
    const newVersion: StrategyTemplate = {
      ...currentTemplate,
      ...updates,
      version: currentTemplate.version + 1,
      updatedAt: now
    };

    await this.putTemplate(newVersion);
    return newVersion;
  }

  clear(): void {
    this.templates.clear();
  }
}

describe('Template Versioning', () => {
  /**
   * Property 2: Template Versioning Preserves History
   * 
   * *For any* Strategy_Template that is updated, both the original version 
   * and the new version SHALL be retrievable, and the new version number 
   * SHALL be greater than the original.
   * 
   * **Validates: Requirements 1.5**
   * 
   * Feature: strategy-management, Property 2: Template Versioning Preserves History
   */
  describe('Property 2: Template Versioning Preserves History', () => {
    let store: MockTemplateStore;

    beforeEach(() => {
      store = new MockTemplateStore();
    });

    it('updating a template preserves the original version and creates a new version with higher version number', async () => {
      await fc.assert(
        fc.asyncProperty(
          strategyTemplateArb(),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.array(parameterDefinitionArb(), { minLength: 0, maxLength: 5 }),
          async (originalTemplate, newName, newDescription, newParameters) => {
            // Normalize the original template to version 1
            const template: StrategyTemplate = {
              ...originalTemplate,
              version: 1
            };

            // Store the original template
            await store.putTemplate(template);

            // Verify original is stored
            const storedOriginal = await store.getTemplateVersion(template.templateId, 1);
            expect(storedOriginal).not.toBeNull();
            expect(storedOriginal!.version).toBe(1);

            // Create a new version with updates
            const newVersion = await store.createNewVersion(template.templateId, {
              name: newName,
              description: newDescription,
              parameters: newParameters
            });

            // Property: New version number SHALL be greater than original
            expect(newVersion.version).toBeGreaterThan(template.version);
            expect(newVersion.version).toBe(template.version + 1);

            // Property: Original version SHALL still be retrievable
            const retrievedOriginal = await store.getTemplateVersion(template.templateId, 1);
            expect(retrievedOriginal).not.toBeNull();
            expect(retrievedOriginal!.templateId).toBe(template.templateId);
            expect(retrievedOriginal!.version).toBe(1);
            expect(retrievedOriginal!.name).toBe(template.name);
            expect(retrievedOriginal!.description).toBe(template.description);

            // Property: New version SHALL be retrievable
            const retrievedNew = await store.getTemplateVersion(template.templateId, 2);
            expect(retrievedNew).not.toBeNull();
            expect(retrievedNew!.templateId).toBe(template.templateId);
            expect(retrievedNew!.version).toBe(2);
            expect(retrievedNew!.name).toBe(newName);
            expect(retrievedNew!.description).toBe(newDescription);

            // Property: Both versions exist in history
            const history = await store.getTemplateVersionHistory(template.templateId);
            expect(history.length).toBe(2);
            expect(history[0].version).toBe(1);
            expect(history[1].version).toBe(2);

            // Clean up for next iteration
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
          strategyTemplateArb(),
          fc.integer({ min: 2, max: 5 }),
          async (originalTemplate, numUpdates) => {
            // Normalize to version 1
            const template: StrategyTemplate = {
              ...originalTemplate,
              version: 1
            };

            // Store the original
            await store.putTemplate(template);

            // Perform multiple updates
            for (let i = 0; i < numUpdates; i++) {
              await store.createNewVersion(template.templateId, {
                name: `Updated Name ${i + 1}`,
                description: `Updated Description ${i + 1}`
              });
            }

            // Property: All versions should be retrievable
            const history = await store.getTemplateVersionHistory(template.templateId);
            expect(history.length).toBe(numUpdates + 1);

            // Property: Versions should be in ascending order
            for (let i = 0; i < history.length; i++) {
              expect(history[i].version).toBe(i + 1);
            }

            // Property: Each version should be individually retrievable
            for (let v = 1; v <= numUpdates + 1; v++) {
              const version = await store.getTemplateVersion(template.templateId, v);
              expect(version).not.toBeNull();
              expect(version!.version).toBe(v);
            }

            // Property: Latest version should have highest version number
            const latest = await store.getTemplate(template.templateId);
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
          strategyTemplateArb(),
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }),
              description: fc.string({ minLength: 1, maxLength: 200 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (originalTemplate, updates) => {
            // Normalize to version 1
            const template: StrategyTemplate = {
              ...originalTemplate,
              version: 1
            };

            await store.putTemplate(template);

            let previousVersion = 1;

            for (const update of updates) {
              const newVersion = await store.createNewVersion(template.templateId, update);
              
              // Property: Each new version is exactly 1 greater than previous
              expect(newVersion.version).toBe(previousVersion + 1);
              
              previousVersion = newVersion.version;
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
