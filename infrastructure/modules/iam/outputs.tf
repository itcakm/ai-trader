# IAM Module Outputs

#------------------------------------------------------------------------------
# Lambda Execution Role Outputs
#------------------------------------------------------------------------------
output "lambda_execution_role_arns" {
  description = "Map of Lambda execution role ARNs by function group"
  value = {
    for k, v in aws_iam_role.lambda_execution : k => v.arn
  }
}

output "lambda_execution_role_names" {
  description = "Map of Lambda execution role names by function group"
  value = {
    for k, v in aws_iam_role.lambda_execution : k => v.name
  }
}

output "lambda_execution_role_ids" {
  description = "Map of Lambda execution role IDs by function group"
  value = {
    for k, v in aws_iam_role.lambda_execution : k => v.id
  }
}

# Individual role outputs for convenience
output "strategy_management_role_arn" {
  description = "ARN of the strategy management Lambda execution role"
  value       = aws_iam_role.lambda_execution["strategy-management"].arn
}

output "market_data_role_arn" {
  description = "ARN of the market data Lambda execution role"
  value       = aws_iam_role.lambda_execution["market-data"].arn
}

output "ai_intelligence_role_arn" {
  description = "ARN of the AI intelligence Lambda execution role"
  value       = aws_iam_role.lambda_execution["ai-intelligence"].arn
}

output "risk_controls_role_arn" {
  description = "ARN of the risk controls Lambda execution role"
  value       = aws_iam_role.lambda_execution["risk-controls"].arn
}

output "exchange_integration_role_arn" {
  description = "ARN of the exchange integration Lambda execution role"
  value       = aws_iam_role.lambda_execution["exchange-integration"].arn
}

output "audit_role_arn" {
  description = "ARN of the audit Lambda execution role"
  value       = aws_iam_role.lambda_execution["audit"].arn
}

#------------------------------------------------------------------------------
# Service Role Outputs
#------------------------------------------------------------------------------
output "step_functions_role_arn" {
  description = "ARN of the Step Functions service role"
  value       = aws_iam_role.step_functions.arn
}

output "step_functions_role_name" {
  description = "Name of the Step Functions service role"
  value       = aws_iam_role.step_functions.name
}

output "eventbridge_role_arn" {
  description = "ARN of the EventBridge service role"
  value       = aws_iam_role.eventbridge.arn
}

output "eventbridge_role_name" {
  description = "Name of the EventBridge service role"
  value       = aws_iam_role.eventbridge.name
}

output "api_gateway_cloudwatch_role_arn" {
  description = "ARN of the API Gateway CloudWatch logging role"
  value       = aws_iam_role.api_gateway_cloudwatch.arn
}

output "api_gateway_cloudwatch_role_name" {
  description = "Name of the API Gateway CloudWatch logging role"
  value       = aws_iam_role.api_gateway_cloudwatch.name
}

#------------------------------------------------------------------------------
# IAM Access Analyzer Outputs
#------------------------------------------------------------------------------
output "access_analyzer_arn" {
  description = "ARN of the IAM Access Analyzer"
  value       = aws_accessanalyzer_analyzer.main.arn
}

output "access_analyzer_id" {
  description = "ID of the IAM Access Analyzer"
  value       = aws_accessanalyzer_analyzer.main.id
}

#------------------------------------------------------------------------------
# Policy ARN Outputs
#------------------------------------------------------------------------------
output "cloudwatch_logs_policy_arn" {
  description = "ARN of the CloudWatch Logs policy"
  value       = aws_iam_policy.cloudwatch_logs.arn
}

output "xray_tracing_policy_arn" {
  description = "ARN of the X-Ray tracing policy"
  value       = aws_iam_policy.xray_tracing.arn
}

output "vpc_access_policy_arn" {
  description = "ARN of the VPC access policy"
  value       = aws_iam_policy.vpc_access.arn
}

#------------------------------------------------------------------------------
# All Lambda Role ARNs (for Secrets Manager resource policies)
#------------------------------------------------------------------------------
output "all_lambda_role_arns" {
  description = "List of all Lambda execution role ARNs"
  value       = [for k, v in aws_iam_role.lambda_execution : v.arn]
}

#------------------------------------------------------------------------------
# Function Group Mapping
#------------------------------------------------------------------------------
output "function_group_mapping" {
  description = "Map of function groups to their functions"
  value       = local.lambda_function_groups
}
