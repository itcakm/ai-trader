# API Gateway Routes Configuration
# Creates API resources and Lambda proxy integrations
# Requirements: 7.2, 7.4

#------------------------------------------------------------------------------
# API Resources - First Level (e.g., /strategies, /templates)
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "level1" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = each.key
}

#------------------------------------------------------------------------------
# API Resources - Second Level (e.g., /strategies/{id})
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "level2_id" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.level1[each.key].id
  path_part   = "{id}"
}

#------------------------------------------------------------------------------
# Lambda Permissions for API Gateway
# Requirements: 7.2 - Create Lambda proxy integrations
# Note: Excludes 'auth' function which has its own permission in auth-routes.tf
#------------------------------------------------------------------------------
resource "aws_lambda_permission" "api_gateway" {
  for_each = { for k, v in var.lambda_function_names : k => v if k != "auth" }

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = each.value
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

#------------------------------------------------------------------------------
# GET Methods - Collection Endpoints (e.g., GET /strategies)
#------------------------------------------------------------------------------
resource "aws_api_gateway_method" "get_collection" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.level1[each.key].id
  http_method          = "GET"
  authorization        = "NONE"
  api_key_required     = var.enable_api_keys
  request_validator_id = aws_api_gateway_request_validator.params.id

  request_parameters = {
    "method.request.querystring.limit"  = false
    "method.request.querystring.offset" = false
    "method.request.querystring.filter" = false
  }
}

resource "aws_api_gateway_integration" "get_collection" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.level1[each.key].id
  http_method             = aws_api_gateway_method.get_collection[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.key]
}

#------------------------------------------------------------------------------
# POST Methods - Collection Endpoints (e.g., POST /strategies)
#------------------------------------------------------------------------------
locals {
  post_endpoints = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills",
    "analysis", "model-configs", "providers", "allocations", "ensemble",
    "position-limits", "circuit-breakers", "kill-switch", "risk-profiles",
    "exchange-config", "exchange-connections", "exchange-orders",
    "audit-packages", "audit-stream", "compliance-reports", "retention", "snapshots"
  ])
}

resource "aws_api_gateway_method" "post_collection" {
  for_each = local.post_endpoints

  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.level1[each.key].id
  http_method          = "POST"
  authorization        = "NONE"
  api_key_required     = var.enable_api_keys
  request_validator_id = aws_api_gateway_request_validator.body.id
}

resource "aws_api_gateway_integration" "post_collection" {
  for_each = local.post_endpoints

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.level1[each.key].id
  http_method             = aws_api_gateway_method.post_collection[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.key]
}

#------------------------------------------------------------------------------
# GET Methods - Item Endpoints (e.g., GET /strategies/{id})
#------------------------------------------------------------------------------
resource "aws_api_gateway_method" "get_item" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.level2_id[each.key].id
  http_method          = "GET"
  authorization        = "NONE"
  api_key_required     = var.enable_api_keys
  request_validator_id = aws_api_gateway_request_validator.params.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "get_item" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.level2_id[each.key].id
  http_method             = aws_api_gateway_method.get_item[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.key]
}

#------------------------------------------------------------------------------
# PUT Methods - Item Endpoints (e.g., PUT /strategies/{id})
#------------------------------------------------------------------------------
locals {
  put_endpoints = toset([
    "strategies", "templates", "deployments",
    "streams", "data-sources",
    "model-configs", "providers", "allocations",
    "position-limits", "circuit-breakers", "kill-switch", "risk-profiles",
    "exchange-config", "exchange-connections", "exchange-orders",
    "retention"
  ])
}

resource "aws_api_gateway_method" "put_item" {
  for_each = local.put_endpoints

  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.level2_id[each.key].id
  http_method          = "PUT"
  authorization        = "NONE"
  api_key_required     = var.enable_api_keys
  request_validator_id = aws_api_gateway_request_validator.all.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "put_item" {
  for_each = local.put_endpoints

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.level2_id[each.key].id
  http_method             = aws_api_gateway_method.put_item[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.key]
}

#------------------------------------------------------------------------------
# DELETE Methods - Item Endpoints (e.g., DELETE /strategies/{id})
#------------------------------------------------------------------------------
locals {
  delete_endpoints = toset([
    "strategies", "templates", "deployments", "streams"
  ])
}

resource "aws_api_gateway_method" "delete_item" {
  for_each = local.delete_endpoints

  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.level2_id[each.key].id
  http_method          = "DELETE"
  authorization        = "NONE"
  api_key_required     = var.enable_api_keys
  request_validator_id = aws_api_gateway_request_validator.params.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "delete_item" {
  for_each = local.delete_endpoints

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.level2_id[each.key].id
  http_method             = aws_api_gateway_method.delete_item[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.key]
}

#------------------------------------------------------------------------------
# OPTIONS Methods for CORS - Collection Endpoints
#------------------------------------------------------------------------------
resource "aws_api_gateway_method" "options_collection" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.level1[each.key].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_collection" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.level1[each.key].id
  http_method = aws_api_gateway_method.options_collection[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_collection" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.level1[each.key].id
  http_method = aws_api_gateway_method.options_collection[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_collection" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "audit-stream", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.level1[each.key].id
  http_method = aws_api_gateway_method.options_collection[each.key].http_method
  status_code = aws_api_gateway_method_response.options_collection[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://${var.frontend_domain}'"
  }

  depends_on = [aws_api_gateway_integration.options_collection]
}

#------------------------------------------------------------------------------
# OPTIONS Methods for CORS - Item Endpoints
#------------------------------------------------------------------------------
resource "aws_api_gateway_method" "options_item" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.level2_id[each.key].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_item" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.level2_id[each.key].id
  http_method = aws_api_gateway_method.options_item[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_item" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.level2_id[each.key].id
  http_method = aws_api_gateway_method.options_item[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_item" {
  for_each = toset([
    "strategies", "templates", "versions", "deployments",
    "streams", "data-sources", "backfills", "quality", "news-context",
    "analysis", "model-configs", "providers", "allocations", "ensemble", "performance",
    "position-limits", "drawdown", "circuit-breakers", "kill-switch", "risk-profiles", "risk-events",
    "exchange-config", "exchange-connections", "exchange-orders", "exchange-positions",
    "audit", "audit-packages", "ai-traces", "data-lineage",
    "compliance-reports", "trade-lifecycle", "retention", "snapshots"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.level2_id[each.key].id
  http_method = aws_api_gateway_method.options_item[each.key].http_method
  status_code = aws_api_gateway_method_response.options_item[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://${var.frontend_domain}'"
  }

  depends_on = [aws_api_gateway_integration.options_item]
}
