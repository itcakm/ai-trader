import { AITraceRepository } from '../repositories/ai-trace';
import {
  AITrace,
  AITraceInput,
  AIInputSnapshot,
  DecisionInfluence,
  AITraceLogger
} from '../types/ai-trace';
import { generateUUID } from '../utils/uuid';

/**
 * AI Trace Service - manages AI trace logging and decision traceability
 * 
 * Implements the AITraceLogger interface for logging AI traces,
 * linking traces to decisions, recording decision influences,
 * and retrieving reproduction inputs.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export const AITraceService: AITraceLogger = {
  /**
   * Log an AI trace as an immutable record
   * 
   * Requirements: 2.1, 2.2
   * 
   * @param input - The AI trace input
   * @returns The stored AI trace with generated traceId
   */
  async logAITrace(input: AITraceInput): Promise<AITrace> {
    return logAITraceImpl(input);
  },


  /**
   * Link an AI trace to a trade decision
   * 
   * Requirements: 2.3
   * 
   * @param traceId - The trace identifier
   * @param correlationId - The correlation ID to link
   */
  async linkToDecision(traceId: string, correlationId: string): Promise<void> {
    // This method requires tenant context which is not available in the interface
    // In production, you'd have an index or the caller would provide context
    throw new Error('linkToDecision requires tenant context. Use AITraceServiceExtended.linkToDecision instead.');
  },

  /**
   * Record how AI output influenced a decision
   * 
   * Requirements: 2.4
   * 
   * @param influence - The decision influence record
   */
  async recordDecisionInfluence(influence: DecisionInfluence): Promise<void> {
    // We need tenant context to store the influence
    throw new Error('recordDecisionInfluence requires tenant context. Use AITraceServiceExtended.recordDecisionInfluence instead.');
  },

  /**
   * Get all inputs needed to reproduce an analysis
   * 
   * Requirements: 2.6
   * 
   * @param traceId - The trace identifier
   * @returns The input snapshot for reproduction
   */
  async getReproductionInputs(traceId: string): Promise<AIInputSnapshot> {
    // This requires tenant context
    throw new Error('getReproductionInputs requires tenant context. Use AITraceServiceExtended.getReproductionInputs instead.');
  }
};

/**
 * Internal implementation for logging AI trace
 */
async function logAITraceImpl(input: AITraceInput): Promise<AITrace> {
  const traceId = generateUUID();
  const timestamp = new Date().toISOString();

  const trace: AITrace = {
    traceId,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    analysisType: input.analysisType,
    promptTemplateId: input.promptTemplateId,
    promptVersion: input.promptVersion,
    renderedPrompt: input.renderedPrompt,
    inputSnapshot: input.inputSnapshot,
    rawOutput: input.rawOutput,
    validatedOutput: input.validatedOutput,
    validationPassed: input.validationPassed,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    ensembleWeights: input.ensembleWeights,
    processingTimeMs: input.processingTimeMs,
    tokenUsage: input.tokenUsage,
    costUsd: input.costUsd,
    timestamp
  };

  // Store the trace as an immutable record
  await AITraceRepository.putTrace(trace);

  return trace;
}


/**
 * Extended AI Trace Service with full context support
 * 
 * This service provides additional methods that require tenant context,
 * which is typically available in request handlers.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export const AITraceServiceExtended = {
  ...AITraceService,

  /**
   * Get an AI trace by ID
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @returns The AI trace, or null if not found
   */
  async getTrace(tenantId: string, timestamp: string, traceId: string): Promise<AITrace | null> {
    return await AITraceRepository.getTrace(tenantId, timestamp, traceId);
  },

  /**
   * Get all traces linked to a correlation ID
   * 
   * Requirements: 2.3
   * 
   * @param tenantId - The tenant identifier
   * @param correlationId - The correlation ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Array of AI traces
   */
  async getTracesByCorrelationId(
    tenantId: string,
    correlationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AITrace[]> {
    return await AITraceRepository.listTracesByCorrelationId(
      tenantId,
      correlationId,
      startDate,
      endDate
    );
  },

  /**
   * Get traces within a date range
   * 
   * @param tenantId - The tenant identifier
   * @param startDate - Start date
   * @param endDate - End date
   * @param limit - Maximum number of traces
   * @returns Array of AI traces
   */
  async getTracesByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit?: number
  ): Promise<AITrace[]> {
    return await AITraceRepository.listTracesByDateRange(tenantId, startDate, endDate, limit);
  },

  /**
   * Link an AI trace to a trade decision
   * 
   * Requirements: 2.3
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @param correlationId - The correlation ID to link
   */
  async linkToDecision(
    tenantId: string,
    timestamp: string,
    traceId: string,
    correlationId: string
  ): Promise<void> {
    await AITraceRepository.updateCorrelationId(tenantId, timestamp, traceId, correlationId);
  },

  /**
   * Record how AI output influenced a decision
   * 
   * Requirements: 2.4
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param influence - The decision influence record
   * @returns The influence record ID
   */
  async recordDecisionInfluence(
    tenantId: string,
    timestamp: string,
    influence: DecisionInfluence
  ): Promise<string> {
    return await AITraceRepository.putDecisionInfluence(tenantId, timestamp, influence);
  },

  /**
   * Get all inputs needed to reproduce an analysis
   * 
   * Requirements: 2.6
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The trace timestamp
   * @param traceId - The trace identifier
   * @returns The input snapshot for reproduction
   */
  async getReproductionInputs(
    tenantId: string,
    timestamp: string,
    traceId: string
  ): Promise<AIInputSnapshot> {
    const snapshot = await AITraceRepository.getInputSnapshot(tenantId, timestamp, traceId);
    if (!snapshot) {
      throw new Error(`Input snapshot not found for trace: ${traceId}`);
    }
    return snapshot;
  }
};

/**
 * Helper function to validate AI trace input
 * 
 * @param input - The AI trace input to validate
 * @returns True if valid, throws error if invalid
 */
export function validateAITraceInput(input: AITraceInput): boolean {
  if (!input.tenantId || input.tenantId.trim() === '') {
    throw new Error('tenantId is required');
  }
  
  if (!input.analysisType) {
    throw new Error('analysisType is required');
  }
  
  if (!input.promptTemplateId || input.promptTemplateId.trim() === '') {
    throw new Error('promptTemplateId is required');
  }
  
  if (typeof input.promptVersion !== 'number' || input.promptVersion < 1) {
    throw new Error('promptVersion must be a positive number');
  }
  
  if (!input.renderedPrompt || input.renderedPrompt.trim() === '') {
    throw new Error('renderedPrompt is required');
  }
  
  if (!input.inputSnapshot) {
    throw new Error('inputSnapshot is required');
  }
  
  if (!input.inputSnapshot.marketDataHash) {
    throw new Error('inputSnapshot.marketDataHash is required');
  }
  
  if (!input.inputSnapshot.marketDataSnapshot) {
    throw new Error('inputSnapshot.marketDataSnapshot is required');
  }
  
  if (!input.rawOutput) {
    throw new Error('rawOutput is required');
  }
  
  if (!input.modelId || input.modelId.trim() === '') {
    throw new Error('modelId is required');
  }
  
  if (!input.modelVersion || input.modelVersion.trim() === '') {
    throw new Error('modelVersion is required');
  }
  
  if (typeof input.processingTimeMs !== 'number' || input.processingTimeMs < 0) {
    throw new Error('processingTimeMs must be a non-negative number');
  }
  
  if (!input.tokenUsage) {
    throw new Error('tokenUsage is required');
  }
  
  if (typeof input.costUsd !== 'number' || input.costUsd < 0) {
    throw new Error('costUsd must be a non-negative number');
  }
  
  return true;
}

/**
 * Check if an AI trace has all required fields
 * 
 * Requirements: 2.2, 2.5
 * 
 * @param trace - The AI trace to check
 * @returns True if all required fields are present
 */
export function hasRequiredFields(trace: AITrace): boolean {
  // Check top-level required fields
  if (!trace.traceId) return false;
  if (!trace.tenantId) return false;
  if (!trace.analysisType) return false;
  if (!trace.timestamp) return false;
  
  // Check prompt-related fields (Requirements: 2.2)
  if (!trace.promptTemplateId) return false;
  if (typeof trace.promptVersion !== 'number') return false;
  if (!trace.renderedPrompt) return false;
  
  // Check input snapshot (Requirements: 2.6)
  if (!trace.inputSnapshot) return false;
  if (!trace.inputSnapshot.marketDataHash) return false;
  if (!trace.inputSnapshot.marketDataSnapshot) return false;
  
  // Check output fields (Requirements: 2.2)
  if (trace.rawOutput === undefined || trace.rawOutput === null) return false;
  if (typeof trace.validationPassed !== 'boolean') return false;
  
  // Check model information (Requirements: 2.5)
  if (!trace.modelId) return false;
  if (!trace.modelVersion) return false;
  
  // Check metrics
  if (typeof trace.processingTimeMs !== 'number') return false;
  if (!trace.tokenUsage) return false;
  if (typeof trace.costUsd !== 'number') return false;
  
  return true;
}

/**
 * Check if an AI input snapshot has sufficient information for reproduction
 * 
 * Requirements: 2.6
 * 
 * @param snapshot - The input snapshot to check
 * @returns True if the snapshot has sufficient information
 */
export function hasReproducibleInputs(snapshot: AIInputSnapshot): boolean {
  // Must have market data hash for verification
  if (!snapshot.marketDataHash) return false;
  
  // Must have market data snapshot reference
  if (!snapshot.marketDataSnapshot) return false;
  if (!snapshot.marketDataSnapshot.snapshotId) return false;
  if (!snapshot.marketDataSnapshot.symbols || snapshot.marketDataSnapshot.symbols.length === 0) return false;
  if (!snapshot.marketDataSnapshot.timeRange) return false;
  if (!snapshot.marketDataSnapshot.timeRange.start || !snapshot.marketDataSnapshot.timeRange.end) return false;
  
  return true;
}
