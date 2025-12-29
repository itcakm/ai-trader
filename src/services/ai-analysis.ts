/**
 * AI Analysis Service
 * 
 * Orchestrates AI model interactions for market regime classification and strategy explanations.
 * Handles adapter selection, validation, logging, and fallback behavior.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.3, 4.4, 4.5
 */

import {
  MarketRegime,
  RegimeClassificationRequest,
  RegimeClassificationResponse,
  ExplanationRequest,
  ExplanationResponse,
} from '../types/analysis';
import { AIProviderAdapter } from '../types/adapter';
import { AuditRecord, AuditRequest, AuditResponse, TokenUsage } from '../types/audit';
import { AIAdapterFactory, AdapterFactoryConfig } from '../adapters/ai/adapter-factory';
import { ModelConfigService } from './model-config';
import { ModelConfigRepository } from '../repositories/model-config';
import { ProviderRepository } from '../repositories/provider';
import { SchemaValidator, schemaValidator } from './schema-validator';
import { ValidationFailureTracker, validationFailureTracker } from './failure-tracker';
import { PromptTemplateService } from './prompt-template';
import { generateUUID } from '../utils/uuid';
import * as crypto from 'crypto';

/**
 * Valid market regime values
 */
export const VALID_REGIMES: MarketRegime[] = [
  'TRENDING_UP',
  'TRENDING_DOWN',
  'RANGING',
  'HIGH_VOLATILITY',
  'LOW_VOLATILITY',
  'UNCERTAIN'
];

/**
 * Fallback response returned when validation fails
 */
export const FALLBACK_REGIME_RESPONSE: Omit<RegimeClassificationResponse, 'modelId' | 'promptVersion' | 'processingTimeMs' | 'timestamp'> = {
  regime: 'UNCERTAIN',
  confidence: 0,
  reasoning: 'Unable to classify market regime due to validation failure',
  supportingFactors: []
};

/**
 * Configuration for the AI Analysis Service
 */
export interface AIAnalysisServiceConfig {
  defaultPromptTemplateId?: string;
  regimeClassificationTemplateId?: string;
  explanationTemplateId?: string;
  auditRetentionDays?: number;
}

/**
 * Logger interface for audit logging
 */
export interface AnalysisLogger {
  logAnalysis(record: AuditRecord): Promise<void>;
}

/**
 * Default no-op logger
 */
const defaultLogger: AnalysisLogger = {
  async logAnalysis(_record: AuditRecord): Promise<void> {
    // No-op - can be replaced with actual audit service
  }
};

/**
 * Internal result type for regime classification
 */
interface ClassificationResult {
  response: RegimeClassificationResponse;
  rawOutput: string;
  validationPassed: boolean;
  tokenUsage?: TokenUsage;
  costUsd?: number;
}

/**
 * Internal result type for explanation generation
 */
interface ExplanationResult {
  response: ExplanationResponse;
  rawOutput: string;
  validationPassed: boolean;
  tokenUsage?: TokenUsage;
  costUsd?: number;
}


/**
 * AI Analysis Service
 * 
 * Provides market regime classification and strategy explanation generation
 * using configured AI models with validation and audit logging.
 */
export const AIAnalysisService = {
  config: {
    regimeClassificationTemplateId: 'regime-classification-default',
    explanationTemplateId: 'explanation-default',
    auditRetentionDays: 90
  } as AIAnalysisServiceConfig,

  logger: defaultLogger as AnalysisLogger,
  validator: schemaValidator as SchemaValidator,
  failureTracker: validationFailureTracker as ValidationFailureTracker,

  /**
   * Configure the service
   */
  configure(config: Partial<AIAnalysisServiceConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Set the audit logger
   */
  setLogger(logger: AnalysisLogger): void {
    this.logger = logger;
  },

  /**
   * Set the schema validator
   */
  setValidator(validator: SchemaValidator): void {
    this.validator = validator;
  },

  /**
   * Set the failure tracker
   */
  setFailureTracker(tracker: ValidationFailureTracker): void {
    this.failureTracker = tracker;
  },

  /**
   * Validate that a regime value is valid
   * 
   * Requirements: 3.2
   */
  isValidRegime(regime: unknown): regime is MarketRegime {
    return typeof regime === 'string' && VALID_REGIMES.includes(regime as MarketRegime);
  },

  /**
   * Validate that a confidence value is within bounds
   * 
   * Requirements: 3.3
   */
  isValidConfidence(confidence: unknown): confidence is number {
    return typeof confidence === 'number' && 
           !isNaN(confidence) && 
           confidence >= 0 && 
           confidence <= 1;
  },

  /**
   * Validate regime classification output constraints
   * 
   * Requirements: 3.2, 3.3
   */
  validateRegimeOutput(output: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!output || typeof output !== 'object') {
      errors.push('Output must be an object');
      return { valid: false, errors };
    }

    const obj = output as Record<string, unknown>;

    if (!this.isValidRegime(obj.regime)) {
      errors.push(`Invalid regime value: ${obj.regime}. Must be one of: ${VALID_REGIMES.join(', ')}`);
    }

    if (!this.isValidConfidence(obj.confidence)) {
      errors.push(`Invalid confidence value: ${obj.confidence}. Must be a number between 0.0 and 1.0`);
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Get adapter for a model configuration
   */
  async getAdapterForConfig(
    tenantId: string,
    modelConfigId: string
  ): Promise<{ adapter: AIProviderAdapter; modelId: string } | null> {
    const config = await ModelConfigRepository.getConfiguration(tenantId, modelConfigId);
    if (!config) {
      return null;
    }

    const provider = await ProviderRepository.getProvider(config.providerId);
    if (!provider || provider.status !== 'ACTIVE') {
      return null;
    }

    // Note: In production, the API key would be decrypted from config.credentials
    // For now, we use a placeholder
    const adapterConfig: AdapterFactoryConfig = {
      providerType: provider.type,
      apiKey: 'placeholder-key', // Would be decrypted in production
      apiEndpoint: provider.apiEndpoint,
      modelId: config.modelId
    };

    const adapter = AIAdapterFactory.createAdapter(adapterConfig);
    return { adapter, modelId: config.modelId };
  },

  /**
   * Create a hash of market data for audit purposes
   */
  hashMarketData(marketData: unknown): string {
    const json = JSON.stringify(marketData);
    return crypto.createHash('sha256').update(json).digest('hex');
  },

  /**
   * Create an audit record
   */
  createAuditRecord(
    tenantId: string,
    modelConfigId: string,
    analysisType: string,
    request: AuditRequest,
    response: AuditResponse
  ): AuditRecord {
    const now = new Date();
    const retentionDays = this.config.auditRetentionDays ?? 90;
    const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    return {
      auditId: generateUUID(),
      tenantId,
      modelConfigId,
      analysisType,
      request,
      response,
      timestamp: now.toISOString(),
      retentionExpiresAt: expiresAt.toISOString()
    };
  },


  /**
   * Classify market regime using the configured AI model
   * 
   * This method orchestrates:
   * 1. Model configuration lookup
   * 2. Cost limit checking
   * 3. Prompt template rendering
   * 4. AI model invocation via adapter
   * 5. Output validation against schema
   * 6. Fallback on validation failure
   * 7. Audit logging
   * 
   * Requirements: 3.1, 3.4, 3.5
   * 
   * @param request - The regime classification request
   * @returns The regime classification response
   */
  async classifyMarketRegime(
    request: RegimeClassificationRequest
  ): Promise<RegimeClassificationResponse> {
    const startTime = Date.now();
    const { tenantId, modelConfigId, marketData, timeframe, additionalContext } = request;

    // Check cost limits
    try {
      await ModelConfigService.checkCostLimit(tenantId, modelConfigId);
    } catch (error) {
      // Return fallback on cost limit exceeded
      return this.createFallbackRegimeResponse(modelConfigId, 'cost-limit-exceeded', startTime);
    }

    // Get adapter for the model
    const adapterResult = await this.getAdapterForConfig(tenantId, modelConfigId);
    if (!adapterResult) {
      return this.createFallbackRegimeResponse(modelConfigId, 'adapter-unavailable', startTime);
    }

    const { adapter, modelId } = adapterResult;
    let rawOutput = '';
    let promptVersion = '1';
    let tokenUsage: TokenUsage | undefined;
    let costUsd = 0;

    try {
      // Call the adapter to classify market regime
      const response = await adapter.classifyMarketRegime(request);
      rawOutput = JSON.stringify(response);

      // Validate the response against schema
      const schemaValidation = this.validator.validateRegimeClassification(response);
      
      if (!schemaValidation.valid) {
        // Log validation failure
        console.error('Schema validation failed:', schemaValidation.errors);
        this.failureTracker.recordFailure(
          modelConfigId,
          `Schema validation failed: ${schemaValidation.errors.map(e => e.message).join(', ')}`
        );

        // Log audit record with validation failure
        await this.logRegimeClassificationAudit(
          tenantId,
          modelConfigId,
          request,
          rawOutput,
          false,
          promptVersion,
          Date.now() - startTime,
          tokenUsage,
          costUsd
        );

        return this.createFallbackRegimeResponse(modelId, promptVersion, startTime);
      }

      // Validate output constraints (regime enum and confidence bounds)
      const constraintValidation = this.validateRegimeOutput(response);
      if (!constraintValidation.valid) {
        console.error('Output constraint validation failed:', constraintValidation.errors);
        this.failureTracker.recordFailure(
          modelConfigId,
          `Output constraint validation failed: ${constraintValidation.errors.join(', ')}`
        );

        await this.logRegimeClassificationAudit(
          tenantId,
          modelConfigId,
          request,
          rawOutput,
          false,
          promptVersion,
          Date.now() - startTime,
          tokenUsage,
          costUsd
        );

        return this.createFallbackRegimeResponse(modelId, promptVersion, startTime);
      }

      // Record success - reset failure counter
      this.failureTracker.recordSuccess(modelConfigId);

      // Log successful audit record
      await this.logRegimeClassificationAudit(
        tenantId,
        modelConfigId,
        request,
        rawOutput,
        true,
        promptVersion,
        Date.now() - startTime,
        tokenUsage,
        costUsd
      );

      return response;

    } catch (error) {
      // Log error and return fallback
      console.error('Error during regime classification:', error);
      this.failureTracker.recordFailure(
        modelConfigId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      await this.logRegimeClassificationAudit(
        tenantId,
        modelConfigId,
        request,
        rawOutput || JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        false,
        promptVersion,
        Date.now() - startTime,
        tokenUsage,
        costUsd
      );

      return this.createFallbackRegimeResponse(modelId, promptVersion, startTime);
    }
  },

  /**
   * Create a fallback regime response
   * 
   * Requirements: 3.5
   */
  createFallbackRegimeResponse(
    modelId: string,
    promptVersion: string,
    startTime: number
  ): RegimeClassificationResponse {
    return {
      ...FALLBACK_REGIME_RESPONSE,
      modelId,
      promptVersion,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Log regime classification audit record
   */
  async logRegimeClassificationAudit(
    tenantId: string,
    modelConfigId: string,
    request: RegimeClassificationRequest,
    rawOutput: string,
    validationPassed: boolean,
    promptVersion: string,
    processingTimeMs: number,
    tokenUsage?: TokenUsage,
    costUsd?: number
  ): Promise<void> {
    const auditRequest: AuditRequest = {
      promptTemplateId: this.config.regimeClassificationTemplateId ?? 'regime-classification-default',
      promptVersion: parseInt(promptVersion) || 1,
      renderedPrompt: JSON.stringify(request),
      marketDataHash: this.hashMarketData(request.marketData)
    };

    const auditResponse: AuditResponse = {
      rawOutput,
      validatedOutput: validationPassed ? JSON.parse(rawOutput) : null,
      validationPassed,
      processingTimeMs,
      tokenUsage: tokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costUsd: costUsd ?? 0
    };

    const auditRecord = this.createAuditRecord(
      tenantId,
      modelConfigId,
      'REGIME_CLASSIFICATION',
      auditRequest,
      auditResponse
    );

    await this.logger.logAnalysis(auditRecord);
  },


  /**
   * Generate explanation for a strategy action using the configured AI model
   * 
   * This method orchestrates:
   * 1. Model configuration lookup
   * 2. Cost limit checking
   * 3. Prompt template rendering and tracking
   * 4. AI model invocation via adapter
   * 5. Output validation against schema
   * 6. Audit logging with template version
   * 
   * Requirements: 4.1, 4.3, 4.4, 4.5
   * 
   * @param request - The explanation request
   * @returns The explanation response
   */
  async generateExplanation(
    request: ExplanationRequest
  ): Promise<ExplanationResponse> {
    const startTime = Date.now();
    const { tenantId, modelConfigId, strategyId, action, marketContext, strategyParameters } = request;

    // Check cost limits
    try {
      await ModelConfigService.checkCostLimit(tenantId, modelConfigId);
    } catch (error) {
      return this.createFallbackExplanationResponse(modelConfigId, '1', startTime);
    }

    // Get adapter for the model
    const adapterResult = await this.getAdapterForConfig(tenantId, modelConfigId);
    if (!adapterResult) {
      return this.createFallbackExplanationResponse(modelConfigId, '1', startTime);
    }

    const { adapter, modelId } = adapterResult;
    let rawOutput = '';
    let promptVersion = '1';
    let tokenUsage: TokenUsage | undefined;
    let costUsd = 0;

    try {
      // Try to get the prompt template version for tracking
      const templateId = this.config.explanationTemplateId ?? 'explanation-default';
      try {
        const template = await PromptTemplateService.getTemplate(templateId);
        if (template) {
          promptVersion = template.version.toString();
        }
      } catch {
        // Use default version if template not found
        promptVersion = '1';
      }

      // Call the adapter to generate explanation
      const response = await adapter.generateExplanation(request);
      rawOutput = JSON.stringify(response);

      // Validate the response against schema
      const schemaValidation = this.validator.validateExplanation(response);
      
      if (!schemaValidation.valid) {
        console.error('Explanation schema validation failed:', schemaValidation.errors);
        this.failureTracker.recordFailure(
          modelConfigId,
          `Explanation schema validation failed: ${schemaValidation.errors.map(e => e.message).join(', ')}`
        );

        await this.logExplanationAudit(
          tenantId,
          modelConfigId,
          request,
          rawOutput,
          false,
          promptVersion,
          Date.now() - startTime,
          tokenUsage,
          costUsd
        );

        return this.createFallbackExplanationResponse(modelId, promptVersion, startTime);
      }

      // Record success
      this.failureTracker.recordSuccess(modelConfigId);

      // Log successful audit record
      await this.logExplanationAudit(
        tenantId,
        modelConfigId,
        request,
        rawOutput,
        true,
        promptVersion,
        Date.now() - startTime,
        tokenUsage,
        costUsd
      );

      // Ensure the response includes the prompt version for tracking
      return {
        ...response,
        promptVersion
      };

    } catch (error) {
      console.error('Error during explanation generation:', error);
      this.failureTracker.recordFailure(
        modelConfigId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      await this.logExplanationAudit(
        tenantId,
        modelConfigId,
        request,
        rawOutput || JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        false,
        promptVersion,
        Date.now() - startTime,
        tokenUsage,
        costUsd
      );

      return this.createFallbackExplanationResponse(modelId, promptVersion, startTime);
    }
  },

  /**
   * Create a fallback explanation response
   */
  createFallbackExplanationResponse(
    modelId: string,
    promptVersion: string,
    startTime: number
  ): ExplanationResponse {
    return {
      explanation: 'Unable to generate explanation due to an error. Please try again or contact support.',
      keyFactors: [],
      riskAssessment: 'Unable to assess risk due to error',
      modelId,
      promptVersion,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Log explanation audit record
   * 
   * Requirements: 4.5
   */
  async logExplanationAudit(
    tenantId: string,
    modelConfigId: string,
    request: ExplanationRequest,
    rawOutput: string,
    validationPassed: boolean,
    promptVersion: string,
    processingTimeMs: number,
    tokenUsage?: TokenUsage,
    costUsd?: number
  ): Promise<void> {
    const auditRequest: AuditRequest = {
      promptTemplateId: this.config.explanationTemplateId ?? 'explanation-default',
      promptVersion: parseInt(promptVersion) || 1,
      renderedPrompt: JSON.stringify(request),
      marketDataHash: this.hashMarketData(request.marketContext)
    };

    const auditResponse: AuditResponse = {
      rawOutput,
      validatedOutput: validationPassed ? JSON.parse(rawOutput) : null,
      validationPassed,
      processingTimeMs,
      tokenUsage: tokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costUsd: costUsd ?? 0
    };

    const auditRecord = this.createAuditRecord(
      tenantId,
      modelConfigId,
      'EXPLANATION',
      auditRequest,
      auditResponse
    );

    await this.logger.logAnalysis(auditRecord);
  }
};
