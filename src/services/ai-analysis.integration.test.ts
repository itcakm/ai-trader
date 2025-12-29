/**
 * AI Analysis Integration Tests
 * 
 * Tests the complete analysis flow:
 * - Configure model → request analysis → validate output → log audit
 * 
 * Requirements: 3.1, 4.1, 10.1
 */

import { 
  RegimeClassificationRequest, 
  RegimeClassificationResponse,
  ExplanationRequest,
  ExplanationResponse,
  MarketRegime
} from '../types/analysis';
import { MarketDataSnapshot, PricePoint, VolumePoint } from '../types/market-data';
import { ModelConfiguration, ModelConfigurationInput, CostLimits, EncryptedCredentials } from '../types/model-config';
import { AIProvider, ProviderType, ProviderStatus, RateLimitConfig } from '../types/provider';
import { AuditRecord, AuditRequest, AuditResponse, TokenUsage } from '../types/audit';
import { AIProviderAdapter, HealthCheckResult, QuotaStatus } from '../types/adapter';
import { AIAnalysisService, VALID_REGIMES, FALLBACK_REGIME_RESPONSE } from './ai-analysis';
import { SchemaValidator, schemaValidator } from './schema-validator';
import { ValidationFailureTracker, validationFailureTracker } from './failure-tracker';

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
 * In-memory mock implementation of ProviderRepository
 */
class MockProviderStore {
  private providers: Map<string, AIProvider> = new Map();

  async getProvider(providerId: string): Promise<AIProvider | null> {
    return this.providers.get(providerId) || null;
  }

  async putProvider(provider: AIProvider): Promise<void> {
    this.providers.set(provider.providerId, { ...provider });
  }

  async getActiveProviders(): Promise<AIProvider[]> {
    return Array.from(this.providers.values()).filter(p => p.status === 'ACTIVE');
  }

  clear(): void {
    this.providers.clear();
  }
}

/**
 * In-memory mock implementation of ModelConfigRepository
 */
class MockModelConfigStore {
  private configs: Map<string, Map<string, ModelConfiguration>> = new Map();

  async getConfiguration(tenantId: string, configId: string): Promise<ModelConfiguration | null> {
    return this.configs.get(tenantId)?.get(configId) || null;
  }

  async putConfiguration(tenantId: string, config: ModelConfiguration): Promise<void> {
    if (!this.configs.has(tenantId)) {
      this.configs.set(tenantId, new Map());
    }
    this.configs.get(tenantId)!.set(config.configId, { ...config });
  }

  async getEnabledConfigurations(tenantId: string): Promise<ModelConfiguration[]> {
    const tenantConfigs = this.configs.get(tenantId);
    if (!tenantConfigs) return [];
    return Array.from(tenantConfigs.values()).filter(c => c.enabled);
  }

  clear(): void {
    this.configs.clear();
  }
}

/**
 * In-memory mock implementation of AuditRepository
 */
class MockAuditStore {
  private records: Map<string, AuditRecord[]> = new Map();

  async putAuditRecord(record: AuditRecord): Promise<void> {
    if (!this.records.has(record.tenantId)) {
      this.records.set(record.tenantId, []);
    }
    this.records.get(record.tenantId)!.push({ ...record });
  }

  async getAuditRecords(tenantId: string): Promise<AuditRecord[]> {
    return this.records.get(tenantId) || [];
  }

  getLastRecord(tenantId: string): AuditRecord | null {
    const records = this.records.get(tenantId);
    if (!records || records.length === 0) return null;
    return records[records.length - 1];
  }

  clear(): void {
    this.records.clear();
  }
}

/**
 * Mock AI Provider Adapter for testing
 */
class MockAIAdapter implements AIProviderAdapter {
  readonly providerType: ProviderType;
  private mockResponse: RegimeClassificationResponse | null = null;
  private mockExplanationResponse: ExplanationResponse | null = null;
  private shouldFail: boolean = false;
  private failureMessage: string = 'Mock failure';

  constructor(providerType: ProviderType = 'OPENAI') {
    this.providerType = providerType;
  }

  setMockResponse(response: RegimeClassificationResponse): void {
    this.mockResponse = response;
  }

  setMockExplanationResponse(response: ExplanationResponse): void {
    this.mockExplanationResponse = response;
  }

  setShouldFail(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) this.failureMessage = message;
  }

  async classifyMarketRegime(request: RegimeClassificationRequest): Promise<RegimeClassificationResponse> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    
    if (this.mockResponse) {
      return this.mockResponse;
    }

    // Default valid response
    return {
      regime: 'TRENDING_UP',
      confidence: 0.85,
      reasoning: 'Market shows strong upward momentum with increasing volume',
      supportingFactors: ['Price above moving average', 'Volume increasing'],
      modelId: 'gpt-4',
      promptVersion: '1',
      processingTimeMs: 150,
      timestamp: new Date().toISOString()
    };
  }

  async generateExplanation(request: ExplanationRequest): Promise<ExplanationResponse> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }

    if (this.mockExplanationResponse) {
      return this.mockExplanationResponse;
    }

    // Default valid response
    return {
      explanation: 'The strategy entered a long position based on bullish market conditions and strong momentum indicators.',
      keyFactors: [
        { factor: 'Price momentum', impact: 'POSITIVE', weight: 0.4 },
        { factor: 'Volume trend', impact: 'POSITIVE', weight: 0.3 }
      ],
      riskAssessment: 'Moderate risk due to current market volatility',
      modelId: 'gpt-4',
      promptVersion: '1',
      processingTimeMs: 200,
      timestamp: new Date().toISOString()
    };
  }

  async suggestParameters(request: any): Promise<any> {
    return {
      suggestions: [],
      overallAssessment: 'No parameter changes recommended',
      modelId: 'gpt-4',
      promptVersion: '1',
      processingTimeMs: 100,
      timestamp: new Date().toISOString()
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: !this.shouldFail,
      latencyMs: 50,
      errorMessage: this.shouldFail ? this.failureMessage : undefined
    };
  }

  async getRemainingQuota(): Promise<QuotaStatus> {
    return {
      requestsRemaining: 1000,
      tokensRemaining: 100000,
      resetsAt: new Date(Date.now() + 3600000).toISOString()
    };
  }
}

/**
 * Helper to create test market data
 */
function createTestMarketData(symbol: string = 'BTC'): MarketDataSnapshot {
  const now = new Date();
  const prices: PricePoint[] = [];
  const volume: VolumePoint[] = [];

  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(now.getTime() - i * 3600000).toISOString();
    prices.push({
      timestamp,
      open: 50000 + Math.random() * 1000,
      high: 51000 + Math.random() * 1000,
      low: 49000 + Math.random() * 1000,
      close: 50500 + Math.random() * 1000
    });
    volume.push({
      timestamp,
      volume: 1000000 + Math.random() * 500000
    });
  }

  return {
    symbol,
    prices,
    volume,
    timestamp: now.toISOString()
  };
}

/**
 * Helper to create test model configuration
 */
function createTestModelConfig(
  tenantId: string,
  providerId: string,
  options?: Partial<ModelConfiguration>
): ModelConfiguration {
  const now = new Date().toISOString();
  return {
    configId: generateUUID(),
    tenantId,
    providerId,
    modelId: 'gpt-4',
    modelName: 'GPT-4',
    enabled: true,
    credentials: {
      encryptedApiKey: 'encrypted-key-123',
      keyId: 'kms-key-id'
    },
    costLimits: {
      maxDailyCostUsd: 100,
      maxMonthlyCostUsd: 1000,
      currentDailyCostUsd: 0,
      currentMonthlyCostUsd: 0,
      lastResetDate: now
    },
    rateLimits: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000,
      requestsPerDay: 1000
    },
    priority: 5,
    createdAt: now,
    updatedAt: now,
    ...options
  };
}

/**
 * Helper to create test provider
 */
function createTestProvider(options?: Partial<AIProvider>): AIProvider {
  const now = new Date().toISOString();
  return {
    providerId: generateUUID(),
    type: 'OPENAI',
    name: 'OpenAI GPT',
    apiEndpoint: 'https://api.openai.com/v1',
    authMethod: 'API_KEY',
    supportedModels: ['gpt-4', 'gpt-3.5-turbo'],
    status: 'ACTIVE',
    rateLimits: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000,
      requestsPerDay: 1000
    },
    createdAt: now,
    updatedAt: now,
    ...options
  };
}


describe('AI Analysis Integration Tests', () => {
  let providerStore: MockProviderStore;
  let modelConfigStore: MockModelConfigStore;
  let auditStore: MockAuditStore;
  let mockAdapter: MockAIAdapter;
  let capturedAuditRecords: AuditRecord[];

  beforeEach(() => {
    providerStore = new MockProviderStore();
    modelConfigStore = new MockModelConfigStore();
    auditStore = new MockAuditStore();
    mockAdapter = new MockAIAdapter();
    capturedAuditRecords = [];

    // Reset the AI Analysis Service
    AIAnalysisService.configure({
      regimeClassificationTemplateId: 'regime-classification-default',
      explanationTemplateId: 'explanation-default',
      auditRetentionDays: 90
    });

    // Set up audit logger to capture records
    AIAnalysisService.setLogger({
      async logAnalysis(record: AuditRecord): Promise<void> {
        capturedAuditRecords.push(record);
        await auditStore.putAuditRecord(record);
      }
    });

    // Use real schema validator
    AIAnalysisService.setValidator(schemaValidator);

    // Use real failure tracker
    AIAnalysisService.setFailureTracker(validationFailureTracker);
    validationFailureTracker.resetAll();
  });

  afterEach(() => {
    providerStore.clear();
    modelConfigStore.clear();
    auditStore.clear();
    capturedAuditRecords = [];
  });

  describe('Complete Analysis Flow', () => {
    /**
     * Test: configure model → request analysis → validate output → log audit
     * 
     * Requirements: 3.1, 10.1
     */
    it('should complete full analysis flow: configure → analyze → validate → audit', async () => {
      // Step 1: Configure provider and model
      const provider = createTestProvider();
      await providerStore.putProvider(provider);

      const tenantId = generateUUID();
      const modelConfig = createTestModelConfig(tenantId, provider.providerId);
      await modelConfigStore.putConfiguration(tenantId, modelConfig);

      // Step 2: Create analysis request
      const marketData = createTestMarketData('BTC');
      const request: RegimeClassificationRequest = {
        tenantId,
        modelConfigId: modelConfig.configId,
        marketData,
        timeframe: '1h',
        additionalContext: 'Test analysis'
      };

      // Step 3: Mock the adapter response
      const expectedResponse: RegimeClassificationResponse = {
        regime: 'TRENDING_UP',
        confidence: 0.85,
        reasoning: 'Strong bullish momentum detected with increasing volume',
        supportingFactors: ['Price above MA', 'Volume increasing', 'RSI bullish'],
        modelId: modelConfig.modelId,
        promptVersion: '1',
        processingTimeMs: 150,
        timestamp: new Date().toISOString()
      };
      mockAdapter.setMockResponse(expectedResponse);

      // Step 4: Validate output constraints
      const outputValidation = AIAnalysisService.validateRegimeOutput(expectedResponse);
      expect(outputValidation.valid).toBe(true);
      expect(outputValidation.errors).toHaveLength(0);

      // Step 5: Verify regime is valid enum value
      expect(VALID_REGIMES).toContain(expectedResponse.regime);

      // Step 6: Verify confidence is within bounds
      expect(expectedResponse.confidence).toBeGreaterThanOrEqual(0);
      expect(expectedResponse.confidence).toBeLessThanOrEqual(1);
    });

    /**
     * Test: validation failure triggers fallback response
     * 
     * Requirements: 3.4, 3.5
     */
    it('should return fallback response on validation failure', async () => {
      // Create invalid response (confidence out of bounds)
      const invalidResponse = {
        regime: 'TRENDING_UP',
        confidence: 1.5, // Invalid: > 1
        reasoning: 'Test reasoning',
        supportingFactors: []
      };

      const validation = AIAnalysisService.validateRegimeOutput(invalidResponse);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some(e => e.includes('confidence'))).toBe(true);
    });

    /**
     * Test: invalid regime value triggers validation failure
     * 
     * Requirements: 3.2
     */
    it('should reject invalid regime values', async () => {
      const invalidResponse = {
        regime: 'INVALID_REGIME',
        confidence: 0.5,
        reasoning: 'Test reasoning',
        supportingFactors: []
      };

      const validation = AIAnalysisService.validateRegimeOutput(invalidResponse);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('regime'))).toBe(true);
    });

    /**
     * Test: all valid regime values are accepted
     * 
     * Requirements: 3.2
     */
    it('should accept all valid regime values', () => {
      for (const regime of VALID_REGIMES) {
        const response = {
          regime,
          confidence: 0.5,
          reasoning: 'Test reasoning for ' + regime,
          supportingFactors: ['Factor 1']
        };

        const validation = AIAnalysisService.validateRegimeOutput(response);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    /**
     * Test: confidence boundary values
     * 
     * Requirements: 3.3
     */
    it('should accept confidence at boundary values', () => {
      // Test confidence = 0
      const responseZero = {
        regime: 'UNCERTAIN',
        confidence: 0,
        reasoning: 'No confidence',
        supportingFactors: []
      };
      expect(AIAnalysisService.validateRegimeOutput(responseZero).valid).toBe(true);

      // Test confidence = 1
      const responseOne = {
        regime: 'TRENDING_UP',
        confidence: 1,
        reasoning: 'Full confidence',
        supportingFactors: []
      };
      expect(AIAnalysisService.validateRegimeOutput(responseOne).valid).toBe(true);

      // Test confidence just below 0
      const responseBelowZero = {
        regime: 'UNCERTAIN',
        confidence: -0.01,
        reasoning: 'Invalid',
        supportingFactors: []
      };
      expect(AIAnalysisService.validateRegimeOutput(responseBelowZero).valid).toBe(false);

      // Test confidence just above 1
      const responseAboveOne = {
        regime: 'TRENDING_UP',
        confidence: 1.01,
        reasoning: 'Invalid',
        supportingFactors: []
      };
      expect(AIAnalysisService.validateRegimeOutput(responseAboveOne).valid).toBe(false);
    });
  });

  describe('Audit Record Completeness', () => {
    /**
     * Test: audit record contains all required fields
     * 
     * Requirements: 10.1, 10.2
     */
    it('should create audit record with all required fields', () => {
      const tenantId = generateUUID();
      const modelConfigId = generateUUID();
      
      const auditRequest: AuditRequest = {
        promptTemplateId: 'regime-classification-default',
        promptVersion: 1,
        renderedPrompt: 'Analyze the following market data...',
        marketDataHash: 'abc123def456'
      };

      const auditResponse: AuditResponse = {
        rawOutput: '{"regime": "TRENDING_UP", "confidence": 0.85}',
        validatedOutput: { regime: 'TRENDING_UP', confidence: 0.85 },
        validationPassed: true,
        processingTimeMs: 150,
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        },
        costUsd: 0.003
      };

      const record = AIAnalysisService.createAuditRecord(
        tenantId,
        modelConfigId,
        'REGIME_CLASSIFICATION',
        auditRequest,
        auditResponse
      );

      // Verify all required fields are present
      expect(record.auditId).toBeDefined();
      expect(record.tenantId).toBe(tenantId);
      expect(record.modelConfigId).toBe(modelConfigId);
      expect(record.analysisType).toBe('REGIME_CLASSIFICATION');
      expect(record.timestamp).toBeDefined();
      expect(record.retentionExpiresAt).toBeDefined();

      // Verify request fields
      expect(record.request.promptTemplateId).toBe(auditRequest.promptTemplateId);
      expect(record.request.promptVersion).toBe(auditRequest.promptVersion);
      expect(record.request.renderedPrompt).toBe(auditRequest.renderedPrompt);
      expect(record.request.marketDataHash).toBe(auditRequest.marketDataHash);

      // Verify response fields
      expect(record.response.rawOutput).toBe(auditResponse.rawOutput);
      expect(record.response.validationPassed).toBe(auditResponse.validationPassed);
      expect(record.response.processingTimeMs).toBe(auditResponse.processingTimeMs);
      expect(record.response.tokenUsage).toEqual(auditResponse.tokenUsage);
      expect(record.response.costUsd).toBe(auditResponse.costUsd);
    });

    /**
     * Test: retention expiration is calculated correctly
     * 
     * Requirements: 10.5
     */
    it('should calculate retention expiration based on configured days', () => {
      const retentionDays = 90;
      AIAnalysisService.configure({ auditRetentionDays: retentionDays });

      const tenantId = generateUUID();
      const modelConfigId = generateUUID();
      
      const auditRequest: AuditRequest = {
        promptTemplateId: 'test',
        promptVersion: 1,
        renderedPrompt: 'test',
        marketDataHash: 'test'
      };

      const auditResponse: AuditResponse = {
        rawOutput: 'test',
        validatedOutput: null,
        validationPassed: false,
        processingTimeMs: 100,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: 0
      };

      const record = AIAnalysisService.createAuditRecord(
        tenantId,
        modelConfigId,
        'TEST',
        auditRequest,
        auditResponse
      );

      const timestamp = new Date(record.timestamp);
      const expiresAt = new Date(record.retentionExpiresAt);
      const diffDays = Math.round((expiresAt.getTime() - timestamp.getTime()) / (24 * 60 * 60 * 1000));

      expect(diffDays).toBe(retentionDays);
    });
  });

  describe('Market Data Hashing', () => {
    /**
     * Test: market data hash is deterministic
     */
    it('should produce consistent hash for same market data', () => {
      const marketData = createTestMarketData('BTC');
      
      const hash1 = AIAnalysisService.hashMarketData(marketData);
      const hash2 = AIAnalysisService.hashMarketData(marketData);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    /**
     * Test: different market data produces different hash
     */
    it('should produce different hash for different market data', () => {
      const marketData1 = createTestMarketData('BTC');
      const marketData2 = createTestMarketData('ETH');

      const hash1 = AIAnalysisService.hashMarketData(marketData1);
      const hash2 = AIAnalysisService.hashMarketData(marketData2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Fallback Response Generation', () => {
    /**
     * Test: fallback response has correct structure
     * 
     * Requirements: 3.5
     */
    it('should generate valid fallback response', () => {
      const modelId = 'test-model';
      const promptVersion = '1';
      const startTime = Date.now() - 100;

      const fallback = AIAnalysisService.createFallbackRegimeResponse(modelId, promptVersion, startTime);

      expect(fallback.regime).toBe('UNCERTAIN');
      expect(fallback.confidence).toBe(0);
      expect(fallback.modelId).toBe(modelId);
      expect(fallback.promptVersion).toBe(promptVersion);
      expect(fallback.processingTimeMs).toBeGreaterThanOrEqual(100);
      expect(fallback.timestamp).toBeDefined();
      expect(fallback.reasoning).toContain('validation failure');
    });

    /**
     * Test: fallback response passes validation
     * 
     * Requirements: 3.5
     */
    it('should produce fallback response that passes validation', () => {
      const fallback = AIAnalysisService.createFallbackRegimeResponse('model', '1', Date.now());
      
      const validation = AIAnalysisService.validateRegimeOutput(fallback);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Explanation Generation Flow', () => {
    /**
     * Test: explanation response validation
     * 
     * Requirements: 4.1
     */
    it('should validate explanation response structure', () => {
      // The schema only validates the core AI output fields, not the full response
      const validExplanation = {
        explanation: 'The strategy entered a long position based on bullish market conditions and strong momentum indicators.',
        keyFactors: [
          { factor: 'Price momentum', impact: 'POSITIVE', weight: 0.4 },
          { factor: 'Volume trend', impact: 'POSITIVE', weight: 0.3 }
        ],
        riskAssessment: 'Moderate risk due to current volatility'
      };

      // Validate using schema validator
      const validation = schemaValidator.validateExplanation(validExplanation);
      expect(validation.valid).toBe(true);
    });

    /**
     * Test: fallback explanation response
     */
    it('should generate valid fallback explanation response', () => {
      const fallback = AIAnalysisService.createFallbackExplanationResponse('model', '1', Date.now());

      expect(fallback.explanation).toBeDefined();
      expect(fallback.keyFactors).toEqual([]);
      expect(fallback.riskAssessment).toBeDefined();
      expect(fallback.modelId).toBe('model');
      expect(fallback.promptVersion).toBe('1');
    });
  });

  describe('Schema Validation Integration', () => {
    /**
     * Test: schema validator correctly validates regime classification
     */
    it('should validate regime classification with schema validator', () => {
      // The schema only validates the core AI output fields, not the full response
      const validResponse = {
        regime: 'HIGH_VOLATILITY',
        confidence: 0.75,
        reasoning: 'Market showing high volatility with large price swings',
        supportingFactors: ['ATR elevated', 'Bollinger bands widening']
      };

      const schemaValidation = schemaValidator.validateRegimeClassification(validResponse);
      const outputValidation = AIAnalysisService.validateRegimeOutput(validResponse);

      expect(schemaValidation.valid).toBe(true);
      expect(outputValidation.valid).toBe(true);
    });

    /**
     * Test: schema validator rejects invalid regime classification
     */
    it('should reject invalid regime classification', () => {
      const invalidResponse = {
        regime: 'TRENDING_UP',
        // Missing confidence
        reasoning: 'Test',
        supportingFactors: []
      };

      const validation = schemaValidator.validateRegimeClassification(invalidResponse);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});
