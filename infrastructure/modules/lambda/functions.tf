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
  }

  # All 34 Lambda function configurations
  functions = {
    #---------------------------------------------------------------------------
    # Strategy Management Functions
    #---------------------------------------------------------------------------
    strategies = {
      description          = "Strategy CRUD operations"
      handler              = "handlers/strategies.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    templates = {
      description          = "Strategy template management"
      handler              = "handlers/templates.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    versions = {
      description          = "Strategy version management"
      handler              = "handlers/versions.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    deployments = {
      description          = "Strategy deployment management"
      handler              = "handlers/deployments.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Market Data Functions
    #---------------------------------------------------------------------------
    streams = {
      description          = "Market data stream management"
      handler              = "handlers/streams.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    data-sources = {
      description          = "Data source configuration"
      handler              = "handlers/data-sources.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    backfills = {
      description          = "Historical data backfill processing"
      handler              = "handlers/backfills.handler"
      memory_size          = 1024
      timeout              = 300
      reserved_concurrency = null
    }

    quality = {
      description          = "Data quality monitoring"
      handler              = "handlers/quality.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    news-context = {
      description          = "News context processing"
      handler              = "handlers/news-context.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # AI Intelligence Functions
    #---------------------------------------------------------------------------
    analysis = {
      description          = "AI analysis processing"
      handler              = "handlers/analysis.handler"
      memory_size          = 1024
      timeout              = 60
      reserved_concurrency = null
    }

    model-configs = {
      description          = "AI model configuration management"
      handler              = "handlers/model-configs.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    providers = {
      description          = "AI provider management"
      handler              = "handlers/providers.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    allocations = {
      description          = "AI allocation management"
      handler              = "handlers/allocations.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    ensemble = {
      description          = "AI ensemble processing"
      handler              = "handlers/ensemble.handler"
      memory_size          = 1024
      timeout              = 60
      reserved_concurrency = null
    }

    performance = {
      description          = "Performance metrics processing"
      handler              = "handlers/performance.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Risk Control Functions
    #---------------------------------------------------------------------------
    position-limits = {
      description          = "Position limit enforcement"
      handler              = "handlers/position-limits.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 10
    }

    drawdown = {
      description          = "Drawdown monitoring and control"
      handler              = "handlers/drawdown.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 10
    }

    circuit-breakers = {
      description          = "Circuit breaker management"
      handler              = "handlers/circuit-breakers.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 20
    }

    kill-switch = {
      description          = "Emergency kill switch"
      handler              = "handlers/kill-switch.handler"
      memory_size          = 256
      timeout              = 10
      reserved_concurrency = 50
    }

    risk-profiles = {
      description          = "Risk profile management"
      handler              = "handlers/risk-profiles.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    risk-events = {
      description          = "Risk event processing"
      handler              = "handlers/risk-events.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Exchange Integration Functions
    #---------------------------------------------------------------------------
    exchange-config = {
      description          = "Exchange configuration management"
      handler              = "handlers/exchange-config.handler"
      memory_size          = 256
      timeout              = 30
      reserved_concurrency = null
    }

    exchange-connections = {
      description          = "Exchange connection management"
      handler              = "handlers/exchange-connections.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    exchange-orders = {
      description          = "Exchange order execution"
      handler              = "handlers/exchange-orders.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = 100
    }

    exchange-positions = {
      description          = "Exchange position management"
      handler              = "handlers/exchange-positions.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    #---------------------------------------------------------------------------
    # Audit & Reporting Functions
    #---------------------------------------------------------------------------
    audit = {
      description          = "Audit log management"
      handler              = "handlers/audit.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    audit-packages = {
      description          = "Audit package generation"
      handler              = "handlers/audit-packages.handler"
      memory_size          = 1024
      timeout              = 300
      reserved_concurrency = null
    }

    audit-stream = {
      description          = "Audit stream processing"
      handler              = "handlers/audit-stream.handler"
      memory_size          = 512
      timeout              = 60
      reserved_concurrency = null
    }

    ai-traces = {
      description          = "AI decision trace management"
      handler              = "handlers/ai-traces.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    data-lineage = {
      description          = "Data lineage tracking"
      handler              = "handlers/data-lineage.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    compliance-reports = {
      description          = "Compliance report generation"
      handler              = "handlers/compliance-reports.handler"
      memory_size          = 1024
      timeout              = 300
      reserved_concurrency = null
    }

    trade-lifecycle = {
      description          = "Trade lifecycle tracking"
      handler              = "handlers/trade-lifecycle.handler"
      memory_size          = 512
      timeout              = 30
      reserved_concurrency = null
    }

    retention = {
      description          = "Data retention policy enforcement"
      handler              = "handlers/retention.handler"
      memory_size          = 512
      timeout              = 300
      reserved_concurrency = null
    }

    snapshots = {
      description          = "System state snapshot management"
      handler              = "handlers/snapshots.handler"
      memory_size          = 1024
      timeout              = 300
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
