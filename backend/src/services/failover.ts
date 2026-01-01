/**
 * Failover Service - manages data source failover and fallback logic
 * 
 * Provides failover capabilities for data sources including:
 * - Getting the active source for a given type
 * - Switching to fallback sources when primary fails
 * - Routing requests away from unavailable sources
 * 
 * Requirements: 1.4
 */

import { DataSource, DataSourceType, DataSourceStatus } from '../types/data-source';
import { DataSourceRepository } from '../repositories/data-source';
import { DataSourceService } from './data-source';

/**
 * Result of a failover operation
 */
export interface FailoverResult {
  previousSourceId: string;
  newSourceId: string;
  reason: string;
  timestamp: string;
}

/**
 * Failover Service
 */
export const FailoverService = {
  /**
   * Get the active source for a given type
   * 
   * Returns the highest priority ACTIVE source for the specified type.
   * If no active source is available, returns null.
   * 
   * @param type - The data source type
   * @returns The active data source, or null if none available
   * 
   * Requirements: 1.4
   */
  async getActiveSource(type: DataSourceType): Promise<DataSource | null> {
    const activeSources = await DataSourceRepository.getActiveSourcesByType(type);
    
    if (activeSources.length === 0) {
      return null;
    }

    // Return the highest priority (lowest number) active source
    return activeSources[0];
  },

  /**
   * Switch to fallback source when the current source fails
   * 
   * Marks the current source as INACTIVE or ERROR and returns the next
   * available fallback source by priority.
   * 
   * @param currentSourceId - The ID of the failing source
   * @param reason - The reason for the failover
   * @param newStatus - The status to set on the failing source (default: INACTIVE)
   * @returns The failover result with the new source, or null if no fallback available
   * 
   * Requirements: 1.4
   */
  async switchToFallback(
    currentSourceId: string,
    reason: string,
    newStatus: DataSourceStatus = 'INACTIVE'
  ): Promise<FailoverResult | null> {
    // Get the current source to determine its type
    const currentSource = await DataSourceRepository.getDataSource(currentSourceId);
    if (!currentSource) {
      return null;
    }

    // Mark the current source as inactive/error
    await DataSourceService.updateStatus(currentSourceId, newStatus);

    // Get the next available fallback source
    const fallbackSource = await this.getActiveSource(currentSource.type);
    
    if (!fallbackSource) {
      return null;
    }

    return {
      previousSourceId: currentSourceId,
      newSourceId: fallbackSource.sourceId,
      reason,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Check if a source is available for requests
   * 
   * A source is available if its status is ACTIVE.
   * 
   * @param sourceId - The ID of the source to check
   * @returns True if the source is available, false otherwise
   */
  async isSourceAvailable(sourceId: string): Promise<boolean> {
    const source = await DataSourceRepository.getDataSource(sourceId);
    return source !== null && source.status === 'ACTIVE';
  },

  /**
   * Get all available sources for a type, ordered by priority
   * 
   * @param type - The data source type
   * @returns List of available sources sorted by priority
   */
  async getAvailableSources(type: DataSourceType): Promise<DataSource[]> {
    return DataSourceRepository.getActiveSourcesByType(type);
  },

  /**
   * Route a request to an available source
   * 
   * Returns the best available source for the given type.
   * Ensures no requests are sent to unavailable sources.
   * 
   * @param type - The data source type
   * @param excludeSourceIds - Optional list of source IDs to exclude
   * @returns The best available source, or null if none available
   * 
   * Requirements: 1.4
   */
  async routeRequest(
    type: DataSourceType,
    excludeSourceIds: string[] = []
  ): Promise<DataSource | null> {
    const availableSources = await this.getAvailableSources(type);
    
    // Filter out excluded sources
    const eligibleSources = availableSources.filter(
      source => !excludeSourceIds.includes(source.sourceId)
    );

    if (eligibleSources.length === 0) {
      return null;
    }

    return eligibleSources[0];
  },

  /**
   * Recover a source back to ACTIVE status
   * 
   * Used when a previously failed source becomes available again.
   * 
   * @param sourceId - The ID of the source to recover
   * @returns The recovered source
   */
  async recoverSource(sourceId: string): Promise<DataSource> {
    return DataSourceService.updateStatus(sourceId, 'ACTIVE');
  },

  /**
   * Get failover candidates for a source
   * 
   * Returns all sources that could serve as fallbacks for the given source,
   * ordered by priority.
   * 
   * @param sourceId - The ID of the source to find fallbacks for
   * @returns List of fallback candidates
   */
  async getFailoverCandidates(sourceId: string): Promise<DataSource[]> {
    const source = await DataSourceRepository.getDataSource(sourceId);
    if (!source) {
      return [];
    }

    const allSources = await this.getAvailableSources(source.type);
    
    // Exclude the current source from candidates
    return allSources.filter(s => s.sourceId !== sourceId);
  }
};
