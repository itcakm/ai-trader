# API Gateway Module - Main Configuration
# Creates REST API with Lambda proxy integrations
# Requirements: 7.1, 7.2, 7.4

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    Module      = "api-gateway"
    ManagedBy   = "terraform"
  })

  # API routes configuration - maps HTTP methods and paths to Lambda functions
  api_routes = {
    # Strategy Management
    "GET /strategies"         = "strategies"
    "POST /strategies"        = "strategies"
    "GET /strategies/{id}"    = "strategies"
    "PUT /strategies/{id}"    = "strategies"
    "DELETE /strategies/{id}" = "strategies"

    "GET /templates"         = "templates"
    "POST /templates"        = "templates"
    "GET /templates/{id}"    = "templates"
    "PUT /templates/{id}"    = "templates"
    "DELETE /templates/{id}" = "templates"

    "GET /versions"      = "versions"
    "POST /versions"     = "versions"
    "GET /versions/{id}" = "versions"

    "GET /deployments"         = "deployments"
    "POST /deployments"        = "deployments"
    "GET /deployments/{id}"    = "deployments"
    "PUT /deployments/{id}"    = "deployments"
    "DELETE /deployments/{id}" = "deployments"

    # Market Data
    "GET /streams"         = "streams"
    "POST /streams"        = "streams"
    "GET /streams/{id}"    = "streams"
    "PUT /streams/{id}"    = "streams"
    "DELETE /streams/{id}" = "streams"

    "GET /data-sources"      = "data-sources"
    "POST /data-sources"     = "data-sources"
    "GET /data-sources/{id}" = "data-sources"
    "PUT /data-sources/{id}" = "data-sources"

    "GET /backfills"      = "backfills"
    "POST /backfills"     = "backfills"
    "GET /backfills/{id}" = "backfills"

    "GET /quality"      = "quality"
    "GET /quality/{id}" = "quality"

    "GET /news-context"      = "news-context"
    "GET /news-context/{id}" = "news-context"

    # AI Intelligence
    "GET /analysis"      = "analysis"
    "POST /analysis"     = "analysis"
    "GET /analysis/{id}" = "analysis"

    "GET /model-configs"      = "model-configs"
    "POST /model-configs"     = "model-configs"
    "GET /model-configs/{id}" = "model-configs"
    "PUT /model-configs/{id}" = "model-configs"

    "GET /providers"      = "providers"
    "POST /providers"     = "providers"
    "GET /providers/{id}" = "providers"
    "PUT /providers/{id}" = "providers"

    "GET /allocations"      = "allocations"
    "POST /allocations"     = "allocations"
    "GET /allocations/{id}" = "allocations"
    "PUT /allocations/{id}" = "allocations"

    "GET /ensemble"      = "ensemble"
    "POST /ensemble"     = "ensemble"
    "GET /ensemble/{id}" = "ensemble"

    "GET /performance"      = "performance"
    "GET /performance/{id}" = "performance"

    # Risk Controls
    "GET /position-limits"      = "position-limits"
    "POST /position-limits"     = "position-limits"
    "GET /position-limits/{id}" = "position-limits"
    "PUT /position-limits/{id}" = "position-limits"

    "GET /drawdown"      = "drawdown"
    "GET /drawdown/{id}" = "drawdown"

    "GET /circuit-breakers"      = "circuit-breakers"
    "POST /circuit-breakers"     = "circuit-breakers"
    "GET /circuit-breakers/{id}" = "circuit-breakers"
    "PUT /circuit-breakers/{id}" = "circuit-breakers"

    "GET /kill-switch"      = "kill-switch"
    "POST /kill-switch"     = "kill-switch"
    "PUT /kill-switch/{id}" = "kill-switch"

    "GET /risk-profiles"      = "risk-profiles"
    "POST /risk-profiles"     = "risk-profiles"
    "GET /risk-profiles/{id}" = "risk-profiles"
    "PUT /risk-profiles/{id}" = "risk-profiles"

    "GET /risk-events"      = "risk-events"
    "GET /risk-events/{id}" = "risk-events"

    # Exchange Integration
    "GET /exchange-config"      = "exchange-config"
    "POST /exchange-config"     = "exchange-config"
    "GET /exchange-config/{id}" = "exchange-config"
    "PUT /exchange-config/{id}" = "exchange-config"

    "GET /exchange-connections"      = "exchange-connections"
    "POST /exchange-connections"     = "exchange-connections"
    "GET /exchange-connections/{id}" = "exchange-connections"
    "PUT /exchange-connections/{id}" = "exchange-connections"

    "GET /exchange-orders"      = "exchange-orders"
    "POST /exchange-orders"     = "exchange-orders"
    "GET /exchange-orders/{id}" = "exchange-orders"
    "PUT /exchange-orders/{id}" = "exchange-orders"

    "GET /exchange-positions"      = "exchange-positions"
    "GET /exchange-positions/{id}" = "exchange-positions"

    # Audit & Reporting
    "GET /audit"      = "audit"
    "GET /audit/{id}" = "audit"

    "GET /audit-packages"      = "audit-packages"
    "POST /audit-packages"     = "audit-packages"
    "GET /audit-packages/{id}" = "audit-packages"

    "GET /audit-stream"  = "audit-stream"
    "POST /audit-stream" = "audit-stream"

    "GET /ai-traces"      = "ai-traces"
    "GET /ai-traces/{id}" = "ai-traces"

    "GET /data-lineage"      = "data-lineage"
    "GET /data-lineage/{id}" = "data-lineage"

    "GET /compliance-reports"      = "compliance-reports"
    "POST /compliance-reports"     = "compliance-reports"
    "GET /compliance-reports/{id}" = "compliance-reports"

    "GET /trade-lifecycle"      = "trade-lifecycle"
    "GET /trade-lifecycle/{id}" = "trade-lifecycle"

    "GET /retention"      = "retention"
    "POST /retention"     = "retention"
    "GET /retention/{id}" = "retention"
    "PUT /retention/{id}" = "retention"

    "GET /snapshots"      = "snapshots"
    "POST /snapshots"     = "snapshots"
    "GET /snapshots/{id}" = "snapshots"
  }

  # Extract unique resource paths
  resource_paths = distinct([
    for route, _ in local.api_routes :
    split(" ", route)[1]
  ])

  # Read-only endpoints for caching
  cacheable_methods = ["GET"]
}

# Get current AWS region
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# REST API
# Requirements: 7.1 - Create REST API with regional endpoint
#------------------------------------------------------------------------------
resource "aws_api_gateway_rest_api" "main" {
  name        = "${local.name_prefix}-api"
  description = "REST API for ${var.project_name} ${var.environment} environment"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  # Enable request body compression
  minimum_compression_size = 1024

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api"
  })
}

#------------------------------------------------------------------------------
# Request Validators
# Requirements: 7.4 - Configure request validation for all endpoints
#------------------------------------------------------------------------------
resource "aws_api_gateway_request_validator" "body" {
  name                        = "validate-body"
  rest_api_id                 = aws_api_gateway_rest_api.main.id
  validate_request_body       = true
  validate_request_parameters = false
}

resource "aws_api_gateway_request_validator" "params" {
  name                        = "validate-params"
  rest_api_id                 = aws_api_gateway_rest_api.main.id
  validate_request_body       = false
  validate_request_parameters = true
}

resource "aws_api_gateway_request_validator" "all" {
  name                        = "validate-all"
  rest_api_id                 = aws_api_gateway_rest_api.main.id
  validate_request_body       = true
  validate_request_parameters = true
}

#------------------------------------------------------------------------------
# API Gateway Account Settings (for CloudWatch logging)
#------------------------------------------------------------------------------
resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${local.name_prefix}-api-gateway-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "api_gateway_cloudwatch" {
  name = "${local.name_prefix}-api-gateway-cloudwatch"
  role = aws_iam_role.api_gateway_cloudwatch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}
