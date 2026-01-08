# API Gateway Auth Routes Configuration
# Creates API resources and Lambda proxy integrations for authentication endpoints
# Requirements: 2.1, 3.1-3.12 - Auth endpoints proxied through API Gateway

#------------------------------------------------------------------------------
# Auth Resource - /auth
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "auth" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "auth"
}

#------------------------------------------------------------------------------
# Auth Sub-Resources - Level 2 (e.g., /auth/login, /auth/signup)
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "auth_level2" {
  for_each = toset([
    "signup",
    "login",
    "logout",
    "refresh",
    "verify-email",
    "resend-verification",
    "forgot-password",
    "reset-password",
    "me",
    "change-password"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth.id
  path_part   = each.key
}

#------------------------------------------------------------------------------
# MFA Resource - /auth/mfa
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "auth_mfa" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth.id
  path_part   = "mfa"
}

#------------------------------------------------------------------------------
# MFA Sub-Resources - /auth/mfa/setup, /auth/mfa/verify, /auth/mfa/challenge
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "auth_mfa_level3" {
  for_each = toset([
    "setup",
    "verify",
    "challenge"
  ])

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth_mfa.id
  path_part   = each.key
}

#------------------------------------------------------------------------------
# SSO Resource - /auth/sso
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "auth_sso" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth.id
  path_part   = "sso"
}

#------------------------------------------------------------------------------
# SSO Sub-Resources - /auth/sso/providers, /auth/sso/initiate, /auth/sso/callback
#------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "auth_sso_providers" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth_sso.id
  path_part   = "providers"
}

resource "aws_api_gateway_resource" "auth_sso_initiate" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth_sso.id
  path_part   = "initiate"
}

resource "aws_api_gateway_resource" "auth_sso_initiate_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth_sso_initiate.id
  path_part   = "{providerId}"
}

resource "aws_api_gateway_resource" "auth_sso_callback" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth_sso.id
  path_part   = "callback"
}


#------------------------------------------------------------------------------
# POST Methods - Auth Endpoints (Public)
# Requirements: 3.1-3.8 - Auth proxy endpoints
#------------------------------------------------------------------------------
locals {
  auth_post_endpoints = {
    "signup"              = aws_api_gateway_resource.auth_level2["signup"].id
    "login"               = aws_api_gateway_resource.auth_level2["login"].id
    "logout"              = aws_api_gateway_resource.auth_level2["logout"].id
    "refresh"             = aws_api_gateway_resource.auth_level2["refresh"].id
    "verify-email"        = aws_api_gateway_resource.auth_level2["verify-email"].id
    "resend-verification" = aws_api_gateway_resource.auth_level2["resend-verification"].id
    "forgot-password"     = aws_api_gateway_resource.auth_level2["forgot-password"].id
    "reset-password"      = aws_api_gateway_resource.auth_level2["reset-password"].id
    "change-password"     = aws_api_gateway_resource.auth_level2["change-password"].id
  }

  auth_mfa_post_endpoints = {
    "setup"     = aws_api_gateway_resource.auth_mfa_level3["setup"].id
    "verify"    = aws_api_gateway_resource.auth_mfa_level3["verify"].id
    "challenge" = aws_api_gateway_resource.auth_mfa_level3["challenge"].id
  }
}

resource "aws_api_gateway_method" "auth_post" {
  for_each = local.auth_post_endpoints

  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = each.value
  http_method          = "POST"
  authorization        = "NONE"
  api_key_required     = false # Auth endpoints don't require API key
  request_validator_id = aws_api_gateway_request_validator.body.id
}

resource "aws_api_gateway_integration" "auth_post" {
  for_each = var.enable_auth_routes ? local.auth_post_endpoints : {}

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = each.value
  http_method             = aws_api_gateway_method.auth_post[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.auth_lambda_invoke_arn
}

#------------------------------------------------------------------------------
# POST Methods - MFA Endpoints
# Requirements: 3.9, 3.10, 3.11 - MFA proxy endpoints
#------------------------------------------------------------------------------
resource "aws_api_gateway_method" "auth_mfa_post" {
  for_each = local.auth_mfa_post_endpoints

  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = each.value
  http_method          = "POST"
  authorization        = "NONE"
  api_key_required     = false
  request_validator_id = aws_api_gateway_request_validator.body.id
}

resource "aws_api_gateway_integration" "auth_mfa_post" {
  for_each = var.enable_auth_routes ? local.auth_mfa_post_endpoints : {}

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = each.value
  http_method             = aws_api_gateway_method.auth_mfa_post[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.auth_lambda_invoke_arn
}

#------------------------------------------------------------------------------
# GET Method - /auth/me (Authenticated)
# Requirements: 3.12 - Get current user profile
#------------------------------------------------------------------------------
resource "aws_api_gateway_method" "auth_me_get" {
  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.auth_level2["me"].id
  http_method          = "GET"
  authorization        = "NONE"
  api_key_required     = false
  request_validator_id = aws_api_gateway_request_validator.params.id
}

resource "aws_api_gateway_integration" "auth_me_get" {
  count = var.enable_auth_routes ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.auth_level2["me"].id
  http_method             = aws_api_gateway_method.auth_me_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.auth_lambda_invoke_arn
}

#------------------------------------------------------------------------------
# SSO Endpoints
# Requirements: 7.3, 7.4, 7.5 - SSO proxy endpoints
#------------------------------------------------------------------------------

# GET /auth/sso/providers - List SSO providers
resource "aws_api_gateway_method" "auth_sso_providers_get" {
  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.auth_sso_providers.id
  http_method          = "GET"
  authorization        = "NONE"
  api_key_required     = false
  request_validator_id = aws_api_gateway_request_validator.params.id
}

resource "aws_api_gateway_integration" "auth_sso_providers_get" {
  count = var.enable_auth_routes ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.auth_sso_providers.id
  http_method             = aws_api_gateway_method.auth_sso_providers_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.auth_lambda_invoke_arn
}

# GET /auth/sso/initiate/{providerId} - Start SSO flow
resource "aws_api_gateway_method" "auth_sso_initiate_get" {
  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.auth_sso_initiate_id.id
  http_method          = "GET"
  authorization        = "NONE"
  api_key_required     = false
  request_validator_id = aws_api_gateway_request_validator.params.id

  request_parameters = {
    "method.request.path.providerId" = true
  }
}

resource "aws_api_gateway_integration" "auth_sso_initiate_get" {
  count = var.enable_auth_routes ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.auth_sso_initiate_id.id
  http_method             = aws_api_gateway_method.auth_sso_initiate_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.auth_lambda_invoke_arn
}

# POST /auth/sso/callback - Handle SSO callback
resource "aws_api_gateway_method" "auth_sso_callback_post" {
  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.auth_sso_callback.id
  http_method          = "POST"
  authorization        = "NONE"
  api_key_required     = false
  request_validator_id = aws_api_gateway_request_validator.body.id
}

resource "aws_api_gateway_integration" "auth_sso_callback_post" {
  count = var.enable_auth_routes ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.auth_sso_callback.id
  http_method             = aws_api_gateway_method.auth_sso_callback_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.auth_lambda_invoke_arn
}


#------------------------------------------------------------------------------
# OPTIONS Methods for CORS - Auth Endpoints
# Requirements: Configure CORS for auth endpoints
#------------------------------------------------------------------------------
locals {
  auth_cors_resources = merge(
    { for k, v in local.auth_post_endpoints : k => v },
    { "me" = aws_api_gateway_resource.auth_level2["me"].id }
  )

  auth_mfa_cors_resources = local.auth_mfa_post_endpoints

  auth_sso_cors_resources = {
    "providers" = aws_api_gateway_resource.auth_sso_providers.id
    "initiate"  = aws_api_gateway_resource.auth_sso_initiate_id.id
    "callback"  = aws_api_gateway_resource.auth_sso_callback.id
  }
}

# CORS for main auth endpoints
resource "aws_api_gateway_method" "auth_options" {
  for_each = local.auth_cors_resources

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_options" {
  for_each = local.auth_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_options[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_options" {
  for_each = local.auth_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_options[each.key].http_method
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

resource "aws_api_gateway_integration_response" "auth_options" {
  for_each = local.auth_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_options[each.key].http_method
  status_code = aws_api_gateway_method_response.auth_options[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://${var.frontend_domain}'"
  }

  depends_on = [aws_api_gateway_integration.auth_options]
}

# CORS for MFA endpoints
resource "aws_api_gateway_method" "auth_mfa_options" {
  for_each = local.auth_mfa_cors_resources

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_mfa_options" {
  for_each = local.auth_mfa_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_mfa_options[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_mfa_options" {
  for_each = local.auth_mfa_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_mfa_options[each.key].http_method
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

resource "aws_api_gateway_integration_response" "auth_mfa_options" {
  for_each = local.auth_mfa_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_mfa_options[each.key].http_method
  status_code = aws_api_gateway_method_response.auth_mfa_options[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://${var.frontend_domain}'"
  }

  depends_on = [aws_api_gateway_integration.auth_mfa_options]
}

# CORS for SSO endpoints
resource "aws_api_gateway_method" "auth_sso_options" {
  for_each = local.auth_sso_cors_resources

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_sso_options" {
  for_each = local.auth_sso_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_sso_options[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_sso_options" {
  for_each = local.auth_sso_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_sso_options[each.key].http_method
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

resource "aws_api_gateway_integration_response" "auth_sso_options" {
  for_each = local.auth_sso_cors_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value
  http_method = aws_api_gateway_method.auth_sso_options[each.key].http_method
  status_code = aws_api_gateway_method_response.auth_sso_options[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://${var.frontend_domain}'"
  }

  depends_on = [aws_api_gateway_integration.auth_sso_options]
}

#------------------------------------------------------------------------------
# Lambda Permission for Auth Handler
#------------------------------------------------------------------------------
resource "aws_lambda_permission" "auth_api_gateway" {
  count = var.enable_auth_routes ? 1 : 0

  statement_id  = "AllowAPIGatewayInvoke-auth"
  action        = "lambda:InvokeFunction"
  function_name = var.auth_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
