# Production Environment Outputs
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

# Module outputs will be added here as modules are implemented
# Example:
#
# output "vpc_id" {
#   description = "VPC ID"
#   value       = module.vpc.vpc_id
# }
#
# output "api_gateway_endpoint" {
#   description = "API Gateway endpoint URL"
#   value       = module.api_gateway.endpoint_url
# }

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

output "codepipeline_role_arn" {
  description = "ARN of the CodePipeline IAM role"
  value       = module.cicd.codepipeline_role_arn
}

output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = module.cicd.ecr_repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the ECR repository"
  value       = module.cicd.ecr_repository_arn
}

output "cicd_log_group_name" {
  description = "Name of the CI/CD CloudWatch log group"
  value       = module.cicd.cicd_log_group_name
}

output "github_actions_log_group_name" {
  description = "Name of the GitHub Actions CloudWatch log group"
  value       = module.cicd.github_actions_log_group_name
}

output "codepipeline_log_group_name" {
  description = "Name of the CodePipeline CloudWatch log group"
  value       = module.cicd.codepipeline_log_group_name
}

output "codebuild_log_group_name" {
  description = "Name of the CodeBuild CloudWatch log group"
  value       = module.cicd.codebuild_log_group_name
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

#------------------------------------------------------------------------------
# WAF Outputs
#------------------------------------------------------------------------------
output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL for API Gateway"
  value       = module.waf.api_gateway_web_acl_arn
}

output "waf_cloudfront_web_acl_arn" {
  description = "ARN of the WAF Web ACL for CloudFront"
  value       = module.waf.cloudfront_web_acl_arn
}

#------------------------------------------------------------------------------
# Cognito Module Outputs
# Requirements: 1.10 - Output User Pool ID, App Client ID, and User Pool ARN
#------------------------------------------------------------------------------
output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = module.cognito.user_pool_arn
}

output "cognito_app_client_id" {
  description = "ID of the Cognito App Client"
  value       = module.cognito.app_client_id
}

output "cognito_user_pool_endpoint" {
  description = "Endpoint of the Cognito User Pool"
  value       = module.cognito.user_pool_endpoint
}

output "cognito_jwks_uri" {
  description = "JWKS URI for JWT validation"
  value       = module.cognito.jwks_uri
}

output "cognito_issuer" {
  description = "Token issuer URL for JWT validation"
  value       = module.cognito.issuer
}

#------------------------------------------------------------------------------
# API Gateway Auth Resource Outputs
#------------------------------------------------------------------------------
output "api_gateway_auth_resource_ids" {
  description = "Map of auth resource IDs by path"
  value       = module.api_gateway.auth_resource_ids
}
