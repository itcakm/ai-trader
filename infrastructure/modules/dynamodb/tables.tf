# DynamoDB Module - Table Definitions
# Defines all 32 tables with their key schemas and GSI configurations
# Based on backend/src/db/tables.ts

locals {
  # All 32 DynamoDB tables with their configurations
  tables = {
    # Strategy Management Tables
    strategy-templates = {
      partition_key      = "templateId"
      partition_key_type = "S"
      sort_key           = "version"
      sort_key_type      = "N"
      ttl_attribute      = null
      gsi = [
        {
          name               = "name-index"
          partition_key      = "name"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    strategies = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "strategyId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi                = []
    }

    strategy-versions = {
      partition_key      = "strategyId"
      partition_key_type = "S"
      sort_key           = "version"
      sort_key_type      = "N"
      ttl_attribute      = null
      gsi                = []
    }

    deployments = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "deploymentId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "strategyId-index"
          partition_key      = "strategyId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    # Market Data Tables
    data-sources = {
      partition_key      = "sourceId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi = [
        {
          name               = "type-index"
          partition_key      = "type"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "status-index"
          partition_key      = "status"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    news-events = {
      partition_key      = "symbol"
      partition_key_type = "S"
      sort_key           = "publishedAtEventId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "contentHash-index"
          partition_key      = "contentHash"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "source-publishedAt-index"
          partition_key      = "source"
          partition_key_type = "S"
          sort_key           = "publishedAt"
          sort_key_type      = "S"
        }
      ]
    }

    sentiment-data = {
      partition_key      = "symbol"
      partition_key_type = "S"
      sort_key           = "timestamp"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "aggregatedFrom-timestamp-index"
          partition_key      = "aggregatedFrom"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        }
      ]
    }

    streams = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "streamId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "status-index"
          partition_key      = "status"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "sourceId-index"
          partition_key      = "sourceId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    backfill-requests = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "requestId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "status-index"
          partition_key      = "status"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "sourceId-index"
          partition_key      = "sourceId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    # AI Intelligence Tables
    ai-providers = {
      partition_key      = "providerId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi = [
        {
          name               = "type-index"
          partition_key      = "type"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "status-index"
          partition_key      = "status"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    model-configurations = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "configId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "providerId-index"
          partition_key      = "providerId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    fund-allocations = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "strategyIdVersion"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "strategyId-version-index"
          partition_key      = "strategyId"
          partition_key_type = "S"
          sort_key           = "version"
          sort_key_type      = "N"
        }
      ]
    }

    model-performance = {
      partition_key      = "tenantModelConfigId"
      partition_key_type = "S"
      sort_key           = "periodPeriodStart"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi                = []
    }

    performance-predictions = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "predictionId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "modelConfigId-timestamp-index"
          partition_key      = "modelConfigId"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        }
      ]
    }

    # Risk Control Tables
    position-limits = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "limitId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "scope-index"
          partition_key      = "scope"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "assetId-index"
          partition_key      = "assetId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "strategyId-index"
          partition_key      = "strategyId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    drawdown-state = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "stateId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "scope-index"
          partition_key      = "scope"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "strategyId-index"
          partition_key      = "strategyId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "status-index"
          partition_key      = "status"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    drawdown-config = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "configId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "strategyId-index"
          partition_key      = "strategyId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    volatility-state = {
      partition_key      = "stateId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi = [
        {
          name               = "assetId-index"
          partition_key      = "assetId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "level-index"
          partition_key      = "level"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    volatility-config = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "configId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "assetId-index"
          partition_key      = "assetId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    kill-switch-state = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi = [
        {
          name               = "scope-index"
          partition_key      = "scope"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "active-index"
          partition_key      = "active"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    kill-switch-config = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "configId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi                = []
    }

    circuit-breakers = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "breakerId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "scope-index"
          partition_key      = "scope"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "state-index"
          partition_key      = "state"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "scopeId-index"
          partition_key      = "scopeId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    circuit-breaker-events = {
      partition_key      = "tenantBreakerId"
      partition_key_type = "S"
      sort_key           = "timestamp"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "breakerId-index"
          partition_key      = "breakerId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    risk-profiles = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "profileIdVersion"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "name-index"
          partition_key      = "name"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "profileId-index"
          partition_key      = "profileId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    strategy-profile-assignments = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "strategyId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "profileId-index"
          partition_key      = "profileId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    # Exchange Integration Tables
    exchange-limits = {
      partition_key      = "exchangeId"
      partition_key_type = "S"
      sort_key           = "assetId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "assetId-index"
          partition_key      = "assetId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    exchange-health = {
      partition_key      = "exchangeId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi = [
        {
          name               = "status-index"
          partition_key      = "status"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }

    rate-limit-state = {
      partition_key      = "exchangeId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi                = []
    }

    # Risk Events and Alerts Tables
    risk-events = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "timestampEventId"
      sort_key_type      = "S"
      ttl_attribute      = "expiresAt"
      gsi = [
        {
          name               = "eventType-timestamp-index"
          partition_key      = "eventType"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        },
        {
          name               = "severity-timestamp-index"
          partition_key      = "severity"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        },
        {
          name               = "strategyId-timestamp-index"
          partition_key      = "strategyId"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        },
        {
          name               = "assetId-timestamp-index"
          partition_key      = "assetId"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        }
      ]
    }

    alert-configs = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi                = []
    }

    # Trade Lifecycle Table
    trade-lifecycle = {
      partition_key      = "tenantId"
      partition_key_type = "S"
      sort_key           = "eventId"
      sort_key_type      = "S"
      ttl_attribute      = null
      gsi = [
        {
          name               = "correlationId-timestamp-index"
          partition_key      = "correlationId"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        },
        {
          name               = "strategyId-timestamp-index"
          partition_key      = "strategyId"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        },
        {
          name               = "eventType-timestamp-index"
          partition_key      = "eventType"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        }
      ]
    }

    # Authentication Tables
    # Requirements: 11.9, 12.8

    # Auth Audit Log Table - Requirements: 11.9
    auth-audit = {
      partition_key      = "entryId"
      partition_key_type = "S"
      sort_key           = "timestamp"
      sort_key_type      = "S"
      ttl_attribute      = "ttl"
      gsi = [
        {
          name               = "userId-timestamp-index"
          partition_key      = "userId"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        },
        {
          name               = "tenantId-timestamp-index"
          partition_key      = "tenantId"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        },
        {
          name               = "event-timestamp-index"
          partition_key      = "event"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        }
      ]
    }

    # Password History Table - Requirements: 12.8
    password-history = {
      partition_key      = "userId"
      partition_key_type = "S"
      sort_key           = "timestamp"
      sort_key_type      = "S"
      ttl_attribute      = "ttl"
      gsi                = []
    }

    # Login History Table - Requirements: 12.2
    login-history = {
      partition_key      = "userId"
      partition_key_type = "S"
      sort_key           = "timestamp"
      sort_key_type      = "S"
      ttl_attribute      = "ttl"
      gsi = [
        {
          name               = "ip-timestamp-index"
          partition_key      = "ip"
          partition_key_type = "S"
          sort_key           = "timestamp"
          sort_key_type      = "S"
        }
      ]
    }

    # User Profiles Table - Requirements: 1.8
    user-profiles = {
      partition_key      = "userId"
      partition_key_type = "S"
      sort_key           = null
      sort_key_type      = null
      ttl_attribute      = null
      gsi = [
        {
          name               = "email-index"
          partition_key      = "email"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        },
        {
          name               = "tenantId-index"
          partition_key      = "tenantId"
          partition_key_type = "S"
          sort_key           = null
          sort_key_type      = null
        }
      ]
    }
  }

  # List of table names for iteration
  table_names = keys(local.tables)

  # Count of tables for validation
  table_count = length(local.table_names)
}
