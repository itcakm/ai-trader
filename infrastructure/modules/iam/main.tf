# IAM Module - Roles and Policies for AI-Assisted Crypto Trading System
# Creates Lambda execution roles, service roles, and granular IAM policies
# Implements Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Lambda function groups with their required permissions
  lambda_function_groups = {
    strategy-management = {
      description = "Strategy management functions (strategies, templates, versions, deployments)"
      functions   = ["strategies", "templates", "versions", "deployments"]
    }
    market-data = {
      description = "Market data functions (streams, data-sources, backfills, quality)"
      functions   = ["streams", "data-sources", "backfills", "quality", "news-context"]
    }
    ai-intelligence = {
      description = "AI intelligence functions (analysis, model-configs, providers, allocations, ensemble, performance)"
      functions   = ["analysis", "model-configs", "providers", "allocations", "ensemble", "performance"]
    }
    risk-controls = {
      description = "Risk control functions (position-limits, drawdown, circuit-breakers, kill-switch, risk-profiles, risk-events)"
      functions   = ["position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events"]
    }
    exchange-integration = {
      description = "Exchange integration functions (exchange-config, exchange-connections, exchange-orders, exchange-positions)"
      functions   = ["exchange-config", "exchange-connections", "exchange-orders", "exchange-positions"]
    }
    audit = {
      description = "Audit and reporting functions (audit, audit-packages, audit-stream, ai-traces, data-lineage, compliance-reports, trade-lifecycle, retention, snapshots)"
      functions   = ["audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage", "compliance-reports", "trade-lifecycle", "retention", "snapshots"]
    }
  }
}

# Get current AWS account ID and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# Lambda Execution Roles
# Creates execution roles for each Lambda function group
# Requirements: 16.1, 16.8
#------------------------------------------------------------------------------

# Trust policy for Lambda service
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    sid     = "AllowLambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Lambda execution roles for each function group
resource "aws_iam_role" "lambda_execution" {
  for_each = local.lambda_function_groups

  name               = "${local.name_prefix}-lambda-${each.key}"
  description        = each.value.description
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = merge(local.common_tags, {
    Name          = "${local.name_prefix}-lambda-${each.key}"
    FunctionGroup = each.key
  })
}
