import * as fc from 'fast-check';
import { StrategyVersion, ParameterValue } from '../types/strategy';
import { parametersRecordArb } from '../test/generators';

/**
 * In-memory mock implementation of VersionRepository for testing
 */
class MockVersionStore {
  private versions: Map<string, Map<number, StrategyVersion>> = new Map();

  async getVersion(strategyId: string, version: number): Promise<StrategyVersion | null> {
    const strategyVersions = this.versions.get(strategyId);
    if (!strategyVersions) {
      return null;
    }
    const v = strategyVersions.get(version);
    return v ? this.deepCopyVersion(v) : null;
  }

  async getVersionHistory(strategyId: string): Promise<StrategyVersion[]> {
    const strategyVersions = this.versions.get(strategyId);
    if (!strategyVersions) {
      return [];
    }
    const versions = Array.from(strategyVersions.values());
    // Sort by createdAt ascending
    versions.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return versions.map(v => this.deepCopyVersion(v));
  }

  async putVersion(version: StrategyVersion): Promise<void> {
    if (!this.versions.has(version.strategyId)) {
      this.versions.set(version.strategyId, new Map());
    }
    const strategyVersions = this.versions.get(version.strategyId)!;
    
    // Check if version already exists (immutability)
    if (strategyVersions.has(version.version)) {
      throw new Error(`Version ${version.version} already exists for strategy ${version.strategyId}`);
    }
    
    strategyVersions.set(version.version, this.deepCopyVersion(version));
  }

  async getLatestVersionNumber(strategyId: string): Promise<number> {
    const strategyVersions = this.versions.get(strategyId);
    if (!strategyVersions || strategyVersions.size === 0) {
      return 0;
    }
    return Math.max(...strategyVersions.keys());
  }

  async createVersion(
    strategyId: string,
    parameters: Record<string, ParameterValue>,
    createdBy: string,
    changeDescription?: string
  ): Promise<StrategyVersion> {
    const latestVersion = await this.getLatestVersionNumber(strategyId);
    const newVersionNumber = latestVersion + 1;
    const now = new Date().toISOString();

    const newVersion: StrategyVersion = {
      strategyId,
      version: newVersionNumber,
      parameters: { ...parameters },
      createdAt: now,
      createdBy,
      changeDescription
    };

    await this.putVersion(newVersion);
    return this.deepCopyVersion(newVersion);
  }

  deepCopyVersion(version: StrategyVersion): StrategyVersion {
    return {
      strategyId: version.strategyId,
      version: version.version,
      parameters: { ...version.parameters },
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      changeDescription: version.changeDescription
    };
  }

  clear(): void {
    this.versions.clear();
  }
}

describe('Version Repository', () => {
  /**
   * Property 7: Version Number Incrementing
   * 
   * *For any* sequence of saves to a Strategy, each new Strategy_Version SHALL 
   * have a version number exactly one greater than the previous version.
   * 
   * **Validates: Requirements 3.1**
   * 
   * Feature: strategy-management, Property 7: Version Number Incrementing
   */
  describe('Property 7: Version Number Incrementing', () => {
    let versionStore: MockVersionStore;

    beforeEach(() => {
      versionStore = new MockVersionStore();
    });

    afterEach(() => {
      versionStore.clear();
    });

    it('each new version has version number exactly one greater than previous', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 10 }),
          fc.array(parametersRecordArb(), { minLength: 1, maxLength: 10 }),
          async (strategyId, tenantId, _numVersions, parametersList) => {
            let expectedVersion = 1;

            for (const parameters of parametersList) {
              const version = await versionStore.createVersion(
                strategyId,
                parameters,
                tenantId,
                `Version ${expectedVersion}`
              );

              // Each version should be exactly one greater than previous
              expect(version.version).toBe(expectedVersion);
              expectedVersion++;
            }

            // Verify the final version number matches expected
            const latestVersion = await versionStore.getLatestVersionNumber(strategyId);
            expect(latestVersion).toBe(parametersList.length);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('first version is always version 1', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          parametersRecordArb(),
          async (strategyId, tenantId, parameters) => {
            const version = await versionStore.createVersion(
              strategyId,
              parameters,
              tenantId,
              'Initial version'
            );

            expect(version.version).toBe(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('version numbers are consecutive with no gaps', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 2, max: 20 }),
          async (strategyId, tenantId, numVersions) => {
            // Create multiple versions
            for (let i = 0; i < numVersions; i++) {
              await versionStore.createVersion(
                strategyId,
                { param: i },
                tenantId,
                `Version ${i + 1}`
              );
            }

            // Get all versions and verify they are consecutive
            const history = await versionStore.getVersionHistory(strategyId);
            
            expect(history.length).toBe(numVersions);
            
            for (let i = 0; i < history.length; i++) {
              expect(history[i].version).toBe(i + 1);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  /**
   * Property 8: Version Immutability
   * 
   * *For any* Strategy_Version that has been created, subsequent operations 
   * SHALL NOT modify the parameters or metadata of that version; the version's 
   * data SHALL remain identical across all retrievals.
   * 
   * **Validates: Requirements 3.2**
   * 
   * Feature: strategy-management, Property 8: Version Immutability
   */
  describe('Property 8: Version Immutability', () => {
    let versionStore: MockVersionStore;

    beforeEach(() => {
      versionStore = new MockVersionStore();
    });

    afterEach(() => {
      versionStore.clear();
    });

    it('version data remains identical across multiple retrievals', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          parametersRecordArb(),
          fc.string({ minLength: 0, maxLength: 100 }),
          async (strategyId, tenantId, parameters, changeDescription) => {
            // Create a version
            const createdVersion = await versionStore.createVersion(
              strategyId,
              parameters,
              tenantId,
              changeDescription || undefined
            );

            // Retrieve the version multiple times
            const retrieval1 = await versionStore.getVersion(strategyId, createdVersion.version);
            const retrieval2 = await versionStore.getVersion(strategyId, createdVersion.version);
            const retrieval3 = await versionStore.getVersion(strategyId, createdVersion.version);

            // All retrievals should be identical
            expect(retrieval1).toEqual(retrieval2);
            expect(retrieval2).toEqual(retrieval3);
            expect(retrieval1).toEqual(createdVersion);

            // Verify specific fields
            expect(retrieval1!.strategyId).toBe(strategyId);
            expect(retrieval1!.version).toBe(createdVersion.version);
            expect(retrieval1!.parameters).toEqual(parameters);
            expect(retrieval1!.createdBy).toBe(tenantId);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('modifying returned version does not affect stored version', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          parametersRecordArb(),
          async (strategyId, tenantId, parameters) => {
            // Create a version
            const createdVersion = await versionStore.createVersion(
              strategyId,
              parameters,
              tenantId,
              'Test version'
            );

            // Get the version
            const retrievedVersion = await versionStore.getVersion(strategyId, createdVersion.version);

            // Modify the retrieved version
            retrievedVersion!.parameters['modifiedParam'] = 'modified value';
            (retrievedVersion as any).version = 999;
            (retrievedVersion as any).createdBy = 'hacker';

            // Get the version again
            const freshRetrieval = await versionStore.getVersion(strategyId, createdVersion.version);

            // The stored version should be unchanged
            expect(freshRetrieval!.parameters).toEqual(parameters);
            expect(freshRetrieval!.version).toBe(createdVersion.version);
            expect(freshRetrieval!.createdBy).toBe(tenantId);
            expect(freshRetrieval!.parameters['modifiedParam']).toBeUndefined();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cannot overwrite existing version', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          parametersRecordArb(),
          parametersRecordArb(),
          async (strategyId, tenantId, params1, params2) => {
            // Create initial version
            const version1 = await versionStore.createVersion(
              strategyId,
              params1,
              tenantId,
              'Version 1'
            );

            // Attempt to put a version with the same version number
            const duplicateVersion: StrategyVersion = {
              strategyId,
              version: version1.version,
              parameters: params2,
              createdAt: new Date().toISOString(),
              createdBy: 'attacker',
              changeDescription: 'Attempted overwrite'
            };

            // Should throw an error
            await expect(versionStore.putVersion(duplicateVersion)).rejects.toThrow();

            // Original version should be unchanged
            const retrieved = await versionStore.getVersion(strategyId, version1.version);
            expect(retrieved!.parameters).toEqual(params1);
            expect(retrieved!.createdBy).toBe(tenantId);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('version history returns immutable copies', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 2, max: 5 }),
          async (strategyId, tenantId, numVersions) => {
            // Create multiple versions
            for (let i = 0; i < numVersions; i++) {
              await versionStore.createVersion(
                strategyId,
                { param: `value${i}` },
                tenantId,
                `Version ${i + 1}`
              );
            }

            // Get version history
            const history1 = await versionStore.getVersionHistory(strategyId);

            // Modify the returned history
            history1[0].parameters['hacked'] = true;
            (history1[0] as any).version = 999;

            // Get history again
            const history2 = await versionStore.getVersionHistory(strategyId);

            // The stored versions should be unchanged
            expect(history2[0].version).toBe(1);
            expect(history2[0].parameters['hacked']).toBeUndefined();
            expect(history2[0].parameters['param']).toBe('value0');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 9: Version History Ordering
   * 
   * *For any* Strategy with multiple versions, requesting the version history 
   * SHALL return all versions ordered by creation timestamp in ascending order, 
   * and requesting any specific version SHALL return the complete parameter 
   * snapshot for that version.
   * 
   * **Validates: Requirements 3.3, 3.4**
   * 
   * Feature: strategy-management, Property 9: Version History Ordering
   */
  describe('Property 9: Version History Ordering', () => {
    let versionStore: MockVersionStore;

    beforeEach(() => {
      versionStore = new MockVersionStore();
    });

    afterEach(() => {
      versionStore.clear();
    });

    it('version history is ordered by creation timestamp ascending', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 2, max: 10 }),
          async (strategyId, tenantId, numVersions) => {
            // Create multiple versions with small delays to ensure different timestamps
            const createdVersions: StrategyVersion[] = [];
            for (let i = 0; i < numVersions; i++) {
              const version = await versionStore.createVersion(
                strategyId,
                { iteration: i, value: `value${i}` },
                tenantId,
                `Version ${i + 1}`
              );
              createdVersions.push(version);
            }

            // Get version history
            const history = await versionStore.getVersionHistory(strategyId);

            // Verify all versions are present
            expect(history.length).toBe(numVersions);

            // Verify ordering by creation timestamp (ascending)
            for (let i = 1; i < history.length; i++) {
              const prevTime = new Date(history[i - 1].createdAt).getTime();
              const currTime = new Date(history[i].createdAt).getTime();
              expect(currTime).toBeGreaterThanOrEqual(prevTime);
            }

            // Verify version numbers are in order
            for (let i = 0; i < history.length; i++) {
              expect(history[i].version).toBe(i + 1);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('specific version retrieval returns complete parameter snapshot', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(parametersRecordArb(), { minLength: 1, maxLength: 5 }),
          async (strategyId, tenantId, parametersList) => {
            // Create versions with different parameters
            const createdVersions: StrategyVersion[] = [];
            for (let i = 0; i < parametersList.length; i++) {
              const version = await versionStore.createVersion(
                strategyId,
                parametersList[i],
                tenantId,
                `Version ${i + 1}`
              );
              createdVersions.push(version);
            }

            // Retrieve each version and verify complete parameter snapshot
            for (let i = 0; i < createdVersions.length; i++) {
              const retrieved = await versionStore.getVersion(strategyId, i + 1);
              
              expect(retrieved).not.toBeNull();
              expect(retrieved!.version).toBe(i + 1);
              expect(retrieved!.parameters).toEqual(parametersList[i]);
              expect(retrieved!.strategyId).toBe(strategyId);
              expect(retrieved!.createdBy).toBe(tenantId);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('version history contains all created versions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 15 }),
          async (strategyId, tenantId, numVersions) => {
            // Create versions
            for (let i = 0; i < numVersions; i++) {
              await versionStore.createVersion(
                strategyId,
                { versionIndex: i },
                tenantId,
                `Version ${i + 1}`
              );
            }

            // Get history
            const history = await versionStore.getVersionHistory(strategyId);

            // Verify count
            expect(history.length).toBe(numVersions);

            // Verify each version is present with correct data
            for (let i = 0; i < numVersions; i++) {
              const version = history.find(v => v.version === i + 1);
              expect(version).toBeDefined();
              expect(version!.parameters.versionIndex).toBe(i);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty strategy has empty version history', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (strategyId) => {
            const history = await versionStore.getVersionHistory(strategyId);
            expect(history).toEqual([]);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('non-existent version returns null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 10, max: 100 }),
          async (strategyId, tenantId, numVersions, nonExistentVersion) => {
            // Create some versions
            for (let i = 0; i < numVersions; i++) {
              await versionStore.createVersion(
                strategyId,
                { index: i },
                tenantId
              );
            }

            // Try to get a non-existent version
            const result = await versionStore.getVersion(strategyId, nonExistentVersion);
            expect(result).toBeNull();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 10: Rollback Creates New Version
   * 
   * *For any* rollback operation to a previous Strategy_Version, the system 
   * SHALL create a new Strategy_Version (with incremented version number) 
   * containing the same parameter values as the target rollback version.
   * 
   * **Validates: Requirements 3.5**
   * 
   * Feature: strategy-management, Property 10: Rollback Creates New Version
   */
  describe('Property 10: Rollback Creates New Version', () => {
    let versionStore: MockVersionStore;

    beforeEach(() => {
      versionStore = new MockVersionStore();
    });

    afterEach(() => {
      versionStore.clear();
    });

    /**
     * Mock rollback function that simulates the strategy service rollback behavior
     */
    async function rollbackToVersion(
      strategyId: string,
      targetVersion: number,
      tenantId: string
    ): Promise<{ newVersion: StrategyVersion; currentVersionNumber: number }> {
      // Get the target version
      const targetVersionData = await versionStore.getVersion(strategyId, targetVersion);
      
      if (!targetVersionData) {
        throw new Error(`Version ${targetVersion} not found`);
      }

      // Get current version number
      const currentVersionNumber = await versionStore.getLatestVersionNumber(strategyId);

      // Create a new version with the rolled-back configuration
      const newVersion = await versionStore.createVersion(
        strategyId,
        targetVersionData.parameters,
        tenantId,
        `Rollback to version ${targetVersion}`
      );

      return { newVersion, currentVersionNumber: currentVersionNumber + 1 };
    }

    it('rollback creates new version with incremented version number', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 3, max: 10 }),
          async (strategyId, tenantId, numVersions) => {
            // Create multiple versions with different parameters
            for (let i = 0; i < numVersions; i++) {
              await versionStore.createVersion(
                strategyId,
                { iteration: i, data: `data${i}` },
                tenantId,
                `Version ${i + 1}`
              );
            }

            const versionBeforeRollback = await versionStore.getLatestVersionNumber(strategyId);
            expect(versionBeforeRollback).toBe(numVersions);

            // Rollback to version 1
            const { newVersion, currentVersionNumber } = await rollbackToVersion(
              strategyId,
              1,
              tenantId
            );

            // New version should have incremented version number
            expect(newVersion.version).toBe(numVersions + 1);
            expect(currentVersionNumber).toBe(numVersions + 1);

            // Verify the latest version number is now incremented
            const latestVersion = await versionStore.getLatestVersionNumber(strategyId);
            expect(latestVersion).toBe(numVersions + 1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rollback preserves parameter values from target version', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(parametersRecordArb(), { minLength: 3, maxLength: 8 }),
          async (strategyId, tenantId, parametersList) => {
            // Create versions with different parameters
            for (let i = 0; i < parametersList.length; i++) {
              await versionStore.createVersion(
                strategyId,
                parametersList[i],
                tenantId,
                `Version ${i + 1}`
              );
            }

            // Pick a random version to rollback to
            const targetVersionNum = Math.floor(Math.random() * parametersList.length) + 1;
            const targetParams = parametersList[targetVersionNum - 1];

            // Perform rollback
            const { newVersion } = await rollbackToVersion(
              strategyId,
              targetVersionNum,
              tenantId
            );

            // New version should have same parameters as target version
            expect(newVersion.parameters).toEqual(targetParams);

            // Verify by retrieving the new version
            const retrieved = await versionStore.getVersion(strategyId, newVersion.version);
            expect(retrieved!.parameters).toEqual(targetParams);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rollback does not modify original version', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          parametersRecordArb(),
          parametersRecordArb(),
          async (strategyId, tenantId, params1, params2) => {
            // Create two versions
            await versionStore.createVersion(strategyId, params1, tenantId, 'Version 1');
            await versionStore.createVersion(strategyId, params2, tenantId, 'Version 2');

            // Get version 1 before rollback
            const version1Before = await versionStore.getVersion(strategyId, 1);

            // Rollback to version 1
            await rollbackToVersion(strategyId, 1, tenantId);

            // Get version 1 after rollback
            const version1After = await versionStore.getVersion(strategyId, 1);

            // Original version should be unchanged
            expect(version1After).toEqual(version1Before);
            expect(version1After!.parameters).toEqual(params1);
            expect(version1After!.version).toBe(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple rollbacks create multiple new versions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 2, max: 5 }),
          async (strategyId, tenantId, numRollbacks) => {
            // Create initial versions
            await versionStore.createVersion(strategyId, { initial: true }, tenantId, 'Version 1');
            await versionStore.createVersion(strategyId, { modified: true }, tenantId, 'Version 2');

            let expectedVersion = 2;

            // Perform multiple rollbacks
            for (let i = 0; i < numRollbacks; i++) {
              const { newVersion } = await rollbackToVersion(strategyId, 1, tenantId);
              expectedVersion++;
              expect(newVersion.version).toBe(expectedVersion);
            }

            // Total versions should be initial 2 + number of rollbacks
            const history = await versionStore.getVersionHistory(strategyId);
            expect(history.length).toBe(2 + numRollbacks);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rollback includes change description', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          async (strategyId, tenantId, targetVersion) => {
            // Create versions
            for (let i = 0; i < 5; i++) {
              await versionStore.createVersion(
                strategyId,
                { index: i },
                tenantId,
                `Version ${i + 1}`
              );
            }

            // Rollback
            const { newVersion } = await rollbackToVersion(
              strategyId,
              targetVersion,
              tenantId
            );

            // Change description should indicate rollback
            expect(newVersion.changeDescription).toContain('Rollback');
            expect(newVersion.changeDescription).toContain(String(targetVersion));

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
