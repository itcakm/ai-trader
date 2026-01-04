# API Gateway Stage Configuration
# Configures deployment, logging, throttling, and usage plans
# Requirements: 7.3, 7.5, 7.6, 7.7

#------------------------------------------------------------------------------
# CloudWatch Log Group for API Gateway
# Requirements: 7.5 - Enable CloudWatch logging for API stage
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/api-gateway/${local.name_prefix}-api"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-gateway-logs"
  })
}

#------------------------------------------------------------------------------
# API Gateway Deployment
#------------------------------------------------------------------------------
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # Trigger redeployment when any route changes
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.level1,
      aws_api_gateway_resource.level2_id,
      aws_api_gateway_method.get_collection,
      aws_api_gateway_method.post_collection,
      aws_api_gateway_method.get_item,
      aws_api_gateway_method.put_item,
      aws_api_gateway_method.delete_item,
      aws_api_gateway_integration.get_collection,
      aws_api_gateway_integration.post_collection,
      aws_api_gateway_integration.get_item,
      aws_api_gateway_integration.put_item,
      aws_api_gateway_integration.delete_item,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.get_collection,
    aws_api_gateway_integration.post_collection,
    aws_api_gateway_integration.get_item,
    aws_api_gateway_integration.put_item,
    aws_api_gateway_integration.delete_item,
    aws_api_gateway_integration.options_collection,
    aws_api_gateway_integration.options_item,
  ]
}

#------------------------------------------------------------------------------
# API Gateway Stage
# Requirements: 7.5, 7.6 - Configure logging and throttling
#------------------------------------------------------------------------------
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  # Enable caching for production
  cache_cluster_enabled = var.enable_caching
  cache_cluster_size    = var.enable_caching ? var.cache_size : null

  # Enable X-Ray tracing
  xray_tracing_enabled = true

  # Access logging
  dynamic "access_log_settings" {
    for_each = var.enable_access_logging ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.api_gateway.arn
      format = jsonencode({
        requestId          = "$context.requestId"
        ip                 = "$context.identity.sourceIp"
        caller             = "$context.identity.caller"
        user               = "$context.identity.user"
        requestTime        = "$context.requestTime"
        httpMethod         = "$context.httpMethod"
        resourcePath       = "$context.resourcePath"
        status             = "$context.status"
        protocol           = "$context.protocol"
        responseLength     = "$context.responseLength"
        integrationError   = "$context.integrationErrorMessage"
        errorMessage       = "$context.error.message"
        errorType          = "$context.error.responseType"
        apiKeyId           = "$context.identity.apiKeyId"
        userAgent          = "$context.identity.userAgent"
        integrationLatency = "$context.integrationLatency"
        responseLatency    = "$context.responseLatency"
      })
    }
  }

  variables = {
    environment = var.environment
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-stage"
  })

  depends_on = [aws_api_gateway_account.main]
}

#------------------------------------------------------------------------------
# API Gateway Method Settings
# Requirements: 7.5, 7.6, 7.9 - Configure logging, throttling, and caching
#------------------------------------------------------------------------------
resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "*/*"

  settings {
    # Throttling
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit

    # Logging
    logging_level      = var.enable_execution_logging ? var.logging_level : "OFF"
    data_trace_enabled = var.environment != "production"
    metrics_enabled    = true

    # Caching (disabled by default, enabled per-method for GET requests)
    caching_enabled = false
  }
}

# Enable caching for GET collection endpoints (production only)
resource "aws_api_gateway_method_settings" "get_collection_cache" {
  for_each = var.enable_caching ? toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "quality", "news-context",
    "model-configs", "providers", "allocations", "performance",
    "position-limits", "risk-profiles",
    "exchange-config", "exchange-positions",
    "audit", "ai-traces", "data-lineage", "trade-lifecycle"
  ]) : toset([])

  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "${each.key}/GET"

  settings {
    caching_enabled      = true
    cache_ttl_in_seconds = var.cache_ttl_seconds
  }
}

#------------------------------------------------------------------------------
# Usage Plans
# Requirements: 7.7 - Create usage plans and API keys for tenant isolation
#------------------------------------------------------------------------------
resource "aws_api_gateway_usage_plan" "standard" {
  name        = "${local.name_prefix}-standard-plan"
  description = "Standard usage plan for ${var.project_name} ${var.environment}"

  api_stages {
    api_id = aws_api_gateway_rest_api.main.id
    stage  = aws_api_gateway_stage.main.stage_name
  }

  quota_settings {
    limit  = var.usage_plan_quota_limit
    period = var.usage_plan_quota_period
  }

  throttle_settings {
    rate_limit  = var.throttling_rate_limit
    burst_limit = var.throttling_burst_limit
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-standard-plan"
  })
}

resource "aws_api_gateway_usage_plan" "premium" {
  name        = "${local.name_prefix}-premium-plan"
  description = "Premium usage plan for ${var.project_name} ${var.environment}"

  api_stages {
    api_id = aws_api_gateway_rest_api.main.id
    stage  = aws_api_gateway_stage.main.stage_name
  }

  quota_settings {
    limit  = var.usage_plan_quota_limit * 5
    period = var.usage_plan_quota_period
  }

  throttle_settings {
    rate_limit  = var.throttling_rate_limit * 2
    burst_limit = var.throttling_burst_limit * 2
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-premium-plan"
  })
}

#------------------------------------------------------------------------------
# API Keys
# Requirements: 7.7 - Create API keys for tenant isolation
#------------------------------------------------------------------------------
resource "aws_api_gateway_api_key" "default" {
  count = var.enable_api_keys ? 1 : 0

  name        = "${local.name_prefix}-default-key"
  description = "Default API key for ${var.project_name} ${var.environment}"
  enabled     = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-default-key"
  })
}

resource "aws_api_gateway_usage_plan_key" "default" {
  count = var.enable_api_keys ? 1 : 0

  key_id        = aws_api_gateway_api_key.default[0].id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.standard.id
}

#------------------------------------------------------------------------------
# WAF Association
# Requirements: 7.10 - Integrate with WAF for request filtering
#------------------------------------------------------------------------------
resource "aws_wafv2_web_acl_association" "api_gateway" {
  count = var.waf_web_acl_arn != "" ? 1 : 0

  resource_arn = aws_api_gateway_stage.main.arn
  web_acl_arn  = var.waf_web_acl_arn
}
