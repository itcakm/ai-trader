/**
 * Search providers for Command Palette
 */

export { createSearchProvider, filterByQuery, generateMockId } from './base-provider';
export { createStrategyProvider } from './strategy-provider';
export { createOrderProvider } from './order-provider';
export { createAssetProvider } from './asset-provider';
export { createReportProvider } from './report-provider';
export { createSettingsProvider } from './settings-provider';
export { createHelpProvider } from './help-provider';

import type { SearchProvider } from '../types';
import { createStrategyProvider } from './strategy-provider';
import { createOrderProvider } from './order-provider';
import { createAssetProvider } from './asset-provider';
import { createReportProvider } from './report-provider';
import { createSettingsProvider } from './settings-provider';
import { createHelpProvider } from './help-provider';

/**
 * Create all default search providers
 */
export function createDefaultProviders(): SearchProvider[] {
  return [
    createStrategyProvider(),
    createOrderProvider(),
    createAssetProvider(),
    createReportProvider(),
    createSettingsProvider(),
    createHelpProvider(),
  ];
}

/**
 * Search provider registry for managing providers
 */
export class SearchProviderRegistry {
  private providers: Map<string, SearchProvider> = new Map();

  constructor(initialProviders?: SearchProvider[]) {
    if (initialProviders) {
      for (const provider of initialProviders) {
        this.register(provider);
      }
    }
  }

  register(provider: SearchProvider): void {
    this.providers.set(provider.type, provider);
  }

  unregister(type: string): void {
    this.providers.delete(type);
  }

  get(type: string): SearchProvider | undefined {
    return this.providers.get(type);
  }

  getAll(): SearchProvider[] {
    return Array.from(this.providers.values());
  }

  async searchAll(query: string): Promise<import('../types').SearchResult[]> {
    const results: import('../types').SearchResult[] = [];
    const providers = this.getAll();

    const searchPromises = providers.map(async (provider) => {
      try {
        return await provider.search(query);
      } catch {
        return [];
      }
    });

    const providerResults = await Promise.all(searchPromises);
    for (const providerResult of providerResults) {
      results.push(...providerResult);
    }

    return results;
  }
}
