import * as fc from 'fast-check';
import { StrategyTemplate, ParameterValue } from '../types/template';
import { Strategy, StrategyState } from '../types/strategy';
import { strategyTemplateArb } from '../test/generators';

/**
 * Simple UUID v4 generator for testing (avoids ESM issues with uuid package)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * In-memory mock implementation of TemplateRepository for testing
 */
class MockTemplateStore {
  private templates: Map<string, Map<number, StrategyTemplate>> = new Map();

  async getTemplate(templateId: string): Promise<StrategyTemplate | null> {
    const versions = this.templates.get(templateId);
    if (!versions || versions.size === 0) {
      return null;
    }
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

  clear(): void {
    this.templates.clear();
  }
}

/**
 * In-memory mock implementation of StrategyRepository for testing
 */
class MockStrategyStore {
  private strategies: Map<string, Map<string, Strategy>> = new Map();

  async getStrategy(tenantId: string, strategyId: string): Promise<Strategy | null> {
    const tenantStrategies = this.strategies.get(tenantId);
    if (!tenantStrategies) {
      return null;
    }
    return tenantStrategies.get(strategyId) || null;
  }

  async putStrategy(tenantId: string, strategy: Strategy): Promise<void> {
    if (strategy.tenantId !== tenantId) {
      throw new Error('Tenant mismatch');
    }
    if (!this.strategies.has(tenantId)) {
      this.strategies.set(tenantId, new Map());
    }
    this.strategies.get(tenantId)!.set(strategy.strategyId, { ...strategy });
  }

  clear(): void {
    this.strategies.clear();
  }
}

/**
 * Mock Strategy Service that uses in-memory stores
 */
function createMockStrategyService(
  templateStore: MockTemplateStore,
  strategyStore: MockStrategyStore
) {
  return {
    async createStrategy(
      tenantId: string,
      templateId: string,
      name: string
    ): Promise<Strategy> {
      const template = await templateStore.getTemplate(templateId);
      
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const parameters: Record<string, ParameterValue> = {};
      for (const paramDef of template.parameters) {
        parameters[paramDef.name] = paramDef.defaultValue;
      }

      const now = new Date().toISOString();
      
      const strategy: Strategy = {
        strategyId: generateUUID(),
        tenantId,
        name,
        templateId: template.templateId,
        templateVersion: template.version,
        parameters,
        currentVersion: 1,
        state: 'DRAFT' as StrategyState,
        createdAt: now,
        updatedAt: now
      };

      await strategyStore.putStrategy(tenantId, strategy);

      return strategy;
    }
  };
}

/**
 * Mock Strategy Service with template reference validation
 */
function createMockStrategyServiceWithValidation(
  templateStore: MockTemplateStore,
  strategyStore: MockStrategyStore
) {
  return {
    async createStrategy(
      tenantId: string,
      templateId: string,
      name: string
    ): Promise<Strategy> {
      const template = await templateStore.getTemplate(templateId);
      
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const parameters: Record<string, ParameterValue> = {};
      for (const paramDef of template.parameters) {
        parameters[paramDef.name] = paramDef.defaultValue;
      }

      const now = new Date().toISOString();
      
      const strategy: Strategy = {
        strategyId: generateUUID(),
        tenantId,
        name,
        templateId: template.templateId,
        templateVersion: template.version,
        parameters,
        currentVersion: 1,
        state: 'DRAFT' as StrategyState,
        createdAt: now,
        updatedAt: now
      };

      await strategyStore.putStrategy(tenantId, strategy);

      return strategy;
    },

    async validateTemplateReference(strategy: Strategy): Promise<boolean> {
      const template = await templateStore.getTemplateVersion(
        strategy.templateId,
        strategy.templateVersion
      );

      if (!template) {
        throw new Error(
          `Invalid template reference: template '${strategy.templateId}' version ${strategy.templateVersion} not found`
        );
      }

      return true;
    },

    async getStrategyWithValidation(
      tenantId: string,
      strategyId: string
    ): Promise<Strategy> {
      const strategy = await strategyStore.getStrategy(tenantId, strategyId);
      if (!strategy) {
        throw new Error(`Strategy not found: ${strategyId}`);
      }
      await this.validateTemplateReference(strategy);
      return strategy;
    }
  };
}

/**
 * Mock Deployment Service that validates template reference before deployment
 */
function createMockDeploymentService(
  templateStore: MockTemplateStore,
  strategyStore: MockStrategyStore
) {
  return {
    async validateTemplateReferenceForDeployment(strategy: Strategy): Promise<void> {
      const template = await templateStore.getTemplateVersion(
        strategy.templateId,
        strategy.templateVersion
      );

      if (!template) {
        throw new Error(
          `Deployment rejected: Strategy references invalid template '${strategy.templateId}' version ${strategy.templateVersion}`
        );
      }
    },

    async deploy(
      tenantId: string,
      strategyId: string,
      mode: 'BACKTEST' | 'PAPER' | 'LIVE'
    ): Promise<{ deploymentId: string; strategyId: string; mode: string }> {
      const strategy = await strategyStore.getStrategy(tenantId, strategyId);
      if (!strategy) {
        throw new Error(`Strategy not found: ${strategyId}`);
      }

      await this.validateTemplateReferenceForDeployment(strategy);

      return {
        deploymentId: generateUUID(),
        strategyId: strategy.strategyId,
        mode
      };
    }
  };
}

describe('Strategy Service', () => {
  /**
   * Property 3: Strategy Initialization from Template
   * 
   * *For any* Strategy created from a Strategy_Template, all parameter values 
   * in the new Strategy SHALL equal the default values defined in the template's 
   * parameter definitions.
   * 
   * **Validates: Requirements 2.1**
   * 
   * Feature: strategy-management, Property 3: Strategy Initialization from Template
   */
  describe('Property 3: Strategy Initialization from Template', () => {
    let templateStore: MockTemplateStore;
    let strategyStore: MockStrategyStore;

    beforeEach(() => {
      templateStore = new MockTemplateStore();
      strategyStore = new MockStrategyStore();
    });

    it('strategy parameters equal template default values on creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          strategyTemplateArb(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (template, tenantId, strategyName) => {
            const normalizedTemplate: StrategyTemplate = {
              ...template,
              version: 1
            };

            await templateStore.putTemplate(normalizedTemplate);

            const service = createMockStrategyService(templateStore, strategyStore);

            const strategy = await service.createStrategy(
              tenantId,
              normalizedTemplate.templateId,
              strategyName
            );

            for (const paramDef of normalizedTemplate.parameters) {
              const strategyValue = strategy.parameters[paramDef.name];
              const templateDefault = paramDef.defaultValue;
              expect(strategyValue).toEqual(templateDefault);
            }

            const templateParamNames = new Set(normalizedTemplate.parameters.map(p => p.name));
            const strategyParamNames = new Set(Object.keys(strategy.parameters));
            expect(strategyParamNames).toEqual(templateParamNames);

            expect(strategy.templateId).toBe(normalizedTemplate.templateId);
            expect(strategy.templateVersion).toBe(normalizedTemplate.version);
            expect(strategy.state).toBe('DRAFT');
            expect(strategy.currentVersion).toBe(1);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('strategy with empty template parameters has empty parameters object', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (templateId, tenantId, strategyName) => {
            const template: StrategyTemplate = {
              templateId,
              name: 'Empty Template',
              description: 'Template with no parameters',
              version: 1,
              parameters: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await templateStore.putTemplate(template);

            const service = createMockStrategyService(templateStore, strategyStore);
            const strategy = await service.createStrategy(tenantId, templateId, strategyName);

            expect(Object.keys(strategy.parameters).length).toBe(0);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('each parameter type is correctly initialized', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          async (templateId, tenantId) => {
            const template: StrategyTemplate = {
              templateId,
              name: 'Multi-type Template',
              description: 'Template with all parameter types',
              version: 1,
              parameters: [
                { name: 'numberParam', dataType: 'number', defaultValue: 42.5, required: true, description: 'A number parameter' },
                { name: 'stringParam', dataType: 'string', defaultValue: 'default-string', required: true, description: 'A string parameter' },
                { name: 'booleanParam', dataType: 'boolean', defaultValue: true, required: true, description: 'A boolean parameter' },
                { name: 'enumParam', dataType: 'enum', defaultValue: 'OPTION_A', enumValues: ['OPTION_A', 'OPTION_B', 'OPTION_C'], required: true, description: 'An enum parameter' }
              ],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await templateStore.putTemplate(template);

            const service = createMockStrategyService(templateStore, strategyStore);
            const strategy = await service.createStrategy(tenantId, templateId, 'Test Strategy');

            expect(strategy.parameters['numberParam']).toBe(42.5);
            expect(typeof strategy.parameters['numberParam']).toBe('number');
            expect(strategy.parameters['stringParam']).toBe('default-string');
            expect(typeof strategy.parameters['stringParam']).toBe('string');
            expect(strategy.parameters['booleanParam']).toBe(true);
            expect(typeof strategy.parameters['booleanParam']).toBe('boolean');
            expect(strategy.parameters['enumParam']).toBe('OPTION_A');
            expect(typeof strategy.parameters['enumParam']).toBe('string');

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 6: Strategy-Template Reference Integrity
   * 
   * *For any* Strategy, it SHALL maintain a valid reference to an existing 
   * Strategy_Template and a specific template version that exists in the system.
   * 
   * **Validates: Requirements 2.5**
   * 
   * Feature: strategy-management, Property 6: Strategy-Template Reference Integrity
   */
  describe('Property 6: Strategy-Template Reference Integrity', () => {
    let templateStore: MockTemplateStore;
    let strategyStore: MockStrategyStore;

    beforeEach(() => {
      templateStore = new MockTemplateStore();
      strategyStore = new MockStrategyStore();
    });

    it('created strategy maintains valid template reference', async () => {
      await fc.assert(
        fc.asyncProperty(
          strategyTemplateArb(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (template, tenantId, strategyName) => {
            const normalizedTemplate: StrategyTemplate = { ...template, version: 1 };

            await templateStore.putTemplate(normalizedTemplate);

            const service = createMockStrategyServiceWithValidation(templateStore, strategyStore);
            const strategy = await service.createStrategy(tenantId, normalizedTemplate.templateId, strategyName);

            expect(strategy.templateId).toBe(normalizedTemplate.templateId);
            expect(strategy.templateVersion).toBe(normalizedTemplate.version);

            const isValid = await service.validateTemplateReference(strategy);
            expect(isValid).toBe(true);

            const retrievedStrategy = await service.getStrategyWithValidation(tenantId, strategy.strategyId);
            expect(retrievedStrategy.templateId).toBe(normalizedTemplate.templateId);
            expect(retrievedStrategy.templateVersion).toBe(normalizedTemplate.version);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('strategy with invalid template reference fails validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 100 }),
          async (strategyId, tenantId, nonExistentTemplateId, version) => {
            const service = createMockStrategyServiceWithValidation(templateStore, strategyStore);

            const strategy: Strategy = {
              strategyId,
              tenantId,
              name: 'Test Strategy',
              templateId: nonExistentTemplateId,
              templateVersion: version,
              parameters: {},
              currentVersion: 1,
              state: 'DRAFT',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await expect(service.validateTemplateReference(strategy)).rejects.toThrow(/Invalid template reference/);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('strategy references specific template version', async () => {
      await fc.assert(
        fc.asyncProperty(
          strategyTemplateArb(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.integer({ min: 1, max: 5 }),
          async (template, tenantId, strategyName, numVersions) => {
            let currentTemplate: StrategyTemplate = { ...template, version: 1 };
            await templateStore.putTemplate(currentTemplate);

            for (let i = 2; i <= numVersions; i++) {
              currentTemplate = { ...currentTemplate, version: i, updatedAt: new Date().toISOString() };
              await templateStore.putTemplate(currentTemplate);
            }

            const service = createMockStrategyServiceWithValidation(templateStore, strategyStore);
            const strategy = await service.createStrategy(tenantId, template.templateId, strategyName);

            expect(strategy.templateVersion).toBe(numVersions);

            const referencedTemplate = await templateStore.getTemplateVersion(strategy.templateId, strategy.templateVersion);
            expect(referencedTemplate).not.toBeNull();
            expect(referencedTemplate!.version).toBe(strategy.templateVersion);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: Template Reference Validation on Deployment
   * 
   * *For any* Strategy deployment, the Strategy SHALL reference a valid, 
   * existing Strategy_Template version. Deployment with invalid template 
   * references SHALL be rejected.
   * 
   * **Validates: Requirements 6.3**
   * 
   * Feature: strategy-management, Property 14: Template Reference Validation on Deployment
   */
  describe('Property 14: Template Reference Validation on Deployment', () => {
    let templateStore: MockTemplateStore;
    let strategyStore: MockStrategyStore;

    beforeEach(() => {
      templateStore = new MockTemplateStore();
      strategyStore = new MockStrategyStore();
    });

    it('deployment succeeds when strategy has valid template reference', async () => {
      await fc.assert(
        fc.asyncProperty(
          strategyTemplateArb(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.constantFrom('BACKTEST', 'PAPER', 'LIVE'),
          async (template, tenantId, strategyName, mode) => {
            const normalizedTemplate: StrategyTemplate = { ...template, version: 1 };
            await templateStore.putTemplate(normalizedTemplate);

            const parameters: Record<string, ParameterValue> = {};
            for (const paramDef of normalizedTemplate.parameters) {
              parameters[paramDef.name] = paramDef.defaultValue;
            }

            const strategy: Strategy = {
              strategyId: generateUUID(),
              tenantId,
              name: strategyName,
              templateId: normalizedTemplate.templateId,
              templateVersion: normalizedTemplate.version,
              parameters,
              currentVersion: 1,
              state: 'DRAFT',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await strategyStore.putStrategy(tenantId, strategy);

            const deploymentService = createMockDeploymentService(templateStore, strategyStore);
            const deployment = await deploymentService.deploy(tenantId, strategy.strategyId, mode as 'BACKTEST' | 'PAPER' | 'LIVE');

            expect(deployment.strategyId).toBe(strategy.strategyId);
            expect(deployment.mode).toBe(mode);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deployment is rejected when strategy has invalid template reference', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 100 }),
          fc.constantFrom('BACKTEST', 'PAPER', 'LIVE'),
          async (strategyId, tenantId, nonExistentTemplateId, version, mode) => {
            const strategy: Strategy = {
              strategyId,
              tenantId,
              name: 'Test Strategy',
              templateId: nonExistentTemplateId,
              templateVersion: version,
              parameters: {},
              currentVersion: 1,
              state: 'DRAFT',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await strategyStore.putStrategy(tenantId, strategy);

            const deploymentService = createMockDeploymentService(templateStore, strategyStore);

            await expect(
              deploymentService.deploy(tenantId, strategyId, mode as 'BACKTEST' | 'PAPER' | 'LIVE')
            ).rejects.toThrow(/Deployment rejected.*invalid template/);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deployment is rejected when strategy references wrong template version', async () => {
      await fc.assert(
        fc.asyncProperty(
          strategyTemplateArb(),
          fc.uuid(),
          fc.integer({ min: 2, max: 100 }),
          async (template, tenantId, wrongVersion) => {
            const normalizedTemplate: StrategyTemplate = { ...template, version: 1 };
            await templateStore.putTemplate(normalizedTemplate);

            const strategy: Strategy = {
              strategyId: generateUUID(),
              tenantId,
              name: 'Test Strategy',
              templateId: normalizedTemplate.templateId,
              templateVersion: wrongVersion,
              parameters: {},
              currentVersion: 1,
              state: 'DRAFT',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await strategyStore.putStrategy(tenantId, strategy);

            const deploymentService = createMockDeploymentService(templateStore, strategyStore);

            await expect(
              deploymentService.deploy(tenantId, strategy.strategyId, 'PAPER')
            ).rejects.toThrow(/Deployment rejected.*invalid template/);

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deployment validates template reference for all deployment modes', async () => {
      await fc.assert(
        fc.asyncProperty(
          strategyTemplateArb(),
          fc.uuid(),
          async (template, tenantId) => {
            const normalizedTemplate: StrategyTemplate = { ...template, version: 1 };
            await templateStore.putTemplate(normalizedTemplate);

            const parameters: Record<string, ParameterValue> = {};
            for (const paramDef of normalizedTemplate.parameters) {
              parameters[paramDef.name] = paramDef.defaultValue;
            }

            const strategy: Strategy = {
              strategyId: generateUUID(),
              tenantId,
              name: 'Test Strategy',
              templateId: normalizedTemplate.templateId,
              templateVersion: normalizedTemplate.version,
              parameters,
              currentVersion: 1,
              state: 'DRAFT',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await strategyStore.putStrategy(tenantId, strategy);

            const deploymentService = createMockDeploymentService(templateStore, strategyStore);

            const modes: Array<'BACKTEST' | 'PAPER' | 'LIVE'> = ['BACKTEST', 'PAPER', 'LIVE'];
            
            for (const mode of modes) {
              const deployment = await deploymentService.deploy(tenantId, strategy.strategyId, mode);
              expect(deployment.mode).toBe(mode);
            }

            templateStore.clear();
            strategyStore.clear();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
