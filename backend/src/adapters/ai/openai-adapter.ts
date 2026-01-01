/**
 * OpenAI Adapter - implements AIProviderAdapter for OpenAI GPT models
 * 
 * Provides integration with OpenAI's GPT models for:
 * - Market regime classification
 * - Strategy explanation generation
 * - Parameter suggestions
 * 
 * Requirements: 1.1, 1.3
 */

import { ProviderType } from '../../types/provider';
import { HealthCheckResult, QuotaStatus } from '../../types/adapter';
import {
  RegimeClassificationRequest,
  RegimeClassificationResponse,
  ExplanationRequest,
  ExplanationResponse,
  ParameterSuggestionRequest,
  ParameterSuggestionResponse,
  MarketRegime,
} from '../../types/analysis';
import { BaseAIAdapter, AIAdapterConfig, AIProviderError } from './base-ai-adapter';

/**
 * OpenAI-specific configuration
 */
export interface OpenAIAdapterConfig extends AIAdapterConfig {
  organizationId?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * OpenAI API response structure
 */
interface OpenAIResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

/**
 * OpenAI AI Provider Adapter
 */
export class OpenAIAdapter extends BaseAIAdapter {
  readonly providerType: ProviderType = 'OPENAI';
  
  private organizationId?: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: OpenAIAdapterConfig) {
    super(config);
    this.organizationId = config.organizationId;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2048;
  }

  /**
   * Classify market regime using OpenAI
   */
  async classifyMarketRegime(request: RegimeClassificationRequest): Promise<RegimeClassificationResponse> {
    const startTime = Date.now();
    
    const prompt = this.buildRegimeClassificationPrompt(request);
    
    const response = await this.executeWithRetry(
      () => this.callOpenAIAPI(prompt),
      'classifyMarketRegime'
    );

    const parsed = this.parseRegimeClassificationResponse(response);
    
    return {
      ...parsed,
      modelId: this.config.modelId,
      promptVersion: '1.0',
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate strategy explanation using OpenAI
   */
  async generateExplanation(request: ExplanationRequest): Promise<ExplanationResponse> {
    const startTime = Date.now();
    
    const prompt = this.buildExplanationPrompt(request);
    
    const response = await this.executeWithRetry(
      () => this.callOpenAIAPI(prompt),
      'generateExplanation'
    );

    const parsed = this.parseExplanationResponse(response);
    
    return {
      ...parsed,
      modelId: this.config.modelId,
      promptVersion: '1.0',
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Suggest parameter adjustments using OpenAI
   */
  async suggestParameters(request: ParameterSuggestionRequest): Promise<ParameterSuggestionResponse> {
    const startTime = Date.now();
    
    const prompt = this.buildParameterSuggestionPrompt(request);
    
    const response = await this.executeWithRetry(
      () => this.callOpenAIAPI(prompt),
      'suggestParameters'
    );

    const parsed = this.parseParameterSuggestionResponse(response);
    
    return {
      ...parsed,
      modelId: this.config.modelId,
      promptVersion: '1.0',
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check OpenAI API health
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await this.withTimeout(
        this.callOpenAIAPI('Respond with "OK" if you are operational.'),
        5000
      );
      
      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get remaining API quota
   */
  async getRemainingQuota(): Promise<QuotaStatus> {
    // OpenAI doesn't provide a direct quota API in the standard endpoint
    // In production, this would track usage against known limits
    return {
      requestsRemaining: 10000,
      tokensRemaining: 1000000,
      resetsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Build headers for OpenAI API
   */
  protected override buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
    
    if (this.organizationId) {
      headers['OpenAI-Organization'] = this.organizationId;
    }
    
    return headers;
  }

  /**
   * Call the OpenAI API
   */
  private async callOpenAIAPI(prompt: string): Promise<OpenAIResponse> {
    const url = `${this.config.apiEndpoint}/v1/chat/completions`;
    
    const body = {
      model: this.config.modelId,
      messages: [
        {
          role: 'system',
          content: 'You are a financial analysis AI assistant. Always respond with valid JSON when requested.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' },
    };

    const response = await this.withTimeout(
      fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      })
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AIProviderError(
        `OpenAI API error: ${response.status} - ${errorBody}`,
        this.providerType,
        response.status,
        response.status >= 500 || response.status === 429
      );
    }

    const data = await response.json() as OpenAIResponse;
    
    if (data.error) {
      throw new AIProviderError(
        `OpenAI API error: ${data.error.message}`,
        this.providerType,
        undefined,
        false
      );
    }

    return data;
  }

  /**
   * Extract text from OpenAI response
   */
  private extractText(response: OpenAIResponse): string {
    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      throw new AIProviderError(
        'No text content in OpenAI response',
        this.providerType
      );
    }
    return text;
  }

  /**
   * Build prompt for regime classification
   */
  private buildRegimeClassificationPrompt(request: RegimeClassificationRequest): string {
    const priceData = request.marketData.prices
      .slice(-20)
      .map(p => `${p.timestamp}: O=${p.open} H=${p.high} L=${p.low} C=${p.close}`)
      .join('\n');

    return `Analyze the following market data and classify the current market regime.

Market Data for ${request.marketData.symbol}:
${priceData}

Timeframe: ${request.timeframe}
${request.additionalContext ? `Additional Context: ${request.additionalContext}` : ''}

Respond in JSON format with the following structure:
{
  "regime": "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "HIGH_VOLATILITY" | "LOW_VOLATILITY" | "UNCERTAIN",
  "confidence": <number between 0 and 1>,
  "reasoning": "<explanation of your analysis>",
  "supportingFactors": ["<factor1>", "<factor2>", ...]
}`;
  }

  /**
   * Build prompt for explanation generation
   */
  private buildExplanationPrompt(request: ExplanationRequest): string {
    return `Explain the following trading strategy action.

Strategy ID: ${request.strategyId}
Action: ${request.action.type} ${request.action.symbol}
${request.action.quantity ? `Quantity: ${request.action.quantity}` : ''}
${request.action.price ? `Price: ${request.action.price}` : ''}
Reason: ${request.action.reason}

Strategy Parameters: ${JSON.stringify(request.strategyParameters)}

Market Context:
Symbol: ${request.marketContext.symbol}
Latest Price: ${request.marketContext.prices[request.marketContext.prices.length - 1]?.close ?? 'N/A'}

Respond in JSON format with the following structure:
{
  "explanation": "<detailed natural language explanation>",
  "keyFactors": [
    {"factor": "<factor name>", "impact": "POSITIVE" | "NEGATIVE" | "NEUTRAL", "weight": <0-1>}
  ],
  "riskAssessment": "<risk assessment>"
}`;
  }

  /**
   * Build prompt for parameter suggestions
   */
  private buildParameterSuggestionPrompt(request: ParameterSuggestionRequest): string {
    const performanceHistory = request.performanceHistory
      ?.slice(-10)
      .map(p => `${p.timestamp}: PnL=${p.pnl}, WinRate=${p.winRate}`)
      .join('\n') ?? 'No history available';

    return `Suggest parameter adjustments for the following trading strategy.

Strategy ID: ${request.strategyId}
Current Parameters: ${JSON.stringify(request.currentParameters)}

Performance History:
${performanceHistory}

Market Context:
Symbol: ${request.marketContext.symbol}

Respond in JSON format with the following structure:
{
  "suggestions": [
    {
      "parameterName": "<name>",
      "currentValue": <current>,
      "suggestedValue": <suggested>,
      "rationale": "<why this change>",
      "expectedImpact": "<expected outcome>",
      "confidence": <0-1>
    }
  ],
  "overallAssessment": "<overall strategy assessment>"
}`;
  }

  /**
   * Parse regime classification response
   */
  private parseRegimeClassificationResponse(response: OpenAIResponse): Omit<RegimeClassificationResponse, 'modelId' | 'promptVersion' | 'processingTimeMs' | 'timestamp'> {
    const text = this.extractText(response);
    
    try {
      const parsed = JSON.parse(this.cleanJsonResponse(text));
      
      const validRegimes: MarketRegime[] = [
        'TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 
        'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNCERTAIN'
      ];
      
      if (!validRegimes.includes(parsed.regime)) {
        parsed.regime = 'UNCERTAIN';
      }
      
      parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      
      return {
        regime: parsed.regime,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || '',
        supportingFactors: Array.isArray(parsed.supportingFactors) ? parsed.supportingFactors : [],
      };
    } catch {
      return {
        regime: 'UNCERTAIN',
        confidence: 0,
        reasoning: 'Failed to parse AI response',
        supportingFactors: [],
      };
    }
  }

  /**
   * Parse explanation response
   */
  private parseExplanationResponse(response: OpenAIResponse): Omit<ExplanationResponse, 'modelId' | 'promptVersion' | 'processingTimeMs' | 'timestamp'> {
    const text = this.extractText(response);
    
    try {
      const parsed = JSON.parse(this.cleanJsonResponse(text));
      
      return {
        explanation: parsed.explanation || '',
        keyFactors: Array.isArray(parsed.keyFactors) 
          ? parsed.keyFactors.map((f: Record<string, unknown>) => ({
              factor: String(f.factor || ''),
              impact: ['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(String(f.impact)) 
                ? f.impact as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
                : 'NEUTRAL',
              weight: Math.max(0, Math.min(1, Number(f.weight) || 0)),
            }))
          : [],
        riskAssessment: parsed.riskAssessment || '',
      };
    } catch {
      return {
        explanation: 'Failed to parse AI response',
        keyFactors: [],
        riskAssessment: '',
      };
    }
  }

  /**
   * Parse parameter suggestion response
   */
  private parseParameterSuggestionResponse(response: OpenAIResponse): Omit<ParameterSuggestionResponse, 'modelId' | 'promptVersion' | 'processingTimeMs' | 'timestamp'> {
    const text = this.extractText(response);
    
    try {
      const parsed = JSON.parse(this.cleanJsonResponse(text));
      
      return {
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.map((s: Record<string, unknown>) => ({
              parameterName: String(s.parameterName || ''),
              currentValue: s.currentValue,
              suggestedValue: s.suggestedValue,
              rationale: String(s.rationale || ''),
              expectedImpact: String(s.expectedImpact || ''),
              confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
            }))
          : [],
        overallAssessment: parsed.overallAssessment || '',
      };
    } catch {
      return {
        suggestions: [],
        overallAssessment: 'Failed to parse AI response',
      };
    }
  }

  /**
   * Clean JSON response by removing markdown code blocks
   */
  private cleanJsonResponse(text: string): string {
    return text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
  }
}
