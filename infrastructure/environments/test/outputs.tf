# Test Environment Outputs
# Outputs will be added as modules are implemented

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}

#------------------------------------------------------------------------------
# VPC Module Outputs
#------------------------------------------------------------------------------
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = module.vpc.nat_gateway_ids
}

output "lambda_security_group_id" {
  description = "Security group ID for Lambda functions"
  value       = module.vpc.lambda_security_group_id
}

output "redis_security_group_id" {
  description = "Security group ID for Redis"
  value       = module.vpc.redis_security_group_id
}

output "dynamodb_endpoint_id" {
  description = "DynamoDB VPC endpoint ID"
  value       = module.vpc.dynamodb_endpoint_id
}

output "s3_endpoint_id" {
  description = "S3 VPC endpoint ID"
  value       = module.vpc.s3_endpoint_id
}

output "secretsmanager_endpoint_id" {
  description = "Secrets Manager VPC endpoint ID"
  value       = module.vpc.secretsmanager_endpoint_id
}

output "logs_endpoint_id" {
  description = "CloudWatch Logs VPC endpoint ID"
  value       = module.vpc.logs_endpoint_id
}

#------------------------------------------------------------------------------
# CI/CD Module Outputs
# Requirements: 21.4 - Output all resource ARNs needed by deployment pipelines
#------------------------------------------------------------------------------
output "github_actions_role_arn" {
  description = "ARN of the GitHub Actions IAM role for CI/CD"
  value       = module.cicd.github_actions_role_arn
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider"
  value       = module.cicd.github_oidc_provider_arn
}

output "cicd_log_group_name" {
  description = "Name of the CI/CD CloudWatch log group"
  value       = module.cicd.cicd_log_group_name
}

output "github_actions_log_group_name" {
  description = "Name of the GitHub Actions CloudWatch log group"
  value       = module.cicd.github_actions_log_group_name
}

#------------------------------------------------------------------------------
# Resource ARNs for Deployment Pipelines
# Requirements: 21.4
#------------------------------------------------------------------------------
output "lambda_deployment_bucket_id" {
  description = "ID of the S3 bucket for Lambda deployment packages"
  value       = module.s3.lambda_deployments_bucket_id
}

output "lambda_deployment_bucket_arn" {
  description = "ARN of the S3 bucket for Lambda deployment packages"
  value       = module.s3.lambda_deployments_bucket_arn
}

output "frontend_assets_bucket_id" {
  description = "ID of the S3 bucket for frontend assets"
  value       = module.s3.frontend_assets_bucket_id
}

output "frontend_assets_bucket_arn" {
  description = "ARN of the S3 bucket for frontend assets"
  value       = module.s3.frontend_assets_bucket_arn
}

output "api_gateway_endpoint" {
  description = "API Gateway endpoint URL"
  value       = module.api_gateway.api_endpoint
}

output "api_gateway_stage_invoke_url" {
  description = "API Gateway stage invoke URL"
  value       = module.api_gateway.stage_invoke_url
}

output "lambda_function_names" {
  description = "Map of Lambda function names"
  value       = module.lambda.function_names
}

output "lambda_function_arns" {
  description = "Map of Lambda function ARNs"
  value       = module.lambda.function_arns
}


#------------------------------------------------------------------------------
# DynamoDB Module Outputs
#------------------------------------------------------------------------------
output "dynamodb_table_names" {
  description = "Map of DynamoDB table names"
  value       = module.dynamodb.table_names
}

output "dynamodb_table_arns" {
  description = "Map of DynamoDB table ARNs"
  value       = module.dynamodb.table_arns
}

#------------------------------------------------------------------------------
# S3 Module Outputs
#------------------------------------------------------------------------------
output "all_bucket_names" {
  description = "Map of all S3 bucket names"
  value       = module.s3.all_bucket_names
}

output "all_bucket_arns" {
  description = "Map of all S3 bucket ARNs"
  value       = module.s3.all_bucket_arns
}

#------------------------------------------------------------------------------
# Secrets Manager Outputs
#------------------------------------------------------------------------------
output "exchange_secret_arns" {
  description = "Map of exchange credential secret ARNs"
  value       = module.secrets.exchange_secret_arns
}

output "ai_provider_secret_arns" {
  description = "Map of AI provider secret ARNs"
  value       = module.secrets.ai_provider_secret_arns
}

#------------------------------------------------------------------------------
# Redis Outputs
#------------------------------------------------------------------------------
output "redis_endpoint" {
  description = "Redis primary endpoint address"
  value       = module.elasticache.redis_primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = module.elasticache.redis_port
}

#------------------------------------------------------------------------------
# Timestream Outputs
#------------------------------------------------------------------------------
output "timestream_database_name" {
  description = "Timestream database name"
  value       = module.timestream.database_name
}

output "timestream_database_arn" {
  description = "Timestream database ARN"
  value       = module.timestream.database_arn
}

#------------------------------------------------------------------------------
# Step Functions Outputs
#------------------------------------------------------------------------------
output "step_functions_state_machine_arns" {
  description = "Map of Step Functions state machine ARNs"
  value       = module.step_functions.state_machine_arns
}

#------------------------------------------------------------------------------
# EventBridge Outputs
#------------------------------------------------------------------------------
output "eventbridge_event_bus_arn" {
  description = "EventBridge custom event bus ARN"
  value       = module.eventbridge.application_event_bus_arn
}
