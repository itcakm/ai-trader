# Backend Production Roadmap - Technical Design

## Overview

This document provides the technical design for implementing the production roadmap requirements. Each phase includes architecture decisions, implementation patterns, and integration specifications.

---

## Phase 1: Security & Infrastructure Foundation

### 1.1 Secrets Management Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS Secrets Manager                       │
├─────────────────────────────────────────────────────────────┤
│  /trading-platform/{env}/exchanges/binance/{tenantId}       │
│  /trading-platform/{env}/exchanges/coinbase/{tenantId}      │
│  /trading-platform/{env}/ai-providers/openai                │
│  /trading-platform/{env}/ai-providers/gemini                │
│  /trading-platform/{env}/data-sources/glassnode             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Secrets Service Layer                      │
│  - Caches secrets in memory (5 min TTL)                     │
│  - Handles rotation events via Lambda                        │
│  - Provides typed interfaces per secret type                 │
└─────────────────────────────────────────────────────────────┘
```


#### Secret Types and Schemas

```typescript
// Exchange credentials schema
interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;  // Coinbase
  subAccountId?: string;
  permissions: ('read' | 'trade' | 'withdraw')[];
  createdAt: string;
  rotatedAt?: string;
}

// AI provider credentials schema
interface AIProviderCredentials {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
  rateLimitTier: string;
}
```

#### Implementation: `backend/src/services/secrets-manager.ts`

```typescript
export const SecretsManagerService = {
  cache: new Map<string, { value: unknown; expiresAt: number }>(),
  
  async getExchangeCredentials(tenantId: string, exchangeId: string): Promise<ExchangeCredentials>,
  async getAIProviderCredentials(providerId: string): Promise<AIProviderCredentials>,
  async rotateSecret(secretId: string): Promise<void>,
  async invalidateCache(secretId: string): void,
};
```

---

### 1.2 Rate Limiting Design

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  API Gateway │────▶│ Rate Limiter │────▶│   Lambda     │
│              │     │  (Redis)     │     │   Handler    │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   DynamoDB   │
                     │ (Tier Config)│
                     └──────────────┘
```

#### Rate Limit Tiers

| Tier | Requests/min | Orders/min | WebSocket Connections |
|------|--------------|------------|----------------------|
| Free | 60 | 10 | 1 |
| Pro | 300 | 100 | 5 |
| Enterprise | 1000 | 500 | 20 |

#### Implementation: `backend/src/middleware/rate-limiter.ts`

```typescript
export const RateLimiterMiddleware = {
  async checkLimit(tenantId: string, endpoint: string): Promise<RateLimitResult>,
  async recordRequest(tenantId: string, endpoint: string): Promise<void>,
  async getRemainingQuota(tenantId: string): Promise<QuotaStatus>,
};
```


---

### 1.3 Redis Caching Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  ElastiCache Redis Cluster                   │
├─────────────────────────────────────────────────────────────┤
│  Namespace: kill-switch:{tenantId}     TTL: 0 (persistent)  │
│  Namespace: rate-limit:{tenantId}      TTL: 60s             │
│  Namespace: price:{symbol}             TTL: 5s              │
│  Namespace: session:{userId}           TTL: 3600s           │
│  Namespace: exchange-health:{id}       TTL: 30s             │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation: `backend/src/services/cache-service.ts`

```typescript
export const CacheService = {
  redis: null as Redis | null,
  
  async initialize(): Promise<void>,
  async get<T>(namespace: string, key: string): Promise<T | null>,
  async set<T>(namespace: string, key: string, value: T, ttlSeconds?: number): Promise<void>,
  async delete(namespace: string, key: string): Promise<void>,
  async invalidatePattern(pattern: string): Promise<void>,
};
```

---

### 1.4 Observability Design

#### Structured Log Format

```json
{
  "timestamp": "2026-01-08T10:30:00.000Z",
  "level": "INFO",
  "correlationId": "uuid-v4",
  "tenantId": "tenant-123",
  "service": "order-manager",
  "operation": "submitOrder",
  "duration": 145,
  "metadata": {
    "orderId": "order-456",
    "exchangeId": "BINANCE",
    "status": "SUBMITTED"
  }
}
```

#### CloudWatch Metrics

| Metric | Namespace | Dimensions |
|--------|-----------|------------|
| OrderSubmissionLatency | TradingPlatform/Orders | TenantId, ExchangeId |
| OrderSuccessRate | TradingPlatform/Orders | TenantId, ExchangeId |
| AIAnalysisLatency | TradingPlatform/AI | TenantId, ProviderId |
| ExchangeHealthScore | TradingPlatform/Exchanges | ExchangeId |
| KillSwitchActivations | TradingPlatform/Risk | TenantId |

#### Implementation: `backend/src/services/observability.ts`

```typescript
export const ObservabilityService = {
  async logStructured(level: LogLevel, message: string, metadata: Record<string, unknown>): Promise<void>,
  async recordMetric(name: string, value: number, dimensions: Record<string, string>): Promise<void>,
  async startTrace(operation: string): TraceContext,
  async endTrace(context: TraceContext): void,
};
```


---

## Phase 2: Exchange Integration Design

### 2.1 Exchange Credential Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│  Client  │────▶│  API Gateway │────▶│ Credential      │
│          │     │              │     │ Handler         │
└──────────┘     └──────────────┘     └────────┬────────┘
                                               │
                      ┌────────────────────────┼────────────────────────┐
                      │                        │                        │
                      ▼                        ▼                        ▼
              ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
              │   Validate   │        │   Encrypt    │        │    Store     │
              │   with       │        │   with KMS   │        │   Secrets    │
              │   Exchange   │        │              │        │   Manager    │
              └──────────────┘        └──────────────┘        └──────────────┘
```

#### Credential Validation

Before storing credentials, validate they work:
1. Call exchange's account info endpoint
2. Verify required permissions (read, trade)
3. Check IP whitelist compatibility
4. Store validation timestamp

### 2.2 Exchange Adapter Factory Enhancement

```typescript
// backend/src/services/exchange-adapter-factory.ts
export const ExchangeAdapterFactory = {
  adapters: new Map<string, BaseExchangeAdapter>(),
  
  async createAdapter(
    tenantId: string,
    exchangeId: ExchangeId,
    mode: ExchangeMode
  ): Promise<BaseExchangeAdapter> {
    // 1. Get credentials from Secrets Manager
    const credentials = await SecretsManagerService.getExchangeCredentials(tenantId, exchangeId);
    
    // 2. Create adapter with real credentials
    const config: ExchangeAdapterConfig = {
      exchangeId,
      tenantId,
      mode,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      passphrase: credentials.passphrase,
      restEndpoint: this.getEndpoint(exchangeId, mode, 'rest'),
      wsEndpoint: this.getEndpoint(exchangeId, mode, 'ws'),
    };
    
    // 3. Instantiate appropriate adapter
    switch (exchangeId) {
      case 'BINANCE': return new BinanceAdapter(config);
      case 'COINBASE': return new CoinbaseAdapter(config);
      default: throw new Error(`Unsupported exchange: ${exchangeId}`);
    }
  },
  
  getEndpoint(exchangeId: ExchangeId, mode: ExchangeMode, type: 'rest' | 'ws'): string {
    const endpoints = {
      BINANCE: {
        PRODUCTION: { rest: 'https://api.binance.com', ws: 'wss://stream.binance.com:9443/ws' },
        SANDBOX: { rest: 'https://testnet.binance.vision', ws: 'wss://testnet.binance.vision/ws' },
      },
      COINBASE: {
        PRODUCTION: { rest: 'https://api.exchange.coinbase.com', ws: 'wss://ws-feed.exchange.coinbase.com' },
        SANDBOX: { rest: 'https://api-public.sandbox.exchange.coinbase.com', ws: 'wss://ws-feed-public.sandbox.exchange.coinbase.com' },
      },
    };
    return endpoints[exchangeId][mode][type];
  },
};
```


### 2.3 Order Reconciliation Design

```
┌─────────────────────────────────────────────────────────────┐
│                  Order Reconciliation Flow                   │
└─────────────────────────────────────────────────────────────┘

Every 5 minutes:
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Get Open    │────▶│  Query       │────▶│  Compare     │
│  Orders from │     │  Exchange    │     │  States      │
│  DynamoDB    │     │  API         │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                     ┌────────────────────────────┼────────────────────────┐
                     │                            │                        │
                     ▼                            ▼                        ▼
              ┌──────────────┐           ┌──────────────┐          ┌──────────────┐
              │   Match      │           │   Mismatch   │          │   Orphan     │
              │   (No Action)│           │   (Update)   │          │   (Alert)    │
              └──────────────┘           └──────────────┘          └──────────────┘
```

#### Implementation: `backend/src/services/order-reconciliation.ts`

```typescript
export const OrderReconciliationService = {
  async reconcileTenant(tenantId: string): Promise<ReconciliationResult>,
  async reconcileOrder(tenantId: string, orderId: string): Promise<OrderReconciliationResult>,
  async detectOrphanedOrders(tenantId: string): Promise<OrphanedOrder[]>,
  async resolveOrphanedOrder(tenantId: string, orderId: string, resolution: Resolution): Promise<void>,
};

interface ReconciliationResult {
  tenantId: string;
  totalOrders: number;
  matched: number;
  updated: number;
  orphaned: number;
  errors: ReconciliationError[];
  duration: number;
}
```

---

## Phase 3: Market Data Pipeline Design

### 3.1 Real-Time Price Feed Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Price Feed Architecture                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Binance    │     │   Coinbase   │     │   Other      │
│   WebSocket  │     │   WebSocket  │     │   Sources    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  Price Aggregator │
                   │  - Outlier filter │
                   │  - VWAP calc      │
                   │  - Staleness check│
                   └────────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │  Redis   │  │Timestream│  │ Consumers│
       │  (Live)  │  │(History) │  │(Strategies)
       └──────────┘  └──────────┘  └──────────┘
```


#### Implementation: `backend/src/services/price-feed-manager.ts`

```typescript
export const PriceFeedManager = {
  connections: new Map<string, WebSocketClient>(),
  subscribers: new Map<string, Set<PriceCallback>>(),
  
  async startFeed(exchangeId: ExchangeId, symbols: string[]): Promise<void>,
  async stopFeed(exchangeId: ExchangeId): Promise<void>,
  async subscribe(symbol: string, callback: PriceCallback): SubscriptionHandle,
  async unsubscribe(handle: SubscriptionHandle): void,
  async getLatestPrice(symbol: string): Promise<AggregatedPrice>,
};

interface AggregatedPrice {
  symbol: string;
  price: number;
  sources: PriceSource[];
  aggregationMethod: 'VWAP' | 'MEDIAN' | 'BEST_BID_ASK';
  confidence: number;
  timestamp: string;
}
```

### 3.2 Timestream Schema

```sql
-- Database: trading_platform
-- Table: price_data

CREATE TABLE price_data (
  time TIMESTAMP,
  symbol VARCHAR,
  exchange VARCHAR,
  price DOUBLE,
  volume DOUBLE,
  bid DOUBLE,
  ask DOUBLE,
  source_latency_ms BIGINT
)
WITH (
  memory_store_retention_hours = 24,
  magnetic_store_retention_days = 365
);
```

---

## Phase 4: AI Provider Integration Design

### 4.1 Multi-Provider Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   AI Provider Chain                          │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Request    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Provider Router                            │
│  - Check provider health                                      │
│  - Check cost limits                                          │
│  - Select based on: latency, cost, capability                │
└──────────────────────────────────────────────────────────────┘
       │
       ├─────────────────┬─────────────────┬─────────────────┐
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   OpenAI     │  │   Gemini     │  │   DeepSeek   │  │   Fallback   │
│   (Primary)  │  │   (Secondary)│  │   (Tertiary) │  │   (Static)   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```


#### Implementation: `backend/src/services/ai-provider-router.ts`

```typescript
export const AIProviderRouter = {
  providers: new Map<string, AIProviderAdapter>(),
  healthStatus: new Map<string, ProviderHealth>(),
  
  async route(request: AIRequest): Promise<AIResponse> {
    const availableProviders = await this.getHealthyProviders();
    
    for (const provider of availableProviders) {
      try {
        // Check cost limit
        const canAfford = await this.checkCostLimit(request.tenantId, provider.id);
        if (!canAfford) continue;
        
        // Execute request
        const response = await provider.execute(request);
        
        // Record usage
        await this.recordUsage(request.tenantId, provider.id, response.tokenUsage);
        
        return response;
      } catch (error) {
        await this.recordFailure(provider.id, error);
        continue; // Try next provider
      }
    }
    
    // All providers failed - return fallback
    return this.getFallbackResponse(request);
  },
  
  async getHealthyProviders(): Promise<AIProviderAdapter[]>,
  async checkCostLimit(tenantId: string, providerId: string): Promise<boolean>,
  async recordUsage(tenantId: string, providerId: string, usage: TokenUsage): Promise<void>,
};
```

### 4.2 OpenAI Adapter Implementation

```typescript
// backend/src/adapters/ai/openai-adapter.ts
export class OpenAIAdapter implements AIProviderAdapter {
  private client: OpenAI;
  
  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organizationId,
    });
  }
  
  async classifyMarketRegime(request: RegimeClassificationRequest): Promise<RegimeClassificationResponse> {
    const prompt = this.buildRegimePrompt(request);
    
    const completion = await this.client.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });
    
    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);
    
    return {
      regime: parsed.regime,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      supportingFactors: parsed.supportingFactors,
      modelId: completion.model,
      promptVersion: '1',
      processingTimeMs: 0, // Calculated by caller
      timestamp: new Date().toISOString(),
    };
  }
}
```

---

## Phase 5: External Data Sources Design

### 5.1 Data Source Abstraction

```typescript
// backend/src/types/external-data.ts
interface ExternalDataSource<T> {
  sourceId: string;
  sourceName: string;
  sourceType: 'NEWS' | 'SENTIMENT' | 'ONCHAIN';
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
  
  fetch(params: FetchParams): Promise<T[]>;
  subscribe?(callback: (data: T) => void): SubscriptionHandle;
}
```


### 5.2 News Aggregation Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Reuters    │     │   CoinDesk   │     │   Other      │
│   API        │     │   API        │     │   Sources    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  News Processor  │
                   │  - Deduplication │
                   │  - Entity extract│
                   │  - Relevance score│
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │    DynamoDB      │
                   │  (news-events)   │
                   └──────────────────┘
```

---

## Phase 6: Alerting Design

### 6.1 Alert Routing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Alert Event                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Alert Router                              │
│  - Evaluate severity                                         │
│  - Check suppression rules                                   │
│  - Determine destinations                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┬─────────────────┐
         │                 │                 │                 │
         ▼                 ▼                 ▼                 ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │     SNS      │  │     SES      │  │   PagerDuty  │  │    Slack     │
  │  (Push)      │  │   (Email)    │  │   (On-Call)  │  │   (Team)     │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

#### Implementation: `backend/src/services/alert-service.ts`

```typescript
export const AlertService = {
  async sendAlert(alert: Alert): Promise<AlertResult> {
    // 1. Check suppression
    if (await this.isSuppressed(alert)) {
      return { sent: false, reason: 'SUPPRESSED' };
    }
    
    // 2. Get routing config for tenant
    const config = await this.getAlertConfig(alert.tenantId);
    
    // 3. Route based on severity
    const destinations = this.getDestinations(alert.severity, config);
    
    // 4. Send to all destinations
    const results = await Promise.allSettled(
      destinations.map(dest => this.sendToDestination(alert, dest))
    );
    
    // 5. Record alert
    await this.recordAlert(alert, results);
    
    return { sent: true, destinations: destinations.length };
  },
};
```

---

## Database Schema Additions

### New Tables Required

```typescript
// Add to backend/src/db/tables.ts

export const TableNames = {
  // ... existing tables ...
  
  // Phase 1
  RATE_LIMITS: process.env.RATE_LIMITS_TABLE || 'rate-limits',
  SECRETS_METADATA: process.env.SECRETS_METADATA_TABLE || 'secrets-metadata',
  
  // Phase 2
  EXCHANGE_CREDENTIALS: process.env.EXCHANGE_CREDENTIALS_TABLE || 'exchange-credentials',
  ORDER_RECONCILIATION: process.env.ORDER_RECONCILIATION_TABLE || 'order-reconciliation',
  
  // Phase 6
  ALERTS: process.env.ALERTS_TABLE || 'alerts',
  ALERT_CONFIGS: process.env.ALERT_CONFIGS_TABLE || 'alert-configs',
  ALERT_SUPPRESSIONS: process.env.ALERT_SUPPRESSIONS_TABLE || 'alert-suppressions',
};
```

---

## Error Handling Strategy

All new services follow consistent error handling:

```typescript
// backend/src/types/errors.ts
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly retryable: boolean = false,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Usage
throw new ServiceError(
  'Exchange API rate limit exceeded',
  'RATE_LIMIT_EXCEEDED',
  429,
  true,
  { retryAfter: 60 }
);
```
