/**
 * AI Provider types for the AI-Assisted Intelligence feature.
 * Supports multiple AI providers (Gemini, OpenAI, DeepSeek, etc.)
 */

export type ProviderType = 'GEMINI' | 'OPENAI' | 'DEEPSEEK' | 'ANTHROPIC' | 'CUSTOM';

export type ProviderStatus = 'ACTIVE' | 'INACTIVE' | 'RATE_LIMITED' | 'ERROR';

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;
}

export interface AIProvider {
  providerId: string;
  type: ProviderType;
  name: string;
  apiEndpoint: string;
  authMethod: 'API_KEY' | 'OAUTH' | 'IAM';
  supportedModels: string[];
  status: ProviderStatus;
  rateLimits: RateLimitConfig;
  createdAt: string;
  updatedAt: string;
}
