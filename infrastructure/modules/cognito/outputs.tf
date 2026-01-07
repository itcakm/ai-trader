# Cognito Module Outputs

#------------------------------------------------------------------------------
# User Pool Outputs
#------------------------------------------------------------------------------
output "user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.arn
}

output "user_pool_endpoint" {
  description = "Endpoint of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.endpoint
}

output "user_pool_domain" {
  description = "Domain prefix of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.domain
}

#------------------------------------------------------------------------------
# App Client Outputs
#------------------------------------------------------------------------------
output "app_client_id" {
  description = "ID of the Cognito App Client"
  value       = aws_cognito_user_pool_client.main.id
}

output "app_client_name" {
  description = "Name of the Cognito App Client"
  value       = aws_cognito_user_pool_client.main.name
}

#------------------------------------------------------------------------------
# JWKS Configuration
#------------------------------------------------------------------------------
output "jwks_uri" {
  description = "JWKS URI for JWT validation"
  value       = "https://cognito-idp.${data.aws_region.current.id}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
}

output "issuer" {
  description = "Token issuer URL for JWT validation"
  value       = "https://cognito-idp.${data.aws_region.current.id}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

#------------------------------------------------------------------------------
# Lambda Trigger Outputs
#------------------------------------------------------------------------------
output "pre_signup_trigger_arn" {
  description = "ARN of the pre-signup Lambda trigger (if configured)"
  value       = var.enable_lambda_triggers ? var.pre_signup_lambda_arn : ""
}

output "post_confirmation_trigger_arn" {
  description = "ARN of the post-confirmation Lambda trigger (if configured)"
  value       = var.enable_lambda_triggers ? var.post_confirmation_lambda_arn : ""
}

output "post_authentication_trigger_arn" {
  description = "ARN of the post-authentication Lambda trigger (if configured)"
  value       = var.enable_lambda_triggers ? var.post_authentication_lambda_arn : ""
}

#------------------------------------------------------------------------------
# SSO Outputs
# Requirements: 7.1, 7.2
#------------------------------------------------------------------------------
output "sso_enabled" {
  description = "Whether SSO is enabled"
  value       = var.enable_sso
}

output "cognito_domain" {
  description = "Cognito domain for SSO"
  value       = var.enable_sso ? aws_cognito_user_pool_domain.main[0].domain : ""
}

output "cognito_domain_url" {
  description = "Full URL of the Cognito domain"
  value       = var.enable_sso ? "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${data.aws_region.current.id}.amazoncognito.com" : ""
}

output "sso_client_id" {
  description = "ID of the SSO App Client"
  value       = var.enable_sso ? aws_cognito_user_pool_client.sso[0].id : ""
}

output "sso_client_secret" {
  description = "Secret of the SSO App Client"
  value       = var.enable_sso ? aws_cognito_user_pool_client.sso[0].client_secret : ""
  sensitive   = true
}

output "saml_provider_names" {
  description = "Names of configured SAML identity providers"
  value       = var.enable_sso ? keys(var.saml_providers) : []
}

output "oidc_provider_names" {
  description = "Names of configured OIDC identity providers"
  value       = var.enable_sso ? keys(var.oidc_providers) : []
}

output "sso_providers_table_name" {
  description = "Name of the DynamoDB table for SSO provider configuration"
  value       = var.enable_sso && var.create_sso_config_table ? aws_dynamodb_table.sso_providers[0].name : ""
}

output "sso_providers_table_arn" {
  description = "ARN of the DynamoDB table for SSO provider configuration"
  value       = var.enable_sso && var.create_sso_config_table ? aws_dynamodb_table.sso_providers[0].arn : ""
}

output "sso_authorize_url" {
  description = "URL to initiate SSO authorization"
  value       = var.enable_sso ? "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${data.aws_region.current.id}.amazoncognito.com/oauth2/authorize" : ""
}

output "sso_token_url" {
  description = "URL to exchange authorization code for tokens"
  value       = var.enable_sso ? "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${data.aws_region.current.id}.amazoncognito.com/oauth2/token" : ""
}

output "sso_state_table_name" {
  description = "Name of the DynamoDB table for SSO state storage (CSRF protection)"
  value       = var.enable_sso && var.create_sso_config_table ? aws_dynamodb_table.sso_state[0].name : ""
}

output "sso_state_table_arn" {
  description = "ARN of the DynamoDB table for SSO state storage"
  value       = var.enable_sso && var.create_sso_config_table ? aws_dynamodb_table.sso_state[0].arn : ""
}

#------------------------------------------------------------------------------
# Account Security Outputs
# Requirements: 12.1
#------------------------------------------------------------------------------
output "account_lockout_duration_minutes" {
  description = "Duration in minutes for account lockout"
  value       = var.account_lockout_duration_minutes
}

output "max_failed_login_attempts" {
  description = "Maximum failed login attempts before lockout"
  value       = var.max_failed_login_attempts
}
