import { StrategyTemplate, ParameterValue, ParameterDefinition } from '../types/template';
import { Strategy, StrategyState, StrategyVersion } from '../types/strategy';
import { Deployment, DeploymentConfig, DeploymentState } from '../types/deployment';

/**
 * Simple UUID v4 generator for testing
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * In-memory mock implementation of TemplateRepository
 */
class MockTemplateStore {
  private templates: Map<string, Map<number, StrategyTemplate>> = new Map();

  async getTemplate(templateId: string): Promise<StrategyTemplate | null> {
    const versions = this.templates.get(templateId);
    if (!versions || versions.size === 0) return null;
    const maxVersion = Math.max(...versions.keys());
    return versions.get(maxVersion) || null;
  }

  async getTemplateVersion(templateId: string, version: number): Promise<StrategyTemplate | null> {
    return this.templates.get(templateId)?.get(version) || null;
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
 * In-memory mock implementation of StrategyRepository
 */
class MockStrategyStore {
  private strategies: Map<string, Map<string, Strategy>> = new Map();

  async getStrategy(tenantId: string, strategyId: string): Promise<Strategy | null> {
    return this.strategies.get(tenantId)?.get(strategyId) || null;
  }

  async putStrategy(tenantId: string, strategy: Strategy): Promise<void> {
    if (strategy.tenantId !== tenantId) throw new Error('Tenant mismatch');
    if (!this.strategies.has(tenantId)) {
      this.strategies.set(tenantId, new Map());
    }
    this.strategies.get(tenantId)!.set(strategy.strategyId, { ...strategy });
  }

  async updateStrategy(tenantId: string, strategyId: string, updates: Partial<Strategy>): Promise<Strategy> {
    const existing = await this.getStrategy(tenantId, strategyId);
    if (!existing) throw new Error(`Strategy not found: ${strategyId}`);
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.putStrategy(tenantId, updated);
    return updated;
  }

  clear(): void {
    this.strategies.clear();
  }
}

/**
 * In-memory mock implementation of VersionRepository
 */
class MockVersionStore {
  private versions: Map<string, Map<number, StrategyVersion>> = new Map();

  async getVersion(strategyId: string, version: number): Promise<StrategyVersion | null> {
    return this.versions.get(strategyId)?.get(version) || null;
  }

  async getVersionHistory(strategyId: string): Promise<StrategyVersion[]> {
    const strategyVersions = this.versions.get(strategyId);
    if (!strategyVersions) return [];
    return Array.from(strategyVersions.values()).sort((a, b) => a.version - b.version);
  }

  async createVersion(strategyId: string, parameters: Record<string, ParameterValue>, createdBy: string, changeDescription?: string): Promise<StrategyVersion> {
    if (!this.versions.has(strategyId)) {
      this.versions.set(strategyId, new Map());
    }
    const strategyVersions = this.versions.get(strategyId)!;
    const newVersionNumber = strategyVersions.size + 1;
    const version: StrategyVersion = {
      strategyId,
      version: newVersionNumber,
      parameters: { ...parameters },
      createdAt: new Date().toISOString(),
      createdBy,
      changeDescription
    };
    strategyVersions.set(newVersionNumber, version);
    return version;
  }

  clear(): void {
    this.versions.clear();
  }
}

/**
 * In-memory mock implementation of DeploymentRepository
 */
class MockDeploymentStore {
  private deployments: Map<string, Map<string, Deployment>> = new Map();

  async getDeployment(tenantId: string, deploymentId: string): Promise<Deployment | null> {
    return this.deployments.get(tenantId)?.get(deploymentId) || null;
  }

  async putDeployment(tenantId: string, deployment: Deployment): Promise<void> {
    if (deployment.tenantId !== tenantId) throw new Error('Tenant mismatch');
    if (!this.deployments.has(tenantId)) {
      this.deployments.set(tenantId, new Map());
    }
    this.deployments.get(tenantId)!.set(deployment.deploymentId, { ...deployment });
  }

  async updateDeployment(tenantId: string, deploymentId: string, updates: Partial<Deployment>): Promise<Deployment> {
    const existing = await this.getDeployment(tenantId, deploymentId);
    if (!existing) throw new Error(`Deployment not found: ${deploymentId}`);
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.putDeployment(tenantId, updated);
    return updated;
  }

  clear(): void {
    this.deployments.clear();
  }
}


/**
 * Integrated Strategy Lifecycle Service
 * Combines all services for end-to-end lifecycle testing
 */
class StrategyLifecycleService {
  constructor(
    private templateStore: MockTemplateStore,
    private strategyStore: MockStrategyStore,
    private versionStore: MockVersionStore,
    private deploymentStore: MockDeploymentStore
  ) {}

  /**
   * Create a new strategy from a template
   * Requirements: 2.1
   */
  async createStrategy(tenantId: string, templateId: string, name: string): Promise<Strategy> {
    const template = await this.templateStore.getTemplate(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);

    const parameters: Record<string, ParameterValue> = {};
    for (const paramDef of template.parameters) {
      parameters[paramDef.name] = paramDef.defaultValue;
    }

    const strategy: Strategy = {
      strategyId: generateUUID(),
      tenantId,
      name,
      templateId: template.templateId,
      templateVersion: template.version,
      parameters,
      currentVersion: 1,
      state: 'DRAFT' as StrategyState,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.strategyStore.putStrategy(tenantId, strategy);
    await this.versionStore.createVersion(strategy.strategyId, parameters, tenantId, 'Initial creation');

    return strategy;
  }

  /**
   * Update strategy parameters with validation
   * Requirements: 2.4
   */
  async updateParameters(
    tenantId: string,
    strategyId: string,
    parameters: Record<string, ParameterValue>,
    changeDescription?: string
  ): Promise<Strategy> {
    const strategy = await this.strategyStore.getStrategy(tenantId, strategyId);
    if (!strategy) throw new Error(`Strategy not found: ${strategyId}`);

    const template = await this.templateStore.getTemplateVersion(strategy.templateId, strategy.templateVersion);
    if (!template) throw new Error(`Template not found: ${strategy.templateId}`);

    // Validate parameters against template bounds
    for (const [paramName, value] of Object.entries(parameters)) {
      const paramDef = template.parameters.find(p => p.name === paramName);
      if (!paramDef) throw new Error(`Unknown parameter: ${paramName}`);
      
      if (paramDef.hardBounds && typeof value === 'number') {
        if (paramDef.hardBounds.min !== undefined && value < paramDef.hardBounds.min) {
          throw new Error(`Parameter ${paramName} value ${value} is below minimum ${paramDef.hardBounds.min}`);
        }
        if (paramDef.hardBounds.max !== undefined && value > paramDef.hardBounds.max) {
          throw new Error(`Parameter ${paramName} value ${value} is above maximum ${paramDef.hardBounds.max}`);
        }
      }
    }

    const updatedParameters = { ...strategy.parameters, ...parameters };
    const newVersion = strategy.currentVersion + 1;

    await this.versionStore.createVersion(strategyId, updatedParameters, tenantId, changeDescription);

    return await this.strategyStore.updateStrategy(tenantId, strategyId, {
      parameters: updatedParameters,
      currentVersion: newVersion
    });
  }

  /**
   * Get version history for a strategy
   * Requirements: 3.1
   */
  async getVersionHistory(tenantId: string, strategyId: string): Promise<StrategyVersion[]> {
    const strategy = await this.strategyStore.getStrategy(tenantId, strategyId);
    if (!strategy) throw new Error(`Strategy not found: ${strategyId}`);
    return await this.versionStore.getVersionHistory(strategyId);
  }

  /**
   * Deploy a strategy
   * Requirements: 4.1
   */
  async deploy(
    tenantId: string,
    config: DeploymentConfig,
    riskControls?: { maxPositionSize: number; maxDailyLoss: number }
  ): Promise<Deployment> {
    const strategy = await this.strategyStore.getStrategy(tenantId, config.strategyId);
    if (!strategy) throw new Error(`Strategy not found: ${config.strategyId}`);

    // Validate template reference
    const template = await this.templateStore.getTemplateVersion(strategy.templateId, strategy.templateVersion);
    if (!template) throw new Error(`Invalid template reference: ${strategy.templateId}`);

    // Mode-specific validation
    if (config.mode === 'BACKTEST') {
      if (!config.backtestConfig?.startDate || !config.backtestConfig?.endDate) {
        throw new Error('BACKTEST mode requires startDate and endDate');
      }
    }

    if (config.mode === 'LIVE') {
      if (!riskControls?.maxPositionSize || !riskControls?.maxDailyLoss) {
        throw new Error('LIVE mode requires risk controls');
      }
    }

    const deployment: Deployment = {
      deploymentId: generateUUID(),
      strategyId: config.strategyId,
      tenantId,
      mode: config.mode,
      state: 'PENDING' as DeploymentState,
      strategyVersion: strategy.currentVersion,
      config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.deploymentStore.putDeployment(tenantId, deployment);
    return deployment;
  }

  /**
   * Update deployment state
   */
  async updateDeploymentState(tenantId: string, deploymentId: string, state: DeploymentState): Promise<Deployment> {
    return await this.deploymentStore.updateDeployment(tenantId, deploymentId, { state });
  }
}

/**
 * Integration Tests for Strategy Lifecycle
 * 
 * Tests the complete flow: create → configure → version → deploy
 * 
 * Requirements: 2.1, 2.4, 3.1, 4.1
 */
describe('Strategy Lifecycle Integration Tests', () => {
  let templateStore: MockTemplateStore;
  let strategyStore: MockStrategyStore;
  let versionStore: MockVersionStore;
  let deploymentStore: MockDeploymentStore;
  let lifecycleService: StrategyLifecycleService;

  const testTemplate: StrategyTemplate = {
    templateId: 'test-template-001',
    name: 'Test Trading Strategy',
    description: 'A test strategy template',
    version: 1,
    parameters: [
      {
        name: 'entryThreshold',
        dataType: 'number',
        defaultValue: 0.5,
        hardBounds: { min: 0, max: 1 },
        required: true,
        description: 'Entry threshold percentage'
      },
      {
        name: 'positionSize',
        dataType: 'number',
        defaultValue: 100,
        hardBounds: { min: 10, max: 10000 },
        required: true,
        description: 'Position size in units'
      },
      {
        name: 'enableStopLoss',
        dataType: 'boolean',
        defaultValue: true,
        required: true,
        description: 'Enable stop loss'
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(async () => {
    templateStore = new MockTemplateStore();
    strategyStore = new MockStrategyStore();
    versionStore = new MockVersionStore();
    deploymentStore = new MockDeploymentStore();
    lifecycleService = new StrategyLifecycleService(templateStore, strategyStore, versionStore, deploymentStore);

    await templateStore.putTemplate(testTemplate);
  });

  afterEach(() => {
    templateStore.clear();
    strategyStore.clear();
    versionStore.clear();
    deploymentStore.clear();
  });

  describe('Complete Lifecycle Flow', () => {
    it('should complete full lifecycle: create → configure → version → deploy', async () => {
      const tenantId = generateUUID();

      // Step 1: Create strategy from template (Requirement 2.1)
      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'My Trading Strategy');
      
      expect(strategy.strategyId).toBeDefined();
      expect(strategy.templateId).toBe(testTemplate.templateId);
      expect(strategy.parameters['entryThreshold']).toBe(0.5);
      expect(strategy.parameters['positionSize']).toBe(100);
      expect(strategy.currentVersion).toBe(1);

      // Step 2: Configure parameters (Requirement 2.4)
      const updatedStrategy = await lifecycleService.updateParameters(
        tenantId,
        strategy.strategyId,
        { entryThreshold: 0.7, positionSize: 500 },
        'Adjusted entry threshold and position size'
      );

      expect(updatedStrategy.parameters['entryThreshold']).toBe(0.7);
      expect(updatedStrategy.parameters['positionSize']).toBe(500);
      expect(updatedStrategy.currentVersion).toBe(2);

      // Step 3: Verify version history (Requirement 3.1)
      const versions = await lifecycleService.getVersionHistory(tenantId, strategy.strategyId);
      
      expect(versions.length).toBe(2);
      expect(versions[0].version).toBe(1);
      expect(versions[0].parameters['entryThreshold']).toBe(0.5);
      expect(versions[1].version).toBe(2);
      expect(versions[1].parameters['entryThreshold']).toBe(0.7);

      // Step 4: Deploy strategy (Requirement 4.1)
      const deployment = await lifecycleService.deploy(tenantId, {
        strategyId: strategy.strategyId,
        mode: 'PAPER'
      });

      expect(deployment.deploymentId).toBeDefined();
      expect(deployment.strategyId).toBe(strategy.strategyId);
      expect(deployment.mode).toBe('PAPER');
      expect(deployment.state).toBe('PENDING');
      expect(deployment.strategyVersion).toBe(2);
    });

    it('should create multiple versions through parameter updates', async () => {
      const tenantId = generateUUID();

      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'Versioned Strategy');

      // Make multiple updates
      await lifecycleService.updateParameters(tenantId, strategy.strategyId, { entryThreshold: 0.3 });
      await lifecycleService.updateParameters(tenantId, strategy.strategyId, { positionSize: 200 });
      await lifecycleService.updateParameters(tenantId, strategy.strategyId, { enableStopLoss: false });

      const versions = await lifecycleService.getVersionHistory(tenantId, strategy.strategyId);
      
      expect(versions.length).toBe(4);
      expect(versions.map(v => v.version)).toEqual([1, 2, 3, 4]);
    });

    it('should reject parameter updates outside hard bounds', async () => {
      const tenantId = generateUUID();

      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'Bounded Strategy');

      // Try to set entryThreshold above max (1)
      await expect(
        lifecycleService.updateParameters(tenantId, strategy.strategyId, { entryThreshold: 1.5 })
      ).rejects.toThrow(/above maximum/);

      // Try to set positionSize below min (10)
      await expect(
        lifecycleService.updateParameters(tenantId, strategy.strategyId, { positionSize: 5 })
      ).rejects.toThrow(/below minimum/);
    });

    it('should require backtest config for BACKTEST mode deployment', async () => {
      const tenantId = generateUUID();

      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'Backtest Strategy');

      // Deploy without backtest config should fail
      await expect(
        lifecycleService.deploy(tenantId, {
          strategyId: strategy.strategyId,
          mode: 'BACKTEST'
        })
      ).rejects.toThrow(/BACKTEST mode requires/);

      // Deploy with backtest config should succeed
      const deployment = await lifecycleService.deploy(tenantId, {
        strategyId: strategy.strategyId,
        mode: 'BACKTEST',
        backtestConfig: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-06-01T00:00:00Z',
          initialCapital: 10000
        }
      });

      expect(deployment.mode).toBe('BACKTEST');
    });

    it('should require risk controls for LIVE mode deployment', async () => {
      const tenantId = generateUUID();

      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'Live Strategy');

      // Deploy without risk controls should fail
      await expect(
        lifecycleService.deploy(tenantId, {
          strategyId: strategy.strategyId,
          mode: 'LIVE'
        })
      ).rejects.toThrow(/LIVE mode requires risk controls/);

      // Deploy with risk controls should succeed
      const deployment = await lifecycleService.deploy(
        tenantId,
        { strategyId: strategy.strategyId, mode: 'LIVE' },
        { maxPositionSize: 1000, maxDailyLoss: 500 }
      );

      expect(deployment.mode).toBe('LIVE');
    });

    it('should allow PAPER mode deployment without additional requirements', async () => {
      const tenantId = generateUUID();

      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'Paper Strategy');

      const deployment = await lifecycleService.deploy(tenantId, {
        strategyId: strategy.strategyId,
        mode: 'PAPER'
      });

      expect(deployment.mode).toBe('PAPER');
      expect(deployment.state).toBe('PENDING');
    });

    it('should track deployment state transitions', async () => {
      const tenantId = generateUUID();

      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'State Strategy');

      const deployment = await lifecycleService.deploy(tenantId, {
        strategyId: strategy.strategyId,
        mode: 'PAPER'
      });

      expect(deployment.state).toBe('PENDING');

      // Transition to RUNNING
      const runningDeployment = await lifecycleService.updateDeploymentState(tenantId, deployment.deploymentId, 'RUNNING');
      expect(runningDeployment.state).toBe('RUNNING');

      // Transition to PAUSED
      const pausedDeployment = await lifecycleService.updateDeploymentState(tenantId, deployment.deploymentId, 'PAUSED');
      expect(pausedDeployment.state).toBe('PAUSED');

      // Transition to STOPPED
      const stoppedDeployment = await lifecycleService.updateDeploymentState(tenantId, deployment.deploymentId, 'STOPPED');
      expect(stoppedDeployment.state).toBe('STOPPED');
    });

    it('should preserve version history after multiple deployments', async () => {
      const tenantId = generateUUID();

      const strategy = await lifecycleService.createStrategy(tenantId, testTemplate.templateId, 'Multi-Deploy Strategy');

      // Update and deploy multiple times
      await lifecycleService.updateParameters(tenantId, strategy.strategyId, { entryThreshold: 0.3 });
      const deployment1 = await lifecycleService.deploy(tenantId, { strategyId: strategy.strategyId, mode: 'PAPER' });

      await lifecycleService.updateParameters(tenantId, strategy.strategyId, { entryThreshold: 0.6 });
      const deployment2 = await lifecycleService.deploy(tenantId, { strategyId: strategy.strategyId, mode: 'PAPER' });

      // Verify deployments captured correct versions
      expect(deployment1.strategyVersion).toBe(2);
      expect(deployment2.strategyVersion).toBe(3);

      // Verify version history is complete
      const versions = await lifecycleService.getVersionHistory(tenantId, strategy.strategyId);
      expect(versions.length).toBe(3);
    });
  });
});
