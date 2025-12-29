/**
 * Gemini AI Adapter - implements AIProviderAdapter for Google Gemini
 * 
 * Provides integration with Google's Gemini AI models for:
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
 * Gemini-specific configuration
 */
export interface GeminiAdapterConfig extends AIAdapterConfig {
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
}

/**
 * Gemini API response structure
 */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Gemini AI Provider Adapter
 */
export class GeminiAdapter extends BaseAIAdapter {
  readonly providerType: ProviderType = 'GEMINI';
  
  private generationConfig: GeminiAdapterConfig['generationConfig'];

  constructor(config: GeminiAdapterConfig) {
    super(config);
    this.generationConfig = config.generationConfig ?? {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 2048,
    };
  }

  /**
   * Classify market regime using Gemini
   */
  async classifyMarketRegime(request: RegimeClassificationRequest): Promise<RegimeClassificationResponse> {
    const startTime = Date.now();
    
    const prompt = this.buildRegimeClassificationPrompt(request);
    
    const response = await this.executeWithRetry(
      () => this.callGeminiAPI(prompt),
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
   * Generate strategy explanation using Gemini
   */
  async generateExplanation(request: ExplanationRequest): Promise<ExplanationResponse> {
    const startTime = Date.now();
    
    const prompt = this.buildExplanationPrompt(request);
    
    const response = await this.executeWithRetry(
      () => this.callGeminiAPI(prompt),
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
   * Suggest parameter adjustments using Gemini
   */
  async suggestParameters(request: ParameterSuggestionRequest): Promise<ParameterSuggestionResponse> {
    const startTime = Date.now();
    
    const prompt = this.buildParameterSuggestionPrompt(request);
    
    const response = await this.executeWithRetry(
      () => this.callGeminiAPI(prompt),
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
   * Check Gemini API health
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await this.withTimeout(
        this.callGeminiAPI('Respond with "OK" if you are operational.'),
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
    // Gemini doesn't provide a direct quota API, so we return estimated values
    // In production, this would track usage against known limits
    return {
      requestsRemaining: 1000,
      tokensRemaining: 1000000,
      resetsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Call the Gemini API
   */
  private async callGeminiAPI(prompt: string): Promise<GeminiResponse> {
    const url = `${this.config.apiEndpoint}/v1beta/models/${this.config.modelId}:generateContent?key=${this.config.apiKey}`;
    
    const body = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: this.generationConfig,
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
        `Gemini API error: ${response.status} - ${errorBody}`,
        this.providerType,
        response.status,
        response.status >= 500
      );
    }

    const data = await response.json() as GeminiResponse;
    
    if (data.error) {
      throw new AIProviderError(
        `Gemini API error: ${data.error.message}`,
        this.providerType,
        data.error.code,
        false
      );
    }

    return data;
  }

  /**
   * Extract text from Gemini response
   */
  private extractText(response: GeminiResponse): string {
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new AIProviderError(
        'No text content in Gemini response',
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
}

Only respond with valid JSON, no additional text.`;
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
}

Only respond with valid JSON, no additional text.`;
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
}

Only respond with valid JSON, no additional text.`;
  }

  /**
   * Parse regime classification response
   */
  private parseRegimeClassificationResponse(response: GeminiResponse): Omit<RegimeClassificationResponse, 'modelId' | 'promptVersion' | 'processingTimeMs' | 'timestamp'> {
    const text = this.extractText(response);
    
    try {
      const parsed = JSON.parse(this.cleanJsonResponse(text));
      
      // Validate regime value
      const validRegimes: MarketRegime[] = [
        'TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 
        'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNCERTAIN'
      ];
      
      if (!validRegimes.includes(parsed.regime)) {
        parsed.regime = 'UNCERTAIN';
      }
      
      // Validate confidence
      parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      
      return {
        regime: parsed.regime,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || '',
        supportingFactors: Array.isArray(parsed.supportingFactors) ? parsed.supportingFactors : [],
      };
    } catch {
      // Return fallback on parse error
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
  private parseExplanationResponse(response: GeminiResponse): Omit<ExplanationResponse, 'modelId' | 'promptVersion' | 'processingTimeMs' | 'timestamp'> {
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
  private parseParameterSuggestionResponse(response: GeminiResponse): Omit<ParameterSuggestionResponse, 'modelId' | 'promptVersion' | 'processingTimeMs' | 'timestamp'> {
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
