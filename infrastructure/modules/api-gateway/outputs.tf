# API Gateway Module Outputs
# Exposes API Gateway resources for use by other modules

#------------------------------------------------------------------------------
# REST API Outputs
#------------------------------------------------------------------------------
output "rest_api_id" {
  description = "ID of the REST API"
  value       = aws_api_gateway_rest_api.main.id
}

output "rest_api_arn" {
  description = "ARN of the REST API"
  value       = aws_api_gateway_rest_api.main.arn
}

output "rest_api_name" {
  description = "Name of the REST API"
  value       = aws_api_gateway_rest_api.main.name
}

output "rest_api_root_resource_id" {
  description = "Root resource ID of the REST API"
  value       = aws_api_gateway_rest_api.main.root_resource_id
}

output "rest_api_execution_arn" {
  description = "Execution ARN of the REST API"
  value       = aws_api_gateway_rest_api.main.execution_arn
}

#------------------------------------------------------------------------------
# Stage Outputs
#------------------------------------------------------------------------------
output "stage_name" {
  description = "Name of the API stage"
  value       = aws_api_gateway_stage.main.stage_name
}

output "stage_arn" {
  description = "ARN of the API stage"
  value       = aws_api_gateway_stage.main.arn
}

output "stage_invoke_url" {
  description = "Invoke URL for the API stage"
  value       = aws_api_gateway_stage.main.invoke_url
}

#------------------------------------------------------------------------------
# Deployment Outputs
#------------------------------------------------------------------------------
output "deployment_id" {
  description = "ID of the API deployment"
  value       = aws_api_gateway_deployment.main.id
}

#------------------------------------------------------------------------------
# Custom Domain Outputs
#------------------------------------------------------------------------------
output "domain_name" {
  description = "Custom domain name"
  value       = aws_api_gateway_domain_name.main.domain_name
}

output "domain_name_arn" {
  description = "ARN of the custom domain"
  value       = aws_api_gateway_domain_name.main.arn
}

output "regional_domain_name" {
  description = "Regional domain name for Route 53 alias record"
  value       = aws_api_gateway_domain_name.main.regional_domain_name
}

output "regional_zone_id" {
  description = "Regional hosted zone ID for Route 53 alias record"
  value       = aws_api_gateway_domain_name.main.regional_zone_id
}

#------------------------------------------------------------------------------
# Usage Plan Outputs
#------------------------------------------------------------------------------
output "standard_usage_plan_id" {
  description = "ID of the standard usage plan"
  value       = aws_api_gateway_usage_plan.standard.id
}

output "premium_usage_plan_id" {
  description = "ID of the premium usage plan"
  value       = aws_api_gateway_usage_plan.premium.id
}

#------------------------------------------------------------------------------
# API Key Outputs
#------------------------------------------------------------------------------
output "default_api_key_id" {
  description = "ID of the default API key"
  value       = var.enable_api_keys ? aws_api_gateway_api_key.default[0].id : null
}

output "default_api_key_value" {
  description = "Value of the default API key"
  value       = var.enable_api_keys ? aws_api_gateway_api_key.default[0].value : null
  sensitive   = true
}

#------------------------------------------------------------------------------
# Request Validator Outputs
#------------------------------------------------------------------------------
output "request_validator_body_id" {
  description = "ID of the body request validator"
  value       = aws_api_gateway_request_validator.body.id
}

output "request_validator_params_id" {
  description = "ID of the params request validator"
  value       = aws_api_gateway_request_validator.params.id
}

output "request_validator_all_id" {
  description = "ID of the all request validator"
  value       = aws_api_gateway_request_validator.all.id
}

#------------------------------------------------------------------------------
# CloudWatch Log Group Outputs
#------------------------------------------------------------------------------
output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.api_gateway.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.api_gateway.arn
}

#------------------------------------------------------------------------------
# IAM Role Outputs
#------------------------------------------------------------------------------
output "cloudwatch_role_arn" {
  description = "ARN of the CloudWatch IAM role"
  value       = aws_iam_role.api_gateway_cloudwatch.arn
}

#------------------------------------------------------------------------------
# Resource Outputs
#------------------------------------------------------------------------------
output "resource_ids" {
  description = "Map of resource IDs by path"
  value = merge(
    { for k, v in aws_api_gateway_resource.level1 : k => v.id },
    { for k, v in aws_api_gateway_resource.level2_id : "${k}/{id}" => v.id }
  )
}

#------------------------------------------------------------------------------
# Endpoint URL
#------------------------------------------------------------------------------
output "api_endpoint" {
  description = "Full API endpoint URL (custom domain)"
  value       = "https://${aws_api_gateway_domain_name.main.domain_name}"
}

output "api_endpoint_regional" {
  description = "Regional API endpoint URL (without custom domain)"
  value       = aws_api_gateway_stage.main.invoke_url
}
