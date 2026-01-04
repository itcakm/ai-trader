# IAM Module - Granular Policies
# Creates per-resource IAM policies for DynamoDB, S3, Secrets Manager, etc.
# Implements Requirements 16.3, 16.4, 16.5, 16.6

#------------------------------------------------------------------------------
# CloudWatch Logs Policy (attached to all Lambda roles)
# Requirements: 16.3
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "cloudwatch_logs" {
  statement {
    sid    = "CreateLogGroup"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup"
    ]
    resources = [
      "arn:aws:logs:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:*"
    ]
  }

  statement {
    sid    = "WriteLogStreams"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = [
      "arn:aws:logs:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:log-group:${var.log_group_prefix}/${local.name_prefix}-*:*"
    ]
  }
}

resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${local.name_prefix}-lambda-cloudwatch-logs"
  description = "CloudWatch Logs policy for Lambda functions"
  policy      = data.aws_iam_policy_document.cloudwatch_logs.json

  tags = local.common_tags
}

# Attach CloudWatch Logs policy to all Lambda execution roles
resource "aws_iam_role_policy_attachment" "cloudwatch_logs" {
  for_each = aws_iam_role.lambda_execution

  role       = each.value.name
  policy_arn = aws_iam_policy.cloudwatch_logs.arn
}

#------------------------------------------------------------------------------
# X-Ray Tracing Policy (attached to all Lambda roles)
# Requirements: 16.3
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "xray_tracing" {
  statement {
    sid    = "XRayTracing"
    effect = "Allow"
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets",
      "xray:GetSamplingStatisticSummaries"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "xray_tracing" {
  name        = "${local.name_prefix}-lambda-xray-tracing"
  description = "X-Ray tracing policy for Lambda functions"
  policy      = data.aws_iam_policy_document.xray_tracing.json

  tags = local.common_tags
}

# Attach X-Ray policy to all Lambda execution roles
resource "aws_iam_role_policy_attachment" "xray_tracing" {
  for_each = aws_iam_role.lambda_execution

  role       = each.value.name
  policy_arn = aws_iam_policy.xray_tracing.arn
}

#------------------------------------------------------------------------------
# VPC Access Policy (attached to all Lambda roles)
# Requirements: 16.3
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "vpc_access" {
  statement {
    sid    = "VPCAccess"
    effect = "Allow"
    actions = [
      "ec2:CreateNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DeleteNetworkInterface",
      "ec2:AssignPrivateIpAddresses",
      "ec2:UnassignPrivateIpAddresses"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "vpc_access" {
  name        = "${local.name_prefix}-lambda-vpc-access"
  description = "VPC access policy for Lambda functions"
  policy      = data.aws_iam_policy_document.vpc_access.json

  tags = local.common_tags
}

# Attach VPC access policy to all Lambda execution roles
resource "aws_iam_role_policy_attachment" "vpc_access" {
  for_each = aws_iam_role.lambda_execution

  role       = each.value.name
  policy_arn = aws_iam_policy.vpc_access.arn
}

#------------------------------------------------------------------------------
# Per-Table DynamoDB Access Policies
# Requirements: 16.4
#------------------------------------------------------------------------------

# Strategy Management tables
locals {
  strategy_management_tables = [
    "strategy-templates",
    "strategies",
    "strategy-versions",
    "deployments"
  ]
}

data "aws_iam_policy_document" "dynamodb_strategy_management" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  statement {
    sid    = "DynamoDBStrategyManagement"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem"
    ]
    resources = concat(
      [for table in local.strategy_management_tables : var.dynamodb_table_arns[table] if contains(keys(var.dynamodb_table_arns), table)],
      [for table in local.strategy_management_tables : "${var.dynamodb_table_arns[table]}/index/*" if contains(keys(var.dynamodb_table_arns), table)]
    )
  }
}

resource "aws_iam_policy" "dynamodb_strategy_management" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-dynamodb-strategy-management"
  description = "DynamoDB access policy for strategy management tables"
  policy      = data.aws_iam_policy_document.dynamodb_strategy_management[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "dynamodb_strategy_management" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  role       = aws_iam_role.lambda_execution["strategy-management"].name
  policy_arn = aws_iam_policy.dynamodb_strategy_management[0].arn
}

# Market Data tables
locals {
  market_data_tables = [
    "data-sources",
    "news-events",
    "sentiment-data",
    "streams",
    "backfill-requests"
  ]
}

data "aws_iam_policy_document" "dynamodb_market_data" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  statement {
    sid    = "DynamoDBMarketData"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem"
    ]
    resources = concat(
      [for table in local.market_data_tables : var.dynamodb_table_arns[table] if contains(keys(var.dynamodb_table_arns), table)],
      [for table in local.market_data_tables : "${var.dynamodb_table_arns[table]}/index/*" if contains(keys(var.dynamodb_table_arns), table)]
    )
  }
}

resource "aws_iam_policy" "dynamodb_market_data" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-dynamodb-market-data"
  description = "DynamoDB access policy for market data tables"
  policy      = data.aws_iam_policy_document.dynamodb_market_data[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "dynamodb_market_data" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  role       = aws_iam_role.lambda_execution["market-data"].name
  policy_arn = aws_iam_policy.dynamodb_market_data[0].arn
}

# AI Intelligence tables
locals {
  ai_intelligence_tables = [
    "ai-providers",
    "model-configurations",
    "fund-allocations",
    "model-performance",
    "performance-predictions"
  ]
}

data "aws_iam_policy_document" "dynamodb_ai_intelligence" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  statement {
    sid    = "DynamoDBAIIntelligence"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem"
    ]
    resources = concat(
      [for table in local.ai_intelligence_tables : var.dynamodb_table_arns[table] if contains(keys(var.dynamodb_table_arns), table)],
      [for table in local.ai_intelligence_tables : "${var.dynamodb_table_arns[table]}/index/*" if contains(keys(var.dynamodb_table_arns), table)]
    )
  }
}

resource "aws_iam_policy" "dynamodb_ai_intelligence" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-dynamodb-ai-intelligence"
  description = "DynamoDB access policy for AI intelligence tables"
  policy      = data.aws_iam_policy_document.dynamodb_ai_intelligence[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "dynamodb_ai_intelligence" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  role       = aws_iam_role.lambda_execution["ai-intelligence"].name
  policy_arn = aws_iam_policy.dynamodb_ai_intelligence[0].arn
}

# Risk Controls tables
locals {
  risk_controls_tables = [
    "position-limits",
    "drawdown-state",
    "drawdown-config",
    "volatility-state",
    "volatility-config",
    "kill-switch-state",
    "kill-switch-config",
    "circuit-breakers",
    "circuit-breaker-events",
    "risk-profiles",
    "strategy-profile-assignments",
    "risk-events",
    "alert-configs"
  ]
}

data "aws_iam_policy_document" "dynamodb_risk_controls" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  statement {
    sid    = "DynamoDBRiskControls"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem"
    ]
    resources = concat(
      [for table in local.risk_controls_tables : var.dynamodb_table_arns[table] if contains(keys(var.dynamodb_table_arns), table)],
      [for table in local.risk_controls_tables : "${var.dynamodb_table_arns[table]}/index/*" if contains(keys(var.dynamodb_table_arns), table)]
    )
  }
}

resource "aws_iam_policy" "dynamodb_risk_controls" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-dynamodb-risk-controls"
  description = "DynamoDB access policy for risk controls tables"
  policy      = data.aws_iam_policy_document.dynamodb_risk_controls[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "dynamodb_risk_controls" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  role       = aws_iam_role.lambda_execution["risk-controls"].name
  policy_arn = aws_iam_policy.dynamodb_risk_controls[0].arn
}

# Exchange Integration tables
locals {
  exchange_integration_tables = [
    "exchange-limits",
    "exchange-health",
    "rate-limit-state"
  ]
}

data "aws_iam_policy_document" "dynamodb_exchange_integration" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  statement {
    sid    = "DynamoDBExchangeIntegration"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem"
    ]
    resources = concat(
      [for table in local.exchange_integration_tables : var.dynamodb_table_arns[table] if contains(keys(var.dynamodb_table_arns), table)],
      [for table in local.exchange_integration_tables : "${var.dynamodb_table_arns[table]}/index/*" if contains(keys(var.dynamodb_table_arns), table)]
    )
  }
}

resource "aws_iam_policy" "dynamodb_exchange_integration" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-dynamodb-exchange-integration"
  description = "DynamoDB access policy for exchange integration tables"
  policy      = data.aws_iam_policy_document.dynamodb_exchange_integration[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "dynamodb_exchange_integration" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  role       = aws_iam_role.lambda_execution["exchange-integration"].name
  policy_arn = aws_iam_policy.dynamodb_exchange_integration[0].arn
}

# Audit tables (needs access to most tables for audit purposes)
locals {
  audit_tables = [
    "trade-lifecycle",
    "risk-events",
    "strategies",
    "deployments",
    "circuit-breakers",
    "kill-switch-state"
  ]
}

data "aws_iam_policy_document" "dynamodb_audit" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  statement {
    sid    = "DynamoDBAudit"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem"
    ]
    resources = concat(
      [for table in local.audit_tables : var.dynamodb_table_arns[table] if contains(keys(var.dynamodb_table_arns), table)],
      [for table in local.audit_tables : "${var.dynamodb_table_arns[table]}/index/*" if contains(keys(var.dynamodb_table_arns), table)]
    )
  }
}

resource "aws_iam_policy" "dynamodb_audit" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-dynamodb-audit"
  description = "DynamoDB access policy for audit tables"
  policy      = data.aws_iam_policy_document.dynamodb_audit[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "dynamodb_audit" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0

  role       = aws_iam_role.lambda_execution["audit"].name
  policy_arn = aws_iam_policy.dynamodb_audit[0].arn
}
