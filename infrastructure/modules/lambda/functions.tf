# Lambda Functions Definition
# Defines all 34 Lambda functions with their configurations
# Requirements: 6.1, 6.2, 6.3

locals {
  # Function group mapping - maps each function to its IAM role group
  function_groups = {
    # Strategy Management
    strategies  = "strategy-management"
    templates   = "strategy-management"
    versions    = "strategy-management"
    deployments = "strategy-management"

    # Market Data
    streams      = "market-data"
    data-sources = "market-data"
    backfills    = "market-data"
    quality      = "market-data"
    news-context = "market-data"

    # AI Intelligence
    analysis      = "ai-intelligence"
    model-configs = "ai-intelligence"
    providers     = "ai-intelligence"
    allocations   = "ai-intelligence"
    ensemble      = "ai-intelligence"
    performance   = "ai-intelligence"

    # Risk Controls
    position-limits  = "risk-controls"
    drawdown         = "risk-controls"
    circuit-breakers = "risk-controls"
    kill-switch      = "risk-controls"
    risk-profiles    = "risk-controls"
    risk-events      = "risk-controls"

    # Exchange Integration
    exchange-config      = "exchange-integration"
    exchange-connections = "exchange-integration"
    exchange-orders      = "exchange-integration"
    exchange-positions   = "exchange-integration"

    # Audit & Reporting
    audit              = "audit"
    audit-packages     = "audit"
    audit-stream       = "audit"
    ai-traces          = "audit"
    data-lineage       = "audit"
    compliance-reports = "audit"
    trade-lifecycle    = "audit"
    retention          = "audit"
    snapshots          = "audit"

    # Auth Triggers (Cognito Lambda Triggers)
    auth-pre-signup          = "auth"
    auth-post-confirmation   = "auth"
    auth-post-authentication = "auth"

    # Auth Handler (API Gateway auth endpoints)
    auth = "auth"
  }

  # All 34 Lambda function configurations
  functions = {
    #---------------------------------------------------------------------------
    # Strategy Management Functions
    #---------------------------------------------------------------------------
    strategies = {
      description          = "Strategy CRUD operations"
      handler              = "dist/handlers/strategies.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    templates = {
      description          = "Strategy template management"
      handler              = "dist/handlers/templates.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    versions = {
      description          = "Strategy version management"
      handler              = "dist/handlers/versions.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    deployments = {
      description          = "Strategy deployment management"
      handler              = "dist/handlers/deployments.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Market Data Functions
    #---------------------------------------------------------------------------
    streams = {
      description          = "Market data stream management"
      handler              = "dist/handlers/streams.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    data-sources = {
      description          = "Data source configuration"
      handler              = "dist/handlers/data-sources.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    backfills = {
      description          = "Historical data backfill processing"
      handler              = "dist/handlers/backfills.handler"
      memory_size          = 1024
      timeout              = 300
      reserved_concurrency = null
    }

    quality = {
      description          = "Data quality monitoring"
      handler              = "dist/handlers/quality.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    news-context = {
      description          = "News context processing"
      handler              = "dist/handlers/news-context.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # AI Intelligence Functions
    #---------------------------------------------------------------------------
    analysis = {
      description          = "AI analysis processing"
      handler              = "dist/handlers/analysis.handler"
      memory_size          = 1024
      timeout              = 60
      reserved_concurrency = null
    }

    model-configs = {
      description          = "AI model configuration management"
      handler              = "dist/handlers/model-configs.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    providers = {
      description          = "AI provider management"
      handler              = "dist/handlers/providers.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    allocations = {
      description          = "AI allocation management"
      handler              = "dist/handlers/allocations.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    ensemble = {
      description          = "AI ensemble processing"
      handler              = "dist/handlers/ensemble.handler"
      memory_size          = 1024
      timeout              = 60
      reserved_concurrency = null
    }

    performance = {
      description          = "Performance metrics processing"
      handler              = "dist/handlers/performance.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Risk Control Functions
    #---------------------------------------------------------------------------
    position-limits = {
      description          = "Position limit enforcement"
      handler              = "dist/handlers/position-limits.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 10
    }

    drawdown = {
      description          = "Drawdown monitoring and control"
      handler              = "dist/handlers/drawdown.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 10
    }

    circuit-breakers = {
      description          = "Circuit breaker management"
      handler              = "dist/handlers/circuit-breakers.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 20
    }

    kill-switch = {
      description          = "Emergency kill switch"
      handler              = "dist/handlers/kill-switch.handler"
      memory_size          = 256
      timeout              = 10
      reserved_concurrency = 50
    }

    risk-profiles = {
      description          = "Risk profile management"
      handler              = "dist/handlers/risk-profiles.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    risk-events = {
      description          = "Risk event processing"
      handler              = "dist/handlers/risk-events.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Exchange Integration Functions
    #---------------------------------------------------------------------------
    exchange-config = {
      description          = "Exchange configuration management"
      handler              = "dist/handlers/exchange-config.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    exchange-connections = {
      description          = "Exchange connection management"
      handler              = "dist/handlers/exchange-connections.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    exchange-orders = {
      description          = "Exchange order execution"
      handler              = "dist/handlers/exchange-orders.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 100
    }

    exchange-positions = {
      description          = "Exchange position management"
      handler              = "dist/handlers/exchange-positions.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Audit & Reporting Functions
    #---------------------------------------------------------------------------
    audit = {
      description          = "Audit log management"
      handler              = "dist/handlers/audit.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    audit-packages = {
      description          = "Audit package generation"
      handler              = "dist/handlers/audit-packages.handler"
      memory_size          = 1024
      timeout              = 300
      reserved_concurrency = null
    }

    audit-stream = {
      description          = "Audit stream processing"
      handler              = "dist/handlers/audit-stream.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    ai-traces = {
      description          = "AI decision trace management"
      handler              = "dist/handlers/ai-traces.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    data-lineage = {
      description          = "Data lineage tracking"
      handler              = "dist/handlers/data-lineage.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    compliance-reports = {
      description          = "Compliance report generation"
      handler              = "dist/handlers/compliance-reports.handler"
      memory_size          = 1024
      timeout              = 300
      reserved_concurrency = null
    }

    trade-lifecycle = {
      description          = "Trade lifecycle tracking"
      handler              = "dist/handlers/trade-lifecycle.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    retention = {
      description          = "Data retention policy enforcement"
      handler              = "dist/handlers/retention.handler"
      memory_size          = 512
      timeout              = 300
      reserved_concurrency = null
    }

    snapshots = {
      description          = "System state snapshot management"
      handler              = "dist/handlers/snapshots.handler"
      memory_size          = 1024
      timeout              = 300
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Auth Trigger Functions (Cognito Lambda Triggers)
    # Requirements: 1.8, 12.2, 12.3, 12.4
    #---------------------------------------------------------------------------
    auth-pre-signup = {
      description          = "Cognito pre-signup validation trigger"
      handler              = "dist/handlers/auth/triggers/pre-signup.handler"
      memory_size          = 256
      timeout              = 10
      reserved_concurrency = null
    }

    auth-post-confirmation = {
      description          = "Cognito post-confirmation user setup trigger"
      handler              = "dist/handlers/auth/triggers/post-confirmation.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    auth-post-authentication = {
      description          = "Cognito post-authentication login notification trigger"
      handler              = "dist/handlers/auth/triggers/post-authentication.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Auth Handler (API Gateway auth endpoints)
    # Requirements: 3.1-3.12 - Authentication endpoints
    #---------------------------------------------------------------------------
    auth = {
      description          = "Authentication API handler (signup, login, logout, etc.)"
      handler              = "dist/handlers/auth.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }
  }

  # Functions that require provisioned concurrency in production
  latency_sensitive_functions = [
    "kill-switch",
    "circuit-breakers",
    "exchange-orders",
    "position-limits",
    "drawdown"
  ]

  # Functions with reserved concurrency (critical functions)
  critical_functions = {
    kill-switch      = 50
    circuit-breakers = 20
    exchange-orders  = 100
    position-limits  = 10
    drawdown         = 10
  }
}
